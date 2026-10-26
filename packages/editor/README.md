# @seele-daw/editor

`editor` 把指针、键盘和 MIDI 输入解释为可预览、可取消、最终只提交一次的项目编辑。它拥有编辑
会话的状态，但不拥有 Track、Clip、Note 等项目事实。长期路线中的 `editor-core` 与
`editor-renderer` 暂时合并在本包里；Renderer 边界稳定、满足独立拆包条件后再评估拆分。

```text
DOM / Pointer / Keyboard / MIDI
-> EditorInput
-> Surface / Tool Operation
-> InteractionSession / Preview
-> Identity-bound completion
-> Studio ProjectCommand
-> project-core atomic commit
```

## 结构

```text
src/
├── common/                        框架无关：禁止 Vue、Pinia、DOM、Canvas 与 Web Audio
│   ├── interaction/               输入契约、Session、Modifier、可选 Commit Handoff
│   └── piano-roll/
│       ├── interaction/           Note 契约、Operation 与 Session 组合
│       ├── operations/            Note 选择、放置、移动、缩放的领域运算
│       ├── track/                 Track 全局 Read Model 与放置解析
│       └── sustain-pedal-lane/    CC64 投影、契约、Operation 与 Session 组合
├── browser/                       DOM / Canvas 适配：禁止 Vue 与 audio-web
│   ├── interaction/               中立 Pointer Capture 与 Key State Adapter
│   └── piano-roll/                Grid / Note Renderer、领域 Hit 与 Adapter 组合
└── index.ts                       唯一公开入口
```

本包只依赖 [`@seele-daw/project-core`](../project-core/README.md) 的公开 API，不导入
`apps/studio`，也不解释 Audio Runtime、Transport 或设备状态机。Vue 组件、Workbench Action 与
Feature 的装配属于 Studio。

## 状态所有权

本包可以拥有 Selection、focus、active tool 与 clipboard；zoom、scroll、viewport 等视图状态；
pointer capture、drag origin、preview 几何等交互状态；以及 Renderer 的可重建缓存。

本包不拥有、也不复制一份可写的项目模型。删除实体、Undo / Redo 和切换项目之后，Selection 按稳定
ID 清理或校准；Preview 不进入 History、Checkpoint 或 Playback。

## 交互内核

中立的 `InteractionSession` 用 class 拥有手势生命周期，领域规则通过 Operation 组合进来；可选的
Commit Handoff 在提交后等待自己那次 Commit 的 revision，再交还权威投影。Browser Pointer Adapter
负责 capture、阈值与取消。Note、CC64、Track Pencil 与 Timeline Locate 都使用这套内核；
[Studio Tempo Track](../../apps/studio/src/features/project-workspace/tempo-track/README.md) 从
package root 复用 Session、Handoff 与 Pointer Adapter，领域规则留在 Studio。Locate 由 Playback
管理定位，不组合事实编辑的 Handoff。协议、输入所有权、资源清理与新对象的接入步骤见
[Editor Interaction V1](./docs/editor-interaction-architecture-v1.md)。

关键规则：

- 鼠标容差与 handle 尺寸以 CSS pixel 定义，再换算到领域坐标；
- `pointermove` 只更新 Preview，`pointerup` 才生成唯一的 ProjectCommand；
- 每种手势都定义 Escape、`pointercancel`、失焦与实体失效时的取消行为；
- 手势依赖的实体被修改或删除时，优先取消并提示，不做隐式 rebase；
- Clipboard payload 不复用原项目 ID，Paste 生成新 ID 并一次提交；
- Canvas 只发出 intent / command，不直接修改项目。

## Piano Roll

**坐标与视口。** `PianoRollClipContext` 组合非循环 MIDI Clip 与它唯一的 MidiSource，Clip-local
Tick 与 Source Tick 一一对应；looped Clip 没有 context（`createPianoRollClipContext` 返回
`null`），调用方据此显示“不支持”。`PianoRollViewport` 描述 Clip-local 的可见 Tick、Pitch 与 CSS
Pixel 尺寸，提供 Tick / X、Pitch / Y 的线性换算；Y 换算出的 Pitch 夹在可见行内。Clip-local 与
Track-global Surface 共用 identity-free 的 `PianoRollTimelineViewport` 几何。Looped Clip 不支持
编辑：Loop 展开、重复实例的选择与 Source 编辑语义尚未确定。

**信任边界。** editor 信任 Snapshot 的不变量（Clip 的 Source、Note 与 CC64 分区都存在）和 Studio
传入的几何（视口属于当前 Clip，坐标在视口内），不再检查。只检查来自布局和浏览器的值：视口宽高、
`devicePixelRatio`、Canvas 2D context 与主题色，抛普通错误。

**Read Model。**

- `PianoRollNoteReadModel` 用 Project Core 的范围 Query 与局部 Subscription 发布冻结的可见 Note，
  匹配的 Commit 到达后重新读取权威结果，不维护第二份 Note。
- Track 全局 Read Model 从一份 Snapshot 与 `TrackId` 派生排序后的 Clip window，把非循环 Clip 中的
  Note 映射到 Project Tick（`clip.startTick + note.startTick - clip.sourceOffsetTick`）。Looped
  Clip 出现在投影中但标记为 `unsupported`；失效的 Active Clip 身份会被清空。
- 放置解析根据 Pointer 的全局 Tick、当前小节、Active Clip 与 Clip window，纯函数地得出
  `add-to-clip`、`extend-clip` 或 `create-clip`；归属不明、looped Clip 与越过下一 Clip 的自动扩展
  返回带可见原因的 blocked 结果。

**Selection。** `PianoRollEditorSession` 随当前 Clip 创建和释放，只保存冻结的 `NoteId` 列表，支持
单选、追加切换与清空。新增选择前按 `MidiSourceId + NoteId` 查询权威 Note；Note 移出可见范围时
保留选择，移出 Clip 的 Source 窗口或被删除时清理。

**Grid、Snap 与 Pencil。** 视觉与交互共用 Timeline Grid。Snap 开启时有 `nearest` 与 `floor` 两种
策略，Pencil 用 `floor` 落在 Pointer 所在单元的左边界；Snap 关闭时取最近的整数 Tick。Pencil 只把
完成的空白 Click 解析为 Clip-local 起点、Pitch 与期望长度；拖动、命中已有 Note、取消与不完整的
Pointer 生命周期都不产生放置。

**Browser Input。** Surface 级事件委托把 composed path 解析为稳定的语义 Hit；单个 primary Pointer、
Pointer Capture、默认 4 CSS Pixel 的拖动阈值，每次捕获有独立的 `captureId`；Up、Cancel、lost
capture、blur、dispose、消费者失败，以及 Surface 坐标下 Surface 盒子的移动或尺寸变化，都会关闭
输入。其他语义 Hit 由 Surface 显式提供 Resolver，复用
同一套生命周期。

**CC64 Lane。** 按显式 `MidiChannel` 投影 Clip-local 与 Track-global 的 CC64 事件，追赶 Clip
左边界之前同 Channel 的最后状态（没有历史事件时从 `0` 开始）；值 `64..127` 为踏板按下、`0..63`
为抬起，Clip 右端点的事件可编辑但不影响半开的播放窗口。`0..127` Value Lane 有确定性的 Y 坐标，X
与 Timeline Grid 共用 Snap。编辑支持：Pencil 新增、稳定 Event ID 的选择与失效校准、超过阈值后的
主导轴锁定（横向批量 Move、纵向单 Event Replace Value）、绝对 Grid Snap 与 `Alt` 临时绕过、Source
边界 clamp，以及批量 Remove。Studio 把每个手势映射为一个 Project Command。

**Renderer。** 静态 Pitch / Grid 用 Canvas，bitmap 按 `devicePixelRatio` 放大；`PianoRollNoteScene`
统一投影可见 Note 的几何；Studio 默认用 keyed DOM Note Renderer，Canvas Note Renderer 消费同一个
Scene，可替换并作为性能基准。小节、拍、细分网格分级绘制，过密的一级不画。主题以冻结快照由宿主
传入，Renderer 不读 Studio CSS。取舍见 [Note Renderer 决策](./docs/piano-roll-note-renderer-decision.md)。

## 尚未提供

- Track Scope 中完整的 Cursor Note 编辑；
- 真实性能数据需要时的空间索引、dirty region、Worker 或 OffscreenCanvas；
- Arrangement Clip、Audio Clip、Automation 等的编辑。

## 测试

- 输入归一化、坐标往返、Hit Test 与 Snap 边界；
- 手势的 down / move / up / cancel 全路径；
- 拖动过程中模型不变，`pointerup` 只产生一次命令；
- 实体删除、Undo / Redo 与切换项目后的 Selection 清理；
- 可见图元很多时的裁剪、命中与绘制性能。

## 延伸阅读

- [Editor Interaction V1](./docs/editor-interaction-architecture-v1.md)、
  [Note Renderer 决策](./docs/piano-roll-note-renderer-decision.md)
- [长期路线 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
- 已完成阶段的计划：[docs/archive/editor](../../docs/archive/README.md)
