# Studio Built-in Instrument Catalogue V1

本文记录 Studio 如何把开发者本地的 Soundbank 变成可见、可保存的 Track Instrument 选择，涉及
`apps/studio` 与 `@seele-daw/playback` 公开的通用 Sample Instrument 接口。MIDI、Soundbank、Catalogue 与 Missing Instrument 等术语见
[多乐器总谱发声 V1 术语表](../../../docs/archive/audio-web/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户可见行为

- 新建 Instrument Track 仍默认保存 `Studio Grand`，不会改变已有项目习惯。
- Track Inspector 的 `Built-in sound` 选择器展示来源目录中的完整 439 项 Preset：289 项
  MIDISampleSynth 可播放，139 项 VASynth 与 11 项 FMSynth 可见但暂不可播放。
- 选择器使用 Reka UI Popover 与 Vertical Tabs：左侧是来源提供的 15 个类别，右侧是当前类别的
  全部具体 Preset。它由 Studio Piano Black token 绘制；macOS 等平台不会弹出与应用视觉割裂的
  系统原生下拉菜单。
- Preset 名称与说明都保持单行，空间不足时整体省略；长目录在右侧独立滚动。点击不可用合成器
  Preset 只给出暂未支持提示，不改变 Project Fact。
- Ready、旧 Empty Slot 和 Missing Instrument 都可由用户显式选择一个内置音色；不会在打开项目
  或开始播放时自动替换。
- 一次选择只执行一次既有 Instrument Device Replace Command，保持 Device ID 与 Track topology，
  并形成一个可 Undo / Redo、Save / Reload 的 Project History 步骤。
- 命令被拒绝时，选择器立即恢复旧值，旧 Descriptor 不变，并通过 Toast 显示原因。
- 选择成功不会 Preview Audition。只有主 Timeline Transport 播放 Track 已有 MIDI Note 时才准备
  该 Soundbank 的实际 Pitch 资源。

## 2. 单一目录来源

冻结的 `BUILT_IN_INSTRUMENT_CATALOGUE` 属于 Studio Composition Root 配置。每个可播放资产条目
保存：

- 稳定、来源无关的 `soundbankId`；
- Inspector 显示名；
- developer-local、same-origin asset base pathname。

完整手动目录来自指纹固定的 439 项 Preset Snapshot；其中每个 MIDISampleSynth Preset 都对应
唯一 `soundbankId`，由此派生 289 项可播放资产目录。用于 MIDI 导入的 128 项
`GENERAL_MIDI_PROGRAM_ROUTES` 是另一套权威：其 108 个可播放 route 只覆盖这 289 项中的 86 个
唯一 Soundbank，同一采样可服务多个近似 Program。General MIDI Percussion 还拥有独立 Channel
10 路由角色。

Inspector Presentation 和 Browser Playback Runtime 都从这份目录派生，不能分别维护音色名称与
URL Map。Project Core 只保存通用 Device Descriptor；Playback 只解码 `soundbankId`；Audio Web
只按 Studio 注入的位置准备 Manifest/WAV，不读取目录。

```text
Inspector selection
  -> edits.tracks
  -> ReplaceInstrumentDeviceCommand
  -> Project Snapshot { seele.sample-instrument, soundbankId }
  -> Track presentation <---- Studio Catalogue ----> browser asset location
  -> Playback plan
  -> Audio Web resource preparation / voice runtime
```

`@seele-daw/playback` 包根只新增 Studio 已有真实消费者所需的通用 Sample Device
factory/decoder、definition 与 state type；目录身份与 UI 分组不会下沉到 Playback。

## 3. 状态与失败边界

| Inspector 状态 | 判定                                                                         | 选择器行为                         |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| Ready          | Descriptor 是精确 V1 Sample Instrument，且 `soundbankId` 位于目录            | 显示当前音色，可显式替换           |
| Empty          | Descriptor 是严格匹配的旧 `seele.instrument-slot` V1 空状态                  | 显示空状态，可显式选择             |
| Missing        | Device 不存在、Descriptor 不兼容、类型未知，或 Sample `soundbankId` 不在目录 | 展示可识别的已保存身份，可显式替换 |

Missing 不会改写 Project Fact。若未知 Sample Device 含合法 `soundbankId`，Inspector 展示该 ID；
其他未知 Device 展示 `typeId`。保存和加载仍由 Project Core 原样 round-trip。

命令失败与资源失败是两个独立边界：

- 选择命令失败：Project 没有 Commit，旧 Instrument 继续显示；
- 选择已提交但 Manifest/WAV 缺失或损坏：Project Commit 合法且不能回滚，随后 Play 在既有资源
  准备边界明确失败；
- Catalogue Entry 存在只表示产品路由已配置，不表示本地资产可分发或一定安装完整。

## 4. 兼容与延期

- developer-local Soundbank 继续由 `.gitignore` 排除，Studio production dist guard 继续禁止复制
  整棵本地资产。
- 目录不改变 Project File schema，也不把未知 Device 回退为钢琴。
- 导入 MIDI 时，Program 与 Channel 10 自动选择音色，不可用的 Program 保存为可见的占位；初始
  CC7 / CC10 映射到 Track Channel。这些都不改变目录身份。
- 跨字段搜索、Preview Audition、远程安装与插件管理尚未提供。
- 音色的人工听测仍为 `not-run`。

## 5. 相关文档

完整 Preset 扩展、独立 GM 路由、289 项资产指纹、控制元数据执行边界和失败边界见
[Studio Built-in Preset Catalogue and General MIDI Routing V1](./general-midi-built-in-routing-v1.md)。
