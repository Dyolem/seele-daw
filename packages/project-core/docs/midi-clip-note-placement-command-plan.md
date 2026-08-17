# MIDI Clip / Note 原子放置命令计划

## 目标

Batch 7E.2 为 Track 全局 Piano Roll 的两种事实变化建立 Project Core 原子边界：

1. 在全局空白时间创建一个非循环 MIDI Clip、它独占的 MidiSource 和第一枚 Note；
2. 为一枚越过现有非循环 Clip 右端的 Note 向右扩展 Clip、按需扩展 MidiSource，并创建 Note。

两种操作都必须是一个 Project Command、一个 Commit、一个 History 步骤。Studio 不得先创建
Clip、再调整长度、最后添加 Note，也不得用 `Promise.all` 模拟事务。

## 产品与架构边界

本批实现：

- `AddMidiClipWithNoteCommand`（`midi-clip.add-with-note`）；
- `ExtendMidiClipWithNoteCommand`（`midi-clip.extend-with-note`）；
- 完整的 Preparer、MutationPlan、Commit / Delta、QueryIndex、Subscription 与 Undo / Redo；
- Snapshot 和 Project File V1 对最终事实的既有无损投影；
- 自动右扩不得跨越同 Track 上从当前 Clip 末端起遇到的下一 Clip；
- looped Clip 明确拒绝自动扩展。

本批不实现：

- Pointer 到目标 Clip 的选择、Active Clip、一个小节邻近阈值或小节对齐；
- Track 模式 Surface、Ruler、Clip window、Preview、模式切换或 Playhead Follow；
- 通用 Clip Resize、向左扩展、Move、Split、Copy、Loop 编辑或重叠修复；
- ID、名称、颜色、Velocity 或 Channel 的产品默认值生成。

上述交互策略由 Editor / Studio 在后续批次解析为确定的 Command 参数；Core 只验证最终产品意图
在提交时仍然安全。

两条新命令的实现按产品职责收纳在
`src/commands/midi-clip-note-placement/`：Add、Extend 与共享放置校验分别成文件。跨既有 Note
Command 与本模块复用的通用 Note 身份和 Source 边界校验属于 `midi-note/`；其他领域 Command
handler 也分别归入稳定功能目录。共享基础能力进入 `protocol/` 与 `preparation/`，commands
根层不放置源码，并由架构检查阻止重新平铺。

## Command 契约

### 新建 Clip 并添加 Note

`AddMidiClipWithNoteCommand` 携带完整的新 `MidiClipRecord`、`MidiSourceRecord` 和
`MidiNoteRecord`。该 Clip 固定为非循环；Note 时间是 Source-local，并必须完全位于 Clip 的
Source window 和新 Source 长度内。

Preparer 复用空 Clip 命令的 Track、身份和 Source window 校验，同时验证 Note ID 在整个项目中
未被占用。计划固定为：

```text
MIDI_SOURCE.INSERT
NOTE_PARTITION.INSERT([note])
CLIP.INSERT
```

Delta 聚合为一条 `midi-clip.added`，完整 placement 的 `notes` 包含第一枚 Note。Undo 使用
`midi-clip.removed` 删除同一完整所有权图；Redo 恢复相同 Record。

### 向右扩展 Clip 并添加 Note

`ExtendMidiClipWithNoteCommand` 携带目标 `clipId`、最终 `spanTick` 和完整 Note。Preparer 从
权威 Store 重新读取 Clip、Source 与 Partition，并验证：

- Clip 存在、非循环，Source 和 Partition 完整；
- 最终 Span 严格大于当前 Span；
- Note 尾端确实越过当前 Clip Source window，但完全位于目标 window 内；
- Note ID 未被项目中其他 Partition 使用；
- 目标全局 Clip 末端不越过下一 Clip 的起点；恰好相接合法；
- Source 已有容量不足时，长度精确增长到目标 Clip Source window 末端；容量已足够时不产生
  冗余 Source Replace。

计划为以下两种最小形状之一：

```text
MIDI_SOURCE.REPLACE   # 仅在需要增长时
CLIP.REPLACE
NOTE.INSERT
```

或：

```text
CLIP.REPLACE
NOTE.INSERT
```

## Delta、查询与订阅

右扩提交发布：

1. `midi-clip.updated`：携带 before / after Clip、保守全局受影响范围，以及可空的
   `sourceUpdate`；
2. `midi-note.added`：携带 Source-local Note 变化。

Undo 的顺序相反：先 `midi-note.removed`，再 `midi-clip.updated` 恢复 Clip / Source。QueryIndex
只索引 Note Partition，因此显式接受 Clip Updated 并推进 revision，同时按 Note Change 增删
索引内容。

带第一枚 Note 的 Clip Add / Remove 仍使用聚合 Clip Change。MIDI Note 局部订阅会检查 placement
中的 Note，并按 Source、Note ID 与 Source-local 受影响范围过滤；现有空 Clip Add / Remove 因
`notes` 为空，仍不会触发 Note 订阅。

作为公开 Delta 契约的现有消费者，Playback Reconciliation 显式识别 Clip Updated，并把新增或
被新 Clip window 暴露的 occurrence 归因到原子 Command。Studio Playback Coordinator 将两条新
Command 纳入选择性 handoff；右扩若延长正在发声 occurrence 的有效尾部，只重排 release，不
重启 Voice 或执行 all-notes-off。该适配不增加可见 Piano Roll 入口。

## 原子性与持久化

两个 Command 都沿用 ProjectSession 的写前准备顺序：Commit、History、QueryIndex 与发布门控先
完成，MutationApplier 再对完整计划做投影、不变量验证和唯一写入。任一前置条件失败都不会推进
revision、内容状态、History、QueryIndex 或 dirty。

Clip、Source 和 Note 仍使用现有 Project File V1 字段，不增加重复 `endTick`，也不需要文件格式
升级。Snapshot / ProjectFileDTO 只观察提交后的完整图；Undo 后图和 Note 同时恢复到 before。

## 测试与停止点

- 两条公开 Command 的规范化与运行时判别字段；
- 新 Clip 的 populated Partition、inverse 与聚合 Delta；
- 需要 / 不需要 Source 增长的右扩计划；
- missing、looped、非右扩、不需要扩展、越过下一 Clip、Note 越界与重复 ID 拒绝；
- 一个 revision / History 步骤内的 Commit、Query、Subscription、Snapshot、Project File、
  Undo / Redo；
- Command / MutationPlan 对应性和新 ProjectChange 的失败关闭；
- Playback occurrence 归因与 Studio 活动 Voice release 重排；
- Project Core 全部测试、Workspace type-check、lint、format、架构边界、全部仓库测试与 Studio
  Production Build。

当前本地验收为 Project Core 28 文件 / 409 项测试、Playback 9 / 95、Studio 45 / 267，且
`pnpm lint` 与 `pnpm check` 通过。完成后停止等待审核。Batch 7E.3 的 Track 模式 Studio Surface
不在本批连续实施。
