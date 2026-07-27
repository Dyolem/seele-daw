# Piano Roll Contribution

第一条 MIDI 纵向切片的 Studio 功能入口。

当前已实现：

- 从 Snapshot 派生选中 Clip 的非循环 `PianoRollClipContext`、Track Color 和 muted；
- 在 Context Editor Dock 组合真实 Project Query / Subscription；
- DOM 标尺、MIDI 48–72 钢琴键盘、焦点与可访问 Note 摘要；
- `@seele-daw/editor/browser` 提供的 Canvas Grid、Note Scene 与 keyed DOM Note
  Renderer；Canvas Note Adapter 保留为可替换实现；
- looped Clip 的明确不支持状态。

当前 Surface 只读。后续在这里组合 Select / Pencil Tool、Note Selection、Browser Input
和 Project Command Port；DOM Event 必须先归一化为 Renderer-neutral Hit，不直接修改
Project Model，也不把 ProjectSession 放入 Pinia。
