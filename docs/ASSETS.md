# 角色素材、许可与生成记录

本项目不是DeepSeek或腾讯官方产品，也不主张拥有“大肥鱼”基础角色。代码MIT与角色素材许可分开。

## 来源与署名

- 上善无形：鲸鱼娘形象原型。[作者原帖](https://www.bilibili.com/opus/1231977657712771073)
- ZipZipPipe：DeepSeek女仆鲸鱼娘二创与表情图。[参考表情原帖](https://www.bilibili.com/opus/1238946461156114455)，[许可声明](https://www.bilibili.com/opus/1247156596114456581)。本轮生成参考了该公开表情图的蓝发、鲸鳍、鲸尾、女仆服与Q版特征。
- 这个刀子真甜：社区Q版动画参考，腾讯QQ官方视频也明确列为形象参考贡献者；不将全网Q版一概归属同一作者。
- [Neko3000/deepseek-whalechan](https://github.com/Neko3000/deepseek-whalechan)：研究视觉一致性锚点，未安装它的技能或复制其代码。

本项目的角色衍生素材按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 提供：署名、非商业、相同方式共享。它们**不包含在MIT许可范围**，AI生成不使底层角色自动变成完全原创或商业授权形象。未来收费托管需要另行核对角色使用范围。

## 本次新生成的文件

| 文件 | 用途 | 制作方式 |
| --- | --- | --- |
| public/assets/whale-hero.png | Q版全身主视觉：抱饭碗、机灵表情 | 内置image_gen，以公开社区形象作身份参考，重新生成姿势与构图，透明PNG |
| public/assets/whale-expressions.png | 得意、被抓包、认真帮忙三种状态 | 内置image_gen，以本次主视觉统一身份，透明横向三表情 |
| public/assets/whale-cover-v2.png | 网站首屏新封面：微笑挥手、轻快站姿与流动鲸尾 | 内置image_gen，沿用已署名角色身份，重新生成姿势与构图，透明PNG；旧图保留 |

生成时间2026-11-01。ToAPIs未配置密钥，使用内置工具；没有调用项目用户的DeepSeek Key。生成记录与提示词见 generation-prompts.txt。没有直接打包参考图原文件，也没有把参考图当作项目新作品。

页面中的对话示例由开发者编写并明确标注，未伪装为真实用户聊天截图。截图若只展示这些示例，仍不构成真实模型或QQ验证。
