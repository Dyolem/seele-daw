# Seele 项目文件格式

当前版本是 `formatVersion: 4`。项目文件就是去掉 `modelRevision` 的 Snapshot：两者共用
`ProjectTables` 这个形状，记录原样写出，不含 History 与索引。读取只接受这一个版本。格式改变时版本号加一，旧文件会被明确拒绝，
不做迁移（[ADR-005](../../../docs/adr/ADR-005-persistence-stores-the-tables.md)）。

完整样例是 [`project-file.json`](../src/__tests__/fixtures/project-file.json)；测试要求 writer
对完整夹具的输出与它逐字段一致。

## 顶层

| 字段                                                                              | JSON 类型 | 内容                                      |
| --------------------------------------------------------------------------------- | --------- | ----------------------------------------- |
| `formatVersion`                                                                   | number    | `4`                                       |
| `project`                                                                         | object    | `{ id, name }`                            |
| `master`                                                                          | object    | `{ gain, muted }`                         |
| `trackOrder`                                                                      | string[]  | Track ID，按显示顺序                      |
| `tracks`、`clips`、`midiSources`、`tempoEvents`、`timeSignatureEvents`、`devices` | array     | 记录表，每项一条记录                      |
| `midiNotes`、`midiSustainPedalEvents`                                             | object    | 分区表：MIDI Source ID → 该 Source 的记录 |

字段不能缺，也不能多。writer 按 Snapshot 的规范顺序写记录：普通记录按 ID，时间线事件按 Tick。

## 记录

字段与运行时记录完全相同：

| 表                       | 字段                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `tracks`                 | `id`、`name`、`color`、`channel`、`instrumentDeviceId`                                             |
| `channel`                | `gain`、`pan`、`muted`、`soloed`                                                                   |
| `clips`                  | `id`、`trackId`、`name`、`color`、`muted`、`startTick`、`spanTick`、`sourceId`、`sourceOffsetTick` |
| `midiSources`            | `id`、`lengthTick`                                                                                 |
| `tempoEvents`            | `id`、`tick`、`bpm`                                                                                |
| `timeSignatureEvents`    | `id`、`tick`、`numerator`、`denominator`                                                           |
| `devices`                | `id`、`typeId`、`definitionVersion`、`enabled`、`parameters`、`opaqueState`                        |
| `midiNotes`              | `id`、`startTick`、`durationTick`、`pitch`、`velocity`、`channel`                                  |
| `midiSustainPedalEvents` | `id`、`tick`、`value`、`channel`                                                                   |

值的范围由各自的记录工厂判断（`model/` 中的 `create…Record`），本文不重复。ID 是
不透明字符串，`__proto__` 这样的 ID 或参数名按普通数据读写。

## 读取

`createProjectSessionFromProjectFile(input)` 依次：

1. 把输入复制成被动的 JSON 数据：只接受普通对象、紧凑数组、有限数字、字符串、布尔与
   `null`，不调用 accessor，拒绝循环引用；
2. 检查 `formatVersion`，再按字段表检查结构；
3. 把每条记录交给它的记录工厂，工厂拒绝的值报告在该记录的路径上；
4. 建立 ModelStore（同一张表或同一分区里 ID 重复时在此拒绝），做一次全量不变量校验，得到
   revision 为 0、History 为空的新 Session。

`decodeProjectFile(input)` 只做前三步。失败都是 `ProjectFileError`，消息写明原因与位置，例如
`Missing field name at ["tracks",0,"name"]`。以下输入会被拒绝：

- 不是被动 JSON 数据；
- 版本不是 4；
- 缺字段、多字段，或容器类型不对；
- 记录工厂或 ID 解析拒绝了一个值，`cause` 是 `DomainValueError`；
- 同一张表或同一分区里 ID 重复；
- 记录合起来违反跨实体不变量，`cause` 是 `ModelInvariantError`；
- Checkpoint 与其中的文件属于不同项目。

## Checkpoint

应用内保存把文件包进 `{ checkpointFormatVersion: 1, checkpointId, projectId,
sourceModelRevision, projectFile }`。`checkpointId` 让存储可以只追加不可变的行；
`sourceModelRevision` 只用于诊断，恢复出的 Session 仍从 revision 0 开始。

`restoreProjectCheckpoint` 按存储给出的顺序（先 active，再 previous）逐个解码候选，返回第一个
能组成合法项目的；被拒绝的候选及其 `ProjectFileError` 一并返回。全部失败时抛
`AggregateError`，`errors` 依次是每个候选的 `ProjectFileError`，不会悄悄创建空项目。存储
本身读写失败时，它的错误原样抛出。
