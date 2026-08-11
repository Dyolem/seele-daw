# @seele-daw/playback

`playback` 是浏览器无关的播放编译核心。长期会把项目快照和增量变化解释为图计划、时间线
事件和 RuntimeDelta；它描述“应该播放什么、何时播放”，但不创建 AudioContext 或
AudioNode。当前首个可听切片只输出阶段计划定义的具体播放计划。

> 当前状态：Batch 2B 已实现并等待审阅。包内已有通用 Sample Instrument schema、TempoMap 与
> 具体 MIDI Plan Compiler；尚未实现 Transport、Scheduler 或任何音频运行时。长期架构中的
> 名称 `playback-core` 对应当前包。

当前阶段实施计划见
[Audible MIDI Playback V1 第六阶段计划](./docs/audible-midi-playback-v1-phase-plan.md)。

这里的 `V1` 指第一版可听 MIDI 产品纵向切片，不是长期架构文档版本。经 2026-08-10 范围
审阅，首版只建立具体的内置 Device Definition、Track Playback Plan、MIDI Note Span、
Transport / Scheduler 规划与 generation 失效；不提前公开通用 Effect Graph、RuntimeDelta、
跨线程 ACK 或 Loop / Seek 协议。Compiler unsupported content 已在 Batch 2B 收敛；Transport
行为、资产加载与浏览器矩阵仍按阶段计划中的 Decision Gate 逐批确认。

## 当前已实现

包根继续只公开首个真实消费者需要的 Studio Grand 产品边界：

- `STUDIO_GRAND_DEVICE_DEFINITION` 固定 `typeId = seele.sample-instrument`、
  `definitionVersion = 1` 与显示名称 `Studio Grand`；
- `createStudioGrandDeviceDescriptor(deviceId)` 创建唯一的持久化 V1 形状，其中
  `opaqueState = { soundbankId: "studio-grand" }`；
- `decodeStudioGrandDeviceState(device)` 只接受该 Definition 的精确 V1 schema；未知类型、未来
  版本、Parameters 或不兼容 State 返回 `null`，调用方据此显示 Missing，同时保留原始
  Descriptor；
- Definition、factory 和 decoder 均不依赖 Vue、DOM、Web Audio、Soundbank URL 或浏览器资源。

包内同时建立了整个 MIDISampleSynth 家族共用的 V1 schema：

- `SAMPLE_INSTRUMENT_DEVICE_DEFINITION` 固定 `typeId = seele.sample-instrument` 与版本 `1`；
- `opaqueState` 只包含稳定、非空的 `soundbankId`，不包含 URL、路径或 Catalog Record；
- generic decoder 接受任意符合 schema 的 Soundbank ID，不把 `studio-grand` 当编译白名单；
- Studio Grand factory 与严格 decoder 是上述 schema 的默认产品选择和精确特化，不是单独的
  Engine 类型。

这部分仍是包内契约，因为当前跨包消费者只需要 Studio Grand factory。它只定义 Project
Instrument Fact 的播放侧身份，不代表任一 Soundbank 已经能加载或发声。

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

TempoMap 现在由具体 MIDI Compiler 消费，并把冻结的 Segment DTO 放入计划；它仍未从 package
root 导出，后续 Transport 会继续复用同一时间边界。

Batch 2B 还在包内建立了浏览器无关的具体 MIDI Compiler：

- `compileAudibleMidiProject(snapshot)` 把一次稳定 Snapshot 编译为冻结的
  `AudibleMidiProjectPlan`，包含 `modelRevision`、中性的 `arrangementEndTick`、Tempo Segments、
  Master / Track Plans、排序后的 Note Spans 和结构化 diagnostics；
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

Compiler 计划同样暂不从 package root 导出：Batch 3A Transport 是首个包内消费者，Audio Web
接入前再由真实跨包消费者验证并收敛公开表面。资源准备失败属于后续 Manifest / Audio Runtime
边界，不能倒逼 Compiler 按 Soundbank 名称静默丢弃 Track。

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
2. 已建立固定 PPQ 的内部 TempoMap 与 Tick/second 转换；按阶段计划先由具体 MIDI Compiler
   消费，再按 Gate B 实现 Transport。
3. 已编译具体 Track / MIDI Note Span 计划，并建立确定性的 NoteOccurrenceKey。
4. 实现规划层 look-ahead scheduler 和 generation 失效。
5. 支持播放中移动/删除 Note、Seek、Loop 和 Tempo change。
6. 由后续真实消费者驱动 Track/Device GraphPlan、Audio Clip、Automation、Recording
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
