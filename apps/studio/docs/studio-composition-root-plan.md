# Studio Composition Root 基础计划

## 目标与边界

本阶段把已经独立验证的 Browser Runtime、Project Entry 与 Vue Binding 安装到一个真正的 Studio 应用实例中：

```text
main.ts
-> createBrowserStudioApplication
   -> BrowserActiveProjectRuntime
   -> composeStudioApplication
      ├── BrowserActiveProjectRuntime
      │   ├── ActiveProjectService
      │   └── IndexedDB resources
      ├── ProjectEntryCoordinator
      ├── ActiveProjectVueBinding
      └── Vue application
          ├── Pinia
          ├── Router
          └── ActiveProjectVueContext provider
```

目标是明确“一页 Studio 应用”拥有哪一组长生命周期实例、组件如何取得当前 Active Project，以及应用销毁时如何释放订阅和浏览器资源。本阶段不增加 Route、启动页、项目选择对话框、自动入口解析、Create / Open 按钮、dirty navigation guard 或编辑器内容视图。

## 为什么使用应用组合工厂

如果 `main.ts` 逐行创建 Runtime、Binding、Coordinator 并直接安装 Provider，那么生产入口虽然可以运行，但实例关系和释放协议只能通过阅读若干零散语句推断，也难以在不打开真实 IndexedDB 的情况下验证。

Studio bootstrap 模块共同构成 Composition Root，不是新的业务 Service，也不是通用 IoC 容器。它只做四件事：

1. `createBrowserStudioApplication` 创建当前页面拥有的 Browser Active Project Runtime；
2. `composeStudioApplication` 用同一个 Active Project 与 Catalog 创建 Project Entry Coordinator；
3. `composeStudioApplication` 用同一个 Active Project 创建 Vue Binding，并提供对应 Context；
4. `composeStudioApplication` 安装 Pinia、Router，包装 mount / dispose 生命周期。

Project Core 和 platform-browser 不知道 Vue 应用如何启动；Vue component 也不创建 IndexedDB adapter 或模块级 Service 单例。

## 纯函数与副作用边界

调用 import 得到的外部函数并不自动违反纯函数定义。例如，在输入相同且没有可观察副作用时调用一个纯 parser，外层函数仍可以是纯函数。判断标准是相同输入能否得到相同输出，以及执行过程是否改变外部可观察状态。

本模块不可能是纯函数：

- Browser Runtime 会打开并持有 IndexedDB connection；
- Active Project Vue Binding 会注册状态订阅；
- `createApp`、`provide` 与 `use` 会创建并修改一个 Vue App 实例；
- 每次调用有意返回新的、带身份和生命周期的对象图；
- 返回对象必须在稍后执行 unmount、unsubscribe 和 close。

把 `createApp`、`createPinia`、Binding factory 等全部改为函数参数，只会把副作用参数化，并不会让组装过程变纯；同时会让生产 API 暴露稳定框架实现细节。因此采用两层明确的 imperative boundary：

```text
createBrowserStudioApplication(options)
  创建浏览器专属 Runtime
  -> composeStudioApplication({ ...options, projectRuntime })

composeStudioApplication(composition)
  接受 Runtime 所有权
  -> 组装同一实例图并建立统一 dispose
```

`createBrowserStudioApplication` 保持很薄，只隔离真正依赖浏览器环境的资源创建。测试直接把 fake Runtime 交给 `composeStudioApplication`，不再把 `createProjectRuntime` 这种纯测试 factory 混入生产 Options。`composeStudioApplication` 仍是有副作用的生命周期组装函数，只是它依赖的环境资源和所有权转移已经显式。

## 模块位置

```text
apps/studio/
├── docs/studio-composition-root-plan.md
└── src/
    ├── bootstrap/
    │   ├── studio-application.ts
    │   ├── studio-application-error.ts
    │   └── __tests__/studio-application.spec.ts
    └── main.ts
```

组合逻辑放在 `bootstrap/`，因为它同时依赖 Vue、Router、Pinia 和 Workbench Project 子系统，不属于 `workbench/project` 的业务协议。`main.ts` 只选择根组件和 Router 配置、创建应用并挂载，不重复装配细节。

## 应用公开表面

```ts
interface BrowserStudioApplicationOptions {
  rootComponent: Component
  router: Router
}

interface StudioApplicationComposition extends BrowserStudioApplicationOptions {
  projectRuntime: BrowserActiveProjectRuntime
}

interface StudioApplication {
  projectEntry: ProjectEntryCoordinator
  mount(rootContainer: Element | string): ComponentPublicInstance
  dispose(): void
}
```

生产入口调用 `createBrowserStudioApplication`，它固定使用正式的 `createBrowserActiveProjectRuntime`。测试与其他显式宿主可以调用 `composeStudioApplication`；函数一旦取得 `projectRuntime`，Runtime 所有权就转移给应用，调用方不能再单独释放它。

原始 Vue `App` 与 Browser Runtime 不从返回值暴露。这样只有 `StudioApplication` 能执行 unmount 和资源释放，不会产生“某个组件关闭数据库、另一个入口仍持有 Context”的分裂生命周期。

`projectEntry` 暂作为应用级能力暴露，供后续 Router / Entry adapter 使用。它是无状态协调器，不需要 dispose，也不应为了尚未存在的组件提前复制成 Pinia 或 Vue Context。组件已经可以通过 Active Project Context 调用明确的 Create、Open 和 Save；后续 Entry UI 的具体命令边界单独设计。

## Provider 与 Pinia 的边界

应用只提供已经确定的 `ActiveProjectVueContext`：

```text
ACTIVE_PROJECT_CONTEXT_KEY
-> { activeProject, shallow readonly state }
```

Binding 继续是 Active Project 生命周期状态到 Vue 的唯一桥梁。Pinia 仍用于未来的纯 UI 状态，不接管 Session、打开 / 保存状态机或 IndexedDB 资源。安装 Pinia 是应用 scaffold 的基础能力，不代表当前新增 Project Pinia Store。

Router 也只作为 Vue plugin 安装。本阶段没有 Route，Composition Root 不读取 URL、不自动打开最近项目，也不决定找不到 Project 时显示哪个页面。

安装顺序固定为 Active Project Provider、Pinia、Router。Router plugin 可能在安装时开始第一次导航，因此它必须最后安装，保证未来 initial navigation guard 执行时应用级注入与 UI Store 已经就绪。

## 生命周期与释放顺序

应用所有权固定为：

```text
StudioApplication.dispose()
1. Vue application.unmount()
2. ActiveProjectVueBinding.dispose()
3. BrowserActiveProjectRuntime.dispose()
   -> ActiveProjectService.dispose()
   -> close Catalog connection
   -> close Checkpoint Store connection
```

先卸载组件树，保证组件的 `onUnmounted` 与 effect scope 停止使用注入能力；再解除 Binding 的状态订阅；最后销毁 Service 和 IndexedDB 连接。

Vue 的 `app.onUnmount` 回调发生在组件 `onUnmounted` 之前，因此不能用它承担上述资源释放。组合对象不暴露原始 App，而是在自己调用 `app.unmount()` 返回后释放 Binding 与 Runtime。`finally` 保证即使卸载抛错也会尝试释放资源；Binding dispose 又以 `finally` 保证 Runtime 仍会被释放。

`dispose()` 幂等，挂载前 dispose 也会释放已经创建的 Runtime。重复 mount 与 dispose 后 mount 分别抛出带稳定 `already-mounted`、`application-disposed` code 的 `StudioApplicationError`，不依赖 Vue warning 表达生命周期错误。

开发环境由 `main.ts` 注册 Vite HMR dispose 回调；模块替换前销毁旧应用图，避免保留旧 Active Project 订阅和 IndexedDB 连接。正常页面关闭时浏览器会终止页面持有的连接，不额外增加 unload 业务逻辑。

## 构造失败

Runtime 一旦创建，后续 Binding、Coordinator、Vue App 或 plugin 安装失败都必须释放已取得的资源：

```text
binding created ? binding.dispose() : skip
-> projectRuntime.dispose()
-> propagate the construction failure
```

`finally` 保证 Binding 清理失败时仍会尝试 Runtime dispose；若清理自身也失败，则 JavaScript 的异常传播规则会让清理异常可见。该规则防止启动异常静默留下不可见的 IndexedDB connection 或 state subscription。

## 测试与验收

- 根组件可同时取得 Pinia、Router 与由同一 Runtime 建立的 Active Project Context；
- 应用公开的 Project Entry 使用同一 Runtime 的 Active Project 与 Catalog；
- 已挂载应用严格按组件树、Binding、Runtime 顺序释放；
- dispose 重复调用不重复 unsubscribe 或关闭 Runtime；
- 未挂载应用也能释放所有已创建资源；
- 组合过程失败时仍会释放已经转移所有权的 Binding 与 Runtime；
- 重复 mount 与 dispose 后 mount 返回稳定生命周期错误；
- `main.ts` 使用应用组合工厂，并在 HMR 时 dispose；
- Studio、workspace 类型、架构、测试和生产构建保持通过。

完成本独立模块后停止等待审阅。Router 入口适配、Entry UI、选择动作和 dirty navigation guard 留到后续阶段。

## 实施结果

本阶段已按上述边界完成：

- `createBrowserStudioApplication` 已成为很薄的浏览器资源创建边界；`composeStudioApplication` 接受 Runtime 所有权，并用同一实例组合 Entry Coordinator 与 Vue Binding；
- 生产 Options 已移除 `createProjectRuntime` 测试 factory，测试直接使用显式的 Runtime composition seam；
- Vue App 已统一安装 Pinia、Router 和 Active Project Provider，`main.ts` 不再手工重复安装；
- 返回对象只公开后续 Router adapter 所需的 Project Entry 与受控 mount / dispose，不泄漏原始 Vue App、Active Project Runtime 或 IndexedDB 资源；
- 应用释放顺序固定为组件树、Binding、Browser Runtime，dispose 在挂载前后均幂等；
- 重复挂载和销毁后挂载具有稳定错误 code，Vite HMR 会释放旧应用图；
- 新增 1 个测试文件、6 项测试，Studio 当前为 6 个测试文件、42 项测试；Project Core 24 个测试文件、347 项测试与 platform-browser 18 项测试保持通过；
- workspace lint、架构检查、类型检查、全部测试和 Studio 生产构建通过。

Router / Project Entry UI 尚未进入实现。
