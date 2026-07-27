# Piano Roll Common Foundation 实施计划

> Status: Implemented and accepted
>
> Date: 2026-07-27

## 目标

本批在 `@seele-daw/editor/common` 建立第一组由真实 Piano Roll 产品切片驱动的框架无关能力：

- 把一个非循环 MIDI Clip 与它唯一的 MidiSource 组合为稳定编辑上下文；
- 明确 Clip-local Tick 与 MidiSource Tick 的 1:1 映射；
- 定义可见 Tick / Pitch 范围和 CSS Pixel 坐标换算；
- 通过 Project Core 已有的 MIDI Note Query 与局部 Subscription 建立只读可见 Note 模型；
- 为后续 Canvas Renderer、Hit Test 和 Note Add 手势提供同一份语义输入。

本批完成后仍没有可见 Piano Roll。它只实现下一批 Browser Renderer 和 Studio
集成会立即消费的最小 common 模块，不扩建通用编辑器框架。

## 产品默认值

已经确认但不全部在本批执行的首批 Piano Roll 规则：

- MIDI Note 60 显示为 `C4`，初始视图以 C4 附近为中心；
- 横向初始显示完整 Clip；
- 默认 Grid 为 `1/16`；
- 默认工具为 Select，Pencil 单击创建 Note；
- 新 Note 默认长度 `1/16`、Velocity 100、UI MIDI Channel 1。

Grid、Tool 和 Note 默认值会在对应产品切片进入 Command 前实现。本批只导出
`C4 = MIDI 60` 的稳定中心音高常量，不提前实现 Snap 或 Tool 状态机。

## Clip 编辑上下文

`PianoRollClipContext` 只携带渲染和读取所需的身份与时间范围：

- `clipId`；
- `sourceId`；
- `clipSpanTick`；
- `sourceStartTick`，等于当前 Clip 的 `sourceOffsetTick`；
- `sourceEndTick`，等于 `sourceStartTick + clipSpanTick`。

工厂验证 Clip / Source 身份一致，并再次验证 Source 读取范围。当前 UI 只能创建
`loop = null` 的 Clip，因此首批 Piano Roll 对循环 Clip 明确失败关闭；不能把循环内容错误地
当成 1:1 Source 范围显示。Loop 展开与编辑语义必须在相应产品切片单独决定。

## Viewport 与坐标

Viewport 使用：

- Clip-local 半开 Tick 区间；
- 包含端点的离散 MIDI Pitch 范围；
- CSS Pixel 宽高。

Common 层只做确定性换算：

- Clip Tick → X；
- X → 未吸附的连续 Clip Tick 位置；
- MIDI Pitch → Note Row 顶部 Y；
- Y → MIDI Pitch。

X 到 Tick 不做 round、floor 或 Snap，避免坐标层提前决定 Note Add 产品规则。
Viewport 必须位于 Clip 1:1 范围内，像素尺寸必须是有限正数。

## 可见 Note Read Model

Read Model 只依赖 `ProjectSession.query` 与 `ProjectSession.subscribe`：

1. 把 Viewport 的 Clip-local Tick 转为 Source Tick；
2. 执行 `MidiNotesIntersectingRangeQuery`；
3. 把相交 Note 投影为带可见 Clip-local 起止 Tick 的冻结值；
4. 订阅同一 Source、同一可见 Source Tick 范围的 Note changes；
5. 匹配 Commit 到达后重新 Query，不从 Commit Delta 复制一份 Note 真相；
6. Viewport 改变时先建立新查询和订阅，再替换旧状态；
7. dispose 后取消订阅并拒绝后续操作。

Read Model 状态携带 Query 的 `modelRevision`。多个已排队通知若最终读到同一 revision，
只发布一次状态变化。Observer 失败与 Project Subscription 失败隔离，不改变 Project
Session 或其他 Observer。

## 包与状态边界

- `common` 禁止 Vue、Pinia、DOM、Canvas 和 Web Component；
- Note Record、Clip 和 Source 继续由 Project Core 权威拥有；
- Read Model 只保存冻结的当前可见投影和可重建订阅；
- Note Selection、Tool、Zoom / Scroll 后续由 Editor Session 拥有，不进入 Project；
- Studio 只负责把当前所选 Clip 和 Active Project 能力注入 Editor；
- Web Component 等宿主 Adapter 等公共 Controller / Renderer API 稳定后再评估。

## 非目标

- Canvas 或 DOM Renderer；
- 钢琴键盘、标尺、Toolbar 或 Theme Snapshot；
- Note Add / Move / Remove / Resize；
- Snap、Grid 绘制或 Tool 状态机；
- Note Selection 与 Hit Test；
- Looped Clip 展开；
- Vue Binding、Pinia Store 或 Studio Composition。

## 验证与停止点

测试覆盖：

- Clip / Source 组合、范围和循环拒绝；
- Clip Tick / Source Tick 映射；
- Viewport 边界和坐标 round trip；
- Pitch Row 映射；
- 可见 Note Query、边缘裁切与稳定顺序；
- 匹配 Note Commit 后重新 Query；
- 非可见范围 Commit 不触发状态；
- Viewport 替换、dispose 和 Observer failure isolation。

完成 common 生产模块、公开入口、README、产品手册和完整仓库验证后停止，等待第一批审核。
