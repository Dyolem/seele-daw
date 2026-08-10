# Piano Roll Contribution

第一条 MIDI 纵向切片的 Studio 功能入口。

当前已实现：

- 从 Snapshot 派生选中 Clip 的非循环 `PianoRollClipContext`、Track Color 和 muted；
- 在 Context Editor Dock 组合真实 Project Query / Subscription；
- DOM 标尺、MIDI 48–72 钢琴键盘、焦点与可访问 Note 摘要；
- `@seele-daw/editor/browser` 提供的 Canvas Grid、Note Scene 与 keyed DOM Note
  Renderer；Canvas Note Adapter 保留为可替换实现；
- Clip-scoped Note Selection、DOM Hit、Primary Pointer Click 与 focused Escape；
- 应用生命周期级 Pencil / Cursor、Snap 与 `1/16` Grid Preference Store，Canvas Grid
  消费其 Subdivision Tick；
- 可见 Pencil / Cursor 单选工具与 Snap Toggle；
- Pencil 空白 Click 的 X / Tick、Y / Pitch Placement、Clip 尾部限制与 Add Note Command；
  Snap 开启时 X 固定落在 Pointer 所在 Grid 单元的左边界；
- 创建成功后只选中新 Note 并保持 Pencil，创建失败时保留 Project 与 Selection 并显示
  Toast；
- Add Note 的 Undo / Redo 权威回读与失效 Selection 清理；
- Cursor Note Body Drag 的单 Note / Selection Move、Absolute Grid Coordinate Snap、Preview
  Guide、Escape / blur 取消与权威 revision 交接；
- 聚焦 Piano Roll 时使用 `Delete` / `Backspace` 原子删除完整 Note Selection；成功后由
  权威 Subscription 清理 Selection，失败保留 Project 与 Selection 并显示 Toast；
- looped Clip 的明确不支持状态。

当前 Surface 已形成 Add、Cursor Move 与多选 Delete 写入闭环，但仍不能 Resize 或编辑
Velocity。Project Core 已具备单 Note Resize Command，Editor / Browser / Studio 尚未接入；
Cursor 与 Pencil 都将通过左右 Edge Hit Resize。DOM Event 必须继续先归一化为
Renderer-neutral Hit，不直接修改 Project Model，也不把 ProjectSession 放入 Pinia。
