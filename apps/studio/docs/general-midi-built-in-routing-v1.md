# Studio Built-in Preset Catalogue and General MIDI Routing V1

> Status: implemented, pending review
>
> Date: 2026-09-04
>
> Scope: complete source Preset catalogue, General MIDI Program routing, developer-local
> MIDISampleSynth assets, and the Studio Instrument picker

本文记录 Studio 如何同时处理两类容易混淆、但用途不同的目录：用户手动浏览的是来源提供的完整
Preset 目录；Standard MIDI File 导入查询的是固定 128 项 General MIDI（GM）Program 路由。相关
MIDI、Program、Preset、Soundbank、控制文件与精确 / 近似映射等术语见
[多乐器总谱发声 V1 术语表](../../../packages/audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户可见结果

- `Built-in sound` 使用 Reka UI Popover + Vertical Tabs 浮层，不调用操作系统原生下拉菜单。
- 左侧展示来源目录的 15 个类别；右侧展示该类别的全部 Preset。面板总计 439 项：289 项
  `MIDISampleSynth` 可播放，139 项 `VASynth` 与 11 项 `FMSynth` 可见但暂不可播放。
- Preset 名称和说明保持单行；空间不足时整体省略，不做单词截断换行。长目录在右栏独立滚动。
- 点击可播放 Preset 只执行一次既有 Instrument Device Replace Command；点击不可播放 Preset
  只显示 `Instrument is not supported yet` 并标明所需 Engine，不修改 Track、Project History 或
  当前声音。
- 新建 Track 仍默认选择 Studio Grand；手动选择成功后，Project 保存该来源 Preset 唯一对应的
  `soundbankId`，Save / Reload 与 Undo / Redo 都能恢复同一音色。
- MIDI 导入仍按独立的 128 项 GM 表工作：108 项路由至 86 个采样 Soundbank（63 Exact、45
  Approximate），20 项候选依赖尚未实现的合成器 Runtime（18 VASynth、2 FMSynth）。Channel 10
  继续优先路由到 General MIDI Percussion。

因此，“439 个可浏览 Preset”“289 个可播放采样 Preset”和“GM 路由使用 86 个唯一采样资产”都
是正确数字，但描述的是不同集合，不能互相替代。

## 2. Preset 目录与 GM 路由分离

Preset 是来源音色库提供的具体声音；Program 是 MIDI 文件表达的标准乐器类别；Soundbank 是
Seele Project 与 Runtime 使用的稳定产品身份。当前关系为：

```text
manual Instrument picker
  -> 439 source Presets in 15 source categories
  -> 289 unique MIDISampleSynth Soundbank IDs
     + 150 visible synth-runtime-unavailable Presets

Standard MIDI File import
  -> 128 GM Program routes
  -> 108 available sample routes + 20 unavailable synth-runtime routes
  -> 86 unique MIDISampleSynth Soundbank IDs (a subset of the 289)
```

Studio 冻结的 Preset Snapshot 是完整手动目录权威；`GENERAL_MIDI_PROGRAM_ROUTES` 是导入路由
权威。Browser Playback Runtime 只从 289 项可播放目录派生 same-origin asset location。Project
Core 不知道 Preset 类别或 GM 表，只保存通用 Device Descriptor；Playback 只消费
`soundbankId`。

多个 GM Program 可以经过审核后复用同一近似 Soundbank，例如 Electric Piano 1 / 2 都可路由到
`electric-piano`。这不会减少手动目录：用户直接选择来源 Preset 时，每个可播放 Preset 都有唯一
Soundbank ID，并能恢复该具体选择。GM 导入的 Approximate 结果仍产生非阻断诊断，不能伪装成
完全一致的原音色。

## 3. 本地资产与来源冻结

Snapshot 生成器只读取三份指纹固定的公共索引，并为 289 个 MIDISampleSynth 来源进一步冻结
Catalog、Mapping 与 WAV Archive 哈希。完整输入集合为 870 个文件，集合 SHA-256 为
`179c26c7e23a0f9b6ebed3d802f2179cc681f9d8f617032788b837bc5b523555`；任何来源漂移都必须先
重新审计，不能由运行时自动接受。跟踪的 Snapshot 不保存远程下载 URL。

开发命令 `pnpm --filter @seele-daw/audio-web prepare:built-in-presets-local` 逐音源准备完整 289
项采样 Preset，复用已经审核的 86 项 GM 子集并新增 203 项定义。新增定义保留来源原生 Pitch
Selector 与空隙，不人为扩展连续音域；未覆盖 Pitch 会在资源准备边界明确失败。

首次完整准备得到 289 个 Manifest、4,664 个 Zone / Resource，合计约 2.172 GB 压缩 Archive、
2.758 GB 解压输入、2.756 GB 生成 WAV 与 5.511 GB 解码 Float32 估算。实测最大单 Archive 为
67,453,699 bytes、最多 74 个 Entry、最大单 Entry 为 4,659,232 bytes、最大总解压为
87,662,379 bytes；新增来源采用 128 MiB Archive / 总解压、128 Entries、8 MiB 单 Entry 与压缩率
64 的上限。既有 86 项继续保持各自已审核的更窄预算。幂等复跑时 289 项全部为 `current`，库存
报告 SHA-256 保持
`0117e50075604585a43a583c5fe83dfc2fde4ec26055dc2e7b7c9207812a3234`。

所有生成内容继续受 `.gitignore` 与 production dist boundary 排除，只是开发者本地验证资产，
不是可再分发产品内容。

## 4. 采样控制元数据与执行器

289 个 MIDISampleSynth Preset 不需要再建立一种新 Engine。现有 Mapping Adapter 会把来源控制
文件转换为严格的 Seele Sample Instrument Manifest，现有 Sample Voice Runtime 再执行该
Manifest。完整 Snapshot 审计覆盖 4,664 个 Zone，当前实际出现的控制如下：

| 来源控制含义                       | Seele Manifest / Runtime 行为                                         |
| ---------------------------------- | --------------------------------------------------------------------- |
| Pitch Selector / Range             | 为目标 MIDI Pitch 选择确定的 Zone 与 WAV；空隙不猜测资源              |
| Root Pitch 与 Tune                 | 计算 `AudioBufferSourceNode.playbackRate`，完成移调与微调             |
| Source Frame Offset                | 从声明的采样帧位置开始播放                                            |
| Attack / Release 与 Envelope Curve | 由 Gain Envelope 排程起音和退场；非零曲线使用 Seele 已冻结的分段近似  |
| Loop Start / End / Mode            | 执行 no-loop、continuous loop 或 sustain loop                         |
| Trigger                            | 区分 gated Voice 与 one-shot；普通 Note Off 不提前截断 one-shot       |
| Mutex / Exclusive Group            | 执行有方向的 Choke，例如已审核 General MIDI Percussion 的 Hi-hat 互斥 |

Velocity、Track Gain、Pan、系统输出校准、复音预算、Voice Stealing 与 CC64 最终释放由 Seele 的通用
Playback / Audio Runtime 政策叠加，不是每份来源 Mapping 各自实现一套播放器。

这里的“已支持”有严格边界：

- 来源 Catalog 的颜色、筛选标签、默认八度等字段只服务浏览或来源宿主界面，不是发声控制参数。
- 当前 289 份 Mapping 的 Crossfade 值均为零；Adapter 对非零 Crossfade 明确拒绝，不能据此宣称
  已实现采样交叉淡化。
- 这些 Mapping 没有声明 Velocity Layer、Release Sample、Round Robin 或钢琴共鸣素材，因此
  Runtime 也不会凭空创造这些表现力。
- `category = kit` 到 one-shot、有效 Loop 到对应 Loop Mode、Envelope 曲线数学等属于经全量数据
  审计后冻结的兼容解释；它们证明当前来源能被一致执行，但不是与来源私有播放器逐音色 A/B
  后的 sample-identical 复刻证明。

## 5. 兼容与失败边界

- `Not supported` 表示来源 Preset 属于尚未实现的 VASynth / FMSynth Engine，不是资源损坏。
  手动点击不创建无声 Device；MIDI 导入仍保存 Program Placeholder，等待未来 Runtime 或用户
  显式选择采样替代。
- Catalogue 已声明可播放但本机 Manifest/WAV 缺失或内容不符，属于播放资源失败；合法 Project
  Commit 不回滚，也不静默换成 Studio Grand。
- 本批没有实现 Bank Select、动态 Program Change、CC1、CC11、动态 CC7 / CC10、Pitch Bend、
  Aftertouch、Articulation、Velocity Layer、Release Sample 或钢琴共鸣。
- 本批扩大的是可访问目录和资源准备覆盖，不等于 289 个音色全部完成人工试听。自动结构与数值
  门禁不能替代逐音色听觉审核。

## 6. 验证证据

- Snapshot 生成器幂等复跑得到 439 项 Preset、289 项采样指纹与相同的 870 文件集合哈希。
- 完整本地资产准备幂等复跑时，289 项全部为 `current`，库存报告哈希保持不变。
- Audio Web 目标测试 3 个文件 / 9 项、Studio 目录 / 导入 / Inspector / Browser Runtime 目标测试
  4 个文件 / 23 项，以及两个包的 Type Check 均通过。
- 根级 `pnpm check` 通过 Architecture、Workspace Quality、Format、Oxlint、ESLint、全工作区 Type
  Check、157 个测试文件 / 1,365 项测试、Studio Production Build 与 soundbank dist boundary。
- 真实 Studio 浏览器 smoke 在 1280 × 720 视口确认：浮层完整位于视口内；15 类与 439 / 289
  计数正确；23 项 Piano 与 74 项 Synth Bass 目录可滚动且没有文本换行；VASynth / FMSynth 点击
  只告警并保持当前 Track；新增 `Dark Grand` 可选择并恢复选中态；控制台无 warning / error。

本批没有执行 289 个音色的逐项人工听测，也没有把结构兼容审计解释成与来源播放器逐音色一致。
