# ADR-011：订阅者抛错时只报告，不回送

- 状态：Accepted
- 日期：2026-10-25
- 实施：与本文同一提交

## Context

每个发布者都实现同一套协议：订阅者是 `{ onX, onError }` 对象，发布者在运行时检查两个方法
都在；`onX` 抛错时，发布者永久退订它，再把一份“投递失败”记录交给它的 `onError`。project-core
的 ChangePublisher、ActiveProjectService 的两种订阅、播放协调器、editor 的 Note Read Model 与
Editor Session、Pointer Adapter 和手势的 authority 都这样做，每一层再把收到的失败包成自己的
失败类型往上传；ActiveProjectService 为此还有一个 `session-failed` 阶段。

这些路径处理的都是 bug：某个监听者抛了错。代价是每个消费者都要写 `onError` 和恢复逻辑，而
一次异常就让视图永久失去订阅，直到它被重建。

## Decision

1. 订阅者是函数：`session.subscribe(subscription, listener)`、`activeProject.subscribe(listener)`、
   `subscribeCommits(listener)`、Read Model 与 Editor Session 的 `subscribe(listener)`、Pointer
   Adapter 的 `onInput`、手势 authority 的 `watch(listener)`。发布者不在运行时检查订阅者的形状。
2. 一个监听者抛错，不影响其他监听者，也不退订它。错误交给 project-core 导出的
   `reportListenerError`：有 `reportError` 的环境（浏览器）按未捕获错误报告；没有的环境（Node、
   jsdom）在微任务中抛出，所以测试会因它失败。
3. 投递失败类型、`onError`、`invalid-observer`、`ProjectSubscriptionError` 与 `session-failed`
   阶段删除。需要特定反应的组件在自己的监听函数里捕获：播放协调器跟不上 Active Project 时让
   引擎进入失败状态，用户能听到也能看到；Pointer Adapter 在消费者抛错时释放 capture、发出
   Cancel，再让错误像任何失败的事件监听一样传出。
4. 订阅描述只拒绝不可能命中的过滤（空的 ID 列表、空区间），抛 `RangeError`；类型已经保证的
   形状不再检查。

## Consequences

- 视图的 bug 不再让它悄悄停止更新；每次发生都报告一次，下一次提交就可能恢复。
- 原先显示在界面上的投递失败消息没有了，这些错误只出现在控制台和全局错误事件里。Studio
  目前没有全局错误界面，需要时在一处监听 `error` 与 `unhandledrejection`。
- 测试里故意抛错的监听者要替换 `reportError`（`vi.stubGlobal`），否则测试会失败。

## Validation

- project-core、editor 与 Studio 的发布者各有测试：一个监听者抛错时，其他监听者照常收到，它自己
  下一次仍然收到，每次都报告一次。
- `project-playback-coordinator.spec`：读不到 Snapshot、跟不上 Active Project 时，播放进入失败
  状态并显示原因。
- `pnpm check` 全部通过。

## Revisit Trigger

- 需要在界面上告诉用户某个视图出错了：在 Studio 加一处全局错误监听，而不是恢复每层的
  `onError`。
- 某个监听者的错误必须改变发布者的行为：让这个监听者自己捕获，并调用发布者的明确接口。
