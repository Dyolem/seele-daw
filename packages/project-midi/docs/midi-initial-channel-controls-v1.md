# MIDI Initial Channel Controls V1

> Status: MI3B implementation pending review
>
> Date: 2026-09-03
>
> Scope: `@seele-daw/project-midi`, with existing Playback and Audio Web consumers

本文记录 Standard MIDI File 中初始 Channel Volume（CC7）与 Pan（CC10）如何变成 Seele Track
Channel Facts。CC、Linear Gain、Pan、Automation 等术语见
[多乐器总谱发声 V1 术语表](../../audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户预期听觉

- 导入总谱后，首个音符开始时已设置的 CC7 会成为整条 Project Track 的初始音量。较小值让该声部
  整体更轻，`0` 产生零增益，`127` 保持 unity gain。
- 已设置的 CC10 会成为整条 Track 的固定左右位置：`0` 最左、`64` 正中、`127` 最右。
- 这些值由现有 Playback Track Plan 和 Audio Web Gain / Panner 路径执行，不建立另一套 MIDI
  Runtime 状态；Velocity、Track Gain、Master Gain 与固定输出校准仍按既有顺序共同决定最终电平。
- CC7 `0` 只表示 Gain 为零，不会伪造 `muted: true`；Track Mute 继续是独立 Project Fact。当前
  Studio 尚未提供 Track Gain 编辑 UI，本批也不把这一事实描述成新的用户编辑能力。
- 这是初始静态状态，不是 Automation。首个 Note 之后的 CC7 / CC10 不会形成渐强、渐弱或移动
  声像，并会通过非阻断诊断明确告知未导入。
- 不同 Soundbank 本身的录音响度仍可能不同；本映射保留来源比例，不做跨乐器响度归一化，也不
  引入 limiter。

因此，用户可以预期总谱打开时的基本声部音量和左右布局比统一 Gain / Center Pan 更接近来源文件，
但不能预期播放途中的动态混音已经被复现。

## 2. 选择与换算契约

对每条含 Note 的 normalized MIDI Track：

1. 用来源 Tick 比较，找到最早 Note Tick；不先换算到 Project PPQ，避免两个来源时刻因四舍五入
   碰撞而改变“初始”边界。
2. 对 CC7 和 CC10，消费 Tick 小于或等于首个 Note Tick 的事件；每个 Controller 取来源顺序中在
   最晚 Tick 最后出现的值。
3. CC7 使用 `value / 127` 转为 Track Linear Gain。
4. CC10 保证 MIDI 中心 `64` 精确映射为 `0`：左侧用 `(value - 64) / 64`，右侧用
   `(value - 64) / 63`，因此 `0 -> -1`、`64 -> 0`、`127 -> 1`。
5. 缺少对应初始事件时分别使用 Gain `1` 与 Pan `0`。

初始 CC 不改变 Clip 起点、长度或 Source 内容，也不会作为独立 Controller Fact 保存。Channel 10
鼓轨与普通旋律轨使用相同的初始 Gain / Pan 规则。

## 3. 事实、事务与诊断

```text
MidiFileTrack { notes, controlChanges }
  -> project-midi initial Channel mapping
  -> InstrumentTrack.channel { gain, pan, muted: false, soloed: false }
  -> existing atomic import Session / AddInstrumentTrackCollectionCommand
  -> Playback Track Plan
  -> Audio Web Gain / Stereo Panner
```

- 本批复用 Project Core 已有 `ChannelStripDescriptor`，不升级 Project File schema，不新增命令类型。
- “导入为新项目”把值写入新 Session；“导入为当前项目的新 Track”在原有单次 Collection Command
  内与 Device、Clip、Note 和 CC64 一起提交，仍只有一个 History 步骤。
- 首个 Note 之后的 CC7 / CC10 与所有未支持 Controller 进入既有
  `control-changes-not-imported` 诊断；诊断保留准确事件总数和去重排序后的 Controller 编号。
- CC64 继续作为独立 Project Fact 导入，不进入上述未支持集合。
- 只有 Controller 而没有 Note 的 normalized Track 仍不创建 Project Track；其 CC7 / CC10 不会被
  误当成可应用的初始值，而是与 Skip 结果一起报告。

## 4. 失败与兼容边界

- normalized Document 中任一 Control Change 的 Tick、Controller 或 Value 越界时，整个导入在创建
  Project Fact 前失败；本批不 clamp 或猜测损坏输入。
- 同 Tick Note 与 Controller 的跨事件原始字节顺序没有保留在中立 Document 中。V1 按已批准规则把
  首个 Note Tick 上的最后一条同类 CC 当作初始值，不能据此声称逐字节重放原始事件顺序。
- Decoder 因中途 Program Change 拆分 Track 时，不会跨拆分 Track 追赶更早的 CC7 / CC10；完整
  动态 Program / Controller State Chase 仍延期。
- CC7 的线性换算是 Seele V1 的确定性导入政策，不声称等同所有硬件或软件 GM 播放器的感知响度
  曲线。
- CC11 Expression、动态 CC7 / CC10、CC1、Pitch Bend、Aftertouch、Bank Select 与通用 Automation
  仍未实现。

## 5. 自动验证

- 无 Controller 时保持 Gain `1` / Pan `0`；
- CC7 `0` / `64` / `127` 与 CC10 `0` / `32` / `64` / `96` / `127` 换算；
- 首个 Note 同 Tick 的最后来源值、乱序 Note 与后续动态事件诊断；
- 新项目与当前项目 Track 导入使用同一规则并保持原子性；
- Playback Compiler 原样保存 Track Gain / Pan；
- 非法 CC、空 Track、CC64 隔离与既有 Program / Channel 10 路由兼容。

验证结果：

- `@seele-daw/project-midi` Type Check 与 3 个测试文件 / 29 项测试通过；
- `@seele-daw/playback` Type Check 与 9 个测试文件 / 107 项测试通过；
- Studio Type Check、64 个测试文件 / 412 项测试、Production Build 与 soundbank dist boundary
  通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint。

本批不执行人工声音试听、浏览器声像检查或多音源混合 Peak 测量，也不重复完整根级
`pnpm check`；这些音频门禁仍属于 MI5。
