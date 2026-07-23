# Studio Project Router 集成计划

## 目标

本阶段把已经存在的 Project Entry、Active Project、Navigation Confirmation 与全局
Save / Discard / Cancel 对话框接入真实 URL：

```text
/
  -> Project Entry

/projects/new
  -> confirm(create-project)
  -> ActiveProjectService.create()
  -> replace /projects/:generatedProjectId

/projects/:projectId
  -> confirm(open-project)
  -> ProjectEntryCoordinator.resolve(projectId)
  -> Project ready placeholder | recoverable entry/failure state
```

离开 Project Route 回到 `/` 会映射为 `leave-project`。完成后，创建或打开项目都会拥有稳定
URL，刷新 `/projects/:projectId` 能重新打开同一持久化项目。

本阶段不实现 Workbench 编辑器布局、侧栏、时间线、钢琴卷帘或浏览器 `beforeunload`。

## Route 契约

首批 Route 是：

| Route name          | Path                   | 产品语义                   |
| ------------------- | ---------------------- | -------------------------- |
| `project-entry`     | `/`                    | 选择、新建或打开本地项目   |
| `project-create`    | `/projects/new`        | 一次性的 Create 命令 Route |
| `project-workspace` | `/projects/:projectId` | 打开并承载一个 Project     |

`project-create` 不长期承载业务界面。Create 成功后使用 `replace` 写入生成的 Project ID，
避免浏览器返回键重新创建另一个项目。

Project ID 在 URL 边界通过 Project Core 的正式 parser 校验。非法参数不会作为 Open intent
进入 `ProjectNavigationConfirmationCoordinator` 或 `ActiveProjectService`，而是回到 Project
Entry 并显示地址无效提示。回到 Entry 本身仍遵守 `leave-project` 规则。

## Route 到 Intent 的映射

Route record 通过显式 meta 声明产品导航语义：

```text
project-entry     -> leave-project
project-create    -> create-project
project-workspace -> open-project(projectId)
```

映射器只解释 Route，不读取 Active Project。是否需要弹窗、Open 当前项目是否为 no-op，以及
当前 Project 是否 dirty，继续由框架无关的 Confirmation Coordinator 决定。

同一 Project 未来增加 Piano Roll、Mixer 或 Settings 子 Route 时，仍映射为同一个
`open-project(projectId)`；Coordinator 的 `same-project` 结果保证内部视图切换不会弹出
离开确认。

## Router Guard 与导航 token

Guard 为每次受保护导航分配递增 token：

```text
navigation A starts confirmation
navigation B starts later
-> B owns the current token
-> late A result returns false and cannot resume A
```

只有 `proceed` 结果放行。`cancelled`、`failed`、非法 Route 参数和陈旧 token 都阻止原导航；
Guard 不把 UI 或 Save 错误解释成授权。

Guard 的 token 与 Decision Binding 的 single-slot capability 是两层独立保护：

- Decision Binding 防止旧 DOM 事件完成新对话框请求；
- Router token 防止迟到的旧确认结果继续旧 URL 导航。

Guard 安装在 Studio Composition Root 内，由该应用图唯一的
`ProjectNavigationConfirmationCoordinator` 驱动。应用销毁或构造失败时先移除 Guard，再
释放 Decision Binding、Active Binding 与 Browser Runtime。

## Route 页面职责

### Project Entry

- 无 requested Project ID 时继续读取 Catalog；
- New Project 改为导航到 `project-create`；
- 最近项目改为导航到对应的 `project-workspace`；
- Guard 等待期间保留按钮 busy 状态；
- 找不到的 route Project ID 通过 query notice 返回入口，并从当前列表中隐藏，避免立即再次
  提供同一陈旧 Catalog 项。

Project Entry 不直接调用 Save，也不解释 dirty。

### Project Create

- Route 挂载后调用 `ActiveProjectService.create()`；
- 成功后 `replace` 到生成的 Project URL；
- 失败时留在命令页，提供 Retry 与 Back to projects；
- 组件卸载后，迟到结果不能再修改 Route。

### Project Workspace

- Route 挂载或 Project ID 变化时调用 `ProjectEntryCoordinator.resolve(projectId)`；
- Active 结果显示现有的中性 Project ready 占位；
- requested Project 不存在时返回入口并显示提示；
- 其他恢复失败留在当前 URL，提供 Retry 与 Back to projects；
- 请求 generation 防止旧 Open 结果覆盖更新后的 Route。

该页面只验证 Route 与 Project 生命周期，不是 Workbench Shell 的视觉设计。

## 模块位置

```text
apps/studio/src/
├── router/
│   ├── index.ts
│   ├── project-navigation-guard.ts
│   └── project-routes.ts
└── features/
    ├── project-entry/
    │   └── ProjectEntryPage.vue
    └── project-workspace/
        ├── ProjectCreationPage.vue
        └── ProjectWorkspacePage.vue
```

测试支持继续只放在 `__tests__`。

## 验收

- Create、Open、Leave Route 分别产生正确的 Navigation Intent；
- Cancel、Failed 与陈旧确认均阻止导航；
- 新导航使旧 token 失效，迟到结果不能恢复旧导航；
- Create 成功后 URL 使用生成的 Project ID，并且浏览器历史中不保留命令 Route；
- Project URL 刷新后通过 Project Entry Coordinator 恢复同一项目；
- 找不到的项目返回入口，恢复/存储错误不会伪装成空项目；
- App 始终由 RouterView 决定 Entry / Create / Workspace 页面；
- 全局 Navigation Decision Dialog 跨 Route 保持唯一；
- Composition Root dispose 与构造失败移除 Guard 并释放全部既有资源；
- lint、architecture、workspace type-check、全部测试和 Studio production build 通过；
- 完成本独立 Router 切片后停止等待审阅。

## 实施结果

本阶段已于 2026-07-23 按上述边界完成：

- Studio 已建立 `/`、`/projects/new` 与 `/projects/:projectId` 三类 Route，Create 成功后使用
  `replace` 固化生成的 Project ID；
- Project Entry 的 New / Open 动作已改为 Route 导航，Project Create 与 Project Workspace
  页面分别调用既有 Active Project 和 Project Entry 用例，没有复制 Checkpoint 或 Session
  状态机；
- Route meta 到 Create / Open / Leave intent 的映射已集中在 Router 边界，非法 Project ID
  会返回入口并显示明确提示；
- 全局 Guard 使用 Composition Root 内唯一的 Navigation Confirmation Coordinator，只有
  `proceed` 放行；Cancel、Failed、陈旧 token 和 dispose 后的迟到结果都会阻止原导航；
- Guard 已纳入应用资源所有权，正常 dispose 和构造失败均先移除 Guard，再释放 Decision
  Binding、Active Binding 与 Browser Runtime；
- Project Workspace 已支持 URL 深链接恢复、requested Project 不存在回退、正式恢复错误与
  Retry，以及 Route 参数快速变化时忽略陈旧结果；
- App 已改为始终由 RouterView 决定 Entry / Create / Workspace，Project ready 仍只是中性
  占位，没有实现 Workbench 编辑器界面；
- Studio 当前为 17 个测试文件、97 项测试；Project Core 348 项、platform-browser 18 项与
  type-utils 2 项保持通过；
- 真实内置浏览器验证确认 Create 生成 Project URL、刷新同一 URL 恢复项目、非法 URL 回退
  提示与无控制台警告或错误；
- lint、architecture、workspace type-check、全部测试与 Studio production build通过。
