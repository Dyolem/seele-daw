# @seele-daw/project-midi

`project-midi` 是 Standard MIDI File 中立 Document 与 Seele Project Model 之间的浏览器无关桥接层。
当前 MI2 只实现 Import：输入 `MidiFileDocument`，输出一个已经通过 Project File V1 加载边界和完整
Model invariant 校验、但尚未进入 Studio 项目生命周期的 fresh `ProjectSession`。

## 当前导入规则

- 来源 PPQ 使用整数有理数换算到 Project PPQ 960；Note 起点和终点独立四舍五入；
- 四舍五入后为零长度的 Note 扩为一个 Project tick，并产生汇总诊断；
- 一个含 Note 的 normalized MIDI Track 创建一个 Instrument Track、一个非循环 Clip 和一个独占
  MIDI Source；空 Track（包括 conductor Track）不创建 Project Track；
- Clip 从第一枚 Note 的全局位置开始，结束位置取最后一枚 Note 终点和 End of Track 中的较大值；
- Source 内 Note tick 改为相对 Clip 起点，Channel、Pitch 和 Velocity 保留；
- Tempo 与 Time Signature 按换算后的 Project tick 去重；碰撞时保留来源时间上最后生效的事件并
  产生诊断；tick 0 缺失时分别补 120 BPM 与 4/4；
- Project V1 无法表示的 Tempo / Time Signature 值会阻止导入，不执行静默 clamp；
- CC64 不烘焙进 Note 长度。它与其他 CC、Pitch Bend、非零 Release Velocity、非默认 Program、
  Key Signature 和文本事件都产生非阻断诊断；
- `@tonejs/midi` 在 Codec 边界已经完成 Note On / Off 配对。中立 Document 当前不携带原始孤立
  Note 事件，因此本桥接层不虚构无法从输入观察到的配对诊断。

## 默认音源与生命周期边界

本包不会 import Playback，也不认识 `studio-grand`。调用方必须提供
`createInstrumentDevice` 工厂；Studio Composition Root 在后续批次用
`createStudioGrandDeviceDescriptor` 组合该端口，从而落实“导入 Track 默认持久化 Studio Grand”
的产品规则。不同宿主或测试可以提供其他合法 Device Descriptor，而无需修改 MIDI 映射。

导入成功只返回 `ProjectMidiImportDraft`：其中 Session revision 为 0、History 为空。调用方现在可以用
`ActiveProjectService.createFromSession` 原子保存首个 Checkpoint 并切换 Active Project；Catalog 与
Checkpoint 的一致性仍由 Studio 生命周期及其持久化 Adapter 拥有。Browser File / Blob 与 Studio UI
不属于本包。
