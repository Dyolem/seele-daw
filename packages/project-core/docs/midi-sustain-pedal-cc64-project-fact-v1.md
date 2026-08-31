# MIDI Sustain Pedal CC64 Project Fact V1

## 阶段状态

本文档定义 Sustain Pedal CC64 的 Project Core 事实边界，并记录后续纵向切片的集成状态。
Project Core 的可保存、可撤销、可增量观察事实与命令事务已经提交；Standard MIDI File 导入、
Playback、Audio Runtime 与 Studio 选择性重协调已在后续批次实现并等待审核。Studio Controller
Lane 尚未实现。

当前批次完成：

- `MidiSustainPedalEventRecord`、Source 所有权分区与全局不变量；
- Add、批量 Move、批量 Remove、Replace Value Project Command；
- Mutation、ProjectDelta、History、Undo / Redo 与 Snapshot；
- Project File V2 写出、严格读取，以及 V1 到 V2 的无损迁移；
- 新建 MIDI Clip 与整轨集合导入命令所需的完整所有权图；
- Standard MIDI File CC64 导入、PPQ 碰撞诊断与原始 Value / Channel 保留；
- 非循环 Clip 的 Playback 状态追赶、最终 Gate Release 推导与确定性同 Tick 排序；
- Audio Runtime 最终释放执行，以及播放中 CC64 编辑的选择性 Voice 重排。

后续批次仍需完成：

- Project MIDI Export Bridge 的 CC64 导出映射与 Studio Export UI；
- Looped MIDI Clip 的控制器循环展开与已有 Note 的 Note Chase；
- Studio Controller Lane、选择、精确输入和批量编辑；
- half-pedal、repedaling、共鸣、pedal noise 与 release sample 等更丰富音源表现力。

播放侧的完整排序、边界与术语见
[MIDI Sustain Pedal CC64 Playback V1](../../playback/docs/midi-sustain-pedal-cc64-playback-v1.md)。

## 术语表

| 中文术语     | 行业常用英文                   | 本文中的含义                                                    |
| ------------ | ------------------------------ | --------------------------------------------------------------- |
| 延音踏板     | Sustain Pedal / Damper Pedal   | MIDI 控制器编号 64；不等于 Sample Loop。                        |
| 控制器事件   | Control Change / CC Event      | 在某个 Tick 写入控制器值的 MIDI 事件。当前只建模 CC64。         |
| 踏板按下     | Pedal Down                     | CC64 原始值 `>= 64`。                                           |
| 抬踏板       | Pedal Up                       | CC64 原始值 `< 64`。                                            |
| 按键释放     | Key Release / Note Off         | Note 自己记录的松键边界；CC64 不改写它。                        |
| 踏板保持声部 | Pedal-held Voice               | Note Off 已到达，但因踏板按下而尚未进入最终 Release 的 Voice。  |
| 最终发声释放 | Final Gate Release             | Pedal Up 或 Clip 终点解除 Gate、允许 gated Voice 进入 Release。 |
| 延音循环     | Sustain Loop / `loop_sustain`  | Sample Zone 在按键 Gate 内循环；它不是 CC64。                   |
| 连续循环     | Continuous Loop                | Sample Zone 启动后按自身规则循环；具体退出由控制文件定义。      |
| 单次触发     | One-shot                       | Sample 按自身素材长度播放，通常不服从普通 Gate Release。        |
| 抬键尾音     | Release / Release Tail         | 最终 Gate Release 后按 Zone Envelope 衰减的阶段。               |
| 松键采样     | Release Sample                 | Release 时额外触发的 Sample；当前音源 Profile 尚未声明该能力。  |
| 踏板追赶     | Pedal Chase / Controller Chase | 从中途 Locate / Seek 时恢复目标 Tick 之前最后一个 CC64 状态。   |
| 半踏板       | Half-pedal                     | 连续解释 CC64 中间值；V1 仅保留原值，不实现连续制音模型。       |

音质阶段更完整的双语术语见
[Audio Quality Foundation V1A Glossary](../../audio-web/docs/audio-quality-foundation-v1a-glossary.md)。

## 为什么是专用 CC64 事实，而不是通用 Automation

当前真实产品切片只需要 Sustain Pedal。提前建立任意 MIDI CC、Automation Curve、Bézier、MPE
或参数调制平台，会在事件顺序、编辑手势和 Playback 语义尚未确定前扩大公共契约。

因此 V1 使用窄模型：

```ts
interface MidiSustainPedalEventRecord {
  readonly id: MidiSustainPedalEventId
  readonly tick: Tick
  readonly value: MidiControlValue
  readonly channel: MidiChannel
}
```

- `id` 在整个 Project 内唯一，用于选择、编辑和 Undo；
- `tick` 相对于所属 `MidiSource`；
- `value` 原样保留 MIDI 的整数 `0..127`；
- `channel` 原样保留 MIDI Channel `0..15`；
- 控制器编号不重复存入 Record，因为该实体类型本身固定表示 CC64。

当第二种控制器真正进入产品时，再根据共享的导入、编辑和调度需求决定是否抽取通用
Controller Event；当前专用表不得被误称为完整 Automation 平台。

## 所有权与存储

CC64 与 Note 都属于 MidiSource 内容，但使用两张独立分区表：

```text
MidiClip 1 ---- 1 MidiSource
                   ├── 1 MidiNote partition
                   └── 1 Sustain Pedal Event partition
```

```ts
midiSources: Map<MidiSourceId, MidiSourceRecord>
midiNotesBySource: Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>
midiSustainPedalEventsBySource: Map<
  MidiSourceId,
  Map<MidiSustainPedalEventId, MidiSustainPedalEventRecord>
>
```

CC64 不烘焙进 Note Duration。按键释放与踏板释放是两类事件；把踏板效果改写为更长 Note 会
破坏原始 Note Off、同音重触发、重新量化、踏板编辑、Locate chase 和 MIDI 导出。

删除或恢复一个独占 MidiClip 图时，Source、Note 分区和 Sustain Pedal Event 分区必须在同一
MutationPlan 中原子删除或恢复。新建空 MIDI Clip 也会建立空踏板分区，以区分“存在但没有
事件”和“所有权图缺失”。

## 值与状态语义

- `value >= 64` 解释为 Pedal Down；
- `value < 64` 解释为 Pedal Up；
- Source / Channel 在第一条事件前的派生初始状态是 Pedal Up；
- V1 保留全部 `0..127`，但不把 `64..127` 映射为不同制音深度；
- half-pedal、repedaling、pedal noise 和 damper resonance 不在本批次中实现。

保留原值的目的，是避免项目文件在未来增加更细表达时已经丢失输入信息。当前二值播放政策
不等于把原值规范化为 `0` 或 `127`。

## Tick、Channel 与确定性

必须始终满足：

```text
0 <= event.tick <= source.lengthTick
0 <= event.value <= 127
0 <= event.channel <= 15
```

同一 Source、Channel 和 Tick 最多存在一个 CC64 Event。这样 Core 不依赖 Map 插入顺序决定
最终踏板状态，也不会让 Undo / Redo 改变同 Tick 结果。Standard MIDI File 可能包含换算后同位置
的重复 CC64；当前 Adapter 按来源 Tick 与来源事件顺序保留最后一条并产生汇总诊断，不让 Core
静默猜测事件顺序。

允许 `event.tick === source.lengthTick`，用于保留 Source 终点的控制器状态边界。Playback 的
Clip / Loop 展开仍采用半开窗口；终点 Event 是否形成实际调度事件，必须由后续 Compiler 的
边界排序政策统一决定，Project Core 不在保存时移动或删除它。

不同 Channel 可以在同一 Tick 各有一个 CC64 Event。Playback 必须只影响同 Channel 的 Note；
当前音源是否把多个 MIDI Channel 汇入同一 Instrument Runtime，不得反过来丢弃项目事实。

## Command 与事务语义

公开命令为：

- `AddMidiSustainPedalEventCommand`：添加一个完整 Event；
- `MoveMidiSustainPedalEventsCommand`：对一个非空、无重复 ID 集合应用共享 `deltaTick`；
- `RemoveMidiSustainPedalEventsCommand`：原子删除一个非空、无重复 ID 集合；
- `ReplaceMidiSustainPedalEventValueCommand`：只替换一个 Event 的原始 Value。

Core 不接收像素、Lane 高度、Pointer、Snap 或 Selection。Editor 负责把手势转换为最终 Tick、
Value 或共享 Delta，Core 再用提交时权威记录复核 ID、Source 边界与位置冲突。

集合 Move / Remove 无论包含多少 Event，都只形成一个 Project Command、一个 Commit、一次
`modelRevision` 推进和一个 History 步骤。任一目标缺失、越界或冲突时整体拒绝，不执行部分
写入。零 Tick Move 和相同 Value Replace 返回 `no-change`。

## ProjectDelta

Event Add / Remove / Update 分别发布：

```text
midi-sustain-pedal-event.added
midi-sustain-pedal-event.removed
midi-sustain-pedal-event.updated
```

每条 Change 携带 `affectedFromTick`，而不是有限 `AffectedTickRange`。原因是一个 CC64 状态会
持续到同 Channel 的下一条 CC64；在没有先计算下一状态边界前，保守失效范围必须从旧 Tick
与新 Tick 的较早者一直向后。Playback 消费者可以通过重新编译更窄窗口优化，但不能假设只需
刷新 Event 所在的一个瞬间。

MIDI Note QueryIndex 不索引 CC64，因此只推进 revision 而不重建 Note 索引；MIDI Note 局部
订阅也不接收 CC64 Commit。`project-commit.all` 仍接收全部合法提交。

## Project File V2

Project File V2 在每个 `MidiSourceDTO` 中新增必填 `sustainPedalEvents` entity table。V1 reader
保持严格：V1 文件不能提前带有该字段。已校验 V1 文件通过纯迁移为 V2，并为每个 Source 创建
空踏板表；迁移不会伪造 Pedal Up Event，也不会修改 Note Duration。

V2 writer 保留原始 ID、Tick、Value 和 Channel。结构 decoder 负责 JSON 形状与 table key / ID，
领域工厂负责值域，InvariantValidator 负责 Source 所有权、全局 ID、范围和位置唯一性。

完整文件协议见 [Seele Project File Format V2](./project-file-format-v2.md)。

## 与音源控制文件的边界

Project Fact 不包含 Sample Loop、Envelope、Trigger、Mutex、Release 或 Zone 选择政策。

- 当前 Studio Grand 没有 Sample Loop，这是该音源控制数据的事实，不是 CC64 或 Core 的前提；
- 其他乐器可以声明无 Loop、Continuous Loop、Sustain Loop、One-shot 或不同 Envelope 参数；
- CC64 Runtime 只能改变 Note Off 何时形成最终 Gate Release，不能覆盖 Zone 自己的 Loop、Envelope、
  Trigger、Mutex、Velocity Range 或 Release 参数；
- 非循环 Sample 可能在踏板仍按下时自然播放到素材尾部；Core 不伪造 Loop；
- One-shot Zone 是否响应 Note Off 继续由其 Trigger 契约决定；Core 不把它强制改成 Gated Voice；
- Release Sample 需要控制文件和 Runtime 明确声明，不能因已有 CC64 Fact 就宣称支持。

因此 Project Core 不读取 Studio Grand 名称、Soundbank、SFZ opcode 或 AudioNode；Playback 与
Audio Runtime 也不会对不同控制文件采用同一套硬编码 Loop / Release 参数。

## 后续集成门禁

CC64 Playback 与 Audio Runtime 的代码级门禁已覆盖基本保持、释放、Channel 隔离和 Manifest
行为。Controller Lane 完成后、WAV Export 开始前，仍必须重新验证：

- Note Off 在 Pedal Down 时进入 pedal-held，而不是立即 Release；
- Pedal Up 只释放对应 Channel 中已经松键的 Voice；
- 同音重触发、voice stealing 和 pedal-held Voice 优先级；
- Loop / non-loop / one-shot Zone 各自遵守控制文件语义；
- Locate / Seek、Clip Loop 边界和播放开始前的 Pedal Chase；
- 停止播放、设备替换、generation 切换和资源销毁没有悬挂 Voice；
- 实时与未来离线导出采用同一 CC64 排序与终点政策；
- 峰值、headroom、click 和 Pedal Up Release 通过表达力音质门禁。

在这些门禁完成前，产品文档可以声明“导入的二值 CC64 会延后最终 Gate Release”，但不能声明
Studio Grand 已经产生新的采样内容、共鸣、release sample 或 half-pedal 音色。
