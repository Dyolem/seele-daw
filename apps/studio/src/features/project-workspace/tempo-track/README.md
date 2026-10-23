# Tempo Track

Tempo 事件属于 ProjectSession；这里是编辑它们的界面：轨道（Lane）、已选事件控件和拖动手势。

## 数据与命令

[`tempo-editing.ts`](./tempo-editing.ts) 是工作区唯一的 Tempo 模型，由 `ProjectWorkspacePage`
用 `provideTempoEditing(readyProject)` 创建，组件用 `useTempoEditing()` 取得。它持有：

- 事件、带拖动预览的事件、选中事件和拖动预览；
- Transport 上的 BPM 字段（单一 Tempo 可编辑，Tempo Map 时只读显示播放头处的值）；
- 全部编辑命令：添加、移动、改 BPM、删除、提交拖动。每次编辑先暂停播放，失败以 Toast 报告。

组件之间不再用 props / emit 转发 Tempo 数据或命令；Arrangement、Transport 和 Lane 直接读写模型。

## 文件

| 文件                                                                                     | 内容                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [TempoTrackLane.vue](./TempoTrackLane.vue)                                               | 轨道绘制、点与轮廓命中、键盘选择与删除                       |
| [TempoTrackControl.vue](./TempoTrackControl.vue)                                         | 已选事件的 BPM / 位置输入与前后导航；输入草稿属于控件        |
| [hooks/use-tempo-track-drag.ts](./hooks/use-tempo-track-drag.ts)                         | 拖动的 Vue 适配：Pointer、映射监测、Escape 取消、提交与回告  |
| [interaction/tempo-track-drag-session.ts](./interaction/tempo-track-drag-session.ts)     | 基于 Editor `GestureSession` 的拖动会话：冻结目标与 revision |
| [interaction/tempo-track-drag-operation.ts](./interaction/tempo-track-drag-operation.ts) | 抓取偏移、主导轴锁定、预览与完成结果                         |
| [tempo-track.ts](./tempo-track.ts)                                                       | 时间、BPM、命中、Scale 与位置文案的纯计算                    |

## 拖动规则

- 按下时冻结 Session、事件、base revision 与轨道映射；只在当前投影的 revision 上开始。
- 任一轴移动超过 4 CSS px 后锁定主导方向（`tick`、`bpm`，或首事件的 `blocked-tick`）；
  tick 0 的首事件不能水平移动或删除，仍可调 BPM。时间按整数 Tick，不吸附网格。
- 松开时提交一次；预览保留到视图投影到这次 Commit 的 revision，不会闪回。
- 外部 Commit、Session 或选择变化、编辑禁用、映射改变、Escape、Pointer Cancel、失去
  capture、窗口失焦或卸载都会取消未提交的拖动。提交后的显示失败只报 Warning。

行为测试在 [`__tests__`](../__tests__)：`tempo-editing.spec.ts` 覆盖模型的编辑与选择，
`TempoTrackLane.spec.ts` 覆盖轨道与拖动，`tempo-track-drag-session.spec.ts` 覆盖会话协议。
