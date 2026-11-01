# 官方 DSH + QQ 机器人入口

这条可选路线安装 DeepSeek 官方 Harness 与腾讯官方 QQ 插件。QQ 扫码用于**绑定官方机器人**；它不把个人 QQ 号登录成机器人，也不接管个人号好友列表。个人号 NapCat 路线仍是另一个实验入口。

安装器固定 `@deepseek-ai/dsh@0.2.1-rc.5`、`@tencent-connect/dsh-qqbot@0.5.5` 与 `pnpm@10.30.3`（2026-11-01 核实）。`scripts/dsh-locks/` 保存经过验证的 npm 与 pnpm 传递依赖清单，安装分别使用 `npm ci` 与官方 CLI 转发的 `pnpm install --frozen-lockfile`，不在用户安装时重新选择依赖版本。首次需网络下载，实测 DSH 依赖约 854 MB，建议预留至少 2 GB。下载来自 npm 官方仓库及依赖声明的来源；本项目尚未验证国内所有网络的完整下载，也没有私自替换镜像。

## 安装和启动

完整发布包附带 Node 和 npm，不需要系统预装 Node。解压后可以直接双击以下入口：

- **Mac：**`scripts/dsh-install.command` 安装，`scripts/dsh-start.command` 启动。
- **Windows：**`scripts/dsh-install.cmd` 安装，`scripts/dsh-start.cmd` 启动。`.cmd` 会调用配套 PowerShell 脚本，仅为本次进程使用执行策略参数，不修改系统执行策略；不要双击 `.ps1`，Windows 默认可能在编辑器中打开它。

如需手动运行，在**解压后的项目目录**打开终端，使用完整包自带的 Node。

Mac 终端：

```sh
./.bundled/bin/node scripts/dsh.mjs doctor --json
./.bundled/bin/node scripts/dsh.mjs install
./.bundled/bin/node scripts/dsh.mjs start
```

Windows PowerShell：

```powershell
& .\.bundled\node.exe scripts/dsh.mjs doctor --json
& .\.bundled\node.exe scripts/dsh.mjs install
& .\.bundled\node.exe scripts/dsh.mjs start
```

只有从 GitHub 克隆**源码**的用户才需要自行安装本项目要求的 Node.js 与 npm，然后使用：

```sh
node scripts/dsh.mjs doctor --json
node scripts/dsh.mjs install
node scripts/dsh.mjs start
```

这些命令不会安装系统级包，不要求预装 pnpm。Windows 官方路线直接运行 Node，不需要 WSL2 或 Docker。

启动进入独立 DSH 本机页面，默认监听 `127.0.0.1:3080`。浏览器没有自动打开时，使用终端给出的**完整本机启动链接**，包含本次访问凭证；直接访问不含凭证的根地址可能返回 401。这条完整链接只给本机所有者使用，不复制到公开 issue 或聊天。在对应平台的 `start` 命令后加 `--no-open` 可禁止自动开页。关闭终端或按 Ctrl+C 停止这条路线。它不会随主聊天台的暂停按钮一起停止，也不承诺电脑休眠后在线。

首次配置由本人完成：

1. 在 **DSH 的 Models/模型设置**中给 `deepseek-official` 路由填写自己的 DeepSeek API Key；上游源码明确支持这里保存的 `DEEPSEEK_API_KEY` 凭据，也支持启动环境中的同名变量。不把 Key 发给安装 AI 或写到命令行参数中。
2. 在 **设置 → QQ 机器人**完成手机 QQ 扫码绑定。页面由官方插件提供；安装器不代扫码、不获取 QQ 身份。如果已有官方 AppID/Secret，也在该独立面板中配置。
3. 首次 profile 的私聊与群聊均为 `disabled`。在 QQ 机器人访问设置中，选定测试范围再启用。白名单使用 QQ 官方平台的用户/群 **openid**，不能把普通数字 QQ 号当成 openid；暂未确定 openid 时先在受控测试机器人及测试群内完成辨认，再填写白名单。
4. 先只开放本人明确指定的一位测试用户或一个测试群，群聊保持需要 `@bot`。用一句文字验证，对端实际收到回复后再扩大范围。

模型费用由用户自己的 DeepSeek 账户承担。官方插件有独立行为，本项目自有聊天台的每日额度、单次验收按钮、暂停机制、已批准记忆和主人身份设置**不会自动作用于 DSH**。

## 大肥鱼人格如何传过去

首次安装生成独立 `dafeiyu` preset，用 DSH 的 `@deepseek-ai/dsh-agent-preset` 与 `@deepseek-ai/dsh-persona` 注册鲸鱼娘人格，并通过 QQ 插件的 `preset: dafeiyu` 选择它。QQ 私聊和群聊额外 prompt 同样写入简短人格。该 profile 禁用上游四个编程 preset，自有 preset 不挂载 shell、文件或浏览器操作工具，首版关闭媒体理解和附件自动发送。

QQ 插件原生仍会注册 `qqbot_send_file`，所以本入口额外在 preset 的 Agent scope 加载 `dsh-chat-guard.mjs`，调用官方 `tools.restrict({allow: []})` 屏蔽继承的工具。已用固定版 DSH 的实际 registry 验证 `working_directory` 和 `qqbot_send_file` 在该 scope 中既不出现在模型 schema，也无法通过 registry 查询。DSH 的这一限制不隐藏同 scope 新注册的工具，因此此 preset 只加载人格和限制插件；用户另装或修改 preset 后，不能继续套用本入口的工具边界结论。

默认模型为 `deepseek-official / deepseek-flash`，与已固定 DSH 的官方默认模型一致。可在独立面板选择账户支持的其它模型。

这是一份专门写入的初始人格，不是从主聊天台动态同步。DSH 的 Key、机器人绑定、会话历史和配置保存在 `.runtime/dsh/home/`，工作目录固定 `.runtime/dsh/workspace/`；主聊天台的 SQLite 和记忆不被读取。DSH/QQ 原生页面允许用户更改 profile；更改后能力以实际 DSH 配置为准。

## 重跑、诊断和故障恢复

再次执行 `install` 会检查固定版本，保留已存在的 profile、绑定和访问设置，不重新套用默认模板。上游 `--from-default-profile` 会覆盖 profile，本入口只在全新 profile 使用它。不同目录的安装不共享状态；如需使用其它本机目录，在终端设置 `DAFEIYU_DSH_DIR`（路径可含中文或空格），之后每次安装和启动都使用同一设置。

诊断时使用上方对应平台的 `doctor --json` 完整命令；完整包继续使用 `.bundled` 中的 Node，源码用户使用系统 `node`。

JSON 只报告本地安装版本、是否完整与命令，不读取或返回 Key、QQ 身份、绝对用户路径、聊天内容，也不假装检测到了 QQ 在线状态。HTTP `/api/dsh/state` 只读；下载和执行 npm 必须由本人或获得本机操作授权的 AI 在终端发起。

- **网络/磁盘失败：**入口报告具体阶段。恢复网络或空间后重新执行 `install`；不会自动换下载源。安装器不给错误输出附带原始 npm 日志。
- **存在安装锁：**先确认没有另一个安装进程；确认后只删除 `.runtime/dsh/install.lock` 并重试。不要同时运行两个安装入口。
- **profile 初始化中断：**若仍是本入口创建的空白官方模板，重跑会继续写入初始人格。若配置已被更改，入口拒绝覆盖并给出具体恢复提示；先将 `.runtime/dsh/` 整体移至本机私人备份，再安装到新目录，不公开备份内容。
- **3080 被占用：**关闭之前启动的 DSH 或占用程序再启动，不自动结束未知进程。
- **Key 无效、余额不足：**在独立 DSH 模型页核实 Key 与账户；安装完成本身不证明模型可调用。
- **QQ 断连/绑定失败：**使用官方 QQ 机器人设置重新检查；不要把个人号 NapCat 的二维码、凭据或端口填到这里。
- **官方原始日志：**DSH 自己可能在其 home/logs 保存启动诊断；这类文件可能带配置和凭据，只在本机检查，不交给公开 issue 或安装 AI。

## 给安装 AI 的指令

> 先检测操作系统和包类型，在本项目目录按上面的平台命令运行 doctor、install、start。完整 Mac 包使用 `./.bundled/bin/node scripts/dsh.mjs ...`；完整 Windows 包在 PowerShell 使用 `& .\.bundled\node.exe scripts/dsh.mjs ...`，或调用配套 `.cmd` 入口；只有源码包才使用系统 `node`，不要假定完整包用户的 PATH 中有 Node。保持进程监听 127.0.0.1，不改为公网。命令失败按阶段排查，不打印环境变量或原始凭据日志。停在用户填写 DSH Key、手机 QQ 绑定和选择测试范围的位置，由用户亲自操作；未经明确指定测试会话，不发真实消息。主聊天台和 DSH 不共享状态，不能用主聊天台“已配置”判断 DSH 就绪。安装成功标准是 doctor 检出全部固定版本且 DSH 页面能打开；聊天成功标准是用户指定的 QQ 对端实际收到一条回复，两者分别记录。

## 验证边界与来源

2026-11-01 已核实官方 npm 包与 CLI 接口，并在 macOS 隔离中文空格目录通过最终冻结清单的完整安装、重跑保留与无 Key 启动；本机页面实测未授权 401、启动凭证换 Cookie 后 200 HTML。运行中的两份 lock 与仓库 lock 哈希一致。源码入口的安装、重跑保留、版本检查、锁、中断恢复、脱敏失败与本机启动参数有自动化测试。当前测试网络的官方 QQ 绑定任务请求出现 `self-signed certificate in certificate chain`，未关闭证书校验；因此未完成 QQ 扫码或发送验收，也未使用真实 Key。Windows 尚待实机运行，国内网页、包及完整依赖下载仍待发布验收。

`node --test test/dsh.test.mjs` 默认运行 11 个不依赖 DSH 下载的测试。已安装 DSH 后，可设置 `DAFEIYU_DSH_INTEGRATION_DIR` 为该安装目录，再运行同一命令，额外核验固定版官方工具 scope（本轮 12 项全通过）。集成测试只创建合成工具，不连接 QQ、不调用模型。

源码入口显式调用上游导出的 `runCli()`；这是为了兼容某些 Node 版本中上游 `import.meta.main` 不生效导致 CLI 静默退出的情况，不修改官方包。

- [DeepSeek Harness 官方项目](https://github.com/deepseek-ai/deepseek-harness)
- [腾讯 DSH QQ 插件与配置说明](https://github.com/tencent-connect/dsh-qqbot)
- [DSH 固定 npm 包](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.1-rc.5)
- [QQ 插件固定 npm 包](https://www.npmjs.com/package/@tencent-connect/dsh-qqbot/v/0.5.5)
