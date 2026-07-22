# IndexedDB Project Checkpoint Store 计划

## 目标与边界

本阶段在 `platform-browser` 实现 Project Core `ProjectCheckpointStore` 的第一个浏览器适配器，把完整 Checkpoint 真正持久化到 IndexedDB：

```text
ProjectSession
-> ProjectCheckpointStore port
-> IndexedDBProjectCheckpointStore
-> private SeeleProjectDatabase
-> idb
-> browser IndexedDB
```

本阶段最初只实现 immutable checkpoint、active/previous 指针、恢复候选和数据库生命周期。随后在数据库进入真实产品前补齐同属 Physical Schema V1 的 Project Catalog；完整目录决策见 [IndexedDB Project Catalog V1 计划](./indexed-db-project-catalog-plan.md)。自动保存、dirty 状态、Journal、JSON codec、checksum、OPFS 或多标签页编辑冲突协调不属于本层。

## 为什么先使用 idb

生产主线不自行实现通用 IndexedDB Promise、事务和连接工具，也暂不引入 Dexie 的 Table、查询 DSL、响应式观察与事务域。当前存储需求主要是明确的原子工作流，而不是动态数据库查询；编辑业务查询仍由 Project Core 的内存 QueryIndex 承担。

`idb` 保留 object store、index、transaction、cursor 和 database version 等原生概念，只提供类型、Promise、升级回调与 `transaction.done`。这既减少机械样板，也保留对 IndexedDB 事务生命周期和物理格式的直接控制。

替换访问库并不等于自动兼容已有用户数据。真正需要稳定和测试的是数据库物理 Schema、升级路径与事务结果，因此 `idb` 只允许出现在 `storage/indexed-db` 内部，不能进入 Project Core、Studio 组合协议或本包公开类型。

后续只有在 Schema 迁移链、复合索引查询、批量 Journal benchmark、多上下文观察或重复数据访问模式证明收益明确时，才重新评估 Dexie。object store 数量增加本身不是切换理由。

## IndexedDB Physical Schema V1

默认数据库名称为 `seele-daw`，IndexedDB database version 为 `1`。这与 Project File format、Checkpoint format 和未来 Journal format 分别版本化。

数据库尚未通过产品入口产生需要保留的真实数据，因此后补的 `projectCatalog` 被视为首次完整 V1 的组成部分，database version 不提升。当前没有 V2 migration 或旧布局回填；数据库发布使用后的一切物理变化仍必须正常升级版本并提供迁移测试。

### `projectCheckpoints`

```text
keyPath: [projectId, checkpointId]
indexes: none
value: structured-cloned ProjectCheckpoint
```

复合主键使 Checkpoint ID 只需在单个项目内唯一。记录不可原地覆盖；重复主键是稳定的 `record-conflict` 错误。

### `projectCheckpointHeads`

```ts
interface ProjectCheckpointHeadRecordV1 {
  headRecordVersion: 1
  projectId: string
  activeCheckpointId: string
  previousCheckpointId: string | null
}
```

```text
keyPath: projectId
indexes: none
```

Head 是浏览器内部恢复元数据，不进入导出的 Project File 或 Project Checkpoint envelope。`headRecordVersion` 独立版本化 value 协议；读取时必须严格验证版本、字段集合、data property、ID 形状、Project ID 对应关系，以及 active/previous 不重复。

### `projectCatalog`

```ts
interface ProjectCatalogRecordV1 {
  catalogRecordVersion: 1
  projectId: string
  name: string
  lastCheckpointSavedAt: number
}
```

```text
keyPath: projectId
indexes: none
```

Catalog 是由成功 Checkpoint 保存产生的本地导航摘要。ID / 名称派生自项目事实，最后保存时间是 adapter 本地事实。它不进入 Project Core 项目模型或导出文件；`catalogRecordVersion` 独立版本化 value 协议，读取时同样从 `unknown` 严格解码。

## 保存事务

每次 `save(checkpoint)` 在覆盖三个 object store 的同一个 `readwrite` transaction 中执行：

```text
读取并验证当前 Head
-> 确认新 [projectId, checkpointId] 不存在
-> add 新 immutable Checkpoint
-> 原 active 变为 previous
-> 新 Checkpoint 变为 active
-> 更新 Catalog name 与 lastCheckpointSavedAt
-> 删除更旧 previous
-> 等待 transaction.done
```

只有 transaction complete 才表示保存成功，单条 request success 不能提前报告成功。任意请求、结构校验或提交失败都显式观察 abort，并保持旧 Checkpoint 与 Head 不变。

首版使用浏览器 `default` durability。适配器无法判断调用来自高频自动 checkpoint 还是显式 Save；未来保存协调层必须根据实测单独设计 durability 策略，不能在此处假定所有写入都应为 `strict`。

Checkpoint ID 代表一次不可变保存记录。调用方必须为新的保存尝试生成新 ID；首版不通过昂贵的 DTO 深比较把重复 ID 猜测为幂等重试。

## 恢复候选

`readCandidates(projectId)` 先读取并严格验证 Head，再按以下顺序读取：

```text
[active checkpoint value, previous checkpoint value]
```

Checkpoint value 本身保持为 `unknown`，由 Project Core 的正式 decoder 和领域不变量边界校验。若 Head 存在但某个指针对应的记录缺失，该位置仍返回 `undefined`，使核心保留候选失败诊断并继续 previous，而不是把结构损坏伪装成“项目从未保存”。

不存在 Head 时返回空数组。Head 自身无效属于 adapter 元数据损坏，抛出稳定存储错误；首版不扫描整个 object store 猜测替代 Head。

## 连接与错误边界

私有 `SeeleProjectDatabase` 负责 lazy open、复用连接、首次创建完整 V1、物理 Schema 校准、显式 close，以及在 `versionchange` 或异常 termination 后丢弃连接。Schema 校准检查三个 store 的名称、keyPath 和 index 集合，避免 TypeScript Schema 与实际浏览器数据库静默分叉。

IndexedDB database version 只版本化 object store、keyPath 和 index 等物理布局；Head / Catalog value 分别使用自己的 Record version。未来普通 value 字段演进可以在 database V1 中按记录版本解码，不能为了一个字段机械升级数据库，也不能在没有 record discriminant 的情况下猜测形状。

公开 `IndexedDBStorageError` 提供稳定 code、operation、database name、可选 Project/Checkpoint ID 和原始 cause。Project Core 的协调函数仍会把它包装为 storage-neutral `ProjectCheckpointOperationError`。

## 包结构

```text
src/storage/indexed-db/
├── indexed-db-project-checkpoint-store.ts
├── indexed-db-project-catalog.ts
├── indexed-db-project-catalog-record.ts
├── indexed-db-schema.ts
├── indexed-db-storage-error.ts
└── seele-project-database.ts
```

只有 adapter、Catalog 查询、构造选项、最近项目摘要和平台错误从 package root 导出。数据库 Schema、物理 record、`idb` 类型和连接对象保持包内私有。

## 测试与验收

使用 `fake-indexeddb` 验证真实 object store 和事务行为：

- 首次、第二次和第三次保存正确形成 active/previous 并清理更旧记录；
- 多项目记录隔离；
- 重复 Checkpoint ID 不移动 Head；
- 不可 structured clone 的写入失败不破坏旧恢复路径；
- active 缺失或内容损坏时，Project Core 可以诊断并恢复 previous；
- Head 损坏是稳定 adapter 错误；
- Physical Schema V1 的 stores、keyPath 和 indexes 与文档一致；
- Checkpoint 与 Catalog 摘要同事务提交，失败写入不推进最近保存时间；
- 最近项目按最后一次成功 Checkpoint 时间排序，Catalog 物理记录经过严格校验；
- 并发保存由重叠 readwrite transaction 串行化；
- 空数据库返回空 candidates；
- adapter 可关闭并重新打开数据库。

完成本阶段生产代码、测试和文档后停止，等待审阅；不连续接入 Studio 或开始 Journal。

## 实施结果

本阶段已于 2026-07-21 按上述边界完成：

- `platform-browser` 已显式依赖 `@seele-daw/project-core` 与 `idb 8.0.3`，测试使用 `fake-indexeddb 6.2.5`；
- 私有 `SeeleProjectDatabase` 已实现 lazy open、连接复用、V1 upgrade、物理 Schema 校准、close、`versionchange` 让路和异常 termination 失效；
- `IndexedDBProjectCheckpointStore` 已实现三 store 原子写入、active/previous 候选顺序、旧记录清理、Catalog 摘要更新、重复 ID 冲突和稳定平台错误；
- 持久化 Checkpoint 继续以 `unknown` 返回 Project Core，缺失 active 保留 `undefined` 诊断位置，损坏 active 可回退 previous；
- package root 只公开 adapter、构造选项与 `IndexedDBStorageError`，没有公开 Schema、连接、store 常量或 `idb` 类型；
- `IndexedDBProjectCatalog` 已实现只读最近项目查询；Physical Schema 仍为 database version 1，没有制造 V2 或迁移历史；
- 当前 `platform-browser` 基线为 2 个测试文件、18 项测试；Project Core 24 个测试文件、347 项测试保持通过；
- workspace 类型检查、架构检查、全部测试与 Studio 构建通过；Studio 接入、Journal、迁移、checksum、OPFS 和多标签页编辑协调未进入本阶段。
