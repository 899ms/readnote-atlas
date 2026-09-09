# Readnote Studio 实时双语字幕架构研究

> 研究范围：预录制 YouTube 视频的“边播放边显示双语字幕”，以及没有现成字幕时的流式语音识别降级路径。资料只采用官方规范、官方产品文档和项目自身源码。

## 结论

Readnote Studio 的主路径不应被设计成传统“实时语音识别”：YouTube 视频通常已有完整、带时间戳的字幕，因此产品应先取得整条字幕时间轴，再让翻译持续跑在播放头前面。核心是一个可抢占的优先级调度器，而不是更频繁地轮询播放器。

推荐的数据流：

```text
完整带时间戳字幕
        ↓
规范化、稳定分段、建立时间索引
        ↓
时间轴控制器（currentTime / cuechange / seeked / ratechange）
        ↓
┌──────────────┬──────────────────┬────────────────────┐
│ P0 当前字幕  │ P1 热窗口 0–30s │ P2 温窗口 30–180s │
│ 单条快车道   │ 小批量、并行     │ 较大批量、后台填充  │
└──────────────┴──────────────────┴────────────────────┘
        ↓
逐段持久缓存（video + track + segment + target + model/prompt version）
        ↓
只提交当前 generation 的结果到字幕 UI
```

这能同时解决两个关键场景：顺序播放时，中文字幕提前准备好；用户从视频中段开始或跳播时，旧窗口立即让路，当前时间附近成为新的最高优先级窗口。

## 1. 播放同步：事件驱动，不靠高频轮询

HTML 标准明确指出，`timeupdate` 受频率限制，通常不快于约 66 Hz、也不慢于 4 Hz；标准还明确建议对 timed metadata 使用 `cuechange`，因为 `timeupdate` 会做无效工作并引入更高延迟。播放器完成跳转时会触发 `seeked`；播放速度变化触发 `ratechange`。因此：

- 若页面暴露 `TextTrack`，优先监听 `cuechange` / `activeCues` 更新字幕；
- 否则监听原生 `<video>` 的 `timeupdate` 作为兼容路径；
- `seeking` 只标记切换开始，`seeked` 才重建预取窗口；
- `ratechange` 重新计算需要提前准备的秒数；
- `requestVideoFrameCallback()` 可用于需要逐帧对齐的显示层，它提供该帧的媒体时间戳，但不应该用来触发网络翻译请求。

依据：[WHATWG HTML media/text-track 标准](https://html.spec.whatwg.org/multipage/media.html)、[WICG requestVideoFrameCallback 规范](https://wicg.github.io/video-rvfc/)。

YouTube IFrame API 提供 `getCurrentTime()`、`seekTo()` 和播放状态事件，但没有公开的“字幕 cue 改变”事件。因此在 YouTube watch 页的扩展中，应以页面原生 `<video>` / 可获得的时间字幕轨为同步源，而不是期待 IFrame API 给出字幕流。[YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)。

## 2. 调度器：快车道与预翻译必须并存

### P0：当前字幕快车道

- 当前 segment 未命中缓存时，立即发单条、短输出、禁用思考的翻译请求。
- P0 有独立并发槽，不能排在长批次后面。
- 当前 segment 变化时，不要因为旧 P0 仍在进行就阻塞新的 P0。

### P1：热窗口

- 始终覆盖播放头之后至少 30 秒，按 4–8 个 segment 的小批量并行翻译。
- 窗口应按“秒”而非固定“条数”计算，因为 caption cue 的时长与字数高度不均匀。
- 实际下限应动态取 `max(30s, p95_翻译延迟 × playbackRate + 安全余量)`。例如接口 p95 为 10 秒、播放速度为 2×，至少需要超过 20 秒的可用缓冲。

### P2：温窗口

- 在 P0/P1 有余量时，继续填充后续约 3 分钟。
- 用较大批次摊薄网络往返，但要保留一个并发槽给 P0。
- 用户暂停时可扩大窗口；播放恢复时先检查热窗口是否完整。

### P3：剩余视频

- 仅在浏览器/配额允许时低优先级补齐；不是保证实时体验的必要条件。

批量翻译本身是成熟文本翻译 API 的常规能力。例如 Azure Translator 单次请求支持最多 25 个文本项、总计 5,000 字符，并按输入顺序返回结果；Google Cloud Translation 的 `contents[]` 也支持一次发送多个字符串。因此“当前单条 + 后续多条批次”比每条字幕单独排队更合适。[Azure Translator REST API](https://learn.microsoft.com/en-us/rest/api/translator/translator/translate?view=rest-translator-v3.0)、[Google Cloud Translation `translateText`](https://cloud.google.com/translate/docs/reference/rest/v3/projects/translateText)。

## 3. 跳播与从中段开始：generation/epoch 是必要状态

每次以下事件都递增 `timelineGeneration`：

- `seeked`；
- YouTube SPA 切换到新 `videoId`；
- 字幕轨/源语言改变；
- 翻译目标、模型或 prompt 版本改变。

请求携带 `{generation, videoId, segmentIds}`。跳播后：

1. 用时间索引二分查找新 `currentTime` 对应 segment；
2. 取消旧 generation 的未开始任务与网络请求；
3. 立即启动新位置的 P0；
4. 并行启动新位置之后的 P1；
5. 已完成的旧结果仍保留在缓存中，但 UI 只接收当前 generation 的响应。

`AbortController` 是网络取消的标准机制，但 DOM 标准也说明，观察方可以忽略 abort（例如操作已经完成）。因此不能只依赖 `abort()`；generation 校验是防止旧结果覆盖当前字幕的最终保险。[WHATWG DOM AbortController 标准](https://dom.spec.whatwg.org/#aborting-ongoing-activities)。

时间索引建议用按 `startTime` 排序的数组 + 二分查找，跳到任意中段是 `O(log n)`，不需要从视频开头扫描或等待此前字幕翻译完成。

## 4. DeepSeek：当前“正在生成中文”现象的直接成因

DeepSeek 官方 FAQ 说明，非流式 API 默认要等整段生成完成后才返回；官方建议启用 streaming 来改善交互性。官方还说明，请求排队时非流式连接会不断返回空行、流式连接会返回 SSE keep-alive，直到真正开始推理。[DeepSeek FAQ](https://api-docs.deepseek.com/faq)、[DeepSeek Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)。

这带来两个实现要求：

- 不应把空行/keep-alive 当作“翻译正在有效推进”；超时应基于“收到实际内容 token”或总墙钟时间。
- 批量请求应使用 `stream: true`，以 SSE 接收内容；对于多条字幕，可要求每条输出一条独立记录，并在一条记录完整后立刻写缓存，而不是等待整个批次完成后一次性显示。

DeepSeek Chat Completions 官方文档还特别警告：JSON Output 模式下，如果 prompt 没有明确要求 JSON，模型可能持续输出空白直到 token 上限，表现为长时间卡住。即使已有 JSON 指令，实时字幕快车道仍应避免不必要的复杂 JSON 格式，单条翻译直接返回纯文本更稳。[DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)。

DeepSeek 当前 `deepseek-v4-flash` 的官方账户级并发上限远高于扩展目前的 2 个本地请求槽，因此合理保留 1 个 P0 槽并让 1–2 个预取批次并行，不会天然触碰官方并发限制；仍需处理 429 并指数退避。[DeepSeek Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)。

如果实时体验是最高优先级，产品层应允许把“字幕直译”切到专用机器翻译 API，把 DeepSeek 保留给 Overview、解释和笔记润色。专用翻译 API 原生支持批量文本和确定的逐项映射，降低了 LLM 排队、格式解析和长输出的不确定性。

## 5. 缓存：逐段写入，避免整对象读改写竞争

缓存键建议：

```text
sha256(videoId | captionTrackId/sourceLanguage | startMs | endMs |
       normalizedSourceText | targetLanguage | provider/model | promptVersion)
```

内存 LRU 用于当前标签页的低延迟命中；`chrome.storage.local` / IndexedDB 用于跨页面、跨 service-worker 生命周期复用。Chrome 官方说明 Manifest V3 service worker 是短生命周期环境，会反复终止，因此不能把关键队列和缓存只放在全局变量；官方建议用 `chrome.storage` 持久化。[Chrome extension service-worker events](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)、[`chrome.storage` API](https://developer.chrome.com/docs/extensions/reference/api/storage)。

应逐 segment 原子写入，或通过单写入队列合并更新。多个并发请求若各自“读取整个 cache object → 修改 → 写回整个 object”，后返回的旧快照可能覆盖先完成的新翻译。

DeepSeek 的服务端上下文缓存按相同输入前缀自动命中，并且官方称缓存可降低首 token 延迟。因此所有翻译请求应把稳定 system prompt 放在最前，视频上下文与待翻译 segment 放在后面；不要在稳定前缀中插入时间戳或随机值。[DeepSeek Context Caching](https://api-docs.deepseek.com/guides/kv_cache/)。

## 6. 分段与显示：翻译单元和排版单元分离

字幕源 segment 可按自然停顿、说话人变化、标点和最大时长合并，以给翻译足够上下文；但 UI 不应把服务端的固定换行直接当成最终布局。WebVTT 标准将 cue box 的 `size`、`position`、`line` 与 `align` 分开定义，并明确文本会在 cue box 的可用宽度内自动换行。因此尺寸调整时应由 CSS/布局引擎重新排版，实现“两行可变一行”，而不是保存硬换行。[W3C WebVTT](https://www.w3.org/TR/webvtt1/)。

可采用成熟字幕排版约束作为默认值：Netflix 官方简体中文指南要求通常单行、最多两行、每行 16 个汉字（必要时可到 18），成人内容最高约 9 字/秒；英文指南为每行 42 字符。这些是交付规范而非浏览器硬限制，但适合作为分段/显示质量检查的上限。[Netflix 简体中文字幕指南](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide)、[Netflix 英文字幕指南](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)。

推荐将“语义翻译单元”与“当前 cue 显示单元”分开：可以把相邻几条 cue 一起发给翻译服务获得上下文，但返回结果必须按稳定 segment ID 对齐；显示时仍按时间轴的当前 cue 切换，并让英文、中文分别自然换行。

## 7. 没有现成字幕时的降级路径

只有在无法取得完整 YouTube 字幕时，才需要真正的流式 ASR：音频以小块持续送入识别服务，UI 显示 interim result，并在 final result 后固化。AWS 官方建议音频块保持 50–200 ms，并提供 partial-result stabilization；高稳定度会更快但可能略降准确率。Google STT 同样提供 `isFinal` 与 `stability`，区分仍可能变化的 interim 结果和最终结果。[Amazon Transcribe streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)、[Amazon partial-result stabilization](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.html)、[Google StreamingRecognitionResult](https://cloud.google.com/speech-to-text/docs/reference/rest/v2/StreamingRecognitionResult)。

在此模式下，应只翻译“已经稳定的前缀”，不稳定尾部可用弱化样式显示，避免每个 interim hypothesis 都触发整句重翻译。AWS 官方也明确建议区分 stable / unstable token，以减少字幕突跳。

## 8. YouTube 字幕获取边界

YouTube 官方 Data API 的 `captions.download` 支持 `tlang` 自动翻译，但官方文档明确要求调用者具有编辑该视频的权限，因此不能作为任意公开视频的通用字幕来源。[YouTube `captions.download`](https://developers.google.com/youtube/v3/docs/captions/download)。

所以当前产品合理的主路径仍是：通过已配置的 transcript provider 获取完整带时间戳字幕，或在技术上可用时读取页面已加载的字幕轨；不能依赖官方 Data API 为所有公开视频直接下载/翻译字幕。

## 9. 建议的验收指标

- `subtitle_miss_rate`：当前 cue 出现时中文仍未准备好的比例，目标 < 1%。
- `seek_recovery_p95`：跳播后当前中文可用的 p95 时间，目标 < 1.5 秒；缓存命中应接近即时。
- `ready_lead_seconds_p10`：未来已翻译字幕领先播放头的秒数，第 10 百分位仍应 ≥ 30 秒。
- `stale_commit_count`：旧 generation 结果写入当前 UI 的次数，必须为 0。
- `translation_latency_p50/p95`：分别记录 P0 单条和 P1/P2 批次，不把 keep-alive 算作内容进展。
- `cache_hit_rate`：逐视频、逐模型版本统计，以验证预取和跨会话缓存是否有效。

这些指标比“同时有多少请求”更接近用户感知；尤其 `subtitle_miss_rate` 与 `seek_recovery_p95` 应作为实时字幕功能的发布门槛。

## 本轮实现状态

- 已实现 P0 当前句独立快车道，并通过 DeepSeek SSE 将生成中的中文增量送到字幕层。
- 已实现 P1/P2 前向 180 秒窗口：每批 6 段、最多 3 个后台批次并行，完成后持续补水。
- 已实现 seek generation；跳转后旧请求仍可写缓存，但旧的增量结果不会更新当前画面。
- 已实现逐视频串行合并缓存写入，避免并发批次最后写入覆盖彼此。
- 当前 Chrome 环境未暴露内置 `Translator` API，因此本地 NMT provisional 路径保留为后续可选增强，当前版本不依赖它。
