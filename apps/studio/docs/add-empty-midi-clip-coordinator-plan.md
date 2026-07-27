# Studio Add Empty MIDI Clip Coordinator 实施计划

## 目标

本阶段在 Studio Workbench 增加框架无关的 `ProjectClipCoordinator`，把产品层的
“在 Instrument Track 的目标小节创建一个空 MIDI Clip”转换为 Project Core 已实现的
`AddMidiClipCommand`。

Coordinator 负责小节吸附、产品默认值和浏览器侧身份；Project Core 继续负责领域校验、
原子所有权图、Undo / Redo、dirty 与持久化事实。

## 本阶段负责

- 接收目标 `TrackId` 与 Arrangement `targetTick`；
- 按项目起始拍号计算小节长度和所在小节起点；
- 分配 Clip ID 与 MidiSource ID；
- 从当前 Track 复制 Clip 初始名称；
- 创建非静音、非循环、继承 Track 颜色的一小节空 MIDI Clip；
- 对当前 Active Project Ready Session 执行 `AddMidiClipCommand`；
- 返回新 Clip 与所属 Track 身份，供 Workbench Selection 使用；
- 扩展项目作用域 Selection，使 Clip Selection 与 Track Selection 保持一致；
- 通过 Composition Root 提供无状态 `ProjectClipVueContext`。

## 本阶段不负责

- Arrangement 双击事件、像素到 Tick 映射或 DOM Clip Block；
- 判断双击位置是否命中现有 Clip；
- Clip 选中视觉、打开 Context Editor 或 Piano Roll；
- 创建失败 Toast；
- Clip move、resize、split、duplicate、loop、mute 或 remove；
- 变拍号时间线上的逐小节网格；
- 把 Clip Record、MidiSource、Snapshot 或 Session 放进 Pinia。

上述交互属于下一批 Arrangement UI。双击已有 Clip 必须由 UI 解释为选择 / 打开，不能调用
本 Coordinator；Project Core 继续允许模型层重叠。

## 小节范围

第一版只使用 `tick = 0` 的起始拍号：

```text
beatSpan = PROJECT_PPQ * 4 / denominator
barSpan = beatSpan * numerator
barStart = floor(targetTick / barSpan) * barSpan
```

例如：

- 4/4：一小节 `3840 Tick`；
- 3/8：一小节 `1440 Tick`。

起始拍号缺失时失败关闭，不静默猜测 4/4。后续支持变拍号 Arrangement 时，应形成独立的
Timeline Grid 模块和产品规则，不在本阶段提前扩展。

## Clip 产品默认值

- `startTick`：目标所在小节的起点；
- `spanTick`：一个起始拍号小节；
- `name`：复制 Track 当前名称，创建后独立；
- `color`：`null`，显示时继承 Track；
- `muted`：`false`；
- `sourceOffsetTick`：`0`；
- `loop`：`null`；
- MidiSource 长度：与 Clip span 相同；
- Note Partition：空，由 Project Core Command 原子创建。

Coordinator 在所有 Active Project、Track 和小节范围校验完成后才消耗两个实体身份。
它使用 `session.modelRevision`，不依赖可能滞后一轮发布的 Active Project state revision。

## Coordinator 契约

```ts
interface AddEmptyMidiClipInput {
  readonly trackId: TrackId
  readonly targetTick: Tick
}

interface AddedMidiClipResult {
  readonly clipId: ClipId
  readonly trackId: TrackId
  readonly commit: ProjectCommit
}
```

结果只返回 UI 建立 Selection 所需的 Clip / Track 身份。MidiSource ID 和完整 Record 继续从
最新 Snapshot 派生，不复制到 Vue 状态。

Active Project 非 Ready、Track 缺失、Track 类型错误或起始拍号缺失时抛出稳定的
`ProjectClipError`。Project Core 的领域、身份冲突或提交错误保持原始类型向上传递。

## Clip Selection

Workbench Selection Store 扩展为只保存：

- 当前 `ProjectId`；
- `selectedTrackId`；
- `selectedClipId`。

不变量：

- 选中 Clip 时同时选中其所属 Track；
- 直接选择 Track 时清除 Clip Selection；
- Clip 被 Undo / Remove 后清除 `selectedClipId`，仍存在的所属 Track 保持选中；
- Clip 所属 Track 未来发生变化时，reconcile 让 Track Selection 跟随当前所有权；
- Track 消失、切换 Project 或离开 Project 时清理相关身份。

Selection 仍是轻量、可重建的 Workbench UI 状态，不产生 Commit，不触发 dirty，也不进入
Snapshot、Checkpoint、Project File 或 IndexedDB。

## Composition Root

Composition Root 创建唯一 `ProjectClipCoordinator`，复用应用级 Project Entity ID 来源，并
提供冻结的 `ProjectClipVueContext`。Context 只携带命令能力，不创建响应式 Clip 副本，也不
暴露身份源。

## 测试与验收

- 4/4 与 3/8 小节长度及吸附边界准确；
- 起始拍号缺失时失败关闭；
- Clip、Source 和空 Partition 使用完整产品默认值；
- 连续调用使用 Session 当前 revision；
- 同一小节创建两个 Clip 保持模型层重叠能力；
- 非 Ready、Track 缺失在身份分配前失败；
- Project Core 身份错误不被 Studio 包装；
- Clip Selection 与 Track Selection 的不变量和生命周期清理有测试；
- Composition Root 提供唯一冻结 Coordinator；
- Studio type-check、测试与仓库级检查通过。

## 停止点

完成并验证本模块后停止等待审阅。下一批才实现 Arrangement Clip Presentation、双击空白小节
创建、双击已有 Clip 选择、错误 Toast 和 Clip 视觉。
