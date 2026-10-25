# Architecture Decision Records

一份 ADR 记录一个长期决定：为什么这样做、代价是什么、什么情况下应该重新考虑。实现细节
写在代码和 [ARCHITECTURE](../../ARCHITECTURE.md) 里，不写在这里。

命名为 `ADR-NNN-short-title.md`，至少包含 Context、Decision、Consequences、Validation 与
Revisit Trigger。决定被推翻时，把状态改为 Superseded 并链接到新的 ADR，不删除旧文件。

| ADR                                                           | 决定                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| [001](./ADR-001-validate-each-commit-once.md)                 | 每次提交只在投影上做一次全量不变量校验（已被 008 取代） |
| [002](./ADR-002-consumers-read-changes-not-command-types.md)  | 消费者按 Change 路由；命令语义由属性测试固定            |
| [003](./ADR-003-storage-written-against-table-definitions.md) | 存储按表定义编写                                        |
| [004](./ADR-004-commits-publish-storage-changes.md)           | Commit 发布它写入的存储变化，不再派生 Delta             |
| [005](./ADR-005-persistence-stores-the-tables.md)             | 持久化直接存储表，只读当前格式                          |
| [006](./ADR-006-one-audio-output-for-every-revision.md)       | 所有 revision 共用一个音频输出                          |
| [007](./ADR-007-snapshots-share-unchanged-parts.md)           | Snapshot 在 revision 之间共享没变的部分                 |
| [008](./ADR-008-commits-validate-what-they-wrote.md)          | 提交只校验它写过的内容                                  |
