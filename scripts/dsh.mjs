import {existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

export const DSH_VERSIONS = Object.freeze({dsh:'0.2.1-rc.5', qqPlugin:'0.5.5', pnpm:'10.30.3'});
export const DSH_PROFILE = 'dafeiyu';
const project = fileURLToPath(new URL('../', import.meta.url));
const defaultDirectory = join(project, '.runtime', 'dsh');
const locks = fileURLToPath(new URL('./dsh-locks/', import.meta.url));
const commands = Object.freeze({install:'node scripts/dsh.mjs install', start:'node scripts/dsh.mjs start', doctor:'node scripts/dsh.mjs doctor --json'});
const owner = 'dafeiyu-dsh-v1';
const persona = '你是大肥鱼，一位蓝发、鲸尾、女仆装的鲸鱼娘，是 DeepSeek 社区二创角色。用自然简短的中文聊天，有一点机灵和俏皮；认真听对方说话，不刷屏，不假装是真人，不声称是 DeepSeek 官方角色。不冒充用户，不宣称能操控电脑；没有工具时坦诚说明。不要编造记忆、已经发送的消息或已经完成的操作。';

function paths(directory = process.env.DAFEIYU_DSH_DIR || defaultDirectory) {
  const root = resolve(directory);
  const toolchain = join(root, 'toolchain');
  const home = join(root, 'home');
  const profile = join(home, 'profiles', DSH_PROFILE);
  return {root, toolchain, home, profile, workspace:join(root, 'workspace'), marker:join(root, 'owner.json'), lock:join(root, 'install.lock'), launcher:join(root, 'launcher.mjs'), bin:join(toolchain, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), pnpm:join(toolchain, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')};
}
function json(path) {
  try {const value=readFileSync(path, 'utf8'); return value.length < 200_000 ? JSON.parse(value) : undefined;} catch {return undefined;}
}
function version(path) {
  const found=json(path)?.version;
  return typeof found==='string' && /^[0-9A-Za-z.+-]{1,48}$/.test(found) ? found : null;
}

/** Read-only and deliberately excludes locations, identities, logs and credentials. */
export function readDshState({directory} = {}) {
  const p=paths(directory);
  const versions={dsh:version(join(p.toolchain,'node_modules','@deepseek-ai','dsh','package.json')), qqPlugin:version(join(p.profile,'node_modules','@tencent-connect','dsh-qqbot','package.json')), pnpm:version(join(p.toolchain,'node_modules','pnpm','package.json'))};
  const configured=existsSync(join(p.profile, 'cordis.patch.yml')) && json(join(p.profile,'package.json'))?.dsh?.profile?.bundles?.includes('@tencent-connect/dsh-qqbot')===true;
  return {installed:json(p.marker)?.owner===owner && json(join(p.root,'profile-ready.json'))?.profile===DSH_PROFILE && json(join(p.root,'profile-ready.json'))?.guard===1 && versions.dsh===DSH_VERSIONS.dsh && versions.qqPlugin===DSH_VERSIONS.qqPlugin && versions.pnpm===DSH_VERSIONS.pnpm && configured && existsSync(p.launcher) && existsSync(p.bin) && existsSync(p.pnpm) && existsSync(join(p.profile,'dafeiyu-tool-guard.mjs')), versions, requiredVersions:DSH_VERSIONS, profile:DSH_PROFILE, independent:true, verified:'cli-only', chatVerified:false, running:null, commands};
}

/** Resolve npm beside bundled Node before considering a system installation. */
export function locateNpm({execPath=process.execPath, env=process.env, platform=process.platform} = {}) {
  const base=dirname(execPath);
  const candidates=[join(base,'node_modules','npm','bin','npm-cli.js'),join(base,'..','lib','node_modules','npm','bin','npm-cli.js'),env.npm_execpath];
  for(const path of candidates) if(path && path.endsWith('npm-cli.js') && existsSync(path)) return {command:execPath,args:[resolve(path)]};
  if(platform!=='win32' && existsSync(join(base,'npm'))) return {command:join(base,'npm'),args:[]};
  if(platform==='win32') throw new Error('未找到配套 npm。请使用完整安装包，或重新安装包含 npm 的 Node.js。');
  return {command:'npm',args:[]};
}

function execute(command, args, {cwd, env, inherit=false, timeoutMs=0} = {}) {
  return new Promise((accept,reject)=>{
    const ownGroup=!inherit && process.platform!=='win32';
    const child=spawn(command,args,{cwd,env,stdio:inherit?'inherit':['ignore','ignore','ignore'],shell:false,windowsHide:!inherit,detached:ownGroup});
    const stop=()=>{
      if(!child.pid)return;
      if(ownGroup){try{process.kill(-child.pid,'SIGTERM');}catch{}}
      else if(process.platform==='win32' && !inherit)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true}).on('error',()=>child.kill());
      else child.kill();
    };
    const interrupt=()=>stop();
    process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
    const timer=timeoutMs ? setTimeout(stop,timeoutMs) : null;
    const finish=(value)=>{if(timer)clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);value();};
    child.once('error',()=>finish(()=>reject(new Error('命令无法启动；检查完整 Node/npm 安装与本机文件权限。'))));
    child.once('exit',(code,signal)=>finish(()=>code===0?accept():reject(new Error(`命令未完成（${signal ? '已中断' : `退出码 ${code}`}）。`))));
  });
}
function launchEnv(p, source=process.env) {
  return {...source,DSH_HOME:p.home,DSH_CWD:p.workspace,QQBOT_BIND_OPEN_BROWSER:'0',NPM_CONFIG_LOGS_MAX:'0',npm_config_logs_max:'0',PNPM_HOME:join(p.root,'pnpm-home')};
}
function privateDir(path){mkdirSync(path,{recursive:true,mode:0o700}); if(process.platform!=='win32')chmodSync(path,0o700);}
function freshFile(path, value){writeFileSync(path,value,{flag:'wx',mode:0o600});}

export function companionPatch() {
  // Only this preset is selectable in the dedicated profile; upstream coding presets carry tools.
  return `# 大肥鱼独立 DSH profile。首次禁止自动回复；在官方 QQ 机器人设置中选择访问范围。\n` +
    `- id: preset-standard\n  disabled: true\n- id: preset-ptc\n  disabled: true\n- id: preset-minimal\n  disabled: true\n- id: preset-cordis\n  disabled: true\n` +
    `- id: agent-preset-registry\n  config:\n    default: dafeiyu\n` +
    `- insert:\n    - id: preset-dafeiyu\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: dafeiyu\n        name: 大肥鱼聊天\n        description: 中文陪聊，屏蔽全局工具\n        plugins:\n          - id: persona\n            name: '@deepseek-ai/dsh-persona'\n            config:\n              prefix: ${JSON.stringify(persona)}\n              complete: true\n              includeRuntimeContext: false\n          - id: dafeiyu-tool-guard\n            name: './dafeiyu-tool-guard.mjs'\n` +
    `- id: im-qqbot\n  config:\n    preset: dafeiyu\n    provider: deepseek-official\n    model: deepseek-flash\n    requireMention: true\n    streaming: false\n    maxQueue: 2\n    processingTimeoutMs: 120000\n    historyLimit: 10\n    directPrompt: ${JSON.stringify(persona)}\n    groupPrompt: ${JSON.stringify(persona)}\n    debug: false\n    access:\n      c2cMode: disabled\n      c2cAllow: []\n      groupMode: disabled\n      groupAllow: []\n    media:\n      enabled: false\n    vision:\n      enabled: false\n    sendFile:\n      restrictPaths: true\n      extraRoots: []\n      sendPresentedFiles: false\n`;
}
function launcherSource(p) {
  return `import {runCli} from ${JSON.stringify(pathToFileURL(p.bin).href)};\nawait runCli({packageManager:{command:process.execPath,args:[${JSON.stringify(p.pnpm)}]}});\n`;
}

/** CLI-only installation. Server imports must never call this operation. */
export async function installDsh({directory, runner=execute, env=process.env, progress=console.log} = {}) {
  const p=paths(directory);
  privateDir(p.root);
  if(!existsSync(p.marker)) {
    if(existsSync(p.toolchain)||existsSync(p.home)) throw new Error('目标目录已有非本入口管理的 DSH 数据。请使用新的 DAFEIYU_DSH_DIR，避免覆盖。');
    freshFile(p.marker,JSON.stringify({owner}));
  }
  if(json(p.marker)?.owner!==owner) throw new Error('安装目录标识不匹配，停止操作。');
  try {freshFile(p.lock,JSON.stringify({pid:process.pid}));} catch {throw new Error('已有安装锁。确认没有安装进程后，删除 .runtime/dsh/install.lock 再重试。');}
  let step='准备专用目录';
  let recovery='检查网络、磁盘和 Node/npm 后重跑 install；已有 profile 与凭据会保留。';
  try {
    for(const dir of [p.toolchain,p.home,p.workspace])privateDir(dir);
    const childEnv=launchEnv(p,env);
    if(!existsSync(join(p.toolchain,'package.json'))) freshFile(join(p.toolchain,'package.json'),JSON.stringify({name:'dafeiyu-dsh-runtime',private:true,dependencies:{'@deepseek-ai/dsh':DSH_VERSIONS.dsh,pnpm:DSH_VERSIONS.pnpm}},null,2));
    const current=readDshState({directory:p.root});
    if(current.versions.dsh!==DSH_VERSIONS.dsh || current.versions.pnpm!==DSH_VERSIONS.pnpm) {
      step='下载官方 DSH 与固定包管理器'; progress(`${step}，首次约需 1 GB 磁盘空间，请稍候。`);
      const npm=locateNpm({env});
      writeFileSync(join(p.toolchain,'package-lock.json'),readFileSync(join(locks,'package-lock.json')),{mode:0o600});
      await runner(npm.command,[...npm.args,'ci','--prefix',p.toolchain,'--no-fund','--no-audit'],{cwd:p.toolchain,env:childEnv,timeoutMs:900_000});
    }
    writeFileSync(p.launcher,launcherSource(p),{mode:0o600});
    const configFile=join(p.profile,'cordis.patch.yml');
    if(!existsSync(join(p.profile,'package.json'))) {
      step='初始化官方 Web profile'; progress(step);
      if(!existsSync(join(p.root,'profile-initializing.json')))freshFile(join(p.root,'profile-initializing.json'),JSON.stringify({profile:DSH_PROFILE}));
      await runner(process.execPath,[p.launcher,'--profile',DSH_PROFILE,'--from-default-profile','web','--dump-config'],{cwd:p.workspace,env:childEnv,timeoutMs:60_000});
    }
    if(!existsSync(configFile)){
      step='检查现有 profile';recovery='现有配置缺失；先将 .runtime/dsh 整体移至私人备份，再安装至新目录。';throw new Error('incomplete-profile');
    }
    if(json(join(p.root,'profile-ready.json'))?.profile!==DSH_PROFILE) {
      const currentPatch=readFileSync(configFile,'utf8');
      const isUnchangedTemplate=currentPatch.split('\n').filter(line=>!line.trim().startsWith('#')).join('\n').trim()==='[]';
      const ownedInit=json(join(p.root,'profile-initializing.json'))?.profile===DSH_PROFILE;
      if(!ownedInit || (!isUnchangedTemplate && currentPatch!==companionPatch())){
        step='恢复 profile 初始化';recovery='初始化中断且现有配置已变动，不会覆盖。先私人备份，再安装至新的 DAFEIYU_DSH_DIR。';throw new Error('modified-profile');
      }
      if(isUnchangedTemplate)writeFileSync(configFile,companionPatch(),{mode:0o600});
      const guardPath=join(p.profile,'dafeiyu-tool-guard.mjs');
      const guardSource=readFileSync(new URL('./dsh-chat-guard.mjs',import.meta.url),'utf8');
      if(existsSync(guardPath)){
        if(readFileSync(guardPath,'utf8')!==guardSource){step='恢复工具限制配置';recovery='工具限制文件已变动，保留现有数据，安装至新的 DAFEIYU_DSH_DIR。';throw new Error('modified-guard');}
      }else freshFile(guardPath,guardSource);
      freshFile(join(p.root,'profile-ready.json'),JSON.stringify({profile:DSH_PROFILE,guard:1}));
    }
    if(json(join(p.root,'profile-ready.json'))?.guard!==1){step='检查工具限制配置';recovery='当前为早期试装 profile，请保留私人数据并安装至新的 DAFEIYU_DSH_DIR。';throw new Error('guard-not-ready');}
    if(current.versions.qqPlugin!==DSH_VERSIONS.qqPlugin || !json(join(p.profile,'package.json'))?.dsh?.profile?.bundles?.includes('@tencent-connect/dsh-qqbot')) {
      step='安装官方 QQ 插件';progress(step);
      const manifestFile=join(p.profile,'package.json');
      const manifest=json(manifestFile);
      if(!manifest?.dsh?.profile?.bundles || Object.keys(manifest.dependencies||{}).some(name=>name!=='@tencent-connect/dsh-qqbot')){
        recovery='现有 profile 含其它依赖，不能套用冻结清单；保留现有数据，安装至新的 DAFEIYU_DSH_DIR。';throw new Error('custom-profile');
      }
      manifest.dependencies={'@tencent-connect/dsh-qqbot':DSH_VERSIONS.qqPlugin};
      manifest.dsh.profile.bundles=[...new Set([...manifest.dsh.profile.bundles,'@tencent-connect/dsh-qqbot'])];
      writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600});
      writeFileSync(join(p.profile,'pnpm-lock.yaml'),readFileSync(join(locks,'pnpm-lock.yaml')),{mode:0o600});
      await runner(process.execPath,[p.launcher,'plugin','--profile',DSH_PROFILE,'install','--frozen-lockfile'],{cwd:p.workspace,env:childEnv,timeoutMs:900_000});
    }
    step='检查组合配置';progress(step);
    await runner(process.execPath,[p.launcher,'--profile',DSH_PROFILE,'--dump-config'],{cwd:p.workspace,env:childEnv,timeoutMs:60_000});
    if(!readDshState({directory:p.root}).installed)throw new Error('安装内容不完整。');
    progress('官方 DSH 路线安装完成。运行 node scripts/dsh.mjs start，在独立面板填写 Key、绑定官方 QQ 机器人并选择访问范围。');
    return readDshState({directory:p.root});
  } catch {
    throw new Error(`失败步骤：${step}。${recovery}原始依赖日志未写入本入口输出。`);
  } finally {rmSync(p.lock,{force:true});}
}

export async function startDsh({directory,runner=execute,env=process.env,noOpen=false} = {}) {
  const p=paths(directory);
  if(!readDshState({directory:p.root}).installed)throw new Error('请先运行 node scripts/dsh.mjs install。');
  // Keep terminal control with the user. No daemon, shell command or implicit chat enablement.
  await runner(process.execPath,[p.launcher,'--profile',DSH_PROFILE,'--host','127.0.0.1','--port','3080',...(noOpen?['--no-open']:[])],{cwd:p.workspace,env:launchEnv(p,env),inherit:true});
}

async function main() {
  const [action='doctor',...args]=process.argv.slice(2);
  if(args.some(arg=>!((arg==='--json'&&['doctor','state'].includes(action))||(arg==='--no-open'&&action==='start'))))throw new Error('用法：node scripts/dsh.mjs install|start [--no-open]|doctor [--json]');
  if(action==='doctor'||action==='state') {
    const state=readDshState();
    console.log(args.includes('--json')?JSON.stringify(state):`官方 QQ 机器人路线：${state.installed?'已安装':'未安装或版本不完整'}。QQ 聊天尚未实机验收。\n${Object.values(commands).join('\n')}`);
  } else if(action==='install') await installDsh();
  else if(action==='start') await startDsh({noOpen:args.includes('--no-open')});
  else throw new Error('用法：node scripts/dsh.mjs install|start|doctor [--json]');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
