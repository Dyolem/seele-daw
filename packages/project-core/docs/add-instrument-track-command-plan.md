# Add Instrument Track Command 实施计划

## 目标

本阶段为 Project Core 增加第一条音轨级产品命令：`AddInstrumentTrackCommand`。

命令把“在指定位置创建一条空白乐器音轨”表达为一次封闭、可逆的项目提交。提交必须同时创建乐器插槽 Device、Instrument Track 和 `trackOrder` 条目；任何消费者都不能观察到缺少 Device、缺少 Track 或顺序未更新的中间状态。

## 产品边界

### 本阶段负责

- 公开、可重新验证的 `AddInstrumentTrackCommand`；
- 完整的 Track 名称、颜色、Channel Strip、Track ID、Instrument Device 和插入位置；
- 新建音轨初始为空，不附带 MIDI Effect、Audio Effect、Clip 或 MIDI Source；
- Track ID、Device ID 和插入位置的模型前置条件校验；
- Device、Track、Track Order 的三步原子 MutationPlan；
- 一条聚合的 Instrument Track added / removed ProjectChange；
- Command、Undo 和 Redo 的统一 ProjectCommit / ProjectDelta；
- 现有 MIDI Note QueryIndex 与局部订阅对非 Note 变化的显式兼容。

### 本阶段不负责

- 默认名称、序号分配、ID 生成或随机颜色选择；
- Track Palette、颜色选择器或 Studio UI 状态；
- Soundbank 扫描、音色选择、采样解码、合成器或 Playback；
- Clip、MidiSource、Note 的自动创建；
- Track rename、recolor、remove、reorder、duplicate；
- 通用 Device graph 编辑能力；
- Studio Coordinator、Workbench Track Row 或编辑器渲染。

以上产品默认值由后续 Studio 用例决定并传入 Core。Project Core 只验证确定的领域输入，不依赖 Vue、浏览器资源或随机源。

## Command 契约

`CreateAddInstrumentTrackCommandInput` 包含：

- `baseRevision`；
- `trackId`；
- `name`；
- `color`；
- `channel`；
- `instrumentDevice`；
- `insertAt`。

Command 工厂复用既有领域工厂规范化所有值。新音轨的 `midiEffectIds` 与 `audioEffectIds` 固定为空，`instrumentDeviceId` 来自所提供 Device 的 ID。

`insertAt` 在构造时必须是非负安全整数，在准备时必须不大于当前 `trackOrder.length`。这样“值是否合法”和“值对当前模型是否仍适用”保持分离。

## 准备与原子写入

Handler 只读取 `ModelStoreReader`，按顺序准备：

1. `DEVICE.INSERT`；
2. `TRACK.INSERT`；
3. `TRACK_ORDER.INSERT`。

`createMutationPlan` 自动产生反向顺序：

1. `TRACK_ORDER.REMOVE`；
2. `TRACK.REMOVE`；
3. `DEVICE.REMOVE`。

准备阶段拒绝：

- 已存在的 Track ID；
- 已存在的 Device ID；
- 超出当前 Track Order 边界的插入位置。

ProjectedModelStoreReader 继续负责最终跨实体不变量验证，MutationApplier 继续负责唯一写入权、revision 推进和失败回滚。

## ProjectDelta 语义

底层的三条 Mutation 对外聚合为一条产品语义变化：

- `instrument-track.added`；
- `instrument-track.removed`。

变化携带 Track ID，以及包含 Track Record、Instrument Device Descriptor 和顺序位置的 placement。added 使用 `after`，removed 使用 `before`。这使 UI、保存提示和后续 Track 派生视图无需理解底层 Device / Track / Track Order 的写入顺序。

Commit candidate 必须识别完整且顺序正确的三条 Mutation。任何缺失、额外、错序或与 Command 参数不一致的计划都失败关闭；不把部分模型变化静默遗漏在 Delta 之外。

## QueryIndex 与订阅

当前 QueryIndex 只索引 MIDI Note。它必须显式识别 Instrument Track added / removed，并在保持 Note 分区引用不变的同时推进自己的 revision；未知 ProjectChange 仍失败关闭。

MIDI Note 局部订阅对 Track change 返回不匹配。`project-commit.all` 继续接收音轨提交，因此本阶段不提前增加 Track 专用订阅协议。

## 测试与验收

- Command 工厂重新验证并复制调用方可变输入；
- 无效 revision、插入位置和领域值被拒绝；
- 重复 Track ID、重复 Device ID、越界位置被拒绝；
- Mutation 顺序、inverse 顺序和 Record 引用准确；
- Session 提交后 Track、Device 与 Track Order 同时可见；
- Delta 聚合为一条 Instrument Track change；
- Undo / Redo 恢复完全相同的 Record 引用和位置；
- QueryIndex 对 Track-only Delta 推进 revision 且 Note 查询结果不变；
- MIDI Note 局部订阅不接收 Track change，all-commits 订阅接收；
- Project Core type-check、测试与仓库级检查通过。

## 停止点

完成并验证本模块后停止，等待审阅。后续 Studio Add Track Coordinator、固定多色 Palette、随机颜色选择和 Workbench Track Row 属于下一批，不在本阶段连续实施。
