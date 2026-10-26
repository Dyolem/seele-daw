# General MIDI Percussion Compatibility Policy V1

本文记录 `general-midi-percussion-v1` 的来源约束、Manifest 转换和用户预期听觉。这套鼓组是开发者
本地资产：Studio 可以手动选择它，导入总谱时 Channel 10 会自动选择它。相关基础术语见
[多乐器总谱发声 V1 术语表](../../../docs/archive/audio-web/built-in-multi-instrument-score-playback-v1-glossary.md)，通用
One-shot / Exclusive Group 执行语义见
[Audio Quality Foundation V1A 术语表](../../../docs/archive/audio-web/audio-quality-foundation-v1a-glossary.md)。

## 1. 为什么需要专用政策

来源 `general-midi-drums-v2-v4` 提供 MIDI `35...81` 共 47 枚鼓件 Sample，但控制文件把自身标记为
普通 `instrument`，没有逐 Zone 的 `oneshot` 标记，也没有 `mutexSets`。通用来源 Adapter 因此只能
忠实生成 gated、无 Exclusive Group 的原始 Manifest；仅凭显示名或 Channel 10 猜测鼓组行为，会把
未经核对的推断扩散到其他控制文件。

准备工具在来源 Adapter 之后、最终 Manifest 验证之前应用一个命名政策。它只接受已经由六个输入
SHA-256、Catalog / Index / Mapping / Archive 交叉验证过的这一份来源，不改变通用 Mapping 字段的
解释，也不改变 Sample Voice Runtime。

## 2. 失败关闭的输入契约

政策应用前必须同时满足：

- 来源 slug 精确为 `general-midi-drums-v2-v4`；
- 产品 `soundbankId` 为 `general-midi-percussion`，显示名为 `General MIDI Percussion`；
- Manifest 恰好包含 47 个按规范顺序排列的 Zone；
- MIDI `35...81` 每个 Pitch 恰好一枚 exact-key Zone，且 Root Pitch 与 Selector Pitch 相同；
- 每枚 Zone 都是 gated、no-loop、无 Exclusive Group。

任一前置条件变化都会报 `manifest-policy-mismatch` 或 `policy-source-mismatch`，不会产生部分输出。
未知政策名在读取任何来源文件之前按 `invalid-definition` 失败。来源以后若修订控制语义，必须先更新
指纹并重新核对，不能让旧政策静默覆盖新数据。

## 3. 输出语义与用户预期听觉

转换后的 47 枚 Zone 全部使用 `one-shot`：

- 一次 Note On 让对应鼓件 Sample 播放到素材的自然结尾；
- 很短的 MIDI Note、普通 Note Off 或二值 CC64 的最终 Gate Release 不会把鼓尾截成短促的点击；
- Stop、Cancel、all-notes-off、Voice Stealing 和资源清理仍用快速释放结束 Voice，因此 One-shot 不
  表示声音无法停止；
- 来源的 `0.133 s` Release 元数据原样保留，但普通 Gate Release 不会为 One-shot 排程这段包络。

MIDI `42` Closed Hi-hat、`44` Pedal Hi-hat 与 `46` Open Hi-hat 使用同一个对称 Exclusive Group：

```text
groupId = 1
offByGroupId = 1
offMode = fast
```

听觉上，新的踩镲触发时，同组中更早的踩镲以 `6 ms` 快速释放退场，新 Voice 正常起音；这避免 Open
Hi-hat 与 Closed / Pedal Hi-hat 不自然地长时间叠响。政策不推断 Mute/Open Triangle、Cuica、Guiro
等其他配对的 Choke，也不让相同 Pitch 的重复鼓点全局互斥。

Timpani 是独立的 melodic Soundbank，保留来源的 gated 控制，不继承本政策。其余 Score Core
Soundbank 使用 `preserve-source-controls-v1`，各自的 Loop、Envelope、One-shot 或来源 Mutex 仍由
控制文件决定。

## 4. 准备与检查

```sh
pnpm --filter @seele-daw/audio-web prepare:general-midi-percussion-local
pnpm --filter @seele-daw/audio-web prepare:score-core-local
```

政策的输出是 47 个 Zone、全部 One-shot、3 个 Exclusive Group Zone（MIDI `42 / 44 / 46`）、没有
Loop。Score Core 汇总报告为每个条目记录命名的 `manifestPolicy`；准备工具拒绝覆盖任何未经核对的
冲突目录。

测试覆盖：政策身份与 47 个 Pitch 的前置条件、47 个 One-shot、只有三个 Hi-hat Group、来源控制
原样返回、未知政策提前失败，以及 Runtime 上“旧 One-shot 被新同组 Voice 快速 Choke、新 Voice
继续自然播放”的组合语义。

## 5. 尚未提供

Velocity 只调整单层 Sample 的增益；没有 Round Robin、Velocity Layer、鼓组 Mixer、Room Mic 或新增
效果。鼓件尾部和 Hi-hat Choke 的人工听测仍为 `not-run`。
