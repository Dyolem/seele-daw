# Piano Roll CC64 Sustain Pedal Lane Foundation

> Status: Implemented in `@seele-daw/editor` and integrated as Studio Lane Add
>
> Date: 2026-08-31

## 目标与边界

本批次只建立真实 CC64 编辑纵向切片所需的 Editor 基础：把 Project Snapshot 中已经存在的
Sustain Pedal Event 投影成可绘制的阶梯状态，建立 `0..127` Value Lane 坐标，并让 CC64
Surface 复用既有 Pointer Capture 生命周期。

本批次不创建 Vue UI、不执行 Project Command，也不把 CC64 合并进 Note 专用 XState 状态机。
Studio 接入将在下一独立批次完成并单独审核。

```text
Project Snapshot CC64 facts
  -> explicit Channel Clip / Track projection
  -> immutable Event markers + derived Step segments
  -> Value Lane geometry
  -> typed DOM Hit + captured Pointer input
  -> pure Pencil placement { timelineTick, value }
  -> Studio（下一批次）映射 Source Tick 并提交 Core Command
```

## 投影质量契约

### Channel 必须显式

一份 Standard MIDI File 或 MidiSource 可以同时包含 16 个 MIDI Channel。CC64 状态按 Channel
独立，Editor API 因此要求调用方传入 `MidiChannel`；缺省猜测、按 Note 自动推断或把多个
Channel 混成一条 Lane 都不允许。

### Clip 窗口与状态追赶

非循环 Clip 读取 Source 的半开区间：

```text
[sourceOffsetTick, sourceOffsetTick + clip.spanTick)
```

- Lane 查找窗口左边界之前最后一条同 Channel CC64 Event，把它作为初始状态；
- 如果不存在历史 Event，初始 MIDI 值为 `0`，即踏板抬起；
- 左边界上的 Event 立即覆盖追赶状态；
- 右边界上的 Event 仍被投影，便于保留和编辑 Source 事实，但
  `affectsPlayback = false`，不改变这个 Clip 的 Step Segment；
- 右边界之后的 Event 不出现在该 Clip Lane；
- `64..127` 派生为 Pedal Down，`0..63` 派生为 Pedal Up，同时保留原始 `0..127` 值。

Event 是 Project Fact；Step Segment 是可丢弃的 Editor 派生数据，不写回 Project，也不进入
History。Track Scope 对每个 ready Clip 使用相同规则，再把 Source Tick 映射为全局 Project
Tick。Looped Clip 继续显示明确的 `unsupported` 状态，不伪造重复控制器事件。

## Value Lane 坐标契约

- 水平轴使用 Timeline Tick；Clip Scope 传 Clip-local Tick，Track Scope 传 Project Tick；
- MIDI 值 `127` 位于顶部，`0` 位于底部；两个边界都可以精确命中；
- CSS Pixel 转 MIDI 值时选择最近的离散整数；
- CSS Pixel 转 Tick 先产生连续位置，再由共享 Timeline Grid 选择 Snap 策略；
- Pencil 使用 `floor` Snap，落到 Pointer 所在 Grid 单元的左边界；Snap 关闭时取最近整数 Tick；
- 可见右端点允许产生 Placement，因为 Core 允许 Source 终点上的控制器事实。该事实不会反向
  改变刚结束的半开 Clip 播放窗口。

所有尺寸和坐标都必须有限且在 Viewport 内；非法输入失败关闭，不产生 Placement。

## Pointer 与语义 Hit

既有 `PianoRollPointerInput` 现在可以携带 Surface 专属的 Hit 类型。Note Surface 继续使用默认
Note Resolver；CC64 Surface 必须显式提供 Sustain Pedal Event Resolver。二者共享同一实现的：

- 单 Primary Pointer；
- Pointer Capture；
- Down 时固定 Origin Hit 与 Origin Position；
- 默认 4 CSS Pixel Drag Threshold；
- Up / Cancel / lost capture / Window blur / dispose；
- Hit、Capture 与 Observer failure isolation。

CC64 Pencil Resolver 只接受未超过 Drag Threshold 的完整空白 Click。它只返回 Timeline Tick
和原始 MIDI Value，不选择 Channel、不生成 Event ID、不读取 ProjectSession，也不提交命令。

## 后续 Event 编辑基础

Studio 已接入 Track / Clip Focus 可见 Lane、Channel Preference、Pencil Add、Active Clip 约束与
失败反馈。Event Selection、Remove Target、水平 Move、纵向 Replace Value 和主导轴锁定的
Editor 契约见
[Piano Roll CC64 Event Editing Foundation](./piano-roll-sustain-pedal-event-editing-foundation.md)。
该后续基础仍未接入 Studio，不能把内部 Intent 契约描述成用户可用编辑功能。

## 明确延期

- Event Selection / Preview 的 Studio Renderer、Delete Keyboard Action 与 Project Coordinator；
- 水平 Move / 纵向 Replace Value Intent 的 Studio Command 集成；
- 多 Event 原子 Replace Value；当前单 Event Value Command 不能被 UI 循环调用伪装成一个
  History 步骤；
- Looped Clip 的实例选择、Source 编辑和 Chase 规则；
- 除 CC64 外的通用 CC Lane、Pitch Bend、Aftertouch、MPE 或 Automation 平台。

## 失败与兼容边界

- 缺失 Track、非 Instrument Track、缺失 Source 或 CC64 Partition 都失败关闭；
- 已删除的 Active Clip ID 被清空，不产生幽灵焦点；
- 未支持的 looped Clip 不读取或假装展开其事件；
- 原始 CC64 值始终 round-trip，派生的 Down / Up 布尔值不替代 Project Fact；
- Editor 只消费公开 Project Core API，不读取 Playback 或 Audio Runtime。

## 术语表

| 术语                             | 本阶段含义                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| CC / Control Change（控制变化）  | MIDI 中编号控制器的事件类别；每条事件包含 Channel、控制器编号和值。                                      |
| CC64 / Sustain Pedal（延音踏板） | 控制器编号 64；通常 `64..127` 表示踩下，`0..63` 表示抬起。                                               |
| MIDI Channel（MIDI 通道）        | `0..15` 的独立事件通道；同一时刻不同 Channel 的踏板状态互不影响。UI 可显示为 1–16，但项目事实仍为 0–15。 |
| Chase / State Chase（状态追赶）  | 从播放或编辑窗口之前寻找最后一条控制事件，恢复窗口起点应有的状态。                                       |
| Step / Step Segment（阶梯段）    | 控制值在下一条事件到来前保持不变形成的水平区段，不是 Project Fact。                                      |
| Half-open interval（半开区间）   | 包含左端点、不包含右端点的时间窗口，写作 `[start, end)`。                                                |
| Terminal Event（终点事件）       | 恰好位于 Clip 右端点的事件；事实可见，但不影响刚结束的半开播放窗口。                                     |
| Value Lane（数值编辑栏）         | Piano Roll 下方用纵轴表示 MIDI 值、横轴表示时间的控制器编辑区域。                                        |
| Raw value（原始值）              | Project 中保存的 `0..127` MIDI 数值；即使播放只判断 Up / Down，也不丢弃原值。                            |
| Hit Test（命中测试）             | 把 Pointer 所在的 DOM 图元转换成稳定 Event ID 等编辑语义。                                               |
| Pointer Capture（指针捕获）      | Pointer 离开图元后仍把该次手势的 Move / Up / Cancel 发送给原 Surface。                                   |
| Semantic Hit（语义命中）         | 不携带 DOM 节点，只携带稳定领域 ID 的命中结果。                                                          |
| Placement（落点解析）            | 把完整空白 Click 转换为候选 Tick 与值；它还不是 Project Command。                                        |
