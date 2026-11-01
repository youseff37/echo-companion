# 大肥鱼 · QQ 养鱼计划

**把熟悉的 DeepSeek 大肥鱼，养到自己的 QQ 里。** 蓝发鲸鱼娘、会接梗的短句聊天、适量白饭与摸鱼梗，以及能查看、确认、删除的相处记忆。

这是社区衍生的免费开源实验项目，不隶属于 DeepSeek 或腾讯。仓库路径保留 `echo-companion`；0.1.x“回声”是此前的技术原型，0.2.0 起以大肥鱼体验为产品中心。代码独立实现，角色来源和素材许可单独列在 [ASSETS](docs/ASSETS.md)。

![大肥鱼聊天台](docs/dashboard.jpg)

> **实验版。** 安装包和合成测试不能代替真实模型、QQ 对端收信与 Windows 实机验收。多人登录托管网站尚未实现；中国大陆下载可达性尚待不同网络实测。最新证据见 [验证记录](docs/VERIFICATION.md)。

## 先选使用方式

| 方式 | 能获得什么 | 当前边界 |
| --- | --- | --- |
| 大肥鱼聊天台 + NapCat | 本项目角色、聊天预览、可确认记忆、指定 QQ 好友/群文字回复 | 聊天台已实现；QQ 实际收信仍待验收 |
| 官方 DSH + 腾讯 QQ 插件 | 官方 Harness 原生会话与 QQ Bot 绑定 | 提供固定版本 CLI 安装入口；是独立产品路径，不自动共享本聊天台的记忆和设置 |
| 自己服务器运行 | 单拥有者实例，电脑可关机 | [部署说明](docs/HOSTING.md)，实际服务器验收待完成 |
| 用户登录公共网站后托管 | 多租户服务 | 尚未实现，下载站不提供这种登录按钮 |

官方 Bot 绑定与用 NapCat 登录一个个人机器人 QQ 是两种身份和接入方式，不能互换。

## 下载后启动

从 [Releases](https://github.com/youseff37/echo-companion/releases) 选择对应系统的 **0.2.0 完整包**，核对 [版本清单](version-manifest.json) 的 SHA-256，再解压到普通可写文件夹。完整包包含固定版本 Node 与 `ws`，不要求安装 Swift、编译器或 Node。

- **Mac：**macOS 14+，Apple Silicon；双击根目录 `启动大肥鱼.command`。Intel Mac 暂不支持。下载安全提示按系统实际信息处理，勿关闭系统安全保护。
- **Windows：**Windows 11 x64；双击根目录 `启动大肥鱼.cmd`。不需要 WSL2 就能打开聊天台；选择 NapCat/Docker 路线时才需要相应虚拟化环境。当前仍标记“测试版，待实机验收”。

入口会打开仅本机可访问的控制面板。保持启动终端运行，首次回复保持暂停。先试三个明确标注的**预设样例**，再由你在本机填写自己的 Key，进行真实试聊。样例不会调用模型、产生费用或发到 QQ。

真实试聊支持 `deepseek-flash` / `deepseek-v4-pro`，按自己账户计费；旧配置别名在请求时做兼容映射。Key 仅在内存或由环境变量提供，不默认写入 SQLite，重新启动需重新填写。

## 从源码运行 / 交给 AI 安装

需要 Node.js 22.13+（建议当前受支持 LTS）：

```sh
git clone https://github.com/youseff37/echo-companion.git
cd echo-companion
npm ci --ignore-scripts
npm run doctor
npm start
```

复制给具备本机操作能力的 AI：

> 请安装 youseff37/echo-companion 的大肥鱼项目。先读取仓库 docs/AI_INSTALL.md 和 version-manifest.json，检测系统、架构与端口，优先使用校验过 SHA-256 的完整安装包。保留已有配置，由我在本机填写 Key、扫码并指定测试会话。先做离线检查；没有我的明确会话授权，不发送 QQ 消息。分别报告安装、模型和 QQ 实际收信的验证状态。

无需登录的静态下载站源码在 `site/`，执行 `npm run site:build` 生成可迁移的 `dist/`。任何静态托管商都可使用；未发布的文件不会显示下载按钮。

## 接 QQ

**官方 DSH 路线：**见 [DSH 快速开始](docs/DSH_QUICKSTART.md)。独立安装官方 Harness 与腾讯插件，扫码绑定官方机器人。不要把本聊天台的记忆或 Key 状态误当成 DSH 的状态。

**聊天台 NapCat 路线：**使用专门的机器人 QQ 账号。安装并启动 Docker 后运行：

```sh
npm run bridge:init
npm run bridge:start
```

完整包中可用内置 Node 直接执行 `scripts/bridge.mjs init` / `start`。在脚本给出的本机 NapCat 面板扫码，回到聊天台填写实际 QQ 号、OneBot 地址和令牌，核对账号并选择一个允许回复的好友或群。WebUI 令牌、OneBot 令牌和模型 Key 是三种不同凭据。

先开启“单次验收”，由对端确认收到；然后自行决定是否持续回复。群聊只响应真正的 QQ @。第三方桥接可能掉线或触发平台限制；电脑关机或休眠时不承诺在线。

## 运行与维护

```sh
npm run status
npm run stop
npm run doctor -- --json
npm test
```

完整包使用内置 Node 执行相应 `scripts/control.mjs status` / `stop` / `scripts/doctor.mjs --json`。关闭网页不会停止进程，关闭启动终端或使用停止入口才会停机。重复启动不覆盖配置，同一数据目录使用实例锁；升级先停止，再保留自己的 `.runtime/` 私有目录。不要上传该目录、原始日志、二维码或控制链接。

角色默认是能干、机灵、偶尔嘴硬的大肥鱼；轻梗陪聊、认真干活和自定义语气可切换。表情是模型返回的可选展示元数据，不作为 QQ 正文发送；示例不代表付费模型实际输出。模型提出的记忆要由拥有者批准才会用于后续请求。

## 许可与来源

原创代码：[MIT](LICENSE)。角色衍生图片：**CC BY-NC-SA 4.0**，见 [素材与生图记录](docs/ASSETS.md)，不随代码 MIT 授权。Node、npm、ws 及可选依赖保留各自许可；精确下载来源见 [runtime-sources.json](runtime-sources.json) 和版本清单。NapCat、QQ 客户端、DSH 不随基础完整包预装。

感谢上善无形、ZipZipPipe、这个刀子真甜等社区创作者，以及 DeepSeek Harness、腾讯 QQ 插件、AstrBot、NapCat 的开源贡献。研究与取舍见 [PRODUCT_RESEARCH](docs/PRODUCT_RESEARCH.md)。
