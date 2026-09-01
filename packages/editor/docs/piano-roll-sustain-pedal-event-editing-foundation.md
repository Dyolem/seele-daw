# Piano Roll CC64 Event Editing Foundation

> Status: Implemented in `@seele-daw/editor`; Studio integration pending
>
> Date: 2026-09-01

## 目标与边界

本批次在既有 CC64 Lane Read Model、Value Viewport 和语义 Pointer Input 之上，建立 Event
Selection、Remove Target、水平 Move 与纵向 Replace Value 所需的框架无关编辑生命周期。

它不执行 Project Command、不创建 Vue 状态，也不改变 Project File。Studio 后续批次负责把
最终 Intent 映射到 Project Core 已有的：

- `MoveMidiSustainPedalEventsCommand`；
- `RemoveMidiSustainPedalEventsCommand`；
- `ReplaceMidiSustainPedalEventValueCommand`。

```text
Snapshot Lane projection
  -> explicit editable Active Clip scope
  -> transient Event ID selection
  -> captured Pointer + frozen facts
  -> dominant-axis Preview
  -> one Move or Replace Value Intent
  -> Studio Command boundary（下一批次）
```

## 可编辑作用域

- Clip Focus 必须同时提供相匹配的 `PianoRollClipContext` 和 CC64 Clip Lane Read Model；
- Track Scope 只解析显式 Active Clip，并且该 Clip 必须是当前支持的非循环 Clip；
- 没有 Active Clip 或 Active Clip 为 looped 时，读取投影仍可显示，但编辑作用域为 `null`；
- Scope 冻结 Project ID、model revision、Channel、Clip / Source 身份、Source 窗口、Timeline
  窗口与当前 Event 投影；
- Track Scope 的非 Active Clip Marker 不是本次手势的可编辑目标。

这保证一个 Core Move / Remove Command 只处理一个 MidiSource，不把 Track 上多个 Source 的事件
错误拼进一次事务。

## Selection 与 Remove Target

Selection 是 Editor 瞬态状态，只保存稳定 `MidiSustainPedalEventId`，不进入 Project Fact、History、
Checkpoint 或 Pinia：

- 普通完整 Click 只选择命中的 Event；
- `Shift`、`Control` 或 `Command` Click 切换该 Event；
- 完整空白 Click 清空 Selection；
- Drag、取消、不完整 Pointer 生命周期与非 Active Clip Hit 不改变 Selection；
- 每次读取时按当前 Editable Scope 去除已删除、已切换 Channel、重复或不再可编辑的 ID；
- Remove Resolver 只冻结当前仍有效的 Event ID、Source、Clip 与 base revision；空 Selection 不产生
  Remove Target。

删除仍是一次批量 Core Command；Editor 不逐事件循环执行命令。

## 主导轴锁定与单命令语义

Pointer 使用既有 Browser Adapter 的 4 CSS Pixel Drag Threshold。超过阈值后的第一个有效帧按
屏幕位移选择主导方向：

- `abs(deltaX) > abs(deltaY)`：锁定 Tick 轴，产生批量 Move Preview；
- 其他情况（包括完全相等）：锁定 Value 轴，产生单 Event Replace Value Preview；
- 一旦锁定，同一手势后续不切换方向；
- Pointer Up 最多产生一个 Move 或一个 Replace Value Intent；
- 对角拖动不会拆成两个 Project Command / History 步骤。

Core 当前只有单 Event Replace Value Command。因此：

- 横向拖动已选 Marker 时，移动同一 Editable Scope 内的完整 Selection；
- 纵向拖动只改变 Pointer Down 命中的锚点 Event；
- 若纵向拖动前存在多选，Studio 成功提交后应把 Selection 收敛到锚点；
- 不通过多个 Replace Value Command 伪造“原子批量改值”。真正的批量 Value Transform 需要未来
  独立产品语义与一个原子 Core Command。

## 时间、值与 Preview

### 水平 Move

- Pointer Delta 按冻结的 Value Lane Viewport 换算为 Tick Delta；
- Snap 使用锚点的绝对目标 Timeline 坐标，不保留 off-grid 旧偏移；
- 手势期间动态按住 `Alt` 临时绕过 Snap，松开后回到冻结 Grid；
- 所有选中 Event 使用同一个 Tick Delta，并 clamp 到所属 MidiSource 的 `0..lengthTick`；
- Event 可以移动到当前 Clip 窗口之外，但仍不能离开 Source；移出窗口的 Marker 从 Preview 中
  消失，Project Intent 仍保留完整 Event ID 集合；
- Tick / Channel 冲突由 Project Core 在提交时最终校验，Editor 不静默覆盖、合并或交换 Event ID。

### 纵向 Replace Value

- Value 使用 Pointer Down 锚点的原值加垂直 Delta，不因从 Marker 边缘抓取而跳值；
- 向上增加、向下减少，并 clamp 到 MIDI `0..127`；
- Preview 保留原始整数值，不把它简化成 Pedal Down / Up 布尔值；
- `64` 阈值仍只用于播放和视觉状态派生。

所有 Preview 均可丢弃，不写 Project、History、Autosave 或 Playback。

## 生命周期与权威交接

独立的 `PianoRollSustainPedalInteractionSession` 明确表达：

```text
idle
  -> pressing
     -> moving-events -> committing-move
     -> replacing-value -> committing-value
     -> completed Click / Placement -> idle
     -> cancel -> idle

committing-* -> idle / awaiting-authority -> idle
```

- Pointer Down 冻结 Scope、base revision、Selection、Grid、Snap、Viewport 与 Tool；
- Pointer Move 只更新 Preview；
- Pointer Up 最多发布一个 Intent，重复或迟到的 End 不重复提交；
- cancel、lost capture、Window blur 与显式取消不产生写 Intent；
- Commit 成功而 Lane Read Model 尚未到达 commit revision 时保留最终 Preview；
- 权威 revision 到达后清理 Preview；等待期间的新 Pointer Begin 可以开始新手势，但不会撤销已
  完成的 Project Commit；
- Resolver、坐标或观察者失败均隔离并失败关闭。

## 明确延期

- Studio Marker 选中视觉、Preview Renderer、Command Coordinator 扩展与 Toast；
- `Delete` / `Backspace` Action、焦点 Scope 与完整 Undo / Redo UI 回归；
- Value 精确数值输入与用户确认事务；
- 多 Event 原子 Value Transform；
- looped Clip 的实例 / Source 编辑语义；
- 通用 CC Lane、曲线绘制、Pitch Bend、Aftertouch、MPE 或 Automation 平台；
- half-pedal 发声、repedaling、共鸣、pedal noise 与 release sample。

## 术语表

| 中文术语     | 行业常用英文             | 本批次中的含义                                                                   |
| ------------ | ------------------------ | -------------------------------------------------------------------------------- |
| 可编辑作用域 | Editable Scope           | 唯一允许本次手势修改的非循环 Active Clip、MidiSource、Channel 与 revision 快照。 |
| 锚点事件     | Anchor Event             | Pointer Down 命中的 CC64 Event；决定吸附坐标，纵向拖动时也是唯一改值目标。       |
| 瞬态选择     | Transient Selection      | Editor 内稳定 Event ID 的临时集合，不是 Project Fact。                           |
| 选择校准     | Selection Reconciliation | 根据最新 Editable Scope 移除已删除、换 Channel 或失效的 Event ID。               |
| 删除目标     | Remove Target            | 一次批量 Remove Command 所需的冻结 Source、revision 与 Event ID 集合。           |
| 拖动阈值     | Drag Threshold           | Click 转为 Drag 前必须超过的屏幕距离；当前复用 Pointer Adapter 的 4 CSS Pixel。  |
| 主导轴       | Dominant Axis            | 首次超过阈值时位移更大的方向；决定本手势只改 Tick 还是只改 Value。               |
| 轴锁定       | Axis Lock                | 主导轴选定后不在同一手势中切换，确保只产生一个命令。                             |
| 横向移动     | Horizontal Move          | 对同一 Source 内选中 CC64 Event 应用共同 Tick Delta。                            |
| 纵向改值     | Replace Value            | 保持 Event Tick / Channel / ID 不变，只替换原始 `0..127` Value。                 |
| 抓取不跳值   | No-jump Grab             | 从 Marker 非中心位置开始拖动时，以原值加 Pointer Delta，而不是立即映射绝对 Y。   |
| 瞬时预览     | Ephemeral Preview        | Pointer Move 期间的可丢弃视觉结果，不写 Project 或 History。                     |
| 权威交接     | Authority Handoff        | Commit 后暂时保留 Preview，直到 Snapshot / Lane Read Model 到达目标 revision。   |
| 无变化提交   | No-change Commit         | 最终 Tick Delta 为 `0` 或 Value 未改变；Studio 应跳过命令结果或清理 Preview。    |
| 冲突         | Tick / Channel Collision | 同一 Source、Tick、Channel 已有另一个 CC64 Event；最终由 Core 拒绝。             |
