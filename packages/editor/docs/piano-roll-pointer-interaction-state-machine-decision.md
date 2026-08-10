# Piano Roll Pointer Interaction 状态机决策

> Status: Accepted
>
> Date: 2026-08-10

## 背景

Piano Roll 的 Pointer 交互已经不再只是一次 Click。一次 Note Move 同时涉及命中结果、
Drag Threshold、Pointer Capture、Selection、Snap、动态修饰键、Preview、取消、Project
Command，以及等待权威 Read Model 跟上 Commit revision。后续 Resize、框选、擦除、
Velocity 和控制器曲线也会复用相同生命周期。

如果这些状态只由 Vue 组件中的多个布尔值和分散事件分支表达，容易产生非法组合，例如已经
取消却仍在提交、Pointer Up 重复提交、失焦后残留 Preview，或 Commit 已成功但旧权威画面
短暂回跳。

## 决策

采用 MIT 许可的 `xstate@5.32.5` core actor / machine 作为
`@seele-daw/editor/common` 内部实现，建立一个 Surface-scoped、框架无关的
`PianoRollInteractionSession`。依赖使用精确版本；当前不引入 `@xstate/vue`，也不把
XState Snapshot、Actor 或 Event 类型暴露到 package root。

状态机负责一个 Surface 同一时刻最多一个活动 Pointer Gesture 的生命周期：

```text
idle
  └─ Pointer Begin ─→ pressing
                        ├─ Pointer End（未过阈值）─→ Click / Add intent ─→ idle
                        ├─ Pointer Move（过阈值且命中 Note Body）─→ movingNote
                        ├─ Pointer Move（过阈值且命中 Note Edge）─→ resizingNote
                        └─ Cancel ─→ idle

movingNote
  ├─ Pointer Update ─→ 更新 Preview
  ├─ Pointer End ─→ committingNoteMove
  └─ Cancel ─→ idle

committingNoteMove
  ├─ 无变化或执行失败 ─→ idle
  └─ Commit 成功
       ├─ Read Model 已到达 revision ─→ idle
       └─ Read Model 尚未到达 ─→ awaitingAuthority ─→ idle

resizingNote
  ├─ Pointer Update ─→ 更新 Resize Preview
  ├─ Pointer End ─→ committingNoteResize
  └─ Cancel ─→ idle

committingNoteResize
  ├─ 无变化或执行失败 ─→ idle
  └─ Commit 成功
       ├─ Read Model 已到达 revision ─→ idle
       └─ Read Model 尚未到达 ─→ awaitingAuthority ─→ idle
```

这不是一个覆盖整个 DAW 的万能状态机。共享 Session 只统一 Pointer 生命周期、取消、一次
提交和权威交接；具体产品算法仍由独立、纯逻辑的 Gesture / Resolver 负责。Resize、框选等
行为只有在自身状态复杂度真实增长时才增加独立 machine 或 actor，不能预建空状态层级。

生产源码按责任分层，而不是继续与 Piano Roll Model 平铺：

```text
common/piano-roll/
  state-machine/
    piano-roll-interaction-session.ts
  operations/
    piano-roll-note-move-interaction.ts
    piano-roll-note-resize-interaction.ts
    piano-roll-pencil-interaction.ts
    piano-roll-select-interaction.ts
```

`state-machine` 只编排生命周期并调用操作模块；`operations` 只实现可独立测试的 Gesture、
Placement、Preview 或 Selection 规则。跨目录依赖使用 package 内部 `#internal/*` alias，
package root 继续从统一 Piano Roll barrel 暴露稳定 API，调用方不感知物理路径。

## 状态所有权与边界

```text
Browser Pointer Adapter
  DOM Event / capture / blur / modifier transport
                    ↓ PianoRollPointerInput
Editor Interaction Session（XState 仅为内部实现）
  lifecycle / frozen gesture / preview / intent / authority handoff
                    ↓ product intent
Studio Surface
  Selection Session 调用 / Project Coordinator 调用 / Toast
                    ↓ Project Command
Project Core
  facts / validation / atomic Commit / History / Undo / Redo
```

### Browser Adapter 拥有

- Pointer Event、Surface-local CSS Pixel 和 Primary Pointer 筛选；
- Pointer Capture 的建立与释放；
- 默认 4 CSS Pixel Drag Threshold；
- `pointercancel`、`lostpointercapture`、显式取消、Window blur 与 dispose；
- 把 Pointer / Keyboard 当前修饰键转换为稳定 Common Input。

Browser Adapter 不解释 Pencil、Cursor、Selection、Snap 或 Project Command。

### Interaction Session 拥有

- `idle / pressing / moving / resizing / committing / awaiting-authority` 的合法转换；
- Pointer Down 时冻结本次 Gesture 所需配置；
- 调用纯 Resolver 生成 Preview；
- Pointer Up 最多产生一个产品 Intent；
- Cancel 后拒绝同一 Pointer 的迟到 Update / End；
- Commit 后保留最终 Preview，直到权威 Read Model 到达目标 revision；
- 向外只发布冻结的、框架无关的公开 State 与一次处理结果。

Interaction Session 不执行 Project Command，不显示 Toast，不拥有 Vue、DOM、Pinia 或持久化
Preference。

### Studio Surface 拥有

- 把当前 Clip Context、Viewport、Grid、Tool、Snap Preference 和 Selection 组合为 Begin
  Configuration；
- 消费 Selection、Add Note、Move Notes 与 Resize Note Intent；
- 每个 Move / Resize Intent 最多调用一次 `ProjectMidiNoteCoordinator`；
- 把 Commit revision 或失败结果回告 Session；
- 把用户可见失败转换为命令式 Toast；
- 以 `shallowRef` 接收公开 State，不让 XState actor 进入 Vue 深响应。

## 冻结事实与动态输入

“Pointer Down 冻结手势”不等于冻结全部键盘状态。输入明确拆成两类：

### Pointer Down 后冻结

- Pointer ID、Pointer type、origin position 与 origin hit；
- origin modifiers，用于解释普通 Click / Modifier Click；
- Tool；
- Clip Context、Project base revision 与命中的权威 Note Facts；
- Gesture 起始 Selection；
- Viewport；
- Grid origin / resolution；
- 持久 Snap Preference。

这些事实中途变化不会把一次手势拼接成两个语义。Clip / Context 变化会显式取消旧手势。

### 手势期间动态

- 当前 Pointer position；
- 当前 `Alt / Shift / Command / Control` 状态。

当前真实消费者是 Note Move 与 Note Resize 的 `Alt` 临时绕过 Snap：拖动中按下 Alt 会立即
切到自由移动，松开 Alt 会立即重新按冻结 Grid 的绝对坐标吸附。它不修改持久 Snap
Preference。Click 的 Selection Toggle 仍使用 origin modifiers，避免在 Pointer Up 前松开
Shift 导致 Click 语义漂移。未来复制拖拽或轴向约束必须逐项明确使用 origin 还是 current
modifiers。

Window 的 `keydown / keyup` 只在存在活动 Pointer 时合成同位置的 Pointer Update；修饰键未
变化时不发布重复 Update。

## Preview、提交与权威交接

- Pointer Update 只改变可丢弃 Preview，绝不写 Project；
- Pointer End 才能产生写 Intent；
- 同一 Pointer End 最多产生一个 Intent；
- 零 Delta 不生成 Command；
- Project Coordinator 同步执行一次集合 Command，因此一次拖动只形成一个 Commit 和一个
  Undo History 步骤；
- Project 拒绝 stale revision 或其他约束时，Session 清理 Preview，Project / History
  保持不变；
- Commit 成功但 Note Read Model 尚未发布该 revision 时，Session 保留最终 Preview；
- Read Model 到达或超过目标 revision 后清除 Preview，再显示重新查询得到的权威 Facts。

`awaiting-authority` 只负责视觉交接，不代表 Project 仍可取消。新的 Pointer Begin 可以丢弃
旧 Preview 并开始新手势；Project Commit 不会因此撤销。

## 取消与失败关闭

下列来源统一结束尚未提交的手势，并且不得写 Project：

- `pointercancel`；
- `lostpointercapture`；
- Window blur；
- 聚焦 Piano Roll 时的 `Escape`；
- Clip / Context 切换；
- Adapter、组件或 Interaction Session dispose；
- 应用显式调用 Adapter `cancel()`。

取消由 Browser Adapter 清理活动 Pointer、发布 Cancel 并释放 Pointer Capture。若 Adapter
已没有活动 Pointer，生命周期 Owner 仍可直接取消 Session。Observer、Hit Test、Pointer
Capture 与 Resolver failure 都 fail closed，不能逃逸成浏览器事件循环中的未处理异常，也
不能遗留可提交状态。

## 扩展规则

- Note Resize 已复用 shared lifecycle，并使用独立 Resize Gesture / Preview / Intent；
- 空白 Cursor Drag 在 Box Selection 实现前仍无业务结果；实现时使用独立 Marquee Gesture；
- Timeline Clip Drag、Playhead Scrub 和 Fade Handle 可以复用相同输入协议与生命周期思想，
  但不强制共享 Piano Roll machine；
- Touch 当前仍只接受一个 Primary Pointer。双指 Zoom / Pan 需要单独的 multi-pointer gesture
  arena，不能硬塞进单 Pointer Session；
- Pointer 类型专属阈值、长按与压力只有在触控/笔产品切片出现时再定义；
- XState DevTools、持久化 State、Vue binding 与全局 Interaction Store 当前都不引入。

## 验收要求

- Click、Pencil Add、Move / Resize Preview、一次 Move / Resize Intent 与 authority handoff
  有 Common 测试；
- 动态 Alt 在不移动 Pointer 时也能更新 Preview；
- Pointer cancel、lost capture、Window blur、Escape、显式 cancel 与 dispose 都不会提交；
- 取消后的迟到 Pointer Up 被忽略；
- viewport 未就绪不能进入 Move commit 状态；
- Studio 集成测试确认一条拖动只推进一次 Project revision，并且 Undo / Redo 仍为原子行为。
