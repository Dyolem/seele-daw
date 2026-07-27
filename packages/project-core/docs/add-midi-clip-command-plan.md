# Add MIDI Clip Command 实施计划

## 目标

本阶段为 Project Core 增加第一条 Clip 级产品命令：`AddMidiClipCommand`。

命令把“在一条 Instrument Track 上创建一个空 MIDI Clip”表达为一次封闭、可逆的项目提交。提交必须同时创建 MidiSource、空 MIDI Note Partition 和 MidiClip；任何消费者都不能观察到孤立 Source、缺少 Note Partition 或引用不存在 Source 的 Clip。

## 产品边界

### 本阶段负责

- 公开、可重新验证的 `AddMidiClipCommand`；
- 完整的 Clip、MidiSource 与 Track 身份；
- Clip 名称、颜色、静音、时间线窗口、Source 窗口与 Loop 事实；
- 目标 Instrument Track 与新图身份的模型前置条件校验；
- Source、空 Note Partition、Clip 的三步原子 MutationPlan；
- 一条聚合的 MIDI Clip added / removed ProjectChange；
- Command、Undo 和 Redo 的统一 ProjectCommit / ProjectDelta；
- MIDI Note QueryIndex 对 Source Partition 创建和移除的增量兼容；
- 现有 all-commits 与 MIDI Note 局部订阅的明确分流。

### 本阶段不负责

- Clip ID、Source ID 或默认名称生成；
- 按小节计算默认长度、像素到 Tick 映射或 Snap；
- 双击 Arrangement Lane 的创建手势；
- Clip Selection、DOM Clip Block 或 Context Editor Dock 接入；
- 创建时附带 Note、导入 MIDI 文件或共享 Source；
- Clip move、resize、split、duplicate、loop 编辑、mute 或删除命令；
- Piano Roll、Playback、Soundbank 或音频输出。

Studio 后续负责把已确认的产品规则转换为确定的 Command 参数。Project Core 不读取 Selection，不知道 Arrangement、小节坐标、Vue 或浏览器事件。

## Command 契约

`CreateAddMidiClipCommandInput` 包含：

- `baseRevision`；
- `clipId`、`trackId` 与 `sourceId`；
- `name`、`color` 与 `muted`；
- `startTick` 与 `spanTick`；
- `sourceLengthTick` 与 `sourceOffsetTick`；
- 可选的 `loop` 值。

Command 工厂分别复用 `createMidiSourceRecord` 与 `createMidiClipRecord` 规范化领域值，并保证 Clip 引用 Command 内的新 Source。

本次 Handler 固定创建空 Note Partition。未来 MIDI 导入如果需要在同一提交中创建初始 Note，应形成拥有独立 Command 契约的产品意图，不能通过伪造 Add MIDI Clip 的 MutationPlan 绕过空内容语义。

## 准备与原子写入

Handler 只读取 `ModelStoreReader`，按顺序准备：

1. `MIDI_SOURCE.INSERT`；
2. `NOTE_PARTITION.INSERT`，内容为空；
3. `CLIP.INSERT`。

`createMutationPlan` 自动产生反向顺序：

1. `CLIP.REMOVE`；
2. `NOTE_PARTITION.REMOVE`；
3. `MIDI_SOURCE.REMOVE`。

准备阶段拒绝：

- 不存在的目标 Track；
- 非 Instrument Track；
- 已存在的 Clip ID；
- 已存在的 MidiSource ID；
- 已存在的 Note Partition ID；
- Clip 读取窗口超出新 MidiSource 长度。

ProjectedModelStoreReader 继续负责最终一对一 Source 所有权、Track 类型、Source 范围和完整 Note Partition 等跨实体不变量。MutationApplier 继续负责唯一写入权、revision 推进和失败回滚。

## ProjectDelta 语义

底层三条 Mutation 对外聚合为一条产品语义变化：

- `midi-clip.added`；
- `midi-clip.removed`。

变化携带 Clip、Source、Track 身份、时间线上的半开受影响区间，以及包含 Clip Record、MidiSource Record 和 Note Records 的完整 placement。当前 Add Command 的 `notes` 必须为空；保留完整 placement 形状，使未来合法的 populated Clip 删除仍能表达可恢复所有权图。

Commit candidate 必须识别完整且顺序正确的三条 Mutation。任何缺失、额外、错序、非空 Note Partition 或与 Command 参数不一致的计划都失败关闭。

Preparer 返回的规范化 Command 与 MutationPlan 共享 Clip 和 Source Record 引用。Commit
candidate 以这些引用及 Clip -> Source、Partition -> Source 的所有权关系验证对应性，不逐字段
重写 Clip / Source 的相等判断；未来 Record 增加字段时无需同步维护第二份比较清单。

## QueryIndex 与订阅

MIDI Clip added 会在 QueryIndex 中增加对应 Source 的 Note Partition；removed 会验证并移除完整 Partition。这样新 Clip 提交后，现有 Add Note Command 与 MIDI Note Query 可以立即使用新 Source，无需先依赖一次被动全量重建。

MIDI Note 局部订阅不接收空 Clip 的 added / removed change。`project-commit.all` 继续接收提交；Clip 专用 Query 和 Subscription 等出现真实 Arrangement 增量消费需求后再加入。

## 测试与验收

- Command 工厂规范化 Clip、Source 与嵌套 Loop 值；
- 目标 Track 缺失或类型错误被拒绝；
- 重复 Clip、Source、Partition 身份被拒绝；
- 超出 Source 的 Clip 窗口被拒绝；
- Mutation 与 inverse 顺序准确；
- Session 提交后 Clip、Source 与空 Partition 同时可见；
- Delta 聚合为一条 MIDI Clip change，并携带冻结的完整 placement；
- Undo / Redo 删除和恢复完全相同的所有权图；
- 不完整或非空的伪造计划失败关闭；
- QueryIndex 可让新 Source 立即接收并查询 Note；
- MIDI Note 局部订阅不接收空 Clip change，all-commits 订阅接收；
- Project Core type-check、测试与仓库级检查通过。

## 停止点

完成并验证本模块后停止，等待审阅。Studio `ProjectClipCoordinator`、Clip Selection 和 Arrangement 创建交互属于后续批次，不在本阶段连续实施。
