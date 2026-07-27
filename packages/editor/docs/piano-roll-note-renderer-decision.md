# Piano Roll Note Renderer 决策

> Status: Accepted
>
> Date: 2026-07-27

## 背景

Piano Roll 的 Grid 与 Note 都可以使用 DOM 或 Canvas。Canvas 对高密度、连续 Zoom /
Scroll 和高频重绘有更稳定的性能上限，但需要自行建立 Hit Test、焦点、可访问性和动画调度；
DOM 可以直接使用 Pointer Event、CSS Animation、Focus 和语义元素，但成本随可见节点数、
样式复杂度及每帧更新比例增长。

当前 Project Query 和 Piano Roll Read Model 只返回可见 Tick / Pitch 范围内的 Note，
因此没有证据表明 DOM Note 在首批产品规模下必然性能不足。框架无关的音序器 SDK 也不由
Canvas 决定，而由 Common Model、Scene、Input、Tool、Command 与 Renderer Port 决定。

## 现有数据结构为何有利于性能

当前架构没有把完整 Project 或全部 MIDI Note 复制为一棵 Vue 响应式对象树，而是沿着以下
单向数据流生成当前界面所需的可重建投影：

```text
ProjectSession 中的权威 Note
          ↓ 范围 Query / 定向 Subscription
冻结的 PianoRollNoteReadModelState
          ↓ shallow identity
可见 PianoRollNoteScene
          ↓
keyed DOM Renderer
```

这套数据结构从以下几个方面控制了 DOM 方案的实际成本：

1. **Note 事实只在 Project Core 中保存一份。**
   - `ProjectSession` 是可保存内容、History 和当前内容身份的权威；
   - Vue、Pinia、Scene 和 Renderer 都不维护第二份可写 Note Model；
   - Command Commit 后重新查询权威结果，不需要为所有 Note 建立 Vue 深响应，也不需要在
     UI 中逐字段同步一份容易漂移的增量镜像。
2. **Read Model 按当前可见窗口取数。**
   - Query 同时按 `MidiSourceId`、可见 Source Tick 范围和 Pitch 范围筛选；
   - Project Query Index 负责定位候选数据，UI 不需要扫描或投影整个 Project；
   - Scene 和 Renderer 接收的是可见结果，而不是完整 MIDI Source。
3. **Commit 通知同样按数据相关性收窄。**
   - Read Model 只订阅当前 Source 以及与当前 Tick 窗口相交的 MIDI Note 变化；
   - 不相关 Track、Source 或时间范围内的 Commit 不会触发当前 Piano Roll 的 Note 重查；
   - Viewport 改变时，Query 与 Subscription 一起迁移到新的可见窗口。
4. **Vue 只观察 Read Model State 的浅层身份。**
   - Read Model 返回冻结的 State、Note 列表和 Note 投影；
   - Studio 使用 `shallowRef` 持有 State，因此 Vue 不会递归代理每个 Note，也不会为每个
     Note 字段建立依赖关系或 Watcher；
   - `ProjectSession` 继续留在应用服务边界，不进入 Pinia，也不进入 Vue 深代理。
5. **Scene 与 DOM 都是可丢弃的显示缓存。**
   - Scene 只把当前可见 Note 转换为 CSS Pixel 几何，不成为新的业务真相；
   - DOM Renderer 以 `NoteId` 为 Key 复用原生元素，只创建、更新或删除发生变化的可见节点；
   - 单个 Note 不是 Vue Component，Pointer 输入也通过 Surface 事件委托，因此不会随 Note
     数量线性增加组件实例和事件监听器；
   - Renderer 节点与缓存都可由同一 Read Model State 重建，不参与 Save、Undo 或 Redo。
6. **后续交互状态仍应保持稀疏。**
   - Selection 应保存 `NoteId` 集合，而不是复制完整 Note 对象；
   - Drag、Resize、Snap 和 Box Selection 的 Preview 应独立于 Project 事实，只描述当前
     手势所需的临时差量；
   - 只有完成交互时才创建 Command，Commit 后再读取权威结果。

“Commit 后重查”并不等于零成本：其成本主要与当前查询窗口返回的 Note 数量有关。一个覆盖
完整 Clip 的初始窗口仍可能返回大量 Note；连续 Scroll / Zoom、高频 Commit 或超大批量编辑
也需要通过基准观察 Query、Scene 投影和 DOM Patch 的耗时。Read Model 会用
`modelRevision` 抑制没有新查询结果的重复通知，但未来若基准暴露问题，应优先考虑进一步的
可见窗口裁剪、批量刷新或按帧调度，而不是把全部 Note 改造成 Vue 深响应对象。

## 决策

1. Pitch 背景和时间 Grid 使用 DPR-aware Canvas。
2. 首批可见 Note 使用 keyed DOM Renderer：
   - 只创建可见 Note；
   - 每个 Note 是轻量原生元素，不是 Vue Component；
   - Renderer 按 `NoteId` 复用节点；
   - 后续 Pointer 输入使用 Surface 事件委托，不为每个 Note 创建监听器。
3. `PianoRollNoteScene` 是唯一可见 Note 几何：
   - 由 Common Viewport 与 Note Read Model 投影；
   - 使用 CSS Pixel；
   - 包含稳定 `NoteId`、位置、尺寸和当前视觉事实；
   - DOM 与 Canvas Note Renderer 消费完全相同的 Scene。
4. 保留 `PianoRollCanvasNoteRenderer` 作为同一 Port 的替代实现和后续基准对象。
5. Studio 只选择一个 `PianoRollNoteRenderer`，不拥有 Renderer 特有的 Note 状态。
6. 当前不引入 Fabric、Konva 或 PixiJS；只有真实基准证明自有边界不足时再评估。

## 边界

```text
ProjectSession Query / Subscription
              ↓
PianoRollNoteReadModel
              ↓
PianoRollNoteScene
              ↓
PianoRollNoteRenderer
       ├─ DOM Note Renderer       当前产品默认
       └─ Canvas Note Renderer    可替换实现 / 基准
```

以下能力不得进入 Renderer：

- ProjectSession、ProjectSnapshot 或可写 Project Model；
- Selection 的权威状态；
- Tool 状态机；
- Snap 规则；
- ProjectCommand 创建或执行；
- Undo / Redo；
- Project File 或 Checkpoint。

Renderer 只拥有可重建的原生节点、Canvas bitmap 和绘制缓存。

## Hit Test 与输入

DOM Adapter 可以通过 `event.target` 快速取得候选 `NoteId`，但 Tool 不能依赖
`HTMLElement`、`dataset`、CSS class 或 `getBoundingClientRect()`。Browser Input 必须把
DOM 或 Canvas 命中统一转换为：

```ts
interface PianoRollHit {
  readonly noteId: NoteId
  readonly zone: 'body' | 'resize-start' | 'resize-end'
}
```

Canvas Adapter 的首批空间索引使用 MIDI Pitch Bucket 与按 `startTick` 排序的 Note，
不预建通用 R-tree / Quadtree。框选同样按 Pitch 范围和 Tick 范围查询。

## 动画

- 纯装饰动画允许由 Adapter 实现：DOM 使用 CSS，Canvas 使用 frame scheduler。
- 会影响交互理解的 Selection、Drag Ghost、Snap Preview 和播放头必须由框架无关状态描述。
- 动画状态不写入 Project Model，不进入 History、Save 或 Playback。
- Canvas 动画只重绘动态 Note / Overlay Layer，不应反复绘制静态 Grid。
- `prefers-reduced-motion` 或未来 Motion Setting 必须能关闭非必要动画。

## 响应式与资源生命周期

- Clip / Source window / ProjectSession 改变时，显式 effect 负责 dispose 并重建 Read Model
  和 Subscription。
- Read Model state、Viewport、Track Color、muted 和 Grid 改变时，由唯一 render effect
  生成 Scene 并调用 Renderer。
- Theme-only 变化必须通过未来的响应式 Theme revision 触发 render effect；不能依赖偶然的
  其他状态变化刷新 Canvas 或内联 DOM 颜色。
- ResizeObserver 只更新 Viewport，不拥有 Project 或 Note 状态。

## 基准与切换条件

在引入连续 Zoom / Scroll 和批量交互后，对 DOM 与 Canvas Adapter 使用同一 Scene 运行：

- 500、2,000、10,000 个可见 Note；
- 初次投影与稳定重绘；
- 连续横向 Zoom / Scroll；
- 单 Note 与批量 Note Drag Preview；
- Box Selection；
- Theme / Track Color 切换；
- 内存占用、长任务、p95 frame time 与输入延迟。

若 DOM Adapter 在目标浏览器和基准设备上无法满足交互帧预算，Studio 切换到 Canvas
Adapter；Common、Scene、Tool、Selection、Command 和产品文档语义保持不变。

## 库选择

- Fabric 面向通用对象编辑、自由变换、序列化和 SVG，容易形成 Project Model 之外的第二份
  对象状态，不适合当前 Command / Preview 边界。
- Konva 的 hit graph 与 Layer 能减少 Canvas 交互工作，但每个 Note 仍是库 Node；只有自有
  Pitch Bucket / Pointer Adapter 明显不足时再评估。
- PixiJS 适合 GPU、shader、复杂滤镜或极高图元数量；只有 Canvas 2D 基准不足时再评估。

选择任何库都只能替换 Browser Renderer / Input Adapter，不能进入 Common 或 Project Core。
