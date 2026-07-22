# Project Entry Coordinator 基础计划

## 目标与边界

Active Project、浏览器 Catalog 和 Checkpoint 恢复已经分别完成，但启动入口仍缺少一层明确的产品解释：

```text
requested Project ID | no requested Project
-> ProjectEntryCoordinator
   -> ActiveProjectService.open
   -> ProjectCatalogReader.listRecentProjects
-> active | selection-required | failed
```

本阶段只实现框架无关的初始入口协调与稳定结果，不接 Vue、Router、`main.ts`、对话框或业务 Workbench。Create 和用户选择后的 Open 继续直接调用 `ActiveProjectService`，Coordinator 不复制这两个用例的状态机。

## 为什么不放入 ActiveProjectService

`ActiveProjectService` 拥有一个当前 Project 的 Create / Open / Save、Session 和 dirty 生命周期。它不应知道 URL 是否存在、最近项目如何展示、找不到路由项目时是否弹出选择界面。

Project Entry 属于 Studio 产品入口策略：

- route Project ID 存在时尝试 Open；
- 没有请求身份时读取最近项目；
- 请求身份不存在时读取其他最近项目；
- 存储损坏或读取失败不能伪装成“可以新建”。

把这些分支留在 Vue component 会让 Router、启动页和测试分别解释一次错误。独立 Coordinator 只组合现有能力，不取得 Session 或 IndexedDB 资源所有权。

## Studio Catalog Reader 契约

当前 `ProjectCatalogReader` 定义在 Browser Runtime 文件中，并直接引用 platform-browser 的结果类型。本阶段把 UI-facing 窄契约移到 Studio Workbench：

```ts
interface RecentProjectSummary {
  projectId: ProjectId
  name: string
  lastCheckpointSavedAt: number
}

interface ProjectCatalogReader {
  listRecentProjects(): Promise<readonly RecentProjectSummary[]>
}
```

Browser Runtime 仍用 `IndexedDBProjectCatalog` 结构化实现该接口，但 Coordinator 不 import platform-browser，也不知道 database name、`close()` 或 `idb` 类型。Catalog Reader 返回的顺序契约是最后成功 Checkpoint 时间降序。

## 稳定结果

```ts
type ProjectEntryResolution =
  | { kind: 'active'; projectId: ProjectId }
  | {
      kind: 'selection-required'
      reason: 'no-requested-project' | 'requested-project-not-found'
      requestedProjectId: ProjectId | null
      recentProjects: readonly RecentProjectSummary[]
    }
  | {
      kind: 'failed'
      operation: 'validate-requested-project' | 'open-requested-project' | 'list-recent-projects'
      requestedProjectId: ProjectId | null
      failureCause: unknown
    }
```

结果对象、最近项目数组与每个摘要都冻结。Coordinator 复制 Reader 的摘要，不能把外部实现提供的可变数组直接交给未来 UI。

## 解析规则

### 没有 requested Project ID

```text
listRecentProjects
-> selection-required(no-requested-project, projects)
```

Catalog 为空仍是合法选择结果；未来 UI 只展示 Create。Coordinator 不自动打开第一项，也不把“最近”误解为默认选择授权。

### 有 requested Project ID

```text
validate Project ID
-> activeProject.open(projectId)
   -> success: active(projectId)
   -> project-not-found:
        listRecentProjects
        -> selection-required(requested-project-not-found, other projects)
   -> any other failure:
        failed(open-requested-project, cause)
```

只有真实 `ActiveProjectError` 的 `project-not-found` 可以进入选择流程。Checkpoint candidates 全损坏、数据库失败、Service disposed 或其他异常都必须返回 failed，不能创建空项目或隐藏恢复问题。

已确认不存在的 requested Project ID 会从最近列表中排除。正常原子存储不会产生这种重复；过滤只避免损坏或陈旧 Catalog 让 UI 再次提供一个刚刚失败的选择，不修改持久化数据。

Project ID 运行时校验失败返回 `failed(validate-requested-project)`，不调用 Active Project 或 Catalog。

## 后续选择动作

Coordinator 本阶段不增加 `create()` / `openRecent()` 包装：

```text
Create choice
-> activeProject.create()
-> router.replace(generated Project ID)（后续）

Recent choice
-> activeProject.open(selected Project ID)
-> router.replace(selected Project ID)（后续）
```

这样身份分配、初始 Checkpoint、严格 Open 和状态发布仍只有 ActiveProjectService 一个权威实现。

## 并发与导航

本阶段结果是一次调用对应一个 Promise，不持有 Vue state，也不尝试取消 Router navigation。未来 Router adapter 必须用 navigation token 忽略迟到的入口结果，并在离开 dirty Project 时实现 Save / Discard / Cancel。

持续 route 切换、关闭 Active Project 和 dirty navigation guard 需要共同设计，不能在当前无 Router 模块中假装已经解决。本阶段测试单次入口解析及底层失败，不扩张 ActiveProjectService 生命周期。

## 模块位置

```text
apps/studio/src/workbench/project/
├── project-catalog-reader.ts
└── entry/
    ├── project-entry-coordinator.ts
    └── __tests__/
        └── project-entry-coordinator.spec.ts
```

## 测试与验收

- 无 requested ID 时不调用 Open，并返回有序最近项目选择；
- 空 Catalog 返回合法的空选择；
- 有效 requested ID 只调用 Open，不读取 Catalog；
- `project-not-found` 转为带其他最近项目的选择结果；
- 同 ID 的孤立 Catalog 摘要不会再次提供；
- 非 `project-not-found` Open 错误返回 failed 且不读取 Catalog；
- Catalog 读取错误保留原始 cause；
- 非法 Project ID 在调用依赖前失败；
- 所有公开结果与摘要冻结；
- Studio、workspace 类型、架构、测试和构建保持通过。

完成本独立模块后停止等待审阅；Composition Root 安装、Router、启动页、项目选择 UI 和 dirty navigation guard 留到后续阶段。

## 实施结果

本阶段已按上述边界完成：

- `ProjectCatalogReader` 与 `RecentProjectSummary` 已成为 Studio Workbench 的窄应用契约，Browser Runtime 继续用公开 `IndexedDBProjectCatalog` 结构化实现；
- `ProjectEntryCoordinator` 只注入 `ActiveProjectService.open` 能力与 Catalog Reader，没有取得 Create、Save、Session 或 dispose 权限；
- 无请求身份、有效请求身份、请求身份不存在三条正常入口均返回 frozen 判别结果；
- 只有真实 `ActiveProjectError(project-not-found)` 会转入最近项目选择，Checkpoint/存储/未知错误均保留为 failed；
- 已知打不开的请求 ID 会从返回摘要中排除，但 Coordinator 不修改 Catalog；
- Catalog 结果会复制并逐项冻结，不向未来 UI 泄漏 adapter 数组所有权；
- 新增 1 个测试文件、8 项测试，Studio 当前为 5 个测试文件、36 项测试；
- workspace lint、架构、类型检查、全部测试与 Studio 生产构建通过。

`main.ts`、Router、Vue component、项目选择动作、持续导航并发与 dirty guard 均未修改。
