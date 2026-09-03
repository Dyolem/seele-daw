# Studio MIDI Program Import Routing V1

> Status: MI3A implementation pending review
>
> Date: 2026-09-03
>
> Scope: `@seele-daw/project-midi` and `apps/studio`

本文记录 Standard MIDI File 的 Program 与 Channel 10 如何在导入时成为明确的 Project
Instrument Device。Program、Channel 10、精确映射、近似映射与不可用占位等术语见
[多乐器总谱发声 V1 术语表](../../../packages/audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户可见行为

- “导入为新项目”和“导入为当前项目的新 Track”使用同一套 Studio 音源工厂。
- 普通旋律 Track 按零基 GM Program 查询冻结目录；当前精确支持 Program
  `0`、`32`、`40...48` 中已列出的核心弦乐与打击乐、`56...61` 中已列出的铜管，以及
  `68`、`70`、`71`、`73`。
- MIDI Channel 10（内部零基 Channel `9`）始终优先选择 `General MIDI Percussion`，来源
  Program 不会把鼓轨错误路由成旋律乐器。
- 未审核 Program 不回退为 Studio Grand。Track 保存
  `seele.midi-program-placeholder` V1 Device；Inspector 使用面向用户的一基编号，例如来源代码值
  `80` 显示为 `MIDI Program 81 unavailable`。Track 保持无声并可由用户从现有
  `Built-in sound` 选择器显式修复。
- Exact 映射不产生 Program 丢失提示；Unavailable 产生一条包含来源 Track 与零基 Program 的
  非阻断诊断。Project MIDI 已支持 Approximate 诊断契约，但当前 22 项目录没有审核任何近似路由，
  因而不会把未审查的替代音色标为近似可用。

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

- Studio Catalogue 同时拥有可选 Soundbank 身份和导入路由；Project Core 不知道 GM Program。
- `@seele-daw/project-midi` 只定义通用 `exact | approximate | unavailable` 工厂结果并据此生成诊断，
  不依赖 Playback 或 Studio Catalogue。
- Placeholder 的 opaque state 只保存 `{ channel, programNumber }`。严格 V1 Decoder 拒绝额外字段、
  越界值和未来版本，避免把未知状态误呈现成已知占位。
- Placeholder 是合法、可 round-trip 的 Project Fact，不是资源加载失败。Playback 不会为它生成
  Sample Instrument Plan，因此其他可播放 Track 不受影响。
- Inspector 把 Placeholder 与损坏或未知的 Missing Instrument 分开说明；两者都只能由用户显式
  Replace，不能自动改写。

本批不升级 Project File schema。现有通用 Device Descriptor 已足以保存新 Device 类型。

## 3. 路由优先级与诊断

1. 先验证 normalized MIDI Track 的 Channel 与 Program 值域。
2. 若 Channel 为 `9`，使用 General MIDI Percussion，并返回 Exact。
3. 否则查询 Catalogue 的 Program Route；当前 21 项均为 Exact。
4. 未命中时创建 Program Placeholder，并返回 Unavailable。
5. `project-midi` 在同一原子导入结果中加入 `program-unavailable`；未来只有 Studio 明确审核并返回
   Approximate 时才加入 `program-approximated` 和实际 Instrument 名称。

`@tonejs/midi` 已在中立 Decoder 边界按 `[Program, Channel]` 规范化来源，因此同一 SMF Track
出现多个 Channel 或 Program 时会形成多个 normalized Track。本批不增加动态 Program Change
Project Fact，也不在播放途中切换 Device。`midi-file` 回归 fixture 固定了同一 Channel 中途换
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
- 初始 CC7 Gain 与 CC10 Pan 属于 MI3B；动态 Program、CC7 / CC10、CC11、Pitch Bend、Aftertouch
  和 Articulation 继续延期。

## 5. 自动验证

- `@seele-daw/project-midi` Type Check 与 3 个测试文件 / 26 项测试通过；
- `@seele-daw/midi-file` Type Check 与 3 个测试文件 / 15 项测试通过；
- `@seele-daw/playback` Type Check 与 9 个测试文件 / 107 项测试通过；
- Studio Type Check 与 64 个测试文件 / 412 项测试通过；
- 根级 `pnpm lint` 已通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- Studio Production Build 与 soundbank dist boundary 通过，本地 Soundbank 未进入 `dist`。

本批不执行人工声音试听，也不重复完整根级 `pnpm check`；多音源资源压力、混合 Peak 与总谱听测
仍由 MI4 / MI5 完成。
