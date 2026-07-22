# Project Navigation Decision Vue Binding 计划

## 目标与边界

导航确认协调器已经定义异步 Decision Port，但 Vue 组件还没有一个安全方式观察请求并返回 Save / Discard / Cancel：

```text
ProjectNavigationConfirmationCoordinator
-> requestDecision(request): Promise<decision>
   -> ProjectNavigationDecisionVueBinding
      -> shallow readonly pendingDecision
      -> Vue dialog resolves Save | Discard | Cancel
```

本阶段只建立这个一请求一结果的 Vue 桥接。它不渲染真实对话框、不调用 Active Project Save、不安装 Router guard，也不创建 Route。保存与内容状态竞态仍由框架无关 Coordinator 负责。

## 为什么是 Binding 而不是 Pinia

待处理确认不是可持久化的普通 UI 数据。它同时携带一个只能完成一次的 Promise resolver，并且严格属于当前应用实例的生命周期：

- 刷新、序列化、Pinia persistence 或 time travel 都不能恢复原 Promise 调用方；
- Reset 若只清空展示字段而没有完成 Promise，会让导航永久悬挂；
- Resolver 不应进入可枚举、可修改的全局 Store；
- Decision Port 与 Vue state 的所有权需要一起 dispose。

因此采用专用 Binding：内部持有 resolver 和 mutable `shallowRef`，向组件只公开 shallow readonly pending request 与受控 `resolve()`。Pinia 继续负责面板、主题等可重建 UI 状态。

## 公开协议

```ts
interface PendingProjectNavigationDecision {
  request: ProjectNavigationDecisionRequest
}

interface ProjectNavigationDecisionVueContext {
  pendingDecision: Readonly<ShallowRef<PendingProjectNavigationDecision | null>>
  resolve(
    pending: PendingProjectNavigationDecision,
    decision: ProjectNavigationDecision,
  ): boolean
}

interface ProjectNavigationDecisionVueBinding {
  context: ProjectNavigationDecisionVueContext
  requestDecision: ProjectNavigationDecisionRequester
  dispose(): void
}
```

Composition Root 后续把 `binding.requestDecision` 注入 `ProjectNavigationConfirmationCoordinator`，再 provide `binding.context`。对话框组件只取得 Context，不直接取得 Coordinator、Active Project 或 resolver。

`pendingDecision` 是 shallow readonly：Vue 只观察 null / pending 的顶层替换，不递归代理 frozen navigation request、错误或 branded identity。

## Pending 对象身份

每次请求产生一个新的 frozen `PendingProjectNavigationDecision`。UI resolve 时必须把自己渲染的 pending 对象传回：

```text
render pending A
-> pending B supersedes A
-> delayed click from A calls resolve(A, ...)
-> false; B remains pending
```

不能只暴露 `resolve(decision)`。否则旧组件事件在新请求出现后可能错误地完成 B，造成用户看到目标 A 却放行目标 B。对象身份就是这个进程内一次性请求的 capability，不需要额外写入 Project、Router 或持久化 ID。

成功 resolve 会先同步把 pending 设为 null，再完成 Promise。重复 resolve 返回 false，不会执行第二次决定。运行时非法 decision 抛出带 `invalid-decision` code 的 Vue adapter error，并保留当前 pending 供 UI 正确重试。

## 并发策略：单槽 latest-request-wins

应用只展示一个导航确认对话框。第二个请求到达时：

```text
pending A
-> request B
-> publish pending B
-> complete A with Cancel
```

旧 Coordinator 因 Cancel 停止，最新请求获得可见对话框。这里解决的是 UI 单槽所有权；未来 Router adapter 仍需 navigation token 阻止已经迟到的 A 结果执行目标导航。两层职责互补：Binding 不知道 Route，Router adapter 不持有对话框 resolver。

不采用 FIFO queue。排队会在用户完成 A 后继续弹出可能已经失去意义的旧导航 B/C，也会延长 resolver 生命周期并弱化 latest-navigation-wins 产品语义。

## 生命周期与错误

`dispose()` 幂等，并按以下顺序结束当前请求：

```text
mark disposed
-> clear current entry
-> publish pending null
-> complete previous Promise with Cancel
```

这样应用卸载不会留下永不完成的确认 Promise。dispose 后的新请求返回 rejected Promise，错误 code 为 `binding-disposed`；Coordinator 会按既有协议将它转为 `failed(request-decision)`，不会放行导航。

`useProjectNavigationDecision()` 在缺少 Provider 时抛出 `missing-context`。这些错误只描述 Vue adapter 使用和生命周期问题，不重新定义框架无关导航确认的 failed outcome。

## 模块位置

```text
apps/studio/
├── docs/project-navigation-decision-vue-binding-plan.md
└── src/workbench/project/navigation/vue/
    ├── project-navigation-decision-context.ts
    ├── project-navigation-decision-vue-binding.ts
    ├── project-navigation-decision-vue-error.ts
    └── __tests__/
        └── project-navigation-decision-vue-binding.spec.ts
```

## 测试与验收

- Request 会同步发布 frozen pending，并在 resolve 后返回相同 decision；
- pending ref shallow readonly，request 与 branded identity 不进入 Vue Proxy；
- Cancel / Discard / Save 都只完成一次，重复或陈旧 resolve 返回 false；
- 新请求替换旧请求，并以 Cancel 完成旧 Promise；
- dispose 清空 pending、Cancel 当前 Promise 且幂等；
- dispose 后请求明确失败，非法运行时 decision 不会清空 pending；
- Context 注入返回同一对象，缺少 Provider 产生稳定错误；
- Studio 与 workspace 类型、架构、测试、lint 和生产构建通过。

完成本独立模块后停止等待审阅，不连续修改 Composition Root、Router 或真实对话框。

## 实施结果

本阶段已于 2026-07-22 按上述边界完成：

- `ProjectNavigationDecisionVueBinding` 已把异步 Decision Port 映射为 shallow readonly pending ref，Coordinator 仍是保存和 dirty 复核的唯一所有者；
- frozen pending 对象作为一次性 UI capability，`resolve(pending, decision)` 会拒绝重复或陈旧对象，避免旧点击完成新请求；
- 单槽 latest-request-wins 已实现：新请求直接替换展示状态，并用 Cancel 完成旧调用方，不建立陈旧确认队列；
- dispose 会同步清空 pending、Cancel 当前 Promise 且保持幂等，dispose 后请求返回稳定 `binding-disposed` 失败；
- Context 只公开 pending 与受控 resolve，缺少 Provider 和非法运行时 decision 均有稳定 Vue adapter error；
- 文档明确该一次性 Promise/resolver 状态不进入 Pinia，也不持久化或代理 Project 内容图；
- 新增 1 个测试文件、5 项测试，Studio 当前为 8 个测试文件、57 项测试；
- Composition Root 注入、真实对话框、Router adapter 和 Route 仍未修改。
