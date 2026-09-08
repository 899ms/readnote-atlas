# Readnote Studio

[English](README.md)

在不离开原始语境的前提下阅读英文。Readnote Studio 是一个 local-first 的 Chrome 扩展，把英文文章和 YouTube 视频变成双语阅读界面，再把真正值得保留的内容沉淀到你自己的 Obsidian 或 Notion 知识库。

## 产品理念

翻译只是阅读辅助，不是终点。原网页和原视频始终是主要阅读界面。Readnote Studio 的完整路径是：

1. 留在原始内容中阅读；
2. 只在有助于理解时加入中文；
3. 连同上下文、时间戳和来源保存重点段落；
4. 将内容沉淀到用户自己控制的知识库。

项目融合了 [Readnote](https://github.com/pheobepotato/readnote) 的 local-first 知识沉淀方式，以及 [YouTube Digest](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0) 的字幕、双语翻译、概览和时间戳导航能力。

## 已实现能力

### 文章

- 在原网页中渐进翻译可阅读的英文段落；
- 选中文字后高亮、下划线、写批注或保存摘录；
- 再次打开同一 URL 时恢复标注；
- 将摘录追加到一个 Obsidian Markdown 笔记，并可选同步到 Notion。

### YouTube 视频

- 在播放器画面内直接显示英文与简体中文字幕；
- 播放器内切换 `中英`、`EN` 和 `关闭`；
- 在 Chrome 侧边栏阅读完整的带时间戳 transcript；
- 搜索 transcript，并在所有匹配项之间移动；
- 点击 transcript、章节、重点引用或笔记跳转到对应时间；
- 选择 transcript 段落后进行解释，或保存为带时间戳的笔记；
- 按需生成覆盖完整视频的章节概览与重点引用；
- 笔记先保存在本地，再自动同步到 Obsidian 和/或 Notion，并显示同步状态。

## 本地安装与开发

需要 Chrome 116+、Node.js 20+、用于获取 YouTube transcript 的 Supadata Key，以及用于视频翻译和 AI 功能的 DeepSeek Key。

```bash
npm install
npm run build
npm test
npm run check
```

然后打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择当前项目文件夹。进入扩展的 Settings 页面，由你自己填写 Supadata 和 DeepSeek Key。不要把 Key 放进源代码、GitHub、截图或聊天。

## 个人知识库

启动本地 companion：

```bash
npm run companion
```

打开 `http://127.0.0.1:8791/setup`，配置：

- 一个 Obsidian Markdown 笔记的绝对路径；
- 可选的 Notion integration token 和目标 page id；
- 用于文章翻译的服务与 API Key。

Companion 将敏感配置写入已被 Git 忽略的 `.env.local`。文章摘录与视频时间戳笔记使用同一套来源结构，因此知识库是一条连续的阅读记录，而不是零散的导出文件。

## 数据流向

- 文章标注、翻译缓存、视频 transcript、笔记和摘要缓存在 Chrome 本地；
- 文章翻译和知识库同步请求只发送到 `127.0.0.1:8791` 的本地 companion；
- Companion 只写入你配置的 Markdown 文件和 Notion 页面；
- 获取视频 transcript 时，Supadata 只收到标准化后的 YouTube URL；
- DeepSeek 只收到当前视频功能所需的 transcript 内容；
- 没有 Readnote Studio 账号、分析 SDK、广告或开发者运营的云端服务。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 当前边界

- 暂不支持 Shorts、直播、私密视频以及没有原生字幕的视频；
- 播放器字幕会在侧边栏完成 transcript 获取和缓存后开始工作；
- 视频能力当前使用 Supadata 和 DeepSeek；文章翻译可通过 companion 使用 DeepSeek、OpenAI 或 MiniMax；
- 第一版仅支持 Chrome。

## License 与致谢

MIT。视频工作流的大量基础代码来自 Zara Zhang 的 YouTube Digest，版权声明保留在 [LICENSE](LICENSE) 中。
