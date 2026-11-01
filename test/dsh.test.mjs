import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readDshState,installDsh,startDsh,companionPatch,locateNpm,DSH_VERSIONS} from '../scripts/dsh.mjs';
import {apply as applyChatGuard} from '../scripts/dsh-chat-guard.mjs';

function fixture(t){const directory=mkdtempSync(join(tmpdir(),'大肥鱼 DSH '));t.after(()=>rmSync(directory,{recursive:true,force:true}));return directory;}
function put(path,value){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));}
function fakeInstaller(directory,{fail}={}){
  const calls=[];
  const runner=async(command,args,options)=>{
    calls.push({command,args,options});
    if(fail)throw new Error('SECRET_KEY_WITH_PRIVATE_PATH');
    if(args.includes('ci')){
      put(join(directory,'toolchain/node_modules/@deepseek-ai/dsh/package.json'),{version:DSH_VERSIONS.dsh});
      put(join(directory,'toolchain/node_modules/@deepseek-ai/dsh/lib/bin.js'),'');
      put(join(directory,'toolchain/node_modules/pnpm/package.json'),{version:DSH_VERSIONS.pnpm});
      put(join(directory,'toolchain/node_modules/pnpm/bin/pnpm.cjs'),'');
    }
    if(args.includes('--from-default-profile')){
      put(join(directory,'home/profiles/dafeiyu/package.json'),{dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}});
      put(join(directory,'home/profiles/dafeiyu/cordis.patch.yml'),'[]');
    }
    if(args.includes('plugin')){
      put(join(directory,'home/profiles/dafeiyu/node_modules/@tencent-connect/dsh-qqbot/package.json'),{version:DSH_VERSIONS.qqPlugin});
      put(join(directory,'home/profiles/dafeiyu/package.json'),{dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@tencent-connect/dsh-qqbot']}}});
    }
  };
  return {calls,runner};
}

test('DSH state is read-only, secret-free, and does not claim live QQ validation',t=>{
  const directory=fixture(t);
  put(join(directory,'home/credentials.json'),{key:'do-not-read-me',qq:'private-owner'});
  const state=readDshState({directory});
  assert.equal(state.installed,false);assert.equal(state.independent,true);assert.equal(state.chatVerified,false);assert.equal(state.running,null);
  assert.equal(JSON.stringify(state).includes(directory),false);assert.equal(JSON.stringify(state).includes('do-not-read-me'),false);
  assert.equal(existsSync(join(directory,'owner.json')),false);
});

test('fresh install pins official packages, uses argv with Chinese paths, and defaults access off',async t=>{
  const directory=fixture(t);const fake=fakeInstaller(directory);
  const state=await installDsh({directory,runner:fake.runner,progress:()=>{}});
  assert.equal(state.installed,true);
  const npm=fake.calls.find(call=>call.args.includes('ci'));
  const manifest=JSON.parse(readFileSync(join(directory,'toolchain/package.json'),'utf8'));
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'],DSH_VERSIONS.dsh);assert.equal(manifest.dependencies.pnpm,DSH_VERSIONS.pnpm);
  assert.ok(npm.args.includes(join(directory,'toolchain')));
  assert.ok(fake.calls.find(call=>call.args.includes('plugin')&&call.args.includes('--frozen-lockfile')));
  assert.ok(existsSync(join(directory,'toolchain/package-lock.json')));assert.ok(existsSync(join(directory,'home/profiles/dafeiyu/pnpm-lock.yaml')));
  const patch=readFileSync(join(directory,'home/profiles/dafeiyu/cordis.patch.yml'),'utf8');
  assert.match(patch,/c2cMode: disabled/);assert.match(patch,/groupMode: disabled/);assert.match(patch,/preset: dafeiyu/);
  assert.equal(existsSync(join(directory,'install.lock')),false);
});

test('rerunning install preserves existing profile including bindings and access preferences',async t=>{
  const directory=fixture(t);const fake=fakeInstaller(directory);
  await installDsh({directory,runner:fake.runner,progress:()=>{}});
  const config=join(directory,'home/profiles/dafeiyu/cordis.patch.yml');
  writeFileSync(config,'# preserved-private-binding-and-access');fake.calls.length=0;
  await installDsh({directory,runner:fake.runner,progress:()=>{}});
  assert.equal(readFileSync(config,'utf8'),'# preserved-private-binding-and-access');
  assert.equal(fake.calls.length,1);assert.ok(fake.calls[0].args.includes('--dump-config'));
  assert.equal(fake.calls.some(call=>call.args.includes('--from-default-profile')),false);
});

test('install failures identify safe stage without raw dependency diagnostics and unlock retry',async t=>{
  const directory=fixture(t);const fake=fakeInstaller(directory,{fail:true});
  await assert.rejects(installDsh({directory,runner:fake.runner,progress:()=>{}}),error=>{
    assert.match(error.message,/下载官方 DSH/);assert.equal(error.message.includes('SECRET_KEY'),false);assert.equal(error.message.includes(directory),false);return true;
  });
  assert.equal(existsSync(join(directory,'install.lock')),false);
  const retry=fakeInstaller(directory);await installDsh({directory,runner:retry.runner,progress:()=>{}});
  assert.equal(readDshState({directory}).installed,true);
});

test('unowned directory and concurrent install are refused without overwriting data',async t=>{
  const directory=fixture(t);put(join(directory,'home/keep.txt'),'private');
  await assert.rejects(installDsh({directory,runner:()=>assert.fail(),progress:()=>{}}),/非本入口管理/);
  assert.equal(readFileSync(join(directory,'home/keep.txt'),'utf8'),'private');
  const other=fixture(t);put(join(other,'owner.json'),{owner:'dafeiyu-dsh-v1'});put(join(other,'install.lock'),'locked');
  await assert.rejects(installDsh({directory:other,runner:()=>assert.fail(),progress:()=>{}}),/已有安装锁/);
  assert.equal(readFileSync(join(other,'install.lock'),'utf8'),'locked');
});

test('interrupted owned profile initialization resumes only while template is unchanged',async t=>{
  const directory=fixture(t);const fake=fakeInstaller(directory);
  const interrupted=async(...args)=>{await fake.runner(...args);if(args[1].includes('--from-default-profile'))throw new Error('interrupted');};
  await assert.rejects(installDsh({directory,runner:interrupted,progress:()=>{}}),/初始化官方 Web profile/);
  assert.equal(readDshState({directory}).installed,false);
  await installDsh({directory,runner:fake.runner,progress:()=>{}});
  assert.equal(readDshState({directory}).installed,true);
  const other=fixture(t);const changed=fakeInstaller(other);
  await assert.rejects(installDsh({directory:other,runner:async(...args)=>{await changed.runner(...args);if(args[1].includes('--from-default-profile'))throw new Error('interrupted');},progress:()=>{}}));
  const config=join(other,'home/profiles/dafeiyu/cordis.patch.yml');writeFileSync(config,'# user binding\n- id: private-config');
  await assert.rejects(installDsh({directory:other,runner:changed.runner,progress:()=>{}}),/现有配置已变动.*私人备份/);
  assert.equal(readFileSync(config,'utf8'),'# user binding\n- id: private-config');
});

test('interruption after guard write resumes with identical content and preserves a modified guard',async t=>{
  for(const changed of [false,true]){
    const directory=fixture(t);const fake=fakeInstaller(directory);
    const interrupted=async(...args)=>{await fake.runner(...args);if(args[1].includes('--from-default-profile')){
      put(join(directory,'home/profiles/dafeiyu/cordis.patch.yml'),companionPatch());
      put(join(directory,'home/profiles/dafeiyu/dafeiyu-tool-guard.mjs'),changed?'// private custom guard':readFileSync(new URL('../scripts/dsh-chat-guard.mjs',import.meta.url),'utf8'));
      throw new Error('interrupted');
    }};
    await assert.rejects(installDsh({directory,runner:interrupted,progress:()=>{}}));
    if(changed){
      await assert.rejects(installDsh({directory,runner:fake.runner,progress:()=>{}}),/工具限制文件已变动/);
      assert.equal(readFileSync(join(directory,'home/profiles/dafeiyu/dafeiyu-tool-guard.mjs'),'utf8'),'// private custom guard');
    }else assert.equal((await installDsh({directory,runner:fake.runner,progress:()=>{}})).installed,true);
  }
});

test('start requires installed pins, stays localhost, and supplies its own workspace/home',async t=>{
  const directory=fixture(t);
  await assert.rejects(startDsh({directory,runner:()=>assert.fail()}),/先运行/);
  const fake=fakeInstaller(directory);await installDsh({directory,runner:fake.runner,progress:()=>{}});fake.calls.length=0;
  await startDsh({directory,runner:fake.runner,noOpen:true,env:{SYNTHETIC:'yes'}});
  const call=fake.calls[0];assert.deepEqual(call.args.slice(-5),['--host','127.0.0.1','--port','3080','--no-open']);
  assert.equal(call.options.cwd,join(directory,'workspace'));assert.equal(call.options.env.DSH_HOME,join(directory,'home'));assert.equal(call.options.env.QQBOT_BIND_OPEN_BROWSER,'0');
  put(join(directory,'toolchain/node_modules/@deepseek-ai/dsh/package.json'),{version:'9.9.9'});
  assert.equal(readDshState({directory}).installed,false);
});

test('companion preset uses scoped persona and disables upstream coding presets',()=>{
  const patch=companionPatch();
  for(const preset of ['standard','ptc','minimal','cordis'])assert.ok(patch.includes(`id: preset-${preset}\n  disabled: true`));
  assert.match(patch,/complete: true/);assert.match(patch,/includeRuntimeContext: false/);assert.doesNotMatch(patch,/name: '@deepseek-ai\/dsh-tool-/);
});

test('bundled npm-cli is preferred on Windows even if PATH and global npm are absent',t=>{
  const directory=fixture(t);const node=join(directory,'node.exe');const npm=join(directory,'node_modules/npm/bin/npm-cli.js');put(npm,'');
  assert.deepEqual(locateNpm({execPath:node,env:{},platform:'win32'}),{command:node,args:[npm]});
});

test('committed DSH dependency snapshots pin actual versions and contain no local resolution paths',()=>{
  const lock=JSON.parse(readFileSync(new URL('../scripts/dsh-locks/package-lock.json',import.meta.url),'utf8'));
  assert.equal(lock.packages[''].dependencies['@deepseek-ai/dsh'],DSH_VERSIONS.dsh);
  assert.equal(lock.packages['node_modules/@deepseek-ai/dsh'].version,DSH_VERSIONS.dsh);
  assert.equal(lock.packages['node_modules/pnpm'].version,DSH_VERSIONS.pnpm);
  for(const [name,entry] of Object.entries(lock.packages)){
    if(!name)continue;
    assert.equal(typeof entry.version,'string');assert.equal(typeof entry.integrity,'string');
    assert.equal(new URL(entry.resolved).hostname,'registry.npmjs.org');
  }
  const pluginLock=readFileSync(new URL('../scripts/dsh-locks/pnpm-lock.yaml',import.meta.url),'utf8');
  assert.ok(pluginLock.includes(`specifier: ${DSH_VERSIONS.qqPlugin}`));
  assert.doesNotMatch(pluginLock,/\/Users\/|\/home\/|(?:https?:\/\/)[^\s/]+:[^\s@]+@|(?:token|_auth)=/i);
});

test('actual pinned DSH tool registry hides inherited QQ/file tools within companion scope', {skip:!process.env.DAFEIYU_DSH_INTEGRATION_DIR},async()=>{
  const require=createRequire(join(process.env.DAFEIYU_DSH_INTEGRATION_DIR,'toolchain/package.json'));
  const load=name=>import(pathToFileURL(require.resolve(name)).href);
  const {Context}=await load('@deepseek-ai/cordis');
  const {default:SystemPrompt}=await load('@deepseek-ai/dsh-system-prompt');
  const {default:Tools,defineTool}=await load('@deepseek-ai/dsh-tools');
  const {createScope}=await load('@deepseek-ai/dsh-scope');
  const ctx=new Context();let scope,guardFiber;
  const promptFiber=await ctx.plugin(SystemPrompt,{personaPrefix:'synthetic'});
  const toolsFiber=await ctx.plugin(Tools,{});
  try{
    const tools=ctx.get('tools');
    for(const name of ['working_directory','qqbot_send_file'])tools.register(defineTool({name,description:'synthetic',parameters:{},output:{schema:{type:'string'},render:()=>[]},async execute(){assert.fail('must not execute');}}));
    const key={};guardFiber=await ctx.inject(['tools'],ctx=>{scope=createScope(ctx,key);applyChatGuard(scope.ctx);});
    assert.equal(tools.schemas().length,2);assert.deepEqual(tools.schemas(key),[]);
    assert.equal(tools.get('qqbot_send_file',key),undefined);assert.equal(tools.get('working_directory',key),undefined);
    await scope.dispose();scope=null;
    assert.equal(tools.schemas(key).length,2);
  }finally{await scope?.dispose();await guardFiber?.dispose();await toolsFiber.dispose();await promptFiber.dispose();}
});
