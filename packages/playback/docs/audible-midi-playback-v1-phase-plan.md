# Audible MIDI Playback V1 阶段计划

> Status: Completed on 2026-08-17; Batch 1–6 and 7A–7F reviewed; accepted implementation baseline `f1d0298`; no checkpoint tag created
>
> Date: 2026-08-10
>
> Last updated: 2026-08-17
>
> Prerequisite checkpoint: `checkpoint/piano-roll-note-editing-2026-08-10`

本文中的 `V1` 指 **Audible MIDI Playback 的第一版产品纵向切片**，不是长期架构文档的
旧版本。长期架构仍以 `web-daw-long-term-architecture-v3.md` 为基线；本文只把当前阶段需要
落地和继续确认的细节收敛成可执行边界。阶段收口后，本文作为已完成实现、验收证据、明确延期
与架构决定的历史记录；新增播放能力必须进入新的产品切片，而不是继续扩大本 V1。

> 2026-08-18 后续说明：Ruler 手动定位、运行时 Return Anchor 与边缘滚动已进入独立的
> [Manual Timeline Locate V1](./manual-timeline-locate-v1-phase-plan.md)。该后续切片不修改本文的
> 历史验收范围、`f1d0298` 基线或 Completed 状态。

## 阶段目标

本阶段已把 MIDI 编辑闭环推进为第一条真正可听见、可观察播放位置的产品纵向切片：

```text
创建默认 Studio Grand Instrument Track
-> 创建 MIDI Clip 与 Note
-> 使用经审阅确认的基础 Transport
-> 听见按项目时间调度的采样钢琴
-> 播放中编辑能够使旧事件安全失效
-> 在至少 150 小节的编排时间轴中看见并跟随播放位置
-> 在 Track 全局或当前 MIDI Clip 视图中看见同一播放位置
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

阶段完成后，当前最小 MIDI 工作流已第一次满足架构总纲中的“写 Note 后能够播放”。

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
- 播放中相关 Commit 采用专用于 Audible MIDI 的选择性 reconciliation：重建尚未发声的队列，
  只结束被修改的活动 Voice，并保留无关 Track / Note 的持续发声；全局 `allNotesOff` 只用于
  Pause、Return、项目生命周期、全局时间映射改变或状态无法证明安全的兜底路径；
- Arrangement 与 Piano Roll 的 Playhead、编排滚动和最小时间轴范围已纳入 Batch 7；它们读取同一
  Transport Position，但不引入 Seek / Scrub 或持久化 UI 状态；
- 当前内置采样只作为 developer-local、可替换且不可随 Seele 分发的验证输入；该边界不阻塞
  本地 Audio Runtime 开发。规范化 Manifest、首播加载预算和浏览器验收范围仍是相应生产批次
  的明确门槛，任何公开交付采样的方案则必须先补齐替代资产或再分发权限。
- Compiler 支持整个 `MIDISampleSynth` 家族：每个符合 V1 schema 的
  `seele.sample-instrument` 都按其 `soundbankId` 生成 Sample Instrument Plan，不把 Studio
  Grand 名称作为白名单；Studio Grand 仍只是新 Track 默认音源与首个 Audio Runtime 验收资产。
- 2026-08-12 全量控制文件核验确认 MIDISampleSynth 内部同时存在 range / exact-key、gated /
  one-shot、loop、tune、attack / release、offset 与 mutex 语义；这些结果是默认内置数据的
  逆向证据，不是 Seele 宿主规则。兼容 Adapter 负责把来源特有推断规范化为显式 Manifest；
  Profile 与 Runtime 不得依赖 Studio Grand 名称或这批 JSON 的隐式默认值。分别见
  [默认内置 MIDISampleSynth 控制文件逆向分析](../../audio-web/docs/default-built-in-midi-sample-synth-reverse-analysis.md)
  与
  [Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](../../audio-web/docs/seele-supported-sfz-profile-v1.md)。
- 完整资源集合中的 `FMSynth` 与 `VASynth` 需要各自的 Device / Compiler / Runtime 产品切片，
  不能伪装成 Sample Instrument，也不在本阶段决定使用 Web Audio 原生节点、AudioWorklet
  还是 WASM。
- Catalog、Indexes 与各 Soundbank Mapping 位于忽略的 `apps/studio/public/soundbanks` 本地
  开发资源树，供 Vite dev server 和后续规范化工具使用；生产构建关闭整个 public 复制。远程
  URL、绝对路径和未经审阅的上游 schema 仍不能成为生产运行时或构建的隐式依赖。

### 1.4 尚待逐批确认的 Decision Gate

Gate A 已于 2026-08-11 关闭：Studio Grand 的 Device Definition 与 Project Core Replace
Command 形状按第 2 节确认。Gate B 中与 Compiler unsupported content 有关的规则已随 Batch
2B 关闭，Transport Mapping 规则已在 Batch 3A 开始前确认。Batch 4A.0 已确认本地验证资产不
等同于可分发产品资产。Gate C.1a 已随审阅关闭：Seele 采用明确限定的 Supported SFZ Profile、
显式 Manifest 和来源 Adapter。Gate C.1b 已随受限 ZIP / WAV 与本地规范化工具审阅关闭。
Gate C.2 已建立加载估算和 dev-only 试听入口，真实浏览器加载、解码、发声与人工试听均成功；
`0.133 s linear release` 未感知到明显 click，可以作为后续实现和 A/B 比较的基线，但不因此
成为最终的通用包络曲线。Batch 4B.1 已按 Gate 的加载建议实现并通过审阅；Batch 4B.2 已落实并
通过审阅首版包络、Velocity、Note Off、loop、mutex、generation 与 Voice 生命周期规则。
Batch 5A 采用 capability-based Chrome-first 验收：自动测试保证 Composition / 状态 / 资源
边界，真实 Chrome 人工 smoke 负责验证用户手势解锁与声卡输出；多浏览器矩阵留到阶段加固或
明确兼容性切片。

Gate C.1b 已把 Catalog / Indexes 的本地定位、stable `studio-grand` 到当前输入的生成映射、ZIP
安全预算、固定输入指纹与输出校验报告落实为开发工具。可分发 Manifest / Bundle 仍只能在替代
资产或再分发范围另行确认后进入产品资源。
Gate C.2 的客观数据、浏览器 smoke、加载建议和人工试听清单见
[Studio Grand 加载测量与听觉 Gate](../../audio-web/docs/studio-grand-loading-and-listening-gate.md)。

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
  或无法发声的内容仍参与；Batch 3A 曾以它作为自然结束点，Batch 7B 已将自然结束切换为不小于
  它的派生 `timelineEndTick`；
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
timelineEndTick
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
- 自然结束采用 Compiler 的派生 `timelineEndTick`；它至少覆盖 150 个起始拍号小节，并根据包含
  Muted 或 Unsupported Clip 在内的中性内容末端扩展；MI7 Batch 4 后，扩展范围向上补齐完整小节
  并保留 8 个尾部小节。到达末尾后进入 Stopped 并保留 End 位置，再次 Play 从 Tick `0` 开始；
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
├── arrangementEndTick: authored Clip content extent
├── timelineEndTick: derived view and natural-playback extent
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
- 到达 `timelineEndTick` 时停止 planner，Transport 进入 Stopped 并保留 End 位置；真实
  release tail 不延长 Transport 时间，具体声音行为仍由 Gate C 决定；
- 内部停止、Return 与 dispose 必须幂等。

## 6. MIDISampleSynth Sample Runtime（Studio Grand 首验）

### 6.1 首批资产边界

下载器整理后的完整开发资源镜像位于 Studio 的本地忽略 public 目录：

```text
apps/studio/public/soundbanks/
├── catalog/       2 files
├── indexes/       2 files
└── soundbanks/    1,756 files grouped by MIDISampleSynth / FMSynth / VASynth
```

整棵资源树约 2.2 GB，已排除 `.DS_Store` 与 downloader reports，并通过 checksum dry-run 与
外部下载器源逐文件核对。旧的扁平资源树已删除，外部下载器源保持不变。该路径由
`.gitignore` 明确排除，只是本机开发证据与 Batch 4A 输入；本阶段不在应用启动时扫描整个
目录，也不把全部资源构建成运行时 Catalog。

实测 Vite 默认 build 会把整棵 public 目录复制进约 2.3 GB 的 `dist`。Batch 4A.0 因此显式设置
`build.copyPublicDir = false`：本机 dev server 仍可通过同源 URL 提供验证资源，生产 build 不再
复制任何 public 内容。原 favicon 已移入正常的 Vite 模块资产管线；build 完成后与 preview
启动前还会拒绝 `apps/studio/dist/soundbanks`，防止配置漂移。`.gitignore` 只解决版本控制噪音，
不能替代这项构建约束。

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
`studio-grand-v2-v4`，该映射必须由 Seele 规范化 Manifest 明确记录，不能靠字符串猜测。原始
目录包含 Catalog、Mapping、WAV ZIP 与 M4A ZIP 共 4 个文件，约 23 MB；Mapping 有 30 个 Sample
Zone，WAV ZIP 内含 30 个 WAV 与一份上游 JSON。Batch 4A.1b 已另行生成被忽略的规范化 Manifest、
校验报告与 30 个 WAV；原始输入仍保持 Archive 形态。上游 JSON 含静态资源 URL，但资源树中未
发现随资产保存的 LICENSE、NOTICE 或允许第三方 DAW
打包原始采样的证明。

因此当前资产被明确分类为 **developer-local validation fixture**：Seele 不声称拥有再分发权，
不提交、打包、部署或自动下载它；同时也不要求先取得书面再分发授权才开始本机发声验证。
来源链、输入指纹和产品边界记录在
[Studio Grand 本地验证资产记录](../../audio-web/docs/studio-grand-local-validation-assets.md)。若
以后需要发布自带 Studio Grand 的构建，必须先换用明确可分发的替代资源，或取得覆盖该产品
用法的授权，不能仅改 URL、文件名或显示名称继续使用当前采样。

Batch 4A.1a 已建立与 Archive 无关的语义边界；Studio Grand 不限定 schema 能力：

- Supported SFZ Profile V1 明确公开 authoring 子集、字段单位和 unsupported diagnostic，不宣称
  完整 SFZ 兼容；
- Sample Instrument Manifest V1 记录 stable soundbank ID、显示名、显式 range / exact-key
  selector、root MIDI pitch、`tuneCent`、gated / one-shot、continuous / sustain loop seconds、
  source frame 归一后的 start offset seconds、attack / release、exclusive group 与安全相对 WAV
  resource key；
- 严格 validator 拒绝未知字段、版本、非 canonical Zone、selector 重叠、不安全路径、无 release
  gated Zone、one-shot loop 和悬空 exclusive group，并返回冻结副本；
- 默认内置 Mapping Adapter 隔离 `category=kit` 默认 one-shot、缺失 `loop_mode` 时的 continuous
  loop、bank-level release fallback 和 `mutexSets` 等来源特有推断；Manifest / Runtime 不重复
  解释这些私有规则；
- 当前全量 289 份 Mapping、4,664 个 Zone 已通过开发者本机兼容审计；原始数据和生成结果不进入
  仓库或可分发产品构建。

Batch 4A.1b 已实现并通过审阅，建立以下资源容器与本地生成边界：

- 由受限 ZIP Adapter 从选定 WAV Archive 读取、验证并提取到忽略的本地生成目录；
- 开发期工具组合 Catalog / Indexes / Mapping，明确 stable `studio-grand` 到
  `studio-grand-v2-v4` 的输入映射并生成小型 Manifest；
- ZIP entry path、数量、单文件 / 总解压大小、压缩比、取消和错误分类单独验证；本地工具核对
  固定输入 SHA-256，并为每个输出记录 SHA-256；
- 后续浏览器 Loader 的本地 resource base URL 必须由 Studio Composition Root 注入；
  `@seele-daw/playback` 不知道 URL、ZIP 或文件系统路径；
- 后续 Studio 启动流程不得扫描任意 ZIP 或完整本地目录，资源只按经过验证的 Bundle / Manifest
  加载。

未来替换为可分发资产后，可以在重新核验来源、产品范围和指纹的前提下提交对应生产 Manifest
与资源；Project File 中的 stable `studio-grand` ID 和 Playback Plan 无需因此变化。

选择 WAV 是本地 V1 验证的兼容性和可诊断性候选，仍须结合实际体积与解码数据确认；它不代表
当前采样可以随产品分发，也不代表完整 Soundbank 系统放弃压缩格式。Batch 4A.1b 已引入受路径、
entry、大小、取消约束的第三方 ZIP 解码，并由调用方负责可信输入 / 输出摘要；任意 Archive
扫描、M4A / WAV 自动协商、完整 Catalog 和全量多音源缓存策略仍留到后续产品切片。

### 6.2 Sample 解析

- 默认内置数据的 Zone、trigger、loop、tune、offset、envelope 与 mutex 证据见
  [默认内置 MIDISampleSynth 控制文件逆向分析](../../audio-web/docs/default-built-in-midi-sample-synth-reverse-analysis.md)；
  Seele 的规范输入与 validator 规则见
  [Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](../../audio-web/docs/seele-supported-sfz-profile-v1.md)。
  Adapter 必须输出显式含义，Audio Runtime 不重新解释 Catalog 或来源默认值；
- Studio Grand V1 的声明可播放范围为 MIDI Pitch `21...108`；该范围内每个 Pitch 必须落入
  一个明确 Sample Zone，Zone 重叠或空洞由 Manifest 校验拒绝；
- 当前上游 JSON 的最后一个 Zone 延伸到 `119`，规范化 Manifest 必须显式裁剪到已选择的钢琴
  产品范围 `21...108`，不能让上游范围偶然成为产品语义；
- 范围外 Note 仍是合法 Project Fact，但 Studio Grand 不为它发声，并按 Track 聚合为
  unsupported-pitch diagnostic；不得擅自 Clamp 到钢琴边界；
- 使用 Zone root pitch 与 `tuneCent` 计算 `playbackRate`；
- 公式和正负方向在 Manifest contract test 中用已知 pitch vector 固定；
- 当前 Studio Grand Mapping 有 30 个 pitch Zone，但没有可证明多力度层切换的字段；Velocity
  首版候选映射为 `velocity / 127` 的 Voice Gain，再乘 Track 和 Master Gain，这只能改变音量，
  不能宣称真实还原钢琴随击键力度变化的音色，最终曲线和产品表述在 Gate C 听觉审阅中确认；
- Pan 使用 Track `[-1, 1]` 的稳定事实；
- 没有有效 loop metadata 的 Zone 在 Sample 短于 Note 时不得自行循环；有有效 loop 的 Zone
  必须按 Mapping 循环，并在 Gate C.2 确认 loop-through-release 的听觉边界；Studio Grand 属于
  前一种无 loop 情况；
- Sample 长于 Note 时，Span End 的 Gain Ramp 曲线、持续时间、是否模拟制音器以及可保留的
  release tail 都是 Gate C 候选，不把上游 `release` 字段未经验证直接当成最终物理钢琴模型；
- Clip 边界同样结束逻辑 Active Note；听觉尾音可以按 Gate C 结果继续，但不能延长 Project
  Note Fact 或阻止 Voice Token 最终释放；
- Sustain、弦共鸣、踏板噪声、半踏板、release sample、多力度采样与更完整的物理建模不因
  “Studio Grand”名称被默认承诺；Gate C 必须明确 V1 最小听觉目标及延期项；
- 同 Pitch 重叠 Note 必须拥有独立 `AudioBufferSourceNode` 和 Voice Token。

### 6.3 加载与缓存

- Batch 4A.2 已测得完整 30 WAV 为 31.57 MiB encoded / 63.14 MiB decoded Float32；稳定参考窗口
  `48, 60, 64, 67, 72` 的 5 WAV 为 6.49 / 12.98 MiB。localhost Chromium 的并发解码 smoke
  只证明执行路径可用，不构成远程下载 SLO；
- Batch 4B.1 已从当前完整稳定 Plan 按 Soundbank 聚合唯一 Pitch，经严格 Manifest 收集 resource
  key，并在进入 Playing 前准备全部计划所需 Zone；不默认解码完整 Instrument，也不只准备首个
  Scheduler horizon；
- 任一计划必需 Zone 失败则准备失败并允许重试；未被当前计划引用的缺失 Zone 不阻断。当前首验
  使用同源可寻址 Manifest/WAV；未来 ZIP 交付可能仍先取得完整 Bundle，但解码集合继续按计划
  裁剪并复用已实现的受限 ZIP 边界；
- Manifest / WAV response 都由 Composition Root 提供正整数 byte budget；WAV 在 decode 前严格
  验证，逻辑 POSIX resource key 在 URL 边界逐段编码；
- 同一 Manifest / resource 的并发请求去重；单个等待者取消不误伤其他等待者，最后一个等待者
  离开才中止底层 Fetch；失败 Promise 被移除，允许下次重试；
- 成功 AudioBuffer 进入应用生命周期可丢弃缓存，提供 active request、Manifest、decoded resource
  与 Float32 byte 统计；`clearDecodedResources()` 和幂等 `dispose()` 清理引用，缓存不拥有或关闭
  注入的 AudioContext；
- 在满足所选加载门槛前 Transport 不进入 Playing，UI 显示 `Loading instrument…`；
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

Batch 5A 已按以下 UI 契约实现并通过功能审核；进一步优化留待后续讨论：

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
- V1 没有 Meter 数据时不继续显示会被理解为实时电平的 `0.0 dB`；当前实现显示明确不可用的
  `Meter —`。

### 7.3 Batch 7 时间轴与 Playhead

首次可听闭环已经用稳定的当前时间显示完成声音验收。Batch 7 继续补齐桌面 DAW 中用于定位
播放位置的基础空间语义，但不借此引入 Seek / Scrub、Zoom 或完整 Arrangement Editing。

实现遵守：

- Arrangement 和当前打开的 Piano Roll 读取同一 Transport Position；
- 位置来自 `AudioContext.currentTime` 对应的 Transport Mapping，而不是累计
  `requestAnimationFrame` delta；
- `requestAnimationFrame` 只刷新视觉；tab 降频后恢复时重新读取权威运行时位置；
- 浏览器支持 `getOutputTimestamp()` 时可以做纯视觉 latency compensation，但不能改变
  事件调度时间；
- 高频位置不写入 Project、Pinia 或 Project Commit Subscription；
- Playhead 层独立于静态 Grid 和 Note / Clip Scene，移动 Playhead 不重建全部内容；
- 右侧 Arrangement 时间内容持有唯一真实纵向滚动权威和唯一 `scrollTop`；左侧 Track 控制列
  是裁切的合成层从视图，不维护第二套滚动状态。横向滚动只作用于 Ruler 与 Lane，原生滚动轨道
  不延伸到 Track 控制列下方；
- 当前项目时间轴至少覆盖 150 个初始拍号小节；MI7 Batch 4 后，内容接近或超过该范围时从最远
  Clip End 向上补齐完整小节，并保留 8 个尾部小节。该范围是从 Project Facts 派生的 View /
  Playback 边界，不写入 Project File，也不使旧项目变 dirty；
- Transport 到达派生时间轴末端时自然停止；没有可听 Note 的 Empty Plan 仍保持不可播放；
- Arrangement Follow 默认开启并采用分页式自动滚动。用户主动横向滚动或进行时间轴编辑时，
  当前播放轮次暂停 Follow，用户可通过可见控制重新启用；
- Piano Roll 把同一全局 Transport Tick 投影为当前 Clip 的局部位置；位置在 Clip 范围外时隐藏，
  不为了显示 Playhead 扩大 Clip 或执行 Note Chase；
- V1 没有拖动 Playhead Seek；后续 Ruler Interaction 单独设计命中、Capture 和 Snap。

## 8. 播放中编辑与 revision 交接

### 8.1 基本规则

初次编译使用一个 Snapshot 的 `modelRevision`。Playback Coordinator 订阅 Project Commit：

- Save / Checkpoint 不产生 Project Commit，不使正在播放的计划失效；
- Note Add / Move / Resize / Remove、Clip / Track / Instrument 变化、Undo 和 Redo 都必须使
  相关未来事件失效；
- 新计划必须明确对应新的 `modelRevision`；原子安装时再产生新的 `engineGeneration`；连续多次
  Commit 可以在资源准备期间合并到一个最终安装 generation；
- generation 只控制后续 Scheduler / Runtime 接受哪个调度批次，不再隐含结束全部旧 Voice；
- V1 同一主线程内同步安装新 generation，不建立无真实异步消费者的 generation ACK；
- 外部音频失败不回滚 Project Commit；Runtime 可以保留安全旧计划或停止，但必须报告状态；
- Playback 使用完整的新旧 Audible Plan 判断真实听觉变化；Commit / Delta 保留操作来源和连续性；
- 连续 Commit 链可以合并；如果实际观察链出现 gap，丢弃增量、从完整 Snapshot 重建并进入全局
  安全兜底。

### 8.2 选择性生效策略

当前 `200 ms` look-ahead 是实现参数，不是用户可见的编辑冻结区。一次相关 Commit 按三个时间
状态处理：

| Project Fact 变化             | 尚未调度         | 已调度但未开始                   | 正在发声                                                      |
| ----------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------- |
| Note Add                      | 使用新 Note      | 起点仍在当前位置之后则补调度     | 起点已过去则不 Chase                                          |
| Note Delete                   | 不再调度         | 取消旧 Voice                     | 只快速释放该 occurrence                                       |
| Note Move / Pitch             | 使用新位置与音高 | 取消旧 Voice，并按未来新起点重排 | 释放旧 Voice；新起点在未来才重排，不立即重触发                |
| Note Resize                   | 使用新范围       | 取消并重排                       | 新终点已过去则释放；仍在未来则调整 Note Off；进入尾音后不复活 |
| Velocity / Channel            | 使用新值         | 取消并重排                       | 不改变已触发 Voice，留到下一次 Note On                        |
| Clip / Track Remove           | 不再调度其内容   | 取消其 future Voice              | 只释放所属 Clip / Track Voice                                 |
| Instrument Replace            | 新事件使用新音源 | 取消该 Track 旧事件              | 只释放该 Track，其他 Track 继续                               |
| Tempo / 全局路由 / 不可信状态 | 完整重建         | 全部取消                         | 允许全局 `allNotesOff`                                        |

实现可以在原子切换时取消并重建全部尚未开始的旧队列，因为它们尚未产生声音；活动 Voice
必须按 occurrence / Track 选择性保留或结束。已经开始由声卡渲染的结果无法倒放撤回，极靠近
当前时刻的取消是 best effort。Undo / Redo 使用其还原操作的同一语义。

Tempo Map 属于全局时间映射，Studio 以 Commit Delta 中的 Tempo Event added / updated / removed
Change 识别变化。Add、Move、Remove、Replace BPM 及其 History 回放共用完整 handoff：Stopped /
Paused 保持状态，Playing 先 Pause 并允许全局 `allNotesOff`；三种状态都保留连续音乐 Tick，只按
新 Tempo Map 重算 ProjectSecond，且不会自动恢复播放。

Gain / Pan / Mute 最终应通过持久 Track Bus 实时作用于持续声音；当前没有对应 Project Command
和 Track Bus，本阶段不脱离真实编辑能力提前建设 Mixer Graph。

### 8.3 安装顺序与资源准备

1. 从新 Snapshot 编译完整 Audible Plan，并与已安装 Plan 形成 reconciliation；
2. 立即禁止旧 Scheduler 再产生已失效 occurrence / Track，并按表处理已交付 Voice；
3. 异步准备新 Plan 需要的资源；期间未受影响的旧内容继续播放；
4. 丢弃 stale preparation，只让最新连续 revision 进入安装；
5. 读取当前听觉位置、递增 generation、取消旧 queued Voice，并原子安装新 Transport / Scheduler；
6. 从当前位置之后填充新 look-ahead；不 Chase 已经越过起点的 Note；
7. 旧 Runtime 在其保留 Voice 全部结束后释放。

首次 Play 的资源准备继续 fail-fast。只有已经安装安全旧 Runtime 的连续选择性 handoff 才允许
按 Soundbank 跳过不可用 Instrument：目标 Track 立即停止旧 Voice、后续保持静音并显示明确
warning，其他已准备 Track 与活动 Voice 继续；不得把缺失音源静默替换成 Studio Grand。结构性
Plan 错误、Commit gap、全局路由变化和无法归属到单一 Instrument 的失败仍走全局安全兜底；
Tempo Map 变化使用上述保留 Tick、停止旧 Voice 且保持 Paused 的完整 handoff。

### 8.4 交互 Preview

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
├── sample-instrument/
│   ├── contract/       Supported SFZ Profile、Manifest 与资源格式边界
│   ├── assets/         来源 Adapter 与受限资源容器
│   └── loading/        Zone 选择、资源缓存与 Plan 资源准备
├── context/
├── soundbank/
├── voices/
└── scheduler/
```

## 10. 实施批次

Gate A 已随 Batch 1A 关闭；Gate B 的 Compiler 与 Transport 部分分别随 Batch 2B 和 Batch 3A
关闭。Gate C 现拆成资产边界、Manifest 语义、资源容器与真实声音四个可独立审阅的子 Gate：

- Gate A（2026-08-11 已关闭）：确认 Studio Grand Device Definition 与 Replace Command 形状；
- Gate B（2026-08-11 已关闭）：按第 1.5 节处理 unsupported content 与零 Note Span，并按第
  3.4 节处理 Transport、自然结束和逻辑 release-tail 边界；真实声音的 release 行为仍属 Gate C；
- Gate C.0（2026-08-12 已关闭）：当前快照只作 developer-local 验证输入，
  记录来源与指纹，保留在忽略的 dev public 并从 dist 排除；再分发证明只阻断公开交付采样，不
  阻断本地 Runtime；
- Gate C.1a（2026-08-12 已关闭）：确认 Supported SFZ Profile V1、Manifest V1、严格 validator
  与默认内置 Mapping Adapter；逆向分析只作为来源兼容证据，不定义宿主默认值；
- Gate C.1b（2026-08-12 已关闭）：确认受限 ZIP / WAV 边界、资源完整性、本地生成映射与输出
  形状；
- Gate C.2（2026-08-13 工具、客观测量与人工试听已审）：浏览器加载和单音发声成功，当前
  linear release 无明显 click；Batch 4B.1 已按加载建议实现并通过审阅。Batch 4B.2 的包络、
  velocity 与 Voice 行为也已通过审阅；首次 Studio 闭环采用 capability-based Chrome-first。

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

- Gate B 中 Transport / 原始 Arrangement End / logical release-tail boundary 规则关闭；其中自然
  结束边界已在 Batch 7B 被派生 Timeline End 规则取代；
- Project Second / Playback Clock Second 边界；
- stopped / playing / paused 状态按确认结果落地；
- engineGeneration、注入时钟与虚拟时钟测试；
- 不接 AudioContext，不接 Studio，完成后停止审阅。

### Batch 3B：Scheduler Planner

> Implementation status: reviewed and committed as `145b3ab`. Playback type-check and 6 test
> files / 75 tests pass; repository `pnpm lint` and `pnpm check` pass.

- look-ahead window、连续 cursor、generation 与 occurrence 去重；
- Scheduled Voice Plan 同时携带 Start / release 目标时刻；
- late / drop policy 按 Gate 结果实现；
- 不建立跨线程 ACK，完成后停止审阅。

### Batch 4A.0：本地验证资产边界

> Implementation status: reviewed and committed as `4b0b5b2`. Repository `pnpm lint`, Studio
> type-check and guarded production build pass; Vite dev serves the recorded Studio Grand Mapping
> while production `dist` excludes all public Soundbank assets.

- 完整开发快照保留在忽略的 `apps/studio/public/soundbanks`，供本机 Vite dev server 使用；
- 记录 Studio Grand 的本地来源链、输入指纹以及“不作为 Seele 可分发资产”的产品分类；
- Vite production build 关闭整个 public 复制，favicon 进入模块资产管线；build / preview 额外
  拒绝 dist Soundbank；
- 不生成 Manifest、不解压 WAV、不实现加载器或 Audio Runtime，完成后停止审阅。

### Batch 4A.1a：Supported SFZ Profile、Manifest Contract 与默认内置 Adapter

> Implementation status: reviewed and committed as `4993f16`. Audio Web type-check and 3 test
> files / 17 tests passed; a developer-local compatibility audit also normalized all 289
> MIDISampleSynth mappings / 4,664 zones without adding the source assets to repository fixtures.

- 建立明确限定的 Supported SFZ Profile V1 常量；只声明已支持的 header、opcode、loop mode、
  WAV 媒体与 tune 范围，不把当前私有 Mapping 当成宿主规范；
- 建立浏览器无关的 Sample Instrument Manifest V1 类型与严格 decoder / validator；
- Manifest 显式表达 range / exact-key、one-shot / gated、continuous / sustain loop、tune、offset、
  attack / release、exclusive group、字段单位与安全相对 WAV resource key；
- 默认内置 Mapping Adapter 只在自身边界内处理 `category=kit`、缺失 `loop_mode`、bank release、
  `mutexSets`、source-frame offset 和 URL basename 等兼容规则；
- 使用 Studio Grand、loop、envelope / one-shot、mutex、offset、URL 编码文件名与上游乱序 range
  的合成输入固定 contract，并拒绝未知字段、非零 crossfade 和歧义控制；
- 最终 Adapter 结果统一经过 Manifest validator；原始镜像、上游远程 URL 和绝对路径不进入
  Manifest、测试 fixture 或可分发构建；
- 不实现 SFZ 文本 parser、ZIP、Catalog 工具、AudioContext 或真实发声，完成后停止审阅。

### Batch 4A.1b：受限 ZIP Adapter 与本地规范化工具

> Implementation status: reviewed and committed as `07f4218`. Audio Web type-check and 7 test
> files / 38 tests passed. The recorded local input generates 30 WAV files, a 30-zone Manifest
> covering MIDI `21...108`, and a preparation report; repeated generation is idempotent.

- 引入第三方 ZIP 解码库，并在外层验证 entry path、数量、单文件 / 总解压大小、压缩比、取消和
  错误分类；可信 checksum 由具体调用方提供；
- 以本地 Catalog / Indexes 反向定位资源与 General MIDI 语义，以 Mapping Adapter 生成 Manifest；
- 明确 stable `studio-grand` 到本地输入 `studio-grand-v2-v4` 的开发期映射；
- 核对已记录的输入指纹，生成忽略的本地 Manifest 并提取选定 WAV Archive；
- 在 Bundle 资源验证中确认文件存在性、WAV 格式、loop / offset 不超出 decoded duration 与
  Studio Grand MIDI `21...108` 产品裁剪；
- 当前 raw Archive 与未来后端 Bundle 复用受限容器边界，但不在 Studio 启动时扫描任意 ZIP 或
  完整资源树；
- 不实现完整 Catalog、M4A 自动协商、AudioContext 或真实发声，完成后停止审阅。

### Batch 4A.2：加载测量与听觉 Gate

> Implementation status: reviewed on 2026-08-13. Audio Web type-check and 9 test files / 47 tests
> pass; Studio type-check and 40 test files / 218 tests pass. Chromium fetched/decoded both the
> 5-resource reference window and all 30 resources, activated AudioContext only after a click, and
> scheduled the audition release graph. Human listening succeeded in the user's browser and the
> Codex Chromium; the current `0.133 s linear release` produced no perceived click.

- 通过 Studio 注入的开发期同源 asset base 使用本地生成的 Studio Grand 资源；
- 用真实资产听觉审阅 Sample 短于 / 长于 Note、Note Off、release tail、velocity 表现与 V1
  钢琴真实性边界；
- 测量全量 / 初始窗口加载量、解码后内存和失败恢复，确认 Batch 4B 加载策略；
- 记录本地验证结论，但不把当前采样纳入生产构建；完成后停止审阅。

### Batch 4B.1：Audio Web Sample 资源准备层

> Implementation status: reviewed and committed as `dc8ccfd`. Playback and Audio Web type-check
> pass; Playback 7 test files / 76 tests and Audio Web 12 test files / 75 tests pass.

- 当时 `@seele-daw/playback` 包根只新增 `AudibleMidiProjectPlan` type export，供首个真实 Audio
  Web 消费者使用；Compiler、Transport 与 Scheduler 直到 Batch 5A 出现 Studio 消费者才公开；
- 按完整稳定 Plan 的 Track route 聚合 Soundbank/Pitch，并拒绝 blocked、缺失/重复/inaudible route、
  缺失 asset location、Manifest identity 不一致和 unsupported pitch；
- 实现同源 Manifest/WAV Fetch、byte budget、严格解析/验证、AudioBuffer decode、Promise 去重、
  独立等待者取消、最后等待者中止、失败重试、应用生命周期缓存和资源统计；
- 未取消的空 Plan 成功返回零资源；准备结果携带 `modelRevision` 并使用冻结数组，不泄漏内部
  可变 Map；
- 不创建 Voice、AudioNode 或 AudioContext，不接 Transport/Scheduler/Workbench，不扫描 Catalog 或
  完整 Soundbank；完成后停止审阅。

### Batch 4B.2：Audio Web MIDISampleSynth Voice（Studio Grand 首验）

> Implementation status: reviewed and committed as `772210f` on 2026-08-13. Repository
> `pnpm check`, changed-scope Oxlint /
> ESLint and formatting pass; Playback 7 test files / 76 tests and Audio Web 15 test files / 104 tests
> pass.

- AudioContext activation/lifecycle 与最小 master output；
- 按 Gate C 结果实现 range / exact-key、trigger、loop、Pitch / Tune、Offset、Velocity、Gain、Pan、
  Envelope、Note Off 与 mutex；
- Voice Token、cancel、allNotesOff 与 Voice/Node 资源统计；
- Fake Web Audio contract tests；
- 不接 Workbench UI，完成后停止审阅。

实现并经审阅固定以下首版语义：

- 构造时保持 dormant，只有 `activate()` 才创建 / resume AudioContext；master output 为唯一 Gain；
- `curve: null/0` 是 linear amplitude，非零 curve 使用 Seele V1 的归一化指数 shape 与分段原生
  ramp；当前数值边界为 `[-10, 10]`；
- Velocity 为 `velocity / 127`，Voice Gain 再乘 Track Gain，Master Gain 由 master node 应用；
- gated Note Off 使用 Zone release；`off_mode=normal` 同样进入 Zone release；cancel、generation
  切换、`allNotesOff` 与 `off_mode=fast` 使用 `6 ms` linear fast release；
- `continuous` loop 贯穿 release；`sustain` loop 在 Note Off 切到无 loop tail；one-shot 忽略普通
  Span End，但仍可被 cancel / allNotesOff / mutex 强制结束；
- Voice Token 使用 `(engineGeneration, occurrenceKey)`；旧 generation 丢弃，重复 token 拒绝；
  Runtime 不创建 Timer，dispose 后 Voice/Node/Listener 统计归零；
- `StereoPannerNode` 缺失时仅中心 Pan 可退化为 Gain pass-through，非中心 Pan 明确失败，不偷偷
  改变 pan law。

### Batch 5A：Studio Transport 与首次可听闭环

> Implementation status: reviewed on 2026-08-13; the core runtime was committed as `7242a52` and
> the UI is recorded in the following split commit. Playback type-check and 7 test files / 76 tests,
> Audio Web type-check and 16 test files / 105 tests, and Studio type-check and 42 test files / 230
> tests pass. Full repository verification and an in-app Chromium runtime smoke also pass. Further
> listening and interaction refinements are deferred for separate discussion and are not claimed by
> this functional review.

- Composition Root 创建 Project Playback Coordinator；
- 用户手势内 prepare / load / resume / play；
- 按 Gate B 接通 Transport、快捷键与当前时间显示；
- Loading、Missing Instrument、Unsupported Clip 和 Runtime Error 反馈；
- 项目切换与应用 dispose；
- 浏览器自动渲染 smoke 与至少一次真实 Chrome 人工听觉 smoke；
- 更新 DESIGN / PRODUCT 后停止审阅。

当前实现采用以下具体边界：

- Coordinator 使用 `25 ms` wake cadence 与 `200 ms` look-ahead horizon；这些是 Studio 当前
  产品参数，不写进 Playback 文件协议；
- 首个 Play 在同步用户手势调用链起点激活 AudioContext，再异步准备完整稳定 Plan 实际引用的
  Manifest/WAV；Loading 不重复；
- Package root 只公开 Studio / Audio Web 已存在的真实消费者所需 Compiler、Clock、Transport、
  Scheduler 与 Runtime 表面；
- Play 在 Playing 时显示 Pause，Return to Start 在 Loading / Playing / 非零位置可用，时间显示
  `mm:ss.mmm`，Record / Loop 保持 Disabled，伪 Meter 改为 `Meter —`；
- `Space` 位于 Workbench Scope，可编辑元素、IME composing 与 Navigation Modal 继续优先；
- Empty Plan 只通过 Disabled Play reason 安静反馈，不在打开 Workbench 时弹 Toast；Partial 与
  Runtime failure 使用 Toast / 邻近 reason；
- Project switch、应用 dispose、加载竞态与 Runtime failure 都会停止 Timer、失效 / 释放 Voice，
  且不修改 Project Fact；失败允许重试；
- Batch 5A 交付时，任何 Project Commit 会安全停止旧 playback lifetime 并从 Tick `0` 重编译；
  该历史限制已由 Batch 6 的选择性 handoff 取代，不能再描述为当前行为；
- Studio 只为 `studio-grand` 注入 dev-local asset base；其他合法 MIDISampleSynth 仍能编译，但
  缺失 location 时明确失败，不静默跳过或替换。

### Batch 5B：历史 Playhead 候选

该候选没有在 Batch 5 后直接实施。用户已把它扩展为包含时间轴范围、编排滚动、播放末端与
Follow 语义的 Batch 7；后续以 Batch 7 的分批边界为准，不能把本节重新当作独立实现入口。

### Batch 6：选择性 Playback Reconciliation 与阶段加固

> Implementation status: Batch 6A–6F reviewed on 2026-08-14. Full `pnpm lint` and `pnpm check`
> pass, including 8
> Playback files / 86 tests, 16 Audio Web files / 110 tests, 42 Studio files / 246 tests, Studio
> production build and the soundbank dist boundary. No Batch 6 E2E was added. No phase checkpoint
> or tag has been created.

- **6A Reconciliation Contract**：完整 Plan 差异、Commit 链验证、occurrence / Track 失效计划；
- **6B Transport Plan Handoff**：保留当前位置、单调 generation、新 Plan Anchor 与 Scheduler；
- **6C Selective Voice Lifecycle**：generation 与断音解耦、Voice handle、cancel、Note Off 重排；
- **6D Studio Note Reconciliation**：Note Add / Move / Resize / Delete 与 Undo / Redo 连续生效；
- **6E Track / Instrument Reconciliation**：Track / Clip 生命周期、Instrument Replace 与异步资源；
- **6F Hardening**：gap / stale / failure 兜底、Pause / Resume、项目切换和资源泄漏回归；
- 完整 `pnpm lint`、`pnpm check` 与生产构建；本阶段不新增 E2E，若未来需要浏览器产品流自动化，
  另行采用 Playwright 建设；
- Batch 6A–6F 已完成统一逐提交审核；Audible MIDI Playback V1 继续进入 Batch 7，当前不创建
  checkpoint tag。

Batch 6 的每个独立批次均已按约定形成单独提交并完成统一审核。

### Batch 7：时间轴范围、滚动与播放头

> Implementation status: approved for implementation on 2026-08-14. Batch 7A starts after this
> documentation closure commit. Each independent Batch 7 implementation stops for user review
> before commit. No E2E is required; future browser flow automation may use Playwright as a
> dedicated slice.

Batch 7 不改变 Project File V1，也不提前建设 Zoom、Seek、Scrub 或 Arrangement Clip Editing。
它按以下顺序实施：

#### Batch 7A：编排区共用纵向滚动

> Implementation status: reviewed and committed as `42e5a0b`.

- 该提交最初把 Track 控制行和对应 Arrangement Lane 放入同一个纵向滚动容器，以 DOM 行配对
  保证同一水平高度；
- 它确立了单一纵向滚动权威：鼠标位于左侧控制区或右侧 Lane 时都移动同一位置，不能维护两套
  可漂移的 `scrollTop`；
- Track 标题、Add Track、Ruler 与 Lane 标题固定在滚动内容上方；
- 本批不改变横向时间轴宽度、播放行为、Project Fact 或 Track 排序 / 高度。

Batch 7B 的可视布局审核发现，共用二维滚动容器会让原生横向滚动轨道延伸到 Track 控制列下方。
后续主从组合保留 Batch 7A 的“单一权威”产品不变量，但不保留“必须位于同一个 DOM 滚动盒”
这一实现方式。

#### Batch 7B：派生时间轴范围

> Implementation status: reviewed and complete on 2026-08-14. Playback 9 files / 93 tests,
> Audio Web 16 / 110 and Studio 42 / 252 pass; affected type-checks, architecture lint and the Studio
> production build also pass. Real-browser layout smoke confirms the Arrangement-only horizontal
> scrollbar, Track follower alignment and Track-area wheel forwarding.

- 定义 `minimumTimelineEndTick = initialBarSpanTick * 150`；默认 4/4、PPQ 960 项目对应
  `576000` Tick；
- 定义 `contentEndTick = max(clip.startTick + clip.spanTick)`。Batch 7B 当时以
  `timelineEndTick = max(minimumTimelineEndTick, contentEndTick)` 作为 Ruler 与 Lane 的共同末端；
- MI7 Batch 4 后续保留精确 `contentEndTick`，并把共同末端修订为至少 150 小节、向上补齐完整
  内容小节后再增加 8 个尾部小节；
- 该最小范围适用于新旧项目，是确定性的派生规则，不写入 Project、不给旧项目制造迁移或 dirty；
- 空项目与短项目仍显示至少 150 小节；内容越过该位置时自动扩展，不裁剪 Project Fact；
- 右侧 Arrangement 成为唯一真实二维滚动容器；Ruler 与全部 Lane 使用同一横向位置，原生
  横向滚动轨道从 Arrangement 边界开始；
- 左侧 Track 控制列是无独立 `scrollTop` 的裁切从视图，通过合成层位移跟随 Arrangement 的
  纵向位置。Track 区域滚轮转发到 Arrangement；焦点进入被裁切行时由 Arrangement 显示该行；
- Track 控制行与 Lane 继续消费同一排序和固定行高，保留 Batch 7A 的行对齐与单一权威不变量；
- Transport 自然结束从原始 `arrangementEndTick` 切换到 `timelineEndTick`。短项目允许在内容结束后
  播放静音直到时间轴末端；没有可听 Note Span 的 Empty Plan 仍不可启动；
- 到达时间轴末端时停止 Transport，并对仍在发声的 Voice 使用现有无 click 的安全释放。

#### Batch 7C：共享视觉位置源

> Implementation status: reviewed, committed and pushed as `c9b4a02`. Studio owns one
> frame-sampled visual position projection. Architecture lint, affected ESLint / Oxlint, Studio
> type-check, Studio 42 files / 254 tests and the Studio production build pass.

- Studio 从 Transport / Playback Clock 派生可供视图读取的当前 Tick 与状态，不维护第二套累计
  时间；
- `requestAnimationFrame` 只驱动视觉采样，后台恢复时重新读取权威 Transport Position；
- 高频视觉帧不进入 Project、Pinia、History、dirty 或 Commit Subscription；
- Pause、Return、自然结束、项目切换与 dispose 后的视觉位置和订阅生命周期可重复验证。
- 普通 Playback State 只发布 Play / Pause / Return / 自然结束 / 项目切换 / 失败等低频转换；
  Scheduler 的 `25 ms` cadence 只规划音频，不再承担 UI 位置发布；
- Vue Binding 同时暴露低频状态和只读视觉位置，并保证最多只有一个待处理动画帧。既有 Transport
  时间显示已切换到该视觉位置；Arrangement 与 Piano Roll 的可见 Playhead 仍分别属于 Batch 7D
  与 Batch 7E。

#### Batch 7D：Arrangement Playhead 与 Follow

> Implementation status: reviewed and committed as `3571acd` on 2026-08-17. The Playhead updates
> one transform-only layer. Architecture lint, affected ESLint / Oxlint, Studio type-check, Studio
> 43 files / 262 tests and the Studio production build pass.

- Ruler 与 Lane 上显示同一条不可交互 Playhead，使用独立轻量图层移动；
- Follow 只驱动 Batch 7B 已建立的 Ruler / Lane 横向滚动，左侧 Track 控制列继续保持固定；
- Follow 默认开启，使用分页式而非持续居中的自动滚动，避免播放时视图不断抖动；
- 用户主动横向滚动或进行时间轴编辑时，当前播放轮次暂停 Follow；可见 Follow 控制允许立即
  恢复，不把该状态保存为 Project Fact；
- Playhead 不接收 Pointer 命中，不实现点击定位、拖动 Seek 或 Scrub。
- 高频位置只使独立 Playhead 子组件更新 `translate3d(...)`，不动态修改 `left` / logical inset，
  也不让静态 Ruler、Lane 或 Clip Scene 消费视觉位置；
- 每次进入 Playing 时重新默认开启 Follow；程序化分页跳转不会被后续原生 `scroll` 事件误判为
  用户中断。手动横向滚动、Pointer 时间轴操作和对应 Keyboard 操作会暂停本次 Follow。

#### Batch 7E.0：Clip Focus Piano Roll Playhead 基线

> Implementation status: reviewed and committed as `7531677` on 2026-08-17. The Clip-local Piano
> Roll reads the shared visual position through one transform-only child layer. Architecture lint,
> affected ESLint / Oxlint, Studio type-check, Studio 45 files / 266 tests and the Studio production
> build pass.

- 当前 Piano Roll 读取与 Arrangement 相同的全局 Transport Tick；
- 用 `globalTick - clip.startTick` 投影为 Clip 局部位置，只在 `[0, clip.spanTick]` 范围显示；
- 切换 Selection、Clip、项目或退出编辑器时更新 / 清理投影；
- 当前完整 Clip 视口不增加 Zoom、Scroll 或自动跟随，也不改变 Note 编辑手势。
- 高频位置只更新独立 Playhead 子组件的 `translate3d(...)`；Canvas Grid、DOM Note Scene 与
  Editor Session 不消费 Transport 视觉帧；
- `clip.startTick` 由 Studio Presentation 显式提供，不能用代表 MIDI Source 读取偏移的
  `sourceStartTick` 代替。项目身份不匹配、全局位置位于 Clip 外或编辑器卸载时不保留旧投影。

该提交是后续 `Clip Focus` 模式的可复用基线，不再被视为 Piano Roll 最终唯一时间语义。用户
审核发现，仅显示完整 Clip 会允许 Piano Roll 与 Arrangement 对 Clip 边界产生不同理解；因此
以下双模式校准已经确认，并拆成独立可审阅批次。

#### Batch 7E.1–7E.5：Piano Roll Track / Clip 双模式校准

> Implementation status: Batch 7E.1–7E.5 were reviewed and committed as `5e50228`, `113aabb`,
> `4d935fd`, `ea87d53` and `78ee8ea`. Track mode projects the shared global Transport Tick through a
> transform-only Playhead and independently pages its horizontal viewport while Follow is active.
> Clip Focus retains its Clip-local projection and full Clip viewport.

一个 Project MIDI Clip 仍是唯一权威实体，Piano Roll 不创建第二份 Clip Fact。两种模式只是
同一 Track / Clip / MidiSource 图的不同投影：

- `Track` 是默认模式，使用全局 Project Tick，显示当前 Instrument Track 的全部 MIDI Clip 与
  其中可见 Note；
- `Clip Focus` 是可选模式，复用 Batch 7E.0 的 Clip-local Viewport，只编辑当前 Clip；
- 编辑模式属于 Studio 应用生命周期偏好，不进入 Project File、History、dirty、Checkpoint 或
  Pinia 中的 Project Session 所有权；
- 非循环 Clip 中 Note 的全局位置固定为
  `clip.startTick + note.startTick - clip.sourceOffsetTick`；Clip 末端继续只由
  `clip.startTick + clip.spanTick` 派生，不增加重复 `endTick` Fact；
- 当前重叠 Clip 都是合法 Project Fact。Track 模式命中已有内容时以显式 Active Clip 作为编辑
  目标，不根据视觉重叠猜测；
- looped Clip 先保留可见但明确不可编辑，等待循环实例与 Source 写回语义单独确认。

Track 模式 Pencil 在全局时间轴上的首版自动放置规则已经确认：

| Pointer 位置                                 | Clip / Note 结果                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| 位于一个非循环 Clip 内                       | 写入该 Clip；若重叠区域存在多个 Clip，Active Clip 优先，否则必须先显式选择，不能猜测 |
| Note 起点在 Clip 内、尾端越界                | 在不跨越下一 Clip 的前提下原子扩展该 Clip 右端并创建 Note                            |
| 位于左侧相邻 Clip 末端之后不超过一个当前小节 | 若扩展不会碰到下一 Clip，原子向右扩展该 Clip 并创建 Note                             |
| 更远的空白区域                               | 从包含 Pointer 的小节边界创建新的非循环 Clip / MidiSource，并在同一次提交中创建 Note |
| 位于既有 Clip 之前                           | 创建新 Clip，不在 V1 自动左扩已有 Clip                                               |
| 目标是 looped Clip 或归属仍有歧义            | 不提交并显示明确原因                                                                 |

任何自动扩展都不得越过下一 Clip；创建 / 扩展 Clip 与创建 Note 必须表达为一次产品意图、一次
原子 Project Command、一个 Commit 和一个 History 步骤，不能由 Studio 串联多次 Command
模拟事务。

实施顺序：

1. **Batch 7E.1：共享 Track 全局 Read Model 与 Scope 状态。** Editor 从 immutable Snapshot
   投影 Track 上排序后的 Clip window 与全局 Note 位置；Studio 只建立默认 `Track` / 可选
   `Clip Focus` 偏好。本批不改变现有可见 Surface，也不写 Project Fact。
2. **Batch 7E.2：原子 Clip 边界与 Note 放置。** Project Core 增加真实产品命令，覆盖新建
   Clip / MidiSource / Note 和向右扩 Clip / Source 后添加 Note，并定义 Undo / Redo、Delta、
   Query 与冲突验证。当前本地实现使用 `midi-clip.add-with-note` 与
   `midi-clip.extend-with-note` 两个显式产品命令；普通 Note Add / Move / Resize 仍保持严格
   Source 边界，looped Clip、向左扩展与通用 Clip Resize 没有被顺带放宽。Playback
   Reconciliation 能把 Clip Update 归因到受影响 occurrence；Studio 在播放中选择性接管这两个
   Command，并在右扩暴露活动 Note 尾部时重排 release，不执行 Voice restart 或 all-notes-off。
3. **Batch 7E.3：Track 模式 Surface。** Studio 接入 Track Ruler、Clip window、横向滚动、
   Active Clip 与放置 Preview；Clip 变化继续直接反映到 Arrangement。
4. **Batch 7E.4：Clip Focus 适配与可见切换。** 同一 Surface 提供模式切换，Clip Focus 禁止在
   当前 Clip 外自动创建或扩展其他 Clip；切换模式不产生 Project Commit。
5. **Batch 7E.5：双模式 Playhead / Follow。** Track 模式直接投影全局 Tick 并按分页规则跟随；
   Clip Focus 继续使用 `globalTick - clip.startTick`，两者仍只消费同一共享视觉位置。

每个子批次继续独立停止审阅，不能把 Core 事务、Editor 投影与 Studio UI 合并成一个不可审阅
提交。

#### Batch 7F：加固与文档同步

> Implementation status: reviewed on 2026-08-17. The coverage audit found direct existing
> regressions for every listed lifecycle and Timeline boundary except explicit browser background
> frame throttling. One Vue binding test now models a suspended animation-frame source and proves
> that foreground recovery samples the latest authoritative Transport position without accumulating
> frame time. No production API, Project fact or E2E scope was added.

- 回归多 Track 行配对、150 小节最小范围、超长 Clip 扩展、自然结束与无残留 Voice；
- 回归前台 / 后台视觉恢复、手动滚动暂停 Follow、Return、Pause、项目切换与 dispose；
- 运行 lint、type-check、全部测试和 Studio production build；按约定不新增 E2E；
- 同步 PRODUCT、DESIGN、Playback / Audio Web README 与架构校准；全部 Batch 7 提交经用户审核后，
  Audible MIDI Playback V1 已按第 13 节完成收口，checkpoint tag 仍保持独立且尚未创建。

当前自动化证据映射：

| 验收场景                                       | 直接证据                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 多 Track 行配对、单一纵向滚动权威              | `ProjectWorkbenchArrangement.spec.ts`                                                       |
| 150 小节最小范围、超长 Clip 完整小节与尾部扩展 | `audible-midi-timeline.spec.ts`、`ProjectWorkbenchArrangement.spec.ts`                      |
| Timeline 自然结束与 Scheduler 停止唤醒         | `audible-midi-transport.spec.ts`、`audible-midi-scheduler.spec.ts`、Coordinator tests       |
| `allNotesOff` / dispose 后无残留 Voice / Node  | `voice-runtime.spec.ts`、`audio-context-runtime.spec.ts`、Coordinator tests                 |
| 后台帧停顿后恢复最新权威视觉位置               | `project-playback-vue-binding.spec.ts`                                                      |
| 手动滚动暂停、显式恢复与新播放轮次重置 Follow  | `ProjectWorkbenchArrangement.spec.ts`、`ProjectPianoRollTrackSurface.spec.ts`               |
| Pause、Return、项目切换、pending abort/dispose | Coordinator / Studio application、`resource-cache.spec.ts`、`audio-context-runtime.spec.ts` |

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
- range / exact-key 唯一 Zone 选择与 unsupported pitch；
- Pitch / Tune playbackRate、Offset 与 Velocity Gain vector；
- no-loop、`0/0`、有效 loop、loop-through-release 与 one-shot；
- attack / release override、mutex、Span End、Clip Boundary、cancel 和快速 release；
- old generation event 被丢弃；
- allNotesOff / dispose 后 Voice、Node、Timer 和 Listener 为零。

Audio Runtime 单元 / 集成测试可通过 `OfflineAudioContext` 或等价可观测渲染验证：

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
- 播放中远期 Note 编辑不截断无关活动 Voice，Delete / Move / Resize 只作用于目标 occurrence；
- Instrument Replace 只释放目标 Track；缺失新 Soundbank 显示 warning，其他 Track 继续；
- stale preparation、Commit gap、Pause / Resume、项目切换与 retired Runtime 回收可重复验证；
- Batch 7 的两个 Playhead 使用同一 Transport Position，编排 Track / Lane 纵向滚动不漂移；
- 时间轴至少覆盖 150 个初始拍号小节；超长 Clip 末端向上补齐并保留 8 个完整尾部小节，Transport
  在该共同末端停止；
- Arrangement 手动横向滚动暂停当前轮次 Follow，Pause / Return / 后台恢复不产生第二套时间；
- Record、Loop 和 Output Meter 不伪装为已接通。

### 11.4 浏览器验证边界

Batch 5A 已完成人工听觉 smoke。Batch 6 不新增 E2E 或把人工浏览器操作作为提交门槛；以下场景
保留为以后 Playwright 与专门兼容性批次的候选验收清单：

1. Chrome 中创建 Track / Clip / Note；
2. 首次 Play 能经过用户手势解锁并听见 Studio Grand；
3. Pause / Resume / Return to Start 无残留 Voice；
4. 不同 Pitch、Velocity 与重叠 Note 可辨认；
5. Move / Resize / Delete / Undo 后不播放旧事件；
6. Save、刷新、Open 后 Instrument 与 Note 仍可播放；
7. 切换项目和离开 Workbench 后立即静音。

## 12. 明确延期

本阶段不实现以下能力。它们是已知且已接受的 V1 边界，不是阻塞本次收口的缺陷；后续必须由
独立产品目标、交互语义和技术 Gate 驱动：

- 完整 Soundbank Catalog、搜索、分类、收藏和最近使用；
- 任意 ZIP / 上游 schema 扫描、M4A / WAV 自动协商或全量 2.2 GB 资源索引；
- Sampler 编辑器、任意用户 Sample 导入或第三方 Plugin；
- FMSynth / VASynth 引擎及其 Web Audio、AudioWorklet 或 WASM 技术选择；
- 完整物理钢琴模型、多力度 Sample、制音器 / 弦共鸣、release sample 与踏板行为；
- 通用 Effect Graph、Graph Reconciler、RuntimeDelta 与跨线程 generation ACK；
- AudioWorklet、SharedArrayBuffer、WASM DSP；
- Transport Loop、Looped Clip、Metronome、Count-in、Record、Punch；
- Ruler Seek / Scrub 或播放范围 Selection；
- Piano Key / Note Preview Audition；
- Live Meter、Master Volume UI、Mixer、Effect Chain；
- Sustain Pedal、CC、Pitch Bend、Aftertouch、MPE；
- Note Chase、Preview Playback、Offline Export；
- 避免完整 Plan 编译 / Runtime 准备的 Range Index 与增量性能优化；当前已具备 occurrence / Track
  选择性声音语义，但仍以完整新旧 Plan 比较和完整稳定 Plan 准备为正确性基线；
- Audio Track、Audio Clip、Recording；
- Piano Roll Box Selection、Velocity、Zoom / Scroll；
- Arrangement Clip Move / Resize / Copy / Split 与完整 Interactive Snap V1。

这些能力必须由后续真实产品切片驱动，不能借 Playback V1 名义预建通用音频工作站框架。

## 13. 完成定义与收口结论

Audible MIDI Playback V1 已于 2026-08-17 完成收口，以下条件均已满足：

- 用户能够从 Project Fact 确认 Track 使用 Studio Grand；
- 用户创建的 MIDI Note 能按 Project 时间和 Pitch 发声；
- 经 Gate B 批准的 Transport、Project End、unsupported content 与 release 行为通过验收；
- Save / Reload 保留 Instrument 与内容；
- 编辑、Undo / Redo、项目切换不会留下旧事件或残留 Voice；
- Playback Core 不依赖浏览器，Audio Web 不读取 Project Model；
- Runtime 对缺失资源、浏览器拒绝和 stale generation 失败关闭；
- 本地验证采样的来源、指纹与构建排除边界已记录，规范化 Manifest 和加载预算通过相应 Gate；
- 任一公开构建都不包含当前本地快照；若产品需要自带采样，替代资产或覆盖该用法的再分发范围
  已另行确认；
- 自动化渲染、生产构建和真实浏览器听觉 smoke 通过；
- Arrangement 单一纵向滚动权威与 Track 从视图、派生时间轴、Arrangement / Track / Clip Focus
  Playhead，以及 Arrangement / Track 各自的分页 Follow 通过 Batch 7 产品验收；
- [产品功能手册](../../../PRODUCT.md)、[设计语言](../../../DESIGN.md)、
  [Playback README](../README.md) 与 [Audio Web README](../../audio-web/README.md) 已同步；
- 用户逐批审阅通过；阶段完成不依赖 checkpoint tag，当前未创建新的 tag。

阶段收口记录：

| 项目              | 结论                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| 实现与验收基线    | `f1d0298`，包含 Batch 7F 最终加固；Batch 1–6 与 7A–7F 均已审核                             |
| 自动化验证        | 113 个测试文件 / 1019 项测试，Workspace Type Check、Studio Production Build 与资产边界通过 |
| 浏览器验证        | Chrome 首次可听闭环人工 smoke 通过；Batch 7 未新增 E2E                                     |
| 本地采样分发边界  | 开发资源不进入 Studio Production Build；公开采样仍需独立资产或再分发授权                   |
| Checkpoint / Push | 未创建阶段 checkpoint tag，也未因文档收口自动推送                                          |

因此本阶段状态为 **Completed**。这一结论只确认本文定义的第一版可听 MIDI 纵向切片，不表示第 12 节
的延期能力或长期通用 Audio Graph / Worklet 架构已经完成。

## 参考

- [Audible MIDI Scheduler 工作原理](./audible-midi-scheduler-primer.md)
- [Web DAW 简洁架构总纲](../../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计](../../../docs/architecture/web-daw-long-term-architecture-v3.md)
- [MIDI Project Model V1](../../project-core/docs/midi-project-model-v1.md)
- [Piano Roll Note Editing 第五阶段计划](../../editor/docs/piano-roll-note-editing-phase-plan.md)
- [Seele Studio Design Language](../../../DESIGN.md)
