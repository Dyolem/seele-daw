# Audible MIDI Playback V1 第六阶段计划

> Status: Batch 3B Scheduler Planner implemented and validated; awaiting review before Batch 4A
>
> Date: 2026-08-10
>
> Last updated: 2026-08-12
>
> Prerequisite checkpoint: `checkpoint/piano-roll-note-editing-2026-08-10`

本文中的 `V1` 指 **Audible MIDI Playback 的第一版产品纵向切片**，不是长期架构文档的
旧版本。长期架构仍以 `web-daw-long-term-architecture-v3.md` 为基线；本文只把当前阶段需要
落地和继续确认的细节收敛成可执行边界。

## 阶段目标

第六阶段把已经完成的 MIDI 编辑闭环推进为第一条真正可听见的产品纵向切片：

```text
创建默认 Studio Grand Instrument Track
-> 创建 MIDI Clip 与 Note
-> 使用经审阅确认的基础 Transport
-> 听见按项目时间调度的采样钢琴
-> 播放中编辑能够使旧事件安全失效
-> Save / Reload 后保留所选 Instrument
```

本阶段不是提前建设完整音频平台。每个新协议都必须直接服务上述流程，并继续遵守：

- Project Core 是创作事实的唯一写入者；
- `@seele-daw/playback` 只描述播放语义、时间和计划，不创建浏览器音频资源；
- `@seele-daw/audio-web` 执行计划，但不读取完整 Project Model；
- Studio 是唯一 Composition Root，负责组合 Project、Playback、Audio 和 UI 生命周期；
- 播放失败不能回滚已经合法提交的 Project Fact；
- Transport、Playhead、AudioBuffer、Voice 和 Scheduler 都不是 Project Fact。

本阶段采用当前消费者所需的具体 Track / Note Span / Scheduler 计划，不借首条可听切片提前
建立通用 Effect Graph、RuntimeDelta、跨线程 ACK 或完整 Device Platform。Transport 与
unsupported content 行为已经按批次确认；资产加载和真实声音策略仍通过下文 Decision Gate
单独确认。

阶段完成时，当前最小 MIDI 工作流应第一次满足架构总纲中的“写 Note 后能够播放”。

## 1. 已确认边界与 Decision Gate

### 1.1 Instrument Track 默认声音

以下规则已经确认：

- 新建 Instrument Track 时默认持久化选择内置 `Studio Grand`；
- `Studio Grand` 是 Sample Instrument，不是 Basic Synth，也不是运行时隐式 fallback；
- 当前项目中的旧 `seele.instrument-slot` 继续表示“尚未选择声音”，不得在打开或播放时静默
  变成钢琴；
- 旧空 Slot 在 Track Inspector 中显示明确的空状态，并提供 `Use Studio Grand` 操作；
- 用户执行该操作后才形成 Project Command、dirty、Undo / Redo 和持久化事实；
- Undo 必须恢复为空 Slot，Redo 必须恢复 Studio Grand。

以上产品事实与迁移方式已经确认。Gate A 随 Batch 1A 启动进一步确认了第 2 节的具体
`typeId`、Descriptor schema 与 Replace Command；浏览器无关 decoder 和 Studio UI 已在
Batch 1B 落地，Audio Runtime 仍属于后续批次。

### 1.2 已存在的架构与模型不变量

以下规则不是本阶段新猜测的产品细节，而是现有架构和 MIDI Project Model 已经确定的边界：

- 找不到已保存的 Device Definition 或 Soundbank 时保留原始 Descriptor，显示 Missing
  Instrument，不得用 Oscillator 或其他 Soundbank 偷偷替代；
- Project Core 不验证浏览器能否找到某个 Soundbank，未知 Device / State 仍可 round-trip；
- 同一 Instrument Track 上重叠的非循环 MIDI Clip 同时产生有效事件；
- Note 超过 Clip 右边界时在边界触发 Note Off；
- 从已开始的长 Note 中间进入播放窗口时不执行 Note Chase；
- 同 Pitch Note 可以重叠，运行时不能只用 `channel + pitch` 作为 Voice 身份；
- `modelRevision`、`engineGeneration` 与持久化 sequence 保持分离；
- Save / Checkpoint 不产生 Project Commit，播放失败不回滚 Project Commit。

### 1.3 本轮已接受的阶段裁剪

- V1 编译具体的 Track Playback Plan 与 MIDI Note Span，不建立通用 Effect Graph 或任意
  Device Graph；
- V1 不建立 AudioWorklet、SharedArrayBuffer 或跨线程 generation ACK；Studio Grand 的当前
  候选是主线程 Web Audio 原生节点，但仍须在 Gate C 听觉审阅，且不约束未来 FM / VA 引擎；
- 播放中相关 Commit 首先采用 generation 失效、取消未来事件、`allNotesOff` 与完整 Snapshot
  重建，不在首版实现 Track / Range / Voice 级增量优化；
- 两个编辑表面的 Playhead 作为独立可选批次，不阻塞首次可听闭环；
- 内置采样的来源与分发权限、规范化 Manifest、首播加载预算和浏览器验收范围是进入 Audio
  Runtime 前的明确门槛。
- Compiler 支持整个 `MIDISampleSynth` 家族：每个符合 V1 schema 的
  `seele.sample-instrument` 都按其 `soundbankId` 生成 Sample Instrument Plan，不把 Studio
  Grand 名称作为白名单；Studio Grand 仍只是新 Track 默认音源与首个 Audio Runtime 验收资产。
- 完整资源集合中的 `FMSynth` 与 `VASynth` 需要各自的 Device / Compiler / Runtime 产品切片，
  不能伪装成 Sample Instrument，也不在本阶段决定使用 Web Audio 原生节点、AudioWorklet
  还是 WASM。
- Catalog、Indexes 与各 Soundbank Mapping 已迁入 Studio 的本地忽略资源树，供后续开发期
  规范化工具使用；远程 URL、绝对路径和未经审阅的上游 schema 仍不能成为生产运行时或构建的
  隐式依赖。

### 1.4 尚待逐批确认的 Decision Gate

Gate A 已于 2026-08-11 关闭：Studio Grand 的 Device Definition 与 Project Core Replace
Command 形状按第 2 节确认。Gate B 中与 Compiler unsupported content 有关的规则已随 Batch
2B 关闭，Transport Mapping 规则已在 Batch 3A 开始前确认；以下 Runtime Gate 与 Gate C 内容
仍不得因为出现在计划中就当作已批准产品行为：

1. Runtime 加载失败、部分 Sample Zone 缺失时，Transport 与 UI 如何反馈；
2. 首次 Play 是预载全项目所需 Zone，还是只预载初始窗口并继续后台加载；
3. Audible V1 的浏览器验收是 capability-based Chrome-first，还是同时要求多浏览器矩阵；
4. Sample 短于 Note 时是否自然结束，Sample 长于 Note 时采用何种 Note Off、包络和尾音策略；
5. Studio Grand V1 要实现到何种钢琴发声真实性，包括力度音色、制音、共鸣、踏板和 release
   行为，哪些明确延期；
6. Catalog / Indexes / Mapping 的哪些字段进入 Seele 自有 Manifest，以及如何记录来源、单位、
   校验和和授权证据。

每个 Gate 必须在其首个生产批次开始前确认，并把结果写回本文。

### 1.5 Batch 2B 已关闭的 Compiler Gate

以下规则已经确认并由 Compiler 实现：

- 所有符合 V1 schema 的 `seele.sample-instrument` 都编译为
  `SampleInstrumentPlan(soundbankId)`，与具体 Soundbank 名称无关；
- `FMSynth`、`VASynth`、空 Slot、Disabled 或没有已知 Compiler route 的 Instrument 只跳过
  对应 Track，其他有效 Track 继续；
- Looped MIDI Clip 只跳过该 Clip，不把它误当作普通非循环 Clip，也不阻止其他 Clip；
- Disabled Effect 被忽略；Enabled Track MIDI / Audio Effect 跳过对应 Track；Enabled Master
  Effect 产生 blocking diagnostic，并清空整个计划的可执行 Note Span；
- 没有可听 Note Span 返回带 diagnostic 的合法 Empty Plan，不抛 Compiler 异常；
- `arrangementEndTick` 是所有 Clip 原始 `startTick + spanTick` 的中性最大值，Muted、Unsupported
  或无法发声的内容仍参与；Batch 3A Transport 已确认并使用它作为自然结束点；
- 所有 Track 的 Solo Fact 都参与全局派生，包括当前无法播放的 Audio Track；
- Compiler 不读取 Catalog、Indexes、Mapping 或采样资源；资源不存在属于后续准备 / Runtime
  诊断，不能由 Compiler 按 Soundbank 名称预判。

## 2. Project Instrument Fact 与 Command 边界

### 2.1 已确认的 Sample Instrument schema 与 Studio Grand 默认值

Gate A 已确认 MIDISampleSynth 使用以下稳定 V1 schema；Studio Grand 是该 schema 的首个产品
实例：

```text
id: 保持目标 Instrument Track 既有 instrumentDeviceId
typeId: seele.sample-instrument
definitionVersion: 1
enabled: true
parameters: {}
opaqueState: { soundbankId: "studio-grand" }
```

`soundbankId` 是稳定产品身份，不是 URL、目录路径或显示名称。具体资源位置由浏览器侧
Soundbank Manifest 解析，不能写入 Project File。

现有 `DeviceDescriptor` 已能保存 `typeId`、`definitionVersion`、`parameters` 与
`opaqueState`，因此这项事实不要求伪造 Project File V2。旧项目保持合法且不自动迁移。

浏览器无关的 Sample Instrument Definition 由 `@seele-daw/playback` 单点拥有，包括稳定
Engine ID、版本、严格 state decoder 和编译规则。Decoder 接受任意合法 `soundbankId`，不
查询资源集合。Studio 只决定“新 Track 默认选择 Studio Grand”，并复用 generic factory 创建
Descriptor；Project Core 继续只验证通用 Device 外壳。Audio Web 只接收已编译的 Sample
Instrument Plan 与 `soundbankId`，不再次解释 Project Descriptor。

Batch 2B 内部只用 `seele.fm-synth` 与 `seele.va-synth` 识别两类明确尚未实现的 Engine 并产生
unsupported-engine diagnostic；这不等于已经定义它们的 Parameters、State 或 Runtime 契约。

### 2.2 新 Track

Studio `ProjectTrackCoordinator` 创建新 Instrument Track 时，继续由同一
`AddInstrumentTrackCommand` 原子创建 Track、Device 与 Track Order，只把初始 Device 从空
`seele.instrument-slot` 改为本节定义的 Studio Grand Sample Instrument Descriptor。

该默认值属于 Studio 产品策略，不进入 Project Core 的隐式默认逻辑。Project Core 仍要求
调用方提供完整 Device Descriptor。

### 2.3 旧空 Slot 选择 Instrument

Project Core 已增加产品级 Instrument Device Replace Command：

- 公开判别字段为 `instrument-device.replace`；输入包含 `baseRevision`、目标 Instrument
  `trackId` 与规范化的新 `instrumentDevice: DeviceDescriptor`；
  不再额外传一份与 Descriptor 重复的 `deviceId`；
- Preparer 重新读取当前 Track 和 Device，验证 Device 正是该 Track 的
  `instrumentDeviceId`，且 replacement 保持同一 Device ID；
- Device ID 和 Track 拓扑保持不变，只产生一次 `DEVICE.REPLACE`；
- Delta 使用 `instrument-device.updated` 语义，携带 `trackId`、`deviceId` 与 before / after；
- QueryIndex 必须显式消费该 Change 并推进到相同 revision；当前 Note Query 结果保持不变，
  `project-commit.all` 仍能通知 Playback Coordinator；
- 成功只推进一个 revision、一个 dirty 内容身份和一个 History 步骤；
- Undo / Redo 复用同一 before / after，不重新分配 Device ID；
- 目标已经是同一规范 Descriptor 时返回 No-change，不产生空 Commit；
- No-change 判断由 Project Core 内部的单一规范等价边界完成，不能在 Command、Commit
  Candidate 和 Studio 各复制逐字段比较，也不为此提前扩大 package root API；
- Project Core 不验证 `soundbankId` 是否能在当前浏览器找到资源。未知 Device / State 继续
  由上层作为 Missing Device 保留。

V1 不借此建立任意 Device Graph 编辑、Effect 插入、Preset 管理或通用 Plugin Host。

### 2.4 最小 Track Inspector

- 新 Track 显示 `Studio Grand`；
- 旧空 Slot 显示 `No instrument selected` 与 `Use Studio Grand`；
- V1 只有一个可选 Soundbank，不伪装成完整 Library 或搜索面板；
- 同一个已选 Instrument 不重复执行 Command；
- Command 失败保留旧 Descriptor 并显示 Toast；
- Instrument 选择成功后由 Snapshot / Commit 重新派生展示，不在 Pinia 复制 Device Fact；
- 当前 Clip Selection 会把左侧面板切成 Clip Inspector，因此 Batch 1B 必须保证所选 Track 的
  Instrument 状态和修复入口仍可发现；Batch 1B 采用持久 Track Instrument 区块，Clip
  Inspector 仍显示 Clip 上下文，同时在下方保留 Instrument 状态与修复入口。

## 3. TempoMap 与播放时间

### 3.1 TempoMap 输入

`@seele-daw/playback` 从 `ProjectSnapshot.tempoEvents` 创建不可变 TempoMap：

- 固定 PPQ 为 Project Core 的 `PROJECT_PPQ = 960`；
- Tempo Event 按 Tick 排序；Tick 相同时按 Project 不变量拒绝，不自行选择一个；
- 必须恰好存在一个 Tick `0` 事件；
- Tick `T` 的 Tempo 从 `T` 起生效，区间使用 `[T, nextTempoTick)`；
- BPM 使用 Project Core 已验证的有限范围值；
- Time Signature 不参与 Tick ↔ Second 换算，只用于 Bar / Beat 显示。

虽然 Studio 暂无 Tempo 编辑 UI，Project File 已允许多个 Tempo Event，因此 V1 不能只读取
第一枚事件后静默以错误速度播放完整项目。

### 3.2 换算

TempoMap 至少提供：

```text
Tick -> ProjectSecond
ProjectSecond -> continuous Tick position
Tick range -> duration seconds
```

每个 Tempo Segment 预计算累计起始秒数。Tick → Second 在各 Segment 内使用：

```text
secondsPerTick = 60 / (bpm * PROJECT_PPQ)
```

换算过程使用有限 number，不提前把连续播放位置取整为 Project Tick。只有需要重新定位到
Project Fact 边界时，调用者才采用显式舍入策略。无效、负数、NaN、Infinity 和溢出必须在
Playback 边界失败关闭。

Batch 2A 已按以上边界建立包内 `time/` 实现：输入数组与 Record 会先复制并重新验证；Segment
累计起始秒只预计算一次，正向和反向查询使用二分查找；结果超出安全 number 范围或失去单调
可表示性时抛出带稳定 code 的 Playback 错误。Batch 2B Compiler 现已消费其冻结 Segment DTO；
该实现仍无跨包消费者，因此不从 package root 导出，也不提前加入 Time Signature、Transport、
Scheduler 或 AudioContext。

### 3.3 Transport Mapping

Transport 的产品行为已在 Batch 3A 开始前确认。Playback Core 保存浏览器无关、可由虚拟时钟
验证的映射状态；以下字段已经落为包内模型，但还不是批准的公共 API：

```text
state: stopped | playing | paused
engineGeneration
playheadTickPosition
anchorProjectSecond
anchorPlaybackClockSecond
arrangementEndTick
```

时间域固定为：

- `ProjectSecond` 表示项目音乐时间经 TempoMap 换算后的秒；
- `PlaybackClockSecond` 表示注入的单调调度时钟；
- Playback Core 不 import `AudioContext`；
- Audio Web 用当前 `AudioContext.currentTime` 实现同一个 Playback Clock，并把 Planner 输出
  的目标时刻直接用于该 Context，不再执行第二次含糊的时钟映射；
- 一个计划只能由创建它的 AudioContext / Playback Clock 执行，Context 替换必须增加
  generation 并重建计划。

`modelRevision` 与 `engineGeneration` 必须分离：

- `modelRevision` 标识 Project Fact；
- `engineGeneration` 标识当前仍有效的运行时计划；
- 内部停止、Return to Start、项目切换和需要重建未来事件的 Commit 增加 generation；
- 旧 generation 的事件即使迟到也必须被丢弃。

V1 不因未来 Seek 或 Transport Loop 预建公共协议；Paused 位置已经要求从非零 Tick 继续的
内部能力，但是否暴露 Ruler Seek 留到对应产品切片。

### 3.4 已确认的 Transport 产品契约

以下规则已在 Batch 3A 开始前确认：

- Batch 3A 只建立 `Play / Pause`、`Return to Start` 与当前时间所需的浏览器无关逻辑；Studio
  按钮、`Space` 和可见时间留到 Batch 5A；
- Record 与 Loop 保持禁用，V1 不增加独立 Stop 按钮；
- 初始状态为 Stopped / Tick `0`；Pause 保留连续位置，Resume 从该位置继续；
- `blocked` 或 `empty` Plan 拒绝 Play，Transport state 与 generation 不变；`partial` 与
  `playable` Plan 可以 Play；
- Return to Start 使当前 generation 失效并回到 Stopped / Tick `0`；已在该状态时是幂等
  No-change；实际 `allNotesOff` 由后续 Scheduler / Audio Runtime 执行；
- 自然结束采用 Compiler 的中性 `arrangementEndTick`，因此 Muted 或 Unsupported Clip 仍可延长
  编排；到达末尾后进入 Stopped 并保留 End 位置，再次 Play 从 Tick `0` 开始；
- 有效 Play / Resume、Pause 与 Return to Start 分别更新 generation；被拒绝或重复的 No-change
  操作不更新；自然结束关闭当前播放但不额外更新，下一次 Play 再建立新 generation；
- Transport 到达逻辑末尾时不等待 Sample release tail。真实尾音能否继续、如何结束及再次 Play
  时如何处理，留给 Gate C 的真实音频审阅；
- Transport 操作不改变 Project、dirty、History 或保存内容身份。

## 4. MIDI Timeline Compiler

### 4.1 编译输入与输出

Compiler 接收一次稳定 `ProjectSnapshot`，输出浏览器无关的冻结计划：

```text
AudibleMidiProjectPlan
├── status: blocked | empty | partial | playable
├── modelRevision
├── arrangementEndTick
├── tempoSegments[]
├── masterChannelPlan
├── trackPlaybackPlans[]
├── sorted midiNoteSpans[]
└── diagnostics[]
```

输出不能包含 `AudioNode`、`AudioBuffer`、DOM、Vue、URL、Fetch Response 或可变 Project
对象。TempoMap 的查找函数可以是 Playback 内部实现，但公开计划只携带冻结的 segment DTO，
保持可比较和可序列化。相同 Snapshot 必须得到稳定相同的计划和排序。

V1 的 Track Plan 只包含当前真实消费者需要的事实：

```text
trackId
instrumentDeviceId
SampleInstrumentPlan(soundbankId)
gain
pan
muted / soloed / derived audible state
```

Master Plan 只包含 gain 与 mute。MIDI Channel 随 Note Span 保留，但 Studio Grand V1 不据此
切换音色。

### 4.2 Clip / Source / Note 投影

对每个非循环 MIDI Clip：

```text
clipProjectRange = [clip.startTick, clip.startTick + clip.spanTick)
sourceWindow = [clip.sourceOffsetTick, clip.sourceOffsetTick + clip.spanTick)
```

Note 处理规则：

1. Note Start 小于 `sourceWindow.start`：跳过，不做 Note Chase；
2. Note Start 大于等于 `sourceWindow.end`：跳过；
3. 否则 Project Start 为
   `clip.startTick + (note.startTick - clip.sourceOffsetTick)`；
4. Project End 为 Note 自身映射 End 与 Clip End 的较小者；
5. End 必须严格大于 Start；合法 Project Fact 不会产生零长 Span，伪造的不一致 Snapshot 失败
   关闭；
6. Clip Muted 或所属 Track 不可听时不产生 Note Span；
7. occurrence 身份始终包含 Clip ID，未来 Project Core 若允许同一 Source 被多个 Clip 引用，
   仍会按 Clip 分别投影而不发生 key 冲突。

### 4.3 稳定 Note occurrence 身份

V1 为每个 Clip × Note 投影生成一个稳定 `NoteOccurrenceKey`：

```text
trackId + clipId + sourceId + noteId
```

Key 必须使用无歧义的结构化字段或稳定编码，不能直接拼接可能碰撞的裸字符串。
`engineGeneration` 不进入 occurrence key；它属于一次运行时计划世代。一个
`MidiNoteSpanPlan` 同时携带 Project Start / End、Pitch、Velocity、Channel 和 occurrence
key，不再提前拆成彼此需要追认运行时 Token 的 Note On / Note Off 事件。

Audio Web 在执行一个 Span 时创建内部 `VoiceToken`，并用
`engineGeneration + NoteOccurrenceKey` 关联 Active Voice、提前结束和取消。该 Token 不回传
Playback，也不进入 Project 或公共调度计划，从而闭合“谁创建、谁释放”的所有权。

Span 稳定排序使用：

1. Project Start Tick；
2. Project End Tick；
3. NoteOccurrenceKey。

V1 无 Clip Loop，因此不定义 Loop occurrence index；未来 Loop 必须扩展
`NoteOccurrenceKey`，不能复用同一 key 导致去重错误。

### 4.4 具体 Route 与未支持拓扑

V1 Compiler 只实现一类固定 Route：

```text
MIDISampleSynth Sample Instrument(soundbankId)
-> Track Gain
-> Track Stereo Pan
-> Master Gain / Mute
-> Destination
```

- Track Gain、Pan、Mute / Solo 和 Master Gain / Mute 是已有 Project Fact，必须进入具体
  Track / Master Plan，不能因为当前 UI 尚不能修改就忽略；
- Sample Instrument Plan 只携带 `soundbankId`，不携带资源路径；Studio Grand 与其他
  MIDISampleSynth 没有不同的编译策略；
- Track / Master Effect Chain 不在 V1 构图，也不建立 Graph Operation / Reconciler；
- Disabled Effect 被忽略；Enabled Track MIDI / Audio Effect 产生 diagnostic 并跳过对应
  Track，不能以播放干声伪装为忠实执行；Enabled Master Effect 阻止整个可执行计划；
- Looped MIDI Clip 产生 unsupported diagnostic 并只跳过该 Clip，不能当作普通非循环 Clip
  编译；
- 空 Slot、Missing / Disabled Instrument 及 FM / VA 或未知 Engine 产生结构化 diagnostic 并
  只跳过对应 Track；
- 最终零 Note Span 返回 Empty Plan；Compiler status 与 diagnostics 为后续 Transport / UI
  提供明确输入，但不替它们决定按钮和提示文案；
- `arrangementEndTick` 保留全部 Clip 的原始编排范围，不因 Mute 或 unsupported content 收缩。

AudioContext 创建 / Resume、资源读取、解码或调度失败始终属于 Runtime Failure，不改变
Project Fact。失败必须通过 Transport 邻近状态或 Toast 可访问呈现，同一次失败去重；用户
再次 Play 可以显式重试。

## 5. Scheduler Planner

### 5.1 两级职责

`@seele-daw/playback` 负责规划层：

- 根据 Transport Mapping 和单调时钟计算下一个 look-ahead window；
- 从排序 Timeline 查询半开窗口 `[from, to)`；
- 用 TempoMap 把 Tick 转换为目标 Clock Second；
- 输出带 `engineGeneration` 的批量 Scheduled Voice Plan；
- 每个 Voice Plan 携带稳定 occurrence key、目标开始时刻和目标 release 时刻；
- 记录 horizon、已规划边界和 occurrence key 去重状态。

`@seele-daw/audio-web` 负责执行层：

- 验证计划使用当前 AudioContext 对应的 Playback Clock，并直接使用目标 Clock Second；
- 创建 / 启动 / 停止 Voice；
- 丢弃旧 generation；
- 记录 late、cancel、active voice 和 decode failure 诊断。

V1 的 Planner 与 Audio Web 都在主线程组合，不建立正式 RuntimeDelta 或 generation ACK。
Audio Web 在接受新 generation 前同步使旧 generation 无效；异步加载另用 request identity 与
`modelRevision` 防止陈旧结果启动播放。未来真正出现 Worker / AudioWorklet consumer 后，再
由独立协议批次引入 ACK。

Timer 只负责唤醒规划，不是音频时钟。正确性来自提前交给 Web Audio 调度，而不是假设
`setInterval` 准时。

### 5.2 Look-ahead 参数

Planner 接受注入的 cadence 与 horizon 配置。V1 可以提供保守默认值，但：

- 数值不得成为 Project File 或公共产品语义；
- 测试使用虚拟时钟，不等待真实 wall clock；
- horizon 必须大于 cadence；
- Window 必须连续、无重叠重复和无间隙漏发；
- late event 不能静默执行，Runtime 必须记录并采用明确的 drop / immediate policy；
- 最终默认值由浏览器 smoke 和 benchmark 校准，不在架构层宣称固定真理。

Batch 3B 已确认以下 Late policy：

- Span Start 迟到但计划 End 仍在未来时立即开始，并仍在原 End 时间 release；
- Span 到达时原计划 End 已经过期，则整枚 Span 丢弃；
- 每批 late / drop 只进入有界诊断计数，不为同类连续事件逐条弹 Toast；
- generation 失效优先于 late 补偿；Planner 拒绝已经观察过的新 generation 之后到达的旧
  generation Snapshot，后续 Audio Runtime 仍必须独立丢弃旧 generation 事件；
- 当前 Planner 只输出完整 Voice Span，不提前输出 Cancel 协议；Pause、Return、项目替换所需的
  future cancel 与 `allNotesOff` 由后续 Coordinator / Audio Runtime 执行。

Planner 不创建 Timer。调用方注入 cadence 与 horizon 配置，且 horizon 必须大于 cadence；每次
唤醒传入一个冻结的 Transport Snapshot。新 generation 的首个窗口从其 Playback Anchor 开始，
因此 Timer 首次迟到仍能执行上述补偿，同时继续遵守“Anchor 之前的长 Note 不 chase”。

### 5.3 Play、Pause 与 Return to Start

本节保留已确认行为所需的技术约束：

- Play 前计划与必要采样必须对应同一 `modelRevision`；加载期间 Project 改变则丢弃旧
  request 并重新准备；
- Pause 取消尚未开始的未来事件，并快速释放活动 Voice；Resume 不追赶暂停前已经开始的
  长 Note；
- Return to Start 增加 generation、取消全部 future event、执行 `allNotesOff` 并把
  Playhead 归零；
- 到达 `arrangementEndTick` 时停止 planner，Transport 进入 Stopped 并保留 End 位置；真实
  release tail 不延长 Transport 时间，具体声音行为仍由 Gate C 决定；
- 内部停止、Return 与 dispose 必须幂等。

## 6. Studio Grand Sample Runtime

### 6.1 首批资产边界

本地 `apps/studio/public/soundbanks` 现已替换为下载器整理后的完整开发资源镜像：

```text
public/soundbanks/
├── catalog/       2 files
├── indexes/       2 files
└── soundbanks/    1,756 files grouped by MIDISampleSynth / FMSynth / VASynth
```

整棵资源树约 2.2 GB，已排除 `.DS_Store` 与 downloader reports，并通过 checksum dry-run 与
外部下载器源逐文件核对。旧的扁平资源树已删除，外部下载器源保持不变。该路径继续由
`.gitignore` 排除，只是本机开发证据与 Batch 4A 输入；本阶段不在应用启动时扫描整个目录，也
不把全部资源构建成运行时 Catalog。

2026-08-11 对完整本地采集快照的只读核验记录了 439 个 Soundbank：289 个
`MIDISampleSynth`、11 个 `FMSynth` 和 139 个 `VASynth`。三类数据不能共享同一种执行策略：

- `MIDISampleSynth` 的 Mapping 描述 Sample Zone、pitch range、root pitch、可选 loop / tune /
  attack / release 等语义，并配套实际 WAV / M4A 资源；
- `FMSynth` 的 Mapping 是六算子 FM 合成参数，没有可直接播放的采样；
- `VASynth` 的 Mapping 是 oscillator、filter、envelope、LFO、legato 与可选 metaparameter 等
  合成参数，同样没有采样资源。

因此 `seele.sample-instrument` 覆盖全部 MIDISampleSynth，而不是只覆盖 Studio Grand。Compiler
已经按任意合法 `soundbankId` 生成 Sample Instrument Plan；Studio Grand 只限定首个 Audio
Runtime 验收范围。FM / VA 后续必须先定义声音忠实度目标，再以独立纵向切片评估 Web Audio
平台能力、AudioWorklet 与 WASM 的实现边界；本阶段不能为了复用 Runtime 把合成器参数转换成
假的 Sample Zone。

采集快照中 `catalog/selected-soundbanks.json` 与 `catalog/soundbanks.raw.json` 提供发现、展示、
engine 分类和 General MIDI 对应证据；`indexes/soundbank-map.json` 提供 slug 到 engine、目录、
Catalog、Mapping、Archive 与 General MIDI 信息的反向索引，`indexes/by-general-midi-program.json`
提供 Program 到候选及 canonical Soundbank 的映射。单个 Soundbank 的 Mapping 才提供上游播放
语义证据。Batch 4A 应由开发期规范化工具组合这些信息，输出经过审阅的 Seele Manifest；
上游绝对路径、远程 URL 和原始 JSON schema 均不进入生产运行时契约。

Project 中稳定的 `soundbankId = studio-grand` 当前对应上游资源 slug
`studio-grand-v2-v4`，该映射必须由 Seele 自有 Manifest 明确记录，不能靠字符串猜测。迁移后
该目录包含 Catalog、Mapping、WAV ZIP 与 M4A ZIP 共 4 个文件，约 23 MB；Mapping 有 30 个
Sample Zone，WAV ZIP 内含 30 个 WAV 与一份上游 JSON，目前没有已解压 WAV。上游 JSON 含
BandLab 静态资源 URL，但资源树中未发现随资产保存的授权或可分发来源说明。因此，以下两项是
进入 Audio Runtime 生产批次前的阻断条件：

1. 核实并记录资产来源、授权与项目可分发范围；
2. 若现有资产不能合法随产品分发，先更换为可分发的 Studio Grand 资产，再确认 Manifest
   与声音验收，不能仅改 URL 或名称继续使用。

若 Gate C 确认现有资产可以随产品分发，Batch 4A 只为稳定 ID `studio-grand` 规范化当前
`studio-grand-v2-v4`；若必须更换资产，以下规则同样适用于保持该 stable soundbank ID 的替代
Studio Grand 资产：

- 由开发期工具从选定的 WAV archive 提取、验证并放入明确的可分发资源路径；
- 使用一份经过规范化并提交到仓库的小型 Studio Grand Manifest；
- Manifest 记录 stable soundbank ID、显示名、`releaseSeconds`、Sample Zone、root MIDI
  pitch、min / max range、`tuneCents` 和本地相对资源 key；
- 所有带单位字段必须在名称或 schema 中明确单位；上游没有 `tuneCents` 时规范化为 `0`，
  不能依赖缺失值猜测；
- Runtime Manifest 不保留上游远程 URL；
- 资源 base URL 由 Studio / Browser Composition 输入，`@seele-daw/playback` 不知道 URL；
- Manifest contract test 校验 Zone、文件存在性、格式和可选 checksum；
- Manifest 生成或校验可以使用开发期脚本，但 Studio 启动时不解析任意 ZIP，也不执行目录
  扫描。

选择 WAV 是 V1 的兼容性和可诊断性候选，仍须结合实际体积、解码和授权在 Gate C 确认，不
代表完整 Soundbank 系统放弃压缩格式。运行时 ZIP 扫描 / 任意解压、M4A / WAV 自动协商、完整
Catalog 和多音源缓存策略留到后续产品切片。

### 6.2 Sample 解析

- Studio Grand V1 的声明可播放范围为 MIDI Pitch `21...108`；该范围内每个 Pitch 必须落入
  一个明确 Sample Zone，Zone 重叠或空洞由 Manifest 校验拒绝；
- 当前上游 JSON 的最后一个 Zone 延伸到 `119`，规范化 Manifest 必须显式裁剪到已选择的钢琴
  产品范围 `21...108`，不能让上游范围偶然成为产品语义；
- 范围外 Note 仍是合法 Project Fact，但 Studio Grand 不为它发声，并按 Track 聚合为
  unsupported-pitch diagnostic；不得擅自 Clamp 到钢琴边界；
- 使用 Zone root pitch 与 `tuneCents` 计算 `playbackRate`；
- 公式和正负方向在 Manifest contract test 中用已知 pitch vector 固定；
- 当前 Studio Grand Mapping 有 30 个 pitch Zone，但没有可证明多力度层切换的字段；Velocity
  首版候选映射为 `velocity / 127` 的 Voice Gain，再乘 Track 和 Master Gain，这只能改变音量，
  不能宣称真实还原钢琴随击键力度变化的音色，最终曲线和产品表述在 Gate C 听觉审阅中确认；
- Pan 使用 Track `[-1, 1]` 的稳定事实；
- Sample 短于 Note 时不得在没有 loop metadata 的情况下自行循环；是接受自然结束、选择其他
  Zone / 资产，还是在未来引入共鸣或物理模型，必须由 Gate C 结合真实音频决定；
- Sample 长于 Note 时，Span End 的 Gain Ramp 曲线、持续时间、是否模拟制音器以及可保留的
  release tail 都是 Gate C 候选，不把上游 `release` 字段未经验证直接当成最终物理钢琴模型；
- Clip 边界同样结束逻辑 Active Note；听觉尾音可以按 Gate C 结果继续，但不能延长 Project
  Note Fact 或阻止 Voice Token 最终释放；
- Sustain、弦共鸣、踏板噪声、半踏板、release sample、多力度采样与更完整的物理建模不因
  “Studio Grand”名称被默认承诺；Gate C 必须明确 V1 最小听觉目标及延期项；
- 同 Pitch 重叠 Note 必须拥有独立 `AudioBufferSourceNode` 和 Voice Token。

### 6.3 加载与缓存

- 首次 Play 从当前计划收集需要的唯一 Sample Zone；是一次性预载全计划，还是先加载初始
  Scheduler 窗口，必须在 Batch 4A 用真实网络与内存数据完成 Decision Gate；
- Gate 必须记录最坏下载量、解码后 AudioBuffer 内存、允许等待时间、取消和单 Zone 失败是否
  中止整次 Play；
- 在满足所选加载门槛前 Transport 不进入 Playing，UI 显示 `Loading instrument…`；
- 同一 Zone 的并发请求 Promise 去重；
- 成功解码的 AudioBuffer 进入可丢弃内存缓存；
- 失败的 Promise 不永久污染缓存，用户重试可以重新请求；
- 解码缓存是 Audio Web 中独立、可丢弃的应用生命周期资源，由 Studio Composition Root
  创建；Project Runtime dispose 释放 Voice、Timer 和 Listener，但不误清理仍由共享缓存拥有
  的 AudioBuffer；应用 dispose 再释放缓存引用；
- V1 不把解码 PCM 写入 Project、Checkpoint、IndexedDB 或 OPFS；
- Loading request 使用 request identity / AbortSignal，陈旧结果不能启动已经取消的播放。

### 6.4 AudioContext 生命周期

- 不在应用启动或 Composition Root 构造时创建 AudioContext；
- 首次 Play 用户手势内创建或 Resume；
- `suspended`、`interrupted`、`closed` 和 Resume rejection 均产生明确 Runtime 状态；
- 页面隐藏不擅自修改 Project；暂停、停止还是等待恢复属于 Browser Lifecycle Decision Gate，
  但恢复时不得补发所有过期事件；
- 项目关闭、Runtime 替换和应用 dispose 前执行 `allNotesOff`；
- 所有 source、gain、panner、timer 和 listener 必须可计数并最终归零；
- Studio Grand V1 候选使用主线程 Web Audio 原生节点，不提前引入 AudioWorklet 或
  SharedArrayBuffer；该选择不替未来 FM / VA Synth 决定 Web Audio 与 WASM 架构。

## 7. Studio 状态与 UI 组合

### 7.1 状态所有权

| 状态                                      | 权威所有者                           | 是否持久化 |
| ----------------------------------------- | ------------------------------------ | ---------- |
| Sample Instrument Descriptor              | Project Core                         | Project V1 |
| Tempo、Clip、Note、Gain、Pan、Mute / Solo | Project Core                         | Project V1 |
| compiled plan / generation                | Playback Runtime                     | 否         |
| AudioContext、AudioBuffer、Voice          | Audio Web Runtime                    | 否         |
| playing / paused / position               | Transport Runtime                    | 否         |
| Play 按钮 Busy / failure                  | Studio Playback Binding              | 否         |
| Playhead DOM / Canvas projection          | 对应 Surface 的 Browser View Adapter | 否         |

Playback Runtime、AudioContext 和 Scheduler 不能进入 Pinia。Composition Root 创建唯一 Project
Playback Coordinator，并通过类型化 Vue Context 提供命令能力与 shallow frozen state。Pinia
仍只用于现有轻量、可重建 UI Preference。

### 7.2 Transport UI

以下是 Batch 5A 的候选 UI 契约，必须在接入 Studio 前单独审阅：

- Play 按钮在 Playing 时切换为 Pause 图标和可访问名称；
- Loading 时按钮显示 Busy 并阻止重复请求；
- Return to Start 在非零位置或活动播放时可用；
- Record 和 Loop 保持 Disabled；
- 时间使用稳定、等宽数字，V1 显示 `mm:ss.mmm`；
- Space 进入 Workbench / Global 合理 Scope，Input、Textarea、Select、Contenteditable 与 IME
  composing 时不触发；
- Modal / Dialog 继续高于 Transport Scope；
- 无可播放 Route、零 Note Span、unsupported content 或 Runtime Failure 提供明确的邻近状态、
  disabled reason 或 Toast，具体阻止层级由对应 Gate 决定；
- V1 没有 Meter 数据时不继续显示会被理解为实时电平的 `0.0 dB`；应改成明确不可用的占位或
  隐藏输出读数，最终视觉在 Studio Batch 审阅。

### 7.3 可选 Playhead 批次

首次可听闭环只要求稳定的当前时间显示。Arrangement 与 Piano Roll Playhead 是随后独立审阅
的可选批次；未完成时不阻塞 Audible V1 的声音验收。

若本阶段继续实现 Playhead，则遵守：

- Arrangement 和当前打开的 Piano Roll 读取同一 Transport Position；
- 位置来自 `AudioContext.currentTime` 对应的 Transport Mapping，而不是累计
  `requestAnimationFrame` delta；
- `requestAnimationFrame` 只刷新视觉；tab 降频后恢复时重新读取权威运行时位置；
- 浏览器支持 `getOutputTimestamp()` 时可以做纯视觉 latency compensation，但不能改变
  事件调度时间；
- 高频位置不写入 Project、Pinia 或 Project Commit Subscription；
- Playhead 层独立于静态 Grid 和 Note / Clip Scene，移动 Playhead 不重建全部内容；
- V1 没有拖动 Playhead Seek；后续 Ruler Interaction 单独设计命中、Capture 和 Snap。

## 8. 播放中编辑与 revision 交接

### 8.1 基本规则

初次编译使用一个 Snapshot 的 `modelRevision`。Playback Coordinator 订阅 Project Commit：

- Save / Checkpoint 不产生 Project Commit，不使正在播放的计划失效；
- Note Add / Move / Resize / Remove、Clip / Track / Instrument 变化、Undo 和 Redo 都必须使
  相关未来事件失效；
- 新计划必须明确对应新的 `modelRevision` 和新的 `engineGeneration`；
- V1 同一主线程内先同步使旧 generation 无效，再安装新计划，不建立无真实异步消费者的
  generation ACK；
- 外部音频失败不回滚 Project Commit；Runtime 可以保留安全旧计划或停止，但必须报告状态；
- 如果 Commit 序列出现 gap，丢弃增量并从新的完整 Snapshot 重建。

### 8.2 V1 生效策略

为先保证正确性，V1 在相关 Commit 后固定执行保守重建：

1. 读取当前听觉位置；
2. generation + 1；
3. 取消旧 generation 的 future schedule；
4. 对 V1 当前全部活动 Voice 执行快速 `allNotesOff`；
5. 从新 Snapshot / Plan 的当前位置之后继续规划；
6. 不对当前位置之前已经开始的长 Note 执行 chase。

该策略会在任意相关编辑后截断本来未受影响的活动长 Note，这是 V1 为换取确定性接受的限制。
Track / Range / Voice 级失效与保留未受影响 Voice 留到有实际听觉需求和基准后单独实现。不得
为追求局部优化让旧 Note Span 在新 Project Fact 下继续错误发声。

### 8.3 交互 Preview

Piano Roll Move / Resize Preview 不产生 Project Commit，因此不改变 Timeline Playback
Plan。只有 Pointer Up 成功提交后才更新播放。Preview Audition 属于未来独立功能，不得把
编辑器瞬时状态塞进主 Timeline Scheduler。

## 9. Package 与依赖边界

```text
@seele-daw/project-core
  Project facts + instrument replace command + snapshot / delta
        |
        v
@seele-daw/playback
  sample-instrument schema + TempoMap + track/note plans + Transport + scheduled voice plans
        |
        v
@seele-daw/audio-web
  AudioContext + soundbank cache + sample voice executor
        ^
        |
apps/studio composition root
  active project + asset URL/manifest + runtime + Vue binding + UI
```

约束：

- `@seele-daw/playback` 只依赖 Project Core 和 compile-time 类型代数，不依赖 Editor、Vue、
  Browser 或 Audio Web；
- `@seele-daw/audio-web` 只消费 Playback 的公开计划，不 import Project Core 内部模型；
- Studio 不把 Project Snapshot 直接交给 Audio Web；
- Soundbank URL、Fetch 和 AudioContext 类型不能泄漏进 Playback 公共契约；
- Browser-specific resource loader 通过明确端口注入，不建立万能 `utils` / `services` 包；
- V1 不从 package root 导出通用 GraphPlan、RuntimeDelta、GraphOperation 或 ACK 协议；
- 只有经过至少一个真实消费者验证的契约才从 package root 导出；
- Fake Clock、Fake Audio Backend 和 Fixture 只放测试 support。

建议随真实批次建立的目录，而不是一次性预建全部空文件：

```text
packages/playback/src/
├── devices/
├── time/
├── transport/
├── compiler/
├── timeline/
└── scheduler/

packages/audio-web/src/
├── context/
├── soundbank/
├── voices/
└── scheduler/
```

## 10. 实施批次

Gate A 已随 Batch 1A 关闭；Gate B 的 Compiler 与 Transport 部分分别随 Batch 2B 和 Batch 3A
关闭。开始后续对应生产批次前仍需按顺序关闭其余 Gate：

- Gate A（2026-08-11 已关闭）：确认 Studio Grand Device Definition 与 Replace Command 形状；
- Gate B（2026-08-11 已关闭）：按第 1.5 节处理 unsupported content 与零 Note Span，并按第
  3.4 节处理 Transport、自然结束和逻辑 release-tail 边界；真实声音的 release 行为仍属 Gate C；
- Gate C：确认采样来源 / 分发权限、Manifest、Note / Sample 长度与 release / 钢琴真实性边界、
  加载预算和浏览器验收矩阵。

### Batch 1A：Project Core Instrument Device Replace

> Implementation status: reviewed and committed as `6b172d9`. Project Core type-check and all 27
> test files / 399 tests pass; repository `pnpm lint` and `pnpm check` pass.

- Gate A 关闭后，增加通用 Instrument Device Replace Command、Preparer、Mutation、Delta 与
  No-change；
- 保持 Device ID 和 Track topology；
- QueryIndex / Change Publisher 对 Device change 的 revision 与订阅行为；
- Undo / Redo、Snapshot、Project File V1 与 Checkpoint 回归；
- 未知 Soundbank ID 仍可 round-trip；
- 更新 Project Core 文档后停止审阅。

### Batch 1B：内置 Device Definition 与 Studio 入口

> Implementation status: reviewed and complete. Playback 1 test file / 4 tests and Studio 40 test
> files / 218 tests pass; repository `pnpm lint` and `pnpm check` pass.

- `@seele-daw/playback` 建立唯一、浏览器无关的 Studio Grand Device Definition / state
  decoder；
- 新 Track 默认创建 Studio Grand Descriptor；
- Studio Coordinator 接通旧 Slot → Studio Grand Command；
- Track Inspector 显示当前 Instrument / Missing / Empty，并保证 Clip Selected 时入口可发现；
- 只提供 `Use Studio Grand`，不建立完整 Browser；
- Selection、Toast、Undo / Redo、Save / Reload 回归；
- 更新 PRODUCT 后停止审阅。

### Batch 2A：Playback TempoMap

> Implementation status: reviewed and complete. Playback type-check and 2 test files /
> 20 tests pass; repository `pnpm lint` and `pnpm check` pass.

- Project Second 等强类型值；
- 多 Tempo Segment Tick ↔ Second；
- 不接 AudioContext，不接 Studio；
- 仅作为包内能力供后续真实消费者使用，不提前扩大 package root API；
- 更新 Playback README 后停止审阅。

### Batch 2B：具体 MIDI Plan Compiler

> Implementation status: reviewed and committed as `ac1cc31`. Playback type-check and 4 test files /
> 43 tests pass; repository `pnpm lint` and `pnpm check` pass.

- Gate B 中与 Compiler unsupported content 相关的规则已按第 1.5 节关闭；
- Snapshot → Track Playback Plan / MIDI Note Span Plan；
- 所有 MIDISampleSynth 共用 Sample Instrument Plan；Studio Grand 不构成 Soundbank 白名单；
- Clip Window、Mute / Solo、Gain / Pan、Clip End Note Off 与中性 `arrangementEndTick`；
- NoteOccurrenceKey、输入顺序无关的稳定排序与结构化 diagnostics；
- fixture / failure / policy tests 与 10,000 Note performance baseline；
- 不创建 AudioNode、GraphPlan 或 RuntimeDelta，完成后停止审阅。

### Batch 3A：Transport Mapping

> Implementation status: reviewed and committed as `ae87ca4`. Playback type-check and 5 test
> files / 61 tests pass; repository `pnpm lint` and `pnpm check` pass.

- Gate B 中 Transport / Arrangement End / logical release-tail boundary 规则关闭；
- Project Second / Playback Clock Second 边界；
- stopped / playing / paused 状态按确认结果落地；
- engineGeneration、注入时钟与虚拟时钟测试；
- 不接 AudioContext，不接 Studio，完成后停止审阅。

### Batch 3B：Scheduler Planner

> Implementation status: implemented and awaiting review. Playback type-check and 6 test files /
> 75 tests pass; repository `pnpm lint` and `pnpm check` pass.

- look-ahead window、连续 cursor、generation 与 occurrence 去重；
- Scheduled Voice Plan 同时携带 Start / release 目标时刻；
- late / drop policy 按 Gate 结果实现；
- 不建立跨线程 ACK，完成后停止审阅。

### Batch 4A：资产与 Manifest Gate

- Gate C 的资产来源与可分发权限得到书面记录，否则本批停止；
- 以已迁入本地忽略资源树的 Catalog / Indexes 反向定位资源与 General MIDI 语义，以 Mapping
  提取播放字段，经开发期工具生成并校验 Seele 自有 Manifest；原始镜像不进入生产运行时；
- 明确 stable `studio-grand` 到上游 `studio-grand-v2-v4` 的开发期映射，并从选定 archive
  提取经过授权与校验的 V1 资源；
- 明确 21–108 裁剪、字段单位、文件列表与 checksum policy；
- 用真实 Studio Grand 资产听觉审阅 Sample 短于 / 长于 Note、Note Off、release tail、
  velocity 表现与 V1 钢琴真实性边界；
- 测量全量 / 初始窗口加载量、解码后内存和失败恢复，确认加载策略；
- 不实现完整 Catalog，完成后停止审阅。

### Batch 4B：Audio Web Studio Grand Runtime

- AudioContext lifecycle；
- WAV fetch / decode、Promise 去重与可重试缓存；
- 按 Gate C 结果实现 Sample Zone、Pitch、Velocity、Gain、Pan、Note Off 与 Release；
- Voice Token、cancel、allNotesOff 与资源统计；
- Fake Web Audio contract tests；
- 不接 Workbench UI，完成后停止审阅。

### Batch 5A：Studio Transport 与首次可听闭环

- Composition Root 创建 Project Playback Coordinator；
- 用户手势内 prepare / load / resume / play；
- 按 Gate B 接通 Transport、快捷键与当前时间显示；
- Loading、Missing Instrument、Unsupported Clip 和 Runtime Error 反馈；
- 项目切换与应用 dispose；
- 浏览器自动渲染 smoke 与至少一次真实 Chrome 人工听觉 smoke；
- 更新 DESIGN / PRODUCT 后停止审阅。

### Batch 5B：可选 Playhead

- 只有用户在 Batch 5A 后单独确认才进入；
- Arrangement 与 Piano Roll 读取同一 Transport Position；
- 独立图层、rAF 视觉刷新、后台恢复与 dispose；
- 未进入或未完成不阻塞 Audible V1 封版。

### Batch 6：播放中编辑与阶段加固

- Commit subscription、revision gap 与 full rebuild；
- Note Move / Resize / Delete、Undo / Redo 和 Instrument Replace 生效；
- generation 失效、取消 future schedule、全局 `allNotesOff` 与旧事件丢弃；
- Pause / Resume、后台 suspend、连续项目切换和资源泄漏回归；
- 完整 `pnpm lint`、`pnpm check`、生产构建和浏览器 smoke；
- 封版第六阶段并建立 checkpoint tag。

每个独立 Core / Runtime / Studio 批次完成后停止，等待用户审阅；未经确认不连续推进下一批。

## 11. 测试与验收

### 11.1 纯逻辑

- 多 Tempo Event 前向 / 反向换算和边界；
- 相同 Snapshot 编译计划完全确定；
- Clip Source Offset、Clip End 裁剪和无 Note Chase；
- 同 Pitch 重叠 Note 拥有不同 NoteOccurrenceKey / Voice Token；
- Muted / Solo / Disabled / Missing Instrument；
- Looped Clip、Effect、Missing / Unsupported Instrument 与零 Note Span 按第 1.5 节策略编译；
- Scheduler window 连续、无重复、无漏发；
- Pause、Return、generation invalidation 和 project end；
- stale load / stale plan / revision gap。

### 11.2 Audio Runtime

- User gesture 前不创建 AudioContext；
- 同一 Sample Zone 并发只解码一次；
- decode failure 可重试；
- Pitch playbackRate 与 Velocity Gain vector；
- Span End、Clip Boundary、cancel 和快速 release；
- old generation event 被丢弃；
- allNotesOff / dispose 后 Voice、Node、Timer 和 Listener 为零。

浏览器自动化还应通过 `OfflineAudioContext` 或等价可观测渲染验证：

- 已知 Note Plan 产生非静音输出；
- Pitch 比例、开始时刻、release 与声道输出在容差内；
- 该测试只验证浏览器音频图，不等同于建设 Offline Export 产品能力。

### 11.3 Studio

- 新 Track 保存并恢复 Studio Grand；
- 旧 Slot 不自动迁移，显式选择可 Undo / Redo；
- Play Loading 不重复触发；
- Space 不侵入输入控件或 Modal；
- Project switch 停止旧项目声音；
- Runtime failure 不改变 Project dirty / History；
- 若进入可选 Batch 5B，两个 Playhead 使用同一 Transport Position；
- Record、Loop 和 Output Meter 不伪装为已接通。

### 11.4 浏览器 Smoke

自动化渲染不能证明真实声卡输出。Batch 5A 和阶段封版至少人工验证：

1. Chrome 中创建 Track / Clip / Note；
2. 首次 Play 能经过用户手势解锁并听见 Studio Grand；
3. Pause / Resume / Return to Start 无残留 Voice；
4. 不同 Pitch、Velocity 与重叠 Note 可辨认；
5. Move / Resize / Delete / Undo 后不播放旧事件；
6. Save、刷新、Open 后 Instrument 与 Note 仍可播放；
7. 切换项目和离开 Workbench 后立即静音。

## 12. 明确延期

本阶段不实现：

- 完整 Soundbank Catalog、搜索、分类、收藏和最近使用；
- 运行时 ZIP 扫描 / 解压、M4A / WAV 自动协商或全量 2.2 GB 资源索引；
- 通用 MIDISampleSynth Runtime、Sampler 编辑器或第三方 Plugin；
- FMSynth / VASynth 引擎及其 Web Audio、AudioWorklet 或 WASM 技术选择；
- 完整物理钢琴模型、多力度 Sample、制音器 / 弦共鸣、release sample 与踏板行为；
- 通用 Effect Graph、Graph Reconciler、RuntimeDelta 与跨线程 generation ACK；
- AudioWorklet、SharedArrayBuffer、WASM DSP；
- Transport Loop、Looped Clip、Metronome、Count-in、Record、Punch；
- Ruler Seek / Scrub、播放范围 Selection 或 Follow Playhead；
- Piano Key / Note Preview Audition；
- Live Meter、Master Volume UI、Mixer、Effect Chain；
- Sustain Pedal、CC、Pitch Bend、Aftertouch、MPE；
- Note Chase、Preview Playback、Offline Export；
- Track / Range / Voice 级播放中增量失效优化；
- Audio Track、Audio Clip、Recording；
- Piano Roll Box Selection、Velocity、Zoom / Scroll；
- Arrangement Clip Move / Resize / Copy / Split 与完整 Interactive Snap V1。

这些能力必须由后续真实产品切片驱动，不能借 Playback V1 名义预建通用音频工作站框架。

## 13. 完成定义

只有同时满足以下条件，第六阶段才算完成：

- 用户能够从 Project Fact 确认 Track 使用 Studio Grand；
- 用户创建的 MIDI Note 能按 Project 时间和 Pitch 发声；
- 经 Gate B 批准的 Transport、Project End、unsupported content 与 release 行为通过验收；
- Save / Reload 保留 Instrument 与内容；
- 编辑、Undo / Redo、项目切换不会留下旧事件或残留 Voice；
- Playback Core 不依赖浏览器，Audio Web 不读取 Project Model；
- Runtime 对缺失资源、浏览器拒绝和 stale generation 失败关闭；
- 内置采样来源与分发权限已记录，规范化 Manifest 和加载预算通过 Gate C；
- 自动化渲染、生产构建和真实浏览器听觉 smoke 通过；
- [产品功能手册](../../../PRODUCT.md)、[设计语言](../../../DESIGN.md)、
  [Playback README](../README.md) 与 [Audio Web README](../../audio-web/README.md) 已同步；
- 用户逐批审阅通过并建立新的阶段 checkpoint。

## 参考

- [Audible MIDI Scheduler 工作原理](./audible-midi-scheduler-primer.md)
- [Web DAW 简洁架构总纲](../../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计](../../../docs/architecture/web-daw-long-term-architecture-v3.md)
- [MIDI Project Model V1](../../project-core/docs/midi-project-model-v1.md)
- [Piano Roll Note Editing 第五阶段计划](../../editor/docs/piano-roll-note-editing-phase-plan.md)
- [Seele Studio Design Language](../../../DESIGN.md)
