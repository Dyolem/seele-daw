# Seele DAW 产品功能手册

本文记录 Seele DAW **现在能做什么、用户如何操作、产品必须保持哪些行为，以及哪些界面仍只是
占位**，是功能开发、验收与回归测试的共同依据。

本文只写当前行为。改变产品行为的提交同时更新本文：功能总览中的状态与边界、所属章节的入口与
规则，以及“明确尚未提供”的清单。只有实现并验证过的行为才标为“用户可用”或“内部就绪”；未来
设想写进规划文档。

视觉语言见 [DESIGN](DESIGN.md)，代码结构见 [ARCHITECTURE](ARCHITECTURE.md)。2026-10 之前的
功能变更记录与阶段验证基线已归档到 [产品历史](docs/archive/product/product-history.md)。

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
2. 在 Workbench 创建默认选择 Studio Grand 的 Instrument Track；MIDI 导入按独立的 128 项 GM
   Program 路由与 Channel 10 选择音源；在 Inspector 从 15 类、完整 439 项来源 Preset 的两栏目录
   手动选择或替换音色，也可显式修复旧项目的空 Instrument Slot、不可用 Program 占位与 Missing
   Instrument。
3. 在 Instrument Track 的目标小节创建、选择并打开空 MIDI Clip。
4. 在 Context Editor Dock 使用 Pencil 创建 MIDI Note，或用 Cursor 选择、切换、拖动和
   清空 Note Selection；Cursor 与 Pencil 都可拖动 Note 左右边缘调整长度。
5. 在 Piano Roll 聚焦时使用 `Delete` / `Backspace` 原子删除完整 Note Selection。
6. 在 Piano Roll 选择 CC64 MIDI Channel，并在 Clip Focus 或明确 Active Clip 的 Track Scope
   Sustain Pedal Lane 用 Pencil 写入原始 `0..127` 控制值。
7. 用 Cursor 选择 CC64 Event；横向拖动所选 Event、纵向拖动锚点 Value，或用
   `Delete` / `Backspace` 删除所选 Event。
8. 通过 Undo / Redo 撤销或恢复 Track、Instrument 选择、MIDI Clip、MIDI Note 与 CC64
   Event 的已接入编辑操作。
9. 在 Vite 本地开发环境点击 Play 或按 `Space`，加载当前计划所选内置音源实际需要的采样并听见
   Note；可 Pause、继续、从 Arrangement Ruler 手动定位，并返回最后一次手动起始位置。
10. 在 Transport 查看最多两位小数的 BPM；单 Tempo 项目可直接输入新 BPM，多 Tempo 项目的
    Transport 主控显示 Playhead 所在段的当前值并保持只读；在 Arrangement 的 Tempo Track
    新增、选择、移动、调整或删除独立 Tempo Event。
11. 显式保存项目。
12. 在应用内离开 dirty 项目时选择 Save、Discard 或 Cancel。
13. 刷新页面后，从 Recent projects 重新打开最近的有效 Checkpoint。

当前可听闭环可使用 `apps/studio/public/soundbanks` 中开发者本机的 289 项采样验证资产；
Vite production build 仍禁止复制整棵 public，因此这些资产映射不是公开构建的可分发内置内容。
没有本地资产、保存了目录之外的 Sample Instrument，或浏览器拒绝 AudioContext 时，Studio 会
明确失败，不静默替换声音。

合法 MIDI Pitch 没有落在所选音源任何 Manifest Zone 内时，只跳过这一次 Note 发声并汇总为
Warning，其余 Note 照常播放；全部 Note 都没有覆盖时，Transport 保持 Stopped，不进入 Failed。
Studio 不会从低音 Pitch 猜测 Keyswitch、鼓组扩展或错误音符。

导入时会检查 MIDI 1.0 模式声明：GM1 On、GM Off、GM2 On、GS Reset 与 XG System On，包括分片的
SysEx；其他 SysEx 只计数，不推断含义。文件级结果分为 `bound`、`unbound`、`unresolved` 与
`conflicted`，导入摘要显示唯一的模式；遇到 GM Off、冲突、未检查、检查失败或未分类 SysEx 时
另加一条 notice。这一结果不写入 Project File 或 History，也不改变 Program / Channel 10 路由和声音。

采样发声使用带 `-36 dB` 下限的平方 Velocity 响应，Project Master 之后另有 `-12 dB` 输出校准，
并遵循各音源 Manifest 的 Envelope、Loop 与 Trigger 语义。复音上限为每个乐器设备 64 个、整个
项目 128 个，另有最多 16 个正在退场的被偷 Voice。达到上限时，先偷已进入 release 的 Voice，
再偷已松键或只由踏板保持的 Voice，最后才偷仍按住的 Voice，被偷的 Voice 以 6 ms 快速淡出。
这些政策没有用户设置，也没有隐藏 limiter。多音源总谱的合成 PCM 混合峰值约 `-12.9 dBFS`、
没有削波，但音色的人工听测状态仍为 `not-run`。

导入的 CC64 按 Channel 以 `64` 为阈值二值处理：踏板按下时松键不会让 Voice 提前衰减，踏板抬起
后才按 Manifest release 退场；踏板保持期间重触发同一音高会增加一个新的起音，不切断旧音。
尚不支持 Velocity Layer、half-pedal、共鸣、release sample 与物理钢琴建模。

Transport 自然结束时，已经排程的 release 与 one-shot 尾音照常响完；Pause、播放中定位与 Return
以 6 ms 快速淡出停止全部声音。

### 2.1 功能总览

| 编号                   | 功能                      | 状态         | 当前边界                                                                                                                                                                          |
| ---------------------- | ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT-ENTRY`        | 项目入口与最近项目        | **用户可用** | 新建、最近项目列表、打开、失败重试。                                                                                                                                              |
| `MIDI-IMPORT`          | Standard MIDI File 导入   | **用户可用** | 可创建独立 clean 项目，或把含 Note 的来源 Track 连同其 CC64 与初始 CC7 / CC10 作为一个原子 History 步骤追加到当前项目；Program / Channel 10 路由、Mode Binding 反馈与诊断已接入。 |
| `PROJECT-LIFECYCLE`    | 当前项目生命周期          | **用户可用** | Create、Open、Save、dirty 与 Session 生命周期。                                                                                                                                   |
| `PROJECT-NAVIGATION`   | dirty 导航确认            | **用户可用** | 应用内导航支持 Save / Discard / Cancel。                                                                                                                                          |
| `WORKBENCH-SHELL`      | DAW 工作台外壳            | **局部可用** | 全局栏、Transport、Arrangement、Track 区和编辑器 Dock 已成形。                                                                                                                    |
| `PROJECT-HISTORY`      | Undo / Redo               | **用户可用** | 当前覆盖 Instrument Track、Instrument 选择、空 MIDI Clip、MIDI Note 编辑与 CC64 Event Add / Move / Replace Value / Remove。                                                       |
| `TRACK-CREATE`         | 创建 Instrument Track     | **用户可用** | 新 Track 默认持久化选择内置 Studio Grand。                                                                                                                                        |
| `INSTRUMENT-SELECTION` | 选择 Track Instrument     | **用户可用** | 从两栏来源 Preset 目录浏览 439 项并选择 289 项采样音色；150 项合成器 Preset 会提示暂未支持；可替换 Ready / Empty / Missing Instrument，新 Track 默认 Studio Grand。               |
| `TRACK-SELECTION`      | Track 选择                | **用户可用** | Track Header、Arrangement Lane、Inspector 和 Dock 联动。                                                                                                                          |
| `MIDI-CLIP-CREATE`     | 创建空 MIDI Clip          | **用户可用** | 双击目标小节创建，支持 Clip 视觉、选择、打开与失败反馈。                                                                                                                          |
| `CONTEXT-EDITOR-DOCK`  | 上下文编辑器 Dock         | **局部可用** | 可调整布局并在 Track 全局时间轴与所选 Clip Focus Piano Roll 之间切换。                                                                                                            |
| `UI-FOUNDATION`        | Piano Black UI 基础       | **用户可用** | 设计令牌、按钮、图标按钮、菜单、Dialog、Toast。                                                                                                                                   |
| `KEYBOARD-SHORTCUTS`   | Scoped Keyboard Shortcuts | **局部可用** | 19 个 Action 集中查询；可输入或录制键位、解决冲突，设置保存在本地浏览器；尚无 Sequence 与 Command Palette。                                                                       |
| `MIDI-NOTE-CORE`       | MIDI Note 增删移动与缩放  | **用户可用** | Add、多 Note Move / Remove 与单 Note Resize 已接入 Piano Roll。                                                                                                                   |
| `MIDI-CC64`            | Sustain Pedal 控制        | **局部可用** | 导入、二值播放及 Track / Clip Focus Lane 的 Pencil Add、Cursor Selection / Move / Replace Value、Delete 已接入；half-pedal 发声尚未实现。                                         |
| `PLAYBACK`             | 播放与 Transport 执行     | **局部可用** | 本地开发环境可 Play / Pause / Return，并播放含 Note Track 内导入的二值 CC64；底层 Note / CC64 / Track 变化选择性生效。Loop、完整 Seek / Scrub、Record、Meter 尚未实现。           |
| `AUDIO-QUALITY`        | Sample Voice 音质基础     | **内部就绪** | Velocity 与输出校准、Envelope / Loop、重触发、有界复音与二值踏板由合成 PCM 报告检查；人工听测为 `not-run`。                                                                       |
| `SCORE-INSTRUMENTS`    | 总谱多乐器发声            | **局部可用** | 独立 128 项 GM 路由使用 86 项采样子集；完整目录另含 289 项采样音色。Channel 10、近似 / 不可用诊断及初始 CC7 / CC10 已接入；扩展音色人工听测为 `not-run`。                         |
| `TEMPO-CONTROL`        | Project Tempo 主控        | **用户可用** | 单 Tempo 可输入 `5..999 BPM`、最多两位小数；多 Tempo 显示 Playhead 当前值但主控只读。                                                                                             |
| `TEMPO-TRACK`          | Tempo Map 点编辑          | **用户可用** | 专用固定行支持点选、双击新增、单轴拖动、数值 BPM 编辑和非初始点删除；事实范围与瞬态可视范围相互独立。                                                                             |
| `TIMELINE-LOCATE`      | 手动时间线定位            | **用户可用** | Arrangement Ruler 支持点击 / 静默拖动、边缘自动滚动、键盘定位和最后起始位置 Return；不含可听 Scrub 或 Note Chase。                                                                |
| `PIANO-ROLL`           | 钢琴卷帘编辑器            | **局部可用** | 默认 Track 全局 Surface、可选 Clip Focus、Note 编辑、CC64 Event 编辑、Snap 与 Undo / Redo 已接入。                                                                                |

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
- SMF 内嵌名称优先；缺失时使用本地文件名。普通导入 Track 按已审核的零基 GM Program 选择音源，
  Channel 10 优先使用 General MIDI Percussion；未支持 Program 保存可见无声占位，不回退 Studio
  Grand。首个 Note 前或同 Tick 最终生效的 CC7 / CC10 初始化 Track Gain / Pan；后续动态事件与
  Bank Select 尚未应用并继续产生诊断。
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
- Arrangement：Track 控制区、时间标尺、可收起的 Tempo Track、Track Lane 和 Add Track；右侧时间内容持有唯一真实
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

Workspace 按实际剩余高度分配 Arrangement 与 MIDI Editor，默认 Dock 高 360px；常规布局保留
Arrangement 至少 200px、Dock 至少 240px，分隔条为 12px。窗口无法同时容纳时，最近操作的
编辑区优先：MIDI 优先时 Arrangement 保留 `Show Arrangement` 入口，Arrangement 优先时
Dock 保留 44px 标题栏。窗口扩大后恢复原模式和用户设定高度，临时受约束高度不覆盖偏好。
拖动分隔条或用方向键、Home / End 调整布局不产生 History 或 dirty；Escape、失焦或捕获丢失
取消正在进行的尺寸调整。

Arrangement 在最后一个 Track Lane 下方提供“导入为新 Track”操作；它是独立动作行，不代表
额外 Track，也不破坏 Track 控制行与真实 Lane 的一一对应。空 Arrangement 的空状态同样提供该
入口。菜单与动作行共享同一个文件选择和 Busy 状态，避免并发启动两次导入。

桌面布局要求至少 900 px 宽。更窄的视口显示说明与 `Back to projects`，不展示编辑工作区。

Transport 当前接通 Play / Pause、Return to Last Start Position 与 `mm:ss.mmm` 当前项目时间；
Arrangement Ruler 可点击或静默拖动定位，拖到视口边缘会连续滚动。资源 Loading 期间显示 Busy，
失败或部分支持状态提供 disabled reason / Toast。Tempo 主控遵循以下规则：

- Project 保存和 Playback 始终使用完整精度 BPM；Transport 只把显示值舍入到最多两位小数，并
  省略无意义的尾随零；仅聚焦、按 Enter 或输入与当前显示等价的数字不会反向归一化精确值；
- 单 Tempo 项目允许输入 `5..999 BPM`，输入面只接受最多两位小数；成功修改形成一个 Project
  Command / History 步骤，可 Undo / Redo；
- Playing 时开始编辑先自动 Pause，在同一连续音乐 Tick 上安装新 Tempo Map；提交后保持 Paused，
  不自动恢复。Stopped / Paused 修改同样保留 Tick，只重算对应 ProjectSecond；
- 多 Tempo 项目在主控显示 Playhead 所在 step event 的当前 BPM，并以 `MAP` 标记只读；主控不会
  flatten、缩放、删除或合并 Tempo Map，完整点编辑位于 Arrangement 的专用 Tempo Track；
- Playback Loading 期间主控暂时只读。

Arrangement 的 Tempo Track 遵循以下规则：

- 默认以 32px 摘要显示当前定位位置的 BPM 与事件数；点击 `Expand Tempo editor` 展开曲线与
  数值编辑。左右区域共享同一高度。空间不足时临时收起，保留展开偏好；扩大 Arrangement 后
  恢复。展开入口在空间不足时说明需要增加高度，Track 内容至少保留 96px。
- 收起会取消未完成的 Tempo 拖动并释放 Capture，迟到 Pointer Up 不提交；显示模式不写 Project。

- Tempo Track 固定在 Ruler / Track Actions 下方，不随普通 Track Lane 的纵向滚动离开视口；右侧
  Tempo 时间内容与 Ruler、Clip 和 Playhead 共享同一横向滚动与绝对 Project Tick 坐标；
- 点击既有点只选择该 Tempo Event；左侧控制区以永久标注的 `BAR / BEAT / OFFSET` 三段组合输入
  表达音乐位置，不要求用户记忆位置字符串或分隔符。小节和拍从 `1` 开始，`OFFSET` 从 `0` 开始并
  表示拍内精确位置；普通界面不显示 `/PPQ` 或拍内 Tick 术语，只在 Offset 帮助中解释当前拍内范围和
  `0` 表示拍头，并只在诊断 Tooltip 中保留完整 Project Tick；
- 左侧控制区以带有 `TIME` 标签的 `mm:ss.mmm` 显示只读项目绝对时间。音乐位置使用当前
  Arrangement 的固定初始拍号网格，绝对时间使用包含瞬时预览的完整多段 Tempo Map 换算；若拖拽
  预览与另一 Tempo Event 重叠、暂时无法构造合法 Tempo Map，位置字段继续更新，`TIME` 显示 `—`；
- 所选非初始 Tempo Event 可分别精确输入 BAR、BEAT 和 OFFSET；三个字段属于同一个编辑事务，在
  字段间移动焦点不提交，Enter 或离开整个组合控件只形成一次提交，Escape 恢复权威位置。输入必须是
  完整的安全整数并落在当前拍号网格与 Timeline 范围内；错误提示使用界面可见的 Bar、Beat、Offset
  术语，同位置输入不形成命令。合法输入复用既有 Move Tempo Event Command，因此仍只有一个
  History 步骤并继续遵守同 Tick 冲突规则；Project Tick `0` 初始事件的位置字段只读；
- Tempo 点拖拽由 Lane 的领域 Session 组合公共 InteractionSession 与 Commit Handoff；
  Arrangement 提供仅按 InteractionId 发布 / 清理的共享 Preview，轨道轮廓与左侧 BPM、
  BAR、BEAT、OFFSET、TIME 读取同一份瞬时预览并实时同步。预览不是 Project Fact，不进入 Pinia、
  Project File 或 History；Pointer Up 仍只交接一次既有命令，Escape、Pointer Cancel、项目切换、
  外部 Project 修改、其他编辑 Surface 接管或目标映射改变会丢弃未提交预览。Begin 冻结 Session
  身份与 revision，执行时再次校验；不能把旧拖动提交到替换后的 Project。当前共享 Preview
  由 Arrangement 组件树持有，不镜像 Project Fact 或执行 Core Command；
- 左侧控制区提供上一枚 / 下一枚 Tempo Event 导航，以及把所选事件居中带回当前 Arrangement
  视口的显式定位按钮。两种导航都只改变页面级选择与横向滚动，不移动 Playhead、不写入 Project、
  History 或文件；播放中执行时暂停 Timeline Follow，避免自动翻页立刻覆盖用户定位；
- 左侧控制区同时显示所选点最多两位小数的 BPM，可输入 `5..999 BPM` 的新值；选择和 Drag
  Preview 是页面级瞬态状态，不写入 Project、History 或文件；
- 双击 Tempo Track 空白处创建一个 step Tempo Event。横坐标转换为最近的整数 Project Tick，
  不做拍、小节或其他音乐 Grid 吸附；纵坐标按照当前可见 BPM 标尺转换为最多两位小数的值；
- Project BPM 的合法事实范围始终是 `5..999`，Studio 的统一编辑精度是最多两位小数；Tempo Track
  默认可见标尺 `40..240 BPM` 只是瞬态视图预设，不是第二套 BPM 校验边界；
- 首次显示一个 Project 时，可视标尺从默认预设向外扩展并保留余量，以包含已有合法事实；同一
  Project 内新事实超出范围时继续扩展，但删除、Undo 或 Drag Preview 不自动收缩标尺，避免编辑中
  纵轴跳动；切换 Project 时重新建立视图。可视标尺不写入 Project、History 或 Project File，也
  不能为了显示而 clamp 或修改导入值；
- Step 轮廓由每个事件生效后的水平段和事件 Tick 处连接前后 BPM 的低对比度垂直段组成，使密集
  离散事件仍能形成连续可读的起伏；垂直段只表达瞬时 step change，不代表 ramp、插值、平滑曲线
  或额外 Project Fact，Playback 仍从事件 Tick 起立即使用新 BPM；
- 每个事件以中心精确落在对应 `(Tick, BPM)` 坐标的小菱形表示；普通节点保持紧凑，Hover、键盘焦点
  和选择状态才增强节点。节点之间不绘制暗示 Linear / Ramp 的中心折线；节点形状、尺寸和视觉增强都
  只是页面表现，不改变 Project Fact、Step 轮廓或几何命中规则；
- 点、水平 Step 段和垂直过渡段都提供大于可见线宽的指针命中区；点击 Step 段选择使该段生效的事件，
  点击过渡段选择从该 Tick 生效的事件。重叠点按屏幕二维距离在有界半径内选择最近事件，等距时按
  Tick / ID 稳定顺序决定；所选轮廓和点提升视觉层级，仍可结合前后事件导航逐项检查密集 Map；
- 双击落在既有事件的命中半径内只选择该事件，不意外创建近乎重叠的新事件；超出命中区的空白位置
  才按既有规则创建事件。导入的密集事件不因显示或命中便利而删除、合并、降采样或改写 BPM；
- 拖动超过 click tolerance 后按主导方向锁定单一轴：横向只移动 Tick，纵向只调整 BPM，锁定后不在
  同一手势中切换；拖动期间只移动本地 Preview，Pointer Up 才形成一个 Move 或 Replace BPM
  Command / History 步骤，Pointer Cancel、Capture Loss 或 Escape 不提交；
- Tick `0` 的初始点允许纵向拖动和数值 BPM 编辑，但不可横向移动、删除或用键盘移除；所选非初始点
  可用左侧删除按钮或点获得焦点后的 `Delete` / `Backspace` 删除；
- 目标 Tick 已有其他 Tempo Event 时拒绝 Add / Move 并显示 Toast，不静默合并、覆盖或交换 ID；
- Playing 中真正开始修改会先 Pause，并在同一连续 Tick 安装新 Tempo Map；提交后不自动恢复。
  Loading 期间仍可选择点，但所有事实修改暂时禁用。

以下 Tempo 能力尚未提供，当前的 `STEP` 标记和轮廓视觉不暗示它们存在：

- Linear / Ramp / Bézier Tempo、曲线控制柄、曲线采样生成或密集事件自动简化；
- 连续 Pencil 绘制、独立 Select / Draw 工具、框选、多事件批量编辑和键盘位置微调；
- Tempo Snap / Grid、纵轴缩放、Arrangement Zoom，以及可停靠的完整 Tempo Inspector；
- Time Signature Event 编辑、SMPTE 位置编辑、Metronome、Tempo Automation 与通用 Automation
  Lane 平台；
- 使用 D3 或其他曲线库。只有真实 Linear / Ramp 产品切片确定数据模型、命中、编辑与 Playback
  语义后，才重新评估曲线渲染依赖。

以下控件仍只是诚实占位：

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
  MIDI Clip，Tempo Event Add / Move / Replace BPM / Remove，以及 MIDI Note Add、Selection
  Move、单 Note Resize 与原子删除完整 Note Selection。
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

常用的默认键位如下，用户可以修改：

- `Mod+S`：当前项目 dirty 且不在保存中时执行 Save；
- `Mod+Z`：当前 Session 可以 Undo 时执行 Undo；
- `Mod+Shift+Z`：当前 Session 可以 Redo 时执行 Redo；
- `Control+Y`：兼容 Windows 常用 Redo Binding。
- `Space`：当前计划可播放且没有导航 Modal 时 Play / Pause；Loading 期间不重复触发。
- `Escape`：先取消活动的 Note / CC64 / Track Pencil / Tempo 手势或 Timeline Locate；取消不清空选择。
  没有活动交互时，清空聚焦的 Note / CC64 选择。
- `Delete` / `Backspace`：删除聚焦编辑区域中选中的 Note / CC64，或聚焦且选中的后续
  Tempo Event；初始 Tempo Event 不可删除。事实删除形成一个 Command / History 步骤。
- `Enter`：聚焦 Arrangement Clip 时打开它；聚焦 Track Bar 时创建并打开 MIDI Clip。
- `F8`：把焦点移入通知区域；打开的 Menu / Modal 仍然优先接管输入。

产品规则：

- `Mod` 在 macOS 对应 Command，在 Windows / Linux 对应 Control；
- Action 不可用时不执行，也不伪造业务结果；
- 普通 Input、Textarea、Select、Contenteditable 和 IME composing 默认不触发编辑快捷键；
- 打开的 Menu / Modal 接管输入；后台优先级为当前编辑交互 → 聚焦编辑器 → Workbench → Global；
- 接受调用后立即阻止浏览器默认行为，业务成功、未应用或失败由完成结果独立表达；
- Action 目录与物理键位在应用装配时建立，页面切换只替换当前目标；旧组件的延迟清理不能
  释放新目标；User Keymap 替换只更新差异注册，应用释放时卸载全部 Listener；
- 快捷键调用现有 Save / History / Playback / Editor 权威，不保存它们的状态副本；
- Track 音符区域聚焦时不能删除旧的 CC64 选择；通过键盘聚焦回 Lane 后恢复 CC64 操作。
- Mount 不抢占选区目标；实际 Focus 激活选择能力。活动手势拥有独立的 Cancel 能力，
  即使焦点已经移动，也能取消；仅仅聚焦 Tempo point 不会自动选择它。
- 另一个编辑 Surface 开始交互时取消旧手势，旧 Pointer End、旧动画帧和延迟卸载不能影响
  新手势。Scope、Active Clip、CC64 Channel、Project / Session 切换，以及 Dock 最小化或
  关闭均清理对应未提交操作，不产生 History。正常完成仍保留一次 Command 与权威投影交接。
- Project / Add track / Piano Roll 菜单与快捷键 Dialog 打开时屏蔽后台 Action，包括用户改绑
  的 Cancel；Escape 先关闭当前层，关闭后的下一次 Escape 才路由到活动交互。
- 按钮自身的 Enter / Space、Slider / Splitter 的导航键以及字段的提交 / 取消协议优先。
  Undo / Redo 允许长按重复，其余 Action 默认只在首次按下时调用。

其余 Action 也都有默认键位：`1` / `8` 选择 Cursor / Pencil，`J` 切换 Snap，`P` 打开 MIDI
Editor，`Alt+K` 打开快捷键设置，`Home` 返回最后启动位置，`Mod+I` 导入为新 Track，
`Mod+Alt+O` 返回 Projects，`Mod+Alt+Shift+M` 从 MIDI 新建项目。完整映射以应用内的快捷键
设置为准。Follow 的暂停由实际的导航和滚动触发，不依赖固定的按键集合。

菜单、按钮与快捷键调用同一个 Action，读取同一份可用状态与禁用原因，菜单显示平台化的当前
键位。Save、Undo／Redo、Play／Pause、Return、Projects、两种 MIDI Import 与 Open MIDI
Editor 都已接入。导入期间阻止重复选择文件，取消选择后可以立即重试；Return 在播放加载期间
也能停止并回到起点；返回项目列表仍经过 dirty 确认。从 Project Menu 离开未保存项目时，
Save／Discard／Cancel 确认框接管输入，Cancel 或 Escape 后焦点回到 Project Menu 按钮。

Clip Focus 的 Note／CC64，以及 Track Scope 中 Active Clip 的 CC64，提供右键 Delete
Selection／Clear Selection。右键未选中的对象时先单选它，右键多选成员时保留多选；没有可执行
动作或命中不可编辑对象时不显示菜单。删除多个对象仍是一个 History 步骤，清空选择不改
Project。菜单打开期间接管键盘，Escape 关闭后焦点回到原编辑区域；切换编辑目标时旧菜单关闭。
Track Scope 的完整 Note 选择与编辑尚未实现。

快捷键设置从项目入口的 Keyboard shortcuts 按钮或 Project Menu → View → Keyboard shortcuts
打开。目录列出 19 个 Action，支持中英文检索与已分配／未分配／用户覆盖筛选，显示当前键位、
默认键位、来源（Default / User）、作用区域与重复政策，并单列 Widget / Modifier 帮助。

- 键位可以手动输入、录制，或直接选择 Escape / Delete / Backspace。录制只改草稿：Escape 取消
  录制，无修饰键的 Delete / Backspace 清空当前草稿行，失焦或关闭窗口结束录制；录制期间会
  打断它的编辑操作被禁用。
- 可以添加／移除绑定、单项恢复和全部恢复。Restore defaults 只改草稿，Save 后生效，Cancel
  丢弃。
- 设置区分互斥区域共用、明确的优先级和真实冲突。真实冲突必须改键或确认重新分配，一次保存
  只移除其他 Action 的冲突键。Tab / Shift+Tab 留给焦点导航；被浏览器或系统占用的常见键位会
  说明具体用途，没有提示不代表页面一定能收到输入。
- 设置保存在当前浏览器独立的版本化记录中：没有覆盖时跟随默认，空数组表示主动解除，恢复默认
  删除覆盖。保存成功后菜单与按钮提示立即更新，旧键失效。注册或保存失败保留旧路由和提示；
  非法或冲突的记录退回默认，未知 Action 保留但不执行。整份记录损坏或版本未知时不阻止启动，
  也不自动重写，可以在设置中确认重置。改键不影响 Project dirty、History 或播放。

尚未提供 Sequence 与 Command Palette。

Action 与上下文的实现见 [Workbench](./apps/studio/src/workbench/README.md)，键盘分派见
[Keyboard](./apps/studio/src/workbench/keyboard/README.md)。

### 5.5 `PLAYBACK` 播放与播放中编辑

**局部可用**

播放过程中一旦 Project Commit 成功，Commit 后的 Project Facts 就立即成为权威。声音执行失败
不能撤销合法编辑，也不能让旧 Project Facts 继续冒充当前项目内容。

Studio 当前使用 `200 ms` look-ahead 提前安排即将发声的 Note。它只是内部调度参数，不是用户
可见的编辑冻结区，也不决定一项编辑是否生效。产品行为取决于 Commit 到达时，一次 Note 发声
处于以下哪个阶段：

主时间轴是从 Project Fact 派生的视图与播放范围：至少显示项目起始拍号的 150 小节；内容接近或
超过该范围时，最远 Clip 末端先向上补齐到完整小节，再保留 8 个完整尾部小节。短项目播放完已有
Note 后继续静音推进到时间轴末端再自然停止；完全没有可听 Note 的 Empty Plan 仍不能启动。
精确内容末端与派生时间轴末端保持分离，该范围不写入 Project File，也不会使新旧项目产生 dirty。

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

Stopped / Paused 定位保持原状态；Playing 定位以快速淡出停止当前全部声音，再从目标继续安排；
Loading 定位更新 pending start；Empty / Blocked 仍允许移动位置但 Play 不可用。定位到
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
- Tempo 主控已经按全局时间映射规则接入；Velocity、Channel 与全局路由的可见编辑入口仍未交付，
  表中对应行只约束这些能力未来接入后的产品行为。

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

- 新 Track 或已经选择目录内定义的 Track 显示当前音色；新 Track 默认仍是 `Studio Grand`。
- 基于 Reka UI Popover 与 Vertical Tabs 的应用内 `Built-in sound` 选择器，左侧展示来源目录的
  15 个类别，右侧展示当前类别的全部 Preset，不调用操作系统原生下拉菜单。
- 439 个来源 Preset 均可见；289 项 MIDISampleSynth 可播放。需要 VASynth 的 139 项与需要
  FMSynth 的 11 项点击后只提示暂未支持，当前 Track 不变。名称和说明保持单行，空间不足时
  整体省略，不做单词截断换行。
- 旧项目中严格匹配 `seele.instrument-slot` V1 空 Descriptor 的 Track 显示
  `No instrument selected`，等待用户从同一选择器显式选择。
- 用户选择后才执行一次 Instrument Device Replace Command；Device ID 与 Track topology 保持
  不变，项目变为 dirty，并形成一个 Undo / Redo 步骤。
- Undo 恢复旧 Device，Redo 恢复新音色；Save / Reload 保留当前选择。
- 未知、版本不兼容或状态不兼容的 Descriptor 显示 `Missing instrument` 和已保存的
  `soundbankId` 或 `typeId`，继续原样 round-trip；用户可以显式替换，但 Studio 不自动 fallback。
- MIDI 导入为未审核 Program 保存的严格 V1 占位显示 `MIDI Program N unavailable`，明确说明
  Track 在选择替代音色前保持无声；它与损坏资源或未知 Device 的 Missing 状态不同。
- Command 失败时旧 Descriptor 保持不变，并通过 Toast 显示原因。
- 展示始终从 Active Project 的 Snapshot 派生，不在 Pinia 或组件本地复制 Device Fact。

V1 当前是按来源类别分组、由 Reka UI 提供可访问交互语义的固定内置 Preset Browser；它还没有
跨字段搜索、Preview Audition、远程 Preset Library 或插件管理器。选择成功后只有主 Timeline
Transport 播放已有 MIDI Note。Catalogue Entry 已配置但本地 Manifest/WAV 缺失属于后续播放
资源失败，不回滚合法的 Project Commit。

目录所有权、三态投影与命令 / 资源失败边界见
[Studio Built-in Instrument Catalogue V1](apps/studio/docs/built-in-instrument-catalogue-v1.md)。
Program / Channel 10 的导入优先级、占位事实与诊断边界见
[Studio MIDI Program Import Routing V1](apps/studio/docs/midi-program-import-routing-v1.md)。
完整 Preset 目录、独立 GM 路由、资产准备、控制元数据执行与合成器暂缺边界见
[Studio Built-in Preset Catalogue and General MIDI Routing V1](apps/studio/docs/general-midi-built-in-routing-v1.md)。

### 6.3 `MIDI-CLIP-CREATE` 创建空 MIDI Clip

**用户可用**

在 Instrument Track 的 Arrangement Lane 中创建空 MIDI Clip：

- Arrangement 按项目起始拍号展示至少 150 小节；内容接近或超过该范围时，时间轴从最远 Clip
  末端向上补齐到完整小节，并额外保留 8 个完整尾部小节。
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

Vue 状态的选择规则见[工程代码准则](CODE_GUIDELINES.md)第 9 节。

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

通用 `UiSelect` 用于 MIDI Editor 的 Active Clip、CC64 Channel 和 Keyboard Shortcuts 设置。
展开列表最多显示约 8 个标准选项，并根据可视窗口与 Trigger 位置进一步限制高度；完整选项
保留在带可见滚动条的内部列表中。选中项打开时可见，方向键与 Home / End 可导航，Enter
确认，Escape 取消并返回 Trigger。显示与滚动调整不修改 Project Facts。

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
Clip / Note 放置 Command 已由 Track 模式 Pencil 使用。Studio 的
`edits.notes` 校验 Active Project 已就绪、手势目标未过期，查找 Clip 与 MidiSource，把
Clip-local Tick 映射为 Source-local Tick，生成 Note ID，并使用 Velocity 100、UI Channel 1
执行 Add Note Command，返回 `NoteId + Commit`；尾部剩余时间不足期望 Duration
时只创建剩余的正 Tick。移动和删除时对当前 Clip 的同一 MidiSource 分别执行
一个 `MoveNotesCommand` / `RemoveNotesCommand`，全部目标在建立 MutationPlan 前完成验证。
单 Note Resize 由 Editor Common 解析最终 Source-local Start / Duration，`edits.notes`
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
Clip 全高区域、独立 Header、可见 Note、Active Clip 与原子 Pencil 放置；公共标题栏可以切换到既有 Clip Focus
Surface，切换只改变 Studio 应用偏好。两个模式都显示来自共享 Transport 位置的 Playhead，Track
模式另提供独立分页 Follow。Track Cursor 的完整 Note Selection / Move / Resize 尚未接入，不能
从双模式 UI 推断为已经交付。

Track Clip Header 位于 Ruler 与 Note 视口之间，每行 24px；重叠 Clip 按时间区间分行，最多
显示两行，更多行在 Header 内纵向滚动，键盘聚焦可带入屏外 Header。Header 与 Note / CC64
共用 Track 时间映射，Pitch 滚动不移动 Header。两种 Tool 均可点击 Header 激活 Clip；此入口
尚不支持 Clip Move / Copy，不显示拖动光标。极短 Clip 也可通过工具栏 Active Clip 列表选择。

Clip 使用贯穿 Note 视口的淡色背景与两端边界，背景不参与 Pointer 命中；时间边界延续到 CC64
事件区及安全间距。选择 Header 不修改 Project Facts、History 或 dirty。共享 MidiSource 的每个
Note 投影以 `(ClipId, NoteId)` 区分，NoteId 仍代表原 Source 事实；完全重叠时 Active Clip 的 Note
与 CC64 Marker 位于上层。点击 Note 使用该实例的 ClipId 激活目标，不按相同 NoteId 猜测归属。
Project Core 当前仍强制 Clip 与 Source 一对一；显示层的实例身份不意味着已开放 Linked Clip 创建或写回。

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
- 中立 Interaction Session 与领域 Operation 组合，Note、CC64、Track Pencil、Tempo 和
  Locate 复用一次交互身份、Preview、cancel 与完成领取；事实编辑组合可选权威 revision 交接。

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
- DOM 标尺、覆盖 MIDI 0–127 的可滚动钢琴键盘、焦点与可访问 Note / Selection 摘要；
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
- Pointer Down 冻结 Session 对象身份、Clip / Source、Project revision、Note Facts、
  Selection、Viewport、Grid、Snap Preference、Hit 与 origin Modifier；Add / Move / Resize
  均在实际提交入口验证冻结目标与版本，外部修改取消手势，异步通知到达前的 End 也无效；
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
- Clip 切换创建新的 Editor Session，不继承前一个 Clip 的 Selection；
- Note Surface 映射改变、消费者或投影失败会关闭未提交交互并释放捕获；迟到 End、重复结果
  和旧提交回告不能影响新手势。该映射政策不限制 Timeline Locate 的 Edge Scroll。

完整边界与新对象接入步骤见 [Editor Interaction V1 决策](./packages/editor/docs/editor-interaction-architecture-v1.md)。
Tempo、CC64、Track Pencil 与 Locate 已完成语义迁移；Locate 保留 Playback 定位会话与
Edge Scroll，取消恢复原播放位置及 Follow 状态，不写 Project 或 History。

Selection 只保存稳定 `NoteId`，属于当前 Clip Editor lifetime；它不进入 Pinia、Project
History、Snapshot、Checkpoint 或 IndexedDB。Note 移出当前可见 Viewport 时仍保持选中；
Note 被删除或移出当前 Clip Source 时间窗口时由权威 Query 清理。

Track 与 Clip Focus 共用两种 Pitch 显示模式，初始中心为 MIDI 60：

- `Standard keys` 固定每个半音 20 CSS px；面板变高只增加可见键数。
- `Pitch range` 保留目标音域跨度，初始为 25 键；按面板高度适配行高，并限制在 16–48 CSS px。
  空间不足时保留可操作行高，通过滚动访问目标范围内的其他音高；空间过大时显示周边音域。
  `− / +` 调整目标跨度，范围为 3–128 键。
- `Fit notes` 显式居中并适配当前 Scope 全部音符音域，两端各留 2 半音余量，受 MIDI 边界与
  行高限制；无音符时禁用。增删音符不会自动改变中心或音域。
- 键盘或 Note 区的纵向滚轮、右侧独立滚动条可访问完整 MIDI 音域；横向滚动与 Shift 滚轮
  保留时间轴语义，CC64 和 Ruler 不随 Pitch 滚动。
- 面板高度、Scope 和模式变化保留中心音高，在 MIDI 边界处限制到合法滚动范围。显示模式、
  中心和目标跨度属于应用生命周期的 UI Preference，不写入 Project、History 或 dirty。
- 滚动、缩放或面板变化使捕获时的坐标映射失效时，同步取消未提交手势；迟到 Pointer Up 不写入。

常用 Tool、Snap、Active Clip 和 `Fit notes` 保留在工具栏；`Pitch` 打开模式与缩放设置面板。
CC64 Channel 放在 Lane 标题栏，操作指引独立显示于 Note 区边缘，不挤压工具栏。控件保持单行，
长 Clip 名省略，宽度不足可局部横向滚动。Arrangement 和 Piano Roll 的编辑滚动容器禁用边缘回弹，
菜单列表仍保留独立滚动行为。

Track 的 Grid 与 Note 按水平可视窗口及相邻页缓冲绘制，纵向滚动不再更新整条长 Clip 的屏外
节点。绘制裁剪保持全局时间与编辑坐标不变；Clip Focus 继续显示完整 Clip。排查方法与结果见
[长 Clip 滚动排查](./apps/studio/docs/piano-roll-scroll-performance.md)。

当前明确限制：

- 不支持 looped Clip 编辑，不能把循环实例错误显示成非循环 Source；
- Grid Preset UI 当前只显示已确认的 `1/16`，尚不能选择其他直线、三连音或附点值；
- Clip Focus 在横向显示完整 Clip，Track Scope 已有横向 Scroll，二者尚无时间轴 Zoom；
- 用户可以创建、选择、移动、调整长度和删除 Note，但还不能编辑 Velocity；
- Canvas Note Adapter 可以显示 Resize Preview，但尚未提供 Canvas Hit；当前产品默认使用
  DOM Note Renderer 完成 Edge Hit。

### 8.3 `MIDI-CC64` Sustain Pedal Controller Lane

**局部可用；导入、二值播放与 Event 编辑已有用户界面**

Project Core 把每个 CC64 Event 保存为 MidiSource-owned 独立事实，保留 Tick、MIDI Channel 与
原始 `0..127` Value，不把踏板状态烘焙进 Note Duration。Piano Roll 底部的 CC64 Lane 使用
Step Segment 显示所选 Channel 的事件；`64` 是当前二值播放的 Pedal Down Threshold，但 UI
不会把原始 Value 量化为只有 `0 / 127`。右端点 Event 作为 Terminal Marker 保留和显示，却不
改变刚结束的半开 Clip 播放窗口。

Lane 保留在 Note 区下方，标题栏、12px 拖动柄与事件区有独立边界；默认事件区高 88px，可调整
至 64–240px 并收起 / 恢复。上下各留 12px 安全间距，127 / 0 Marker 与数值坐标处于事件区
内部，横向仍与 Note、Ruler、Playhead 对齐。布局优先保留至少 96px Note 高度；空间不足时
先限制 Lane 高度，仍不够则临时收起，扩大后恢复原偏好。Track / Clip Focus 共用展开与高度
偏好，不写入 Project 或 History；收起卸载 Lane 并取消未完成的手势。

CC64 Channel Selector 在界面显示 `1..16`，项目事实仍使用 MIDI `0..15`。该选择与 Tool、Snap、
Scope 一样只属于 Studio 应用生命周期 Preference；切换 Channel 不执行 Command，不产生 dirty
或 History。

Pencil 只在 Pointer Up、未越过 Drag Threshold 且起点为空白时产生 Add 意图。X 使用当前
Grid / Snap 的单元左边界，Y 解析为最接近的原始 MIDI Value。`edits.sustainPedal` 在当前
Snapshot revision 上重新验证 Clip、MidiSource 与 CC64 Partition，生成 Event ID，并执行一个
`AddMidiSustainPedalEventCommand`；一次 Click 只形成一个 Commit 和一个 History 步骤，失败不写
Project 并显示 Toast。

两种 Scope 的写入边界不同：

- Clip Focus 把局部 Tick 映射到该非循环 Clip 的 Source Tick，允许在闭合右端添加明确的
  Terminal Event；
- Track Scope 显示当前 Instrument Track 全部 Clip 的 CC64 投影，Active Clip 完整强调、其他
  Clip 弱化、looped Clip 显示为不支持；
- Track Scope 只向用户明确选择的非循环 Active Clip 写入，Pointer 必须位于其闭合窗口内；
  V1 不为 CC64 自动新建或延长 Clip，也不在重叠或空白区域猜测 Source；
- 无 Active Clip、Pointer 越界、looped Clip、stale revision 或事实图缺失时拒绝整个意图。

Cursor Click 只选择 Active Clip 中当前 Channel 的 Event，修饰键 Click 切换 Selection，空白 Click
清空。超过共享 Drag Threshold 后按主导轴锁定：横向拖动对完整 Selection 产生一次批量 Move，
纵向拖动只对锚点产生一次 Replace Value；Preview 不写 Project，成功提交后保留到 Lane Snapshot
到达 commit revision。聚焦 CC64 Lane 时，`Delete` / `Backspace` 复用既有 Piano Roll Action，
一次删除完整 Selection；Track Scope 的非 Active Clip Marker 与 looped Clip 仍只读。

每次 Move、Replace Value 或 Remove 最多执行一个 Project Command / History 步骤；Tick / Channel
碰撞、stale revision 或事实图缺失时拒绝整个编辑并保留合法 Project。当前不提供框选、精确数值
输入、原子批量 Value Transform 或 looped Clip 实例编辑。它仍不是通用 Controller / Automation
平台，也不代表 Audio Runtime 已支持连续 half-pedal 响应。

### 8.4 Project File 与 Checkpoint

**内部就绪**

Project Core 已具备：

- Project File（`formatVersion: 3`）：文件就是项目的存储表。只读当前版本，其他版本以
  `unsupported-format-version` 拒绝，不做迁移。
- 与存储无关的 Checkpoint 保存与恢复协调；Studio 用它把项目保存在 IndexedDB。

当前没有面向用户的项目文件导入 / 导出 UI；Standard MIDI File 导入是独立的交换格式入口，不替代
Project File。各包的职责与依赖见 [ARCHITECTURE](ARCHITECTURE.md) 与各包 README。

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

- 运行时扫描与安装 Soundbank。当前只能使用开发工具规范化过的 289 个开发者本地 MIDISampleSynth
  Soundbank（`public/soundbanks`），其中 GM Percussion 来源带 one-shot 与 Hi-hat Choke
  Manifest。这些资源不属于产品资源，Vite 生产构建不把 public 复制到 dist。
- M4A 自动协商、远程 / 安装式 Soundbank 获取与可分发内置资产；当前 Studio 只从本地 Vite dev
  同源路径准备 Manifest/WAV。
- JSON 合成器定义的解析与 VASynth / FMSynth 合成引擎；完整 Preset 目录中的 139 个 VASynth、
  11 个 FMSynth 当前只显示暂未支持，其中 20 个也是 GM 导入路由候选。
- 跨字段 Instrument 搜索、Preview Audition、远程 Preset Library、第三方 Device UI 与插件管理；
  当前固定两栏内置 Browser 已能浏览全部 439 个来源 Preset，并可选择 289 个采样音色。
- 通用 Web Audio Graph、AudioWorklet 与电平；当前只有 Sample Voice 所需的最小 master output。
- Velocity Layer、CC64 half-pedal 发声、共鸣、release sample、pedal noise 与物理钢琴建模；
  当前 Velocity 只改变单层 Sample 振幅，CC64 Lane
  保留原始 Value，但 Audio Runtime 仍以 `64` 阈值作二值 Gate Release，Sustain Loop 也不等于
  Sustain Pedal。
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
    当前 Project Tempo Map 播放，来源 Tempo / 拍号不得静默覆盖或合并；两种模式共用 Studio
    Program / Channel 10 工厂：精确映射保存对应 Sample Device，未支持 Program 保存可见无声
    Placeholder，不能回退 Studio Grand 或伪造不存在的 Soundbank；首个 Note 前或同 Tick 最终
    生效的 CC7 / CC10 写入既有 Track Gain / Pan，后续事件不伪装成 Automation。
    “新 Track”入口打开文件选择器时把连续 Playhead 位置转换为最近的整数 Project Tick 并冻结；
    来源文件 tick 0 映射到该位置，不再按拍或小节二次吸附，并保留各 Track 的前导空白和相互时间
    偏移。
    两种 MIDI 导入模式都由 Studio 使用现有 Track Palette 分配持久化颜色；首条避免与前一条既有
    Track 同色，批次内相邻 Track 继续避重，Clip 保持 `null` 以继承 Track 颜色。
11. Project Tempo 的可表示范围是 `5..999 BPM`；MIDI 导入保留范围内的完整浮点值和所有有效
    Tempo Event，不静默 clamp、倍增或按密度删除。
12. Tempo 主控只舍入显示，不修改隐藏精度。单 Tempo 项目可从主控编辑；多 Tempo 项目主控显示
    Playhead 当前值但只读，并从专用 Tempo Track 编辑事件。Tick 0 初始点不可移动或删除，事件
    Tick 不得碰撞；一次点拖动只形成一个 Command。Playing 编辑必须先 Pause，并在新 Tempo Map
    下保留连续 Tick；不得自动恢复播放或把 Tempo Map 隐式压平。
13. 未知或不可用 Device 必须保存并显示 Missing，不能静默替换声音。
14. 普通 Clip 复制的长期产品语义是创建独立 MIDI Source 与新 Note 身份。
15. Move、Resize、Split 等编辑算法必须在对应 Command 实现前确定产品边界。
16. 未接通的控制必须禁用或明确提示不可用，不能制造功能已存在的错觉。
