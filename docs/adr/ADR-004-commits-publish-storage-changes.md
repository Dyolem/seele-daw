# ADR-004：Commit 发布它写入的存储变化

- 状态：Accepted（取代 ADR-003 的第 4、5 条）
- 日期：2026-10-24
- 实施：`3de751d`

## Context

一次提交原本有两套变化词汇。Plan 里是 `ProjectMutation`：32 个类型名，payload 按实体手写。
Commit 里是语义 `ProjectChange`：`midi-clip.added` 这类按概念聚合的变化，带 `affected` 区间。
`project-delta.ts` 和 `project-commit-candidate.ts`（593 行）负责从前者推导后者：它们要识别
实体图（Track + Device + 顺序位置，Clip + Source + 两个分区），遇到不认识的序列就失败关闭。

ADR-003 之后，存储已按表分派，Mutation 却仍要经过一张类型名注册表才知道写哪张表；Delta 推导
则是每加一种实体都要写的第二份代码。而三个消费者实际只关心哪些表、哪些记录变了：播放判断有没有
Tempo 变化，QueryIndex 与 Note 订阅只看 Note。

## Decision

1. 唯一的变化词汇是存储变化 `{ op, table, ... }`。记录表有 `insert` / `remove` / `replace`，
   分区表另有 `insert-partition` / `remove-partition`（带 `sourceId`），再加上 `project`、`master`
   的 `replace` 和 `trackOrder` 的 `insert` / `remove`。表名就是 `model-tables.ts` 中的表名。
2. Commit 直接发布 Plan 的 `forward`，是同一个冻结数组，不再派生 Delta。`ProjectDelta`、
   `PROJECT_CHANGE_TYPE`、`PROJECT_MUTATION_TYPE` 与所有语义 Change 类型一并删除。
3. 消费者从表变化推导自己的行为。播放看有没有 `tempoEvents` 变化；QueryIndex 与 Note 订阅只读
   `midiNotes` 的变化，移动过的 Note 按新旧区间的并集匹配。
4. 提交时不再识别实体图。命令有没有写出完整的实体图，由投影上的不变量校验（ADR-001）和
   属性测试（ADR-002）负责。

## Consequences

- 新增一张表只需要表定义：变化词汇、反转、投影与写入都不用改。
- project-core 的非测试代码净减约 1,150 行；`project-commit-candidate.ts` 从 593 行降到 77 行。
- 消费者看到的是写入粒度：新增一个 MIDI Clip 是 4 条变化，而不是 1 条。需要实体级视图的消费者
  要自己聚合；目前还没有这样的消费者。
- 变化不再携带 `affected` 区间，需要区间的消费者从记录计算：Note 的区间从 `startTick` 起，长
  `durationTick`；CC64 从新旧 Tick 中较早的一个一直向后。
- 测试改为断言 `table.op` 标签（`describeChanges`、`requireChange`），而不是语义类型。

## Validation

- 测试通过：project-core 465 个、playback 107 个、Studio 699 个、project-midi 37 个；
  `pnpm type-check` 与 `pnpm lint` 也通过。
- `mutation-plan.spec` 用 `RECORD_TABLE_NAMES` 与 `PARTITIONED_TABLE_NAMES` 生成全部 32 种
  `table.op`，逐一检查反转与双重反转；新增一张表时，这个测试会要求补上它的例子。
- `project-subscription.spec` 固定移动 Note 的匹配：新旧区间之间命中，之外不命中。
- 基准：16 轨 × 5,000 音符下移动一个音符约 17.7 ms，与 ADR-003 时持平。

## Revisit Trigger

多个消费者需要实体级语义（例如“新增了一条 Track”），并且各自重复同样的聚合。那时在
project-core 提供一个从变化聚合实体视图的纯函数，而不是恢复第二套词汇。
