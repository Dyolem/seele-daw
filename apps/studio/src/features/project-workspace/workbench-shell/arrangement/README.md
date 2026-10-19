# Arrangement 定位与显示

本目录拥有 Arrangement 的定位交互与独立显示组件，遵循根
[工程代码准则](../../../../../../../CODE_GUIDELINES.md)。入口组件仍为
[ProjectWorkbenchArrangement](../ProjectWorkbenchArrangement.vue)。

## 阅读顺序

1. [useTimelineLocate](./hooks/use-timeline-locate.ts) 组合 DOM refs、公共 Pointer Adapter、
   映射检查、Edge Scroll、Follow 与统一 Interaction Cancel。监听创建失败会立即释放已有资源。
2. [TimelineLocateSession](./interaction/timeline-locate-session.ts) 组合公共 InteractionSession
   与 Playback Locate Session，隔离 capture / interaction 身份，确保 commit / cancel 只发生一次。
3. [契约](./types/timeline-locate.ts) 表达输入、展示状态与完成结果，不加载运行时服务。
4. `ArrangementPlayhead.vue`、`LocatePreview.vue` 分别投影权威播放位置与临时定位位置。

## 状态与取消政策

Pointer Begin 立即产生 Preview，无需越过拖动阈值。Browser 输入使用 Client CSS 坐标；
Pointer Update、Modifier Update 和 Edge Scroll 都以当前 scrollLeft 重新映射 Tick。
允许滚动偏移更新；Project、时间线范围、Viewport 位置 / 宽度和内容宽度变化无法保证连续性，
因此取消。Ruler 的方向键、Home / End、PageUp / PageDown 继续属于 slider 控件协议。

播放中的 Begin 由 Playback 暂停运行时，commit 在新位置恢复，cancel 在原位置恢复；Follow
分别恢复开启状态或 Begin 前的暂停状态。失败返回值由 Playback 决定，Locate 不写 Project
facts、History 或 dirty，也不引入 Commit Handoff。

取消或释放先关闭语义 Session 与 Playback，再清空 Preview、停止动画帧并释放 Capture；卸载
关闭 watchers、ResizeObserver、Window 监听与 Adapter。帧回调同时核验句柄和 InteractionId，
延迟 Follow 回调核验生命周期代次，旧回调不能影响新操作。

统一 Interaction Action Target 失效会主动取消 Locate；Tempo 等其他 Surface 开始时先结束
旧 Locate，Playback cancel 抛错也不能留下 Capture 或 Edge Scroll。runtime 提前释放与
组件卸载均清理本次 owner，旧清理不能影响后续手势。

Add track 菜单与快捷键 Dialog 打开时暂停后台 Action；当前层的 Escape 只关闭该层，关闭
后的下一次 Escape 才取消活动 Locate。单纯打开菜单不完成定位；取消后的迟到 End 不调用
Playback commit。
