# Piano Roll Contribution

Studio 的 MIDI Note 与 CC64 编辑入口，遵循根 [工程代码准则](../../../../../CODE_GUIDELINES.md)。

## 目录与入口

| 位置                                   | 职责                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `components/clip-focus/`               | Clip Focus 组件、五个私有 hooks 与局部共享类型                                          |
| `components/track-surface/`            | Track Surface、独立 Toolbar 与六个私有 hooks                                            |
| `components/sustain-pedal/`            | 两种 Scope 共用的 CC64 Lane、五个私有 hooks 与局部契约                                  |
| `components/PianoRollToolControls.vue` | 两种 Surface 共用的 Pencil / Cursor / Snap 视图                                         |
| `types/`                               | 跨子模块共享的 Presentation、Preference、Intent、Lane Handle / Placement 与 Action 契约 |
| `interaction/`                         | 将 Editor Intent 转成既有 Coordinator 调用，处理提交回告和失败反馈                      |
| `presentation/`                        | Snapshot 投影、Renderer 选择、Theme、Pitch Layout、Channel 选项和反馈文案               |
| `state/`                               | 应用生命周期的轻量 Piano Roll Preferences Store                                         |
| `actions/`                             | Tool Action 定义、Vue 注册与 Context Menu                                               |
| `playhead/`                            | Clip / Track 时间位置投影和显示                                                         |
| `__tests__/`                           | Feature 行为测试及测试专用 support                                                      |

组件保留 DOM refs、Props / Emits、模板、无障碍语义及组合顺序；私有 hooks 不作为跨子模块 API。
`PianoRollToolControls` 与 `PianoRollTrackToolbar` 只接收状态并上报意图，Surface 各自只注册一次
Tool Action Target。Active Clip 与 Channel 下拉框使用 `UiSelect` 的 small 规格和统一菜单外观。

## 推荐阅读顺序

### Clip Focus

从 [ProjectPianoRollSurface](./components/clip-focus/ProjectPianoRollSurface.vue) 开始：

1. [useClipNoteModel](./components/clip-focus/hooks/use-clip-note-model.ts)：Editor Selection
   Session、Note Read Model、Project 订阅与 Viewport Observer。
2. [useNoteInteraction](./components/clip-focus/hooks/use-note-interaction.ts)：Browser Pointer
   Adapter、Editor Interaction Session、capture bounds 与 Intent 转交。
3. [useNoteRendering](./components/clip-focus/hooks/use-note-rendering.ts)：权威 Note、Selection、
   Preview 与 Snap Guide 到 Renderer 的投影。
4. [useEditingActions](./components/clip-focus/hooks/use-editing-actions.ts)：Note / CC64 Focus、
   Context Menu、Delete、Clear 与 Cancel 路由。
5. [useClipSustainPedal](./components/clip-focus/hooks/use-clip-sustain-pedal.ts)：Clip CC64
   Read Model、Channel 与 Placement。

局部共享契约见 [clip-focus.ts](./components/clip-focus/types/clip-focus.ts)。

### Track Surface

从 [ProjectPianoRollTrackSurface](./components/track-surface/ProjectPianoRollTrackSurface.vue) 开始：

1. [useTrackLayout](./components/track-surface/hooks/use-track-layout.ts)：Timeline Bars、内容宽度、
   可见 Note、Clip Windows、Note 到 Clip 的映射，以及 Viewport 测量。
2. [useTrackRendering](./components/track-surface/hooks/use-track-rendering.ts)：Grid / Note Renderer
   的创建、投影、失败反馈与释放，消费 Layout 提供的 Viewport。
3. [useTrackFollow](./components/track-surface/hooks/use-track-follow.ts)：Playback 分页跟随、
   用户暂停 / 恢复，区分程序滚动，并使释放后的排队回调失效。
4. [useTrackActions](./components/track-surface/hooks/use-track-actions.ts)：Active Clip、Note Hit
   激活 Clip、CC64 Selection Target、Context Menu 与 Cancel 路由。
5. [useTrackPlacement](./components/track-surface/hooks/use-track-placement.ts)：Hover、放置候选、
   Preview、Pointer Adapter 与既有 Track Note 放置用例。
6. [useTrackSustainPedal](./components/track-surface/hooks/use-track-sustain-pedal.ts)：Track CC64
   Read Model、Placement 与 Warning / Danger 反馈。

完整 Toolbar 的视图与样式由
[PianoRollTrackToolbar](./components/track-surface/PianoRollTrackToolbar.vue) 拥有。
`TrackPlacementPreview` 只被一个 hook 使用，保留在该文件内，不预建空的 `types/`。

### Sustain Pedal Lane

从 [PianoRollSustainPedalLane](./components/sustain-pedal/PianoRollSustainPedalLane.vue) 开始：

1. [useSustainPedalViewport](./components/sustain-pedal/hooks/use-sustain-pedal-viewport.ts)：测量、
   Value Lane Viewport、ResizeObserver 与 fallback resize listener。
2. [useSustainPedalSelection](./components/sustain-pedal/hooks/use-sustain-pedal-selection.ts)：
   唯一 Selection 写入口、Editing Scope 解析与权威更新后的协调。
3. [useSustainPedalInteraction](./components/sustain-pedal/hooks/use-sustain-pedal-interaction.ts)：
   组合已有 Session、Pointer Adapter、冻结的 Begin 配置和 Intent Handler。
4. [useSustainPedalProjection](./components/sustain-pedal/hooks/use-sustain-pedal-projection.ts)：
   Occurrence、Segment、Marker、Threshold、Preview 与无障碍摘要的纯派生。
5. [useSustainPedalActions](./components/sustain-pedal/hooks/use-sustain-pedal-actions.ts)：
   Delete / Clear、Focus、Context Menu 与对外 Handle；保留 Linked Clip occurrence 身份校验。

Props 和 Read Model 联合类型见
[sustain-pedal-lane.ts](./components/sustain-pedal/types/sustain-pedal-lane.ts)。Lane 通过 feature
共享的 [Handle / Placement](./types/piano-roll-sustain-pedal.ts) 与两种 Surface 协作，不暴露 Session
或内部 refs。Projection 内单独使用的类型仍与其实现共置。

## 失效与资源清理

| Owner         | 创建与正常释放                                                                                                                                      | 失效来源与时机                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Clip Focus    | 创建 Selection；mount Renderer、Input、Viewport / Read Model。释放 Input / Interaction，再释放 Selection / Read Model / Observer，最后释放 Renderer | Clip / Source / Session 变化同步取消后重建；Selection 与 authority revision 由已有 Editor Session 协调                              |
| Track Surface | mount Renderer、Input、Viewport Observer；逆序释放 Observer、Input、Renderer，同时关闭 Follow 的排队回调                                            | Viewport 变化同步取消放置；Project / Track / Active Clip / revision / Tool 在 pre watcher 取消；Follow 位置在 post watcher 消费     |
| CC64 Lane     | 创建 Interaction Session 与订阅，mount Input 后观察 Viewport；释放 Observer、Input、订阅与 Session                                                  | Viewport 变化同步取消；Project / Scope / Clip / Source / Channel 在 pre watcher 取消并清空选择；revision 先通知 Session，再协调选择 |

资源组合由组件显式安排，不依赖多个 `onMounted` 的注册顺序。部分初始化失败立即回收已创建
资源，`dispose` 幂等，已排队的 Resize / Follow 回调在释放后失效。Viewport 尺寸变化取消捕获，
不能沿用旧坐标完成写入。CC64 revision 更新保留提交到权威投影的 Preview 交接。
普通资源的顺序按依赖逆序；Clip Focus 为释放 Pointer Capture，优先关闭 Input / Interaction。

真正的手势状态机、唯一完成领取和 revision 交接仍由 Editor classes 拥有，Hook 不建立第二份
状态权威。Track / CC64 的中立语义协议迁移仍属于 G3，本次目录拆分不代表迁移完成。

## 依赖与共享边界

- Project Command 能力来自 `workbench/project/` 的 Typed Context；快捷键与菜单沿统一
  Studio Action 路由执行。
- Project Workspace 继续拥有 `project-workbench-selection-store.ts` 的 Arrangement Selection；
  Track 通过该 Store 选择 Active Clip，目录调整不创建第二份 Selection 权威。
- Timeline 宽度规则与分页计算继续消费 Project Workspace 的 `timeline/scale.ts` 和
  `timeline/layout.ts`，跨 feature 归属治理另行评估。
- 共享类型直接从 `types/` 导入；局部共享类型进入所属子模块 `types/`，不从 Vue 实例反推。
  有限 discriminator 常量可与契约共置，不加载组件或 hook 的实现。
- Piano Roll InjectionKey 统一登记在 [Studio Symbols](../../symbols.ts)，Context 只负责类型化
  注入。Editor 手势身份通过其内部 Symbol 工厂每次创建。
- 架构检查保护私有 hooks / types、契约依赖方向以及生产代码与测试支持边界；不通过总 barrel
  隐藏依赖，也不按文件行数机械拆分。

## 当前能力

当前已实现：

- 从 Snapshot 派生选中 Clip 的非循环 `PianoRollClipContext`、Track Color 和 muted；
- 在 Context Editor Dock 组合真实 Project Query / Subscription；
- DOM 标尺、MIDI 48–72 钢琴键盘、焦点与可访问 Note 摘要；
- `@seele-daw/editor` 提供的 Canvas Grid、Note Scene 与 keyed DOM Note
  Renderer；Canvas Note Adapter 保留为可替换实现；
- Clip-scoped Note Selection、DOM Hit、Primary Pointer Click 与 focused Escape；
- 应用生命周期级 Pencil / Cursor、Snap、`1/16` Grid，以及默认 `Track` / 可选 `Clip Focus`
  Scope Preference Store；Canvas Grid 消费其 Subdivision Tick；
- MIDI Editor 公共标题栏提供始终可见的 `Track` / `Clip Focus` 单选切换；空 Clip Focus 状态仍
  可切回 Track，切换不执行 Project Command；
- 可见 Pencil / Cursor 单选工具与 Snap Toggle；
- Pencil 空白 Click 的 X / Tick、Y / Pitch Placement、Clip 尾部限制与 Add Note Command；
  Snap 开启时 X 固定落在 Pointer 所在 Grid 单元的左边界；
- 创建成功后只选中新 Note 并保持 Pencil，创建失败时保留 Project 与 Selection 并显示
  Toast；
- Add Note 的 Undo / Redo 权威回读与失效 Selection 清理；
- Cursor Note Body Drag 的单 Note / Selection Move、Absolute Grid Coordinate Snap、Preview
  Guide、Escape / blur 取消与权威 revision 交接；
- Cursor / Pencil Note 左右 Edge Resize、Absolute Grid Coordinate Snap、Preview Guide、
  Escape / blur 取消、单次 Command、Selection 与权威 revision 交接；
- 聚焦 Piano Roll 时使用 `Delete` / `Backspace` 原子删除完整 Note Selection；成功后由
  权威 Subscription 清理 Selection，失败保留 Project 与 Selection 并显示 Toast；
- looped Clip 的明确不支持状态。
- 与 Arrangement 共用 Transport 视觉位置的不可交互 Clip Focus Playhead；Studio
  Presentation 提供 Project 身份与 Arrangement Clip 起点，独立子组件将全局 Tick 投影到当前
  完整 Clip Viewport，并只用 `translate3d(...)` 移动；Clip 外、项目切换或编辑器退出时不保留
  旧投影。
- 默认 Track-time Surface：使用与 Arrangement 相同的全局 Project Tick 和每小节视觉宽度，
  显示当前 Instrument Track 的全部 Clip window 与可见 Note，并在 150 小节最小时间线上独立
  横向滚动；
- Track-time Surface 使用独立 transform-only Playhead 直接投影全局 Tick；每次进入 Playing
  默认启用自身的分页 Follow，手动滚动、Pointer 或 Keyboard 时间轴操作会暂停，可见控制可立即
  恢复；Follow 状态不进入 Project Fact；
- Active Clip 下拉选择、Clip window / Note 点击选择，以及 looped Clip 的可见不可编辑状态；
- Track Pencil Hover Preview：明确显示写入已有 Clip、右扩 Clip、新建 Bar Clip 或 blocked
  原因；点击时 Coordinator 对当前 Snapshot / revision 重新解析，并用 Add Note、
  Add Clip With Note 或 Extend Clip With Note 形成一次 Commit / History；
- Track 与 Clip Focus 共用固定高度的 CC64 Sustain Pedal Lane：保留原始 `0..127` Value，显示
  Step Segment、`64` Down Threshold、Event Marker 与不影响当前 Clip 播放的右端 Terminal
  Marker；
- CC64 Channel 以 `1..16` 显示、以 MIDI `0..15` 写入，属于应用生命周期 Preference，不是
  Project Fact；切换 Channel 只重投影 Lane；
- Clip Focus Pencil 空白 Click 按当前 Grid/Snap 解析 Clip Tick 和原始 Value，并通过独立
  Coordinator 执行一个 `AddMidiSustainPedalEventCommand`；已有 Marker、Drag、Cursor 不新增；
- Track Scope 显示全部 Clip 的 CC64 投影并弱化非 Active Clip；Pencil 只允许写入明确选择的
  非循环 Active Clip，Pointer 必须落在其闭合时间窗口内。V1 不为 CC64 自动新建或扩展 Clip，
  无 Active Clip、越界、looped Clip 或 stale revision 都保持事实不变并显示 Toast；
- Cursor Click 选择 Active Clip 当前 Channel 的 CC64 Event，修饰键 Click 切换、空白 Click 清空；
  横向拖动以一次 Command 移动完整 Selection，纵向拖动以一次 Command 替换锚点原始 Value；
- Marker Preview 在 Pointer Move 期间不写 Project，并在提交后的 Lane Snapshot 到达 commit
  revision 前保留；权威 Step Segment 只在 Snapshot 更新后重投影；
- 聚焦 Lane 时复用 Piano Roll 的 `Delete` / `Backspace` 与 `Escape` Action；Clip Focus 按最近
  聚焦目标路由 Note 或 CC64 Selection，Track Scope 只编辑明确 Active Clip；
- Arrangement 与 Piano Roll 不维护第二份 Clip：原子命令发布的新建 / 扩展事实会由同一
  Snapshot 投影同时刷新两处。

Scope Preference、默认 Track 值与可见模式切换已经接入；既有 Clip-local Surface 保留为 Clip
Focus 实现。当前 Track Cursor 负责显式选择 Active Clip，完整 Note Selection / Move / Resize
仍在 Clip Focus。Track 与 Clip Focus Playhead 都消费同一共享 Transport 视觉位置；完整 Clip
Viewport 没有横向滚动，因此 Clip Focus 不建立多余 Follow。Scope 与 Follow 都不是 Project
Fact，不得进入 ProjectSession、History、dirty 或 Checkpoint。

当前 Surface 已形成 Note Add、Cursor Move、Cursor / Pencil 单 Note Resize、多选 Delete，以及
CC64 Add / Selection / Move / Replace Value / Remove 写入闭环，但仍不能编辑 Note Velocity。
默认 DOM Note Renderer 提供互不重叠的左右 Edge 热区；Canvas Note Adapter 可以显示同一
Resize Preview，但尚无 Canvas Hit 实现。DOM Event 必须继续先归一化为 Renderer-neutral Hit，
不直接修改 Project Model，也不把 ProjectSession 放入 Pinia。
