# Studio MIDI Program Import Routing V1

本文记录 Standard MIDI File 的 Program 与 Channel 10 如何在导入时成为明确的 Project
Instrument Device，涉及 `@seele-daw/project-midi` 与 `apps/studio`。Program、Channel 10、精确映射、近似映射与不可用占位等术语见
[多乐器总谱发声 V1 术语表](../../../docs/archive/audio-web/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户可见行为

- “导入为新项目”和“导入为当前项目的新 Track”使用同一套 Studio 音源工厂。
- 普通旋律 Track 按零基 GM Program 查询完整的 128 项冻结路由；108 项使用 MIDISampleSynth，
  其中 63 项 Exact、45 项 Approximate。
- MIDI Channel 10（内部零基 Channel `9`）始终优先选择 `General MIDI Percussion`，来源
  Program 不会把鼓轨错误路由成旋律乐器。
- 候选音色需要尚未实现 VASynth / FMSynth Runtime 的 20 个 Program 不回退为 Studio Grand。Track 保存
  `seele.midi-program-placeholder` V1 Device；Inspector 使用面向用户的一基编号，例如来源代码值
  `80` 显示为 `MIDI Program 81 unavailable`。Track 保持无声并可由用户从现有
  `Built-in sound` 选择器显式修复。
- Exact 映射不产生 Program 丢失提示；Approximate 明确报告实际选择的 Preset；Unavailable 产生
  一条包含来源 Track 与零基 Program 的非阻断诊断。

新建空白 Instrument Track 的默认音色仍是 Studio Grand；这一默认值不参与 MIDI 文件导入路由。

## 2. 事实与所有权

```text
MidiFileTrack { channel, programNumber }
  -> Studio MIDI import Instrument policy
  -> exact Sample Device | unavailable Program Placeholder
  -> @seele-daw/project-midi atomic Track collection
  -> Project Device Descriptor
  -> Inspector / Playback derived projection
```

- Studio Composition Root 分别拥有完整可选 Preset Catalogue 与 GM 导入路由；Project Core
  不知道 GM Program。
- `@seele-daw/project-midi` 只定义通用 `exact | approximate | unavailable` 工厂结果并据此生成诊断，
  不依赖 Playback 或 Studio Catalogue。
- Placeholder 的 opaque state 只保存 `{ channel, programNumber }`。严格 V1 Decoder 拒绝额外字段、
  越界值和未来版本，避免把未知状态误呈现成已知占位。
- Placeholder 是合法、可 round-trip 的 Project Fact，不是资源加载失败。Playback 不会为它生成
  Sample Instrument Plan，因此其他可播放 Track 不受影响。
- Inspector 把 Placeholder 与损坏或未知的 Missing Instrument 分开说明；两者都只能由用户显式
  Replace，不能自动改写。

Project File schema 不因此改变：通用 Device Descriptor 已足以保存这种 Device。

## 3. 路由优先级与诊断

1. 先验证 normalized MIDI Track 的 Channel 与 Program 值域。
2. 若 Channel 为 `9`，使用 General MIDI Percussion，并返回 Exact。
3. 否则查询完整 Program Route；available route 创建对应 Sample Device，并返回 Exact 或
   Approximate。
4. Runtime-unavailable route 创建 Program Placeholder，并返回 Unavailable。
5. `project-midi` 在同一原子导入结果中按结果加入 `program-approximated` 或
   `program-unavailable`；近似诊断包含实际 Preset 名称。

`@tonejs/midi` 已在中立 Decoder 边界按 `[Program, Channel]` 规范化来源，因此同一 SMF Track
出现多个 Channel 或 Program 时会形成多个 normalized Track。没有动态 Program Change 的 Project
Fact，播放途中也不切换 Device。`midi-file` 回归 fixture 固定了同一 Channel 中途换
Program 后，前后 Note 会进入不同 normalized Track 的行为。

## 4. 兼容与失败边界

- Catalogue 声称支持但 Manifest/WAV 缺失，仍是后续资源完整性失败；不能改成 Placeholder 或
  回退钢琴。
- Unavailable 是预期兼容结果，不阻断导入，不阻断其他 Track，也不触发资源加载。
- 未知旧 Device 继续按 Missing Instrument 原样保存；只有精确 V1 Placeholder 才显示 Program
  不可用原因。
- Bank Select CC0 / CC32 尚未应用；含这些 Controller 的文件仍按既有未支持 CC 诊断报告，不能把
  Program Exact 宣称为完整 Bank 兼容。
- Decoder 拆分 Program 时不会替 V1 在拆分后的 Track 间追赶此前已生效的 Controller 状态；在踏板
  按住期间换 Program 等边界输入，不能宣称已完整还原动态换音色语义。
- 首个 Note 前或同 Tick 最终生效的 CC7 / CC10 成为 Track 初始 Gain / Pan；动态 Program、后续
  CC7 / CC10、CC11、Pitch Bend、Aftertouch 和 Articulation 尚未实现。
- 即使来源 Mode Declaration 得到唯一的 GM / GS / XG Binding，也只在导入反馈中显示；本页的
  Program / Channel 10 路由不会因此切换成尚未实现的 Bank、Drum Map 或 Articulation 政策。

初始 Channel 控制的听觉与数值契约见
[MIDI Initial Channel Controls V1](../../../packages/project-midi/docs/midi-initial-channel-controls-v1.md)。
模式声明的保守分类与冲突反馈见
[MIDI Semantic Binding V1](../../../packages/project-midi/docs/midi-semantic-binding-v1.md)。

## 5. 相关文档

完整 128 项路由、其使用的 86 个唯一采样资产，以及与 439 项手动 Preset 目录的区别见
[Studio Built-in Preset Catalogue and General MIDI Routing V1](./general-midi-built-in-routing-v1.md)。
