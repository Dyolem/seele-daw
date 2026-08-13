# @seele-daw/audio-web

`audio-web` 是 Playback Core 的 Web Audio 执行后端。长期会把浏览器无关的 RuntimeDelta、
GraphPlan 和调度事件映射为 AudioContext、AudioNode、AudioParam 与 AudioWorklet 资源；
当前首个可听切片先建立通用 MIDISampleSynth Sample Voice，并以 Studio Grand 完成首次产品
听觉验收。

> 当前状态：Batch 4A.2、Batch 4B.1、Batch 4B.2 与 Studio Batch 5A 已通过功能审阅；进一步优化
> 留待后续讨论。当前已有用户激活的 AudioContext、最小 master output、Manifest 驱动的
> Sample Voice、Note Off / loop / mutex、generation 与资源统计；Studio 通过公开 API 组合资源
> 准备和 Voice 执行，但 SFZ 文本 parser 与通用 Scheduler Executor 仍未实现。

当前可听 MIDI 阶段见
[Audible MIDI Playback V1 第六阶段计划](../playback/docs/audible-midi-playback-v1-phase-plan.md)。
这里的 `V1` 指第一版可听产品纵向切片，不是架构文档版本。该切片使用主线程原生 Web Audio
节点执行 Manifest 驱动的 MIDISampleSynth Voice Plan；Studio Grand 是默认音源和首个验收
资产，不是 Runtime 白名单。通用 Graph Reconciler、RuntimeDelta、AudioWorklet 和跨线程
generation ACK 均延后。当前采样只作为不可分发的本地验证输入，不再阻塞本地 Runtime 开发；
规范化 Manifest、加载预算和浏览器矩阵仍须按阶段计划逐批审阅。任何把采样随构建公开交付的
方案仍必须先解决替代资产或再分发权限。

本地资产的来源链、指纹和分发边界见
[Studio Grand 本地验证资产记录](./docs/studio-grand-local-validation-assets.md)，其中同时记录
4A.1b 的生成命令、ZIP 安全预算和本地输出结果。
加载成本、浏览器测量、人工试听结论与保留项见
[Studio Grand 加载测量与听觉 Gate](./docs/studio-grand-loading-and-listening-gate.md)。
默认内置音源数据的字段、Archive 与行为证据见
[默认内置 MIDISampleSynth 控制文件逆向分析](./docs/default-built-in-midi-sample-synth-reverse-analysis.md)；
Seele 自身的规范语义见
[Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](./docs/seele-supported-sfz-profile-v1.md)。

Batch 4B.1 的生产资源准备边界保持在包内：

- 只消费 Playback 公开的 `AudibleMidiProjectPlan`，不读取 Project Model；
- 按 Soundbank 聚合整份稳定 Plan 的唯一 Pitch，经严格 Manifest 选择实际 resource key；
- 同源 asset base 由 Composition Root 注入，逻辑 POSIX key 在 HTTP 边界逐段编码；
- Manifest 与 WAV 都受调用方 byte budget 约束；WAV 在 `decodeAudioData` 前再次验证容器；
- 同一资源的并发 Fetch/decode 共享；单个等待者取消不误伤其他等待者，最后一个离开才取消底层
  请求；失败请求不会永久污染缓存；
- 成功 Manifest 与 AudioBuffer 由应用生命周期缓存拥有；准备结果为冻结数组，Project Runtime
  dispose 不会误释放共享 AudioBuffer；应用 dispose 会中止 pending 请求并清空引用；
- 本批只支持同源、可寻址 Manifest/WAV 首验，不扫描 Catalog，不加载整棵 Soundbank，也不创建
  AudioNode 或控制 Transport。

Batch 4B.2 在同一包内增加执行边界：

- `context/audio-context-runtime.ts` 只在显式 `activate()` 时创建 / resume AudioContext，并拥有单一
  master Gain；构造 Runtime 不触发浏览器音频设备生命周期；
- Voice 直接消费 Playback 公开的 `ScheduledSampleVoicePlan` 和 4B.1 已准备资源，不读取 Project
  Model、Catalog、Mapping、URL 或 Transport；
- Zone selector、root pitch / tune、offset、velocity、Track / Master Gain、Pan、attack / release、
  no-loop / continuous / sustain loop、one-shot 与 directed exclusive group 均执行 Manifest 的显式
  含义；Studio Grand 仍不是 Runtime 白名单；
- `curve: null` 与 `0` 使用 linear amplitude。非零 shape 用 Seele V1 的归一化指数形状并以分段
  `linearRampToValueAtTime` 排程，shape 在运行时钳制到 `[-10, 10]` 以保持数值稳定；该函数是
  Seele Manifest 执行定义，不声称复刻任一来源私有播放器；
- Velocity V1 使用 `velocity / 127`，再乘 Track Gain；Master Gain 由唯一 master node 应用，Pan
  使用 `StereoPannerNode`。缺少 StereoPanner 时只允许中心声像降级为 Gain pass-through，非中心
  Pan 明确失败；
- 普通 gated Note Off 使用 Zone release；one-shot 忽略普通 Span End 并自然结束；cancel、Stop、
  generation 切换和 `allNotesOff` 使用 `6 ms` linear fast release，避免硬切 click；
- continuous loop 在 release 阶段继续循环；sustain loop 在 Note Off 停止循环，并从当时 source
  位置启动无 loop tail；无 loop Sample 若早于 Note 结束则自然耗尽，不猜测循环点；
- Voice Token 是 `(engineGeneration, occurrenceKey)`；旧 generation 计划丢弃，同一代重复 token
  拒绝。source、gain、output 与 `ended` listener 都计数，并在自然结束、失败、dispose 后归零；
- 本批不拥有 Timer，不接 Scheduler wake-up、Workbench 或 Transport UI；这些属于 Batch 5A 的
  Composition Root 闭环。

Batch 5A 没有把 Studio 职责下沉进本包，而是公开已有真实边界：

- `WebAudioContextRuntime` 仍在首个 Play 手势内才创建 / resume Context；
- `SampleInstrumentResourceCache`、`prepareAudibleMidiSampleResources` 与
  `SampleInstrumentVoiceRuntime` 由 Studio Composition Root 串接；
- Studio 注入同源 Soundbank asset base、byte budget 与生命周期，Audio Web 不读取 Router、Vue、
  Project Model 或本地 Catalog；
- Playback Scheduler 仍在浏览器无关包内规划；Studio 的 25 ms Timer 只唤醒规划并把冻结 Voice
  Plan 交给本包执行，因此这里没有新增第二套时间权威。

当前 Sample Instrument 已形成三组不同变化原因，因此按职责分层；其中较短的文件名是这个模块
在语义仍然明确时的局部选择，不构成禁止文件名重复目录上下文的全局规则：

```text
src/sample-instrument/
├── contract/  Manifest、Supported SFZ Profile、resource key 与 WAV 边界
├── assets/    默认内置 Mapping Adapter 与受限 ZIP 输入
├── loading/   Zone 选择、测量、资源缓存与 Playback Plan 资源准备
└── voice/     包络曲线与一次性 Sample Voice 生命周期
```

`development/sample-instrument-audition.ts` 仍保留领域限定词，因为其父目录只有
`development` 上下文；包外开发入口也保持不变。测试目录镜像上述职责，但共享 fixture 继续放在
`__tests__/support`，不为单个文件建立额外层级。

## 长期包定位

下图描述长期方向；当前 V1 不包含 AudioWorklet 路径。

```text
@seele-daw/playback plans
-> Web Audio graph reconciler
-> main-thread scheduled native nodes
-> AudioWorklet event queue / DSP
-> audio output and runtime diagnostics
```

本包是可丢弃、可重建的运行时，不是项目事实源。它执行已编译计划，不读取 ProjectModel，也不解释 Editor Command。

## 长期主要职责

| 领域               | 规划职责                                                  |
| ------------------ | --------------------------------------------------------- |
| AudioContext       | 用户手势解锁、suspend/resume、latency 与设备生命周期      |
| Graph Runtime      | create/connect/ramp/bypass/reconnect/dispose              |
| Scheduler Executor | 提前调用 native node start/stop/automation                |
| Worklet Runtime    | Synth、Sampler、Meter、PCM Capture 与目标 frame 队列      |
| Device Runtime     | Instrument/Effect adapter、latency、tail、allNotesOff     |
| Voice Lifecycle    | 一次性 source、voice token、release、steal 和资源回收     |
| Diagnostics        | late event、underrun、queue depth、active voice/node 计数 |
| Offline Backend    | 后续阶段的冻结版本离线渲染和设备能力检查                  |

## 两级调度中的职责

规划层属于 [`@seele-daw/playback`](../playback/README.md)；本包实现执行层：

- 原生 AudioBufferSource/Oscillator/AudioParam 在主线程按 `AudioContext.currentTime` 提前排程；
- 自定义 Synth、Sampler、DSP 接收带 `targetFrame` 的批量 Worklet 事件；
- MessagePort 是正确性基线，SharedArrayBuffer 仅是 cross-origin isolated 环境下的优化；
- 两条执行路径共用 `engineGeneration`、`EventKey` 和测试向量；
- 收到旧 generation 的事件必须丢弃，迟到和溢出必须可观测。

## 长期候选内部模块

目录只在真实消费者出现时建立；Audible MIDI Playback V1 的精简目录以阶段计划为准。

```text
src/
├── context/        AudioContext、设备与生命周期
├── graph/          节点运行时和 Graph Reconciler
├── scheduler/      native node 与 Worklet 执行适配
├── devices/        instrument/effect runtime adapters
├── voices/         source、voice token 与 allNotesOff
├── worklets/       processor、协议与 bundle entry
├── recording/      后续 PCM capture runtime
├── offline/        后续离线渲染 backend
└── index.ts        主线程唯一公开入口
```

Worklet entry 必须保持独立，只导入实时安全的协议和 DSP 代码，不能通过根入口把应用层打入 Worklet bundle。

## 实时与资源规则

- AudioWorklet `process()` 禁止 DOM、Vue、IndexedDB、网络、JSON parse 和项目对象。
- 热路径使用预分配缓冲和有界队列，明确 overflow、late event 和 underrun 策略。
- Meter 可降采样和丢帧；Note、Transport 和录音 PCM 不得静默丢失。
- AudioBufferSourceNode 是一次性 Voice，不属于长生命周期 Graph。
- 参数更新优先短 ramp，替换节点使用安全边界或短交叉淡化，避免 click。
- 所有 listener、timer、MessagePort、AudioNode 和 voice 都必须可幂等 `dispose()`。
- 项目切换或关闭 AudioContext 前执行全局 `allNotesOff` 并核对资源计数归零。

## 依赖边界

- 只依赖 `@seele-daw/playback` 的公开计划和协议。
- 禁止依赖 `editor`、Vue、Pinia、项目持久化实现或 `apps/studio`。
- 禁止读取完整 ProjectModel；需要的全部语义由 Playback plans 提供。
- Tone.js 只能作为原型或叶子 Device Adapter，不能成为 Transport、Graph 或项目格式。
- 浏览器存储、文件和权限实现属于 `platform-browser`，由 Studio 组合根协作装配。

## 长期演进顺序

1. 已审阅 Batch 4B.1 资源准备层并确认加载策略。
2. 已审阅 Batch 4B.2 的 Sample Voice、最小 master output、包络 / loop / mutex 与资源统计。
3. 在 Studio Composition Root 实现 look-ahead native executor、可靠 `allNotesOff` 和 late-event
   诊断，形成首次可听闭环。
4. 增加稳定 Graph Runtime、Gain/Pan/Meter 和 Device contract suite。
5. 实现 Audio Clip voice 与 Worklet 消息协议；FM / VA Synth 按独立产品切片选择执行技术。
6. 后续加入 PCM recording、复杂 DSP/WASM 和 OfflineAudioContext 导出。

## 长期测试方向

- 使用 fake clock/backend 验证节点开始、停止、取消和 generation；
- Graph reconcile 前后连接、参数和 dispose 状态一致；
- Worklet 协议版本、队列 overflow 和 MessagePort fallback；
- seek、stop、项目关闭后无残留 voice、node、listener 或 timer；
- Offline 与 realtime backend 的事件语义一致；
- 浏览器 E2E 验证 AudioContext interruption、设备切换和实际输出。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
