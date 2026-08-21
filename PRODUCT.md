# Seele DAW 产品功能手册

> 状态：当前产品行为的权威记录
>
> 首次基线：2026-07-27，功能代码截至 `ea1f7f5`
>
> 最近更新：2026-08-21，Standard MIDI File Import / Export V1 MI7 导入颜色已实施，待审核
>
> 当前阶段：Standard MIDI File Import / Export V1；MI1–MI6 已完成，MI7 分批实施中
>
> 适用范围：Studio 用户流程、Project Core 已接入能力及明确的产品限制

本文档记录 Seele DAW **现在能够做什么、用户如何操作、产品必须保持哪些行为，以及哪些界面仍只是占位**。它是功能开发、验收和回归测试的共同依据。

视觉语言由 [DESIGN.md](DESIGN.md) 约束；代码分层与依赖方向由架构文档约束。实现计划只解释某一阶段如何落地，不替代本文档描述的当前产品事实。

## 1. 文档状态约定

所有功能使用以下四种状态，避免把底层能力误认为已经交付的产品功能。

| 状态         | 含义                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| **用户可用** | 已有可见入口，主流程可以完成，并有相应自动化验证。                       |
| **局部可用** | 界面或流程已经存在，但仍有明确未接通的控制或子能力。                     |
| **内部就绪** | Core、应用服务或浏览器适配器已经实现并验证，但用户还不能从产品 UI 使用。 |
| **尚未实现** | 只有产品方向、占位界面或未来需求，不得当作现有功能宣传或依赖。           |

功能编号在后续迭代中保持稳定。功能扩展应更新原条目；只有形成独立用户意图时才新增编号。

## 2. 当前产品范围

Seele DAW 当前是一款面向桌面浏览器、数据保存在本地浏览器内的 Web DAW。现阶段已经形成以下闭环：

1. 在 Project Entry 新建空项目、从 Standard MIDI File 创建项目、打开最近保存的项目，或在
   Workbench 把 MIDI 文件追加为当前项目的新 Track。
2. 在 Workbench 创建默认选择 Studio Grand 的 Instrument Track；旧项目的空 Instrument
   Slot 可在 Inspector 中显式选择 Studio Grand。
3. 在 Instrument Track 的目标小节创建、选择并打开空 MIDI Clip。
4. 在 Context Editor Dock 使用 Pencil 创建 MIDI Note，或用 Cursor 选择、切换、拖动和
   清空 Note Selection；Cursor 与 Pencil 都可拖动 Note 左右边缘调整长度。
5. 在 Piano Roll 聚焦时使用 `Delete` / `Backspace` 原子删除完整 Note Selection。
6. 通过 Undo / Redo 撤销或恢复 Track、Instrument 选择、MIDI Clip 与 MIDI Note 创建、移动、
   缩放、删除操作。
7. 在 Vite 本地开发环境点击 Play 或按 `Space`，加载当前计划所需的 Studio Grand 采样并听见
   Note；可 Pause、继续、从 Arrangement Ruler 手动定位，并返回最后一次手动起始位置。
8. 显式保存项目。
9. 在应用内离开 dirty 项目时选择 Save、Discard 或 Cancel。
10. 刷新页面后，从 Recent projects 重新打开最近的有效 Checkpoint。

当前可听闭环使用 `apps/studio/public/soundbanks` 中开发者本机的 Studio Grand 验证资产；Vite
production build 仍禁止复制整棵 public，因此这个资产映射不是公开构建的可分发内置内容。没有
本地资产、保存了其他尚未配置 location 的 Sample Instrument，或浏览器拒绝 AudioContext 时，
Studio 会明确失败，不静默替换声音。

### 2.1 功能总览

| 编号                   | 功能                      | 状态         | 当前边界                                                                                                                          |
| ---------------------- | ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT-ENTRY`        | 项目入口与最近项目        | **用户可用** | 新建、最近项目列表、打开、失败重试。                                                                                              |
| `MIDI-IMPORT`          | Standard MIDI File 导入   | **用户可用** | 可创建独立 clean 项目，或把来源 Note Track 作为一个原子 History 步骤追加到当前项目；阻断错误与非阻断诊断均有反馈。                |
| `PROJECT-LIFECYCLE`    | 当前项目生命周期          | **用户可用** | Create、Open、Save、dirty 与 Session 生命周期。                                                                                   |
| `PROJECT-NAVIGATION`   | dirty 导航确认            | **用户可用** | 应用内导航支持 Save / Discard / Cancel。                                                                                          |
| `WORKBENCH-SHELL`      | DAW 工作台外壳            | **局部可用** | 全局栏、Transport、Arrangement、Track 区和编辑器 Dock 已成形。                                                                    |
| `PROJECT-HISTORY`      | Undo / Redo               | **用户可用** | 当前覆盖 Instrument Track、Instrument 选择、空 MIDI Clip 与 MIDI Note 创建 / 移动 / 缩放 / 删除。                                 |
| `TRACK-CREATE`         | 创建 Instrument Track     | **用户可用** | 新 Track 默认持久化选择内置 Studio Grand。                                                                                        |
| `INSTRUMENT-SELECTION` | 选择 Track Instrument     | **用户可用** | 显示 Studio Grand / Empty / Missing；旧空 Slot 可显式选择 Studio Grand。                                                          |
| `TRACK-SELECTION`      | Track 选择                | **用户可用** | Track Header、Arrangement Lane、Inspector 和 Dock 联动。                                                                          |
| `MIDI-CLIP-CREATE`     | 创建空 MIDI Clip          | **用户可用** | 双击目标小节创建，支持 Clip 视觉、选择、打开与失败反馈。                                                                          |
| `CONTEXT-EDITOR-DOCK`  | 上下文编辑器 Dock         | **局部可用** | 可调整布局并在 Track 全局时间轴与所选 Clip Focus Piano Roll 之间切换。                                                            |
| `UI-FOUNDATION`        | Piano Black UI 基础       | **用户可用** | 设计令牌、按钮、图标按钮、菜单、Dialog、Toast。                                                                                   |
| `KEYBOARD-SHORTCUTS`   | Scoped Keyboard Shortcuts | **局部可用** | Workbench Save / Undo / Redo / Play-Pause 与 Piano Roll Escape / Delete / Backspace 已接入。                                      |
| `MIDI-NOTE-CORE`       | MIDI Note 增删移动与缩放  | **用户可用** | Add、多 Note Move / Remove 与单 Note Resize 已接入 Piano Roll。                                                                   |
| `PLAYBACK`             | 播放与 Transport 执行     | **局部可用** | 本地开发环境可 Play / Pause / Return；播放中相关编辑按 Note / Track 选择性生效。Loop、完整 Seek / Scrub、Record、Meter 尚未实现。 |
| `TIMELINE-LOCATE`      | 手动时间线定位            | **用户可用** | Arrangement Ruler 支持点击 / 静默拖动、边缘自动滚动、键盘定位和最后起始位置 Return；不含可听 Scrub 或 Note Chase。                |
| `PIANO-ROLL`           | 钢琴卷帘编辑器            | **局部可用** | 默认 Track 全局 Surface、可选 Clip Focus、原子 Pencil 放置、Clip 内完整 Note 编辑、Snap 与 Undo / Redo 已接入。                   |

## 3. 项目入口与生命周期

### 3.1 `PROJECT-ENTRY` 项目入口

**用户可用**

Project Entry 是当前启动页，提供：

- `Create new project`：创建新的本地项目。
- `Import MIDI file`：选择一个 `.mid` / `.midi` 文件，完整解析后创建新的本地项目。
- `Recent projects`：展示本浏览器中已有的项目，按最近一次成功保存时间倒序排列。
- 最近项目卡片：显示项目名称和最近保存时间，点击后打开对应项目。
- 加载、空列表、失败和重试状态。
- 无效项目地址、已不存在项目的提示，并返回可继续操作的项目入口。

当前产品规则：

- 项目数据只存在于当前浏览器、当前站点来源的 IndexedDB 中。
- 新建成功前必须先保存一个最小初始 Checkpoint。因此，只要完整完成一次新建流程，刷新后就应在 Recent projects 中看到该项目。
- 最近项目不依赖 Track、Clip 或 Piano Roll。空项目同样是合法的最近项目。
- 创建中的项目不可被重复创建；打开中的项目不可被重复打开。
- Project Entry 的 MIDI 导入创建独立项目；读取、解码或 Project 映射失败时不创建 Catalog、
  Checkpoint 或活动 Session。
- SMF 内嵌名称优先；缺失时使用本地文件名。导入 Track 默认持久化 Studio Grand，Program / Bank 不
  静默选择尚未支持的音源。
- 导入成功后项目已有首个 Checkpoint，进入 Workbench 时为 clean；不能精确表示的来源事实以
  非阻断诊断摘要呈现。
- Workbench 项目菜单同时提供 `Import MIDI as new project` 与 `Import MIDI as new tracks`；
  Arrangement 末尾和空态使用后者，把来源 Note Track 追加为当前项目的新 Instrument Track。
- Workbench 先只读并完整验证所选文件，再针对此时最新的 dirty 项目完成 Save / Discard / Cancel
  确认后创建新项目。Cancel 或 Save 失败时保持当前项目，不产生 Catalog、Checkpoint 或活动
  Session 的部分状态；追加新 Track 不触发导航确认或自动保存。
- 新 Track 导入保留当前 Project ID、名称、既有内容、Tempo 与拍号；来源 Tempo / 拍号不参与该
  模式的校验或写入。整个文件只产生一个 Project Command / History 步骤，成功后项目变为 dirty、
  停留在当前路由并选中第一条导入 Track。
- 项目入口当前使用 Piano Black 外观，但它不是编辑器核心体验的最终设计承诺。

### 3.2 `PROJECT-LIFECYCLE` 当前项目生命周期

**用户可用**

`ActiveProjectService` 是当前项目生命周期的唯一权威，负责：

- `create()`：内部生成 Project ID，创建名为 `Untitled Project` 的最小 Session，并在成功前立即保存初始 Checkpoint。
- `createFromSession(session)`：接收调用方已完整验证的 Session，检查 Project ID 冲突，保存首个
  Checkpoint 后再激活。
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

当前没有项目重命名、删除、复制、MIDI 导出或 Seele Project File 导入 / 导出 UI。

### 3.3 本地保存与恢复

**用户可用，浏览器适配层内部完成**

浏览器存储使用 IndexedDB 数据库 `seele-daw`，当前 Schema 版本为 V1，包含：

| Object Store             | 用途                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `projectCheckpoints`     | 保存不可变 Project Checkpoint。                                 |
| `projectCheckpointHeads` | 记录每个项目的 active / previous Checkpoint 候选。              |
| `projectCatalog`         | 保存 Recent projects 所需的项目摘要与 `lastCheckpointSavedAt`。 |

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

| 地址                   | 用途                     |
| ---------------------- | ------------------------ |
| `/`                    | Project Entry。          |
| `/projects/new`        | 执行新建项目流程。       |
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

- Global Bar：项目菜单、品牌、项目名称、保存状态、Save，以及“导入为新项目 / 新 Track”入口。
- Transport Bar：Undo / Redo、Tempo、拍号、播放区和 MIDI Editor 开关。
- Arrangement：Track 控制区、时间标尺、Track Lane 和 Add Track；右侧时间内容持有唯一真实
  纵向 / 横向滚动状态，左侧 Track 控制列以裁切从视图保持行对齐。至少 150 小节的 Ruler /
  Lane 可横向滚动，原生横向滚动条只出现在时间内容下方。
- Context Editor Dock：Track Inspector 与未来 MIDI Editor 宿主。

项目菜单当前提供：

- `Projects`：返回项目入口，dirty 时触发导航确认。
- `Save` / `Retry save`：与全局 Save 使用同一保存能力。
- `Import MIDI as new project…`：选择单个 MIDI 文件并创建独立项目；dirty 时先完成导航确认。
- `Import MIDI as new tracks…`：把来源 Note Track 追加到当前项目；保留当前 Tempo / 拍号并形成
  一个 Undo / Redo 步骤。
- `MIDI editor`：重新打开已关闭或最小化的 Context Editor Dock。

Arrangement 在最后一个 Track Lane 下方提供“导入为新 Track”操作；它是独立动作行，不代表
额外 Track，也不破坏 Track 控制行与真实 Lane 的一一对应。空 Arrangement 的空状态同样提供该
入口。菜单与动作行共享同一个文件选择和 Busy 状态，避免并发启动两次导入。

桌面布局要求至少 900 px 宽。更窄的视口显示说明与 `Back to projects`，不展示编辑工作区。

Transport 当前接通 Play / Pause、Return to Last Start Position 与 `mm:ss.mmm` 当前项目时间；
Arrangement Ruler 可点击或静默拖动定位，拖到视口边缘会连续滚动。资源 Loading 期间显示 Busy，
失败或部分支持状态提供 disabled reason / Toast。以下控件仍只是诚实占位：

- Record、Loop；
- 输出电平显示 `Meter —`，不代表真实运行状态；
- Grid、Arrangement Zoom、Track options。
- Track Mute、Solo 及其他通道控制。

### 5.2 `PROJECT-HISTORY` Undo / Redo

**用户可用**

- Transport 中 Undo / Redo 的可用状态直接来自当前 `ProjectSession`。
- 执行 Command 后可以 Undo；Undo 后可以 Redo。
- 执行新的分叉 Command 会使旧 Redo 分支失效。
- History 是 Session 本地状态，不保存到 Snapshot、Project File、Checkpoint 或 IndexedDB。
- 当前 Studio 中可直接产生的历史操作包括 Instrument Track、旧 Slot 的 Studio Grand 选择、空
  MIDI Clip，以及 MIDI Note Add、Selection Move、单 Note Resize 与原子删除完整 Note
  Selection。
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
- 默认 Track Scope 的全局 Ruler、横向滚动、全部 Clip window 与可见 Note。
- 已选择 MIDI Clip 时可切换到 Clip Focus；公共标题栏的 Scope 控件在空状态仍然可用。

Track Scope 可以选择 Active Clip，并用 Pencil 在全局时间轴中向既有 Clip 添加 Note、原子右扩
Clip 或按小节新建 Clip；Clip Focus 提供 Cursor Selection / Move、Cursor / Pencil 单 Note
Resize 与 `Delete` / `Backspace` 多选删除。当前仍没有 Zoom、Box Selection 或 Velocity 编辑；
Track Cursor 的完整 Note 编辑也尚未接入。

### 5.4 `KEYBOARD-SHORTCUTS` Scoped Keyboard Shortcuts

**局部可用**

当前 Workbench 支持：

- `Mod+S`：当前项目 dirty 且不在保存中时执行 Save；
- `Mod+Z`：当前 Session 可以 Undo 时执行 Undo；
- `Mod+Shift+Z`：当前 Session 可以 Redo 时执行 Redo；
- `Control+Y`：兼容 Windows 常用 Redo Binding。
- `Space`：当前计划可播放且没有导航 Modal 时 Play / Pause；Loading 期间不重复触发。
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

### 5.5 `PLAYBACK` 播放与播放中编辑

**局部可用**

播放过程中一旦 Project Commit 成功，Commit 后的 Project Facts 就立即成为权威。声音执行失败
不能撤销合法编辑，也不能让旧 Project Facts 继续冒充当前项目内容。

Studio 当前使用 `200 ms` look-ahead 提前安排即将发声的 Note。它只是内部调度参数，不是用户
可见的编辑冻结区，也不决定一项编辑是否生效。产品行为取决于 Commit 到达时，一次 Note 发声
处于以下哪个阶段：

主时间轴是从 Project Fact 派生的视图与播放范围：至少显示项目起始拍号的 150 小节，Clip 内容
超过该范围时精确扩展。短项目播放完已有 Note 后继续静音推进到时间轴末端再自然停止；完全没有
可听 Note 的 Empty Plan 仍不能启动。该范围不写入 Project File，也不会使新旧项目产生 dirty。

Transport 是当前播放位置的唯一运行时权威。Studio 已建立共享视觉位置源，现有 Transport 时间
显示、Arrangement Playhead 与 Piano Roll Playhead 都从该来源读取同一 Project Second / Tick；
`requestAnimationFrame` 只决定何时重新采样，不通过累计帧间隔计算播放时间。页面从后台恢复时会
直接读取最新 Transport Position。Scheduler 的 `25 ms` 唤醒只负责安排声音，不再把每次唤醒都
发布为普通 Vue 状态；高频位置不会进入 Project、Pinia、History、dirty 或 Commit Subscription。

Arrangement 在 Ruler 和 Track Lane 上显示同一条 transform-only Playhead。其纵向线段由 CSS
粘附当前 Arrangement 视口，纵向滚动不隐藏顶部三角柄；Playhead 与 Locate Preview 使用相同
线宽。Ruler 单击定位到
最近整数 Project Tick；拖动显示独立静默 Preview，松开只提交一次权威定位，拖到左右边缘时按
靠近程度连续滚动。Track Lane、Clip 与 Piano Roll 当前不响应直接定位。Follow 在每次普通进入
Playing 时默认开启，并只分页滚动右侧 Arrangement 时间视口；Playing Locate 成功后恢复 Follow，
取消则恢复手势前的 Follow 状态。左侧 Track 控制列保持固定，Track Piano Roll Follow 继续独立。
这些状态不保存为 Project Fact。

Ruler 的键盘语义为：左右方向键逐拍定位，Page Up / Page Down 逐小节定位，Home / End 定位到
时间轴首尾。它公开水平 Slider 的当前、最小和最大 Tick；该能力不是可听 Scrub。

每次成功 Manual Locate 都把目标设为运行时 Return Anchor。Return to Last Start Position 停止当前
播放或 Loading 请求并回到该 Anchor；初始与项目切换后的 Anchor 为 Tick `0`，连续定位只保留
最后一次目标，不形成栈。Pause / Resume 与自然播放进度不改变 Anchor，Plan 缩短时 Anchor 被夹取
到新 Timeline End。Anchor 不进入 Project、Checkpoint、History、dirty 或 Pinia。

Stopped / Paused 定位保持原状态；Playing 定位使旧 generation、未来调度与活动 Voice 失效后从
目标继续；Loading 定位更新 pending start；Empty / Blocked 仍允许移动位置但 Play 不可用。定位到
已经开始的长 Note 中间不执行 Note Chase。

Clip Focus Piano Roll 显示不可交互 Playhead：它用
`globalTick - clip.startTick` 把同一全局 Transport 位置换算为所选 Clip 的局部位置，只在
`[0, clip.spanTick]` 内显示，并通过独立图层的 `translate3d(...)` 移动。切换 Clip、Selection 或
项目以及退出编辑器时，投影会更新或清理；项目身份不匹配时不会显示旧项目位置。

Track Piano Roll 直接把同一全局 Tick 投影到 150 小节最小全局时间轴，并用独立
`translate3d(...)` 图层移动 Playhead。它拥有与 Arrangement 分离的横向滚动位置和瞬时 Follow
状态，但复用相同的分页规则：每次进入 Playing 默认启用；手动横向滚动或 Pointer / Keyboard
时间轴操作会暂停，可见控制可以立即恢复。当前完整 Clip Focus 视口不增加 Zoom、横向滚动或
多余的 Follow。

- **尚未调度**：还没有交给声音 Runtime；
- **已调度但未开始**：已经安排了未来开始时刻，但尚未产生声音；
- **正在发声**：已经开始产生声音，包括保持阶段和释放尾音阶段。

播放中编辑遵循以下产品语义：

| Project Fact 变化             | 尚未调度                  | 已调度但未开始                       | 正在发声                                                         |
| ----------------------------- | ------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Note Add                      | 使用新 Note               | 新起点仍在当前位置之后则安排发声     | 起点已经过去时不追补发声                                         |
| Note Delete                   | 不再安排                  | 取消尚未开始的旧发声                 | 只快速释放该 Note 的本次发声                                     |
| Note Move / Pitch             | 使用新位置与音高          | 取消旧发声；新起点仍在未来时重新安排 | 释放旧发声；仅在新起点仍在未来时重新安排，不立即重触发           |
| Note Resize                   | 使用新范围                | 取消并按新范围重新安排               | 新终点已过去则释放；仍在未来则调整结束时刻；进入尾音后不重新激活 |
| Velocity / Channel            | 使用新值                  | 取消并按新值重新安排                 | 不改变已经触发的发声，新值从下一次 Note On 开始生效              |
| Clip / Track Remove           | 不再安排其内容            | 取消所属 Clip / Track 的未来发声     | 只释放所属 Clip / Track 的发声                                   |
| Instrument Replace            | 后续事件使用新音源        | 取消该 Track 使用旧音源的未来发声    | 只释放该 Track，其他 Track 继续发声                              |
| Tempo / 全局路由 / 不可信状态 | 根据最新 Project 完整重建 | 取消全部尚未开始的发声               | 允许停止全部当前声音                                             |

补充规则：

- 尚未开始的旧队列可以在切换时整体取消并按最新 Project 重新建立，因为它们还没有产生声音；已经开始
  的发声必须按具体 Note 或 Track 选择性保留或结束。
- 与编辑无关的活动 Note 和 Track 继续发声，不因任意 Project Commit 被统一截断。
- 已经由声卡渲染的声音无法撤回；极靠近当前播放位置的取消属于 best effort。
- Note 起点已经越过当前播放位置时不执行 Note Chase，不为了反映新事实而立即补触发。
- Undo / Redo 按其最终恢复出来的 Project Fact 变化应用同一套规则。
- Pause、Manual Locate、Return to Last Start Position、项目切换、全局时间映射变化或无法证明
  局部更新安全时，允许停止全部声音。
- Velocity、Channel、Tempo 与全局路由的可见编辑入口尚未交付；表中对应行只约束这些能力未来接入
  后的产品行为，不改变它们当前的功能状态。

## 6. Track

### 6.1 `TRACK-CREATE` Add Track

**用户可用**

点击 Arrangement 左侧的 `Add track` 会打开 New Track 菜单。菜单展示：

| Track 类型         | 当前状态 | 点击结果                |
| ------------------ | -------- | ----------------------- |
| Voice / audio      | 尚未实现 | 显示开发中 Toast。      |
| Virtual instrument | 用户可用 | 创建 Instrument Track。 |
| Drum machine       | 尚未实现 | 显示开发中 Toast。      |
| Sampler            | 尚未实现 | 显示开发中 Toast。      |
| Guitar             | 尚未实现 | 显示开发中 Toast。      |
| Bass               | 尚未实现 | 显示开发中 Toast。      |

创建 Instrument Track 的产品规则：

- 追加到当前 Track 顺序末尾。
- 自动命名为 `Instrument N`，其中 N 是当前 Instrument Track 数量加一。
- 从固定八色 Palette 中随机选择颜色，并避免与相邻 Track 使用同一颜色。
- Track 颜色以十六进制 Project Fact 保存，可随 Checkpoint 恢复。
- 创建默认 unity gain、center pan、unmuted、unsoloed 的通道。
- 创建一个启用的 `seele.sample-instrument` Device，`definitionVersion = 1`、`parameters = {}`，
  并持久化 `opaqueState = { soundbankId: "studio-grand" }`。
- Command 必须原子写入 Track、Device 与 Track Order；不能产生不完整 Track 图。
- 成功创建后项目变为 dirty，并可 Undo / Redo。
- 成功创建后自动选中新 Track。
- 创建失败时不产生部分状态，并显示错误 Toast。

固定 Track Palette：

| 色彩    | Hex       |
| ------- | --------- |
| Violet  | `#8B5CF6` |
| Blue    | `#4F8CFF` |
| Cyan    | `#16B8D4` |
| Green   | `#23B26D` |
| Gold    | `#D6A43B` |
| Orange  | `#F27A3D` |
| Rose    | `#E85474` |
| Magenta | `#C65AD9` |

“Virtual instrument” 当前创建一个已选择 Studio Grand 的 Instrument Track。该选择是可保存的
Project Fact，不是播放时的隐式 fallback；在本地开发资产可用时，该 Track 的 MIDI Note 可通过
Transport 发声。

### 6.2 `INSTRUMENT-SELECTION` Track Instrument

**用户可用；本地开发资产可发声**

所选 Instrument Track 的左侧 Inspector 持续显示 Instrument 区块；即使当前选择的是该
Track 上的 MIDI Clip，Instrument 状态和修复入口仍然可见：

- 新 Track 或已经选择内置定义的 Track 显示 `Studio Grand`。
- 旧项目中严格匹配 `seele.instrument-slot` V1 空 Descriptor 的 Track 显示
  `No instrument selected` 和 `Use Studio Grand`。
- 用户点击 `Use Studio Grand` 后才执行一次 Instrument Device Replace Command；Device ID
  与 Track topology 保持不变，项目变为 dirty，并形成一个 Undo / Redo 步骤。
- Undo 恢复旧空 Slot，Redo 恢复 Studio Grand；Save / Reload 保留当前选择。
- 未知、版本不兼容或状态不兼容的 Descriptor 显示 `Missing instrument` 和已保存的
  `typeId`，继续原样 round-trip；Studio 不提供静默替换按钮或其他声音 fallback。
- Command 失败时旧 Descriptor 保持不变，并通过 Toast 显示原因。
- 展示始终从 Active Project 的 Snapshot 派生，不在 Pinia 或组件本地复制 Device Fact。

V1 当前只有这一个显式选择动作，不伪装成完整 Instrument Browser、Preset Library 或插件
管理器；选择成功不会 Preview Audition，只有主 Timeline Transport 播放已有 MIDI Note。

### 6.3 `MIDI-CLIP-CREATE` 创建空 MIDI Clip

**用户可用**

在 Instrument Track 的 Arrangement Lane 中创建空 MIDI Clip：

- Arrangement 按项目起始拍号展示至少 150 小节；Clip 内容超过该范围时，时间轴精确扩展到
  最远 Clip 末端。
- 右侧 Arrangement 是唯一真实纵向滚动权威；左侧 Track 控制列没有独立 `scrollTop`，按
  Arrangement 的位置执行裁切位移，并与对应 Lane 消费相同排序和固定行高。
- 滚轮位于 Track 控制行或 Lane 时都会移动 Arrangement 权威；键盘焦点进入被裁切的 Track
  控件时自动显示对应行，Track 标题、Add Track、Ruler 与 Lane 标题保持固定。
- Ruler 与所有 Lane 共用横向滚动位置；左侧 Track 标题、Add Track 和控制行保持固定，原生
  横向滚动轨道从 Arrangement 边界开始，不延伸到 Track 控制列下方。
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
- Clip 不因 150 小节最小范围被裁切；其末端会扩展共享时间轴，右侧内容可通过横向滚动访问；
- 当前以 DOM 提供可访问按钮与原生命中检测；可变 Zoom、大量 Clip 或高频交互进入前必须重新
  评估 Canvas。

### 6.4 `TRACK-SELECTION` Track 选择

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

**用户可用；Add、多 Note Move / Remove 与单 Note Resize 均已由用户界面使用**

Project Core 已实现：

- Add MIDI Note Command。
- Add MIDI Clip with Note Command；原子创建非循环 Clip、独占 MidiSource 与第一枚 Note。
- Extend MIDI Clip with Note Command；原子右扩非循环 Clip、按需增长 MidiSource 并创建越界
  Note，且不得跨越同 Track 的下一 Clip。
- Move MIDI Notes Command；一元素列表用于单 Note Move，多元素列表用于原子
  Selection Move。
- Remove MIDI Notes Command；一元素列表用于单 Note 删除，多元素列表用于原子多选删除。
- Resize MIDI Note Command；使用最终 Start / Duration，只操作一个明确 Note。
- Command validation、Mutation Plan、原子提交、Commit / Delta。
- Undo / Redo 及稳定的 Session-local `ProjectContentStateId`。
- Project Query、Query Index 和 Commit Subscription。
- Immutable Snapshot。

普通 Note Add / Move / Resize 能力需要一个已经存在的 MIDI Clip 与 MIDI Source。两个原子
Clip / Note 放置 Command 已在 Project Core 内部就绪，但 Track 模式 Pencil 尚未接入，不能从
Core 能力推断为当前可见产品行为。Studio 的
`ProjectMidiNoteCoordinator` 校验 Active Project、Clip、MidiSource 与 Note Partition，把
Clip-local Tick 映射为 Source-local Tick，生成 Note ID，并使用 Velocity 100、UI Channel 1
执行 Add Note Command。Coordinator 返回 `NoteId + Commit`；尾部剩余时间不足期望 Duration
时只创建剩余的正 Tick。移动和删除时 Coordinator 对当前 Clip 的同一 MidiSource 分别执行
一个 `MoveNotesCommand` / `RemoveNotesCommand`，全部目标在建立 MutationPlan 前完成验证。
单 Note Resize 由 Editor Common 解析最终 Source-local Start / Duration，Studio Coordinator
执行一个 `ResizeNoteCommand`。

Add 已由 Piano Roll Pencil 接入，多 Note Move 已由 Cursor Body Drag 接入，多 Note
Remove 已由聚焦键盘 Action 接入，单 Note Resize 已由 Cursor / Pencil Edge Drag 接入。

`ResizeNoteCommand` 不编码左 / 右 Edge，而是提交最终 `startTick` 与正
`durationTick`。Core 从权威 Note 复核存在性与 Source 边界；几何相同时不提交，成功时只
改变 Start / Duration，并产生一条 `midi-note.updated` Change、一个 Commit 和一个可逆
History 步骤。多 Note Resize 的 Anchor、比例与失败语义尚未确定，因此没有集合协议。

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

Piano Roll 已确认采用“一个 Project 模型、两种编辑投影”，不是为编辑器复制第二份 Clip：

- `Track` 是默认编辑模式，显示当前 Instrument Track 的全局时间轴、全部 MIDI Clip 及其中
  可见 Note；
- `Clip Focus` 是可选模式，只显示并编辑当前 Clip 的局部时间窗口；
- 模式选择是 Studio 应用生命周期偏好，不是 Project Fact，不产生 dirty、History 或 Commit；
- 两种模式读取同一 `MidiClipRecord`、`MidiSourceRecord` 和 Note Partition。Clip 右端始终由
  `startTick + spanTick` 派生，不创建 Piano Roll 专用 Clip 或重复 `endTick`；
- 非循环 Clip 的 Note 全局 Tick 为
  `clip.startTick + note.startTick - clip.sourceOffsetTick`；Clip Focus 则继续使用当前
  Clip-local / Source-local 映射；
- looped Clip 可以出现在 Track 投影中，但在循环实例选择与 Source 写回语义确认前不可编辑。

Track 模式 Pencil 在全局空白时间轴上的产品规则：

| Pointer 位置                                 | 行为                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| 位于一个非循环 Clip 内                       | 写入该 Clip；重叠 Clip 区域优先使用 Active Clip，没有明确目标时不猜测    |
| Note 起点在 Clip 内但尾端越界                | 若不跨越下一 Clip，原子扩展 Clip 右端并创建 Note                         |
| 位于左侧相邻 Clip 末端之后不超过一个当前小节 | 若不与下一 Clip 相交，原子向右扩展该 Clip 并创建 Note                    |
| 更远的空白区域                               | 从包含 Pointer 的小节边界创建新非循环 Clip / MidiSource，并原子创建 Note |
| 位于既有 Clip 之前                           | 创建新 Clip；V1 不自动向左扩展已有 Clip                                  |
| looped Clip 或目标归属有歧义                 | 拒绝本次提交并显示原因                                                   |

自动扩展永远不能跨越下一 Clip。新建 / 扩展 Clip 与创建 Note 是一次用户手势、一个原子 Project
Command、一个 Commit 和一个 History 步骤；Studio 不得通过多次命令拼接事务。Clip Focus
模式不会因为用户在局部视口操作而自动创建其他 Clip。

当前实现状态需要与已确认的最终规则区分：默认 Track Surface 已显示全局 Ruler、横向滚动、
Clip window、可见 Note、Active Clip 与原子 Pencil 放置；公共标题栏可以切换到既有 Clip Focus
Surface，切换只改变 Studio 应用偏好。两个模式都显示来自共享 Transport 位置的 Playhead，Track
模式另提供独立分页 Follow。Track Cursor 的完整 Note Selection / Move / Resize 尚未接入，不能
从双模式 UI 推断为已经交付。

`@seele-daw/editor/common` 已提供：

- 非循环 MIDI Clip 与其 MidiSource 的稳定 1:1 编辑上下文；
- immutable Snapshot 派生的 Track 全局 Clip / Note Read Model，以及明确的 looped Clip
  unsupported 投影；
- Clip-local Tick 与 Source Tick 的双向映射；
- 可见 Tick / Pitch / CSS Pixel Viewport；
- 不提前 Snap 的连续 X → Tick 位置换算；
- 视觉与交互共用的 Timeline Grid，以及 Snap 开启/关闭时的连续 Position → Tick 解析；
- 只接受完成空白 Click 的 Pencil Note Placement，以及 Clip End 的合法内部起点限制；
- 基于 Project Query 与局部 Subscription 的可见 Note Read Model；
- Commit 后重新 Query、Viewport 替换、Observer 隔离和 dispose 生命周期；
- Clip-scoped `PianoRollEditorSession`、冻结的稀疏 `NoteId` Selection；
- Selection 前的权威 Note Query，以及相关 Commit 后的存在性和 Clip 时间窗口校准。
- 冻结的 Cursor Move Gesture，以及基于 Grid Coordinate 的 Absolute Snap、Pitch
  Semitone Delta 和 Selection 合法边界交集。
- 冻结的 Cursor / Pencil 单 Note Resize Gesture、左右 Edge 几何、Grid Coordinate
  Absolute Snap、Source 边界 Clamp 与 Clip-clipped Preview；
- Surface-scoped Pointer Interaction Session，统一 Click、Add、Move、Resize 的 pressing、
  Preview、cancel、单次 Intent 与权威 revision 交接；XState 只作为内部实现。

单 Note Resize 同时接受 Cursor 与 Pencil 的明确左右 Edge Hit。左 Edge 固定原始 End，右
Edge 固定原始 Start；Snap 开启时使用冻结 Grid 的最近绝对坐标，动态 `Alt` 临时绕过 Snap。
最终几何限制在 MidiSource 内且至少为 1 Tick，当前 Clip 只裁剪可见 Preview。未越过 Drag
Threshold 的 Cursor Edge Click 仍解析 Selection，Pencil Edge Click 不写 Project。Resize
未选中 Note 时只在成功提交后切为唯一 Selection；取消、No-change 或失败保留原 Selection
和 Tool。

`@seele-daw/editor/browser` 与 Studio 已提供：

- DPR-aware Canvas Pitch / Grid Renderer；
- Renderer-neutral Note Scene、当前 keyed DOM Note Renderer 与可替换 Canvas Adapter；
- DOM / Canvas 共用的 selected Scene 事实，以及 Piano Black Selected Border / Glow；
- Surface 级 DOM Hit 委托，以及 Renderer-neutral Primary Pointer Input；
- 默认 DOM Note Renderer 的左右 Resize Edge 热区：每侧上限 6 CSS Pixel，窄 Note 中各自
  最多占一半，两个方向不重叠；
- Surface-local CSS Pixel、Pointer Capture、4 CSS Pixel Drag Threshold 和取消生命周期；
- origin / current Modifier 分离、活动拖动中的动态 Alt、Window blur 与显式取消；
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
- Pointer Down 冻结 Project revision、Note Facts、Selection、Viewport、Grid、Snap
  Preference、Hit 与 origin Modifier；手势期间 Project revision 改变时，Pointer Up 的
  stale intent 整体拒绝；
- Pointer Move 只更新冻结 Preview；Snap 开启时显示 Anchor Guide，Pointer Up 的非零
  Delta 最多执行一个 `MoveNotesCommand`；
- Snap 开启时，Note 无论原本是否对齐，都以拖动后的绝对目标时间解析当前 Grid
  Coordinate；切换 Grid Resolution 后也不保留旧网格或自由移动产生的偏移；拖动中按下
  `Alt` 会实时临时绕过 Snap，松开后实时恢复本次冻结 Grid 的绝对坐标吸附；
- 多 Note Move 使用共享 Tick / Pitch Delta 和全部 Note 合法边界的交集，不逐 Note Clamp；
- Move 成功后等待权威 Read Model 到达对应 revision 再移除最终 Preview，避免短暂视觉
  回跳；
- Pointer Cancel、Window blur、Clip 切换、释放或 `Escape` 取消未提交 Move，不写 Project；
  失败清理 Preview、保留原 Project / History 并显示 Toast；
- Move 只产生一个 Commit 和一个 History 步骤；Undo / Redo 原子恢复或重放完整 Selection；
- Cursor 与 Pencil 都可拖动一个 Note 的左右 Edge；Pointer Move 只更新 Resize Preview，
  Snap 开启时显示时间 Guide，Pointer Up 最多执行一个 `ResizeNoteCommand`；
- Resize 成功只产生一个 Commit 和一个 History 步骤；未选中目标在成功后成为唯一
  Selection，已选中目标保留现有 Selection，Pencil 保持激活；
- Resize No-change 不提交；拒绝时清理 Preview、保留 Project / Selection / Tool 并显示
  Toast；成功 Commit 后等待权威 Read Model revision 再清理最终 Preview；
- Clip 切换创建新的 Editor Session，不继承前一个 Clip 的 Selection。

Selection 只保存稳定 `NoteId`，属于当前 Clip Editor lifetime；它不进入 Pinia、Project
History、Snapshot、Checkpoint 或 IndexedDB。Note 移出当前可见 Viewport 时仍保持选中；
Note 被删除或移出当前 Clip Source 时间窗口时由权威 Query 清理。

当前明确限制：

- 不支持 looped Clip 编辑，不能把循环实例错误显示成非循环 Source；
- Grid Preset UI 当前只显示已确认的 `1/16`，尚不能选择其他直线、三连音或附点值；
- 当前可见基线固定显示完整 Clip 和 MIDI 48–72，尚无模式切换、Track 全局 Zoom / Scroll；
- 用户可以创建、选择、移动、调整长度和删除 Note，但还不能编辑 Velocity；
- Canvas Note Adapter 可以显示 Resize Preview，但尚未提供 Canvas Hit；当前产品默认使用
  DOM Note Renderer 完成 Edge Hit。

### 8.3 Project File 与 Checkpoint

**内部就绪**

Project Core 已具备：

- Project File Format V1 的内存 Projection。
- V1 Protocol 字段校准、Decoder、Validation 与 Session Loading。
- Storage-neutral Project Checkpoint 保存与恢复协调。

当前没有面向用户的 Seele Project JSON 编解码、文件导入 / 导出或格式迁移 UI；Standard MIDI
File 导入是独立交换格式入口，不替代 Project File。

### 8.4 Package 状态

| Package                       | 当前能力                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@seele-daw/project-core`     | 项目模型、Instrument Device Replace、原子 Instrument Track 集合、含 populated Clip 新建、非循环 Clip 右扩加 Note 与单 Note Resize 的 Command、Commit、Session、History、Query、Snapshot、Project File V1 与 Checkpoint。                                                                                                                                                                                                                                                                                                       |
| `@seele-daw/midi-file`        | Parser-neutral SMF Document、可替换 Decoder / Encoder Port、封装 `@tonejs/midi` 的 Type 0 / 1 PPQ Decoder 与确定性 Type 1 Encoder。                                                                                                                                                                                                                                                                                                                                                                                            |
| `@seele-daw/project-midi`     | Standard MIDI File Document 与 Project Model 的导入映射、PPQ 换算、诊断、完整 Session Draft 与当前项目 Track Command Draft；不拥有 Browser 或项目生命周期。                                                                                                                                                                                                                                                                                                                                                                    |
| `@seele-daw/platform-browser` | IndexedDB V1 Checkpoint Store、Recent Project Catalog 与本地 File / Blob 字节读取 Adapter。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/studio`                 | 项目入口、创建新项目 / 追加当前 Track 两种 Standard MIDI File 导入、生命周期、导航确认、Workbench Shell、Scoped Keyboard Shortcuts、Project Playback Coordinator、Play / Pause / Return Anchor / 共享视觉位置与时间反馈、Arrangement Ruler 点击 / 静默拖动 / 边缘滚动 / 键盘定位、播放中 Note / Track / Instrument 选择性重协调、默认 Studio Grand Add Track、旧 Slot 显式选择、派生 150 小节 Arrangement、Arrangement / Track 独立 Follow、Track / Clip 双模式 Piano Roll 与 Note 编辑；Track Cursor 完整 Note 编辑尚未接入。 |
| `@seele-daw/editor`           | 已提供 Piano Roll Clip / Viewport / Note Read Model、Track 全局 Clip / Note Snapshot 投影、Timeline Grid Snap、Pencil Placement、Selection Session、Select / Move / Resize Interaction、Move / Resize Preview、Canvas Grid、DOM / Canvas Note Adapter、DOM Body / Edge Hit 与 Pointer Input。                                                                                                                                                                                                                                  |
| `@seele-daw/playback`         | 浏览器无关的 Sample Instrument schema、Studio Grand 默认 Definition / factory / 严格 decoder、TempoMap、派生 Timeline 范围、具体 MIDI Plan Compiler、Tick Locate / Return Anchor Transport Mapping、Scheduler Planner、完整 Plan Reconciliation 与原位 generation handoff；公开 Studio / Audio Web 真实消费者所需的最小规划 API，不提供音频资源。                                                                                                                                                                              |
| `@seele-daw/audio-web`        | 已具备同源 Manifest/WAV 准备与应用生命周期解码缓存、可选按 Soundbank 局部失败、用户激活的 AudioContext / master output，以及 Manifest 驱动的 Sample Voice、可重排 Note Off、loop、mutex、选择性 cancel、generation 与资源统计；已由 Studio 组合执行，生产构建仍不复制 Studio public。                                                                                                                                                                                                                                          |
| `@seele-daw/type-utils`       | 提供 `Brand`、`ValueOf` 等无运行时共享类型工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 9. 明确尚未提供的产品能力

以下项目不得从现有占位 UI 或 Core 类型推断为已交付：

### 编辑与编排

- MIDI Clip 移动、复制、调整长度、拆分、删除或多选；当前只支持创建、单选与打开上下文。
- Piano Roll Velocity 编辑；当前支持 Pencil Add、Cursor Selection / Move、Cursor / Pencil
  单 Note Resize 与多选 Delete。
- Arrangement 缩放、Grid 和 Snap；横向时间轴滚动及 Arrangement 单一纵向滚动权威已经可用。
- 框选尚无 Preview；当前用户可见 Drag Preview 覆盖 Cursor Note Move 与 Cursor / Pencil
  单 Note Resize。
- Track 重命名、改色、删除、复制、重排。
- Track Mute、Solo、Gain、Pan 与更多 Channel 设置。

### 音源与声音

- 本地 `public/soundbanks/{catalog,indexes,soundbanks}` 开发资源镜像的完整 Catalog / Indexes 扫描、
  运行时安装与音色选择；当前只支持由开发工具规范化后的同源 Manifest/WAV，且该镜像不属于产品
  资源，Vite 生产构建禁止把 public 内容复制到 dist。
- M4A 自动协商、远程 / 安装式 Soundbank 获取与可分发内置资产；当前 Studio 只从本地 Vite dev
  同源路径准备 Manifest/WAV。
- JSON 合成器定义的解析与合成引擎。
- 完整 Instrument Browser、Preset Library、第三方 Device UI 与任意 Instrument 替换；当前只有旧空
  Slot 的 `Use Studio Grand`。
- 通用 Web Audio Graph、AudioWorklet 与电平；当前只有 Sample Voice 所需的最小 master output。
- 可听 Scrub、Note Chase、Locator / Marker、Loop、Record、实时 Meter、监听，以及 Gain / Pan /
  Mute 的持久 Track Bus 实时更新。当前支持 Play / Pause / Resume、Arrangement Ruler Manual
  Locate 与 Return to Last Start Position；播放中的 Note Add / Move / Resize / Delete、Undo / Redo、
  Track / Clip 生命周期和 Instrument Replace 会从当前位置选择性生效，不相关的活动 Voice 继续。
  Tempo、全局路由、Commit gap 与不可信失败仍允许全局安全停止。

### 其他 Track 类型

- Voice / Audio Track。
- Drum Machine。
- Sampler。
- Guitar。
- Bass。

### 项目管理与可靠性

- 项目重命名、删除、复制。
- Seele Project File 导入 / 导出、Standard MIDI File 导出与用户可恢复备份；Standard MIDI File
  单文件导入已经可用。
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
9. 新 Instrument Track 默认持久化 Studio Grand；旧空 Slot 只能由用户通过可见 UI 显式选择，
   不能在打开或播放时自动迁移。
10. Standard MIDI File 导入必须先完整读取、解码和验证。创建独立项目时原子写入首个
    Checkpoint，并在 Workbench 中先按最新项目状态完成 dirty 的 Save / Discard / Cancel 确认；
    导入为当前项目新 Track 时使用一个原子 Project Command，保留当前 Tempo / 拍号，不导航、
    不自动保存。Tempo 是 Project 全局事实而不是 Track 属性：来源 Note 保持音乐 Tick 位置并按
    当前 Project Tempo Map 播放，来源 Tempo / 拍号不得静默覆盖或合并；两种模式的导入 Track 都
    默认持久化 Studio Grand，来源 Program 不静默替换音源。
    “新 Track”入口打开文件选择器时把连续 Playhead 位置转换为最近的整数 Project Tick 并冻结；
    来源文件 tick 0 映射到该位置，不再按拍或小节二次吸附，并保留各 Track 的前导空白和相互时间
    偏移。
    两种 MIDI 导入模式都由 Studio 使用现有 Track Palette 分配持久化颜色；首条避免与前一条既有
    Track 同色，批次内相邻 Track 继续避重，Clip 保持 `null` 以继承 Track 颜色。
11. Project Tempo 的可表示范围是 `5..999 BPM`；MIDI 导入保留范围内的完整浮点值和所有有效
    Tempo Event，不静默 clamp、倍增或按密度删除。
12. 未知或不可用 Device 必须保存并显示 Missing，不能静默替换声音。
13. 普通 Clip 复制的长期产品语义是创建独立 MIDI Source 与新 Note 身份。
14. Move、Resize、Split 等编辑算法必须在对应 Command 实现前确定产品边界。
15. 未接通的控制必须禁用或明确提示不可用，不能制造功能已存在的错觉。

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

| 日期       | 功能编号                                                   | 变化                                                                                                                                                             | 提交                                       |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 2026-07-22 | `PROJECT-ENTRY`、`PROJECT-LIFECYCLE`、`PROJECT-NAVIGATION` | 完成 Active Project、IndexedDB Recent Projects、导航确认及 Composition Root 基础。                                                                               | `5ea1256` 阶段基线                         |
| 2026-07-23 | `PROJECT-ENTRY`、`WORKBENCH-SHELL`、`UI-FOUNDATION`        | 接入真实路由、Piano Black Project Entry、导航 Dialog 与 Workbench Shell。                                                                                        | `cae096b`、`f205333`、`a841205`            |
| 2026-07-24 | `TRACK-CREATE`、`UI-FOUNDATION`                            | 完成 Instrument Track Command、应用协调、Add Track 菜单与 Toast。                                                                                                | `580884b`—`681880d`                        |
| 2026-07-27 | `TRACK-SELECTION`                                          | 完成项目作用域 Track Selection、新建自动选择及 Workbench 联动。                                                                                                  | `ea1f7f5`                                  |
| 2026-07-27 | 文档基线                                                   | 首次汇总当前产品功能、内部能力、限制与持续维护规则。                                                                                                             | `f2abf53`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`                                         | 确认创建交互与默认事实；Project Core 完成空 Clip 所有权图 Command、Delta、History 和 QueryIndex 语义。                                                           | `6e6f6bb`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`                                         | Studio 完成小节吸附、产品默认值协调、Composition Context 与 Clip Selection。                                                                                     | `2f43690`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`、`CONTEXT-EDITOR-DOCK`                  | Arrangement 接入空 Clip 创建、视觉、选择、打开和错误反馈；Dock 显示 Clip 上下文。                                                                                | `99d9001`                                  |
| 2026-07-27 | `PIANO-ROLL`                                               | Editor Common 完成非循环 Clip Context、Viewport 坐标与 Query/Subscription Note Read Model。                                                                      | `15edc39`                                  |
| 2026-07-27 | `PIANO-ROLL`                                               | Editor Browser 完成 Canvas Grid、Note Scene 与 DOM / Canvas Adapter。                                                                                            | `b888a78`                                  |
| 2026-07-27 | `PIANO-ROLL`、`CONTEXT-EDITOR-DOCK`                        | Studio Dock 默认接入 keyed DOM Note 与真实 Project Query / Subscription。                                                                                        | `f3778f0`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Common 完成 Clip-scoped Note Selection Session、权威存在性校准与第三阶段交互计划。                                                                        | `054377d`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Browser 完成 Surface 级 DOM Hit、Primary Pointer Capture、CSS Pixel Input 与 Drag Threshold。                                                             | `007c24e`                                  |
| 2026-07-28 | `KEYBOARD-SHORTCUTS`                                       | Studio 完成 Scoped Action Coordinator、TanStack Browser Adapter，以及 Workbench Save / Undo / Redo Binding。                                                     | `cdf9577`                                  |
| 2026-07-28 | `KEYBOARD-SHORTCUTS`                                       | 集中默认 Keymap、强类型 Binding 和动态输入 Validation；用户设置面板仍未实现。                                                                                    | `378c253`、`659b8c4`                       |
| 2026-07-28 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS`                         | Studio 接入 Clip-scoped Note Selection、共享 selected Scene、Pointer Click 与 focused Escape。                                                                   | `f9d7fe7`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | 第四阶段显式定义 Pencil / Cursor、Snap、Note 创建结果与失败规则；Editor Common 建立共享 Timeline Grid Snap。                                                     | `cc3bbb5`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Studio 建立 Project MIDI Note Coordinator、默认 Note Facts、Clip / Source 校验与 Typed Vue Context；尚未接入可见创建手势。                                       | `df66936`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Studio 建立应用生命周期级 Pencil / Cursor、Snap 与 `1/16` Grid Preference Store；Canvas Grid 消费同一 Preset。                                                   | `67509d8`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Common 完成 Pencil Note Placement；Studio 接入可见 Tool / Snap、Add Note、创建后 Selection、失败 Toast 与 History 回归。                                  | `6cba7d2`                                  |
| 2026-07-29 | `PIANO-ROLL`、`UI-FOUNDATION`                              | Pencil Snap 改为当前 Grid 单元左边界；Snap 沿用 Fluent Grid；Toast 改为应用级命令触发与单一声明式 Region。                                                       | `1bc6dac`                                  |
| 2026-07-29 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS`                         | 明确 Cursor Move、Cursor / Pencil Resize 归属；接入多 Note 原子删除、Delete / Backspace、Selection 校准与失败 Toast。                                            | `52dc03c`                                  |
| 2026-07-29 | `MIDI-NOTE-CORE`                                           | 单个与多个 Note 删除统一为数量无关的 `midi-note.remove` 集合协议，移除重叠的单 Note Command。                                                                    | `df4cdf3`                                  |
| 2026-07-29 | `MIDI-NOTE-CORE`、`PIANO-ROLL`                             | Batch 5.2 统一共享 Delta 的 `MoveNotesCommand`；接入 Cursor Selection Move、Absolute / Relative Snap、冻结 Preview、Guide、Escape Cancel 与单 Commit / History。 | `2535db4`                                  |
| 2026-07-29 | `PIANO-ROLL`                                               | Note Move Snap 统一改为由绝对目标时间解析当前 Grid Coordinate；Off-grid Note 不再保留旧 Resolution 或自由移动偏移。                                              | `494b9de`                                  |
| 2026-08-10 | `PIANO-ROLL`                                               | 引入框架无关 Pointer Interaction Session，统一 Click / Add / Move 状态生命周期、动态 Alt、Window blur、显式取消与权威 revision 交接。                            | `94c3b54`                                  |
| 2026-08-10 | `MIDI-NOTE-CORE`                                           | Batch 3A 建立单 Note `ResizeNoteCommand`、最终几何验证、No-change、Note Update Delta 与 Undo / Redo；尚未接入 Studio。                                           | `0564669`                                  |
| 2026-08-10 | `PIANO-ROLL`                                               | Batch 3B 建立 Cursor / Pencil 单 Note Resize Gesture、左右 Edge 几何、Absolute Grid Snap、Source 边界、Preview、Intent 与 Interaction Session 分支。             | `aac0b20`                                  |
| 2026-08-10 | `MIDI-NOTE-CORE`、`PIANO-ROLL`                             | Batch 3C 接入 DOM 左右 Edge Hit、Resize Scene / Guide、Studio 单次 Command、Selection、Toast、权威 revision 交接与 Undo。                                        | `b7772b1`                                  |
| 2026-08-11 | `INSTRUMENT-SELECTION`                                     | Project Core 建立 Instrument Device Replace、No-change、Delta、History、QueryIndex 与持久化回归。                                                                | `6b172d9`                                  |
| 2026-08-11 | `TRACK-CREATE`、`INSTRUMENT-SELECTION`                     | Playback 建立 Studio Grand Definition；新 Track 默认持久化选择，旧空 Slot 可从持续可见的 Inspector 显式选择，并显示 Missing 与失败反馈。                         | `88ce879`                                  |
| 2026-08-11 | Playback TempoMap                                          | 建立浏览器无关的多 Tempo Segment、Tick / Project Second 双向换算与严格时间错误边界。                                                                             | `b077dba`                                  |
| 2026-08-11 | Audible MIDI Compiler                                      | 建立通用 MIDISampleSynth Device schema、冻结 Track / Note Span 计划、稳定 occurrence key、unsupported content policy 与中性 Arrangement 范围。                   | `ac1cc31`                                  |
| 2026-08-11 | Audible MIDI Transport                                     | 建立注入单调时钟的 stopped / playing / paused 映射、独立 generation、自然结束与双向调度时间换算；尚未接入 Studio 或声音。                                        | `ae87ca4`                                  |
| 2026-08-12 | Audible MIDI Scheduler                                     | 建立连续半开 look-ahead 窗口、冻结 Sample Voice Plan、generation / occurrence 去重、迟到立即开始与过期丢弃；尚未执行声音。                                       | `145b3ab`                                  |
| 2026-08-13 | Audio Web Sample Resource Preparation                      | 按稳定 Playback Plan 准备实际引用的 Manifest/WAV，建立同源边界、byte budget、并发去重、取消、失败重试和应用生命周期解码缓存；尚未接入 Studio。                   | `dc8ccfd`                                  |
| 2026-08-13 | Audio Web Sample Voice Runtime                             | 建立用户激活的 AudioContext、master output、Manifest 驱动的 Pitch/Envelope/Loop/Mutex Voice、generation/cancel/allNotesOff 与零残留资源统计；已通过审阅。        | `772210f`                                  |
| 2026-08-13 | `PLAYBACK`、`KEYBOARD-SHORTCUTS`                           | Studio 组合 Compiler、Transport、Scheduler、资源准备与 Voice；接通 Play/Pause/Return、Space、时间、Loading/失败反馈和清理；已通过功能审核。                      | `7242a52`（核心）与本次 UI 提交            |
| 2026-08-14 | `PLAYBACK`                                                 | 建立完整 Plan Reconciliation、Transport 原位 handoff 与 generation/断音解耦的选择性 Voice 生命周期。                                                             | `33a9ea0`、`365044b`、`475d32c`            |
| 2026-08-14 | `PLAYBACK`                                                 | Studio 接入 Commit 顺序、Note / Track / Clip / Instrument 选择性生效、按 Soundbank 局部资源失败，以及 stale/gap/Pause/项目切换回归；Batch 6A–6F 已通过统一审核。 | `2729357`、`a730119`、`dfbddce`            |
| 2026-08-14 | `WORKBENCH-SHELL`                                          | Arrangement Track 控制行与 Lane 改为单一纵向滚动权威，固定标题区并保持逐行水平对齐。                                                                             | `42e5a0b`                                  |
| 2026-08-17 | `PIANO-ROLL`                                               | 建立 Track 全局 Read Model、原子 Clip / Note 放置、Track-time Surface，以及不写 Project Fact 的 Track / Clip Focus 可见切换。                                    | `5e50228`、`113aabb`、`4d935fd`、`ea87d53` |
| 2026-08-17 | `PIANO-ROLL`、`PLAYBACK-VIEW`                              | Track 与 Clip Focus 共用权威 Transport 视觉位置；Track 增加 transform-only Playhead、独立分页 Follow 与手动导航暂停。                                            | `78ee8ea`                                  |
| 2026-08-17 | `PLAYBACK`、`PLAYBACK-VIEW`                                | 完成后台视觉恢复、Timeline / Transport、生命周期与资源清理证据审计；Audible MIDI Playback V1 全部批次通过审核并收口。                                            | `f1d0298`                                  |
| 2026-08-18 | `TIMELINE-LOCATE`、`PLAYBACK`                              | 建立 Ruler 点击 / 静默拖动、连续边缘滚动、键盘 / ARIA、播放中安全重调度、Return Anchor、Follow 恢复及纵向可见 Playhead；已通过统一审核与用户浏览器验证。         | `2b89595..f4cb601`                         |
| 2026-08-20 | `MIDI-IMPORT`                                              | 完成 Project Entry 导入纵向切片，并在 Workbench 项目菜单与 Arrangement 末尾增加明确的“导入为新项目”入口及 dirty 导航保护。                                       | `fca1c49`、`2b95ee9`                       |

## 13. 阶段收口与当前验证基线

Audible MIDI Playback V1 已于 2026-08-17 按
[阶段计划](./packages/playback/docs/audible-midi-playback-v1-phase-plan.md)完成收口，验收基线为
`f1d0298`。阶段完成与 Git checkpoint 相互独立；当前未创建新的 checkpoint tag。

其后的 [Manual Timeline Locate V1](./packages/playback/docs/manual-timeline-locate-v1-phase-plan.md)
已于 2026-08-18 完成四个独立主批次和一个 Playhead 纵向可见性 UX 修正，并通过用户统一代码
审核与浏览器功能验证；它不改变 Audible MIDI Playback V1 的已完成状态。阶段 checkpoint 为
`checkpoint/manual-timeline-locate-2026-08-18`。

Audible MIDI Playback V1 Batch 1A、Batch 1B、Batch 2A、Batch 2B、Batch 3A、Batch 3B、Batch 4A、
Batch 4B.1、Batch 4B.2、Batch 5A、Batch 6A–6F 与 Batch 7A–7F 已通过本地验证和功能审核。
Batch 5A 另通过浏览器运行时 smoke，Batch 7B 另通过
浏览器布局 smoke。按约定没有新增 E2E：

- Standard MIDI File Import / Export V1 MI5 已于 2026-08-20 通过完整 `pnpm check`，包括
  Architecture、Workspace Type Check、全部测试、Studio Production Build 与 soundbank dist
  boundary；Studio 为 48 个测试文件 / 306 项测试。按阶段约定未新增 E2E，也未由实现方执行
  浏览器人工测试。

- MI6 当前项目 Track 导入实现已于 2026-08-21 通过根级 lint、Workspace Type Check、全部
  workspace 测试、Studio Production Build 与 soundbank dist boundary；Project Core 为 29 个
  测试文件 / 415 项测试，`project-midi` 为 3 / 20，Studio 为 48 / 310。按约定未新增 E2E，也未
  执行浏览器人工测试；代码与功能仍待用户审核。

- Manual Timeline Locate V1 最终实现通过 2026-08-18 完整 `pnpm check`；Playback 为 9 文件 /
  100 项，Studio 为 46 / 284，并通过 Architecture、Workspace Type Check、Studio Production
  Build 与 soundbank dist boundary。按用户约定没有新增 E2E，也未由实现方执行浏览器人工手测。

- Batch 7F 覆盖审计确认多 Track 配对、150 小节与超长 Clip、自然结束、Voice 清理、Pause / Return、
  项目切换、dispose 及双视图 Follow 已有直接回归；新增后台帧停顿后读取最新权威 Transport 位置的
  显式测试。完整工作区验证见下列最新基线。

- Batch 7B 的 Playback、Audio Web 与 Studio 全包测试分别为 9 文件 / 93 项、16 / 110 与
  42 / 252；受影响包 type-check、架构检查与 Studio Production Build 通过。浏览器布局 smoke
  已确认 Arrangement 独占横向滚动条、Track 从视图行对齐和 Track 区域滚轮转发。
- Batch 6A–6F 已于 2026-08-14 完成统一逐提交审核；对应验收通过 `pnpm lint` 与 `pnpm check`，
  包括 Architecture、Workspace Type Check、全部测试、Studio Production Build
  与 soundbank dist boundary；Batch 6 按约定未新增 E2E。
- Batch 4B.2 已通过完整 `pnpm check`（Architecture、Workspace Type Check、全部测试、
  Studio Production Build 与 soundbank dist boundary），并通过改动范围的 Oxlint / ESLint 与格式检查。
- Project Core：28 个测试文件，409 项测试。
- midi-file：3 个测试文件，14 项测试。
- project-midi：2 个测试文件，16 项测试。
- platform-browser：3 个测试文件，23 项测试。
- editor：11 个测试文件，112 项测试。
- playback：9 个测试文件，101 项测试。
- audio-web：16 个测试文件，110 项测试。
- Studio：48 个测试文件，306 项测试。
- type-utils：1 个测试文件，2 项测试。

合计 121 个测试文件、1093 项测试。完整 `pnpm check` 同时通过 Architecture、Workspace Type
Check、Studio Production Build 与 soundbank dist boundary。

后续功能完成时，测试数量可以增长；“全部验证通过”比固定数量更重要，但本节应保留最近一次可信基线。
