# 产品调研与设计取舍

调研日期：2026-11-01。范围是 QQ/IM 机器人项目的官方文档、用户原始 Issue 和开发者自己的实践记录。它们能提供具体失败场景与需求信号，**不能证明市场规模、付费意愿，也不能证明某项目当前所有版本仍有相同问题**。

回声的选择是：面向个人拥有者，先做“AI 能安装、记忆能核对、默认不打扰”的 QQ 文字伙伴。原创价值需要靠完整流程和验证积累，而不是换一个名字或承诺模型突然更聪明。

## 现有项目已经提供什么

- [LangBot 官方 README](https://github.com/langbot-app/LangBot/blob/master/README_CN.md) 已有 `uvx langbot`、Docker Compose、管理面板和云端入口。
- [AstrBot 官方桌面部署文档](https://github.com/AstrBotDevs/AstrBot/blob/master/docs/zh/deploy/astrbot/desktop.md) 已提供跨平台图形化安装方式。
- [Wave Memory 作者说明](https://github.com/vivy1024/astrbot_plugin_wave_memory) 已包含事实来源、审核、回复溯源等记忆机制。

因此，一键安装、网页控制、长期记忆都不是空白市场。回声不以“首创”或“全面替代成熟框架”定位自己。

## 反馈 → 产品行为

| 证据 | 状态与证据边界 | 回声的设计取舍 |
|---|---|---|
| [AstrBot #7622](https://github.com/AstrBotDevs/AstrBot/issues/7622)：用户报告主动回复的临时群聊上下文覆盖长期历史。 | 历史故障，作者于 2026-06-01 确认修复并关闭。说明应测试这条边界，不能声称当前仍普遍存在。 | 区分原始消息、批准的记忆和临时请求上下文；不让一个临时视图覆盖长期事实。 |
| [AstrBot #10675](https://github.com/AstrBotDevs/AstrBot/issues/10675)：生成中清空历史，旧任务收尾又写回旧内容。 | 调研时为 open；报告包含模拟模型和真实存储链路的隔离复现。其发生比例只属于该组实验。 | 记忆/会话变动让旧上下文失效；测试暂停、重置、删除与在途任务的交错顺序。 |
| [AstrBot #10195](https://github.com/AstrBotDevs/AstrBot/issues/10195)：用户希望减少历史中思考内容、图片 URL 和工具数据的重复回传。 | 用户需求和 PR 讨论，不能把讨论中的模拟 benchmark 当成回声收益。 | 有界历史、只传必要内容；普通文字预览按一次模型调用设计，用真实 usage 显示用量，未知就标未知。 |
| [group_chat_plus 作者 FAQ](https://github.com/Him666233/astrbot_plugin_group_chat_plus/blob/main/docs/ARCHITECTURE.md)：多个概率、冷却、疲劳及框架/插件主动回复机制叠加，可能造成频率过高。 | 插件作者的实际配置/排障文档；不是所有群都存在刷屏问题的统计。 | 默认只响应明确触发；同一入口统一裁决回复范围、限速和暂停，不在首版叠加多套主动发言系统。 |
| [人设实践记录](https://github.com/Yuimi-chaya/Yuimi-chaya.github.io/blob/main/src/content/blog/astrbot-roleplay-persona-notes.md)：作者描述过长设定稀释重点、多轮表现跑偏，并建议固定其他条件测试人设。 | 一位使用者的第一人称经验，不能推出所有模型都遵循相同规律。 | 提供简洁的自定义性格与预览；不把越来越长的固定人设当成可靠性保证。 |
| [AstrBot #10839](https://github.com/AstrBotDevs/AstrBot/issues/10839)：适配器跳过发送，工具却返回成功。 | 特定 QQ 官方机器人适配器的用户报告；不能推广为 NapCat 一定有同一问题。 | 区分生成、提交、接口确认、失败与未知。接口确认也不是接收者已看到；不为“看起来没收到”盲目重发。 |

另有 [大肥鱼 AstrBot 项目变更记录](https://github.com/whyever77/dafeiyu-astrbot/blob/main/CHANGELOG.md) 记录模型反思写错事实、随后反复追问的处理。这支持“让记忆可审核和纠正”的方向，不构成复制其插件或角色素材的理由。

## 原创贡献与复用边界

| 层次 | 回声的实现方式 | 不应声称的内容 |
|---|---|---|
| 产品定位 | 独立整理本机个人拥有者的连接、预览、范围、记忆与用量流程。 | 已经获得市场验证或聊天质量优于所有竞品。 |
| 源码 | 独立实现 Node.js HTTP/SQLite 应用及测试，不以此前试装项目的源码建立分支。 | 重新训练了 DeepSeek 或拥有私有基础模型。 |
| QQ 通道 | 使用 OneBot 协议和单独运行的 NapCat；`ws` 作为传输依赖。 | 发明了 QQ 协议、QQ 官方授权个人号托管，或无账号风控。 |
| 人设与记忆 | 自己编写提示与状态逻辑，用户明确批准长期记忆。 | 长期记忆永远正确、无限上下文或永久在线。 |
| 安装与诊断 | 提供适合安装 AI 阅读的说明与机器可读环境检查。 | 未经双系统实测就承诺任意电脑一步成功。 |
| 品牌和界面 | “回声”独立命名与原创界面，不打包大肥鱼二创角色素材。 | 上游、DeepSeek 或腾讯背书。 |

## 第一版的范围

交付本机单拥有者、QQ 文字消息、自备 DeepSeek Key、自定义伙伴、明确会话范围、可批准/删除记忆、调用上限，以及有明确标识的离线演示。

暂不做插件市场、电脑控制、自动发帖、全量群聊监听或多人托管。是否扩大范围，应以真实用户从安装到收信的结果、反馈和维护成本决定。服务器可行性与尚未实现部分见 [HOSTING.md](HOSTING.md)。
