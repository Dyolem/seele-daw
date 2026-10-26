# ADR-010：Clip 内的编辑沿用没变的音符

- 状态：Accepted
- 日期：2026-10-25
- 实施：与本文同一提交

## Context

ADR-007 到 ADR-009 之后，一次编辑的成本只随它碰到的 Clip 与 Source 增长，但在一个 Clip 内部
仍是整体处理：读 Snapshot 时，被写过的分区整个复制、重新排序；编译把变了的 Clip 的音符全部
重新编译、排序；调和把这个 Clip 的新旧 span 全部按 key 配对。在只有一个 80,000 音符 Clip 的
项目上，提交只要约 0.02 ms，读 Snapshot 却要约 8 ms，编译与调和约 110 ms。三份 ADR 的重新评估
条件指的都是这件事。

## Decision

1. Session 在两次读 Snapshot 之间，按分区记住写过的记录 ID。读 Snapshot 时，把写过的记录排好序
   并入上一份 Snapshot 的分区，没写过的记录按原顺序沿用；分区被新建或删除时才整体复制。没写过
   的记录在 revision 之间是同一个对象，这一点本来就成立，现在编译依赖它。
2. Clip 记录与踏板数组没变、只有音符数组变了时，编译同时走一遍新旧音符数组（都是按 ID 排序的
   分区），找出不再是同一条记录的 Note：丢掉它们旧的 span，只编译新增与被改写的 Note，再并入
   上次的 span 数组。踏板或 Clip 变了就重新编译整个 Clip，因为一枚踏板事件可能改变许多音符的
   释放时间。
3. 调和同时走一遍一个 Clip 的新旧 span 数组：两边是同一个对象就跳过，只把不同的 span 按 key
   配对。span 顺序只决定能跳过多少，不影响结果：一个 span 如果在两边都被单独经过，仍会按 key
   和自己配对。

## Consequences

- 移动一个音符后编译、调和、建 Scheduler：16 × 5,000 从约 6 ms 降到约 0.43 ms，1 × 80,000 从约
  110 ms 降到约 7 ms。移动后再读 Snapshot：16 × 5,000 从约 0.5 ms 降到约 0.16 ms，1 × 80,000 从约
  8 ms 降到约 2.3 ms。
- 剩下的成本仍随变了的 Clip 线性增长，只是每个音符只剩几次比较与复制。要再降，就得把分区与 span
  数组分块，让一次编辑只复制它碰到的块；目前没有这样做。
- 踏板编辑仍重新编译整个 Clip。
- 沿用按对象身份判断。如果没变的记录被换成新对象，结果仍然正确，只是退回整体编译。
- 比较两份按 ID 排序的记录这一步由 project-core 的 `diffSnapshotRecords` 提供；播放编译与 editor
  的 Track Read Model 都用它，各自只写合并。

## Validation

- `project-snapshot.spec`：400 步随机的音符与踏板编辑、新建 Clip、撤销与重做，每一步增量读出的
  Snapshot 都等于从 Store 从头读出的 Snapshot。
- `note-span-reuse.spec`：移动一个音符后，这个 Clip 只有它的 span 是新对象。300 步随机编辑、撤销
  与重做，每次编译的计划都等于对全新对象从头编译的计划；调和结果也等于两份从头编译的计划之间的
  调和，后者没有共享对象，每个 span 都按 key 配对。
- `piano-roll-track-read-model-reuse.spec`：编辑一个 Clip 后，其他 Clip 的 Read Model 与这个 Clip
  里没变的 Note 投影仍是同一个对象；300 步随机编辑、撤销与重做后，Read Model 都等于从头构建的。
- 故意破坏合并（Snapshot 3 种、编译 3 种、调和 4 种），上面的测试都会失败；只把调和的比较方向
  反过来时测试仍通过，与第 3 条一致。
- 基准：`pnpm --filter @seele-daw/project-core bench`、`pnpm --filter @seele-daw/playback bench`。
- `pnpm check` 全部通过。

## Revisit Trigger

- 单个 Clip 达到几十万个音符，线性合并在编辑时能被感觉到：把分区与 span 数组分块。
- 密集 Clip 上的踏板编辑变慢：只重新编译释放时间受被改踏板影响的音符。
