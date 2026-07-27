# Piano Roll Browser Renderer 实施计划

> Status: Implemented
>
> Date: 2026-07-27

## 目标

本批把已经接受的 Piano Roll Common Foundation 接入第一条可见纵向切片：

- `@seele-daw/editor/browser` 绘制只读 Pitch Grid 与可见 MIDI Note；
- Studio 在 Context Editor Dock 中组合选中 Clip、ProjectSession Query/Subscription 与主题；
- DOM 负责标尺、钢琴键盘、焦点和可访问摘要；
- Canvas 负责高密度 Pitch / Grid，首批 Note 使用 keyed DOM；
- 不提前实现 Tool、Hit Test、Selection 或 Note Command。

## 包边界

### Editor Common

继续拥有：

- `PianoRollClipContext`；
- `PianoRollViewport` 和领域坐标换算；
- `PianoRollNoteReadModel`。

Common 不依赖 DOM、Canvas、Vue 或 Studio。

### Editor Browser

新增框架无关的浏览器 Renderer：

- `PianoRollGrid` 定义 bar / beat / subdivision Tick Span；
- `PianoRollGridCanvasTheme` 接收宿主已经解析的 Grid 语义颜色；
- `PianoRollGridCanvasRenderer` 拥有静态 Grid Canvas；
- `PianoRollNoteScene` 提供 Renderer-neutral CSS Pixel Note 几何；
- `PianoRollNoteRenderer` 由 keyed DOM 与 Canvas 两个 Adapter 实现；
- Grid Canvas bitmap 按 DPR 配置，所有 Scene 几何仍使用 CSS Pixel；
- 密度过高的网格级别不绘制，避免完整 Clip 视图产生无意义的高频线；
- Renderer 不读取 ProjectSession、不订阅 Commit、不生成 Command。

Studio 默认使用 DOM Note Adapter，以获得 Pointer Event、CSS Motion 与 Focus 的自然入口；
Canvas Note Adapter 保留为同一 Port 的替代实现和基准对象。完整决策见
[Piano Roll Note Renderer 决策](./piano-roll-note-renderer-decision.md)。

### Studio

Studio 新增：

- `ProjectPianoRollPresentation`：从当前 Snapshot 解析选中 Clip、Source window、
  Track Color 和 muted；
- `ProjectPianoRollSurface.vue`：组合 Read Model、Renderer、ResizeObserver、Design
  Tokens 与 DOM 可访问层；
- Workbench Shell → Workspace → Dock 的显式 ProjectSession read capability 和
  Presentation Props。

ProjectSession 仍来自 Active Project 的 shallow state，不进入 Pinia，也不被 Piano Roll
复制。Pinia 只保存可重建的 `selectedClipId`；Presentation 每次从权威 Snapshot 派生。

## 当前产品行为

- 选中并打开非循环 MIDI Clip 后显示真实 Piano Roll；
- 横向初始显示完整 Clip；
- 纵向固定显示 MIDI 48–72，MIDI 60 标为 C4；
- Grid 为 1/16，并显示 bar / beat / subdivision 三级线；
- Note 使用 Clip 或 Track 的项目颜色；muted Clip 的 Note 降低透明度；
- Dock 的最小化、拖动高度、最大化和工作区全屏继续由现有 Shell 控制；
- Read Model 在相关 Note Commit 后重新 Query 并重绘；
- looped Clip 显示明确的不支持状态，不错误套用非循环 1:1 Source 映射。

## 明确不在本批

- Pointer / Keyboard 输入；
- Hit Test、Hover、Selection；
- Select / Pencil Tool；
- Add / Move / Remove / Resize Note；
- Zoom、Scroll、播放头、Velocity lane；
- OffscreenCanvas、Worker、空间索引或 dirty region。

## 验证

- Editor Renderer 单元测试覆盖 Grid 验证、DPR、密集 Grid 抑制、Note Scene、
  keyed DOM / Canvas Note Adapter、dispose 和 2D Context 失败。
- Studio 测试覆盖 Presentation 所有权映射、looped Clip 限制、Canvas Grid / DOM Note 组合、
  Project Query/Subscription 与 dispose。
- 全仓 `pnpm lint`、`pnpm check` 在本批提交前执行。
