# ADR-005：持久化直接存储表，只读当前格式

- 状态：Accepted
- 日期：2026-10-24
- 实施：与本文同一提交

## Context

项目文件曾是一份单独设计的 DTO：Note 与 CC64 事件嵌套在所属 Source 下，记录表是以 ID 为键
的对象，另有 `requiredFeatures`。读取要经过严格的结构解码（1,139 行）、V1 → V2 迁移，再由
normalizer 把 DTO 逐字段映射回记录（388 行）；写出则由 projector 再映射一遍（412 行）。加上
Checkpoint 的解码器和四个错误类，持久化约 3,000 行，几乎都是按实体手写的。

结果是每加一种实体，要在 DTO 类型、两份协议字段表、解码器、迁移、normalizer、projector 里各
写一遍；而记录工厂本来就会校验每个值，normalizer 只是在重复它们。项目没有需要兼容的真实
数据，迁移链只保护测试样本。ADR-003 的重新评估条件之一正是“项目文件协议成为新增实体的主要
成本”。

## Decision

1. 文件就是 ModelStore 的表（`formatVersion: 3`）。记录表写成记录数组，分区表写成
   “MIDI Source ID → 记录数组”，另有 `project`、`master` 与 `trackOrder`。记录的字段与运行时
   记录相同，writer 直接引用 Snapshot 中的记录，不复制。
2. 读取先把输入复制成被动 JSON 数据（复用 `parseJsonValue`），再按每张表的字段表检查结构，
   然后把记录交给它的工厂。工厂是值的唯一校验者；结构检查只管字段、数组与嵌套对象。
3. 只读当前版本。格式改变时版本号加一，旧文件以 `unsupported-format-version` 被拒绝，不写
   迁移；V1 / V2 的 decoder、迁移与 `requiredFeatures` 删除。
4. 文件与 Checkpoint 的解码失败统一为 `ProjectFileError`（`code` + `path`）；保存与恢复流程的
   失败是 `ProjectCheckpointError`。Checkpoint 信封与 active / previous 回退保持不变。

## Consequences

- 持久化从约 3,000 行降到约 800 行。新增一张表只需在 `persistence/record-decoders.ts` 写字段表
  与解码器；缺了会编译失败。
- 文件结构跟着存储结构走。将来若要让外部工具读写一份不同形状的文件，应另写导出格式，而不是
  让存储格式迁就它。
- 有了真实用户数据之后，“只读当前版本”不再成立：届时在读取前加一步按版本的迁移，迁移只做
  JSON 到 JSON 的变换，记录仍由工厂校验。
- 浏览器里旧格式的 Checkpoint 无法恢复，打开时报告“没有可用的 Checkpoint”。

## Validation

- `project-file.spec`：writer 对完整夹具的输出等于静态的 `fixtures/project-file.json`；读回再写出
  不变；15 种结构与取值错误各自报告预期的 `code` 与 `path`；accessor 不会被调用；`__proto__`
  作为 ID 与参数名可以往返。
- `project-checkpoint.spec`：信封校验、只捕获一次 Snapshot、存储失败包装、候选回退顺序。
- `pnpm check` 全部通过（project-core 465、platform-browser 23、project-midi 37、Studio 699 个
  测试）。

## Revisit Trigger

- 出现必须保留的用户数据：加入按版本的 JSON 迁移（见上）。
- 文件需要被第三方读写，或需要稳定的 checksum：设计独立的导出格式与规范化编码。
