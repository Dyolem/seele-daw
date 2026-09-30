# Tempo Track

Tempo Track 的 Project facts 由 ProjectSession 拥有；此目录负责 Lane、数值控件与临时
Preview。G2 已把 Lane 拖动迁入 Editor 公共生命周期，字段编辑仍走各自的离散提交路径。

## 入口与阅读顺序

| 入口                                                                         | 职责                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [TempoTrackLane.vue](./TempoTrackLane.vue)                                   | Lane 投影、点与轮廓命中、无障碍选择、组合 mount / dispose                  |
| [TempoTrackControl.vue](./TempoTrackControl.vue)                             | 已选事件的 BPM / Position 输入与导航；输入草稿属于控件                     |
| [use-tempo-track-drag.ts](./hooks/use-tempo-track-drag.ts)                   | Lane 私有 Hook；组合 Pointer Adapter、映射监测、统一 Cancel 与提交回告     |
| [tempo-track-drag-session.ts](./interaction/tempo-track-drag-session.ts)     | 组合 InteractionSession / CommitHandoff，冻结目标，校验 revision，订阅失效 |
| [tempo-track-drag-operation.ts](./interaction/tempo-track-drag-operation.ts) | 冻结抓取偏移与坐标映射，锁定主导轴，计算 Preview 与一次完成结果            |
| [tempo-track-preview.ts](./tempo-track-preview.ts)                           | Arrangement 提供的共享展示；仅接受当前 InteractionId 的更新与清除          |
| [tempo-track.ts](./tempo-track.ts)                                           | 时间、BPM、命中、Scale 与位置文案的纯计算                                  |
| [types/](./types/)                                                           | 最小共同范围的输入、Preview、Operation 结果、Page 能力和展示契约           |

从 Lane 的 `useTempoTrackDrag` 调用开始，依次阅读 Hook、Session、Operation 和
[Page 的提交边界](../ProjectWorkspacePage.vue)。公共内核从 `@seele-daw/editor` 根入口
导入，Tempo 领域规则留在 Studio，不引入 Editor → Studio 的依赖。

## 一次拖动的约定

- Begin 冻结 Session 对象、TempoEvent、base revision、原 Tick / BPM、抓取偏移和 Lane
  映射；只对当前已投影的 revision 开始编辑。点击仍在 Pointer Down 选择事件，键盘点击
  选择聚焦的点，较密的重叠点使用几何命中。
- 保留原来的 4 CSS px 轴容差：任一轴达到阈值后按主导方向锁为 `tick / bpm /
blocked-tick`，等量偏移选择 BPM。tick 0 首事件不能水平移动或删除，仍可纵向调整 BPM。
- 时间按整数 Tick 编辑，不做音乐网格 Snap；BPM 使用既有两位小数编辑精度。拖回原点
  保留导入值的原始精度，不产生 Command 或 History。
- Update 只写 Preview。End 包含最后坐标，领取一次结果后调用 Page 提供的 `commitDrag`；
  Page 负责播放暂停，Coordinator 验证冻结 Session，并把原 base revision 交给 Command。
  新增点、数值输入与删除继续使用已有 Coordinator。
- Update、End、领取均同步校验 revision；Commit 订阅同时覆盖没有后续 Pointer 的外部
  修改。自己的 Commit 不误判为外部取消；最终 Preview 保留到 Vue 的事实投影追上 revision。
  旧 capture、重复 End、旧回告和旧 Preview 清理不能影响新交互。
- 拖动冻结的 Lane `left / top / width / height`、时间范围、Bar 映射或 BPM Scale 变化时
  取消；等值 Resize、没有改变 Lane 映射的 Scroll 保留手势。这里不实现 Edge Scroll，
  Timeline Locate 在 G3 使用自己的重映射政策。
- 目标、Session、选择切换、编辑禁用、Escape、Pointer Cancel、lost capture、Window blur
  或卸载会结束未提交交互。提交失败不修改 Project；提交后的显示失败报告 Warning，
  不声称合法 Commit 被回滚。

## 资源与外部 owner

| 资源                                  | owner 与释放顺序                                                         |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Project / History / Tempo Commands    | `workbench/project/tempo-event` Coordinator 与当前 ProjectSession        |
| 播放准备与当前项目能力                | `ProjectWorkspacePage` 通过 `TempoEventActionContext` 提供               |
| Pointer、Window blur 与 Modifier 监听 | Editor Browser Adapter；Hook 拥有并释放                                  |
| Scroll / Resize 监听及 ResizeObserver | Hook `mount` 创建；部分创建失败立即回收                                  |
| Commit 订阅与语义完成权               | TempoTrackDragSession；结束、取消或 dispose 清理，回调检查 InteractionId |
| Preview 展示                          | Arrangement 提供，Lane 按 InteractionId 发布；不写 Project 或 Playback   |
| Delete / Escape 路由                  | 既有 Studio Selection / Interaction Action Target                        |

组件在 `onBeforeUnmount` 调用幂等 `dispose`：先停止 Vue 观察与映射监听，再断开
ResizeObserver、释放 Pointer Adapter，最后清理 Session 与其 Commit 订阅。已排队的
回调在释放后直接退出。`types/` 不反向导入上述运行时实现。

行为验证保留在 feature 的 [**tests**](../__tests__)：Session 协议、Lane 资源、Arrangement
共享展示、Page 单步 History 与实际 Coordinator 前置条件分别验证；没有新增 E2E。
