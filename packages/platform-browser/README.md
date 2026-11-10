# @seele-daw/platform-browser

浏览器基础设施的实现：把项目的 Checkpoint 存进 IndexedDB，维护最近项目目录，以及把本地文件读成
字节。它不定义项目、编辑或播放的语义。实现由 Studio 的组合根创建并注入，核心包不依赖本包。

## 对外接口

| 导出                              | 作用                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `IndexedDBProjectCheckpointStore` | 实现 project-core 的 `ProjectCheckpointStore`：`save(checkpoint)`、`readCandidates(projectId)` |
| `IndexedDBProjectCatalog`         | `listRecentProjects()`：按最后保存时间从新到旧列出项目                                         |
| `BrowserLocalFileByteReader`      | 把 `File` 或 `Blob` 读成调用方独占的 `Uint8Array`                                              |

## IndexedDB 中的数据

数据库名为 `seele-daw`，版本 1，有三个 object store，都没有索引：

| Store                    | Key                         | 内容                                    |
| ------------------------ | --------------------------- | --------------------------------------- |
| `projectCheckpoints`     | `[projectId, checkpointId]` | 不可变的 Checkpoint，一次保存一行       |
| `projectCheckpointHeads` | `projectId`                 | 指向 active 与 previous 两份 Checkpoint |
| `projectCatalog`         | `projectId`                 | 项目名与最后一次成功保存的时间          |

一次保存在同一个事务里做四件事：写入新的 Checkpoint；把 Head 的 active 换成它，原来的 active 降为
previous；更新 Catalog；删除更早的那一份。事务失败时什么都不变，所以最近项目列表不会指向一次失败
的保存。读取时按 active、previous 的顺序给出候选，由 project-core 逐个解码并决定用哪一份，见
[项目文件格式](../project-core/docs/project-file-format.md)。

存进去的值读出时一律当作不可信数据重新解码：Head 与 Catalog 记录各有自己的版本字段和精确的
字段集合。打开数据库时核对 object store 与 keyPath，布局不符就拒绝使用。记录字段的演进用记录
版本表达；只有 object store、keyPath 或索引改变才升级数据库版本。

`idb` 只是访问库，它的类型不出现在公开接口里。稳定的是数据库名、版本、object store、keyPath 和
事务协议。最后保存时间是本机的存储事实，不进入项目文件。

## 失败

失败抛普通的 `Error`，消息写明是哪个操作、哪个数据库，原始错误放在 `cause` 里。数据库名为空时抛
`RangeError`。本地文件读出的字节数与文件大小不一致时报错。

## 尚未提供

自动保存、多标签页协调、资产库（OPFS）、Worker 和能力探测都还没有。它们的顺序与做法见
[长期架构与路线](../../docs/architecture/long-term-architecture.md)的 3.5 节。

## 测试

测试在 `fake-indexeddb` 上运行，覆盖物理 Schema、保存与目录的原子性、active 与 previous 的轮换和
回退、重复的 Checkpoint ID、事务中止、损坏的 Head 与 Catalog 记录、项目之间的隔离，以及本地文件
读取的复制、空文件和失败。

## 延伸阅读

- 已完成阶段的计划：
  [IndexedDB Project Checkpoint Store](../../docs/archive/platform-browser/indexed-db-project-checkpoint-store-plan.md)、
  [IndexedDB Project Catalog V1](../../docs/archive/platform-browser/indexed-db-project-catalog-plan.md)
