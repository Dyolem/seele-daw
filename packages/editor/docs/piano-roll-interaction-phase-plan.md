# Piano Roll Interaction 第三阶段计划

> Status: In progress; Batches 1–3 accepted, Batch 4 implemented and awaiting review
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

- Surface 注册一组委托式 Pointer Listener，不为每个 Note 创建 Listener；
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

当前实现遵循以下具体边界：

- Common 只定义冻结的 `PianoRollHit` 与 `PianoRollPointerInput` 事实，不引用浏览器类型；
- DOM Adapter 通过 `composedPath()` 和稳定的 Note ID marker 解析 Note body；
- 无效 marker、Surface 外事件和 Hit Resolver failure 均 fail closed；
- 只接受 Primary Pointer 的主按钮，并且同一时间只捕获一个 Pointer；
- Down 时冻结 origin Hit、修饰键和 Surface-local CSS Pixel 起点；
- Move、Up、Cancel 在 Pointer Capture 下继续报告当前位置；
- 默认 Drag Threshold 为 4 CSS Pixel，一旦跨越便在该手势内保持为 true；
- `pointercancel`、`lostpointercapture` 与 active dispose 都输出 Cancel；
- Observer、Hit Test 和 Pointer Capture failure 不逃逸到浏览器事件循环。

本批只建立输入事实，不直接改变 Selection。Click / Toggle / Clear 规则仍由后续 Select
Interaction 在 Pointer Up 且未跨越阈值时解释。

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

当前实现决定：

- 固定使用 `@tanstack/hotkeys@0.8.0` core，由单一 Browser Registry 隔离 alpha API；
- 不使用 Vue composable；Composition Root 创建并释放应用唯一 Coordinator；
- Coordinator 拥有 Action ID、Scope、enabled、handled policy 与冻结 metadata；
- TanStack 只拥有 `Mod`、解析、editable filtering、Listener 注册和 cleanup；
- 同 Binding 按 Modal → focused Piano Roll → Workbench → Global 解析；
- IME composing 和已处理 Event 不进入 Action；
- 只有 Handler 返回 true 才阻止浏览器默认行为；
- Workbench 已接入 Save、Undo、Redo 及 Windows `Control+Y` 兼容 Binding；
- 内置 Binding 由强类型默认 Keymap 提供，页面只按 Action ID 查询当前配置；
- 动态用户字符串必须先通过非抛出的 Validation 边界，未来 Settings 负责行内提示和覆盖合并；
- `piano-roll.selection.clear` 的 ID、Scope 与 `Escape` 产品规则已保留，但真实 Handler 随
  Batch 4 Editor Session 接入，不能提前注册空行为。

完整边界见
[Studio Keyboard Shortcut Architecture](../../../apps/studio/docs/studio-keyboard-shortcut-architecture.md)。

## Batch 4：Studio Selection

- `ProjectPianoRollSurface` 组合 Editor Session，并随 Clip 生命周期 dispose；
- Vue 只通过 `shallowRef` 观察 Editor Session State identity；
- Scene 增加 Renderer-neutral selected 视觉事实；
- DOM 与 Canvas Note Adapter 消费相同的 selected 状态；
- Piano Black 增加 selected border / glow Design Tokens；
- 接入 Pointer 选择、修饰键切换、空白清除与 `Escape`；
- 可访问摘要报告当前 Selection 数量；
- 不使用 Pinia：Note Selection 属于当前 Clip Editor lifetime，不是跨页面应用 UI 状态。

当前实现遵循以下具体边界：

- Common Select Interaction 只解释完成且未越过 Drag Threshold 的 Pointer Input；
- 普通 Click 调用 `selectOnly`，Shift / Command / Control Click 调用
  `toggleSelection`，空白 Grid Click 调用 `clearSelection`；
- Studio 为当前 Clip 创建唯一 Editor Session，以 `shallowRef` 接收冻结 State identity；
- Grid Surface 的 Pointer Begin 会把焦点交给 Piano Roll，但 Selection 只在 Pointer End 确认；
- `Escape` 通过集中 Keymap 和 Piano Roll Scope 注册，只在当前 Surface 聚焦且有 Selection
  时处理；
- 切换 Clip Context 会释放 Read Model 与 Editor Session，并从空 Selection 重新组合；
- Scene 显式携带 `selected`、解析后的 Border 和 Glow，DOM / Canvas Adapter 不自行推断
  Selection；
- 可访问摘要报告可见 Note 数量和当前 Selection 数量。

## 停止点

每个 Batch 完成生产模块、测试和对应文档后停止审阅。第三阶段完成前不接 Add、Move、
Remove、Resize、Box Selection、Zoom / Scroll 或 Playback。
