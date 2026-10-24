# ADR-002：消费者按变化路由，不按命令类型路由

- 状态：Accepted；“Change”自 [ADR-004](./ADR-004-commits-publish-storage-changes.md) 起指存储变化
- 日期：2026-10-23
- 实施：`9d5579c`（播放按变化路由）、`5f54e36`（命令与 Plan 的对应改由测试固定）

## Context

播放协调器按命令名决定两件事：一次 Commit 能否选择性重协调，以及正在发声的 Voice 该被
切断，还是只调整释放时间。播放计划的调和结果也为每个变化附带 `commandTypes`，专门供这两个
`switch` 使用。

因为下游信任命令标签，project-core 必须在每次提交时证明“标签与 MutationPlan 一致”：
`project-commit-candidate.ts` 用约 540 行 `matchesXxx` 把每条命令的语义重新实现了一遍。
于是新增一条命令要同时改 handler、匹配器和播放协调器里的分支。

## Decision

1. 消费者只读 Commit 的 Delta / Change，以及自己从中派生的计划差异，不读命令类型。播放的
   规则是：正在发声的 Note 如果只改了 `endTick` 或 `releaseTick`，就重排释放时间；其他任何
   变化都切断该 Voice。能否选择性重协调由调和计划自己的 scope 决定；遇到 Tempo、Master
   路由、revision 断档或计划不可播放时，scope 会回退为全量交接。
2. 运行时不再校验命令与 Plan 是否对应。[`command-properties.spec.ts`](../../packages/project-core/src/__tests__/command-properties.spec.ts)
   对每一种命令类型各运行一条合法命令，检查三件事：它只改动自己点名的实体；Undo 精确恢复
   原快照；Redo 精确复现结果。缺少用例的命令类型会让这个测试失败。
3. `commit.origin.commandType` 保留，只用于 History 的标签与诊断，不作为行为分支依据。

## Consequences

- 新增命令不再需要改播放代码，也不需要写匹配器；`'command-plan-mismatch'` 错误码删除。
- handler 生成的 Plan 若与命令语义不符，由属性测试在开发期发现，而不是在用户提交时发现。
  不完整的实体图仍会在推导 Delta 时被拒绝。
- 新的消费者（例如后续的 Automation 播放）必须从 Change 推导行为。

## Validation

- `pnpm --filter @seele-daw/project-core test:run`：属性测试覆盖全部 18 种命令类型。
- `pnpm --filter @seele-daw/studio test:run`：`project-playback-coordinator.spec.ts` 通过 Studio
  适配器驱动播放引擎，覆盖两条 Voice 规则：Resize、Pedal Up、Clip 延长露出尾部时只重排释放；
  删除、移动、替换音色时切断 Voice。

## Revisit Trigger

某个消费者确实需要区分“同样的变化来自不同意图”（例如录音与手动编辑产生相同的 Note 变化，
但行为必须不同）。这时应把意图建模为 Commit 上的显式字段，而不是恢复对命令类型的分支。
