# @seele-daw/project-midi

`project-midi` 是 Standard MIDI File 中立 Document 与 Seele Project Model 之间的浏览器无关桥接层。
当前 Import 支持两个浏览器无关结果：`createProjectMidiImportDraft` 输出一个已经通过当前 Project
File V2 加载边界和完整 Model invariant 校验、但尚未进入 Studio 项目生命周期的 fresh
`ProjectSession`；`createProjectMidiTrackImportDraft` 输出一个可向既有 `ProjectSession` 原子追加
新 Instrument Track 的 Project Command。

## 当前导入规则

- 来源 PPQ 使用整数有理数换算到 Project PPQ 960；Note 起点和终点独立四舍五入；
- 四舍五入后为零长度的 Note 扩为一个 Project tick，并产生汇总诊断；
- 一个含 Note 的 normalized MIDI Track 创建一个 Instrument Track、一个非循环 Clip 和一个独占
  MIDI Source；空 Track（包括 conductor Track）不创建 Project Track；
- Clip 从第一枚 Note 或 CC64 的文件内全局位置开始，结束位置取最后一枚 Note 终点、最后一枚
  CC64 与 End of Track 中的最大值；“新项目”把文件 tick 0 放在 Project tick 0，“新 Track”由
  调用方传入 `placementTick`，把文件 tick 0 映射到该 Project tick，所有 Track 的前导空白与相对
  位置保持不变；
- Source 内 Note 与 CC64 tick 改为相对 Clip 起点；Note Channel、Pitch、Velocity 与 CC64 Channel、
  原始 Value 均保留；
- Tempo 与 Time Signature 按换算后的 Project tick 去重；碰撞时保留来源时间上最后生效的事件并
  产生诊断；tick 0 缺失时分别补 120 BPM 与 4/4；
- 当前 Project Model 保留 `5..999 BPM` 范围内的完整浮点 Tempo；范围外 Tempo 或无法表示的 Time
  Signature 会阻止“新项目”导入，不执行静默 clamp；“新 Track”导入不消费来源 Tempo 或拍号，
  因而让导入 Note 按当前 Project Tempo Map 播放，并分别产生非阻断的时间轴所有权诊断；
- CC64 不烘焙进 Note 长度。含 Note 的 Track 会把 CC64 映射到独立 Project Fact；PPQ 换算后落在
  同一 Project Tick 的多条 CC64 确定性保留来源顺序最后一条并产生汇总诊断。只有控制器而没有
  Note 的 Track 仍不创建 Instrument Track；
- 含 Note 的 Track 会把首个 Note Tick 之前或同 Tick 最后生效的 CC7 / CC10 转为现有 Track
  Channel Gain / Pan；缺失时保持 `1` / `0`。首个 Note 之后的动态 CC7 / CC10、其他未支持 CC、
  Pitch Bend、非零 Release Velocity、Key Signature 和文本事件继续产生非阻断诊断；
- 每条已导入 normalized Track 的 Program / Channel 音源决定由宿主工厂返回 `exact`、
  `approximate` 或 `unavailable` 结果。精确映射不产生 Program 丢失提示；近似映射与不可用占位分别
  产生精确的非阻断诊断。本包不再根据“非零 Program”无条件报告音源未应用；
- `@tonejs/midi` 在 Codec 边界已经完成 Note On / Off 配对。中立 Document 当前不携带原始孤立
  Note 事件，因此本桥接层不虚构无法从输入观察到的配对诊断。

## 音源映射与生命周期边界

本包不会 import Playback，也不认识 `studio-grand` 或 Studio 调色板。调用方必须提供
`createInstrumentDevice` 与 `createTrackColor` 工厂。前者接收完整 normalized `sourceTrack` 并返回
Device Descriptor 及 Program 映射结果；宿主负责保证 `unavailable` Descriptor 实际无声，
`project-midi` 只验证结果形状并生成统一诊断。Studio Composition Root 用自己的冻结 Catalogue
落实 21 个 GM Program、Channel 10 Percussion 与可见无声占位规则，并用当前 Track 创建调色板
落实宿主视觉策略。不同宿主或测试可以提供其他合法 Device Descriptor、映射政策与 Project Color，
而无需把产品目录下沉到本包；Clip `color: null` 保持“继承 Track”的语义。

新项目导入返回的 `ProjectMidiImportDraft` 中 Session revision 为 0、History 为空；调用方可以用
`ActiveProjectService.createFromSession` 原子保存首个 Checkpoint 并切换 Active Project。当前项目
导入返回的 `ProjectMidiTrackImportDraft` 携带一个 `instrument-track.add-collection` Command；调用方
必须针对最新 READY Session 执行它，成功只产生一个 revision / History 步骤，并由现有
ActiveProject 订阅派生 dirty。Catalog 与 Checkpoint 的一致性仍由 Studio 生命周期及其持久化
Adapter 拥有。Browser File / Blob 与 Studio UI 不属于本包。

Tempo 不是 Track 级事实。“新项目”导入可以用来源 MIDI 的 Tempo Map 建立时间轴；“新 Track”
导入只保留 Note 的音乐 Tick 位置，来源 Tempo 即使与当前 Project 不同也不会缩放 Tick、覆盖或合并
Project Tempo Map。调用方应把这项预期语义与其他未支持来源事实区分展示，不能把正常的 Project
Tempo 所有权误报成导入失败。

当前桥接层实现 Standard MIDI File 到 Project 的 Note、初始 CC7 / CC10 与 CC64 导入。Project
MIDI Export Bridge 与 Studio Export UI 尚未实现，因此不能从 Project 把这些事实写回 `.mid`
文件。

初始 CC7 / CC10 的用户听觉、精确换算、事务、诊断和兼容边界见
[MIDI Initial Channel Controls V1](./docs/midi-initial-channel-controls-v1.md)。

`placementTick` 是调用方已经确定的导入锚点，本包不会再次 Snap 或读取 Transport。Studio 在打开
文件选择器时把连续 Playhead 位置转换为最近的整数 Project Tick 并冻结，从而避免文件读取期间移动
的播放位置改变最终落点；整数表示转换不等同于按拍或小节吸附。
