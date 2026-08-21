# @seele-daw/playback

`playback` 是浏览器无关的播放编译核心。长期会把项目快照和增量变化解释为图计划、时间线
事件和 RuntimeDelta；它描述“应该播放什么、何时播放”，但不创建 AudioContext 或
AudioNode。已完成的首个可听切片只输出阶段计划定义的具体播放计划。

> 当前状态：截至 2026-08-18，Batch 4A.2、Audio Web Batch 4B.1 / Batch 4B.2、Studio Batch
> 5A、Batch 6A–6F 与 Batch 7A–7F 已通过功能审阅；Audible MIDI Playback V1 已按验收基线
> `f1d0298` 完成，尚未创建阶段 checkpoint。后续独立的 Manual Timeline Locate V1 已完成四个
> 主批次与纵向 Playhead UX 修正，并通过统一审核和用户浏览器验证；阶段 checkpoint 为
> `checkpoint/manual-timeline-locate-2026-08-18`。本包已有通用
> Sample Instrument Device schema、TempoMap、具体 MIDI Plan Compiler、Transport Mapping、
> Scheduler Planner、完整 Plan Reconciliation 与原位 Plan handoff。包根只公开 Studio 与 Audio
> Web 真实消费者所需的最小表面；浏览器 Fetch/decode/Voice 仍完全位于 Audio Web。
> 长期架构中的名称 `playback-core` 对应当前包。

已完成阶段的范围、证据和延期记录见
[Audible MIDI Playback V1 阶段计划](./docs/audible-midi-playback-v1-phase-plan.md)。
手动时间线定位的产品语义、实现边界与验收记录见
[Manual Timeline Locate V1 阶段记录](./docs/manual-timeline-locate-v1-phase-plan.md)。
Compiler、Transport 与 Scheduler 的协作和术语另见
[Audible MIDI Scheduler 工作原理](./docs/audible-midi-scheduler-primer.md)。
默认内置 MIDISampleSynth 数据的证据与兼容推断见
[默认内置 MIDISampleSynth 控制文件逆向分析](../audio-web/docs/default-built-in-midi-sample-synth-reverse-analysis.md)；
规范宿主语义见
[Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](../audio-web/docs/seele-supported-sfz-profile-v1.md)。
当前加载测量、人工试听结论与保留项见
[Studio Grand 加载测量与听觉 Gate](../audio-web/docs/studio-grand-loading-and-listening-gate.md)。

这里的 `V1` 指第一版可听 MIDI 产品纵向切片，不是长期架构文档版本。经 2026-08-10 范围
审阅，首版只建立具体的内置 Device Definition、Track Playback Plan、MIDI Note Span、
Transport / Scheduler 规划与 generation 失效；不提前公开通用 Effect Graph、RuntimeDelta、
跨线程 ACK 或 Loop / 完整 Seek 协议。Compiler unsupported content、Transport Mapping 与 Scheduler
late / drop policy、资产加载和首个浏览器听觉验收均已按阶段 Decision Gate 收敛；更广的浏览器
兼容矩阵仍属于后续专项范围。

## 当前已实现

包根只公开真实跨包消费者需要的最小播放边界：

- `compileAudibleMidiProject`、`createAudibleMidiTransport` 与
  `createAudibleMidiSchedulerPlanner` 供 Studio Composition Root 的 Playback Coordinator
  建立同一份稳定计划、Transport Mapping 与 look-ahead window；
- `AudibleMidiProjectPlan` 与 `ScheduledSampleVoicePlan` 分别供 Audio Web 收集实际需要的
  Soundbank/Pitch，以及让 Voice Runtime 执行已排程事件；
- Playback Clock parser、Plan / Transport / Scheduler outcome 与对应最小类型随真实 Studio
  消费者公开；TempoMap 实现、Compiler 内部 DTO 建造和未来写协议仍保持包内；

- `STUDIO_GRAND_DEVICE_DEFINITION` 固定 `typeId = seele.sample-instrument`、
  `definitionVersion = 1` 与显示名称 `Studio Grand`；
- `createStudioGrandDeviceDescriptor(deviceId)` 创建唯一的持久化 V1 形状，其中
  `opaqueState = { soundbankId: "studio-grand" }`；
- `decodeStudioGrandDeviceState(device)` 只接受该 Definition 的精确 V1 schema；未知类型、未来
  版本、Parameters 或不兼容 State 返回 `null`，调用方据此显示 Missing，同时保留原始
  Descriptor；
- Definition、factory 和 decoder 均不依赖 Vue、DOM、Web Audio、Soundbank URL 或浏览器资源。
- `parseSoundbankId(value)` 与 branded `SoundbankId` 供 Audio Web 的 Manifest validator 复用同一
  持久化身份约束，不公开 Catalog、路径或资源解析。

包内同时建立了整个 MIDISampleSynth 家族共用的 V1 schema：

- `SAMPLE_INSTRUMENT_DEVICE_DEFINITION` 固定 `typeId = seele.sample-instrument` 与版本 `1`；
- `opaqueState` 只包含稳定、非空的 `soundbankId`，不包含 URL、路径或 Catalog Record；
- generic decoder 接受任意符合 schema 的 Soundbank ID，不把 `studio-grand` 当编译白名单；
- Studio Grand factory 与严格 decoder 是上述 schema 的默认产品选择和精确特化，不是单独的
  Engine 类型。

generic Device Definition、factory 与 decoder 仍是包内契约；跨包只额外公开上面的
`SoundbankId` identity parser。它只定义 Project Instrument Fact 的播放侧身份，不代表任一
Soundbank 已经能加载或发声。

Batch 2A 还在包内建立了 `time/` 边界：

- `ProjectSecond`、`ProjectDurationSecond` 与 `ContinuousTickPosition` 保持不同时间含义，不把
  连续播放位置提前取整成 Project Tick；
- `createTempoMap(tempoEvents)` 复制并规范化 Project Core 的 Tempo Event，要求恰好一枚
  Tick `0` 事件并拒绝重复 Tick；
- Tempo Event 从自身 Tick 起生效，最后一段 Tempo 无限延续；
- 多段 Tick → ProjectSecond、ProjectSecond → 连续 Tick 与 Tick 区间时长使用预计算边界和
  二分查找；
- 非有限值、负数、反向区间、超出安全数值范围及无法保持单调性的结果失败关闭；
- TempoMap 不保留调用方数组或 Record，也不依赖 Snapshot、Time Signature、Transport、
  AudioContext 或浏览器。

TempoMap 现在由具体 MIDI Compiler 消费，并把冻结的 Segment DTO 放入计划；Transport 从这些
DTO 严格重建同一时间边界。两者仍未从 package root 导出。

Batch 2B 还在包内建立了浏览器无关的具体 MIDI Compiler：

- `compileAudibleMidiProject(snapshot)` 把一次稳定 Snapshot 编译为冻结的
  `AudibleMidiProjectPlan`，包含 `modelRevision`、中性的内容末端 `arrangementEndTick`、派生视图 /
  播放末端 `timelineEndTick`、Tempo Segments、Master / Track Plans、排序后的 Note Spans 和结构化
  diagnostics；
- 每个精确 V1 `seele.sample-instrument` Descriptor 都生成 `SampleInstrumentPlan(soundbankId)`；
  因此 Studio Grand 与其他 MIDISampleSynth 使用同一编译路径；
- FM / VA、空 Slot、Disabled 或没有已知 Compiler route 的 Instrument 只跳过对应 Track，
  其他有效 Track 继续；Compiler 不读取 Catalog、Indexes、Mapping、ZIP 或采样文件；
- Looped MIDI Clip 只跳过该 Clip；Disabled Effect 被忽略，Enabled Track MIDI / Audio Effect
  跳过对应 Track，Enabled Master Effect 阻止整个可执行计划；
- Clip Source Window 使用半开区间，不执行 Note Chase，并把 Note End 裁剪到 Clip End；
- occurrence key 使用 `[trackId, clipId, sourceId, noteId]` 的无歧义结构化编码；输入集合顺序不
  影响最终计划排序；
- 没有可听 Note Span 是带 diagnostic 的合法 Empty Plan，不是编译异常；伪造或引用不一致的
  Snapshot 则失败关闭。

Batch 7B 增加了共享时间轴范围派生：

- `deriveAudibleMidiTimelineRange(snapshot)` 以项目起始拍号的小节长度乘以 `150` 得到最小时间轴
  末端；内容接近或超过该范围时，先向上补齐到完整小节，再保留 `8` 个完整尾部小节；
- `contentEndTick` / `arrangementEndTick` 仍只描述全部原始 Clip 的内容范围；
  `timelineEndTick` 是完整小节对齐的派生视图 / 播放末端，同时约束 Studio Ruler / Lane 与
  Playback 自然结束；
- 该范围完全派生，不写入 Project File、不触发迁移或 dirty。没有可听 Note Span 的 Empty Plan
  即使拥有时间轴范围也仍不可播放。

Compiler 现在由 Studio 通过 package root 调用；资源准备失败仍属于 Manifest / Audio Runtime
边界，不能倒逼 Compiler 按 Soundbank 名称静默丢弃 Track。

Batch 3A 进一步建立了浏览器无关的 Transport Mapping：

- `PlaybackClockSecond` 与 `ProjectSecond` 是不同品牌；注入的 `PlaybackClock` 可以由测试虚拟
  时钟或未来 `AudioContext.currentTime` 实现，Transport 不读取 wall clock；
- `createTempoMapFromSegments()` 严格重建 Compiler 输出的序列化 Tempo Segments，并重新验证
  BPM、累计 Project time 与 Segment 顺序；
- `createAudibleMidiTransport(plan, clock)` 拥有 stopped / playing / paused、连续 Project / Tick
  位置、映射 anchors 与独立 `engineGeneration`；
- Play / Resume、Pause、整数 Tick Locate 与 Return to Last Start Position 按已确认规则更新
  generation；重复 No-change、Blocked 或 Empty Plan 的 Play 拒绝不更新；
- 每次成功 Locate 替换运行时 `returnAnchorTick`；Plan 缩短时 Position 与 Anchor 都夹取到新的
  Timeline End。Anchor 不属于 Project Fact 或持久化数据；
- Partial 与 Playable Plan 可播放；自然结束采用派生的 `timelineEndTick`，进入 Stopped、
  保留 End，下一次 Play 从 Tick `0` 开始；
- Transport 集中提供 Tick → PlaybackClockSecond 与 PlaybackClockSecond → continuous Tick
  position，并对时钟倒退、无活动映射、越界目标和未知 Plan status 失败关闭；
- 逻辑自然结束不等待 Sample release tail。真实尾音仍由后续听觉 Gate 与 Audio Runtime 决定。

Batch 3B 进一步建立了浏览器无关的 Scheduler Planner：

- `PlaybackClockDurationSecond` 区分运行时时长与 Project time；调用方显式提供 cadence 与
  horizon，且 horizon 必须大于 cadence，当前不宣称未经 benchmark 的固定默认值；
- `createAudibleMidiSchedulerPlanner(plan, configuration)` 复制并验证 Track Route、排序 Note
  Span、Tempo Segments 与 occurrence identity，不保留可变输入 Record；
- `planNextWindow(transportSnapshot)` 从同一代 Transport Anchor 推进连续半开窗口，窗口在
  Timeline End 截止；Timer 只负责未来唤醒，不属于 Planner；
- Scheduled Sample Voice 携带 generation、occurrence key、Soundbank / Device 路由、Track /
  Master Gain、Pan、Pitch、Velocity、Channel，以及目标 Start / release Clock Second；
- 首次或延迟唤醒时，Start 已迟到但 release 尚未来的 Span 立即开始并保留原 release；已经结束
  的 Span 丢弃，两种情况只输出批级有界计数；
- 新 generation 从新 Anchor 重置 cursor 与去重集合，不 chase Anchor 之前的长 Note；观察到较新
  generation 后拒绝旧 Snapshot，同一 generation 的 Mapping 变化也失败关闭；
- Planner 不创建 Cancel、`allNotesOff`、AudioContext、AudioNode 或 UI 状态，这些仍由后续
  Coordinator 与 Audio Runtime 拥有。

Transport 与 Scheduler 已由 Studio Batch 5A 的 Coordinator 消费。它们仍不知道 Vue、Timer、
AudioContext、资源 URL 或 Voice；Studio 决定当前 `25 ms` 唤醒与 `200 ms` look-ahead 产品参数，
Audio Web 只执行冻结的 Voice Plan。

Studio Batch 7C 进一步把听觉调度 cadence 与视觉采样解耦：Scheduler 的 `25 ms` Timer 只推进
look-ahead 计划；应用级视觉位置源通过 Transport / Playback Clock 读取权威 Project Second 与
continuous Tick。`requestAnimationFrame` 只决定视图何时读取，不累计 frame delta，因此后台
降频后恢复也不会形成第二套时间。该投影属于 Studio Composition / View 生命周期，不进入本包、
Project、Pinia、History、dirty 或 Commit Subscription；多个 Playhead 必须共享这一位置源。

Studio Batch 7D 已让 Arrangement 从该位置源投影不可交互 Playhead，并用 transform-only 图层
移动；分页 Follow 只滚动 Studio 的右侧时间视口。这些仍是 Studio View 行为，不扩展 Playback
Core API，也不让 Scheduler cursor 冒充 Playhead。Studio Batch 7E 让 Piano Roll 的 Track / Clip
Focus 两种模式也消费同一位置源：Track 直接投影全局 Tick，并在自身横向滚动权威上独立分页
Follow；Clip Focus 用 Arrangement `clip.startTick` 转为 Clip-local Tick，Clip 外、Viewport 外或
项目身份不匹配时不显示。Arrangement 与 Track Follow 都是 Studio 的瞬时视图状态，不向
Playback Core 添加状态或 API。

Batch 7F 只加固既有边界：自动化回归证明动画帧在浏览器后台长期不触发时不会累计第二套时间，
恢复后的首帧直接读取 Transport 最新位置；多 Track、派生 Timeline、自然结束、Pause / Return、
项目切换和资源清理继续由既有 Playback / Studio / Audio Web 测试共同覆盖。本批不改变包根 API。

Manual Timeline Locate V1 在该已验收基线之后扩展了 Transport 的最小定位表面：浏览器无关层只
接受整数 Tick、替换 Return Anchor 并使旧 generation 失效；Studio 用事务化 Locate Session
组合静默 Preview、Runtime 保留、旧 Voice 清理、Ruler Pointer / Keyboard、边缘滚动与 Follow。
这项扩展不增加 Note Chase、可听 Scrub、Loop、持久 Marker 或 Project Command。

Batch 6 进一步建立了浏览器无关的选择性 Reconciliation：

- `createAudibleMidiReconciliationPlan` 验证连续 Commit 链，并对完整新旧 Plan 输出 occurrence /
  Track 变化、失效 key、受影响 Track 与全局 reset 原因；
- Transport `handoffPlan` 保留当前位置与单调 Playback Clock anchor，在原位递增
  `engineGeneration`，不把 generation 变化等同于 `allNotesOff`；
- Note / Clip / Track / Instrument 的活动 Voice 语义由 Studio 按操作执行；Scheduler 只从新
  anchor 规划尚未越过起点的事件，不执行 Note Chase；
- Tempo、Master route、Commit gap 或不可播放目标仍明确要求全局安全兜底。Playback 不拥有
  AudioContext、Voice handle、资源准备或 UI warning。

## 长期包定位

下图描述长期方向；当前 V1 不输出 GraphPlan 或 RuntimeDelta。

```text
ProjectSnapshot + ProjectDelta
-> Playback Model
-> GraphPlan + TimelineIndex + AutomationPlan
-> RuntimeDelta(engineGeneration)
-> audio-web
```

Audio Runtime 不读取完整 ProjectModel；所有项目语义都必须先在本包编译成稳定、可序列化、可测试的计划。

## 长期主要职责

下表描述包的长期演进方向，不表示 Audible MIDI Playback V1 会一次实现所有能力。

| 领域              | 规划职责                                                  |
| ----------------- | --------------------------------------------------------- |
| PlaybackCompiler  | 全量编译与按 ProjectDelta 增量失效                        |
| TempoMap          | Tick、ProjectSecond 与播放时间的确定性转换                |
| Transport         | stopped/playing/paused/recording、anchor、loop、seek 语义 |
| TimelineIndex     | Clip 窗口、循环展开、Note/Automation 范围查询             |
| Scheduler Planner | look-ahead window、EventKey、generation、迟到恢复策略     |
| GraphPlan         | Track、Device、Mixer、Master 的逻辑拓扑                   |
| RuntimeDelta      | graph ops、timeline invalidation、parameter ops           |
| Playback Sync     | modelRevision 与 engineGeneration 的对应和 ACK 状态       |

## 长期核心契约

- `modelRevision` 表示项目提交版本，`engineGeneration` 表示运行时计划世代，二者不得混用。
- Seek、Stop、项目切换和需要重建未来事件的编辑必须增加 generation，使旧事件可被丢弃。
- 所有事件具有稳定 `EventKey`，循环展开不能重复或漏发事件。
- Loop 和时间区间统一使用半开区间 `[start, end)`。
- 播放中编辑的取消、release、重建和生效边界按操作定义，不能交给设备自行猜测。
- 具体 look-ahead 毫秒数由 benchmark 决定，不作为固定架构常量。

## 长期候选内部模块

目录只在真实批次出现消费者时建立；当前 V1 的精简目录以阶段计划为准。

```text
src/
├── compiler/       snapshot/delta -> playback plans
├── transport/      状态、锚点、loop、seek 与 generation
├── time/           TempoMap 与时间映射
├── timeline/       索引、Clip loop 与事件展开
├── scheduler/      窗口规划、EventKey 与迟到策略
├── graph/          GraphPlan、参数地址与逻辑路由
├── protocol/       RuntimeDelta 与 ScheduledRuntimeEvent DTO
└── index.ts        唯一公开入口
```

## 依赖边界

- 只依赖 [`@seele-daw/project-core`](../project-core/README.md) 的模型快照、增量和稳定类型；
  `@seele-daw/type-utils` 只提供共享的 compile-time `Brand` 类型代数。
- 禁止依赖 Vue、Pinia、DOM、Canvas、IndexedDB 或 OPFS。
- 禁止创建或暴露具体 AudioContext、AudioNode、AudioParam 实例。
- 禁止依赖 `editor`、`audio-web`、`platform-browser` 或 `apps/studio`。
- 第三方音频库不能定义项目时间、Transport、Device 身份或保存格式。

## 长期演进顺序

1. 已建立内置 Studio Grand Device Definition、Descriptor factory 与严格 decoder。
2. 已建立固定 PPQ 的内部 TempoMap、可序列化 Segment 重建与 Tick/second 转换。
3. 已编译具体 Track / MIDI Note Span 计划，并建立确定性的 NoteOccurrenceKey。
4. 已建立注入时钟的 stopped / playing / paused Transport Mapping 与 generation 失效。
5. 已建立规划层 look-ahead Scheduler、连续 cursor、occurrence 去重与 late / drop policy。
6. 已支持播放中 Note / Track / Instrument 的选择性失效；Seek、Loop 和 Tempo change 仍待后续
   产品切片。
7. 由后续真实消费者驱动 Track/Device GraphPlan、Audio Clip、Automation、Recording
   monitoring 和 frozen-revision export 计划。

## 长期测试方向

- TempoMap、Tick/second 转换和 loop 边界 property tests；
- 相同 snapshot 必须生成稳定一致的 plans；
- 全量编译与 delta 增量编译结果等价；
- scheduler 不重复、不漏发，旧 generation 事件必须失效；
- timer jitter、长任务、seek、loop 和播放中编辑的虚拟时钟测试；
- 大项目下编译时间、窗口查询和事件数量基准。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
