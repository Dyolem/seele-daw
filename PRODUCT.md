# Seele DAW 产品功能手册

> 状态：当前产品行为的权威记录
>
> 首次基线：2026-07-27，功能代码截至 `ea1f7f5`
>
> 最近更新：2026-07-29，功能代码截至 `df4cdf3`
>
> 当前待审：无
>
> 适用范围：Studio 用户流程、Project Core 已接入能力及明确的产品限制

本文档记录 Seele DAW **现在能够做什么、用户如何操作、产品必须保持哪些行为，以及哪些界面仍只是占位**。它是功能开发、验收和回归测试的共同依据。

视觉语言由 [DESIGN.md](DESIGN.md) 约束；代码分层与依赖方向由架构文档约束。实现计划只解释某一阶段如何落地，不替代本文档描述的当前产品事实。

## 1. 文档状态约定

所有功能使用以下四种状态，避免把底层能力误认为已经交付的产品功能。

| 状态 | 含义 |
| --- | --- |
| **用户可用** | 已有可见入口，主流程可以完成，并有相应自动化验证。 |
| **局部可用** | 界面或流程已经存在，但仍有明确未接通的控制或子能力。 |
| **内部就绪** | Core、应用服务或浏览器适配器已经实现并验证，但用户还不能从产品 UI 使用。 |
| **尚未实现** | 只有产品方向、占位界面或未来需求，不得当作现有功能宣传或依赖。 |

功能编号在后续迭代中保持稳定。功能扩展应更新原条目；只有形成独立用户意图时才新增编号。

## 2. 当前产品范围

Seele DAW 当前是一款面向桌面浏览器、数据保存在本地浏览器内的 Web DAW。现阶段已经形成以下闭环：

1. 在 Project Entry 新建空项目，或打开最近保存的项目。
2. 在 Workbench 创建 Instrument Track。
3. 在 Instrument Track 的目标小节创建、选择并打开空 MIDI Clip。
4. 在 Context Editor Dock 使用 Pencil 创建 MIDI Note，或用 Cursor 选择、切换、拖动和
   清空 Note Selection。
5. 在 Piano Roll 聚焦时使用 `Delete` / `Backspace` 原子删除完整 Note Selection。
6. 通过 Undo / Redo 撤销或恢复 Track、MIDI Clip 与 MIDI Note 创建、移动、删除操作。
7. 显式保存项目。
8. 在应用内离开 dirty 项目时选择 Save、Discard 或 Cancel。
9. 刷新页面后，从 Recent projects 重新打开最近的有效 Checkpoint。

当前闭环还不包含 Piano Roll Note Resize、音源、音频输出或播放。

### 2.1 功能总览

| 编号 | 功能 | 状态 | 当前边界 |
| --- | --- | --- | --- |
| `PROJECT-ENTRY` | 项目入口与最近项目 | **用户可用** | 新建、最近项目列表、打开、失败重试。 |
| `PROJECT-LIFECYCLE` | 当前项目生命周期 | **用户可用** | Create、Open、Save、dirty 与 Session 生命周期。 |
| `PROJECT-NAVIGATION` | dirty 导航确认 | **用户可用** | 应用内导航支持 Save / Discard / Cancel。 |
| `WORKBENCH-SHELL` | DAW 工作台外壳 | **局部可用** | 全局栏、Transport、Arrangement、Track 区和编辑器 Dock 已成形。 |
| `PROJECT-HISTORY` | Undo / Redo | **用户可用** | 当前覆盖 Instrument Track、空 MIDI Clip 与 MIDI Note 创建 / 移动 / 删除。 |
| `TRACK-CREATE` | 创建 Instrument Track | **用户可用** | 只创建空的 Instrument Slot Track。 |
| `TRACK-SELECTION` | Track 选择 | **用户可用** | Track Header、Arrangement Lane、Inspector 和 Dock 联动。 |
| `MIDI-CLIP-CREATE` | 创建空 MIDI Clip | **用户可用** | 双击目标小节创建，支持 Clip 视觉、选择、打开与失败反馈。 |
| `CONTEXT-EDITOR-DOCK` | 上下文编辑器 Dock | **局部可用** | 可调整布局并显示所选 Clip 的 Piano Roll Selection Surface。 |
| `UI-FOUNDATION` | Piano Black UI 基础 | **用户可用** | 设计令牌、按钮、图标按钮、菜单、Dialog、Toast。 |
| `KEYBOARD-SHORTCUTS` | Scoped Keyboard Shortcuts | **局部可用** | Workbench Save / Undo / Redo 与 Piano Roll Escape / Delete / Backspace 已接入。 |
| `MIDI-NOTE-CORE` | MIDI Note 增删移动 | **用户可用** | Add、共享 Delta 的原子多 Note Move 与原子多 Note Remove 已接入 Piano Roll。 |
| `PLAYBACK` | 播放与 Transport 执行 | **尚未实现** | 控件仅展示且明确禁用。 |
| `PIANO-ROLL` | 钢琴卷帘编辑器 | **局部可用** | Grid / Note Renderer、Pencil Add、Cursor Selection / Move、多选 Delete、Snap 与 Undo / Redo 已接入。 |

## 3. 项目入口与生命周期

### 3.1 `PROJECT-ENTRY` 项目入口

**用户可用**

Project Entry 是当前启动页，提供：

- `Create new project`：创建新的本地项目。
- `Recent projects`：展示本浏览器中已有的项目，按最近一次成功保存时间倒序排列。
- 最近项目卡片：显示项目名称和最近保存时间，点击后打开对应项目。
- 加载、空列表、失败和重试状态。
- 无效项目地址、已不存在项目的提示，并返回可继续操作的项目入口。

当前产品规则：

- 项目数据只存在于当前浏览器、当前站点来源的 IndexedDB 中。
- 新建成功前必须先保存一个最小初始 Checkpoint。因此，只要完整完成一次新建流程，刷新后就应在 Recent projects 中看到该项目。
- 最近项目不依赖 Track、Clip 或 Piano Roll。空项目同样是合法的最近项目。
- 创建中的项目不可被重复创建；打开中的项目不可被重复打开。
- 项目入口当前使用 Piano Black 外观，但它不是编辑器核心体验的最终设计承诺。

### 3.2 `PROJECT-LIFECYCLE` 当前项目生命周期

**用户可用**

`ActiveProjectService` 是当前项目生命周期的唯一权威，负责：

- `create()`：内部生成 Project ID，创建名为 `Untitled Project` 的最小 Session，并在成功前立即保存初始 Checkpoint。
- `open(projectId)`：只打开已有项目，不把“找不到项目”解释为新建。
- `save()`：把当前 Session 保存为 Checkpoint，并更新 Recent projects 元数据。
- 管理 Idle、Creating、Opening、Ready 等阶段，以及保存中、保存失败等状态。
- 从 `contentStateId` 与 `savedContentStateId` 的相等性派生 dirty；不使用简单递增的 revision 判断内容是否已保存。

初始项目内容：

- 名称：`Untitled Project`。
- Tempo：120 BPM。
- 拍号：4/4。
- 不包含 Track、Clip、MIDI Source、Note 或 Device。

Workbench 全局栏会显示：

- 项目名称和 `Local project` 标识。
- `Saved`、`Unsaved changes`、`Saving…` 或 `Couldn’t save`。
- dirty 时可用的 Save 按钮。
- 保存失败后的 `Retry save` 入口和失败信息。

当前没有项目重命名、删除、复制、导入或导出 UI。

### 3.3 本地保存与恢复

**用户可用，浏览器适配层内部完成**

浏览器存储使用 IndexedDB 数据库 `seele-daw`，当前 Schema 版本为 V1，包含：

| Object Store | 用途 |
| --- | --- |
| `projectCheckpoints` | 保存不可变 Project Checkpoint。 |
| `projectCheckpointHeads` | 记录每个项目的 active / previous Checkpoint 候选。 |
| `projectCatalog` | 保存 Recent projects 所需的项目摘要与 `lastCheckpointSavedAt`。 |

保存与恢复规则：

- Checkpoint、active / previous 指针与最近项目元数据在同一事务中更新。
- 每个项目保留 active 与 previous 两个恢复候选，淘汰更早的 previous。
- 打开项目时优先恢复 active；候选损坏或不合法时，可继续验证 previous。
- Core 会解码、校验完整模型不变量，再创建 Session；不能恢复的项目必须失败关闭，而不是加载部分损坏状态。
- 清除站点数据、更换浏览器或使用不同浏览器配置文件后，项目不会自动出现。
- 当前没有云同步、文件备份、自动保存、Journal 或多标签页冲突协调。

## 4. 应用内导航

### 4.1 `PROJECT-NAVIGATION` 路由

**用户可用**

当前稳定路由：

| 地址 | 用途 |
| --- | --- |
| `/` | Project Entry。 |
| `/projects/new` | 执行新建项目流程。 |
| `/projects/:projectId` | 打开指定项目 Workbench。 |

Route 只负责表达产品意图；Create、Open、Leave 的具体生命周期由应用层 Coordinator 处理。

### 4.2 dirty 导航确认

当用户通过应用内路由离开 dirty 项目、打开其他项目或创建新项目时，显示全局确认 Dialog：

- **Save**：保存成功后允许本次导航；保存失败则继续停留在当前项目。
- **Discard**：只授权本次导航，不提前把当前项目标记为 clean，也不清空 History。
- **Cancel**：拒绝导航并停留在当前项目。

并发与竞态规则：

- 一次许可只对确认请求观察到的 `ProjectContentStateId` 有效。
- 内容从 B 变为 C 后必须重新确认。
- 内容从 B 变为 C，再 Undo 回 B 时，可以复用原先针对 B 的决定。
- UI 同时只显示一个 pending request；新请求会 Cancel 旧请求。
- Dialog 必须使用自己渲染的 pending capability resolve，陈旧 Dialog 不能解决新请求。

当前仅保护应用内 Router 导航。关闭标签页、刷新页面和浏览器退出尚未接入 `beforeunload` 提示。

## 5. Workbench

### 5.1 `WORKBENCH-SHELL` 工作台外壳

**局部可用**

Workbench 已建立真实项目状态驱动的布局：

- Global Bar：项目菜单、品牌、项目名称、保存状态与 Save。
- Transport Bar：Undo / Redo、Tempo、拍号、播放区和 MIDI Editor 开关。
- Arrangement：Track 控制区、时间标尺、Track Lane 和 Add Track。
- Context Editor Dock：Track Inspector 与未来 MIDI Editor 宿主。

项目菜单当前提供：

- `Projects`：返回项目入口，dirty 时触发导航确认。
- `Save` / `Retry save`：与全局 Save 使用同一保存能力。
- `MIDI editor`：重新打开已关闭或最小化的 Context Editor Dock。

桌面布局要求至少 900 px 宽。更窄的视口显示说明与 `Back to projects`，不展示编辑工作区。

以下控件目前只是诚实占位，必须保持禁用或明确显示不可用：

- Return to start、Play、Record、Loop。
- 当前播放时间和输出电平只显示默认值，不代表真实运行状态。
- Grid、Arrangement Zoom、Track options。
- Track Mute、Solo 及其他通道控制。

### 5.2 `PROJECT-HISTORY` Undo / Redo

**用户可用**

- Transport 中 Undo / Redo 的可用状态直接来自当前 `ProjectSession`。
- 执行 Command 后可以 Undo；Undo 后可以 Redo。
- 执行新的分叉 Command 会使旧 Redo 分支失效。
- History 是 Session 本地状态，不保存到 Snapshot、Project File、Checkpoint 或 IndexedDB。
- 当前 Studio 中可直接产生的历史操作包括 Instrument Track、空 MIDI Clip、Pencil Add
  MIDI Note 与原子删除完整 Note Selection。
- Workbench 可使用 `Mod+Z` Undo、`Mod+Shift+Z` Redo；Windows 兼容 `Control+Y`。

### 5.3 `CONTEXT-EDITOR-DOCK` 编辑器 Dock

**局部可用**

Dock 已支持：

- 打开、关闭、最小化与恢复。
- 在 Docked 模式下拖动水平 Splitter 调整高度。
- 键盘 `Arrow Up` / `Arrow Down` 逐步调整，`Home` 到最小高度，`End` 到最大高度。
- 最大化到 Workbench 允许的 Dock 高度，再恢复之前高度。
- 在 Workbench Workspace 内全屏显示，再恢复之前高度。
- 根据当前 Track Selection 显示 Track 名称与类型。
- 根据当前 Clip Selection 显示 Clip 名称与所属 Track，并在创建或双击 Clip 时重新打开 Dock。

Dock 当前根据上下文显示：

- 未选择 Track 时的选择提示。
- 已选择 Track、但没有 MIDI Clip 时的空状态。
- 已选择 MIDI Clip 时的 Clip 摘要与可选择 Piano Roll。

Piano Roll 已能渲染真实 Grid 和 Note，提供 Pencil / Cursor、Snap 与基础 Selection，可
使用 Pencil 创建 Note、用 Cursor 拖动 Selection，并用 `Delete` / `Backspace` 删除
Selection；尚没有缩放、滚动、Resize 或 Velocity 编辑手势。

### 5.4 `KEYBOARD-SHORTCUTS` Scoped Keyboard Shortcuts

**局部可用**

当前 Workbench 支持：

- `Mod+S`：当前项目 dirty 且不在保存中时执行 Save；
- `Mod+Z`：当前 Session 可以 Undo 时执行 Undo；
- `Mod+Shift+Z`：当前 Session 可以 Redo 时执行 Redo；
- `Control+Y`：兼容 Windows 常用 Redo Binding。
- `Escape`：Piano Roll 正在拖动 Note 时取消本次 Move；否则在存在 Note Selection 时清空
  Selection。
- `Delete` / `Backspace`：Piano Roll 聚焦且存在 Note Selection 时原子删除完整
  Selection。

产品规则：

- `Mod` 在 macOS 对应 Command，在 Windows / Linux 对应 Control；
- Action 不可用时不执行，也不伪造业务结果；
- 普通 Input、Textarea、Select、Contenteditable 和 IME composing 默认不触发编辑快捷键；
- Scope 优先级为 Modal / Dialog → focused Piano Roll → Workbench → Global；
- 只有 enabled Action 实际处理时才阻止浏览器默认行为；
- Feature 离开时卸载自己的 Action，应用释放时统一清理剩余 Listener；
- 快捷键只调用现有 Save / History 权威，不保存 ProjectSession、dirty 或 History 副本。
- Feature 根据 Action ID 读取集中式默认 Keymap，不在页面组件中散落 Binding 字符串。

当前没有用户 Keymap、Shortcut Settings、Sequence 或 Command Palette。

用户 Keymap 的输入验证边界已经就绪，但可见设置面板尚未实现。未来无效输入必须在字段旁
显示错误并保留原 Binding；损坏或不兼容的持久化覆盖应回退默认值，不能让错误延迟到 Feature
注册时才以应用启动失败暴露。

## 6. Track

### 6.1 `TRACK-CREATE` Add Track

**用户可用**

点击 Arrangement 左侧的 `Add track` 会打开 New Track 菜单。菜单展示：

| Track 类型 | 当前状态 | 点击结果 |
| --- | --- | --- |
| Voice / audio | 尚未实现 | 显示开发中 Toast。 |
| Virtual instrument | 用户可用 | 创建 Instrument Track。 |
| Drum machine | 尚未实现 | 显示开发中 Toast。 |
| Sampler | 尚未实现 | 显示开发中 Toast。 |
| Guitar | 尚未实现 | 显示开发中 Toast。 |
| Bass | 尚未实现 | 显示开发中 Toast。 |

创建 Instrument Track 的产品规则：

- 追加到当前 Track 顺序末尾。
- 自动命名为 `Instrument N`，其中 N 是当前 Instrument Track 数量加一。
- 从固定八色 Palette 中随机选择颜色，并避免与相邻 Track 使用同一颜色。
- Track 颜色以十六进制 Project Fact 保存，可随 Checkpoint 恢复。
- 创建默认 unity gain、center pan、unmuted、unsoloed 的通道。
- 创建一个启用的 `seele.instrument-slot` Device，占位等待未来音源选择。
- Command 必须原子写入 Track、Device 与 Track Order；不能产生不完整 Track 图。
- 成功创建后项目变为 dirty，并可 Undo / Redo。
- 成功创建后自动选中新 Track。
- 创建失败时不产生部分状态，并显示错误 Toast。

固定 Track Palette：

| 色彩 | Hex |
| --- | --- |
| Violet | `#8B5CF6` |
| Blue | `#4F8CFF` |
| Cyan | `#16B8D4` |
| Green | `#23B26D` |
| Gold | `#D6A43B` |
| Orange | `#F27A3D` |
| Rose | `#E85474` |
| Magenta | `#C65AD9` |

“Virtual instrument” 当前只表示一个 Instrument Track 与空 Instrument Slot，不代表已经选择 Basic Synth、采样音源或 JSON 合成器，也不会发声。

### 6.2 `MIDI-CLIP-CREATE` 创建空 MIDI Clip

**用户可用**

在 Instrument Track 的 Arrangement Lane 中创建空 MIDI Clip：

- Arrangement 当前展示固定 8 小节，按项目起始拍号计算小节宽度。
- 双击 Lane 的目标空白小节创建 MIDI Clip；键盘用户聚焦小节后按 Enter 执行同一动作。
- Clip 起点吸附到双击位置所在小节的开头。
- 默认长度为一个小节；当前阶段按项目起始拍号计算小节长度。
- Clip 初始名称复制 Track 当前名称，但之后是独立 Project Fact，Track 改名不会隐式更新 Clip 名称。
- `color = null`，显示时继承 Track 颜色。
- 默认非静音、非循环，`sourceOffsetTick = 0`。
- 同一事务创建等长的空 MidiSource 和空 Note Partition。
- 每个 MidiClip 独占一个 MidiSource；不能产生孤立 Source 或共享 Source。
- 创建成功后自动选择新 Clip，并保持其所属 Track 为当前 Track。
- 双击已有 Clip，或聚焦 Clip 后按 Enter，只选择并打开它，不创建重叠 Clip。
- 数据模型继续允许 MIDI Clip 重叠；本次只限制默认创建手势，避免误操作。
- 创建行为必须进入 dirty、Undo / Redo、Checkpoint 和 Project File。
- 创建失败不能留下部分 Clip 图，并应在 Studio 显示错误 Toast。

Project Core 已建立 Add MIDI Clip Command、完整所有权图 MutationPlan、聚合 Delta、Undo / Redo 与 QueryIndex Partition 语义。Studio 已接通起始拍号小节吸附、产品默认值协调、身份分配、Composition Context、Clip Selection、Arrangement 双击创建、Clip 视觉和错误 Toast，已形成用户可用闭环。

当前 Arrangement Clip 视觉遵循 Piano Black：

- Clip 使用 Track 色的低明度背景与明确标题；
- Hover、Selected 和键盘 Focus 使用独立边界，Track 色不是唯一状态信号；
- Muted 同时降低饱和度并显示文字语义；
- Clip 超出当前固定 8 小节视窗的部分会被裁切，完全位于右侧的 Clip 暂不显示；
- 当前以 DOM 提供可访问按钮与原生命中检测；可变 Zoom、Scroll、大量 Clip 或高频交互进入前必须重新评估 Canvas。

### 6.3 `TRACK-SELECTION` Track 选择

**用户可用**

- 点击 Track Header 或对应 Arrangement Lane 小节会选择该 Track。
- Track Header 与 Lane 共享选中高亮。
- Track Inspector 和 MIDI Editor Dock 显示所选 Track 的名称和类型。
- 新建 Instrument Track 后自动选择它。
- 同一项目内，模型提交后只要所选 Track 仍存在，选择保持不变。
- 所选 Track 不存在时自动清除选择。
- 打开其他项目或离开当前项目时清除旧选择，不能把 Track ID 泄漏到另一个项目。

Selection 是轻量、可重建的 Workbench UI 状态：

- 只保存当前 Project ID、`selectedTrackId` 与 `selectedClipId`。
- 选择 Clip 会同时选择其所属 Track；直接选择 Track 会退出 Clip Selection。
- Clip 被撤销或移除时清除 Clip 身份，并尽可能保留仍存在的所属 Track。
- 不属于 Project Fact，不使项目变 dirty。
- 不进入 Undo / Redo、Snapshot、Project File、Checkpoint 或 IndexedDB。
- Project Track 的名称、颜色、类型等事实始终从当前 Session Snapshot 派生，不复制到 Pinia。

Vue 状态选择的完整规则见
[Vue State Composition Guidelines](apps/studio/docs/vue-state-composition-guidelines.md)。

## 7. UI 基础与设计语言

### 7.1 `UI-FOUNDATION` Piano Black

**用户可用**

当前 Studio UI 遵循 [Piano Black 设计语言](DESIGN.md)：

- 使用语义化 Design Tokens 表达 Surface、Text、Border、Control、State、Motion 与 Layer。
- 深色黑钢琴表面是默认基调，Track 色彩用于音乐内容身份，不充当全局品牌强调色。
- 图标统一从 Iconify 的 Fluent 图标集按需引入。
- 常规交互基于 Headless Primitive 与项目专属外观组合，不引入后台管理系统视觉。
- 核心产品模块继续保留应用语义，不把业务行为塞进通用 UI Primitive。

当前通用 UI Primitive：

- Button。
- Icon。
- Icon Button。
- Alert Dialog。
- Toast Region。
- Reka UI 驱动的 Dropdown Menu、Dialog 与 Toast 行为。

Toast 支持信息、成功、警告和危险语义，可自动关闭、手动关闭、使用 `F8` 聚焦通知区，并支持
Swipe dismiss。业务 Feature 通过应用级 Pinia Toast Store 的命令式
`info / success / warning / danger` 触发通知；根 `App` 只挂载一个声明式
`UiToastRegion`。通知通道采用 latest-message-wins 单槽语义，Dismiss 必须携带当前渲染消息
的 ID，陈旧 Dismiss 不能关闭新消息。

## 8. MIDI Note 与 Piano Roll 能力

### 8.1 `MIDI-NOTE-CORE`

**用户可用；Add、多 Note Move 与多 Note Remove 已由用户界面使用**

Project Core 已实现：

- Add MIDI Note Command。
- Move MIDI Notes Command；一元素列表用于单 Note Move，多元素列表用于原子
  Selection Move。
- Remove MIDI Notes Command；一元素列表用于单 Note 删除，多元素列表用于原子多选删除。
- Command validation、Mutation Plan、原子提交、Commit / Delta。
- Undo / Redo 及稳定的 Session-local `ProjectContentStateId`。
- Project Query、Query Index 和 Commit Subscription。
- Immutable Snapshot。

这些能力需要一个已经存在的 MIDI Clip 与 MIDI Source。Studio 的
`ProjectMidiNoteCoordinator` 校验 Active Project、Clip、MidiSource 与 Note Partition，把
Clip-local Tick 映射为 Source-local Tick，生成 Note ID，并使用 Velocity 100、UI Channel 1
执行 Add Note Command。Coordinator 返回 `NoteId + Commit`；尾部剩余时间不足期望 Duration
时只创建剩余的正 Tick。移动和删除时 Coordinator 对当前 Clip 的同一 MidiSource 分别执行
一个 `MoveNotesCommand` / `RemoveNotesCommand`，全部目标在建立 MutationPlan 前完成
验证。

Add 已由 Piano Roll Pencil 接入，多 Note Move 已由 Cursor Body Drag 接入，多 Note
Remove 已由聚焦键盘 Action 接入。

当前的“批量”能力仅指同一 MidiSource 内专用的原子多 Note Move / Remove：它不是通用
Batch / Composite Command 系统，也不包含多 Note Resize、混合 Command 或跨 MidiSource
批处理。这些语义必须由后续真实产品交互分别驱动。

Project Command 表达一次完整产品意图，最小事实变化由 Project Mutation 表达。需要一个
Undo 步骤的集合操作必须建立一个封闭 MutationPlan，不能由 Studio 多次执行单实体 Command
或使用 `Promise.all` 模拟事务。未来命令不会统一采用“批量包含单次”：只有当一元素集合与
单实体的验证、结果、失败、Delta 和 History 严格等价时，集合协议才可以取代单实体公共
协议。完整决定见
[Project Command 集合与事务语义](packages/project-core/docs/project-command-collection-semantics.md)。

### 8.2 `PIANO-ROLL` Selection Surface

**局部可用**

`@seele-daw/editor/common` 已提供：

- 非循环 MIDI Clip 与其 MidiSource 的稳定 1:1 编辑上下文；
- Clip-local Tick 与 Source Tick 的双向映射；
- 可见 Tick / Pitch / CSS Pixel Viewport；
- 不提前 Snap 的连续 X → Tick 位置换算；
- 视觉与交互共用的 Timeline Grid，以及 Snap 开启/关闭时的连续 Position → Tick 解析；
- 只接受完成空白 Click 的 Pencil Note Placement，以及 Clip End 的合法内部起点限制；
- 基于 Project Query 与局部 Subscription 的可见 Note Read Model；
- Commit 后重新 Query、Viewport 替换、Observer 隔离和 dispose 生命周期；
- Clip-scoped `PianoRollEditorSession`、冻结的稀疏 `NoteId` Selection；
- Selection 前的权威 Note Query，以及相关 Commit 后的存在性和 Clip 时间窗口校准。
- 冻结的 Cursor Move Gesture，以及 Grid-aligned Absolute Snap、Off-grid Relative
  Delta Snap、Pitch Semitone Delta 和 Selection 合法边界交集。

`@seele-daw/editor/browser` 与 Studio 已提供：

- DPR-aware Canvas Pitch / Grid Renderer；
- Renderer-neutral Note Scene、当前 keyed DOM Note Renderer 与可替换 Canvas Adapter；
- DOM / Canvas 共用的 selected Scene 事实，以及 Piano Black Selected Border / Glow；
- Surface 级 DOM Hit 委托，以及 Renderer-neutral Primary Pointer Input；
- Surface-local CSS Pixel、Pointer Capture、4 CSS Pixel Drag Threshold 和取消生命周期；
- 小节、拍、1/16 细分三级网格，以及密集级别抑制；
- DOM 标尺、MIDI 48–72 钢琴键盘、焦点与可访问 Note / Selection 摘要；
- Clip / Track Color Note 和 muted 视觉；
- 可见 Pencil / Cursor 单选工具、Snap Toggle 与当前 `1/16` Grid 标识；
- Docked、Minimized、Maximized 与 Workspace Fullscreen 布局复用；
- 选中 Clip、Project Query/Subscription、Design Tokens 与 Renderer 的显式组合；
- 普通 Click 单选，Shift / Command / Control Click 切换，空白 Grid Click 清空；
- 聚焦 Piano Roll 时使用 `Escape` 清空 Selection；
- 聚焦 Piano Roll 且 Selection 非空时使用 `Delete` / `Backspace` 原子删除全部选中
  Note；
- Click 只在 Pointer Up 且未越过 4 CSS Pixel Drag Threshold 时确认；
- 默认 Pencil 在空白 Grid 创建 Note；Snap 开启时 X 使用 Pointer 当前所在 Grid 单元的
  左边界，关闭时使用最近整数 Tick，Y 直接映射 Pitch Row；
- Pencil Click 已有 Note 与 Pencil Drag 不产生业务结果；
- 创建成功只选中新 Note、保留 Pencil，并由权威 Query / Subscription 更新可见内容；
- 创建失败保持原 Project、Tool 与 Selection，并显示可访问错误 Toast；
- Add Note 可 Undo；Redo 恢复 Note Fact，但不恢复已失效的旧 Selection；
- 多 Note Delete 只产生一个 Commit 和一个 History 步骤；Undo 恢复完整集合但不恢复旧
  Selection；
- Cursor 拖动已选 Note 时移动完整 Selection；拖动未选 Note 时只移动该 Note，并在成功
  后把它设为唯一 Selection；
- Pointer Down 冻结 Project revision、Note Facts、Selection、Viewport、Grid、Snap 与
  Modifier；手势期间 Project revision 改变时，Pointer Up 的 stale intent 整体拒绝；
- Pointer Move 只更新冻结 Preview；Snap 开启时显示 Anchor Guide，Pointer Up 的非零
  Delta 最多执行一个 `MoveNotesCommand`；
- Grid-aligned Note 吸附目标 Grid；Off-grid Note 吸附相对 Delta 并保留原 Timing Offset；
  `Alt` 只为 Pointer Down 时开始的本次手势临时绕过 Snap；
- 多 Note Move 使用共享 Tick / Pitch Delta 和全部 Note 合法边界的交集，不逐 Note Clamp；
- Move 成功后等待权威 Read Model 到达对应 revision 再移除最终 Preview，避免短暂视觉
  回跳；
- Pointer Cancel、Clip 切换、释放或 `Escape` 取消 Move，不写 Project；失败清理 Preview、
  保留原 Project / History 并显示 Toast；
- Move 只产生一个 Commit 和一个 History 步骤；Undo / Redo 原子恢复或重放完整 Selection；
- Clip 切换创建新的 Editor Session，不继承前一个 Clip 的 Selection。

Selection 只保存稳定 `NoteId`，属于当前 Clip Editor lifetime；它不进入 Pinia、Project
History、Snapshot、Checkpoint 或 IndexedDB。Note 移出当前可见 Viewport 时仍保持选中；
Note 被删除或移出当前 Clip Source 时间窗口时由权威 Query 清理。

当前明确限制：

- 不支持 looped Clip，不能把循环实例错误显示成非循环 Source；
- Grid Preset UI 当前只显示已确认的 `1/16`，尚不能选择其他直线、三连音或附点值；
- 首批视图固定显示完整 Clip 和 MIDI 48–72，尚无 Zoom / Scroll；
- 用户可以创建、选择、移动和删除 Note，但还不能通过 UI Resize 或编辑 Velocity；
- Cursor 与 Pencil 都将在 Note 左右 Edge Hit 上支持 Resize，当前尚未实现。

### 8.3 Project File 与 Checkpoint

**内部就绪**

Project Core 已具备：

- Project File Format V1 的内存 Projection。
- V1 Protocol 字段校准、Decoder、Validation 与 Session Loading。
- Storage-neutral Project Checkpoint 保存与恢复协调。

当前没有面向用户的 JSON 文件编解码、文件导入、文件导出或格式迁移 UI。

### 8.4 Package 状态

| Package | 当前能力 |
| --- | --- |
| `@seele-daw/project-core` | 项目模型、Command、Commit、Session、History、Query、Snapshot、Project File V1 与 Checkpoint。 |
| `@seele-daw/platform-browser` | IndexedDB V1 Checkpoint Store 与 Recent Project Catalog。 |
| `apps/studio` | 项目入口、生命周期、导航确认、Workbench Shell、Scoped Keyboard Shortcuts、Add Track、Arrangement 空 MIDI Clip 创建、Track / Clip Selection，以及 Piano Roll Pencil Add / Cursor Selection Move / 多选 Delete / Snap。 |
| `@seele-daw/editor` | 已提供 Piano Roll Clip / Viewport / Note Read Model、Timeline Grid Snap、Pencil Placement、Selection Session、Select / Move Interaction、Move Preview、Canvas Grid、DOM / Canvas Note Adapter、DOM Hit 与 Pointer Input。 |
| `@seele-daw/playback` | 只有包边界与入口骨架，未提供 Transport Runtime、Compiler 或 Scheduler。 |
| `@seele-daw/audio-web` | 只有包边界与入口骨架，未连接 AudioContext、AudioWorklet 或 Soundbank。 |
| `@seele-daw/type-utils` | 提供 `Brand`、`ValueOf` 等无运行时共享类型工具。 |

## 9. 明确尚未提供的产品能力

以下项目不得从现有占位 UI 或 Core 类型推断为已交付：

### 编辑与编排

- MIDI Clip 移动、复制、调整长度、拆分、删除或多选；当前只支持创建、单选与打开上下文。
- Piano Roll Note Resize 或 Velocity 编辑；当前支持 Pencil Add、Cursor Selection /
  Move 与多选 Delete。
- Arrangement 时间轴滚动、缩放、Grid 和 Snap。
- 框选与 Resize Preview；当前 Drag Preview 只覆盖 Cursor Note Move。
- Track 重命名、改色、删除、复制、重排。
- Track Mute、Solo、Gain、Pan 与更多 Channel 设置。

### 音源与声音

- `public/soundbanks` 中压缩资源的加载、解压、索引与音色选择。
- WAV / M4A 采样播放。
- JSON 合成器定义的解析与合成引擎。
- Instrument Slot 的真实 Device UI。
- Web Audio Graph、AudioWorklet、主输出与电平。
- 播放、暂停、定位、循环、录音与监听。

### 其他 Track 类型

- Voice / Audio Track。
- Drum Machine。
- Sampler。
- Guitar。
- Bass。

### 项目管理与可靠性

- 项目重命名、删除、复制。
- 文件导入、导出与用户可恢复备份。
- 自动保存与 Journal。
- `beforeunload` 刷新 / 关闭页面保护。
- 多标签页写入冲突协调。
- 云同步、分享与协作。

## 10. 产品不变量

后续功能实现不得破坏以下已经接受的规则：

1. `ActiveProjectService` 是当前项目生命周期权威；Pinia 不接管 Session、History、dirty、IndexedDB 或 pending Promise resolver。
2. Project Core 不知道“当前项目”、Vue、Router 或浏览器资源。
3. `platform-browser` 只实现浏览器 Adapter，不决定产品流程。
4. dirty 必须由内容身份与已保存内容身份比较派生。
5. Discard 只授权一次导航，不伪造 Save，也不清空 History。
6. `ProjectSession` 及其可变内部状态不进入 Vue 深代理。
7. Selection 等 UI 状态只保存身份；Project Facts 始终从 Snapshot 派生。
8. Track 颜色是持久化 Project Fact；随机选择只是创建时默认策略。
9. 普通 Clip 复制的长期产品语义是创建独立 MIDI Source 与新 Note 身份。
10. Move、Resize、Split 等编辑算法必须在对应 Command 实现前确定产品边界。
11. 未接通的控制必须禁用或明确提示不可用，不能制造功能已存在的错觉。

## 11. 功能交付与文档维护规则

本手册是每个产品切片 Definition of Done 的一部分。以后每个独立功能通过审查、准备提交时，应同时完成以下检查：

1. 更新“功能总览”中对应编号的状态与边界。
2. 在所属章节记录用户入口、操作步骤、成功结果、失败反馈和关键产品规则。
3. 如果功能接通了现有占位，必须从“尚未提供”清单移除或缩小对应限制。
4. 如果引入新的持久化事实，说明是否影响 dirty、History、Checkpoint 与兼容性。
5. 如果引入新的 UI 状态，说明它的所有者、生命周期、跨项目行为及是否持久化。
6. 如果改变既有行为，先更新产品不变量或记录明确替代规则。
7. 在“功能变更记录”追加日期、功能编号、状态变化和对应提交。
8. 运行与变更风险相称的测试；产品切片合入前仍以 `pnpm lint` 和 `pnpm check` 为完整验证入口。

记录原则：

- 只把已经实现并验证的行为标为“用户可用”或“内部就绪”。
- 未来设想放在“尚未实现”或独立规划文档，不混入当前操作说明。
- 文档描述产品语义，不复制组件内部实现细节。
- 用户审查后发生的产品决定，即使暂未开发，也要进入对应规划文档；实现完成后再迁入本手册。

## 12. 功能变更记录

| 日期 | 功能编号 | 变化 | 提交 |
| --- | --- | --- | --- |
| 2026-07-22 | `PROJECT-ENTRY`、`PROJECT-LIFECYCLE`、`PROJECT-NAVIGATION` | 完成 Active Project、IndexedDB Recent Projects、导航确认及 Composition Root 基础。 | `5ea1256` 阶段基线 |
| 2026-07-23 | `PROJECT-ENTRY`、`WORKBENCH-SHELL`、`UI-FOUNDATION` | 接入真实路由、Piano Black Project Entry、导航 Dialog 与 Workbench Shell。 | `cae096b`、`f205333`、`a841205` |
| 2026-07-24 | `TRACK-CREATE`、`UI-FOUNDATION` | 完成 Instrument Track Command、应用协调、Add Track 菜单与 Toast。 | `580884b`—`681880d` |
| 2026-07-27 | `TRACK-SELECTION` | 完成项目作用域 Track Selection、新建自动选择及 Workbench 联动。 | `ea1f7f5` |
| 2026-07-27 | 文档基线 | 首次汇总当前产品功能、内部能力、限制与持续维护规则。 | `f2abf53` |
| 2026-07-27 | `MIDI-CLIP-CREATE` | 确认创建交互与默认事实；Project Core 完成空 Clip 所有权图 Command、Delta、History 和 QueryIndex 语义。 | `6e6f6bb` |
| 2026-07-27 | `MIDI-CLIP-CREATE` | Studio 完成小节吸附、产品默认值协调、Composition Context 与 Clip Selection。 | `2f43690` |
| 2026-07-27 | `MIDI-CLIP-CREATE`、`CONTEXT-EDITOR-DOCK` | Arrangement 接入空 Clip 创建、视觉、选择、打开和错误反馈；Dock 显示 Clip 上下文。 | `99d9001` |
| 2026-07-27 | `PIANO-ROLL` | Editor Common 完成非循环 Clip Context、Viewport 坐标与 Query/Subscription Note Read Model。 | `15edc39` |
| 2026-07-27 | `PIANO-ROLL` | Editor Browser 完成 Canvas Grid、Note Scene 与 DOM / Canvas Adapter。 | `b888a78` |
| 2026-07-27 | `PIANO-ROLL`、`CONTEXT-EDITOR-DOCK` | Studio Dock 默认接入 keyed DOM Note 与真实 Project Query / Subscription。 | `f3778f0` |
| 2026-07-28 | `PIANO-ROLL` | Editor Common 完成 Clip-scoped Note Selection Session、权威存在性校准与第三阶段交互计划。 | `054377d` |
| 2026-07-28 | `PIANO-ROLL` | Editor Browser 完成 Surface 级 DOM Hit、Primary Pointer Capture、CSS Pixel Input 与 Drag Threshold。 | `007c24e` |
| 2026-07-28 | `KEYBOARD-SHORTCUTS` | Studio 完成 Scoped Action Coordinator、TanStack Browser Adapter，以及 Workbench Save / Undo / Redo Binding。 | `cdf9577` |
| 2026-07-28 | `KEYBOARD-SHORTCUTS` | 集中默认 Keymap、强类型 Binding 和动态输入 Validation；用户设置面板仍未实现。 | `378c253`、`659b8c4` |
| 2026-07-28 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS` | Studio 接入 Clip-scoped Note Selection、共享 selected Scene、Pointer Click 与 focused Escape。 | `f9d7fe7` |
| 2026-07-28 | `PIANO-ROLL` | 第四阶段显式定义 Pencil / Cursor、Snap、Note 创建结果与失败规则；Editor Common 建立共享 Timeline Grid Snap。 | `cc3bbb5` |
| 2026-07-28 | `PIANO-ROLL` | Studio 建立 Project MIDI Note Coordinator、默认 Note Facts、Clip / Source 校验与 Typed Vue Context；尚未接入可见创建手势。 | `df66936` |
| 2026-07-28 | `PIANO-ROLL` | Studio 建立应用生命周期级 Pencil / Cursor、Snap 与 `1/16` Grid Preference Store；Canvas Grid 消费同一 Preset。 | `67509d8` |
| 2026-07-28 | `PIANO-ROLL` | Editor Common 完成 Pencil Note Placement；Studio 接入可见 Tool / Snap、Add Note、创建后 Selection、失败 Toast 与 History 回归。 | `6cba7d2` |
| 2026-07-29 | `PIANO-ROLL`、`UI-FOUNDATION` | Pencil Snap 改为当前 Grid 单元左边界；Snap 沿用 Fluent Grid；Toast 改为应用级命令触发与单一声明式 Region。 | `1bc6dac` |
| 2026-07-29 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS` | 明确 Cursor Move、Cursor / Pencil Resize 归属；接入多 Note 原子删除、Delete / Backspace、Selection 校准与失败 Toast。 | `52dc03c` |
| 2026-07-29 | `MIDI-NOTE-CORE` | 单个与多个 Note 删除统一为数量无关的 `midi-note.remove` 集合协议，移除重叠的单 Note Command。 | `df4cdf3` |
| 2026-07-29 | `MIDI-NOTE-CORE`、`PIANO-ROLL` | Batch 5.2 统一共享 Delta 的 `MoveNotesCommand`；接入 Cursor Selection Move、Absolute / Relative Snap、冻结 Preview、Guide、Escape Cancel 与单 Commit / History。 | `待提交` |

## 13. 当前验证基线

Batch 5.2 审查候选已通过：

- `pnpm lint`。
- `pnpm check`，包括 Architecture、Workspace Type Check、全部测试与 Studio Production
  Build。
- Project Core：26 个测试文件，378 项测试。
- platform-browser：2 个测试文件，18 项测试。
- editor：8 个测试文件，80 项测试。
- Studio：38 个测试文件，203 项测试。
- type-utils：1 个测试文件，2 项测试。

后续功能完成时，测试数量可以增长；“全部验证通过”比固定数量更重要，但本节应保留最近一次可信基线。
