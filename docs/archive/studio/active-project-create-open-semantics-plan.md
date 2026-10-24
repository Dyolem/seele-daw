# Active Project Create / Open 产品语义计划

## 目标

Create 与 Open 是两个由产品意图直接区分的应用用例：

```text
create()
  生成新的 Project ID，建立最小项目并立即保存首个 Checkpoint

open(projectId)
  只打开该 ID 已经存在的持久化项目
```

`create(projectId)` 会把身份分配责任泄漏给导航或组件，迫使服务处理“调用方传入的是新 ID、已有 ID、当前 ID 还是损坏 ID”这一组并非 Create 产品语义的分支。因此公开 Create 不再接收 ID；成功结果返回服务实际分配的 `ProjectId`，供 Router 建立后续 URL。

## Create 成功边界

```ts
create(): Promise<ProjectId>
```

一次 Create 按以下顺序执行：

1. 从注入的身份来源取得并校验新的 Project ID；
2. 通过正式 Checkpoint 恢复边界防御性检查生成器是否碰撞已有身份；
3. 创建并校验最小合法 Project Session；
4. 捕获 revision-consistent Snapshot 并保存首个 Project Checkpoint；
5. 保存成功后挂载 Session，进入 clean `ready`，返回 Project ID。

初始 Checkpoint 是 Create 的成功边界，而不是用户稍后必须补做的第二步。这样 Create 返回后即使页面刷新，项目也可以恢复；同一事务写入的 Project Catalog 也能立即发现它。初始 Session 的 `savedRevision` 为 `0`、`isDirty` 为 `false`。

如果 ID、模板、Checkpoint ID 或存储写入失败，Create Promise 拒绝并进入 `create-failed`，不能先发布一个只存在内存、刷新即消失的 ready Project。身份来源在产生合法 ID 之前失败时，失败状态的 `projectId` 为 `null`。

随机 UUID 碰撞极不可能，但如果注入来源错误地返回已有 ID，服务返回内部防御错误 `generated-project-id-conflict`，绝不轮换该项目的 Head。它不是要求 UI 选择 ID 的业务分支；用户重新执行 Create 会请求新的身份。

## Open 语义

```ts
open(projectId: ProjectId): Promise<void>
```

Open 只解释“打开已存在项目”：

- 有有效 Checkpoint：恢复 fresh Session，进入 clean ready，并保留 previous fallback diagnostics；
- 没有 Checkpoint：返回 `project-not-found`；
- candidates 全部损坏或读取失败：保留正式 Checkpoint operation failure；
- 请求当前 ready Project ID：no-op，避免隐式 reload 丢弃未保存编辑。

Open 绝不创建空项目，也不在失败后自行挑选其他项目。路由 ID 无效后查询最近项目并让用户选择，是调用方的导航流程。

## 状态机与并发

```text
create()
  -> creating(generatedProjectId)
  -> ready(clean) | create-failed(projectId | null)

open(existingProjectId)
  -> opening(projectId)
  -> ready(clean) | open-failed(projectId)
```

Create 和 Open 共用 activation generation，只有最后请求可以成为 Active Project。Create 是一个需要产生 durable 项目的命令：如果它在初始保存期间被后来的 Open 超过，它仍完成自己的 Checkpoint 与 Catalog 写入，但完成时不得覆盖较新的 Active Project state。Open 的过期恢复结果同样不得挂载 Session。

从 dirty ready Project 发起 Create / Open 前是否 Save、Discard 或 Cancel 属于导航守卫；Service 暴露 dirty 事实，但不隐藏式代替 UI 决策。

## 最近项目启动流程

Create/Open 服务不拥有项目选择策略。未来产品入口按以下方式组合：

```text
持有 route projectId
-> open(route projectId)
-> project-not-found
-> projectCatalog.listRecentProjects()
-> 对话框：Create new / Open recent

没有 route projectId
-> projectCatalog.listRecentProjects()
-> 启动页选择 Create new / Open recent
```

这样 `open` 始终表示已有项目，`create` 始终表示新项目，Catalog 负责发现，UI 负责选择，不需要把三种职责压进一个多分支方法。

## API 与稳定错误

```ts
interface ActiveProjectService {
  readonly state: ActiveProjectState
  create(): Promise<ProjectId>
  open(projectId: ProjectId): Promise<void>
  save(): Promise<void>
  subscribe(observer: ActiveProjectStateObserver): ActiveProjectUnsubscribe
  dispose(): void
}
```

本阶段保留/新增的应用错误包括：

- `project-not-found`：Open 指定身份不存在；
- `generated-project-id-conflict`：内部身份来源碰撞已有项目；
- `new-session-project-id-mismatch`：模板工厂返回错误身份；
- 既有 save、dispose 与 session observation 使用错误。

旧的 `project-already-exists` / `project-already-active` 随 `create(projectId)` 一并移除。

## 实施结果

本阶段已按上述边界完成：

- Create 公开 API 已改为无参数 `create(): Promise<ProjectId>`，Project ID 由 Browser Runtime 的唯一 ID 来源生成并经正式 parser 校验；
- Create 在首个 Checkpoint 与 Project Catalog 原子写入成功后才发布 clean ready；失败不会产生内存-only ready 项目；
- Open 对空存储明确返回 `project-not-found`，不会调用新 Session 工厂；
- Create/Open 进行中与失败状态继续分离，ID 来源失败使用 `create-failed(projectId: null)`；
- 防御性身份碰撞检查保留，但不再向调用方暴露“Create 一个指定 ID”的产品接口；
- Runtime 集成验证 Create 后无需额外 Save 即可销毁、重建并 Open 恢复同一项目；
- Vue Binding 只镜像新的状态与方法签名，没有复制应用状态机；
- Router、启动对话框、dirty navigation guard 和真实业务界面仍未进入本阶段。

完成生产代码、测试、文档与 workspace 验证后停止等待审阅。
