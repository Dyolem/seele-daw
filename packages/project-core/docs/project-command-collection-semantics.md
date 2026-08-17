# Project Command 集合与事务语义

> 状态：已接受
>
> 日期：2026-07-29
>
> 适用范围：Project Core Command、Editor 多选意图与 Studio 应用协调

## 文档目的

本文档定义单实体操作、集合操作与事务提交之间的边界，避免把“原子”误解为“一个 Command
只能修改一个实体”，也避免为了未来可能出现的批量需求预建通用 Batch / Composite
Command。

核心决定是：

> Project Command 表达一次完整的产品意图；Project Mutation 表达最小项目事实变化；
> MutationPlan 与 Commit 提供一次产品意图的全有或全无事务边界。

Command 的单数或复数由产品语义决定，不由“一个 Command 最多只能包含一条 Mutation”决定。

## 1. 分层与原子性

```text
Editor / Studio interaction policy
-> one complete Project Command
-> authoritative preparation
-> one or more Project Mutations
-> one closed MutationPlan
-> one Commit / ModelRevision / History step
```

各层职责如下：

| 层级                   | 职责                                                           | 不负责                      |
| ---------------------- | -------------------------------------------------------------- | --------------------------- |
| Editor / Studio        | Selection、Pointer、Snap、Preview、面向用户的 Clamp 或拒绝策略 | 直接修改 Project Facts      |
| Project Command        | 描述一次完整产品意图及调用方观察到的 `baseRevision`            | UI 状态、异步 I/O、逐步提交 |
| Command Preparer       | 从权威模型重新读取目标、验证全部前置条件并建立封闭计划         | 获得写权限、发布 Commit     |
| Project Mutation       | 描述一个最小规范化存储变化，例如插入、替换或删除一个 Note      | 独立 History、产品交互策略  |
| MutationPlan / Applier | 预投影完整结果、全有或全无应用、失败回滚、只推进一次 revision  | 猜测用户意图                |
| Project Commit         | 记录一次已经成功的产品事务及其 Delta                           | 表示尚未提交的 Preview      |

“单 Note 删除”可以是一条 `NOTE.REMOVE` Mutation；“删除当前 Selection”则可以是一个包含
N 条 `NOTE.REMOVE` Mutation 的 Command。后者仍然是原子的，因为任何目标失败都不会产生
部分 Commit。

## 2. 不使用多次 Execute 模拟批量事务

以下模式禁止用于需要原子性的集合操作：

```text
Promise.all(
  selectedIds.map(id => projectSession.execute(createSingleEntityCommand(id)))
)
```

原因：

- `ProjectSession.execute()` 每成功一次就会推进 revision、更新 History 和 dirty 内容身份；
- 已发布的 Commit、Subscription 和 UI 更新不会因为后续 Promise 失败而自动撤销；
- 多个 Command 若共享同一 `baseRevision`，第一次成功后其余 Command 会立即陈旧；
- 若逐次读取新 revision，又会产生 N 个独立 Commit 和 N 个 Undo 步骤；
- `Promise.all` 只聚合异步完成状态，不提供事务、隔离或回滚；
- 当前 Project Core 的读取与准备是同步内存计算，用 Promise 包裹不会提升正确性。

外部可以为 Preview 进行纯计算或预判，但这不能代替 Project Core 基于同一权威 revision
进行最终验证。即使未来出现远程或异步存储，原子性也必须由真正的事务边界提供，不能由
`Promise.all` 推断。

## 3. Command 数量语义的选择

设计新 Command 时使用以下判断：

| 条件                                                              | 推荐                                     |
| ----------------------------------------------------------------- | ---------------------------------------- |
| 单个与多个具有完全相同的产品语义，一元素集合没有歧义              | 使用一个集合 Command，允许一元素集合     |
| 多个对象之间存在共同 Delta、Anchor、顺序或范围交集                | 设计专用集合 Command，并显式表达共同约束 |
| 所谓“批量”实际是 Paste、Import、Duplicate、Chord 等另一种用户意图 | 使用产品语义命名的独立 Command           |
| 当前没有真实集合入口，边界算法也未确定                            | 保留现有单实体 Command，不提前泛化       |

不得把“以后可能批量操作”作为所有新 Command 默认使用数组 Payload 的理由。默认规则不是
“优先单数”或“优先复数”，而是“准确表达当前完整产品意图”。

只有同时满足以下条件时，集合 Command 才应替代单实体公共 Command：

1. 一元素集合的验证、成功结果、失败语义、Delta 和 History 与单实体行为完全一致；
2. 集合版本没有引入会改变单实体含义的共同 Anchor、排序或部分成功策略；
3. 所有正式消费者都可以迁移到集合协议；
4. 迁移后单实体公共 API 不再承载独立产品语义。

## 4. 内部复用与公共协议

集合 Command 不应把所有实体规则复制到一个巨大函数中。推荐结构是：

```ts
function prepareOneEntityMutation(/* authoritative inputs */): ProjectMutation

function prepareCollectionCommand(/* ... */): MutationPlan {
  const mutations = entityIds.map(prepareOneEntityMutation)
  return createMutationPlan(baseRevision, mutations)
}
```

单实体准备函数可以保持包内、同步、无状态并可单元测试。是否公开一个单实体 Command 是另一
个问题：内部算法复用不要求同时维护两个语义重叠的公共协议。

职责分配保持：

- Command factory 只规范化协议结构，例如 ID、非空集合和重复项；
- Preparer 从权威 Store 读取实体并验证存在性、所有权、边界与跨实体不变量；
- 必须先验证或投影完整集合，再接触权威写入；
- 任一目标失败时不产生 MutationPlan 的部分应用；
- 成功集合操作只产生一个 Commit、一个 revision、一个 dirty 内容状态和一个 History
  步骤。

## 5. 当前命令决定

### 5.1 Remove Notes

`RemoveNotesCommand` 是数量无关的删除产品意图：

```ts
interface RemoveNotesCommand {
  readonly type: 'midi-note.remove'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}
```

- `noteIds` 必须非空且无重复；
- 一元素集合表示单 Note 删除；
- 多元素集合表示同一 MidiSource 内的原子 Selection 删除；
- 任一 Note 缺失时整次拒绝；
- 不保留语义完全被覆盖的单 Note 公共 Command；
- `midi-note.remove` 描述操作本身，数量只由 Payload 表达，不进入判别值。

### 5.2 Add Note

当前保留 `AddNoteCommand`。Pencil 点击确实只创建一个 Note，而未来的多 Note 创建可能来自
Chord、Paste、Duplicate 或 MIDI Import。这些行为涉及不同的身份分配、相对 Timing、
所有权和 Source 扩展规则，不能在真实需求出现前统一为一个泛化 `AddNotesCommand`。

### 5.3 Move Notes

Batch 5.2 已将单 Note 与 Selection Move 统一为数量无关的 `MoveNotesCommand`：

```ts
interface MoveNotesCommand {
  readonly type: 'midi-note.move'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
  readonly deltaTick: TickDelta
  readonly deltaPitch: MidiPitchDelta
}
```

- `noteIds` 必须非空且无重复；
- 一元素集合表示单 Note Move，多元素集合表示同一 MidiSource 内的 Selection Move；
- 所有 Note 使用同一个 Tick / Pitch Delta；
- Delta 同时为零时返回 `no-change`，不建立空 MutationPlan；
- 任一 Note 缺失、越过 Source 边界或越过 MIDI Pitch 0–127 时整次拒绝；
- 不再保留语义被一元素集合完全覆盖的绝对 `MoveNoteCommand` 公共协议。

Selection Move 不是多次独立 Move：

- 所有 Note 必须使用同一个 Tick / Pitch Delta；
- 所有 Note 必须保持相对间隔；
- Snap 以一个稳定 Selection Anchor 解析；
- 合法 Delta 是全部 Note 合法区间的交集；
- 不允许左侧 Note 移动而已到右边界的 Note 留在原地。

水平方向可按下式求整体合法范围：

```text
每个 Note：
[-note.startTick, source.lengthTick - (note.startTick + note.durationTick)]

Selection：
[max(所有下界), min(所有上界)]
```

Editor 使用该范围产生一致 Preview；Project Core 在提交时仍需基于 `baseRevision` 重新读取
全部 Note 并验证最终结果。一个合法命令建立按 `noteIds` 顺序排列的多个
`NOTE.REPLACE` Mutation，但只产生一个 Commit、一次 revision 推进和一个 History 步骤。

### 5.4 Resize Note

首批 `ResizeNoteCommand` 保持单实体协议：

```ts
interface ResizeNoteCommand {
  readonly type: 'midi-note.resize'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
  readonly startTick: Tick
  readonly durationTick: Tick
}
```

- Command 表达最终 Start / Duration，不编码 Pointer 命中的左边缘或右边缘；
- Duration 必须为正 Tick，Note 结束位置不能超过 MidiSource 长度；
- 目标几何与权威 Note 相同时返回 `no-change`；
- 成功时只替换 Start / Duration，保留 ID、Pitch、Velocity 与 Channel；
- 首批产品交互只调整明确命中的一个 Note；
- 多选比例缩放、共享固定边缘、共同 Delta 或逐 Note Clamp 都尚无确定产品语义，因此当前不
  接受 `noteIds` 集合，也不提供泛化的多 Note Resize。

### 5.5 Track 与 Clip

- Track 模板、批量导入与多轨创建不等于重复执行当前 Add Instrument Track；
- Clip Paste、Duplicate、Split 或 Import 具有独立身份和 Source 所有权规则；
- 在这些真实产品入口出现前，现有单实体 Command 不因“未来可能批量”而调整。

Track 全局 Piano Roll 的 `AddMidiClipWithNoteCommand` 与
`ExtendMidiClipWithNoteCommand` 是本原则的具体应用：用户的一次 Pencil 放置会同时改变
Clip、Source 与 Note，因此用一个产品语义命名的 Command 建立封闭 MutationPlan。它们不是
可嵌套任意 Command 的 Batch / Composite API，也不能由 Studio 串联 Add Clip、Resize Clip 与
Add Note 模拟。完整约束见
[MIDI Clip / Note 原子放置命令计划](./midi-clip-note-placement-command-plan.md)。

## 6. 新命令审查清单

新增或扩展 Command 前必须回答：

1. 用户认为这是一项操作，还是多项可独立撤销的操作？
2. 一元素集合是否与现有单实体行为严格等价？
3. 多个目标之间是否共享 Delta、Anchor、顺序、所有权或范围限制？
4. 失败时是整体拒绝、整体 Clamp，还是产品明确允许部分成功？
5. 应产生几个 Commit、revision、dirty 内容状态和 History 步骤？
6. 哪些计算属于 Editor Preview，哪些必须由 Core 权威复核？
7. 能否用包内单实体准备函数复用规则，而不增加重复公共 API？
8. 是否已有真实消费者，足以确定协议，而不是仅为假设场景预建基础设施？

没有明确答案时，先保留现有协议并在真实产品切片中完成设计，不引入通用 Batch /
Composite Command。
