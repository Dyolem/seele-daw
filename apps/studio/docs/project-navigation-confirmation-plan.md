# Project Navigation Confirmation 基础协议计划

## 目标与边界

本阶段在 Studio Workbench 建立一个框架无关的离开许可协议，保护当前 Active Project 的未保存内容：

```text
Create Project | Open Project | Leave Project
-> ProjectNavigationConfirmationCoordinator
   -> current ActiveProjectState
   -> requestDecision(Save | Discard | Cancel)
   -> ActiveProjectService.save() when requested
-> proceed | cancelled | failed
```

它只回答“这一次会放弃当前 Active Project 的产品动作是否可以继续”，不执行 Create、Open、路由跳转或页面关闭。Vue 对话框、Router guard、URL 解析、`beforeunload` 和业务页面不进入本模块。

## 为什么不放进 ActiveProjectService

`ActiveProjectService` 是 Create / Open / Save 与当前 Session 生命周期的权威实现。它不知道调用来自 Router、项目选择器还是应用退出，也不应在 `open()` 内部弹窗或隐式保存。

导航确认属于调用这些用例之前的产品策略：

- 当前项目是否会被目标动作放弃；
- dirty 时让用户选择 Save、Discard 或 Cancel；
- Save 成功后是否真的已经 clean；
- 对话框等待期间内容变化时，旧决定是否仍然有效。

因此协议放在 `apps/studio/src/workbench/project/navigation/`。它只依赖 Active Project 的公开 `state` 与 `save()`，不访问 Project Core 内部、IndexedDB、Vue 或 Router 类型。

## 导航意图

首版只定义会影响 Active Project 生命周期的三种意图：

```ts
type ProjectNavigationIntent =
  | { kind: 'create-project' }
  | { kind: 'open-project'; projectId: ProjectId }
  | { kind: 'leave-project' }
```

- Create Project 会用新项目替换当前项目；
- Open Project 会切换到指定的已有项目；
- Leave Project 表示离开项目工作区，但不预设目标 Route；
- Open 当前已经 ready 的同一 Project ID 是 no-op，不需要确认，即使当前项目 dirty。

同一项目内切换 Piano Roll、Mixer 或设置面板不会放弃 Active Project，不应调用本协议。未来 Router adapter 负责把 Route 变化解释成上述意图，协议本身不依赖 `RouteLocation`。

## Decision Port

协调器通过注入的异步端口取得用户决定：

```ts
type ProjectNavigationDecision = 'save' | 'discard' | 'cancel'

type ProjectNavigationDecisionRequester = (
  request: ProjectNavigationDecisionRequest,
) => Promise<ProjectNavigationDecision>
```

请求包含 frozen 导航意图、当前 Project ID、`ProjectContentStateId`、保存状态和上一次保存失败。未来 Vue UI 可以据此展示确认界面，但 UI 不取得修改 Active Project 状态的权限。

端口拒绝 Promise、同步抛错或返回运行时非法决定时，结果为 `failed(request-decision)`。协调器不把 UI 故障解释成 Discard，也不会放行导航。

## Save / Discard / Cancel 语义

### Save

```text
request Save
-> verify prompt still describes the current Project content position
-> activeProject.save()
-> current state clean: proceed(saved)
-> current state still dirty: request a new decision
-> save failure: failed(save-project)
```

保存成功不等于一定可以离开。Checkpoint 写入期间 Session 仍允许编辑；如果保存捕获了 B，而完成时当前内容已是 C，Active Project 会继续 dirty。协调器必须重新确认 C，不能因为 B 已经落盘就丢弃 C。

### Discard

Discard 只返回 `proceed(discarded)`，不会修改 `savedContentStateId`、清空 History 或把 Active Project 提前标为 clean。真正的 Create / Open / Leave 可能随后失败；在动作实际完成前保留原 dirty Session，才能让调用方重试或取消而不丢失内存内容。

### Cancel

Cancel 返回 `cancelled`，调用方不得执行目标动作。即使等待对话框期间状态发生变化，用户明确取消本次导航的决定仍然有效。

## 内容状态身份与陈旧决定

确认请求对应一个 `ProjectContentStateId`。Decision Promise 返回后，协调器确认当前仍是同一 Project、同一 History 内容位置：

```text
prompt for dirty B
-> user is deciding
-> edit / undo / redo / save publishes C
-> old decision for B is stale
-> re-evaluate C and request again when still required
```

如果期间经过 C 又 Undo 回 B，B 的稳定身份会恢复，原决定仍可安全作用于 B，不需要仅因 revision 或状态快照对象变化重复弹窗。若另一条保存已把 B 变为 clean，则直接 proceed(clean)，不再执行多余的 Save / Discard。

请求公开 `ProjectContentStateId`，让 UI、诊断与测试能够明确知道决定针对哪个 History 内容位置。内容身份校验是本地瞬时并发保护；它不替代 Router adapter 的 navigation token。

## 稳定结果

```ts
type ProjectNavigationConfirmationResult =
  | {
      kind: 'proceed'
      reason: 'not-ready' | 'same-project' | 'clean' | 'saved' | 'discarded'
      activeProjectId: ProjectId | null
    }
  | { kind: 'cancelled'; activeProjectId: ProjectId }
  | {
      kind: 'failed'
      operation: 'request-decision' | 'save-project'
      activeProjectId: ProjectId
      failureCause: unknown
    }
```

所有公开请求、规范化意图和结果都冻结。Failed 保留 Decision Port 或 `ActiveProjectService.save()` 实际抛出的正式错误，不越层解包 Checkpoint / storage cause；后续 UI 可以展示保存错误或记录诊断。Router adapter 默认应阻止导航，不得把 Failed 当作 Cancel 后继续。

## 并发与后续 Router adapter

协调器只管理一次确认调用内部的状态变化，不拥有全局导航队列。未来 Router adapter 仍必须为每次导航分配 token：

```text
navigation A starts confirmation
navigation B starts later
-> B becomes current token
-> late A result must not execute A target action
```

这样确认协议专注于未保存内容，Router adapter 专注于导航先后顺序。二者不能用同一个 generation 假装解决。

## 浏览器关闭边界

`beforeunload` 不允许等待自定义异步 UI 或可靠完成 IndexedDB 保存，因此不能直接复用 Save / Discard / Cancel 流程。后续 browser adapter 只能在 Active Project dirty 时触发浏览器原生离开提示；自动保存、页面生命周期 flush 和崩溃恢复需要另行设计。

本阶段的 `leave-project` 面向应用内、可等待异步决定的导航，不声称已经保护刷新、关闭标签页或进程崩溃。

## 模块位置

```text
apps/studio/
├── docs/project-navigation-confirmation-plan.md
└── src/workbench/project/navigation/
    ├── project-navigation-confirmation.ts
    ├── project-navigation-confirmation-error.ts
    └── __tests__/
        └── project-navigation-confirmation.spec.ts
```

测试快捷对象继续只放在 `__tests__` 或复用现有测试 support，不进入生产模块目录。

## 测试与验收

- 非 ready、clean 与 Open 当前 Project 直接 proceed，不请求决定；
- dirty + Cancel 阻止动作；
- dirty + Discard 只授权动作，不修改 dirty 状态；
- dirty + Save 在真正 clean 后授权动作；
- 保存失败与 Decision Port 失败返回带正式 cause 的 frozen failed 结果；
- 对话框期间内容变化使旧 Save / Discard 决定失效，并针对新内容重新确认；
- 保存期间继续编辑时，成功保存旧内容不会放弃新内容；
- 请求、规范化意图和结果冻结，非法运行时决定被拒绝；
- Studio 与 workspace 的类型、架构、测试、lint 和生产构建通过。

完成本独立模块后停止等待审阅，不连续实施 Vue 对话框、Router guard、`beforeunload` 或真实 Route。

## 实施结果

本阶段已于 2026-07-22 按上述边界完成：

- `ProjectNavigationConfirmationCoordinator` 已在 Studio Workbench 内建立，只读取 Active Project state，并且只在用户选择 Save 时调用公开 `save()`；
- Create Project、Open Project 与 Leave Project 已形成框架无关 frozen intent，Open 当前 Project 即使 dirty 也按 no-op 直接放行；
- Save、Discard、Cancel 已形成稳定 Decision Port 与 frozen proceed / cancelled / failed 结果，Decision Port 和保存错误不会被误解释为放行；
- Discard 只授权当前调用继续，不修改 dirty、History 或保存身份；真正目标动作失败时仍保留当前内存 Session；
- 确认有效性由 Project ID 与稳定 `ProjectContentStateId` 校准：新内容会重新确认，Undo 回同一内容位置不会重复确认；
- 保存期间继续编辑会在旧 Checkpoint 完成后对新内容重新确认，不会把“保存完成”错误等同为“当前 clean”；
- 新增 1 个生产协议目录、1 个测试文件与 8 项测试，Studio 当前为 7 个测试文件、52 项测试；
- Vue Decision Port 的浅响应式桥接随后由 [Project Navigation Decision Vue Binding](./project-navigation-decision-vue-binding-plan.md) 独立承载；真实对话框、Router navigation token / guard、`beforeunload` 和 Route 保持在本阶段之外。
