# Active Project 持久化协调计划

## 目标与边界

本阶段在 Studio 建立第一个框架无关的应用服务，把“当前打开的项目”这一产品生命周期与已经完成的 Project Core、Checkpoint 协议和浏览器存储端口组合起来：

```text
Studio UI（后续）
-> ActiveProjectService
   -> ProjectSession
   -> Project Checkpoint save / restore coordinator
      -> ProjectCheckpointStore
```

本阶段只实现打开、显式保存、dirty 对账、恢复诊断、并发边界和生命周期释放。不接 Vue、Pinia、Router、真实 IndexedDB Composition Root、项目列表、MIDI 模板、自动保存、`beforeunload`、Journal 或多标签页冲突协调。

## 为什么属于 Studio Workbench

`ActiveProjectService` 不是新的领域内核，也不是浏览器存储能力：

- Project Core 只定义项目事实、Session、Checkpoint 格式和 storage-neutral port，不应知道“当前项目”、页面生命周期或产品提示；
- platform-browser 只实现 IndexedDB adapter，不应创建 Session 或决定何时把项目标为 Saved；
- Studio Workbench 负责把领域能力和平台能力组合成应用用例，并管理一个活动项目的生命周期。

因此模块放在 `apps/studio/src/workbench/project/`。它只能从 workspace package root 使用公开契约，不能导入 Project Core 或 platform-browser 的内部文件。

## 依赖注入与公开表面

首版依赖由未来 Composition Root 注入：

```ts
interface ActiveProjectServiceDependencies {
  checkpointStore: ProjectCheckpointStore
  createProjectId(): ProjectId
  createNewSession(projectId: ProjectId): ProjectSession
  createCheckpointId(): ProjectCheckpointId
}
```

`createProjectId` 是新项目身份分配边界，`createNewSession` 是产品模板边界。当前可以组合最小合法项目，未来加入默认 Instrument Track 或其他模板时不需要修改持久化协调。Project / Checkpoint ID 都由外层生成，使服务不读取浏览器随机数并保持测试确定性。

服务提供当前只读状态、`create()`、`open(projectId)`、`save()`、状态订阅和 `dispose()`。订阅不会同步重放当前状态；订阅者先读取 `state`，之后只接收状态变化。

## 状态机

状态使用判别联合而不是一组可产生非法组合的松散布尔值：

```text
idle
  -> creating(projectId)
     -> ready(projectId, session, ...)
     -> create-failed(projectId, failureCause)
  -> opening(projectId)
     -> ready(projectId, session, ...)
     -> open-failed(projectId, failureCause)

ready
  -> ready + saving
     -> ready + idle
     -> ready + failed
  -> opening(otherProjectId)

any live state
  -> disposed

ready
  -> session-failed(projectId, failureCause)
```

`ready` 状态同时记录：

- 当前 `ProjectSession` 和观测到的 `modelRevision`；
- `savedRevision`；当前 Create 会先保存初始 Checkpoint，因此正常 ready 不再从 `null` 开始；该类型仍保留 `null` 以表达未来导入或临时项目等未保存来源；
- 由 revision 对账得出的 `isDirty`；
- `saveStatus` 与最近一次保存失败；
- 恢复成功前被拒绝的 checkpoint candidates，供未来 UI 提示发生过 previous fallback。

所有公开状态与诊断集合都是 frozen snapshot。Session 本身是有状态应用对象，不会被假装成不可变值。

## Dirty 的唯一判定

Dirty 不作为独立、可随意翻转的事实保存，而只按下式派生：

```text
isDirty = savedRevision is null
       or observedModelRevision != savedRevision
```

服务订阅 Session 的 all-project-commits。普通 Command、undo 和 redo 都会发布 commit，因此三条编辑路径使用同一个 dirty 规则，不需要 UI 记得在每种操作后手动置脏。

Checkpoint 恢复会创建 revision `0` 的 fresh Session，所以恢复成功时 `savedRevision` 取该 Session 的 `0`，不能取旧进程写入 envelope 的 `sourceModelRevision`。后者只描述 checkpoint 当时捕获自哪个旧 Session revision。

## 新建与打开语义

Create 与 Open 的公开意图不同：

- `create()` 由注入来源分配 Project ID，防御性确认没有身份碰撞，创建最小 Session，并在首个 Checkpoint 保存成功后才进入 clean ready；
- `open(projectId)` 只激活已有有效 candidate，恢复 fresh clean Session 并保留 earlier candidate failures；没有 candidate 返回 `project-not-found`，绝不创建空项目；
- 两种操作分别使用 creating / create-failed 与 opening / open-failed，使 UI 不需要从错误猜测意图。

“损坏”不能伪装成“从未保存”。服务还会校验新建工厂返回的 Session 确实属于生成的 Project ID，避免 Composition Root 接错模板或 ID。完整的最终产品语义见 [Active Project Create / Open 产品语义计划](./active-project-create-open-semantics-plan.md)。

连续调用 Create / Open 使用同一个 latest-request-wins generation：后一次调用立即解除旧 Session 订阅并成为当前 generation；较早的 completion 不得覆盖新状态或重新挂载旧 Session。已经开始的 Create 仍完成自己的 durable 初始 Checkpoint，因为它是明确的新建命令；只是不会夺回 Active Project。

## 保存与编辑并发

`save()` 只在 `ready` 可用。一次保存：

```text
create fresh checkpoint ID
-> capture one Session Snapshot
-> saveProjectCheckpoint
-> use receipt.sourceModelRevision as savedRevision
-> compare with the current Session revision
```

保存期间不锁定编辑。若 revision `10` 开始保存、写入完成前 Session 已到 `11`，成功回执只把 `savedRevision` 推进到 `10`，状态仍然 dirty；不能因为一次异步写入成功就无条件显示 Saved。

保存失败保留当前 Session 和旧 `savedRevision`，进入 `saveStatus: failed` 并暴露原始错误。后续显式保存可以重试。首版同一个活动项目只允许一个在途保存，重复 `save()` 返回稳定的 `save-in-progress` 使用错误；不在此阶段提前实现 save queue 或 coalescing。

若打开另一个项目或销毁服务时旧保存仍在途，底层写入可以正常结束，但其 completion 不得修改新项目或 disposed 状态。

## 错误与订阅边界

存储、Checkpoint 解码和领域恢复错误保留 Project Core 的稳定错误类型；`ActiveProjectError` 只表达应用服务使用错误和组合不变量，例如 disposed 后调用、非 ready 保存、并发保存、新 Session Project ID 不匹配。

状态订阅者采用 `onStateChange` / `onError` 协议。某个订阅者抛错后只终止该订阅，并向它交付 frozen delivery failure；不能让 UI observer 的异常把已经成功的打开或保存反写为业务失败，也不能阻止其他订阅者收到状态。

## 包结构

```text
apps/studio/
├── docs/
│   └── active-project-persistence-plan.md
└── src/workbench/project/
    ├── active-project-error.ts
    ├── active-project-service.ts
    ├── active-project-state.ts
    └── __tests__/
        ├── active-project-service.spec.ts
        └── active-project-test-support.ts
```

专用测试 Session、deferred store 和数据工厂只放在 `__tests__`，不进入生产模块目录或应用构建。

## 测试与验收

- Create 内部分配身份，并且只在初始 Checkpoint 成功后进入 ready、saved、clean；
- 有效 checkpoint 恢复为 clean fresh Session；
- active 损坏而 previous 有效时保留恢复诊断；全部无效时进入 open-failed 且不新建空项目；
- store read/write 失败保持原始 cause 和正确状态；
- commit（包含未来的 command / undo / redo 共同发布路径）更新 observed revision 与 dirty；
- 保存成功推进 `savedRevision`，保存期间继续编辑不会误清 dirty；
- 保存失败保留 Session 与已保存基线，并允许重试；
- 并发保存被拒绝；连续打开只允许最后请求生效；
- dispose 或项目切换后的 stale async completion 不污染状态；
- observer failure 与其他 observer 隔离；
- Studio 类型检查、测试、构建以及 workspace 架构检查全部通过。

完成本独立模块后停止等待审阅，不连续接入 Vue、Router 或真实 IndexedDB Composition Root。

## 实施结果

本阶段已于 2026-07-21 按上述边界完成：

- `ActiveProjectService` 已在 Studio Workbench 内组合 Project Session 与 storage-neutral Checkpoint 协调函数，没有依赖 Vue、Pinia、Router、`idb` 或 platform-browser 内部实现；
- idle、creating、create-failed、opening、open-failed、ready、session-failed、disposed 与保存子状态均为 frozen 判别联合，dirty 只由观测 revision 和 `savedRevision` 派生；
- 明确 Create 内部分配 ID 并保存初始 Checkpoint、Open 只恢复已有项目、previous fallback 诊断、全部损坏失败、显式保存和失败重试已经形成完整应用服务语义；
- 保存期间允许继续编辑，并只按 receipt 的来源 revision 推进保存基线；同一项目的并发保存被明确拒绝；
- generation guard 保证重叠打开、切换项目或 dispose 后的旧异步 completion 不能污染当前状态；
- Session all-commits 订阅统一覆盖 command / undo / redo 的 dirty 观察，状态 observer failure 与其他 observer 隔离；
- 新建 Session 工厂会校验 Project ID；恢复得到的 Session 已由核心恢复协议校准，不再额外生成一次大型 Snapshot；
- 专用可变 Session 与受控 Checkpoint Store 只存在于 `__tests__`；Studio 当前为 2 个测试文件、13 项测试；
- Studio Vitest 配置显式使用 ES2022 与 DOM libs，使跨包公开源码在测试项目中按与应用一致的标准库契约检查；
- workspace 架构检查、类型检查、全部测试和 Studio 生产构建通过。

Vue / Router 接入、真实 `IndexedDBProjectCheckpointStore` Composition Root、项目 ID discovery、默认 MIDI 模板、自动保存、Journal 与多标签页协调仍未进入本阶段。
