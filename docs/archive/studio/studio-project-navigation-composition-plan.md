# Studio Project Navigation Composition 计划

## 目标与边界

框架无关的导航确认协议与 Vue Decision Binding 已分别完成。本阶段只在 Studio Composition Root 中把它们连接成同一个应用对象图：

```text
BrowserActiveProjectRuntime.activeProject
        |                         \
        |                          -> ActiveProjectVueBinding -> ActiveProjectVueContext
        v
ProjectNavigationConfirmationCoordinator
        |
        | requestDecision
        v
ProjectNavigationDecisionVueBinding -> ProjectNavigationDecisionVueContext
```

本阶段不增加新的业务 Service 或 Coordinator。`StudioApplicationImpl` 继续只是现有应用资源的所有者；它创建、连接并释放已经独立验证的对象。

## 为什么先装配再接 Router

如果 Router adapter 自行创建 Coordinator 或 Decision Binding，会产生第二套实例与不明确的释放责任：

- Router 使用的 requester 可能不是组件观察的 pending ref；
- 应用卸载可能只释放其中一个 Binding，留下悬挂 Promise；
- Active Project Context 与 Coordinator 可能引用不同 Runtime；
- Router plugin 安装时可能在 Provider 建立前启动导航。

因此 Composition Root 先确定唯一实例关系。后续 Router 只消费 `StudioApplication.projectNavigationConfirmation`，对话框只消费注入的 Vue Context，双方不会直接互相创建资源。

## 公开能力与隐藏资源

`StudioApplication` 增加一个受控应用能力：

```ts
interface StudioApplication {
  projectEntry: ProjectEntryCoordinator
  projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator
  mount(...): ComponentPublicInstance
  dispose(): void
}
```

Coordinator 需要由未来 Router / Project action adapter 调用，因此与既有 `projectEntry` 一样公开。以下对象继续隐藏：

- `ProjectNavigationDecisionVueBinding`：由应用拥有和释放；
- pending resolver：只存在于 Binding 私有状态；
- 原始 Vue App、Active Project Runtime 与 IndexedDB 资源；
- Vue Decision Context：只通过 provide / inject 交付组件树。

这不是新增一层转发。Composition Root 返回的 Coordinator 就是实际实例；`StudioApplicationImpl` 不复制 `confirm()` 算法。

## 组装顺序

```text
1. create ActiveProjectVueBinding(activeProject)
2. create ProjectNavigationDecisionVueBinding()
3. create ProjectEntryCoordinator(activeProject, catalog)
4. create ProjectNavigationConfirmationCoordinator(
     activeProject,
     decisionBinding.requestDecision,
   )
5. create Vue application
6. provide Active Project Context
7. provide Project Navigation Decision Context
8. install Pinia
9. install Router
```

两个 Provider 必须在 Router 前安装。Router plugin 未来可能在 `install()` 期间启动初始导航；此时确认请求必须已经能够到达同一组件树的 Decision Context。

## 生命周期与释放顺序

正常释放顺序扩展为：

```text
StudioApplication.dispose()
1. unmount Vue component tree
2. ProjectNavigationDecisionVueBinding.dispose()
   -> clear pending
   -> complete pending request as Cancel
3. ActiveProjectVueBinding.dispose()
   -> unsubscribe Active Project state
4. BrowserActiveProjectRuntime.dispose()
   -> dispose ActiveProjectService
   -> close IndexedDB resources
```

先卸载组件，保证对话框不再提交选择；随后 Cancel 一次性 pending capability，再停止 Active Project state delivery，最后释放领域和浏览器资源。所有步骤以嵌套 `finally` 保证后续资源仍会尝试释放。

应用销毁导致的 Cancel 只会让 Coordinator 返回 `cancelled`，不会调用 Save 或重新读取已释放 Runtime。Promise continuation 在微任务中完成，不属于 Runtime 的资源所有权。

## 构造失败

从 Runtime 所有权转移给 `composeStudioApplication` 开始，任何后续构造或 Router 安装错误都按逆序清理已创建资源：

```text
decision binding exists ? dispose : skip
-> active binding exists ? dispose : skip
-> runtime.dispose()
-> rethrow original construction failure
```

Decision Binding 的 dispose 幂等，因此即使未来 Router 安装期间已经产生 pending，也不会留下悬挂调用方。

## 测试与验收

- 根组件可从同一应用树取得 Active Project 与 Navigation Decision 两个 Context；
- 应用公开的 Confirmation Coordinator 使用 Runtime 中同一个 ActiveProjectService；
- dirty 确认会发布到根组件取得的同一个 pending ref；
- Vue Context resolve 后，公开 Coordinator 得到对应 proceed 结果；
- 应用 dispose 会 Cancel pending 确认并继续释放 Runtime；
- 既有组件、Active Binding、Runtime 释放顺序和幂等性保持成立；
- Router 安装失败仍释放所有已取得资源；
- Studio 与 workspace 类型、架构、测试、lint 和生产构建通过。

## 本阶段不包含

- Save / Discard / Cancel 的真实对话框组件；
- Router guard、navigation token 或 Route 到 intent 的映射；
- Project Entry 页面、最近项目选择和 Create / Open 按钮；
- `beforeunload`、自动保存或页面关闭 flush；
- ActiveProjectService、Project Core、IndexedDB 或 Pinia 状态修改。

完成本独立装配阶段后停止等待审阅。

## 实施结果

本阶段已于 2026-07-22 按上述边界完成：

- Studio Composition Root 已创建唯一 Navigation Decision Binding，并把其 requester 注入唯一 Navigation Confirmation Coordinator；
- Active Project 与 Navigation Decision 两个 Context 均在 Pinia 和 Router 之前 provide；
- `StudioApplication` 只新增公开的 `projectNavigationConfirmation` 能力，没有泄漏 Binding、Vue App 或 Runtime；
- 正常 dispose 与构造失败清理都按 Decision Binding、Active Binding、Browser Runtime 顺序执行；
- 集成测试已验证 dirty 请求到达同一 Vue pending channel、Discard 结果回到同一 Coordinator，以及应用销毁 Cancel pending；
- 没有新增业务 `Impl` 类、Pinia Store、Router guard、Route 或对话框；
- Studio 当前为 8 个测试文件、59 项测试；Project Core 348 项与 platform-browser 18 项测试保持通过。
