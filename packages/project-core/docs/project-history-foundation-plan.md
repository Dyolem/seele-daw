# Project History / Undo / Redo 基础层计划

## 目标

本阶段为 ProjectSession 增加会话级 History，使每次成功 Command 提交可以通过同一条 MutationApplier 管线 Undo / Redo，并继续产生带新 `modelRevision` 的 ProjectCommit / ProjectDelta。

History 不是项目事实、项目文件或崩溃恢复 Journal。关闭 Session 后历史可以丢弃，模型仍是唯一权威状态。

## 产品规则

### Undo / Redo 返回

ProjectSession 增加：

```ts
readonly canUndo: boolean
readonly canRedo: boolean
undo(): ProjectCommit | null
redo(): ProjectCommit | null
```

空栈返回 `null`，不创建计划、Commit 或 revision。

### 普通提交与 redo 分支

- 成功的普通 Command 进入 undo 栈；
- Undo 把对应 entry 移到 redo 栈；
- Redo 把 entry 移回 undo 栈；
- Undo 后的新普通 committed Command 清空整个 redo 分支；
- no-change 没有改变项目事实，因此不进入 History，也不清空 redo；
- 被拒绝或 apply 失败的 Command 不改变 History。

### Commit origin

普通执行继续使用：

```ts
interface ProjectCommandCommitOrigin {
  readonly kind: 'command'
  readonly commandType: ProjectCommandType
}
```

Undo / Redo 使用：

```ts
{
  kind: 'history'
  direction: 'undo' | 'redo'
  commandType: originalCommandType
}
```

History Commit 仍携带新的 revision 和按实际执行方向生成的 Delta。Undo Add 会产生 Note Removed，Redo Add 会产生 Note Added；它们不是对旧 Commit 的简单重新广播。

## HistoryEntry

一个 HistoryEntry 代表一次成功的用户级 Command 提交，而不是一条 mutation。首版内部 entry 只保存重放所需事实：

```text
HistoryEntry
├── original commandType
├── forward mutations
└── inverse mutations
```

`commandType` 记录产生 entry 的原始产品命令类型，当前用于 History Commit origin；它不参与反向操作计算。`forward` 和 `inverse` 才是可以应用到模型的规范化存储变化。

当前三个 Note Command 各自产生一条 mutation，但 entry 使用数组，因为未来的 Duplicate、Split 或级联删除等一个用户动作可能同时改变多个实体。无论包含多少 mutation，一次成功 Command 只产生一个 entry，一次 Undo 也撤销整个 entry。

entry 共享 MutationPlan 已冻结的 mutation 数组与领域 Record 引用。它不是完整模型快照，不复制整张实体表；但会保留被修改 Record 的准确 before / after 引用，以便恢复相同的不可变 Record，而不是重新构造一个字段恰好相同的对象。

### Command 与反向操作

从产品入口看，History 属于 Command 执行管线：

```text
ProjectCommand
-> Command handler
-> MutationPlan
-> atomic commit
-> one HistoryEntry
```

从内部存储看，它更准确地是可逆 Mutation 日志，而不是保存一个带 `execute()` / `undo()` 方法的 Command 对象。History 不生成或保存反向 ProjectCommand；Command handler 只把产品意图解析为 forward mutations，`createMutationPlan` 再统一生成 inverse mutations。

基础反转规则是：

| Forward mutation         | Inverse mutation                        |
| ------------------------ | --------------------------------------- |
| `INSERT(after)`          | `REMOVE(before: after)`                 |
| `REMOVE(before)`         | `INSERT(after: before)`                 |
| `REPLACE(before, after)` | `REPLACE(before: after, after: before)` |
| 顺序 `INSERT(index, id)` | 顺序 `REMOVE(index, id)`                |
| 顺序 `REMOVE(index, id)` | 顺序 `INSERT(index, id)`                |

因此 AddNote 的 inverse 是移除同一个新 Note Record，RemoveNote 的 inverse 是插回原始 Note Record，MoveNote 的 inverse 则交换 replace mutation 的 before / after Record。

多 mutation 计划先反转 forward 序列，再逐条求逆。例如 forward 先插入 MidiSource、再插入 Note 分区、最后插入 Clip，Undo 必须先移除 Clip、再移除 Note 分区、最后移除 MidiSource，才能保持所有权和外键依赖合法。

采用 inverse mutation 而不是反向产品 Command，可以避免重新解释当时已经确定的产品意图。Split 的反向是否应称为 Merge、复制操作是否需要连同独立 Source 和 Note 一起删除、Redo 是否可以重新生成身份，都不是稳定的对称 Command 语义；规范化 mutation 已经携带准确身份、Record 引用、关系位置和执行顺序，反转结果更确定。

Undo 使用 `createMutationPlan(currentRevision, entry.inverse)`，Redo 使用 `createMutationPlan(currentRevision, entry.forward)`。因此每次重放都会获得当前 baseRevision、新的 plan 来源证明、反向计划和完整不变量验证；它们不是绕过前置条件、把模型强制改回旧状态。

History label、gesture merge key、Editor restore point、entry ID 和持久化格式都需要新的产品输入，本阶段不猜测默认值。

## 栈结构

Undo / Redo 各自使用一条独立的包内单链栈，并分别由 `undoHead` 和 `redoHead` 指向栈顶。节点结构是：

```text
HistoryStackNode
├── entry: HistoryEntry
└── next: HistoryStackNode | null
```

“不可变单链栈节点”是指节点创建并冻结后，`entry` 和 `next` 永远不会改变；HistoryController 本身仍会通过替换两个 head 引用推进状态。压栈不是修改旧节点，而是创建一个 `next` 指向旧 head 的新节点；弹栈也不删除节点，只把 head 替换为旧节点的 `next`。

假设依次提交 A、B、C：

```text
undoHead -> [C] -> [B] -> [A] -> null
redoHead -> null
```

执行一次 Undo 后：

```text
undoHead -> [B] -> [A] -> null
redoHead -> [C] -> null
```

再执行一次 Undo 后：

```text
undoHead -> [A] -> null
redoHead -> [B] -> [C] -> null
```

Redo 执行相反的栈顶转换。entry 在两个栈之间转移时不会被复制或修改：Controller 创建一个新的目标栈节点并共享同一个冻结 entry，同时把源栈 head 指向原节点的 `next`。稳定状态下，一个 entry 只位于一条有效链中；旧节点只可能由预备 transition 的回滚闭包暂时保留，transition 结束后即可由垃圾回收处理。

Undo 后的新普通 committed Command 会创建新的 undo 节点，并把 `redoHead` 直接替换为 `null`。这会放弃旧 redo 分支，但不需要遍历或原地删除其中的节点。

原因：

- push / pop 只替换栈头，时间复杂度 O(1)；
- 不需要每次提交复制完整 History 数组；
- 下一节点与回滚闭包可以在 ModelStore 写入前完成分配；
- apply 失败时只恢复旧 undo / redo 栈头引用，不执行可能扩容的数组 push。

首版不设置任意 entry 数量上限。容量、内存预算和 checkpoint eviction 应基于真实大项目 Record 保留量决定，不能静默丢弃用户刚建立的撤销路径。

## History transition 与模型原子性

HistoryController 为普通提交、Undo 和 Redo 先准备一个 transition：

```text
expected undo/redo heads
next undo/redo heads
replay MutationPlan
stage()
rollback()
```

Session 的顺序是：

```text
prepare plan / Commit / result
-> prepare History transition and all stack nodes
-> stage History heads
-> MutationApplier.apply(plan)
   ├── success -> return already prepared Commit/result
   └── failure -> restore previous History heads -> rethrow
```

stage 发生在权威模型写入前，并且只替换私有栈头；Session 是同步单写者，在 apply 期间不会向外发布中间 History 状态。这样成功路径在 revision 写入后仍然不分配对象或执行可失败的 History push。

## 模块位置与公开边界

```text
src/history/
├── history-controller.ts
└── project-history.ts（仅在确有公开类型时创建）
```

HistoryController、HistoryEntry、stack node、transition 和 MutationPlan 保持包内。package root 只扩展 ProjectSession 的 `canUndo`、`canRedo`、`undo`、`redo`，并公开 History Commit origin 的判别常量与只读类型。

## 本阶段不包含

- gesture / text / parameter merge；
- History label 和本地化；
- Editor Selection / focus restore point；
- History capacity / memory eviction；
- Journal、crash recovery 或跨 Session 历史；
- selective undo、branch UI 或协同编辑；
- listener、QueryIndex、Snapshot 和 persistence。

## 测试边界

- Add / Move / Remove 的 Undo / Redo 恢复准确 Record 引用；
- 每次 Undo / Redo 都递增一个 revision 并生成正确 Delta / origin；
- 多 entry 按 LIFO 顺序移动；
- 新 committed Command 清空 redo，no-change 和失败 Command 保留 redo；
- 空栈返回 `null`；
- apply 失败时 ModelStore 与 History 栈状态一起恢复；
- History 内部能力不从 package root 导出。

## 完成边界

完成本模块后停止等待审阅，不连续实现 merge、Query、Snapshot 或订阅。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- `src/history/` 已实现包内 HistoryController、不可变单链双栈和可回滚 transition；
- ProjectSession 已公开 `canUndo`、`canRedo`、`undo()` 和 `redo()`，History 内部类型未从 package root 导出；
- 普通提交、Undo 和 Redo 共用 MutationApplier 原子写入路径，空栈和 no-change 不推进 revision；
- History Commit 使用新的 revision、实际重放方向的 Delta，以及包含原始 Command 类型的 `history` origin；
- 新 committed Command 清空 redo，no-change、命令拒绝和 apply 失败保留原 History 分支；
- Add / Move / Remove 的 Record 引用、LIFO 顺序、分支规则，以及普通提交与 Undo / Redo 重放的写入失败恢复均已覆盖；
- Project Core 基线为 16 个测试文件、282 项测试。
