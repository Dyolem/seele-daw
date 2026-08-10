# Piano Roll Note Editing 第五阶段计划

> Status: In progress; Batch 1, Batch 2, interaction state machine foundation and Batch 3A
> implemented; Batch 3B implemented and pending review
>
> Date: 2026-08-10

## 阶段目标

第五阶段把 Piano Roll 从“创建与选择 Note”推进到可删除、移动和调整长度的基础编辑器。
本阶段沿用现有 Project Command、Clip-scoped Selection、Renderer-neutral Hit、Primary
Pointer Input、Scoped Keyboard Action 和 Timeline Grid，不把 Drag Preview 或
ProjectSession 放入 Vue 深响应状态。

阶段完成时：

- Cursor 可以选择和移动 Note；
- Cursor 与 Pencil 都可以从 Note 左右边缘 Resize；
- Pencil 仍只在空白 Grid 创建 Note，不从 Note Body 发起 Move；
- `Delete` 和 `Backspace` 可以原子删除当前 Selection；
- Move / Resize 的 Pointer Move 只更新 Preview，Pointer Up 最多提交一次 Command；
- Note Move、Resize 与未来 Clip Move 使用同一套 Time Grid Snap 基础语义。

Velocity、Box Selection、Copy / Paste、Quantize Command、Looped Clip、Playback 和对象间
磁性 Snap 不属于本阶段。

## 1. Tool 与 Hit 优先级

### 1.1 Cursor

- 普通 Click Note Body：只选择该 Note；
- Shift、Command 或 Control + Click Note Body：切换该 Note 的 Selection；
- Drag Note Body：发起 Move；未选中的目标先成为唯一 Selection，再移动它；
- Drag 已选中的 Note：移动完整 Selection，所有 Note 保持相对 Tick 与 Pitch 间隔；
- Drag 空白区域在 Box Selection 实现前不产生框选或 Project 修改；
- Cursor 不在空白 Grid 创建 Note。

### 1.2 Pencil

- Click 空白 Grid：继续按第四阶段规则创建 Note；
- Click 或 Drag Note Body：不发起 Move，也不创建重叠 Note；
- Note Edge Hit 是 Pencil 的明确例外：左右边缘均可发起 Resize；
- Pencil Resize 完成后保持 Pencil 激活，便于继续输入；
- Pencil 不因 Resize 自动切换成 Cursor。

### 1.3 Hit 优先级

同一 Pointer 位置最多解析为一个编辑意图，优先级固定为：

1. Note Left Resize Edge；
2. Note Right Resize Edge；
3. Note Body；
4. 空白 Grid。

Resize Edge 必须属于 Note DOM / Renderer-neutral Hit 结果，而不是 Studio 组件临时读取
`event.target` 后直接修改 Project。边缘热区需要在视觉宽度很小时保持可操作，但精确 CSS
Pixel 宽度在 Resize 批次结合实际界面审查确定。左右热区重叠时不得同时激活两个方向。

## 2. Batch 1：Selection 删除

### 2.1 键盘行为

- Piano Roll 聚焦且 Selection 非空时，`Delete` 与 `Backspace` 都执行删除；
- 删除属于 Selection Action，不受当前 Pencil / Cursor Tool 限制；
- Piano Roll 未聚焦或 Selection 为空时不处理按键，不阻止其他有效快捷键作用域；
- Input、Textarea、Select 或 Contenteditable 获得输入焦点时不得触发；
- 一次按键只请求一次删除，不按 Note 数量重复分发 Action；
- Action 已启用后，即使 Project 拒绝 Command，也要阻止浏览器默认行为并显示错误 Toast。

### 2.2 原子 Project 语义

- 一个 Selection 使用一个 `RemoveNotesCommand`；
- Command 只接受同一个 MidiSource 中非空、无重复的 `NoteId` 集合；
- 单个 Note 删除使用一元素 `noteIds`，不另设语义重叠的单 Note Command；
- Preparer 在建立 MutationPlan 前验证全部 Note；任一 Note 缺失则整个 Command 失败；
- N 个 Note 产生 N 条 Note Remove Mutation 和 N 条 Delta Change，但只推进一次
  ModelRevision；
- 整个删除只形成一个 Commit、一个 dirty 内容状态和一个 Undo History 步骤；
- 不允许 Studio 循环执行 N 个单 Note Command 来模拟多选删除。
- 本批只建立专用的原子多 Note 删除，不建立通用 Batch / Composite Command，也不提前定义
  多 Note Move、Resize 或跨 MidiSource 批处理。

### 2.3 Selection、History 与失败

- Commit 发布后，Editor Session 通过权威 Query 清理已不存在的 Selection；
- UI 不在 Command 成功前预先清空 Selection，也不伪造 Note 消失；
- Undo 一次恢复完整 Note 集合，但不恢复已失效的旧 Selection；
- Redo 一次再次删除完整集合；
- 删除失败时 Project、History、dirty 和 Selection 保持不变；
- 失败通过应用级命令式 Toast 显示，不能只输出 Console。

## 3. Batch 2：Time Grid Snap V1 与 Cursor Move（已实现）

Move 实现前补齐交互所需的 Snap，而不是一次性建设全部对象 Snap：

- Note Move 使用 Absolute Grid Coordinate Snap；
- 无论 Note 原本是否落在 Grid 上，都以拖动后的目标时间坐标解析最近 Grid 坐标；
- 开启 Snap 后，导入、关闭 Snap 移动或 Grid Resolution 变化形成的 Off-grid Note 会在
  下一次拖动时进入当前 Grid，不保留旧 Resolution 或自由移动产生的 Timing Offset；
- 多选 Move 以一个稳定 Anchor 解析 Delta，再把同一 Delta 应用于全部 Note；
- 多选 Move 是一次 Selection 产品意图，不通过多次执行单 Note Command 实现；
- Pitch 使用离散 Semitone Delta，不进入 Timeline Snap；
- Snap Off 使用整数 Tick Delta；
- Pointer Update 只更新冻结 Preview，不执行 Project Command；
- Pointer Up 只提交一次 Move Intent，Cancel / Escape 恢复原始视觉；
- Move 越界时采用整体 Selection 的合法 Delta 范围，不逐 Note Clamp。

最终产品规则：

- Cursor 在 Note Body 上越过 4 CSS Pixel Threshold 后进入 Move；未越过时仍按普通
  Click / Modifier Click 处理 Selection；
- 拖动已选 Note 移动完整 Selection；拖动未选 Note 只预览该 Note，提交成功后才把它设为
  唯一 Selection，取消或失败不提前改写 Selection；
- Pointer Down 冻结 Project `baseRevision`、Note Record、Selection、Viewport、Grid、
  Snap Preference、Hit 与 origin modifiers；手势中途改变 Preference 不改变本次结果，
  Project revision 变化则
  Pointer Up 的 Command 作为 stale intent 整体拒绝；
- Anchor 的原始 Clip-local Tick 与 Pointer Delta 先形成绝对目标坐标，再由本次手势冻结的
  Grid Origin 和 Grid Resolution 解析最近 Grid 坐标；Off-grid Anchor 不采用相对
  Delta Snap；
- 当前 modifiers 在捕获期间保持动态；拖动中按下 `Alt` 会立即临时绕过 Snap，松开后立即
  恢复按本次冻结 Grid 的绝对坐标吸附；Snap Preference 本身不改变；
- Y 轴按 Pitch Row 解析共享 Semitone Delta，不使用 Timeline Grid；
- Preview 使用冻结数据和同一共享 Delta，不写 Project；Snap 开启时显示 Anchor Guide；
- Tick 边界是全部 Note 在 MidiSource 内合法区间的交集，Pitch 边界是全部 Note 在
  0–127 内合法区间的交集；到达边界时整体 Clamp，不允许部分 Note 停留；
- Pointer Up 的非零结果执行一个 `MoveNotesCommand`；零 Delta 不产生 Commit；
- `pointercancel`、lost pointer capture、Clip 切换、组件释放或聚焦 Piano Roll 的
  `Escape`，以及 Window blur 都清理未提交 Preview，且不写 Project；
- 提交失败清理 Preview、保留原 Project / History，并通过命令式 Toast 提示；
- 成功提交后继续显示最终 Preview，直到权威 Note Read Model 到达对应 revision，避免短暂
  回跳；随后重新读取 Project Facts。

Batch 2 已审查并实现 `MoveNotesCommand` 的 Delta、No-change、边界与 Change 协议。
一元素集合与旧单 Note 行为语义等价，因此集合协议已经取代旧的绝对目标
`MoveNoteCommand`。通用准则见
[Project Command 集合与事务语义](../../project-core/docs/project-command-collection-semantics.md)。

对象边缘、Marker、播放头和 Loop 边界仍不是 Snap Target。

## 4. 独立批次：Pointer Interaction State Machine Foundation

在 Resize 增加更多 hit zone 与分支前，先把现有 Click、Pencil Add 和 Note Move 接入同一个
Surface-scoped Interaction Session：

- 使用精确版本 `xstate@5.32.5` core 表达 pressing、moving、committing、
  awaiting-authority 与 cancel；
- XState 只作为 `@seele-daw/editor/common` 内部实现，Studio 只消费 Seele DAW 自有 State、
  Input 和 Intent；
- Browser Adapter 继续拥有 DOM Event、Pointer Capture、Window blur 与动态 Modifier
  transport；
- 具体 Select、Placement 与 Move 算法继续是独立纯函数，不合并成万能 machine；
- Pointer Up 最多产生一个业务 Intent，Project Command 仍由 Studio Coordinator 执行；
- Commit 成功后保留 Preview 到权威 Read Model revision，取消后的迟到 Pointer Up 无效。

完整决定见
[Piano Roll Pointer Interaction 状态机决策](./piano-roll-pointer-interaction-state-machine-decision.md)。

## 5. Batch 3：Cursor / Pencil Resize

- 左边缘 Resize 改变 Start 与 Duration，右边缘只改变 Duration；
- 两种 Tool 使用相同 Resize Intent、Preview、Command 和 Snap 规则；
- Resize 不改变 Pitch、Velocity、Channel 或 Note ID；
- 最终 Duration 必须为正 Tick，不能产生零长或负长 Note；
- 多选 Resize 是否按比例缩放不在首批范围；首批只 Resize 一个明确命中的 Note；
- Pointer Update 不提交，Pointer Up 最多提交一次；
- 左右边缘分别选择自己的 Snap Anchor，不能隐式继承 Pencil Create 的 `floor`；
- Resize 失败保留原 Note、Selection 和当前 Tool。

首批 Editor Resize 的完整产品规则如下：

- Pointer Down 必须明确命中 `resize-start` 或 `resize-end`；Edge Hit 优先于 Note Body，
  Cursor 与 Pencil 共享同一 Resize Gesture；
- Pointer 未越过 4 CSS Pixel Drag Threshold 时不进入 Resize。Cursor 的 Edge Click 仍按普通
  Note Click 解析 Selection；Pencil 的 Edge Click 不创建 Note，也不改变 Project；
- 左边缘固定原始 End，改变最终 Start / Duration；右边缘固定原始 Start，只改变最终
  Duration；两者都不改变 Note ID、Pitch、Velocity 或 Channel；
- Snap 开启时，正在拖动的 Edge 使用当前冻结 Grid 的 `nearest` 绝对坐标，不使用 Pencil
  Create 的 `floor`，也不保留 Off-grid Edge 的旧偏移；
- 手势期间按下 `Alt` 会动态临时绕过 Snap，使用最近整数 Tick；松开后立即恢复冻结 Grid 的
  绝对坐标吸附；
- Resize 以整个 MidiSource 的 `0 ... sourceLengthTick` 为事实边界，并 Clamp 到至少 1 Tick；
  当前 Clip 只是编辑窗口，Preview 会按 Clip 可见区裁剪，不把 Clip 边缘误当成 Source 边界；
- 即使 Resize 后的 Note 完全离开当前 Clip，Preview 仍保留 `resizedNoteId` 和最终
  Start / Duration，供 Pointer Up 形成确定 Intent，只是可见 Note 投影为 `null`；
- Pointer Down 冻结 Project `baseRevision`、命中的权威 Note、Edge、Selection、Viewport、
  Grid 与 Snap Preference；Pointer Update 只计算冻结 Preview，不写 Project；
- Resize 未选中的 Note 时，成功提交后才把它设为唯一 Selection；Resize 已选中的 Note 时
  保留现有 Selection。取消、No-change 或失败均不提前改变 Selection；
- Pointer Up 最多产生一个单 Note Resize Intent；Project Commit、No-change、失败和权威
  revision 交接由 Studio 在 Batch 3C 接通；
- `pointercancel`、lost capture、Window blur、Escape、Clip 切换与 dispose 都沿用共享
  Interaction Session 的取消语义，清理 Preview 且不提交。

Batch 3A 已在 Project Core 建立单 Note `ResizeNoteCommand`：Command 使用最终 Start /
Duration，不携带 Edge 方向；正 Duration、Source 边界、No-change、单条 Note Update Delta
及 Undo / Redo 已形成权威协议，对应提交为 `0564669`。它仍只是内部就绪能力，尚无 Studio
入口。

Batch 3B 已在 Editor Common 实现左右边界纯算法、Resize Preview、Snap Anchor、Resize
Intent，以及 `resizing-note / committing-note-resize` Interaction Session 分支。它只消费
Renderer-neutral Edge Hit，当前仍没有 Browser Edge Hit 或用户可见入口。Batch 3C 再接入
Browser Edge Hit、Pointer 生命周期、Studio Coordinator、Toast 和可见闭环。该拆分避免
Core 知道左右 Edge，也避免在命中热区确定前把浏览器细节写入领域协议。

## 6. Snap 完成时机

当前 `floor` 与 `nearest` 是交互内部策略，不是用户可选模式。用户界面继续只暴露 Snap
开关和 Grid Resolution。

Time Grid Snap V1 在 Batch 2 随 Note Move 实现；在 Note Move、Note Resize 和 Clip Move
三个真实消费者都完成后，再整理和封版跨 Surface 的 Interactive Snap V1。吸附到 Note /
Clip 边缘、播放头、Marker、Loop 或 Guide 的 Advanced Snap，必须等对应对象和交互真实存在
后再设计优先级、阈值与视觉反馈。

Snap 只约束实时创建与拖动；Quantize 是修改既有 Note Timing 的 Project Command，二者不能
混为同一个系统。

## 7. 实施与验收顺序

1. Batch 1A：Project Core 多 Note 原子删除 Command、Commit、Delta 与 History。
2. Batch 1B：Studio Coordinator、Delete / Backspace Action、Selection 校准与 Toast。
3. Batch 2A：Absolute Time Grid Coordinate Snap、Move Intent 和纯逻辑边界。
4. Batch 2B：Cursor Move Hit、Preview、Pointer 生命周期与一次提交。
5. 独立批次：Pointer Interaction State Machine Foundation。
6. Batch 3A：Project Core 单 Note Resize Command、Delta 与 History。
7. Batch 3B：Editor Common 左右边界算法、Preview、Snap 与 Interaction Session 分支。
8. Batch 3C：Browser Edge Hit 与 Studio 可见 Resize 闭环。

每个独立批次完成测试和用户审查后再进入下一批。性能优化继续由真实 DOM Note 基准驱动，
不因 Move / Resize 提前迁移到 Canvas Note Renderer。
