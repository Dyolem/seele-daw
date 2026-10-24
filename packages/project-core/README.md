# @seele-daw/project-core

项目内核：持有 Web DAW 唯一的创作事实，把每次编辑变成一次原子、可撤销、可订阅的提交。
不依赖框架、DOM 或浏览器存储，测试在 Node 中运行。分层与依赖规则见
[ARCHITECTURE](../../ARCHITECTURE.md)，设计取舍见 [ADR](../../docs/adr/README.md)。

## 对外接口

一切从 `@seele-daw/project-core` 根入口导入。

| 接口                                                                 | 作用                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `createInitialProjectSession`、`createProjectSessionFromProjectFile` | 新建项目，或从项目文件加载                                                   |
| `session.execute(command)`                                           | 执行命令，返回 `committed`（带 `ProjectCommit`）或 `no-change`               |
| `session.undo()` / `session.redo()`                                  | 重放 History；栈空时返回 `null`                                              |
| `session.query(query)`                                               | 按 revision 一致地读取 MIDI Note（按 ID 或按区间）                           |
| `session.subscribe(subscription, observer)`                          | 在微任务中收到提交：全部提交，或按 Source / Note / Tick 区间过滤的 Note 变化 |
| `session.getSnapshot()`                                              | 当前 revision 的全部表（`ProjectTables`），同一 revision 内返回同一个对象    |
| `createProjectFileDTO`、`decodeProjectFileDTO`                       | 项目文件的写出与严格读取                                                     |
| `saveProjectCheckpoint`、`restoreProjectCheckpoint`                  | 应用内保存与恢复；存储端口由调用方实现                                       |

命令共 18 种，由 `PROJECT_COMMAND_TYPE` 列出：替换 Instrument Device；新增 Instrument Track
（单条或批量导入）；新增 MIDI Clip（空 Clip、带第一枚 Note，或向右扩展并加 Note）；MIDI Note
的增、删、移动与调整长度；Sustain Pedal（CC64）事件的增、删、移动与改值；Tempo 事件的增、删、
移动与改 BPM。命令携带完整参数和 `baseRevision`，不读取编辑器状态；违反业务规则时抛
`ProjectCommandError`。

## 一次提交

```text
execute(command)
→ prepareProjectCommand   normalize；检查 baseRevision；handler 读取当前记录，产出 MutationPlan
                          （forward 变化与工厂生成的 inverse），或 no-change
→ commit candidate        下一个 revision、origin，changes 即 plan.forward
→ History、QueryIndex、ChangePublisher 预备
→ MutationApplier         在写时复制的投影上检查每条变化的前置条件，做一次全量不变量校验
                          （ADR-001），再写入；revision 最后写
→ 返回结果；订阅者在微任务中收到 Commit
```

写入中途出现程序错误时，Applier 只回滚已完成的前缀，并重新校验；回滚也失败就锁存为 faulted，
拒绝之后的写入。业务失败不会留下部分模型、History 项或通知。Undo / Redo 走同一条管线，Plan
由 History 中保存的变化重建。

## 存储与变化

表在 `model/model-tables.ts` 中声明一次：

- 按 ID 存储的记录表：`tracks`、`clips`、`midiSources`、`tempoEvents`、`timeSignatureEvents`、
  `devices`；
- 按 MIDI Source 分区的表：`midiNotes`、`midiSustainPedalEvents`；
- 另有单条的 `project` 与 `master`，以及有序的 `trackOrder`。

`ModelStore` 把容器留在私有闭包里，只有 `MutationApplier` 能领取一次写能力。记录是只读值对象，
修改即整体替换，所以未变化的记录在 Snapshot 与 Query 结果中保持引用相等。

每一次写入是一条存储变化 `ProjectChange`，形如 `{ op, table, ... }`：

| op                                      | 适用的表                                         | 携带                                            |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `insert` / `remove` / `replace`         | 记录表、分区表；`project`、`master` 只有 replace | `after`、`before` 或两者；分区表另带 `sourceId` |
| `insert-partition` / `remove-partition` | 分区表                                           | `sourceId` 与分区中的全部记录                   |
| `insert` / `remove`                     | `trackOrder`                                     | `index` 与 `trackId`                            |

命令产出这些变化，History 重放它们的反转，Commit 原样发布写入的那些（ADR-004）。消费者按表
读取：播放看有没有 `tempoEvents` 变化，QueryIndex 与 Note 订阅只读 `midiNotes`。新增一张表时，
变化词汇、反转、投影与写入都随表定义生效（ADR-003）。

跨实体规则（外键、唯一所有权、Source 范围、Timeline 初始事件、Device 拓扑）只由
`model/invariant-validator.ts` 判断；单条记录的值域由各自的记录工厂判断。

## 持久化

Snapshot 与项目文件共用一个形状 `ProjectTables`：记录表是数组，分区表是“MIDI Source ID →
记录数组”的无原型对象。项目文件（`formatVersion: 3`）就是去掉 `modelRevision` 的 Snapshot，
History 与索引都不进入文件。读取先把输入复制成被动 JSON 数据，按每张表的字段表检查结构，再把记录交给记录
工厂校验，最后建立 Store 并做一次不变量校验。只读当前版本，不做迁移（ADR-005）。失败统一为
带 `code` 与 `path` 的 `ProjectFileError`。格式见 [项目文件格式](./docs/project-file-format.md)。

Checkpoint 把项目文件包在带来源 revision 的信封里。`ProjectCheckpointStore` 只定义保存与
“按恢复优先级读取候选”两个操作；浏览器实现（IndexedDB，保留 active 与 previous 两份）在
`platform-browser` 中。

## 目录

```text
src/
├── model/          表定义、ModelStore、记录与 ID、不变量
├── time/           Tick、Tempo 与拍号事件
├── mutation/       ProjectChange、MutationPlan、投影与 MutationApplier
├── commands/       protocol/（命令协议）、preparation/（注册表），以及各实体的 handler
├── commit/         ProjectCommit 与候选
├── session/        ProjectSession 与提交编排
├── history/        Undo / Redo
├── queries/        QueryIndex 与查询
├── subscriptions/  ChangePublisher 与订阅过滤
├── snapshots/      Snapshot
├── persistence/    项目文件（字段表与解码器）与 Checkpoint
└── index.ts        唯一公开入口
```

## 测试

测试平铺在 `src/__tests__/*.spec.ts`，共享夹具在 `src/__tests__/support/`，规则见
[`src/__tests__/README.md`](./src/__tests__/README.md)。三个测试固定了上面的大部分保证：

- `command-properties.spec.ts`：每种命令只改自己点名的实体，Undo / Redo 精确往返（ADR-002）；
- `mutation-applier.spec.ts`：每种表与操作的真实写入等于投影；
- `mutation-plan.spec.ts`：从表定义生成全部 `table.op`，逐一检查反转。

提交成本基准：`pnpm --filter @seele-daw/project-core bench`。

## 延伸阅读

- [MIDI Project Model V1](./docs/midi-project-model-v1.md)：字段、所有权与不变量
- [Project Command 集合与事务语义](./docs/project-command-collection-semantics.md)
- [MIDI Sustain Pedal CC64 Project Fact V1](./docs/midi-sustain-pedal-cc64-project-fact-v1.md)
- [Record、Class 与生命周期协作者](./docs/records-classes-and-lifecycles.md)、
  [小型实体与模型演进](./docs/small-records-and-model-evolution.md)
- 已完成阶段的计划与收口报告：[docs/archive](../../docs/archive/README.md)
