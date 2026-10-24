# ADR-003：存储按表定义编写，Mutation 形状保持显式

- 状态：Accepted
- 日期：2026-10-23
- 实施：`21dd1df`

## Context

project-core 的存储层为每种实体手写分支：ModelStore 的字段、Seed、写闭包与访问器，写能力
接口，投影读取器的表、访问器与分派，Applier 的分派，以及 Mutation 的校验、复制与反转。CC64
这一种分区实体在这些地方大约占了 290 行机械代码，路线图上的 Automation、Audio Clip、Mixer
每加一种都要再写一遍。

## Decision

1. 表只在 `model/model-tables.ts` 声明一次，分两种：按 ID 存储的记录表，以及按 MIDI Source
   分区的表。表名同时就是 `ModelStoreSeed` 的字段名。
2. ModelStore 的容器、写能力（`writeRecord`、`insertPartition`、`removePartition`、
   `writePartitionRecord`）、投影读取器和 Applier 都按表的种类分派，不再按实体分派。每个
   Mutation 类型通过一张注册表对应到“哪张表、什么操作”。
3. 类型化的读取访问器只在抽象类 `ModelStoreReader` 中写一次，ModelStore 与投影都继承它。
   读者也可以用 `recordTable(name)` / `partitionedTable(name)` 取得任意表的冻结只读视图。
4. Mutation 的形状和类型名保持显式，不改成 `{ table, op, key, before, after }`。命令 handler
   按这套词汇写 Mutation，测试中约 400 处断言读取它；改形状会重写这些期望，却不能比注册表
   多消掉任何逻辑。
5. Change 推导仍按概念逐个编写：Change 词汇是消费者的契约（见 ADR-002）。

## Consequences

- 新增一张表：一行表定义，加上 Mutation 类型名、联合类型成员与注册表条目；Store、投影和
  Applier 不用改。相当于 CC64 的存储代码从约 290 行降到约 50 行（不写类型化访问器则约 25 行）。
- 不变量、Change、Snapshot、项目文件协议和命令仍然按实体编写，它们是领域本身。所以一个类似
  CC64 的实体涉及的文件数只从 30 降到 28，减少的是每个文件里的机械代码。
- 类型的收窄集中在两处：表视图按表类型声明、按擦除后的记录存储；`describeMutation` 按操作
  读取 Mutation 字段。

## Validation

- 测试原样通过（project-core 475 个），没有改任何期望值。`mutation-applier.spec` 对全部 32 种
  Mutation 比较投影与真实写入，包括 Map 的插入顺序。
- `pnpm --filter @seele-daw/project-core bench`：16 轨 × 5,000 音符下移动一个音符约 17.5 ms，
  改动前约 20 ms，没有变慢。

## Revisit Trigger

- 需要一张不按 MIDI Source 分区的分区表（例如按自动化通道分区）：给分区表定义加上分区键。
- 项目文件协议成为新增实体的主要成本：考虑按表定义驱动 DTO 编解码。
