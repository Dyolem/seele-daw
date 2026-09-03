# General MIDI Percussion Compatibility Policy V1

> Status: MI1C reviewed and committed as `fddeb3e`; MI2 committed as `f13df2f`; refreshed for
> MI5 URL-safe asset names
>
> Date: 2026-09-03
>
> Product availability: developer-local asset; manual Studio selection is provided by MI2 and
> Channel 10 import routing by MI3A

本文记录 `general-midi-percussion-v1` 的来源约束、Manifest 转换和用户预期听觉。相关基础术语见
[多乐器总谱发声 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)，通用
One-shot / Exclusive Group 执行语义见
[Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。

## 1. 为什么需要专用政策

已审核来源 `general-midi-drums-v2-v4` 提供 MIDI `35...81` 共 47 枚鼓件 Sample，但控制文件把
自身标记为普通 `instrument`，没有逐 Zone `oneshot` 标记，也没有 `mutexSets`。通用来源 Adapter
因此只能忠实生成 gated、无 Exclusive Group 的原始 Manifest；仅凭显示名或 Channel 10 猜测鼓组
行为会把未审核推断扩散到其他控制文件。

MI1C 在来源 Adapter 之后、最终 Manifest 验证之前应用一个命名政策。它只接受已经由六个输入
SHA-256、Catalog / Index / Mapping / Archive 交叉验证过的这一份来源，不改变通用 Mapping 字段
解释，也不改变 Sample Voice Runtime。

## 2. 失败关闭的输入契约

政策应用前必须同时满足：

- 来源 slug 精确为 `general-midi-drums-v2-v4`；
- 产品 `soundbankId` 为 `general-midi-percussion`，显示名为 `General MIDI Percussion`；
- Manifest 恰好包含 47 个按规范顺序排列的 Zone；
- MIDI `35...81` 每个 Pitch 恰好一枚 exact-key Zone，且 Root Pitch 与 Selector Pitch 相同；
- 每枚 Zone 当前均为 gated、no-loop、无 Exclusive Group。

任一前置条件变化都会报 `manifest-policy-mismatch` 或 `policy-source-mismatch`，不会产生部分输出。
未知政策名在任何来源文件读取前按 `invalid-definition` 失败。来源以后若修订控制语义，必须先更新
指纹并重新审核，不能让旧政策静默覆盖新数据。

## 3. 输出语义与用户预期听觉

转换后的 47 枚 Zone 全部使用 `one-shot`：

- 一次 Note On 应让对应鼓件 Sample 播放到素材自然结尾；
- 很短的 MIDI Note、普通 Note Off 或二值 CC64 的最终 Gate Release 不应把鼓尾截成短促点击；
- Stop、Cancel、generation 切换、Voice Stealing 和资源清理仍可使用既有快速释放安全结束 Voice，
  因此 One-shot 不表示声音无法停止；
- 来源的 `0.133 s` Release 元数据原样保留，但普通 Gate Release 不会为 One-shot 排程该包络。

MIDI `42` Closed Hi-hat、`44` Pedal Hi-hat 与 `46` Open Hi-hat 使用同一个对称 Exclusive Group：

```text
groupId = 1
offByGroupId = 1
offMode = fast
```

听觉上，新踩镲触发时，同组中更早的踩镲应在既有 `6 ms` 快速释放中退场，新 Voice 正常起音；
这避免 Open Hi-hat 与 Closed / Pedal Hi-hat 不自然地长时间叠响。政策不推断 Mute/Open Triangle、
Cuica、Guiro 等其他配对的 Choke，也不把相同 Pitch 的重复鼓点全局互斥。

Timpani 是独立 melodic Soundbank，继续保留来源 gated 控制，不继承本政策。其余 20 个 Score Core
Soundbank 也使用 `preserve-source-controls-v1`，各自的 Loop、Envelope、One-shot 或来源 Mutex 仍由
控制文件决定。

## 4. 本地资产证据

执行：

```sh
pnpm --filter @seele-daw/audio-web prepare:general-midi-percussion-local
pnpm --filter @seele-daw/audio-web prepare:score-core-local
```

MI1C 本地结果：

| 指标                    | 结果                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| Zone                    | 47                                                                 |
| One-shot Zone           | 47                                                                 |
| Exclusive Group Zone    | 3（MIDI `42 / 44 / 46`）                                           |
| Loop Zone               | 0                                                                  |
| Manifest bytes          | 31,459                                                             |
| Manifest SHA-256        | `61d3c00b60c98eb0b92f8a1b727533d00f8481642c32feef9b222d873068c1c4` |
| Preparation report hash | `578f7329f3e892792fea5726aee278521eb799b24361a80afddb2286cdeb1d80` |
| Score Core report hash  | `6faff68a9c7adf521195a809d405f6b7b849047fbb19397247eedc8fb071b82b` |

Score Core 汇总报告升级为 schema version 2，并为每个条目记录命名 `manifestPolicy`。连续两次完整
准备中，22 个 Soundbank 均为 `current`，汇总报告第二次也为 `current`。与 MI1B 相比，Archive、
WAV、Zone 数、Loop 数和解码内存均不变；只有 GM Percussion 的 Manifest 控制语义与相应报告发生
变化。MI5 因 URL 安全资源名再次刷新 Manifest / report 哈希，但 47 枚 WAV 和全部 Trigger / Group
语义不变。工具仍拒绝覆盖任何未审阅的冲突目录。

自动验证同时覆盖：政策身份与 47 Pitch 前置条件、47 个 One-shot、仅三个 Hi-hat Group、来源控制
原样返回、未知政策提前失败，以及 Runtime 上“旧 One-shot 被新同组 Voice 快速 Choke、新 Voice
继续自然播放”的组合语义。

## 5. 仍未交付

MI2 让用户能在 Studio Inspector 手动选择这套鼓组，并从同一 Catalogue 派生本地资源位置；MI3A
让导入总谱的 Channel 10 自动选择它。Velocity 仍只调整单层 Sample 增益；没有 Round Robin、
Velocity Layer、鼓组 Mixer、Room Mic 或新增效果。MI5 已通过含 Channel 10 的真实总谱自动混合
Peak、路由与资源清理门禁；人工鼓件尾部和 Hi-hat Choke 听测仍为 `not-run`。
