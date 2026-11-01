# 给安装 AI 的操作说明

目标：帮助用户在自己的电脑运行回声，完成环境检查与用户明确授权的 QQ 单次验收。只有具备本机终端操作能力的 AI 才能执行这些步骤。

## 先明确安装边界

- 这是实验版、单拥有者本机应用，默认只监听 `127.0.0.1:8787`。不要顺手开放公网端口。
- API Key、QQ 登录资料、二维码、控制 URL 和 Token 只用于本机。不要让用户把它们发到聊天里，也不要把它们放进共享日志。
- 用户应准备专门的机器人 QQ 账号。QQ 主账号不适合作为第一次桥接测试账号。
- 用户亲自扫码、填写 Key、指定会话。发送前必须得到允许回复的好友或群的明确范围；不要以“可以测试”推断所有会话均已授权。

## 1. 检查系统与 Node.js

在 macOS 终端或 Windows PowerShell 检查：

```sh
node --version
npm --version
```

需要 Node.js **22.13 或更新版本**；建议官方当前受支持的 LTS。

- **macOS：** 从 [nodejs.org](https://nodejs.org/) 选择匹配 Apple Silicon/Intel 的官方安装包，按系统提示安装。已有合适 Node 时复用，不改动其他项目的版本管理配置。
- **Windows：** 使用官网匹配架构的安装包，安装后重新打开 PowerShell，让 PATH 生效。若系统限制 `npm.ps1`，可使用 `npm.cmd`，不要为此永久放宽 PowerShell 执行策略。
- 不通过远程 `curl | sh`、未核验的镜像脚本或来源不明安装器配置运行环境。

## 2. 下载并检查仓库

从项目的正式 GitHub 仓库下载源码或克隆，并记录版本/提交。不要使用搜索结果中的同名项目替代它。进入含 `package.json` 和 `package-lock.json` 的目录：

```sh
npm ci
npm run doctor -- --json
```

doctor JSON 返回 `{ok, node:{version,supported}, dataDirectory, bridge:{url,reachable}, docker:{available,daemonReady}, nextSteps}`。只有不支持的 Node 版本让命令以非零状态退出；Docker 或桥接未就绪时仍可进行不依赖 QQ 的预览，应阅读 `nextSteps`，不要只凭退出码判断全链路。不要把“Node 已安装”当成 Docker、模型或 QQ 链路均已就绪；以各检查项的实际范围为准。若安装依赖失败，报告具体下载源/网络步骤，不悄悄换未知注册表，不删除锁文件重算版本。

## 3. 启动控制台，先看离线演示

```sh
npm start
```

保持进程运行，在本机浏览器打开终端输出的**完整控制 URL**。默认服务端口 `8787`；URL 中的控制凭证应视为密码，不要转发或截图公开。

浏览器读取控制 URL 的 fragment 后，将 token 保存到 `sessionStorage` 并移除地址栏中的 fragment。面板 JSON API 只允许带正确 `X-Echo-Token` 的本机请求。遵循仓库实际提供的接口，不通过直接改数据库伪造连接、确认或验收状态。

离线演示用于检查操作流程，必须保留“离线演示”标识。它不访问 DeepSeek，不证明真实 QQ 已连接。用户可以在本机面板填写自己的 Key，或在自行管理的环境中提供 `DEEPSEEK_API_KEY`；无需把 Key 交给安装 AI。Key 不应写进仓库、命令行参数或可公开诊断文件。

`POST /api/preview` 使用 `{text, mode:"demo"|"live"}`，属于 `web:preview` 范围。仅在用户要真实试聊时使用 `live`；支持 `deepseek-chat` 和 `deepseek-reasoner`。真实预览会调用模型，按一次调用设计，可能计费；每日上限包含失败尝试。用量缺失应显示未知，不作“免费”或固定节省比例承诺。

## 4. 准备 QQ 桥接

需要用户安装并启动 Docker。Mac/Windows 可从 [Docker 官方网站](https://www.docker.com/products/docker-desktop/) 安装 Docker Desktop；Windows 使用 Linux 容器，并按官方提示完成系统组件、虚拟化和可能的重启。已有 Docker 环境先检查，不创建第二个接管同一 QQ 的机器人实例。

```sh
docker version
npm run bridge:init
npm run bridge:start
```

桥接生成配置位于 `.runtime/napcat/config`，含敏感令牌。保留已有配置与 QQ 登录数据，不为排障直接清空整个目录。若脚本提示冲突或已有配置，先检查原因和备份，再按实际恢复步骤处理。

- WebUI：`http://127.0.0.1:6099/webui/`
- OneBot 正向 WebSocket：`ws://127.0.0.1:3001`
- **WebUI Token：** 登录 NapCat 管理页。
- **OneBot Token：** 回声连接桥接使用。不能用 WebUI Token 替代。

不要把 `6099`、`3001` 或回声控制端口映射到公网来修复连接问题。QQ 容器与应用是两个环节，端口可达不代表账号已登录。

## 5. 由用户完成账号与范围

1. 用户在本机 WebUI 填写 WebUI Token，用手机 QQ 扫码并确认。
2. 用户在回声配置实际机器人 QQ 号、OneBot 地址和令牌；填写 DeepSeek Key。
3. 连接后核对实际账号与在线状态。专门的机器人 QQ 是被登录的账号，发测试消息的好友应为另一个账号。
4. 用户指定并启用一个测试好友或群。群聊用真正的 QQ `@` 选择器选中机器人。
5. 在尚未得到明确会话范围前保持暂停；不默认把联系人列表加入允许范围。

## 6. 单次验收与故障处理

在用户授权的会话执行一次回复验收，由对端确认收到。随后检查暂停、退出和重启，确保没有自动重放或重复回复。

- 无效 Key、余额不足、429 或模型超时：说明错误，停止盲目重试；失败尝试仍可能计入每日限制。
- QQ 离线或 Token 不匹配：先检查对应链路，不重复调用模型来探测 QQ。
- 端口占用：识别占用程序并解释，不直接杀死用户其他服务。
- 发送结果未知：保留未知状态并请用户核对，不自动补发。
- 删除记忆或重置时：确认在途旧任务不会把旧内容写回或继续发送。

可报告的结果应精确到“环境检查通过”“离线演示通过”“模型预览通过”“桥接已连接”“对端实际收信”。没有真人收信证据时，不写“QQ 聊天已验收”。

## 交接

告知用户应用进程和 QQ 桥接都需要持续运行；关闭浏览器不会停止它们，休眠/断网会影响服务。迁移与诊断时只交付脱敏状态，私有状态保留在 `.runtime/`。多人云端托管不是这个安装流程的一部分。
