# Readnote Atlas

[English](README.md)

**帮助中文母语者读懂英文世界，从文本到视频。**

Readnote Atlas 是一个 local-first Chrome 扩展：在原始文章和 YouTube 视频中保留英文语境，用中英双语降低理解门槛，再把你真正选择的内容沉淀进自己的知识库。

> 翻译只是阅读辅助，不是终点。

[安装](#一次安装) · [跟着试一次](#第一次使用跟着做) · [悬浮字幕](#可选跨-app-悬浮字幕macos) · [常见问题](#开始前你可能想问) · [设计初衷](#为什么做-atlas)

## 新用户从这里开始

| 你想做什么 | 怎么做 |
| --- | --- |
| 阅读文章 | 在原页面高亮或批注；运行本地 companion 后，还可以渐进翻译英文段落。 |
| 学习视频 | 打开有原生字幕的 YouTube 视频，播放器画面内居中显示英文与简体中文字幕，侧边栏提供完整 transcript。 |
| 留下想法 | 点小书签保存时间戳，选中 transcript 段落，或直接写下个人感想。 |
| 边听边工作 | 在 macOS 启动可选的原生字幕助手；YouTube 在后台播放时，屏幕上只保留一个紧凑的悬浮字幕框。 |

## 产品工作流

`原始内容 → 双语理解 → 精确选择 → 个人笔记 → Obsidian / Notion`

原文始终是主角。文章段落和视频时间戳都是可回溯的知识锚点，因此阅读和观看最终进入同一套个人知识库。

### 文章

- 在原网页中渐进翻译可阅读的英文段落；
- 高亮、下划线、批注并保存选中文字；
- 再次打开同一 URL 时恢复标注；
- 将带来源的摘录写入 Obsidian Markdown，并可选同步到 Notion。

### YouTube 视频

- 播放器画面内居中显示英文与简体中文字幕；
- 只有一个 `On` / `Off` 双语开关，不提供纯英文或纯中文模式；
- 当前句流式翻译，并预翻译播放头之后的字幕；跳播后优先处理新的播放位置，首次或未缓存的翻译仍受服务速度影响；
- 字幕框可拖动、缩放，宽度变化时文字自然重排并完整适配；
- 字幕加载后立即生成覆盖完整讨论内容的中文 Overview；
- 侧边栏顺序是 **Overview → Notes → Transcript → Library**；
- transcript 按完整语义段落呈现，可搜索、选择并跳转时间戳；
- 用小书签保存精彩时刻、保存段落，或在当前时间写下个人感想；
- 前台真实播放累计满 10 分钟后，视频自动进入 Watched Library。

## 一次安装

目前采用源码安装，不是 Chrome Web Store 一键安装包。先准备 Chrome 116+ 和 Node.js 22.19+。

| 想使用的能力 | 需要配置什么 |
| --- | --- |
| 文章高亮与本地批注 | 只需扩展 |
| YouTube 双语字幕、综述、transcript | 在 Settings 中配置 Supadata Key 和视频 AI provider Key |
| 文章翻译 | 本地知识库 companion + 文章翻译 provider Key |
| Obsidian / Notion 同步 | 本地知识库 companion + 自己选择的目标笔记 |
| 跨 App 置顶字幕 | Readnote Atlas + 可选 macOS helper |

```bash
git clone https://github.com/pheobepotato/readnote-atlas.git
cd readnote-atlas
npm install
npm run build
```

1. 打开 `chrome://extensions`，开启“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的仓库文件夹。
3. 打开扩展的 **Options / Readnote Atlas Settings**。使用 YouTube 时，填写 Supadata，并配置 DeepSeek、OpenAI、Google Gemini、OpenRouter 或自定义 OpenAI-compatible endpoint。
4. 保存后，刷新已经打开的文章或 YouTube 标签页。

使用你自己的 API Key，服务商可能按使用量收费，建议在各服务商账户中设置额度。

## 第一次使用，跟着做

- [ ] 打开一个有原生字幕的英文 YouTube 访谈并播放，保持双语字幕 **On**。transcript 和翻译准备好后，中英文会一起显示。
- [ ] 点击播放器下方的 **Readnote Atlas**，或 Chrome 工具栏的扩展图标。默认是 **Overview**；中文综述在字幕加载时已开始生成，不必等你展开侧边栏。
- [ ] 听到值得记住的一段？点击播放器小书签。在 **Notes** 找到它，也可以直接写感想并点击 **Save note**。
- [ ] 打开 **Transcript**，搜索或选择有意义的段落并保存。它会进入同一份 Notes，时间戳让你随时回到上下文。
- [ ] 以后从 **Library** 回看。视频需要累计前台播放满 10 分钟才收录；跳播和后台收听不计入这个门槛。

文章则可以先选中文字，高亮、下划线、批注或保存。需要段落翻译与知识库同步时，再启动下面的 companion。

### 可选：文章翻译与知识库同步

```bash
npm run companion
```

打开 `http://127.0.0.1:8791/setup`，按需配置文章翻译服务（DeepSeek、OpenAI 或 MiniMax）与 Key、一个 Obsidian Markdown 笔记路径，以及可选的 Notion integration token 和目标 page ID。

翻译文章或同步时保持 companion 运行。敏感配置保存在被 Git 忽略的 `.env.local`。视频笔记先保存在本地，没有 Obsidian 或 Notion 也可以开始记笔记。

### 可选：跨 App 悬浮字幕（macOS）

在 macOS 上运行可选的字幕助手，即可在使用其他 App 时继续看字幕：

需要 macOS、Node.js 和 Apple Command Line Tools（`swiftc`）。从 `chrome://extensions` 复制**你自己的** Readnote Atlas 扩展 ID，替换下面的占位符：

```bash
npm run desktop:captions -- --extension-id=YOUR_READNOTE_ATLAS_ID
```

首次配对后刷新 YouTube 标签页，保持 helper 运行。以后只需 `npm run desktop:captions`，不用重复输入 ID。目前不会安装开机自启服务。

- [ ] 播放视频，切换标签或最小化 Chrome：一个简洁的无边框字幕窗口浮在其他 App 上方。
- [ ] 拖动或缩放：中英文在深灰毛玻璃框中左对齐、自动适配，两种语言间保留小段间距。
- [ ] 鼠标移入：显示 **后退 15s · 播放/暂停 · 前进 15s**，以及书签和关闭按钮。
- [ ] 暂停：保留最后一句；返回 YouTube：隐藏；点击 **×**：保持关闭，直到你回到 YouTube。

配对与排查见[助手说明](scripts/desktop-captions/README.md)。退出 helper 后，需要刷新 YouTube 才恢复浏览器 PiP fallback；后者受 Chrome 权限限制，不能保证相同的跨 App 效果。

请勿把 API Key、`.env.local`、配对文件或机器专属二进制文件提交到 GitHub。

## 常用命令

```bash
npm run build             # 构建文章阅读层
npm test                  # 运行产品与单元测试
npm run typecheck         # 检查 TypeScript
npm run check             # 构建、类型检查、测试并审计发布文件
npm run package           # 生成 dist/readnote-atlas-v0.3.0.zip
npm run companion         # 启动本地知识库 companion
npm run desktop:captions   # 启动可选的 macOS 字幕 helper
```

## 开始前，你可能想问

<details>
<summary>常见问题</summary>

**为什么没有翻译？** 视频需要原生 YouTube 字幕、Supadata Key 和已配置的视频 AI provider。本版本暂不支持 Shorts、直播、私密视频和没有原生字幕的视频。

**数据在哪里？** 笔记、transcript、缓存、设置和观看进度保存在 Chrome 本地。YouTube 加载后可能自动获取字幕、预翻译和生成综述：Supadata 收到视频 URL，选用的 AI provider 收到相应文本和上下文。Local-first 不等于 AI 离线运行。

**为什么翻译有时还要等？** Atlas 会预翻译、缓存，并在跳播后优先追赶当前字幕。但新视频、未缓存的位置、服务限流或网络延迟仍可能产生等待。请检查已保存的 Key 和 provider 设置；不能承诺零延迟。

**helper 会自动启动吗？** 不会。目前源码安装不会通过 Chrome 安装或启动它。需要跨 App 字幕时运行 helper；没有出现字幕框时，检查配对、刷新 YouTube，并确保 8792 端口只运行一个 helper。

**以后怎么更新？** 在没有未提交改动的仓库中依次运行 `git pull --ff-only`、`npm install`、`npm run build`；再到 `chrome://extensions` 重新加载 Atlas，刷新网页。原生 helper 代码变化时也要重启。更新前请保留自己的本地修改。

</details>

## 为什么做 Atlas

我做 Readnote 时最在意的，不是把一篇文章翻译完，而是理解某个观点之后，能把自己的想法和来源一起留下。访谈与课程也值得拥有同样的路径，而不是再变成一堆孤立的摘要。

Atlas 把文本和视频放进同一个学习过程：英文保留细节，中文降低理解门槛，笔记让来源可以回溯。最终沉淀的应当是持续生长的个人知识，而不是翻译存档。

设计仍然遵循 Readnote 的简约语言：原始内容优先、双语对照、精确选择、个人知识归用户所有。完整交互与验收标准见 [PRODUCT.md](PRODUCT.md)，数据流向见 [PRIVACY.md](PRIVACY.md)。

## 项目来源与致谢

Readnote Atlas 是一个独立项目，建立在两个基础之上：

- [Readnote](https://github.com/pheobepotato/readnote)：由本项目作者创建，确立了原始内容优先、本地批注和 Obsidian/Notion 知识工作流；
- [YouTube Digest v1.2.0](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0)：由 **Zara Zhang** 创建，为 transcript 获取、双语视频学习、时间戳导航、解释和视频笔记提供开源基础与灵感。Atlas 视频工作流的部分代码在其 MIT License 下衍生，并进行了实质性的重新设计。

Readnote Atlas 不是 YouTube Digest 的官方版本，也不代表 Zara Zhang 的认可或背书。原始声明保留在 [LICENSE](LICENSE)，项目关系记录在 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

## 隐私与许可

完整数据流见 [PRIVACY.md](PRIVACY.md)。本项目采用 [MIT License](LICENSE) 开源。
