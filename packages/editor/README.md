# @seele-daw/editor

`editor` 负责把指针、键盘和 MIDI 输入解释为可预览、可取消、最终只提交一次的项目编辑。它拥有编辑会话状态，但不拥有 Track、Clip、Note 等项目事实。

> 当前状态：`common` 已完成首个 Piano Roll Clip / Viewport / Note Read Model，并已建立
> Clip-scoped Note Selection Session；
> `browser` 已提供 Canvas Grid、Renderer-neutral Note Scene 与可替换的 DOM / Canvas
> Note Renderer，以及委托式 DOM Hit 与 primary Pointer Input Adapter；Select Interaction
> 与可见 Selection 尚未接入。

## 包定位

当前仓库采用架构总纲的初期五包结构：长期文档中的 `editor-core` 和尚未稳定的 `editor-renderer` 暂时合并在本包内。

```text
DOM / Pointer / Keyboard / MIDI
-> EditorInput
-> EditorIntent
-> Tool Interaction State Machine
-> Preview
-> ProjectCommand
-> project-core atomic commit
```

`common` 保存框架无关的编辑语义；`browser` 保存 DOM/Canvas 适配和当前阶段的 Renderer。Renderer 边界稳定且满足独立拆包条件后，再评估 `editor-renderer` package。

## 主要职责

| 领域          | 规划职责                                                              |
| ------------- | --------------------------------------------------------------------- |
| EditorSession | Selection、focused surface、active tool、内部 Clipboard               |
| 输入          | DOM/MIDI 事件归一化为框架无关的 EditorInput                           |
| Surface       | 坐标转换、Hit Test、Snap candidates、Read Model                       |
| Tool          | Idle/Pressed/Dragging/Committing/Cancelled 显式状态机                 |
| Preview       | Drag ghost、box selection、snap result，不写 ProjectModel             |
| 命令解析      | 根据上下文把 EditorIntent 转成完整 ProjectCommand                     |
| Read Model    | 面向可见范围的稳定查询结果，不复制完整项目                            |
| Renderer      | DOM / Canvas Adapter、Scene、空间索引、dirty region、frame scheduler |

## 状态所有权

本包可以拥有：

- Selection、focus、active tool 和 clipboard；
- zoom、scroll、viewport 等视图状态；
- pointer capture、drag origin、preview geometry 等交互状态；
- Renderer 的可重建缓存。

本包不能拥有或复制一份可写 ProjectModel。删除实体、Undo/Redo 和项目切换后，Selection 必须按稳定 ID 清理或恢复；Preview 不进入 History、Autosave 或 Playback compiler。

## 建议的内部模块

```text
src/
├── common/
│   ├── piano-roll/   已实现的 Clip Context、Viewport 与可见 Note Read Model
│   ├── input/        EditorInput 与 EditorIntent
│   ├── session/      Selection、focus、clipboard
│   ├── surfaces/     Surface 契约与领域坐标
│   ├── tools/        交互状态机、约束与取消语义
│   ├── snap/         吸附候选和策略
│   └── read-models/  面向编辑器的查询适配
├── browser/
│   └── piano-roll/   Canvas Grid、Note Adapter、DOM Hit 与 Pointer Input
└── index.ts          唯一公开入口
```

目录按真实功能逐步建立，不能把 `common` 变成无归属工具集合。

## 关键交互规则

- 所有鼠标容差和 handle 尺寸以 CSS pixel 定义，再转换到领域坐标。
- `pointermove` 只更新 Preview，`pointerup` 才生成唯一 ProjectCommand。
- 每次手势必须定义 Escape、`pointercancel`、失焦和实体失效时的取消行为。
- V1 中，若依赖实体在手势期间被修改或删除，优先取消并提示，不做隐式 rebase。
- Clipboard payload 不复用原项目 ID；Paste 生成新 ID 并通过一次事务提交。
- Canvas 只能发出 intent/command，不能直接修改 ProjectModel。

## 已实现：Piano Roll Common Foundation

首个 common 切片由当前 Studio 的空 MIDI Clip 入口直接驱动，公开提供：

- `PianoRollClipContext`：组合非循环 MIDI Clip 与其唯一 MidiSource，明确
  Clip-local Tick 和 Source Tick 的 1:1 映射；
- `PianoRollViewport`：描述 Clip-local 可见 Tick、Pitch 和 CSS Pixel 尺寸；
- Tick / X 与 Pitch / Y 的双向确定性坐标换算；
- `PianoRollNoteReadModel`：使用 Project Core 的可见范围 Query 和局部
  Subscription，发布冻结的可见 Note 状态；
- `PIANO_ROLL_DEFAULT_CENTER_PITCH = 60`，对应首批 UI 的 C4 中心语义。

当前不支持 looped Clip。Loop 展开、重复实例选择和 Source 编辑语义尚未确定，不能错误套用
非循环 1:1 映射。Read Model 只依赖 `ProjectSession.query` / `subscribe`，匹配 Commit 后
重新读取权威结果，不从 Delta 维护第二份 Note 真相。

完整边界见
[Piano Roll Common Foundation 实施计划](./docs/piano-roll-common-foundation-plan.md)。

## 已实现：Piano Roll Editor Session

首个 Editor Session 切片提供：

- 随当前 Clip 创建和释放的 `PianoRollEditorSession`；
- 只保存冻结 `NoteId` 列表的单选、追加切换与清空语义；
- 新增 Selection 前按 `MidiSourceId + NoteId` 查询权威 Note；
- 当前 Source 的 Note Commit 到达后重新校准已选 Note；
- Note 移出可见 Viewport 时保留 Selection，移出 Clip Source 时间窗口或被删除时清理；
- Observer、Project Query、Project Subscription failure isolation 与显式 dispose。

它不保存 `MidiNoteRecord`，不依赖当前可见 Read Model，也不进入 Vue 或 Pinia。Select
Interaction、Keyboard Binding 和 selected Renderer 视觉在第三阶段后续 Batch 接入。完整
计划见 [Piano Roll Interaction 第三阶段计划](./docs/piano-roll-interaction-phase-plan.md)。

## 已实现：Piano Roll Browser Input

首个 Browser Input 切片提供：

- Renderer-neutral `PianoRollHit` 和冻结的 `PianoRollPointerInput`；
- DOM Surface 级事件委托，不在每个 Note 上安装 Listener；
- DOM Event composed path 到稳定 `NoteId` / body zone 的小型 Hit Adapter；
- Surface-local CSS Pixel 坐标、固定的 Down origin Hit 与修饰键；
- 单 primary Pointer、Pointer Capture 与默认 4 CSS Pixel Drag Threshold；
- Up、Cancel、lost capture、dispose 与失败隔离的完整生命周期。

Browser Input 不读取 ProjectSession，也不直接修改 Selection。它只把浏览器事实交给后续
Select Interaction；当前仍未接入 Keyboard、Tool 状态机或 Note Command。

## 已实现：Piano Roll Browser Renderer

`browser/piano-roll` 在不依赖 Vue 的边界内公开提供：

- 静态 Pitch / Grid 使用 Canvas，bitmap 按 `devicePixelRatio` 放大；
- `PianoRollNoteScene` 统一投影可见 Note 的 CSS Pixel 几何；
- keyed DOM Note Renderer 是 Studio 当前默认，不创建每 Note Vue Component；
- Canvas Note Renderer 消费同一 Scene，作为可替换实现与性能基准；
- 小节、拍、细分网格分级绘制，密度小于可辨识 CSS Pixel 时停止绘制该级；
- 黑白键音高行、Track Color Note、Muted 内容透明度；
- 由宿主传入的冻结主题快照，不在 Renderer 内读取 Studio CSS 或 `themeId`；
- 显式 `clear` / `dispose` 生命周期和缺失 2D Context、无效 Grid / Theme 错误。

Renderer 只消费 Common Viewport 与 Note Read Model，既不读取 ProjectSession，也不生成
ProjectCommand。Studio 负责把选中 Clip、Project Query、主题令牌与所选 Adapter 组合起来。
完整边界见
[Piano Roll Browser Renderer 实施计划](./docs/piano-roll-browser-renderer-plan.md)与
[Piano Roll Note Renderer 决策](./docs/piano-roll-note-renderer-decision.md)。

## 依赖边界

- 只依赖 [`@seele-daw/project-core`](../project-core/README.md) 的公开 API。
- `common` 禁止 Vue、Pinia、DOM、Canvas 和 Web Audio。
- `browser` 可以使用 DOM/Canvas，但禁止依赖 Vue 和 `audio-web`。
- 不导入 `apps/studio` 或具体 Feature 内部文件。
- 不解释 Audio Runtime、Transport 或设备状态机。

Vue 组件、Workbench command/context key 和 Feature Contribution 的装配属于 `apps/studio`；本包只提供可复用编辑机制和浏览器适配。

## 分阶段计划

1. **已完成**：Piano Roll Clip Context、Viewport、坐标链与可见范围 Read Model。
2. **已完成**：Browser Canvas Grid、Note Scene 和 DOM / Canvas Note Adapter，并由
   Studio 只读组合当前 Clip。
3. **进行中**：建立 Clip-scoped EditorSession、Select Interaction、Note Selection、
   统一 Browser Input 与 scoped keyboard shortcuts。
4. 接入 Pencil Add、Move 与 Remove Note 的单次提交手势；Resize 先补充产品与 Core
   Command。
5. 在真实性能数据需要时增加空间索引、dirty region、Worker 或 OffscreenCanvas。
6. 扩展 Arrangement、Audio Clip、Automation 等 Surface。

## 测试与验收

- 输入归一化、坐标 round trip、Hit Test 与 Snap 边界测试；
- Tool 状态机的 down/move/up/cancel 全路径测试；
- 拖拽过程中模型不变，pointerup 仅产生一次命令；
- 实体删除、Undo/Redo、项目切换后的 Selection 清理；
- 10k 可见图元下的裁剪、命中与绘制性能；
- Canvas 键盘入口、焦点和语义摘要的可访问性测试。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
