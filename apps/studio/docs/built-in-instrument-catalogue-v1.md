# Studio Built-in Instrument Catalogue V1

> Status: MI2 reviewed and committed as `f13df2f`; complete source Preset extension implemented,
> pending review on 2026-09-04
>
> Date: 2026-09-03
>
> Scope: `apps/studio` and the minimal public Sample Instrument surface of
> `@seele-daw/playback`

本文记录 Studio 如何把 MI1B / MI1C 已审核的开发者本地 Soundbank 变成可见、可保存的 Track
Instrument 选择。MIDI、Soundbank、Catalogue 与 Missing Instrument 等术语见
[多乐器总谱发声 V1 术语表](../../../packages/audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

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
  -> ProjectTrackCoordinator
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
- 本批不升级 Project File schema，不迁移旧项目，也不把未知 Device 回退为钢琴。
- MIDI Program、Channel 10 自动路由和不可用 Program 占位由 MI3A 接入；MI3B 进一步把导入时的
  初始 CC7 / CC10 映射到 Track Channel，不改变 Catalogue 身份。
- 完整固定 Preset 目录已经可浏览；跨字段搜索、Preview Audition、远程安装、插件管理、Action
  Catalogue 与用户 Keymap 继续延期。
- 本批只接通目录、显式选择与位置派生；多 Soundbank Cache 与自动混合 Peak 随后分别由 MI4 /
  MI5 验收，人工总谱听测仍为 `not-run`。

## 5. MI2 自动验证

- `@seele-daw/playback` Type Check 与 9 个测试文件 / 107 项测试通过；
- Studio Type Check 与 63 个测试文件 / 403 项测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- Studio Production Build 与 soundbank dist boundary 通过，本地 Soundbank 未进入 `dist`。
- 本地浏览器可见 smoke 确认 Reka UI Portal 使用 Piano Black 样式呈现分组与滚动，选择后 Trigger
  更新且关闭弹层，Instrument Card 内没有原生 `select`，控制台没有 warning / error。22 个选项
  均保留固定的选中标记列并让名称使用完整文本列；在 201 px 实际弹层宽度下，最长的
  `General MIDI Percussion` 保持单行且没有单词截断换行。

本批未执行人工声音试听；完整根级 `pnpm check` 继续保留给多乐器阶段门禁，不把手动选择自动
解释为 Program 路由、Runtime 压力或听觉验收已经完成。

完整 Preset 扩展、独立 GM 路由、289 项资产指纹、控制元数据执行边界和失败边界见
[Studio Built-in Preset Catalogue and General MIDI Routing V1](./general-midi-built-in-routing-v1.md)。
MI2 的 22 项验证记录仍是历史基线，不应被倒写成当时已经完成完整目录覆盖。
