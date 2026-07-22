# IndexedDB Project Catalog V1 计划

## 目标与所有权

“打开指定项目”需要已知 `projectId`，但启动页的“最近项目”必须先发现本机有哪些项目。因此不能通过逐个调用 `readCandidates(projectId)` 猜测项目列表，也不能为了展示名称而扫描并解码全部 Checkpoint。

本阶段在 `platform-browser` 增加只读 `IndexedDBProjectCatalog`：

```text
successful Project Checkpoint save
-> atomically upsert Project Catalog metadata
-> listRecentProjects()
-> Studio startup / project picker（后续）
```

Catalog 是浏览器本地导航元数据，不是项目领域事实：Project Core 不知道“最近项目”，导出的 Project File 与 Project Checkpoint 也不包含 Catalog。Catalog 丢失时项目内容仍在 Checkpoint 中，但精确的本地最后保存时间只存在于 Catalog；未来重建可以恢复 ID / 名称并为时间使用明确 fallback，不能伪造原时间。本阶段不扫描存储自动修复。

## 为什么仍是数据库 V1

`projectCatalog` 直接属于 IndexedDB Physical Schema V1，database version 保持 `1`。虽然 Checkpoint adapter 的代码较早完成，但该数据库从未在真实产品入口中运行，也没有必须保留的用户数据；Catalog 的后补只是实现顺序错位暴露出的 V1 设计遗漏，不构成一次真实的 V1→V2 演进。

因此本阶段不会制造迁移代码、回填逻辑或虚假的 V2 历史。V1 首次建库一次性创建三个 object store：

```text
projectCheckpoints
projectCheckpointHeads
projectCatalog
```

等数据库真正进入产品并产生需要保留的数据后，再增加或改变物理结构时必须提升 database version、编写 migration 并使用旧库 fixture 验证。当前决定不能被解释为以后可以原地修改已发布 Schema。

## Catalog Record V1

```ts
interface ProjectCatalogRecordV1 {
  catalogRecordVersion: 1
  projectId: string
  name: string
  lastCheckpointSavedAt: number
}
```

```text
object store: projectCatalog
keyPath: projectId
indexes: none
```

`name` 取自本次成功保存的 Project File；只有保存 Checkpoint 后的名称才进入 Catalog。`lastCheckpointSavedAt` 是非负安全整数毫秒时间戳，由 adapter 的时钟来源产生。它表达“最近一次成功保存”，不是“最近打开”；单纯 Open 不修改持久化事实，也不会让一个未编辑项目跳到列表顶部。

`catalogRecordVersion` 版本化 object store 中的 value 协议，不等于 IndexedDB database version。未来只给 Catalog value 增加字段时，可以写 `ProjectCatalogRecordV2`，在同一个 database V1 / object store 中按记录版本解码并迁移；只有改变 object store、keyPath 或 index 等物理结构时才必须升级 IndexedDB database version。

首版预计本地项目数量很小，读取全部摘要后在内存排序，暂不增加只服务于一个查询的 IndexedDB index。排序首先按 `lastCheckpointSavedAt` 降序，时间相同按 `projectId` 稳定排序。

## 元数据分层与 V1 取舍

当前最近项目卡片的确定需求已经由三个业务字段覆盖：

| 字段                    | 用途                           | 权威层                       |
| ----------------------- | ------------------------------ | ---------------------------- |
| `projectId`             | 选择后调用 `open(projectId)`   | Project File，Catalog 是投影 |
| `name`                  | 无需加载整个 Checkpoint 即展示 | Project File，Catalog 是投影 |
| `lastCheckpointSavedAt` | 按最后一次成功持久化排序/展示  | 本地 Catalog 存储事实        |

本阶段不提前加入以下未确定字段：

- `createdAt`：新建、导入、复制、云端下载分别可能指原始创建时间或本地落库时间，产品语义尚未确定；
- `lastOpenedAt`：它支持 MRU 打开排序，但当前产品选择的是最后成功保存排序，Open 不应产生无关写入；
- `trackCount`、时长、缩略图：属于可重建预览投影，具体卡片设计确定后再定义；
- `isPinned`、标签、删除时间：属于项目管理 UI / 生命周期策略；
- Project File / Checkpoint 版本缓存：正式 decoder 才是兼容性权威，目录缓存不能替代打开校验；
- `sourceModelRevision`：恢复后 Session revision 会重新从零开始，不是跨生命周期可比较的项目版本。

如果以后这些字段只改变 Catalog value，使用独立 Catalog Record 版本演进即可，不需要为“多一个普通 property”升级 IndexedDB。若要按新字段建立 index，才属于真实 Physical Schema 升级。

## 为什么修改时间不进入项目事实

`lastCheckpointSavedAt` 表达本机 adapter 完成一次持久化事务的时间，不表达 Track、Clip、Note 等项目内容，因此不加入 Project Model、ProjectSnapshot 或 Project File V1。现有核心协议也明确要求等价项目事实产生确定性 DTO，不写入墙上时钟。

把 `updatedAt` 放入权威模型会产生几个问题：

- 同一 Command 在不同时间执行会产生不同 Snapshot / Project File；
- Undo / Redo 自身也会刷新时间，无法表达恢复到同一项目内容；
- 无内容变化的重复 Save 仍可能改变时间，导致项目被误判为内容改变；
- 本机时钟可能回拨，跨设备时钟也不能作为可靠提交顺序；
- timestamp 会污染未来 checksum、缓存、diff 与确定性测试。

未来若产品明确需要可移植的原始创建时间、作者或展示用修改时间，它们应进入独立的 document / bundle manifest metadata；如果需要同步顺序，应使用 cloud version、journal sequence 或提交协议，而不是墙上时钟。Project Model 继续只拥有可编辑项目事实。

## 原子一致性

Checkpoint 保存事务同时覆盖三个 store：

```text
add immutable Checkpoint
-> rotate active / previous Head
-> upsert Catalog name + lastCheckpointSavedAt
-> remove third-oldest Checkpoint
-> transaction complete
```

Catalog 与 Checkpoint 使用同一事务意味着：

- 保存失败时，不会把项目错误地推进到最近列表顶部；
- 首次 Checkpoint 成功时，项目已经可以被启动页发现；
- 后续保存会更新名称和保存时间，但仍保持每个 Project 一条摘要；
- Catalog 不能早于 durable Checkpoint 对外宣称项目存在。

## 读取与信任边界

`listRecentProjects()` 返回 frozen 摘要数组及 frozen entry。IndexedDB value 仍视为 `unknown`；读取时严格校验对象形状、精确字段、data property、Project ID、名称和时间戳。无效记录抛出稳定的 `invalid-record / list-recent-projects` 平台错误，不能依赖 TypeScript 接口信任磁盘内容。

首版不自动删除损坏 Catalog 记录，也不把某条损坏静默过滤掉。未来恢复界面可以在具有明确诊断和用户授权的前提下重建派生目录。

## 应用接入

`BrowserActiveProjectRuntime` 同时拥有并公开：

```text
activeProject   -> create / open / save
projectCatalog  -> listRecentProjects
```

未来启动流程可以按产品意图组合，而不把分支塞回 `ActiveProjectService`：

```text
route contains projectId
-> open(projectId)
-> not found: listRecentProjects()
-> UI asks Open recent or Create new
```

Catalog 只提供事实列表；选择最近哪个项目、是否弹窗、dirty 导航确认和路由跳转属于 Studio UI / Router 后续阶段。

## 验收

- Physical Schema V1 一次性包含三个正确 keyPath、无 index 的 store；
- 首次和后续 Checkpoint 保存原子创建/更新一条 Catalog 摘要；
- 多项目按最后成功保存时间稳定排序；
- 事务失败不改变旧 Catalog 摘要；
- 非法时钟在写入前被拒绝；
- 非法或不支持版本的物理记录不会越过 decoder；
- Catalog value 与 Head value 都带独立 Record V1 判别字段，不与 database version 混用；
- Runtime 的 Create 成功后无需第二次 Save 即可从 Catalog 发现项目；
- database version 保持 `1`，不存在 V2 migration 或旧布局回填代码。

完成本阶段后停止等待审阅；项目选择对话框、Router bootstrap、Catalog 重建/删除/重命名管理与多标签页协调不在本阶段。
