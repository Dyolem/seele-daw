# Piano Roll Note Creation 第四阶段计划

> Status: In progress; Batches 1–2 accepted, Batch 3 implemented and awaiting review
>
> Date: 2026-07-28

## 阶段目标

第四阶段把已经可选择的 Piano Roll 推进为能够创建 MIDI Note 的最小写入闭环，并建立
Pencil / Cursor Tool 与 Timeline Grid Snap 的稳定边界。

阶段完成时，用户能够：

- 看见并明确选择 Pencil 或 Cursor；
- 使用默认 Pencil 在空白 Piano Roll Grid 创建 Note；
- 开启或关闭 Snap，并使用初始 `1/16` Grid；
- 使用 Cursor 完成现有 Note Selection，但不能修改 Note；
- Undo / Redo、保存并恢复新建 Note。

本阶段不实现 Delete、Move、Resize、Velocity 编辑、Box Selection、拖动连续绘制、
Hover Ghost、Zoom / Scroll 或 Playback。

## 1. Tool 产品规则

### 1.1 显式 Tool

- Piano Roll Ready 时必须同时显示 `Pencil` 与 `Cursor` 两个独立按钮；
- 用户可见名称固定为 Pencil 和 Cursor；
- 内部 Tool ID 使用 `pencil` 与 `cursor`，不使用 `pointer`，避免与 Browser Pointer Input
  混淆；
- 两个按钮必须提供文字可访问名称，并通过 `aria-pressed` 或等价 pressed state 明确当前
  Tool；
- 任意时刻只能有一个 Tool 处于激活状态；
- Studio 首次创建 Editor Tool Preference 时默认激活 Pencil；
- 用户主动切换 Tool 后，切换 Clip、关闭再打开 Dock、最小化、最大化或 Workspace
  Fullscreen 都不得擅自恢复默认 Tool；
- 当前阶段 Tool Preference 只在本次 Studio 应用生命周期内保留；刷新页面后重新使用默认
  Pencil；
- Tool 变化不属于 Project Fact，不产生 dirty，不进入 Undo / Redo、Snapshot、Checkpoint
  或 IndexedDB。

### 1.2 Cursor

Cursor 在本阶段只拥有基本 Selection：

- 普通主按钮 Click Note：只选择该 Note；
- Shift、Command 或 Control + 主按钮 Click Note：切换该 Note；
- 主按钮 Click 空白 Grid：清空 Selection；
- 聚焦 Piano Roll 后按 `Escape`：清空 Selection；
- 右键、非 Primary Pointer、Pointer Cancel 和越过 Drag Threshold 的手势：不改变
  Selection；
- Selection 只在 Pointer Up 且未越过 Drag Threshold 时确认；
- Cursor 不创建、移动、调整长度、删除或修改 Note 的任何 Project Fact；
- Cursor 上的 Drag 在对应 Move / Box Selection 产品切片实现前不产生业务结果；
- “Cursor 不能编辑 Note”是第四阶段边界，不提前决定未来 Move / Resize 是否继续归属
  Cursor 或使用独立 Tool。

### 1.3 Pencil

Pencil 在本阶段只创建 Note：

- Primary Pointer 主按钮 Click 空白 Grid：请求创建一个 Note；
- Click 必须在 Pointer Up 且未越过 Drag Threshold 时确认；
- Pointer Down、Pointer Update、Pointer Cancel 或 lost pointer capture 均不得提前创建；
- 右键、非 Primary Pointer、钢琴键盘、Ruler、Tool Button、Dock Header 或 Grid 外区域不得
  创建；
- Pencil Click 已有 Note：不创建、不切换 Selection、不修改已有 Selection；
- Pencil Drag：不创建，也不连续绘制；
- 创建成功后必须只选中新建 Note；
- 创建成功后 Pencil 必须继续保持激活，允许用户再次 Click 创建下一 Note；
- 创建失败后 Tool、已有 Selection 和 Project 内容必须保持不变；
- 创建失败必须显示可理解的错误反馈，不能只写入 Console；
- Pencil 与 Cursor 之间切换时，已有有效 Selection 保持不变并继续显示；
- Pencil 激活时 `Escape` 仍可清空已有 Selection，但不得改变当前 Tool。

## 2. Timeline Grid 与 Snap

### 2.1 Grid 定义

- 第一版 Grid 原点为 Clip-local Tick `0`；
- 初始 Subdivision Span 为 `PROJECT_PPQ / 4`，即 `1/16` Note；
- Bar、Beat 与 Subdivision 必须使用正 Tick，并形成整除嵌套；
- Canvas 可见 Grid 与交互 Snap 必须消费同一 Common Grid 定义；
- Renderer 可以因像素密度省略不可辨识的 Subdivision Line，但省略绘制不得改变实际 Snap
  Span；
- Grid、Snap 开关和 Tool 都不是 Project Fact。

### 2.2 Snap 开启

- Snap 默认开启；
- Pointer X 首先转换为连续的 Clip-local Tick Position；
- 连续 Position 吸附到距离最近的 Subdivision Grid Boundary；
- 正好位于两个 Boundary 中点时，选择时间上更晚的 Boundary；
- Snap 运算只解析 Timeline Tick，不读取 DOM、CSS Pixel、Vue Event 或 ProjectSession；
- Grid Common 只返回候选 Tick，不负责 Clip / Source 上界裁剪；
- Note Create、Note Move、Clip Move 等调用者分别负责自己的合法范围和边界产品规则；
- 第一版不实现吸附到 Note 边缘、Clip 边缘、播放头、Selection、Guide 或其他对象的磁性
  Snap。

### 2.3 Snap 关闭

- Snap 关闭时，创建起点来自 Pencil 实际 X 对应的连续 Clip-local Tick Position；
- Project Fact 只能保存整数 Tick，因此连续 Position 必须四舍五入到最近的整数 Tick；
- 正好处于半 Tick 时选择时间上更晚的整数 Tick；
- 关闭 Snap 只影响 X / Timeline，不改变 Pitch 解析；
- 关闭 Snap 不允许保存负 Tick、非有限数或超出安全整数范围的 Tick。

### 2.4 Pitch

- Pointer Y 不进入 Timeline Grid Snap；
- Y 直接映射到其覆盖的离散 MIDI Pitch Row；
- 黑键行和白键行使用相同的一行一个 Semitone 规则；
- Y 位于 Row 内的具体比例不改变 Pitch；
- Surface 外 Y、Bottom Edge 之外或无效坐标不得创建 Note。

## 3. Note 创建事实

- Note 起点先按 Snap 设置得到 Clip-local Start Tick，再映射为 Source-local Tick；
- 初始 Note Duration 为一个当前 Subdivision Span；
- 创建结果不得越过当前非循环 Clip 的 Source 时间窗口；
- 若 Clip 剩余时间小于一个 Subdivision，Duration 缩短到剩余的正 Tick；
- 若候选起点落在 Clip End，创建策略必须把它限制到仍能容纳正 Duration 的最后合法位置；
- 默认 Velocity 为 `100`；
- 用户界面 Channel 为 `1`，Project Fact 使用零基 `MidiChannel(0)`；
- Pitch 来自 Pointer Y 覆盖的 Pitch Row；
- Note ID 由 Studio 应用身份源生成，不能从时间、Pitch 或数组长度派生；
- 一次 Pencil Click 最多执行一个 Add Note Command 和一个 Project Commit；
- Core 继续允许 Note 时间范围重叠；本阶段不增加全局去重或重叠禁止规则；
- 点击已有 Note 已由 Hit 规则阻止 Pencil 创建，但不能把这一 UI 行为误写成 Core 不变量。

## 4. 成功、失败与 History

### 4.1 成功

- Command committed 后 Project 变为 dirty；
- 新 Note 必须由 Project Query / Subscription 重新进入 Read Model，UI 不直接伪造权威
  `MidiNoteRecord`；
- 创建结果返回稳定 `NoteId`，Editor Session 使用该 ID 执行 `selectOnly`；
- Scene 随 Editor State 与 Read Model 更新显示 Selected Border / Glow；
- 显式 Save 后 Note 进入 Checkpoint 与 Project File；
- 新建 Note 的 Selection、Tool 和 Snap Preference 不进入持久化内容。

### 4.2 Undo / Redo

- Undo Add Note 会移除该 Note；
- Editor Session 通过权威 Commit / Query 清理已经不存在的 Selection；
- Redo 恢复 Note Project Fact，但不自动恢复旧 Selection；
- Undo / Redo 不改变 Pencil / Cursor、Snap 开关或 Grid Size；
- 每次 Pencil 创建是独立的一步 History；本阶段不合并连续绘制事务。

### 4.3 失败

- Active Project、Clip、MidiSource 或 Note Partition 不可用时必须失败关闭；
- 身份冲突、Revision 竞态、范围非法或 Command failure 不得产生部分 Mutation；
- 失败不得选择一个未提交的 Note ID；
- 失败不得改变 Tool、Snap、Grid 或已有 Selection；
- UI 必须通过 Studio Toast 或同等级可访问反馈解释失败；
- 捕获错误不能把 ProjectSession、Command 或业务失败转换成伪成功。

## 5. 状态所有权

- ProjectSession：Note Facts、Commit、History、dirty 与内容身份权威；
- PianoRollEditorSession：当前 Clip 的稳定 `NoteId` Selection；
- Studio Editor Preference Store：当前 Tool、Snap Enabled 与 Grid Preset；
- Editor Common：Grid、Snap、坐标和 Tool Input 的框架无关规则；
- Browser Adapter：DOM Hit、Pointer Capture 与 Surface-local CSS Pixel；
- Studio Coordinator：Active Project 校验、Note ID、产品默认值与 Command 执行；
- Renderer / Scene：可丢弃视觉投影。

Studio Editor Preference Store 使用 Pinia 是因为该状态轻量、可重建、跨 Clip UI 共享且不持有
Project 权威或资源。Selection 继续留在 Editor Session，因为它与当前 Clip、权威 Note Query
和资源生命周期绑定。

## 6. 实施批次

### Batch 1：Timeline Grid Snap Common

- 把 Piano Roll Grid 定义从 Browser 下沉到 Editor Common；
- Canvas Renderer 与未来 Snap 消费同一 Grid；
- Grid 明确 Origin、Bar、Beat 与 Subdivision；
- 实现 Snap enabled / disabled 的连续 Tick Position 解析；
- 明确 nearest、midpoint、非零 Origin、非法输入和 safe integer overflow；
- 不接 UI、不创建 Note。

### Batch 2：Project MIDI Note Coordinator

- Active Project / Clip / Source 校验；
- 接收已经由交互层解析的 Clip-local 内部起点与期望 Duration；
- Clip 尾部不足完整 Duration 时缩短到剩余正 Tick；
- Note ID 生成；
- Velocity 100 与 UI Channel 1 默认值；
- Add Note Command 执行；
- 返回 `noteId + commit`；
- Composition Root 与 Typed Vue Context。

Batch 2 对落在 Clip End 的输入失败关闭且不消耗 Note ID。Batch 4 的 Note Placement 必须先按
第 3 节规则把吸附到 End 的候选限制到最后合法内部位置，再调用 Coordinator；不得把 UI
边界选择偷偷固化为 Project Core 不变量。

### Batch 3：Studio Tool Preferences

- Pencil / Cursor、Snap Enabled、Grid Preset 的轻量 Pinia State；
- 默认 Pencil、Snap 开启、`1/16`；
- 动态状态保持规则与测试；
- 不提前显示无产品结果的控制。

首批只定义已经确认的 `1/16` Grid Preset，不在缺少产品决定时预建 `1/8`、`1/32`、
Triplet 或 Dotted 选项。Store 属于一次 Studio 应用生命周期：切换 Project、Clip 或 Dock
布局不会重置；页面刷新产生新的 Pinia 实例并恢复默认值。Canvas Grid 已消费 Store 解析出的
Subdivision Tick，但 Tool 与 Snap 在 Batch 4 可见闭环前不改变现有 Pointer 行为。

### Batch 4：可见 Add Note 闭环

- 同批显示 Pencil / Cursor 与 Snap 控件；
- Cursor 门控现有 Select Interaction；
- Pencil 解析空白 Click 与 Note Placement；
- 创建后权威 Read Model 更新并选中新 Note；
- Command failure Toast；
- Undo / Redo、Clip 切换、Dock 布局与可访问性测试；
- DESIGN、PRODUCT 与验证基线更新。

## 停止点

每个 Batch 完成生产模块、测试和对应文档后停止审阅。第四阶段完成前不接 Delete、Move、
Resize、Velocity、Box Selection、连续 Pencil Drag、Hover Ghost、Zoom / Scroll 或 Playback。
