# Browser Active Project Runtime 计划

## 目标与边界

本阶段在 Studio 内建立 Project 子系统的浏览器运行时组合，把已经独立验证的三层能力第一次连接起来：

```text
BrowserActiveProjectRuntime
├── ActiveProjectService
├── IndexedDBProjectCheckpointStore
├── IndexedDBProjectCatalog
└── minimal new-project Session factory
```

目标是证明 Create 可以在真实 IndexedDB adapter 中分配身份、保存最小初始 Checkpoint、进入最近项目目录，销毁整个运行时后再由新运行时恢复。Vue、Pinia、Router、项目选择对话框、默认 Instrument Track、自动保存、Journal、多标签页协调和可视化界面不进入本阶段。

## 为什么还需要运行时组合

`ActiveProjectService` 只依赖 `ProjectCheckpointStore`、Project / Checkpoint ID 工厂和新建 Session 工厂，因此可以在 Node、浏览器或未来其他宿主中复用和测试。它不应自行 `new IndexedDBProjectCheckpointStore`、读取 `crypto` 或决定产品的新项目模板。

Studio 是唯一 Composition Root。当前阶段增加的 `BrowserActiveProjectRuntime` 是 Project 子系统的组合辅助对象，由未来 `main.ts` 创建，不成为新的跨应用 Composition Root。它负责实例所有权，而不是增加新的项目领域规则。

## 公开表面

```ts
interface BrowserActiveProjectRuntime {
  readonly activeProject: ActiveProjectService
  readonly projectCatalog: ProjectCatalogReader
  dispose(): void
}

interface BrowserActiveProjectRuntimeOptions {
  readonly databaseName?: string
  readonly getCurrentTime?: () => number
  readonly newProjectName?: string
  readonly createUniqueId?: () => string
}
```

- 默认数据库名称继续由 platform-browser 决定；`databaseName` 只用于隔离环境和测试；
- 默认项目名称为 `Untitled Project`，未来明确的新建流程可以注入用户名称；
- 默认唯一 ID 来源为 `globalThis.crypto.randomUUID()`；可注入函数使测试确定且不伪造浏览器全局；
- Project ID、Tempo / Time Signature Event ID 与 Checkpoint ID 共用该唯一 ID 来源，但分别经过对应领域 parser；
- `getCurrentTime` 传给 Checkpoint adapter，用于生成 Catalog 的最后保存时间，默认使用 `Date.now`；
- Runtime 公开 `ActiveProjectService` 与只含 `listRecentProjects()` 的 Catalog Reader，不把 Catalog 的 `close()`、Checkpoint Store、数据库连接、object store 名称或 `idb` 类型交给组件。

这些类型都属于 Studio 内部应用代码，不从 workspace package root 对外形成长期 SDK。

## 最小新项目模板

新建 Session 使用 Project Core 的 `createInitialProjectSession`，只提供产品层必须决定的输入：

```text
Runtime 新生成的 Project ID
默认或注入的 Project name
新的 Tempo Event ID
新的 Time Signature Event ID
```

其结果保持 Project Core 已定义的最小合法结构：120 BPM、4/4、unity master gain、零 Track、零 Clip、零 Device。默认 Instrument Track 需要 Instrument Device、Device Definition 和 Track / Source / Clip 产品规则，继续作为后续独立模板阶段讨论，不能偷偷塞进本组合模块。

唯一 ID 来源的每个返回值都要经过对应的公开领域 parser。Runtime 不用 TypeScript cast 宣称浏览器或注入值合法。`activeProject.create()` 内部取得新 Project ID 并在成功后返回给未来 Router；`activeProject.open(projectId)` 只接收导航或 Catalog 已经选中的已有身份。

## 生命周期所有权

Runtime 创建并拥有 Checkpoint Store、Project Catalog 与 Active Project Service，因此销毁顺序固定为：

```text
ActiveProjectService.dispose()
-> IndexedDBProjectCatalog.close()
-> IndexedDBProjectCheckpointStore.close()
```

先终止 Session / state subscriptions 和异步 completion 对当前状态的影响，再关闭数据库连接。`dispose()` 必须幂等。Store 的 `close()` 只关闭连接，不删除持久化数据；新的 Runtime 可以继续使用同一数据库恢复。

若 dispose 时存在保存事务，IndexedDB 的连接关闭语义允许已有事务结束，而 Active Project generation guard 会忽略其迟到 completion。本阶段不增加自制 cancellation token。

## 模块位置

```text
apps/studio/
├── docs/browser-active-project-runtime-plan.md
└── src/workbench/project/
    ├── browser-active-project-runtime.ts
    ├── minimal-new-project-session.ts
    └── __tests__/browser-active-project-runtime.spec.ts
```

运行时从 `@seele-daw/project-core` 和 `@seele-daw/platform-browser` 的 package root 导入。浏览器存储实现仍由 platform-browser 拥有；Studio 只负责装配。

## 跨层验收

Studio 测试显式依赖 `fake-indexeddb`，但生产代码只使用 platform-browser 公开 adapter。集成测试覆盖：

1. 执行无参数 Create，生成新 Project ID 并创建最小 Session；
2. 最小 Session 具有合法、独立的 Tempo 与 Time Signature 身份，且没有偷偷创建 Track / Clip / Device；
3. Create 的初始 Checkpoint 写入真实 IndexedDB V1，并直接进入 clean；
4. Project Catalog 立即返回该项目名称、身份与最后保存时间；
5. dispose 第一个 Runtime 后，用相同 database name 创建第二个 Runtime；
6. 第二个 Runtime 打开相同 Project ID，恢复新的 clean Session，项目事实与保存内容一致；
7. 恢复路径不调用新项目 ID 来源；
8. 重复 dispose 安全，两个 IndexedDB 连接均关闭，数据库可以在测试结束后删除；
9. 无效唯一 ID 或项目名称由正式领域边界拒绝并进入 Active Project 的明确失败状态。

完成生产代码、文档、测试和 workspace 验证后停止等待审阅，不连续接入 Vue 或 Router。

## 实施结果

本阶段已于 2026-07-22 按上述边界完成：

- `BrowserActiveProjectRuntime` 已从 workspace package root 组合 `IndexedDBProjectCheckpointStore`、`IndexedDBProjectCatalog` 与 `ActiveProjectService`，公开活动项目服务和只读目录查询，不泄漏 Store、连接或 `idb` 类型；
- 默认唯一 ID 来源为浏览器 `crypto.randomUUID()`，测试可以注入确定性来源；Project、Checkpoint、Tempo Event 与 Time Signature Event 的值均经过对应的 Project Core parser；
- `createMinimalNewProjectSession` 已明确拥有 `Untitled Project`、120 BPM、4/4 和零 Track 产品模板边界，没有提前创建 Instrument、Source、Clip 或 Device；
- Runtime 幂等 dispose 已固定为先释放 Active Project、再关闭 Catalog 与 Checkpoint Store 的 IndexedDB 连接，关闭连接不会删除已保存项目；
- Studio 已显式加入 `fake-indexeddb 6.2.5` 开发依赖，并通过真实 platform-browser adapter 验证新建即保存、Catalog 发现、Runtime 销毁、重新组合和恢复 clean Session；
- 恢复得到的是新的 Session 实例，项目事实与保存前一致，并且恢复路径不会消费新项目 ID；
- 无效唯一 ID 与无效项目名称继续由正式领域 parser / factory 拒绝，Active Project 进入明确的 create-failed 状态；
- Studio 当前为 4 个测试文件、28 项测试；Project Core 24 个测试文件、347 项测试与 platform-browser 18 项测试保持通过；
- workspace 架构检查、类型检查、全部测试和 Studio 生产构建通过。

Vue shallow reactive bridge 与 provide / inject 已在随后阶段完成。Router、最近项目选择界面、默认 MIDI Track 模板、自动保存和 Journal 仍未进入本阶段。
