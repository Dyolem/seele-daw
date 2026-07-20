# ChangePublisher / 局部订阅基础层计划

## 目标

本阶段在 ProjectQuery / QueryIndex 之后建立 ProjectSession 的提交通知边界。ChangePublisher 只发布已经成功写入 ModelStore 的 frozen `ProjectCommit`，让 Editor、Playback、Durability 和诊断协调器知道哪些已提交事实发生了变化。

Publisher 不保存第二份项目状态，也不把 Query Result 推送给调用方。订阅者把 Commit 当作精确的变化事实或查询失效信号；需要当前数据时，继续通过 `ProjectSession.query()` 读取。

```text
ProjectSession.execute / undo / redo
-> prepare ProjectCommit
-> prepare History + QueryIndex + Publication
-> atomic model apply
-> asynchronous ProjectCommit delivery
   ├── Editor re-query
   ├── future PlaybackSync
   ├── future DurabilityCoordinator
   └── diagnostics
```

## 为什么现在建立

ProjectSession 已经具备 Command、ProjectCommit、ProjectDelta、History 和 revision-consistent Query。若上层在正式通知边界出现前轮询全局 revision，或直接将写入动作与 Vue、音频和存储回调绑在一起，后续所有 Surface 都会被任意项目变化唤醒，外部异常也可能侵入事务路径。

当前每个成功写入都已经产生精确的 Note 级 ProjectDelta，因此可以先建立最小的 Commit 发布与局部过滤协议。Snapshot、Playback 和 Persistence 后续都可以消费同一提交序列，而不需要反向依赖 Command handler 或 ModelStore。

## Query 与 Subscription 的分工

```text
ProjectQuery          pull：读取调用时的当前状态
ProjectSubscription   invalidation：选择关心的已提交变化
ProjectCommit         event fact：描述某次成功提交
QueryIndex            cache：加速当前状态读取，可重建
```

异步 listener 收到 revision 较早的 Commit 时，Session 可能已经完成更晚的同步提交。UI 此时应重新查询最新状态，而不是假定 Query 必须返回该 Commit 对应的历史 revision。需要固定历史内容的消费者应在后续使用 Snapshot / DTO；需要逐项处理变化的消费者可以按 Commit 顺序读取 Delta。

## 首批公开订阅

### 全部 Commit

`createAllProjectCommitsSubscription()` 创建 `project-commit.all` descriptor。它匹配普通 Command、Undo 和 Redo 产生的全部成功 Commit，主要服务于后续的全局协调器、诊断和需要完整提交序列的适配层。

### MIDI Note 变化

`createMidiNoteChangesSubscription(input)` 创建 `midi-note.changes` descriptor。首版可选约束为：

- `sourceIds`；
- `noteIds`；
- `affected` 半开 Tick 区间。

未提供任何可选约束时，匹配全部 MIDI Note changes。若同时提供多个维度，它们必须在同一条 `ProjectChange` 上全部匹配；同一 Commit 的多条 change 之间使用 OR。无论一个 Commit 中有多少条 change 命中，同一订阅都只调用一次。

Tick 区间按半开相交判断：

```text
filter.startTick < change.endTick
&& change.startTick < filter.endTick
```

`sourceIds` 和 `noteIds` 由工厂重新解析、去重、复制并冻结。显式空数组没有稳定的产品含义，因此拒绝，而不是解释为“匹配全部”或“永不匹配”。`affected.endTick` 必须严格大于 `startTick`。包内订阅入口会重新规范化结构化 descriptor，不能只依赖 TypeScript 类型。

## Observer 与生命周期

公开入口为：

```ts
session.subscribe(subscription, observer): ProjectUnsubscribe
```

Observer 显式提供同步 `onCommit` 和 `onError`。这里的“同步”指单次回调本身不返回需要等待的异步任务；Publisher 整体仍在提交后的 microtask 中调用它。

生命周期规则：

- subscribe 不回放旧 Commit；调用方先 Query，再订阅未来变化；
- `ProjectUnsubscribe` 幂等；
- 订阅按注册顺序稳定通知；
- prepare 时取得匹配订阅快照，之后新增的订阅不接收旧 Commit；
- listener 执行前重新检查 active 状态，所以在排队期间或较早 listener 中取消的订阅不会再被调用；
- listener 在通知中发起新 Command 是合法的，新 Commit 排到当前发布批次之后；
- 本阶段不合并或丢弃 Commit。

## 提交时机与原子边界

外部 listener 不能在 MutationApplier 事务中运行。与此同时，ProjectSession 必须继续遵守“成功的 modelRevision 写入后只直接返回”的规则。

因此 Publication 在权威写入前完成匹配、数组复制和 microtask 注册：

```text
prepare Commit / History / QueryIndex
-> prepare Publication and queue gated microtask
-> stage QueryIndex
-> stage History
-> MutationApplier.apply(plan)
   ├── failure -> cancel Publication -> rollback History / QueryIndex -> rethrow
   └── success -> bare return
-> current JavaScript job ends
-> uncancelled Publication delivers Commit
```

JavaScript microtask 不会在当前同步调用栈中间执行。apply 失败路径在栈退出前取消 Publication，因此 rejected、no-change、空 History、写入失败和成功回滚都不会发布 Commit。多个同步成功提交按 microtask 注册顺序发布。

Publication 的 `cancel()` 必须幂等且不调用外部代码，避免在错误恢复路径覆盖原始 apply failure。

## Listener 错误语义

ProjectCommit 一旦发布候选对应的 revision 成功写入，外部失败不能回滚 ModelStore、History 或 QueryIndex。

当 `onCommit` 抛错时，ChangePublisher：

1. 立即停用发生异常的订阅，避免每次提交重复故障；
2. 创建 frozen `ProjectSubscriptionDeliveryFailure`，携带 subscription、commit 和原始 cause；
3. 调用该 Observer 的 `onError`；
4. 继续通知当前批次中的其他订阅者。

`onError` 自身抛错也不能逃逸到发布循环或阻断其他 listener。此时订阅已经终止，Publisher 不再递归报告错误。上层适配器可以在 `onError` 中进入 degraded / failed 状态、写诊断日志或交给应用级错误报告器。

## 模块位置与公开边界

```text
src/subscriptions/
├── project-subscription.ts
├── project-subscription-error.ts
└── change-publisher.ts
```

Subscription 不是 QueryIndex 数据结构，也不是 Session 提交编排本身，因此提升为独立顶层模块。package root 只公开：

- subscription 判别常量；
- descriptor、input、observer、failure 和 unsubscribe 类型；
- subscription 工厂；
- `ProjectSubscriptionError`；
- `ProjectSession.subscribe()`。

ChangePublisher、内部 entry、匹配集合和 prepared publication 不从 package root 导出。

## 测试边界

- descriptor 规范化、冻结、数组复制与重复 ID 去重；
- 显式空 ID 数组、非法 Tick 范围、未知判别和非法 Observer；
- source、note、affected 以及同一 change 上的 AND 过滤；
- 一个 Commit 多项命中仍只通知一次；
- 普通 Command、Undo、Redo 的异步顺序和 origin；
- rejected、no-change、空 History 与 apply failure 不发布；
- unsubscribe 幂等、排队期间取消、通知期间取消和新增订阅；
- listener 重入执行新 Command 时保持 Commit 顺序；
- listener failure 隔离、自动退订和 `onError` envelope；
- ChangePublisher 和 prepared publication 不从 package root 导出。

## 本阶段不包含

- Vue composable、reactive ref、Surface selector 或 Editor Read Model；
- PlaybackSync、DurabilityCoordinator 和具体外部副作用；
- Snapshot、ProjectFileDTO、IndexedDB、OPFS 或 Journal；
- Clip、Track、Tempo、Device、Automation 或 Asset 专用过滤器；
- arbitrary predicate callback、异步 iterator、背压、批次合并或节流；
- listener 的历史回放和 Commit 永久日志。

## 完成边界

完成 ChangePublisher 与 MIDI Note 局部订阅基础层后停止等待审阅，不连续实现 Snapshot、DTO、Playback 或 Persistence。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- package root 已公开两种 frozen Subscription descriptor、规范化工厂、Observer / Failure / Unsubscribe 类型和 `ProjectSubscriptionError`；
- ProjectSession 已增加 `subscribe(subscription, observer)`，ChangePublisher、内部 Set entry 和 prepared publication 保持包内；
- MIDI Note subscription 已实现 source、note、affected 多维过滤，同一 change 内使用 AND、Commit 多 change 间使用 OR；
- Publication 在权威 apply 前完成匹配快照与 microtask 注册，失败路径取消，成功 revision 写入后保持 bare return；
- 普通 Command、Undo 和 Redo 按 revision 异步发布，no-change、rejected、空 History 与 apply failure 不发布；
- unsubscribe 幂等并能抑制排队或通知期间的回调，通知中新增订阅和重入 Command 从后续 Commit 生效；
- `onCommit` failure 会自动终止对应订阅并产生 frozen failure envelope，`onError` failure 也不会阻断其他 listener；
- Project Core 基线为 19 个测试文件、304 项测试。
