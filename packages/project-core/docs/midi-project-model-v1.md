# MIDI Project Model V1

本文档定义 `@seele-daw/project-core` 第一条 MIDI 纵向切片的权威数据结构、所有权关系、持久化边界和必须始终成立的不变量。

它是当前实现阶段的数据模型基线。字段或规则发生变化时，应先更新本文档；涉及不可逆文件格式或跨模块产品语义的决定，再补充 ADR。

本文档不定义 Command handler 的具体实现，也暂不定义 Move、Resize、Split 的边界算法。

## 目标与范围

V1 数据模型需要支持以下闭环：

```text
创建 Instrument Track
-> 创建 MidiClip / MidiSource
-> 绘制、移动、缩放和删除 Note
-> 播放
-> Undo / Redo
-> Snapshot / Journal / Reload
```

当前纳入模型：

- Project 基本身份；
- Instrument Track，以及未来 Audio Track 所需的拓扑判别方式；
- 一张统一的 Clip 表；
- MidiClip、MidiSource 和 MidiNote；
- MIDI Loop 的存储语义；
- Tempo 和 Time Signature；
- 最小 Device descriptor 和 Channel Strip；
- 运行时实体表、可重建索引与 ProjectFileDTO 边界。

当前不纳入模型：

- AudioClip 的完整字段和时间算法；
- Automation；
- MIDI CC、Pitch Bend、Aftertouch、MPE 和 Note Expression；
- Recording、Asset 和媒体垃圾回收；
- Linked Clip、Take Lane、Comping；
- Group、Return、Send 和任意路由图；
- Move、Resize、Split 的边界算法；
- Loop 边界事件排序。

这些能力不提前创建空表或占位抽象，在对应产品语义确定后通过新字段、联合类型分支和 schema migration 加入。

## 已确定的设计原则

### 内存与文件使用不同物理结构

规范化描述的是关系与事实源，不要求运行时和 JSON 使用同一种容器：

```text
运行时 ModelStore
  私有 Map + 有序 ID 集合
  适合高频查找、插入和删除

ProjectFileDTO
  Record<string, DTO> + JSON 数组
  适合校验、迁移、序列化和第三方边界
```

完整 Snapshot 本来就必须遍历全部实体，因此 Map 到 DTO 的 O(n) 转换不是额外的复杂度等级。第三方库通过专用 Adapter DTO 或 Read Model 接入，不能直接取得 ModelStore。

### 关系只保留一个权威方向

- Clip 保存 `trackId`，Track 不保存 `clipIds`；
- Track 到 Clip 的查询通过可重建索引完成；
- Note 的所属 Source 由 `midiNotesBySource` 分区表达，Note 不重复保存 `sourceId`；
- Device 的所属位置和顺序由 Track 的 Device ID 集合表达，Device 不保存 `trackId`；
- 只有真正表达人工顺序的关系才保存 ID 数组，例如 `trackOrder` 和 Device Chain。

反向索引可以为了性能存在，但它不是第二份项目事实。

### 实体与值对象区别对待

拥有独立身份、选择、生命周期或 Undo 语义的数据进入实体表，例如 Track、Clip、MidiSource、Note、Tempo Event 和 Device。

没有独立生命周期的组合值直接嵌入实体，例如 `ChannelStripDescriptor` 和 `MidiLoop`。规范化不等于把每一个小对象都拆成独立表。

### Track 表达信号拓扑

Track 类型表示输入到输出的真实信号拓扑，而不是产品模板名称：

- Drum 是带 Drum Rack 或鼓类 Instrument 的 Instrument Track；
- Bass 是 Track Template、设备预设或编辑器显示偏好；
- Vocal 是带人声设备链或预设的 Audio Track；
- Drum、Bass、Vocal 不成为新的 Track 领域子类。

## 基础类型

```ts
type Brand<T, Name extends string> = T & {
  readonly __brand: Name
}

type ProjectId = Brand<string, 'ProjectId'>
type TrackId = Brand<string, 'TrackId'>
type ClipId = Brand<string, 'ClipId'>
type MidiSourceId = Brand<string, 'MidiSourceId'>
type NoteId = Brand<string, 'NoteId'>
type DeviceId = Brand<string, 'DeviceId'>
type TempoEventId = Brand<string, 'TempoEventId'>
type TimeSignatureEventId = Brand<string, 'TimeSignatureEventId'>

type DeviceTypeId = Brand<string, 'DeviceTypeId'>
type ParameterId = Brand<string, 'ParameterId'>

type Tick = Brand<number, 'Tick'>
type MidiPitch = Brand<number, 'MidiPitch'>
type MidiVelocity = Brand<number, 'MidiVelocity'>
type MidiChannel = Brand<number, 'MidiChannel'>
type LinearGain = Brand<number, 'LinearGain'>
type BipolarValue = Brand<number, 'BipolarValue'>
type ProjectColor = Brand<string, 'ProjectColor'>
```

规则：

- 实体 ID 是不可变 opaque string，不包含数组位置、父级路径或业务分类；
- 推荐用 UUID 生成 ID，导入和复制时生成新的实体 ID；
- 不使用数组下标或递增序号充当实体身份；
- brand 只提供 TypeScript 静态隔离，所有外部数据仍必须经过运行时校验；
- 项目 PPQ 固定为 `960`，MIDI 导入时转换，不在每个项目中保存任意 PPQ；
- Tick 必须为非负安全整数；
- 所有时间区间使用半开区间 `[start, end)`；
- 不持久化能够无歧义推导的 `endTick`。

## Project

```ts
interface ProjectRecord {
  readonly id: ProjectId
  readonly name: string
}
```

规则：

- `name` 为 1 到 128 个 Unicode 字符；
- Project ID 与文件名、Git 仓库或用户账号无关；
- `updatedAt` 不进入每次编辑都会变化的权威模型；
- 用户账号、Git 身份、浏览器权限和本机设备设置不属于项目事实。

## Track

Track 使用顶层 `kind` 作为判别字段，使 TypeScript 收窄、Clip 兼容性检查和命令验证保持直接。

```ts
type TrackRecord = InstrumentTrackRecord | AudioTrackRecord

interface TrackBase {
  readonly id: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: ChannelStripDescriptor
  readonly audioEffectIds: readonly DeviceId[]
}

interface InstrumentTrackRecord extends TrackBase {
  readonly kind: 'instrument'
  readonly midiEffectIds: readonly DeviceId[]
  readonly instrumentDeviceId: DeviceId
}

interface AudioTrackRecord extends TrackBase {
  readonly kind: 'audio'
}
```

当前 MIDI 纵向切片只创建 `InstrumentTrackRecord`。`AudioTrackRecord` 明确未来的拓扑分支，但在 AudioClip、Recording 与输入语义确定前不增加更多字段。

Track 规则：

- `trackOrder` 是普通 Track 排序的唯一事实；
- 每个 Track ID 必须在 `trackOrder` 中恰好出现一次；
- Master 使用独立实体，不进入 `tracks` 和 `trackOrder`；
- Track 名称允许重复，身份只由 `id` 决定；
- `name` 为 1 到 128 个 Unicode 字符；
- `color` 使用规范化的 `#RRGGBB`，`null` 表示使用项目默认色；
- `midiEffectIds` 和 `audioEffectIds` 表达信号处理顺序，因此是合法的有序 ID 集合；
- Instrument Track 的 `instrumentDeviceId` 必须引用 Instrument 类型设备；
- MIDI Clip 只能属于 Instrument Track；
- V1 输出固定为 Track 到 Master，不保存重复的 `outputRoute: 'master'`。

### Channel Strip

```ts
interface ChannelStripDescriptor {
  readonly gain: LinearGain
  readonly pan: BipolarValue
  readonly muted: boolean
  readonly soloed: boolean
}

interface MasterChannelRecord {
  readonly gain: LinearGain
  readonly muted: boolean
  readonly audioEffectIds: readonly DeviceId[]
}
```

规则：

- `gain` 是有限线性增益，范围 `0..4`，默认 `1`；
- `gain = 0` 表示无声，`gain = 1` 表示 unity gain；
- `pan` 是有限值，范围 `-1..1`，默认 `0`；
- UI 分贝显示、推子曲线和 Automation 映射不能反过来定义存储格式；
- `muted` 不覆盖或修改原来的 `gain`；
- `soloed` 是项目事实，哪些 Track 最终可听是派生结果；
- Master 不需要 `soloed`。

## 统一 Clip 表

所有 Clip 放入同一张表，通过 `kind` 形成判别联合。V1 实际创建的分支只有 `MidiClipRecord`，AudioClip 在其时间语义确定后加入。

```ts
type ClipRecord = MidiClipRecord

interface ClipBase {
  readonly id: ClipId
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly startTick: Tick
}

interface MidiClipRecord extends ClipBase {
  readonly kind: 'midi'
  readonly spanTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceOffsetTick: Tick
  readonly loop: MidiLoop | null
}
```

字段语义：

- `startTick` 是 Clip 在项目时间线的起点；
- `spanTick` 是 MIDI Clip 在时间线占据的音乐时间跨度；
- `sourceOffsetTick` 是 Clip 起点对应的 MidiSource 相对位置；
- `sourceId` 引用该 Clip 独占的 MIDI 内容；
- `name` 是 Clip 自己的名称，Track 改名不会隐式修改它；
- `color = null` 表示显示时继承 Track 颜色；
- `muted` 是持久化的 Clip 静音状态。

基础不变量：

```text
startTick >= 0
spanTick > 0
sourceOffsetTick >= 0
startTick + spanTick 是安全整数
```

非循环 Clip 还必须满足：

```text
sourceOffsetTick + spanTick <= midiSource.lengthTick
```

Track 不保存 `clipIds`。运行时通过 `clipsByTrack` 派生索引完成 Track 到 Clip 的反向查询。

## MidiSource 与 MidiNote

Clip 是时间线窗口，MidiSource 是相对时间内容。V1 采用严格的一对一所有权：

```text
MidiClip 1 ---- 1 MidiSource
MidiSource 1 -- 1 NoteTable
```

```ts
interface MidiSourceRecord {
  readonly id: MidiSourceId
  readonly lengthTick: Tick
}

interface MidiNoteRecord {
  readonly id: NoteId
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

interface MidiNoteAddress {
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}
```

Note 的时间坐标相对于 MidiSource，不是项目时间线。

字段范围：

```text
source.lengthTick > 0
note.startTick >= 0
note.durationTick > 0
note.startTick + note.durationTick <= source.lengthTick
note.pitch 是整数 0..127
note.velocity 是整数 1..127
note.channel 是整数 0..15
```

规则：

- Note 不保存能够推导的 `endTick`；
- Note 不保存 `sourceId`，它的所属 Source 由 Note 分区表表达；
- Note ID 在编辑、选择和 Undo 期间保持稳定；
- MIDI Note-On velocity 0 在导入时解释为 Note Off，不形成 Note Record；
- 相同 Source 中允许同音高 Note 重叠；
- Playback Compiler 必须为播放事件生成唯一 Event Key，Runtime 使用 voice token 结束对应 Voice；
- Selection、hover 和拖拽预览不进入 Note Record；
- Release Velocity、CC、Pitch Bend、Aftertouch 和 MPE 等到真正实现时再设计对应事件表。

运行时按 Source 分区存储 Note：

```ts
type MidiNoteTable = Map<NoteId, MidiNoteRecord>

midiSources: Map<MidiSourceId, MidiSourceRecord>
midiNotesBySource: Map<MidiSourceId, MidiNoteTable>
```

这种结构使 Piano Roll 可以直接定位一张 Source 的 Note 表，高频 Note 编辑不需要替换整个 MidiSource，同时避免每个 Note 重复保存 `sourceId`。

### 复制与删除所有权

- 默认复制 MidiClip 时生成新的 Clip ID 和 MidiSource ID；
- Source 内容执行深复制，每个复制出的 Note 也生成新的 Note ID；
- 普通复制不会形成 Linked Clip；
- Linked Clip 必须作为显式产品能力和新的所有权语义加入；
- 删除 MidiClip 时，同一事务删除其 MidiSource 和 Note Table；
- 删除 Track 时，同一事务删除所属 Clip、Source、Note、Device，并更新 `trackOrder`；
- Undo 必须原子恢复整个所有权图，不能暴露中间状态；
- 任意已提交状态中都不能存在孤立 Source 或一个 Source 被多个 Clip 引用。

## MIDI Loop

Loop 是 MidiClip 的嵌套值对象，没有独立身份和生命周期：

```ts
interface MidiLoop {
  readonly sourceStartTick: Tick
  readonly sourceSpanTick: Tick
}
```

字段语义：

- `sourceStartTick` 是循环区域在 Source 内的起点；
- `sourceSpanTick` 是循环区域在 Source 内的长度；
- `clip.spanTick` 仍然是时间线窗口长度；
- `sourceOffsetTick` 表示 Clip 起点在循环区域中的初始位置。

不变量：

```text
sourceStartTick >= 0
sourceSpanTick > 0
sourceStartTick + sourceSpanTick <= midiSource.lengthTick

sourceStartTick
  <= sourceOffsetTick
  < sourceStartTick + sourceSpanTick
```

Move、Resize、Split 如何改变这些字段，以及 Loop 边界的事件排序，留到相应命令和 Playback 实现前单独讨论。

## Timeline、Tempo 与 Time Signature

```ts
type TempoBpm = Brand<number, 'TempoBpm'>
type TimeSignatureNumerator = Brand<number, 'TimeSignatureNumerator'>
type TimeSignatureDenominator = 1 | 2 | 4 | 8 | 16 | 32

interface TempoEventRecord {
  readonly id: TempoEventId
  readonly tick: Tick
  readonly bpm: TempoBpm
}

interface TimeSignatureEventRecord {
  readonly id: TimeSignatureEventId
  readonly tick: Tick
  readonly numerator: TimeSignatureNumerator
  readonly denominator: TimeSignatureDenominator
}
```

规则：

- Tick 0 必须恰好存在一个 Tempo Event 和一个 Time Signature Event；
- 同类事件在同一 Tick 最多存在一个；
- V1 Tempo 只支持 step change，不支持 ramp；
- BPM 必须是有限数，产品范围为 `20..400`；
- `numerator` 是整数，范围 `1..32`；
- `denominator` 只能是 `1、2、4、8、16、32`；
- 时间顺序由 `tick` 推导，不保存额外的顺序 ID 数组；
- Tempo Event 和 Time Signature Event 保留独立 ID，以支持选择、移动和 Undo；
- V1 UI 可以只开放 Tick 0 的编辑，存储结构允许以后加入多个 step event；
- TempoMap 的有序段、累计秒数和查找缓存是 QueryIndex，不进入项目文件。

Timeline 当前不是包含事件数组的大型 Record。两类事件分别进入规范化实体表，时间顺序由 `tick` 派生；项目不保存重复的事件顺序数组或固定的 Timeline 结束 Tick。

单事件工厂只验证 ID、Tick、BPM 和拍号值域。同类事件在同一 Tick 的唯一性，以及 Tick 0 必须恰好存在一个初始 Tempo Event 和 Time Signature Event，属于需要观察整张实体表的跨实体不变量，由 `InvariantValidator` 负责。

## Device Descriptor

V1 只确定稳定、可迁移的设备描述外壳。具体合成器参数由对应 Device Definition 拥有。

```ts
type JsonPrimitive = string | number | boolean | null

type JsonArray = readonly JsonValue[]

interface JsonObject {
  readonly [key: string]: JsonValue
}

type JsonValue = JsonPrimitive | JsonArray | JsonObject

interface DeviceDescriptor {
  readonly id: DeviceId
  readonly typeId: DeviceTypeId
  readonly definitionVersion: number
  readonly enabled: boolean
  readonly parameters: Readonly<Record<ParameterId, JsonValue>>
  readonly opaqueState: JsonValue | null
}
```

规则：

- `typeId` 是稳定且带命名空间的类型，例如 `seele.basic-synth`；每个命名空间段以小写 ASCII 字母开头，只包含小写字母、数字和连字符，并且至少包含两个由 `.` 分隔的段；
- `definitionVersion` 是从 `1` 开始的安全整数，用于设备状态迁移，不等于项目文件格式版本；
- Device Definition 声明端口类型、参数 schema、稳定 Parameter ID、默认值和状态迁移；
- Device 不保存 `trackId`；
- Device ID 必须在一个 Track 或 Master 的设备位置中恰好出现一次；
- Device 角色和 Track 设备链位置必须兼容；
- 第三方运行时实例、AudioNode、Tone.js 对象和不可验证闭包不能进入项目数据；
- 找不到设备实现时仍保留原始 Descriptor，由上层创建 MissingDevice 占位；
- 保存项目时不得丢弃未知 `parameters` 或 `opaqueState`。

`JsonValue` 边界只接受能够被 JSON 完整、确定表达的数据：number 必须有限；数组必须稠密且不能带额外属性；对象必须是普通对象或 null-prototype 对象，并且只包含自有、可枚举的字符串数据属性。`undefined`、BigInt、Symbol、函数、访问器、Class 实例、Date、Map、Set 和循环引用都必须拒绝。

创建 Descriptor 时递归复制 `parameters` 和 `opaqueState`。外部输入之后发生的修改不能改变已经创建的 Descriptor；`__proto__` 等合法 JSON key 必须作为普通数据安全保留。通用边界不解释具体参数含义，参数 schema、默认值和版本迁移仍由对应 Device Definition 负责。

## 私有 ModelStore

下面结构只用于说明内核组织方式，不能作为公开 API 导出：

```ts
interface InternalModelStore {
  modelRevision: number

  project: ProjectRecord
  trackOrder: TrackId[]

  tracks: Map<TrackId, TrackRecord>
  clips: Map<ClipId, ClipRecord>

  midiSources: Map<MidiSourceId, MidiSourceRecord>
  midiNotesBySource: Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>

  tempoEvents: Map<TempoEventId, TempoEventRecord>
  timeSignatureEvents: Map<TimeSignatureEventId, TimeSignatureEventRecord>

  devices: Map<DeviceId, DeviceDescriptor>
  master: MasterChannelRecord
}
```

内部可变性规则：

- Map、分区表和 `trackOrder` 只允许 `MutationApplier` 修改；
- Map 中的实体是只读记录，字段改变时创建新记录并替换表项；
- 一次原子事务只让 `modelRevision` 增加一次；
- `modelRevision` 是运行时并发与订阅版本，不进入 ProjectFileDTO；
- 包外不能取得内部 Map、可变数组或可写实体引用。

## QueryIndex

建议维护以下可重建索引：

```ts
interface QueryIndexes {
  readonly clipsByTrack: Map<TrackId, readonly ClipId[]>
  readonly clipTimeIndexByTrack: Map<TrackId, ClipTimeIndex>
  readonly noteIndexBySource: Map<MidiSourceId, MidiNoteIndex>
  readonly orderedTempoEvents: readonly TempoEventId[]
  readonly orderedTimeSignatures: readonly TimeSignatureEventId[]
  readonly deviceOwnerById: Map<DeviceId, DeviceOwner>
}
```

规则：

- `clipsByTrack` 按 `[startTick, clipId]` 稳定排序；
- Track 到 Clip 的正常查询使用索引，不在每次查询时扫描整张 Clip 表；
- 时间范围 Clip 索引与 Note 的 tick/pitch 索引按产品规模逐步实现；
- 索引由 MutationApplier 在提交期间同步更新，失败时从 ModelStore 全量重建；
- 索引不持久化、不进入 Undo、不成为第二份关系事实；
- 重建后的查询结果必须与直接扫描权威实体表一致。

## ProjectFileDTO

项目文件使用 JSON 友好的普通对象。外部 DTO 是不可信、版本化的数据，不直接充当 ModelStore。

```ts
interface ProjectFileDTO {
  readonly formatVersion: number
  readonly requiredFeatures: readonly string[]

  readonly projectId: string
  readonly name: string

  readonly trackOrder: readonly string[]
  readonly tracks: Record<string, TrackDTO>
  readonly clips: Record<string, MidiClipDTO>

  readonly midiSources: Record<string, MidiSourceDTO>
  readonly tempoEvents: Record<string, TempoEventDTO>
  readonly timeSignatureEvents: Record<string, TimeSignatureEventDTO>

  readonly devices: Record<string, DeviceDTO>
  readonly master: MasterChannelDTO
}

interface MidiSourceDTO {
  readonly id: string
  readonly lengthTick: number
  readonly notes: Record<string, MidiNoteDTO>
}
```

Note 在 DTO 中嵌套于 MidiSource，加载后再规范化为 `midiNotesBySource`。这只是文件结构，不改变运行时所有权。

所有外部数据必须经过：

```text
parse
-> schema validate
-> ordered migrations
-> semantic validate
-> normalize
-> create ModelStore
-> rebuild QueryIndex
```

保存时执行相反方向的显式投影，不调用 `JSON.stringify(ModelStore)`。

## 跨实体不变量

每次提交完成后，至少必须满足：

1. `trackOrder` 中的 ID 与 `tracks` 表完全对应，每个 ID 恰好一次。
2. 每个 Clip 引用存在的 Track，并且 Clip 类型与 Track 拓扑兼容。
3. 每个 MidiClip 引用存在的 MidiSource。
4. 每个 MidiSource 被且仅被一个 MidiClip 引用。
5. 每个 MidiSource 恰好存在一张 Note Table。
6. 所有 Note 都落在所属 MidiSource 的合法范围内。
7. 所有 Tick、MIDI 数值、gain、pan、BPM 和拍号字段满足各自范围。
8. Tick 0 存在唯一的初始 Tempo 和 Time Signature。
9. 每个 Device 存在唯一且兼容的所有者位置。
10. 所有实体表 key 与记录自身 `id` 相同。
11. 不存在孤立 Source、Device 或悬空外键。
12. QueryIndex 可以从当前 ModelStore 丢弃并得到等价重建结果。

跨实体新增、删除和级联变化必须先形成完整 MutationPlan，通过全部验证后一次提交。任何已发布的 Snapshot 或 ProjectCommit 都不能观察到中间状态。

## 已确定的播放产品语义

以下规则属于 Project、Editor 和 Playback 必须共同遵守的产品语义：

1. 同一 Instrument Track 允许 MIDI Clip 重叠，播放时合并所有有效 MIDI 事件。
2. Note 超过 Clip 右边界时，在 Clip 边界强制 Note Off。
3. 从一枚已经开始的长 Note 中间进入播放窗口时，V1 不执行 Note Chase，不在窗口起点重新触发该 Note。
4. 同音高 Note 可以重叠，运行时不能只用 `channel + pitch` 充当内部 Voice 身份。

Loop 边界 Note Off / Note On 的排序仍需在 Playback Compiler 实现前确定。

## 不进入 Project Model 的状态

以下数据不保存为创作事实：

- QueryIndex；
- Editor Selection、hover、工具状态和拖拽预览；
- Playhead、Transport 播放状态和 Preview Voice；
- AudioNode、Worklet 实例、Active Voice 和 Meter；
- Undo / Redo 栈；
- `modelRevision`、`engineGeneration` 和 `journalSequence`；
- 浏览器暴露的物理 MIDI / Audio device ID 与权限状态；
- 解码 PCM、波形缓存和渲染缓存；
- Vue、Pinia 或其他 UI 响应式对象。

## 暂缓的实现规则

以下内容将在对应命令或模块开始实现前单独讨论并形成测试：

- Move Clip / Note 的边界与目标兼容性算法；
- Resize Clip / Note 的最小长度、裁剪和扩展算法；
- Split Clip 对 Source 复制、窗口和 Note 的具体处理；
- Loop 边界事件排序；
- Snap、量化与舍入策略；
- AudioClip 同轨重叠、fixed-time 与未来 warped 模式；
- Tempo 改变时正在播放的 Voice 处理。

这些问题不得由 Editor、Playback 或 Persistence 各自猜测。
