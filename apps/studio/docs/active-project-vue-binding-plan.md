# Active Project Vue Binding 计划

## 目标与边界

本阶段为框架无关的 `ActiveProjectService` 建立一个窄 Vue 适配层：

```text
BrowserActiveProjectRuntime
-> ActiveProjectService
-> ActiveProjectVueBinding
   -> shallowRef<ActiveProjectState>
   -> ActiveProjectVueContext
      -> provide / inject
```

目标是让 Workbench 组件安全读取当前项目生命周期状态并调用应用服务，同时保持 `ProjectSession`、History、QueryIndex 和持久化资源在 Vue 响应式系统之外。本阶段不修改 `main.ts`、`App.vue` 或 Router，不自动打开项目，不实现 Project ID discovery、项目目录、默认 MIDI Track 模板、业务界面或 `useProjectSelector`。

## 注入 ActiveProjectService 的作用

Composition Root 创建 Browser Runtime，Runtime 创建并拥有 Active Project Service 与 IndexedDB Store。Vue 组件不应直接 import 一个模块级单例，也不应知道数据库名称、adapter 类型、Session 创建工厂和释放顺序。

`provide / inject` 只负责把当前应用树所使用的服务实例传递给组件：

```text
main.ts（后续）
  create BrowserActiveProjectRuntime
  create ActiveProjectVueBinding
  provide ActiveProjectVueContext

Workbench component
  useActiveProject()
  -> read shallow state
  -> call activeProject.open / save
```

这样测试可以提供隔离的 Service；未来多个独立 Workbench 也可以在不同组件子树提供不同实例。依赖注入不取得 Service 的所有权，Binding dispose 只解除自己的订阅，Browser Runtime 仍负责销毁 Service 与关闭 IndexedDB。

## 哪些组件会使用

Active Project Context 是 Workbench 级入口，典型消费者包括：

- 应用外壳显示 opening、open-failed 和 ready；
- 标题栏显示项目名称和 dirty 标记；
- Save 按钮读取 saving / failed 并调用 `activeProject.save()`；
- 恢复提示读取 candidate fallback 诊断；
- 项目启动流程调用 `activeProject.open(projectId)`；
- Feature 入口在 ready 状态取得当前 `ProjectSession`。

Piano Roll 中的大量 Note 组件不能通过该 Context 读取完整 Snapshot。后续内容视图应使用 Project Query、精细 Project Subscription 和独立的 `useProjectSelector`，只观察可见范围或指定实体。Active Project state 在每次 commit 后更新是为了 revision / dirty 对账，不是一个通用项目 read model。

## 为什么不是 Pinia

Pinia 能保存一个 `markRaw` Service 和 `shallowRef`，但这会在当前阶段增加一个没有独立所有权的 facade，并容易形成两个状态来源：

```text
ActiveProjectService.state   权威生命周期状态
Pinia ActiveProject store    手工复制状态
```

`ProjectSession` 不是普通的可序列化 Store 数据。它持有 History、QueryIndex、订阅和方法调用生命周期；它不适合 Pinia persistence、time travel、reset 或 Vue 深度代理。打开、保存、恢复竞态和 dispose 也已经由 Active Project Service 统一处理，不能在 Pinia 中再实现第二套状态机。

状态所有权保持为：

| 状态                                | 所有者                  |
| ----------------------------------- | ----------------------- |
| Track、Clip、Note、History、Query   | ProjectSession          |
| 打开、保存、dirty、恢复错误         | ActiveProjectService    |
| 上述状态的 Vue 浅观察               | ActiveProjectVueBinding |
| 面板、主题、对话框、偏好            | Pinia Workbench Store   |
| Selection、Tool、Zoom、Drag Preview | 后续轻量 Editor Store   |

以后若多个组件需要一组纯展示字段，可以增加 Pinia 派生 facade，但它只能保存轻量 UI 状态，不能接管 ProjectSession、ActiveProjectService 或浏览器资源的所有权。当前 scaffold counter store 与此项目边界无关。

## Shallow 响应式协议

Binding 使用内部 `shallowRef<ActiveProjectState>` 接收 Service 的 immutable state snapshot，再通过 `shallowReadonly` 暴露给组件：

- ref 的 `.value` 随 Service 状态变化替换；
- Vue 不递归转换 state 内的 Session、错误或 recovery diagnostics；
- 组件不能通过公开 ref 写回状态；
- `markRaw` 明确标记 ActiveProjectService 门面不是 Vue state；
- Active Project Service 保持唯一权威来源。

`shallowRef` 只保证 Vue 观察 state value 的替换。它不让组件直接修改冻结的 state，也不授权组件修改 Session 内部模型；项目编辑继续通过 Project Command API。

## Context 与错误边界

```ts
interface ActiveProjectVueContext {
  readonly activeProject: ActiveProjectService
  readonly state: Readonly<ShallowRef<ActiveProjectState>>
}

interface ActiveProjectVueBinding {
  readonly context: ActiveProjectVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ActiveProjectStateDeliveryFailure | null>>
  dispose(): void
}
```

`ACTIVE_PROJECT_CONTEXT_KEY` 是类型安全的 Vue `InjectionKey`。`useActiveProject()` 在 Provider 缺失时抛出带稳定 `missing-context` code 的 `ActiveProjectVueError`，避免组件在稍后访问 `undefined` 时产生无定位信息的异常。

正常业务打开和保存失败已经存在于 `ActiveProjectState`。`stateDeliveryFailure` 只记录 Binding 自身无法接收 Service state 的异常，供 Composition Root / diagnostics 观察，不混入项目业务错误。

## 生命周期

```text
ActiveProjectVueBinding.dispose()
  只 unsubscribe ActiveProjectService state observer

BrowserActiveProjectRuntime.dispose()
  dispose ActiveProjectService
  close IndexedDB Store
```

Binding dispose 幂等。解除后公开 state 停留在最后收到的 snapshot，不再追踪 Service；Service 仍可由其他消费者使用。未来主应用的外层生命周期会明确组合两者，而不是让 Vue component 越权关闭数据库。

## 模块位置

```text
apps/studio/src/workbench/project/vue/
├── active-project-context.ts
├── active-project-vue-binding.ts
├── active-project-vue-error.ts
└── __tests__/
    └── active-project-vue-binding.spec.ts
```

Vue 依赖只进入 Studio 的 `vue/` 适配目录，不反向进入 Active Project Service、Project Core 或 platform-browser。

## 测试与验收

- Binding 初始 state 与 Service 当前 state 使用同一个 immutable value；
- opening、ready、saving、dirty 和 save completion 会替换 shallow state；
- ActiveProjectService 与 ProjectSession 保持相同对象身份且不是 Vue Proxy；
- state ref 是 shallow、readonly，不能触发深层对象转换；
- `useActiveProject()` 返回当前组件树提供的同一 Context；
- 缺少 Provider 时抛出稳定 `missing-context` 错误；
- Binding dispose 幂等，解除后不再接收变化，同时不销毁 Service；
- Context 和 Binding delivery failure 边界可被明确观察；
- Studio 类型检查、测试、目标 lint、架构检查和 workspace 完整基线通过。

完成本独立模块后停止等待审阅，不连续修改 Composition Root、Router 或项目界面。

## 实施结果

本阶段已于 2026-07-22 按上述边界完成：

- `ActiveProjectVueBinding` 已使用内部 `shallowRef` 接收 Service state，并通过 `shallowReadonly` 暴露同一 immutable value；
- ActiveProjectService 门面由 `markRaw` 标记，ready state 内的 ProjectSession 与 Snapshot 均保持原始对象身份，没有进入 Vue Proxy 图；
- frozen `ActiveProjectVueContext` 只包含原始 Service 与只读 shallow state，没有复制或重新实现 open / save 状态机；
- 类型安全的 `ACTIVE_PROJECT_CONTEXT_KEY` 与 `useActiveProject()` 已建立，缺失 Provider 会抛出稳定 `missing-context` ActiveProjectVueError；
- Binding state 已验证同步覆盖 opening、ready、commit revision、saving 与 save completion；
- Binding dispose 只解除自身订阅且幂等，解除后 Service 仍能切换项目；Service、Runtime 和 IndexedDB 的所有权没有转移给 Vue；
- 单独的 `stateDeliveryFailure` shallow readonly channel 已保留 Vue state observer 异常，不与打开、恢复或保存业务错误混合；
- 文档已明确 provide / inject、Pinia、ProjectSession、ActiveProjectService 和未来 Editor Store 各自的状态所有权；
- Studio 当前为 4 个测试文件、21 项测试；Project Core 24 个测试文件、347 项测试和 platform-browser 13 项测试保持通过；
- 目标 lint、workspace 架构检查、类型检查、全部测试和 Studio 生产构建通过。

`main.ts`、`App.vue`、Pinia stores 与 Router 均未修改。Project ID discovery、明确 create / open 语义、Composition Root 安装、业务界面和局部 `useProjectSelector` 继续作为后续独立阶段。
