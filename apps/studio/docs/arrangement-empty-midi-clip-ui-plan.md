# Arrangement 空 MIDI Clip UI 实施计划

> Status: Implemented and accepted
> Date: 2026-07-27

## 目标

本批把已经就绪的 `ProjectClipCoordinator` 接入 Workbench，形成第一条可见的 MIDI
Clip 纵向切片：

- Arrangement 显示当前 Project 的 MIDI Clip；
- 双击 Instrument Track Lane 的空白小节，或聚焦小节后按 Enter，创建一小节空 MIDI Clip；
- 成功后选中新 Clip、保持所属 Track 选中，并打开 Context Editor Dock；
- 单击已有 Clip 选择它，双击或聚焦后按 Enter 打开编辑上下文且不触发创建；
- 创建失败显示危险语义 Toast；
- Dock 能说明当前 Clip 已经打开，但不伪装成 Piano Roll 已实现。

本批不实现 Piano Roll、Note 渲染、Clip Move / Resize / Split / Copy / Delete、
时间线 Zoom / Scroll、播放头或大型数据查询。

## 状态与数据流

```text
ProjectSession Snapshot
  -> ProjectWorkspacePage
  -> immutable ProjectMidiClipPresentation[]
  -> Arrangement / Context Editor Dock

Lane double click
  -> ProjectClipCoordinator.addEmptyMidiClip(trackId, targetTick)
  -> ProjectSession Command
  -> ActiveProject state publication
  -> latest Snapshot presentation

success
  -> Workbench Selection selects Clip + owning Track
  -> Context Editor Dock opens

failure
  -> no Selection mutation
  -> danger Toast
```

Clip Record、MidiSource、Note Partition 和 dirty 继续由 Project Core /
Active Project 权威拥有。Vue Presentation 只包含渲染需要的冻结事实；Pinia 只保存所选
Project、Track 与 Clip 身份。

## 时间映射

- 首个 Arrangement 只显示固定 8 小节。
- 小节宽度来自项目起始拍号，与 `ProjectClipCoordinator` 使用同一个
  `createProjectClipBarRange` 规则。
- 每个 Lane 小节按钮传入该小节的起始 Tick；最终吸附仍由 Coordinator 负责。
- Clip 的 DOM 位置按 `startTick / visibleTimelineSpan` 与
  `spanTick / visibleTimelineSpan` 计算。
- 超出当前 8 小节右边界的 Clip 暂不显示；跨越右边界的 Clip 在可见范围裁切。

固定视窗是第一条产品切片的明确限制，不代表未来 Zoom / Scroll 模型。

## DOM 决策

本批使用 DOM 渲染 Lane 网格命中区和少量 Clip，原因是当前只有固定 8 小节、无
Zoom / Scroll / Playhead / Drag，DOM 可以直接提供 Button 语义、键盘 Focus 与原生命中检测。

进入以下任一场景前必须重新评估 Canvas / 分层渲染：

- 可变 Zoom 或横向 Scroll；
- 大量 Track / Clip；
- Clip 拖动、Resize、框选或高频 Preview；
- 高频播放头、Meter 或波形；
- DOM 性能数据不满足交互预算。

迁移不得改变 Project Command、Presentation 或 Selection 的权威边界。

## 视觉与交互

- Normal Clip 使用所属 Track 色的低明度 Surface；
- Hover 提升边界与背景明度；
- Selected 叠加独立的 Piano Black Selection Outline；
- Muted 同时降低饱和度并显示 `Muted` 文本；
- Lane 没有 Clip 时提示 `Double-click a bar to add a MIDI clip`；
- 每个小节提供可聚焦按钮；Enter 是双击创建的键盘等价路径；
- Track 色只表达内容身份，不承担 Focus、Error 或 Selection 的唯一信号。

## 验证与停止点

自动化验证覆盖：

- Presentation 排序、冻结与继承 Track 色；
- Clip 的 8 小节位置映射；
- 双击目标小节传递正确 Tick；
- 创建成功后的 Track / Clip Selection 与 Dock 打开；
- 创建失败不改变 Clip Selection，并显示错误 Toast；
- 已有 Clip 的选择 / 打开不调用创建能力；
- Context Editor Dock 显示所选 Clip。

完成代码、文档、Lint、Type Check、测试和 Production Build 后停止，等待产品 UI
审查。Piano Roll 必须另行规划后再实施。
