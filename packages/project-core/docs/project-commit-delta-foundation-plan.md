# ProjectCommit / ProjectDelta 基础层执行计划

## 目标

本阶段在 Project Core 内建立一次成功编辑的公开结果契约，使后续 `ProjectSession` 能把已经准备好的 `MutationPlan` 转换为不可变的 `ProjectCommit` 与 `ProjectDelta`。

本阶段只覆盖当前 MIDI Note Command 纵向切片，不创建 Session、History、订阅器、QueryIndex、Snapshot 或持久化接口。

## 模块位置

实现位于 `packages/project-core/src/commit/`，而不是新的 workspace package。

原因是：

- `ProjectCommit`、`ProjectDelta` 和 `ProjectChange` 是 Project Core 的公开领域结果；
- Delta 的构造必须读取包内私有的 `MutationPlan` / `ProjectMutation`；
- Mutation 仍是存储级实现细节，不能为了构造 Delta 而从 package root 导出；
- 后续 Session、History、Playback 和 UI 都可以依赖公开 Commit 契约，而不接触写入能力。

## 公开契约

### ProjectChange

首版提供三种 MIDI Note 语义变化：

- `midi-note.added`：包含 `sourceId`、`noteId`、`after` 和受影响 Tick 范围；
- `midi-note.removed`：包含 `sourceId`、`noteId`、`before` 和受影响 Tick 范围；
- `midi-note.updated`：包含 `sourceId`、`noteId`、`before`、`after` 和受影响 Tick 范围。

受影响范围遵守项目统一的半开区间 `[startTick, endTick)`：

- Add 使用新 Note 的区间；
- Remove 使用旧 Note 的区间；
- Update 使用 before / after 区间的保守并集，确保 Move 后旧位置与新位置都被失效。

### ProjectDelta

`ProjectDelta` 包含本次提交后的 `modelRevision` 和按 forward mutation 顺序排列的 `changes`。它描述语义变化，不暴露 Mutation，也不通过整模型 deep diff 生成。

### ProjectCommit

`ProjectCommit` 包含：

- `baseRevision`；
- 提交后的 `modelRevision`；
- 当前仅支持 Command 的 `origin`；
- 对应的 `ProjectDelta`。

事务 ID、时间戳、History merge 元数据、Journal sequence、Query invalidation 和 Playback generation 留到各自模块建立稳定需求后再加入。

## 写入顺序与失败边界

Commit / Delta 使用写前准备模型：

```text
prepare ProjectCommand
-> MutationPlan
-> prepare ProjectCommit candidate
   -> validate plan provenance
   -> validate command / plan correspondence
   -> compute next revision
   -> map all semantic changes and affected ranges
-> MutationApplier.apply(plan)
-> return / publish the already prepared candidate
```

所有可能抛错的 Delta 映射、Tick 加法与 revision 推进都发生在权威写入之前。若 MutationApplier 失败，候选对象被丢弃；未来 Session 只在 `apply` 返回的 revision 与候选 revision 一致后返回或发布 Commit。

当前每一种 Note Command 都必须对应恰好一条匹配的 Note mutation：

- Add -> `NOTE.INSERT`；
- Move -> `NOTE.REPLACE`；
- Remove -> `NOTE.REMOVE`。

不支持的 mutation 或 Command / Plan 不匹配会在写入前失败。未来新增 Command 时，必须同时定义其 Delta 语义，不能静默发布缺失变化的 Commit。

## 不可变性与引用策略

Commit、origin、Delta、change、affected range 及其数组在运行时冻结。`before` / `after` 继续共享领域 Record 引用，不递归复制或冻结，遵守 Project Core 已有的 Record 逻辑不可变契约。

## 实施顺序

1. 定义公开 `ProjectChange`、`ProjectDelta`、`ProjectCommit` 值类型与稳定判别常量；
2. 实现包内 Commit candidate 工厂和稳定错误码；
3. 覆盖 Add / Move / Remove、revision、Command / Plan 对应关系和不可变性测试；
4. 从 package root 仅导出公开结果契约；
5. 更新 README 状态与管线说明；
6. 运行 Project Core、workspace 类型、架构、lint、格式、测试和 Studio 构建检查。

## 完成边界

本阶段完成后，Project Core 能在不暴露 ModelStore、MutationPlan 或 MutationApplier 的前提下，提前构造一次 Note 编辑的不可变提交结果。正式执行门面、发布时机和消费接口仍由下一阶段 `ProjectSession` 负责。

## 实施结果

本阶段已于 2026-07-17 按上述边界完成：

- `src/commit/` 已拥有公开值类型和包内 Commit candidate 工厂；
- Add / Move / Remove、revision overflow、计划来源、不支持 mutation、Command / Plan 对应关系与运行时冻结均有确定性测试；
- package root 只导出 Change / Delta / Commit 的公开常量与类型，不导出 candidate 工厂、错误类型或任何 Mutation / Store 写能力；
- Delta 构造保持 candidate 工厂的私有实现，不为白盒测试提供独立生产导出；测试 fixture 和快捷断言统一位于 `src/__tests__/support/`；
- Project Core 基线为 14 个测试文件、266 项测试；workspace 类型检查、架构检查、lint、递归测试和 Studio production build 通过。
