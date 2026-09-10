# Readnote Atlas

[English](README.md)

**读懂英文世界，从文本到视频。**

Readnote Atlas 是一个面向中文母语读者的 local-first Chrome 扩展。它让英文文章和视频始终保留在原始语境中，在真正需要的地方提供中英双语辅助，并把你主动选择的内容沉淀到自己的 Obsidian 或 Notion 知识库。

## 为什么做这个项目

英文互联网中最值得学习的内容，并不只存在于文章里。它也可能是一份技术文档、一场访谈、一堂课程，或一段长达数小时的深度对话。

这里真正的问题不只是“如何翻译”。整页中文会让原文消失，过度压缩的摘要会抹平作者的推理过程，而独立的笔记工具又常常切断观点与原始语境之间的联系。

翻译只是阅读辅助，不是终点。Readnote Atlas 希望建立一条更完整的路径：

`原始内容 → 双语理解 → 精确选择 → 个人笔记 → Obsidian / Notion`

原文始终是主角，中英文始终彼此对照。文章中的一个段落和视频中的一个时间戳，本质上是同一种知识锚点。翻译帮助我们跨过语言边界，而笔记让理解过的内容真正成为自己的知识。

由此形成五条产品原则：

1. **留在原始语境中阅读。** 不为了翻译而离开文章或视频。
2. **默认中英双语。** 中文用于辅助理解，但不取代英文原文。
3. **文本与视频使用同一套体验。** 阅读、选择、批注和知识沉淀不因媒介变化而割裂。
4. **速度本身就是理解体验的一部分。** 实时字幕必须跟上播放进度，也必须在用户从长视频中段开始观看时迅速接上。
5. **知识和数据属于用户。** 内容优先保存在本地，只同步到用户主动配置的服务和知识库。

更完整的产品定义见 [PRODUCT.md](PRODUCT.md)，播放器字幕的技术取舍见[实时双语字幕架构研究](docs/realtime-caption-architecture.md)。

## 已实现能力

### 英文文章

- 在原网页中渐进翻译可阅读的英文段落；
- 选中文字后直接高亮、下划线、写批注或保存摘录；
- 再次打开同一 URL 时恢复标注；
- 将摘录追加到一个 Obsidian Markdown 笔记，并可选同步到 Notion。

### YouTube 视频

- 在播放器画面内居中显示英文与简体中文字幕；
- 只用一个清晰的 `On` / `Off` 开关控制中英双语，不提供纯英文或纯中文模式；
- 当前句采用流式翻译，并持续预翻译播放头之后的字幕；
- 即使从长视频中段开始观看或频繁拖动进度条，也会优先追上当前字幕；
- 字幕区域可以移动和平滑缩放，改变宽度时文字会自然重排；
- 通过文字清晰标注、可收起的字幕控件切换 On / Off 与字号；直接拖动字幕移动位置，拖动右下角改变宽度并自然重排；
- 字幕加载后立即在默认页自动生成覆盖完整讨论内容的中文综述；
- 在 Chrome 侧边栏按完整语义段落阅读、搜索、选择并翻译 transcript，而不是重复播放器中的逐句字幕；
- 点击 transcript 或笔记，精确跳转到对应时间；
- 用播放器右上角的小书签保存精彩时刻，选择 transcript 段落保存原文，或在当前时间直接写下个人感想；
- 笔记先保存在本地，再同步到 Obsidian 和/或 Notion。
- 一条视频在前台真实播放累计满 10 分钟后，自动进入本地 Watched Library，便于回看与继续观看。

## 本地安装与开发

需要 Chrome 116+、Node.js 22.19+、用于获取 YouTube transcript 的 Supadata API Key，以及任一受支持 AI provider 的 API Key。

```bash
git clone https://github.com/pheobepotato/readnote-atlas.git
cd readnote-atlas
npm install
npm run build
npm test
npm run check
```

然后：

1. 打开 `chrome://extensions`；
2. 开启“开发者模式”；
3. 点击“加载已解压的扩展程序”，选择仓库文件夹；
4. 进入 **Readnote Atlas Settings**，填写 Supadata Key，并选择 DeepSeek、OpenAI、Google Gemini、OpenRouter 或自定义 OpenAI-compatible endpoint。

请勿把 API Key 放进源代码、GitHub、截图或聊天记录。

## 个人知识库

启动可选的本地 companion：

```bash
npm run companion
```

打开 `http://127.0.0.1:8791/setup`，配置：

- 一个 Obsidian Markdown 笔记的绝对路径；
- 可选的 Notion integration token 和目标 page id；
- 用于文章翻译的服务与 API Key。

Companion 将敏感配置写入已被 Git 忽略的 `.env.local`。文章摘录与视频时间戳笔记使用同一套来源结构，因此知识库会成为一条连续的学习记录，而不是零散的导出文件夹。

## 隐私与数据流向

- 文章标注、翻译缓存、视频 transcript、笔记、综述与观看进度保存在 Chrome 本地；
- 文章翻译和知识库同步请求通过 `127.0.0.1:8791` 的本地 companion 完成；
- Companion 只写入你配置的 Markdown 文件和 Notion 页面；
- 获取视频 transcript 时，Supadata 只收到标准化后的 YouTube URL；
- 当前启用的 AI provider 只收到翻译或 AI 功能所需的内容；各 provider profile 和 Key 均保存在 Chrome 本地；
- 没有 Readnote Atlas 账号、分析 SDK、广告或开发者运营的云端服务。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 当前边界

- 暂不支持 YouTube Shorts、直播、私密视频以及没有原生字幕的视频；
- 播放器字幕会自动获取并缓存原生字幕，无需先打开侧边栏；
- 视频 AI 能力支持 DeepSeek、OpenAI、Google Gemini、OpenRouter 和自定义 OpenAI-compatible endpoint；文章翻译可通过 companion 使用 DeepSeek、OpenAI 或 MiniMax；
- 第一版仅支持 Chrome。

## 项目来源与致谢

Readnote Atlas 是在两个项目基础上完成的独立设计：

- [Readnote](https://github.com/pheobepotato/readnote) 由本项目作者创建，它确立了“原始内容优先”的阅读理念、本地批注方式，以及向 Obsidian / Notion 沉淀个人知识的工作流。
- [YouTube Digest v1.2.0](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0) 由 **Zara Zhang** 创建。它为 transcript 获取、双语视频阅读、时间戳导航、内容解释和视频笔记提供了开源基础与重要灵感。本项目的视频工作流部分代码基于其 MIT License 衍生，并在产品结构、播放器字幕、实时翻译调度和知识库整合等方面进行了重新设计。

Readnote Atlas 是一个独立项目，不是 YouTube Digest 或 Zara Zhang 的官方版本，也不代表原作者对本项目的认可或背书。我们真诚感谢 Zara Zhang 的开源工作，它让这次探索成为可能。原作者版权声明已完整保留在 [LICENSE](LICENSE) 中，两个项目之间的关系也记录在 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

## 开源许可

[MIT License](LICENSE)，欢迎参与贡献。
