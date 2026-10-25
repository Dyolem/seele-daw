# ADR-001：每次提交只做一次全量不变量校验

- 状态：Superseded by [ADR-008](./ADR-008-commits-validate-what-they-wrote.md)
- 日期：2026-10-23
- 实施：`91e1fef`

## Context

每次 Commit 都对整个模型做两次 `assertModelInvariants`：一次在构造投影
（`ProjectedModelStoreReader`）之后、写入之前，一次在 `MutationApplier` 写入之后，用来发现
投影与真实写入之间的偏差。校验是 O(项目规模)，所以导入大型 MIDI 后，每一次拖拽的成本都随
项目大小线性增长。

在 16 轨、共 80,000 个 Note 的项目上测得：一次全量校验约 15–20 ms；移动一个 Note 约
30.7 ms，几乎全部花在这两次校验上。

## Decision

- 只在投影上校验一次，即写入之前。写入结果按构造与投影一致；`mutation-applier.spec`
  对每一种 Mutation 类型固定了这种一致性。写入后的第二次校验删除。
- 以下场景仍做全量校验：为一个 Store 创建 Applier 时（也就是加载项目时），以及写入失败
  回滚之后。
- 暂不做“只校验被触及实体”的增量校验。

## Consequences

- 同一次移动降到约 16–20 ms，其中约 15 ms 仍是那一次全量校验。
- 投影与写入之间若出现偏差，不再由运行时发现，只能靠 Applier 的测试发现。新增 Mutation
  类型时，必须在 `mutation-applier.spec` 中补上对应用例。
- 剩下的成本有一部分随“被编辑的 MIDI Source 的大小”增长，而不是随项目大小增长：分区按整块
  写时复制，查询索引也按 Source 维护。在一个含 80,000 个 Note 的 Source 里移动一个 Note
  约 47 ms。

## Validation

```sh
pnpm --filter @seele-daw/project-core bench
```

[`commit-cost.bench.ts`](../../packages/project-core/src/__tests__/commit-cost.bench.ts) 用一次
Track Collection Command 导入大型项目（与 MIDI 导入走同一条路径），然后测量“移动一个 Note”和
“一次全量校验”。2026-10-23 在开发机上的结果：

| 场景          | 移动一个 Note | 全量校验 |
| ------------- | ------------- | -------- |
| 16 轨 × 5,000 | 约 20 ms      | 约 15 ms |
| 1 轨 × 80,000 | 约 47 ms      | 约 15 ms |

## Revisit Trigger

- 典型项目的单次拖拽提交超过一帧（约 16 ms）预算，并且瓶颈是全量校验：改为只校验被触及
  实体及其所有者。
- 单个 Source 的规模成为瓶颈：把分区的写时复制改为按条目覆盖，而不是复制整个分区。
