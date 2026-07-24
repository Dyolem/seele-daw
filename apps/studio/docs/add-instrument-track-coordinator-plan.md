# Studio Add Instrument Track Coordinator 实施计划

## 目标

本阶段在 Studio Workbench 增加框架无关的 `ProjectTrackCoordinator`，把产品层的“Add Track”动作转换为 Project Core 已实现的 `AddInstrumentTrackCommand`。

Coordinator 负责确定产品默认值和浏览器侧身份，Project Core 继续负责领域校验、原子提交、Undo / Redo、dirty 与持久化事实。

## 本阶段负责

- 固定、受控、运行时冻结的 Studio Track Palette；
- 新 Track 的默认名称、颜色、Channel Strip 与插入位置；
- Track ID 和 Instrument Device ID 的分配；
- 初始 `seele.instrument-slot` Device Descriptor；
- 对当前 Active Project Ready Session 执行 `AddInstrumentTrackCommand`；
- 通过 Composition Root 提供无状态 Vue Context；
- Coordinator、Palette、Context 和 Composition Root 接线测试。

## 本阶段不负责

- Track Row、Arrangement 或 Add Track 按钮 UI；
- Soundbank 扫描、默认音色、采样器、合成器或 Playback；
- Clip、MidiSource 或 Note 创建；
- Track rename、recolor、remove、reorder；
- Selection、Inspector 或 Editor state；
- Toast、错误浮层或失败文案；
- 把 ProjectSession、Track Record 或 Project Snapshot 放入 Pinia。

## 产品默认值

### 名称

名称使用当前 Snapshot 中 Instrument Track 数量加一：

```text
Instrument 1
Instrument 2
Instrument 3
```

名称只是创建时默认值，不承担长期唯一性。未来 Rename Command 可以产生重复显示名，实体身份仍由 Track ID 决定。

### 插入位置

第一版始终追加到 `trackOrder` 末尾。以后从上下文菜单插入到指定位置时，应扩展 Coordinator 输入，不改变 Core Command。

### Channel Strip

- gain：`1`；
- pan：`0`；
- muted：`false`；
- soloed：`false`。

### Instrument Slot

初始 Device 使用：

- type ID：`seele.instrument-slot`；
- definition version：当前最低版本；
- enabled：`true`；
- parameters：空对象；
- opaque state：`null`。

它表示一条合法但尚未选择声音实现的乐器插槽，不等于 Basic Synth，也不提前选择任何 Soundbank。

## Track Palette

Palette 是 Project fact 的候选值集合，不是主题强调色集合。它使用稳定的 uppercase `#RRGGBB` 值，颜色写入 Track Record 并随 Checkpoint 保存。

随机源必须返回 `[0, 1)` 内的有限数。创建颜色时：

1. 找到新轨道相邻的上一条 Track；
2. 若上一条 Track 的颜色属于 Palette，并且 Palette 不止一个颜色，将它从候选中排除；
3. 使用随机值在剩余候选中选择；
4. 第一条 Track 或上一条无颜色时使用完整 Palette。

这样保留随机感，同时避免连续创建得到相同相邻颜色。随机源可注入以支持确定性测试。

## Coordinator 契约

`ProjectTrackCoordinator.addInstrumentTrack()` 是同步操作并返回成功的 `ProjectCommit`。

执行顺序：

1. 要求 Active Project 为 Ready；
2. 从当前 Session 读取一次 Snapshot；
3. 计算名称、颜色和末尾插入位置；
4. 从身份源分别分配 Track ID 与 Device ID；
5. 创建并执行 `AddInstrumentTrackCommand`；
6. 返回 committed Commit。

Coordinator 使用 `session.modelRevision` 创建 Command，不依赖可能滞后一轮异步通知的 Active Project state revision。

非 Ready 状态抛出稳定的 `ProjectTrackError`。Project Core 的领域、身份冲突或提交错误保持原始类型向上传递，不在 Studio 伪装为成功结果。

## Composition Root

Composition Root 创建唯一 Coordinator 并提供 `ProjectTrackVueContext`。Context 只携带命令能力，不创建响应式 Track 副本，也不暴露身份源和随机源。

默认浏览器身份源使用 `globalThis.crypto.randomUUID()`，默认随机源使用 `Math.random()`；Composition 输入允许测试注入确定性函数。

## 停止点

本模块完成并验证后停止等待审阅。下一批才把 Coordinator 接到 Workbench Add Track 按钮，并建立由 Snapshot + Commit 驱动的 Track Row 读模型。
