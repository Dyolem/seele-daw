# Piano Roll Interaction 第三阶段计划

> Status: In progress; Batch 1 implemented and accepted
>
> Date: 2026-07-28

## 阶段目标

第三阶段把只读 Piano Roll 推进为可选择的交互界面，同时建立后续 Note 编辑共用的输入和
快捷键边界。根据 DOM / Canvas 决策，本阶段不预建 Canvas 空间索引，也不暴露尚不能创建
Note 的 Pencil 工具。

阶段完成时应具备：

- Clip-scoped `PianoRollEditorSession` 与稀疏 Note Selection；
- Surface 级 Pointer Event 委托和 DOM Hit 标准化；
- Studio scoped keyboard shortcut foundation；
- DOM / Canvas Note Renderer 共用的 selected Scene 语义；
- 用户可以通过 Pointer 和 Keyboard 选择、切换和清空 Note。

Pencil 与 Add Note Command 一起进入第四阶段，避免出现没有产品结果的空工具。

## 产品规则

- 普通单击 Note：只选择该 Note；
- `Shift`、`Command` 或 `Control` 单击：切换该 Note 的选中状态；
- 单击空白 Grid：清空 Selection；
- Piano Roll 获得焦点时，`Escape` 清空 Selection；
- 右键不改变 Selection；
- 切换当前 Clip 时创建新的 Editor Session，不继承前一个 Clip 的 Selection；
- Note 只移出当前 Pitch 或未来的可见 Tick Viewport 时保留 Selection；
- Note 被删除、移出当前 Clip 的 Source 时间窗口或不再属于当前 Source 时移除 Selection；
- Undo / Redo 使 Note 消失时清理 Selection，之后 Note 再次出现也不自动恢复旧 Selection；
- Selection 保存稳定 `NoteId`，不保存或复制 `MidiNoteRecord`。

普通 Click 的 Selection 变更会在 Pointer Up 且未超过 Drag Threshold 时确认，而不是直接在
Pointer Down 提交。这为后续多 Note Drag 保留手势空间。

## Batch 1：PianoRollEditorSession

`@seele-daw/editor/common` 新增一个随当前 Clip 创建和释放的 Session：

- 初始 State 携带 `clipId`、`sourceId` 和空的冻结 `selectedNoteIds`；
- `selectOnly`、`toggleSelection` 和 `clearSelection` 返回是否产生 State 变化；
- 新增 Selection 前使用 `MidiNoteByIdQuery` 验证权威 Note；
- 只有与当前 Clip Source 时间窗口相交的 Note 可以进入 Selection；
- 订阅当前 Source 的 MIDI Note Commit；
- Commit 后只为少量已选 `NoteId` 重新查询权威结果；
- Note 仍存在且只移出 Viewport 时不发布新的 Selection State；
- Observer、Project Query 与 Project Subscription failure 明确隔离；
- `dispose` 取消 Project Subscription，并拒绝后续操作。

Session 不依赖 Vue、Pinia、DOM、Renderer 或 Studio，也不拥有任何 Project fact。Studio
后续只需以 `shallowRef` 接收冻结 State。

## Batch 2：Browser Input 与 DOM Hit

- Surface 注册一个 Pointer Listener，不为每个 Note 创建 Listener；
- Browser Adapter 将事件坐标转换为 Surface CSS Pixel；
- DOM Hit 只负责把浏览器命中的元素转换为
  `{ noteId, zone: 'body' | 'resize-start' | 'resize-end' }`；
- Tool 和 Editor Session 不读取 `HTMLElement`、`dataset`、CSS class 或 Vue Event；
- 第一版只实现 Note body，Resize zone 在 Resize 产品切片补充；
- 明确 Pointer capture、单活动 Pointer、Drag Threshold、`pointercancel`、
  `lostpointercapture` 与 dispose；
- 不实现 Canvas Hit、R-tree、Quadtree 或 Pitch Bucket。

即使长期保留 DOM，Event → Hit 的小型转换边界仍保留；若不再需要替换 Adapter，可以缩减
其注入形式，但不能让 Tool 依赖 DOM 结构。

## Batch 3：Scoped Keyboard Shortcuts

先对 TanStack Hotkeys 做隔离的技术验证，再决定引入：

- 使用精确版本，不使用范围版本；
- 第三方库只负责 Key parsing、跨平台 `Mod`、target、input filtering、注册和 cleanup；
- Seele DAW 自己拥有 Action ID、Scope priority、enabled policy 和 Handler；
- 通过 `StudioKeyboardShortcutCoordinator` 包装，不在组件中散布第三方 composable；
- Scope 优先级为 Modal / Dialog → focused Piano Roll → Workbench → Global；
- IME composing 和普通可编辑元素默认不触发编辑快捷键；
- 只有 Action 实际处理时才 `preventDefault`；
- Feature 注册必须返回显式 disposer。

首批真实 Action：

- `project.save`：`Mod+S`；
- `history.undo`：`Mod+Z`；
- `history.redo`：`Mod+Shift+Z`，Windows 兼容 `Control+Y`；
- `piano-roll.selection.clear`：focused Piano Roll 中的 `Escape`。

不提前实现用户 Keymap 持久化、Sequence、Recorder、Shortcut Settings 或 Command Palette，
但 Action metadata 与 Binding 必须能被菜单和未来帮助面板复用。

## Batch 4：Studio Selection

- `ProjectPianoRollSurface` 组合 Editor Session，并随 Clip 生命周期 dispose；
- Vue 只通过 `shallowRef` 观察 Editor Session State identity；
- Scene 增加 Renderer-neutral selected 视觉事实；
- DOM 与 Canvas Note Adapter 消费相同的 selected 状态；
- Piano Black 增加 selected border / glow Design Tokens；
- 接入 Pointer 选择、修饰键切换、空白清除与 `Escape`；
- 可访问摘要报告当前 Selection 数量；
- 不使用 Pinia：Note Selection 属于当前 Clip Editor lifetime，不是跨页面应用 UI 状态。

## 停止点

每个 Batch 完成生产模块、测试和对应文档后停止审阅。第三阶段完成前不接 Add、Move、
Remove、Resize、Box Selection、Zoom / Scroll 或 Playback。
