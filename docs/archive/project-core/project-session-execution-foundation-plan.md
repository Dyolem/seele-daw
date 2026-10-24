# ProjectSession 最小执行门面计划

## 目标

本阶段建立 Project Core 的首个正式执行门面，把已经完成的 Command、MutationPlan、Commit candidate 和 MutationApplier 串成一条产品可调用的原子编辑管线。

本阶段完成后，上层可以创建一个最小合法项目 Session，并通过公开 `execute(command)` 获得 committed 或 no-change 结果，而不接触 ModelStore、MutationPlan、Command handler 或 MutationApplier。

## 模块位置

实现位于 `packages/project-core/src/session/`。

Session 负责会话级依赖组合和执行顺序，不拥有新的项目事实，也不复制 Command、Mutation 或 Commit 逻辑：

```text
ProjectSession
├── ModelStore               唯一项目事实源
├── MutationApplier          唯一写入者
├── prepareProjectCommand    生成 ready / no-change
└── createProjectCommitCandidate
```

对外导出 `ProjectSession` 只读接口；实际实现 Class 保持包内。包内 `createProjectSession(store)` 是真实的生产组合入口，同时被公开的新项目工厂使用，未来加载器也可以复用，不是测试专用构造器。

## 公开创建入口

首版公开：

```ts
createInitialProjectSession(input): ProjectSession
```

它复用现有最小合法项目初始化器，创建 Tick 0 的 Tempo / Time Signature、空 Master 和空实体表。调用方继续提供全部 opaque ID，内核不生成随机身份。

项目文件加载尚未实现，因此本阶段不公开接受 ModelStoreSeed、DTO 或 Snapshot 的构造器。

## execute 结果

`execute` 返回判别联合，而不是把 no-change 伪装成 Commit：

```ts
type ProjectCommandExecutionResult =
  | {
      readonly status: 'committed'
      readonly commit: ProjectCommit
    }
  | {
      readonly status: 'no-change'
      readonly reason: 'already-at-target'
      readonly modelRevision: ModelRevision
    }
```

### committed

ready Command 严格经过：

```text
prepareProjectCommand
-> MutationPlan
-> create ProjectCommit candidate
-> freeze committed execute result
-> MutationApplier.apply(plan)
-> return the already prepared result
```

Commit candidate 和 execute result 都在权威写入前构造。若 apply 失败，它们被丢弃；若 apply 成功，后续只返回已经存在的对象，不再分配、映射或调用外部代码。这保留 MutationApplier“revision 是最后一次可能失败的成功路径写入”边界。

### no-change

Move 目标与当前 Note 相同时：

- 返回冻结的 `no-change` 结果；
- `modelRevision` 保持当前值；
- 不构造 MutationPlan、ProjectCommit 或 ProjectDelta；
- 不调用 MutationApplier。

重复 ID、目标缺失、越界和 stale revision 仍是类型化错误，不降级为 no-change。

## 错误与故障边界

Session 不包装或吞掉现有领域错误。Command、Commit candidate、Mutation projection 和 apply 错误原样抛出，使调用方能够读取稳定错误码。

MutationApplier 在 rollback failure 后已经永久 faulted；Session 持有同一个 Applier，因此无法通过创建第二个写入者绕过故障。显式的 `session.status`、reload 和 read-only recovery 要等加载与 Snapshot 生命周期存在后再设计。

## 本阶段不包含

- History、Undo、Redo 或 merge；
- QueryIndex、Query API 或 ProjectSnapshot；
- listener、filter、ChangePublisher 或订阅异常策略；
- durability、journal、Playback 同步；
- ProjectFileDTO 加载。

本阶段的成功结果只返回给 `execute` 的直接调用方。Listener 发布将在 subscription/filter 语义明确后作为独立模块加入，不能在模型提交后临时调用一组可能抛错的未知回调。

## 测试边界

- package root 只公开 Session 接口、创建函数和 execute result 类型；
- 最小合法 Session 从 revision 0 创建；
- Add / Move / Remove 经 Session 原子提交并返回准确 Commit；
- no-change 不写入、不递增 revision；
- stale、越界和目标错误不产生可观察 Commit；
- 同一 ModelStore 不能创建第二个 Session 写入者；
- 返回结果及其 Commit / Delta 外壳保持运行时冻结；
- ModelStore、MutationApplier、candidate 工厂和包内 Session 组合入口不从 package root 导出。

## 完成边界

完成本模块后停止等待审阅，不连续实现 History、Query 或订阅。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- package root 已公开最小 ProjectSession 接口、新项目创建入口、execute 状态常量和结果类型；
- 实际 Session Class 与 `createProjectSession(store)` 组合入口保持包内，公开 API 不接受 ModelStoreSeed；
- Add / Move / Remove 通过 Session 返回 frozen Commit，no-change、stale revision 和范围拒绝保持无写入语义；
- 同一 ModelStore 的第二个 Session 无法取得 writer lease；
- listener、History、Query、Snapshot、持久化与 Playback 未进入本模块；
- Project Core 基线为 15 个测试文件、273 项测试；workspace 类型检查、架构检查、lint、递归测试和 Studio production build 通过。
