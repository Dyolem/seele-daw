# BandLab MIDISampleSynth 控制文件逆向分析

> Status: source compatibility evidence; not a Seele host or Runtime specification
>
> Audited: 2026-08-12

本文对当前 developer-local Soundbank 快照中的全部 `MIDISampleSynth` 控制文件做逆向分析，
记录数据能够直接证明的事实、高置信兼容性推断以及仍需听觉验证的疑点。它只描述这套源数据，
不定义 Seele 的通用 Sample Instrument 规则，也不声称完全复刻 BandLab 的原始播放器。

Seele 的规范规则另见
[Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](./seele-supported-sfz-profile-v1.md)。
当前快照的来源、指纹和不可分发边界见
[Studio Grand 本地验证资产记录](./studio-grand-local-validation-assets.md)。

## 1. 逆向分析结论

`MIDISampleSynth` 是共享采样播放模型的一组音源数据，不是只有一种发声形状的单一音色：

- 同一家族同时包含按音高范围移调的旋律型音源、按 MIDI 键精确触发的 Kit / Percussion、自然
  衰减的 one-shot、受 Note Off 控制的 gated sample，以及包含持续 loop 的音源；
- 单个 Zone 的选择和发声提示来自 Soundbank 顶层字段与逐 Zone 字段的组合，不能由
  `Studio Grand` 名称、`instrumentSlug` 或 UI 分类单独决定；
- Catalog 与 Indexes 提供发现、展示、Archive 和 General MIDI 反向映射；单个 Mapping 及其
  Sample 才提供直接的播放控制证据；
- 观察到的 key range、root、tune、offset、loop、attack / release、one-shot 与 mutex 概念和
  SFZ 高度相似，但当前 JSON 不是 SFZ，也没有保留全部 SFZ 控制信息；
- `category=kit -> one-shot`、缺失 `loop_mode` 时如何解释有效 loop point 等规则，只是针对当前
  数据闭合关系的兼容性推断。它们必须留在默认内置 Mapping Adapter 中，不能成为所有音源的
  默认规则；
- 当前快照没有 velocity layer、round-robin、release sample、踏板、共鸣或物理建模控制。不能
  根据音源名称补造这些能力。

## 2. 核验范围与方法

核验输入位于被 `.gitignore` 排除的：

```text
apps/studio/public/soundbanks/
├── catalog/
├── indexes/
└── soundbanks/MIDISampleSynth/
```

本次只读核验覆盖：

- 289 份 Mapping、289 份 per-Soundbank Catalog 和两个全局 Index；
- 289 个 WAV Archive 与 289 个 M4A Archive，共 578 个 ZIP；
- 4,664 个 Sample Zone 的字段、类型、组合、range、root、loop 和资源引用；
- 每个 Archive 的内嵌 `<slug>.json` 与外部 Mapping 的语义相等性；
- 每个 Archive 的音频条目与 Mapping `fileName` 的一一对应；
- 每个 Soundbank 首个 WAV 的 RIFF、format、channel、sample rate、bit depth 与 chunk；
- 91 个包含有效 loop 的 Soundbank 首个 Zone 的 loop 位置与 WAV duration 交叉验证。

578 个 Archive 都满足：内嵌 JSON 存在、与外部 Mapping 语义相等、没有缺失或多余的目标格式
音频条目，也没有重复条目。289 个首 Zone WAV 都是 44.1 kHz、双声道、16-bit PCM，核验到的
RIFF chunk 只有 `fmt ` 与 `data`。这些只是当前快照的测量结果，不能提升为未来输入的格式常量。

本文没有完成与原播放器的 A/B 听觉比较。因此 envelope curve 的精确数学形状、Kit 默认
one-shot 是否逐样本一致、M4A 解码后的 loop 对齐等仍未得到最终证明。

## 3. 术语解释

以下是本文使用的采样器与 MIDI 行业术语。它们帮助描述源数据，不等于声明某个播放器必须采用
本文推断的实现细节。

| 术语                            | 本文含义                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Soundbank / Sample Instrument   | 一组 Sample、映射与控制信息共同组成的可演奏音源，例如 Studio Grand；也可以是一套 Drum Kit。                                                                         |
| Sample                          | 一段实际录制或渲染的音频数据，例如某个钢琴音高的一枚 WAV；它不是 MIDI Note。                                                                                        |
| Multisample                     | 用多枚 Sample 覆盖不同音高、力度或奏法，再把它们组合成一件乐器。                                                                                                    |
| Zone / Region                   | 一条“什么输入条件下使用哪枚 Sample，并如何播放”的规则。本文沿用源数据的 `Zone`；SFZ 通常称为 `region`，SoundFont 也使用 zone。                                      |
| Root pitch / Pitch key center   | Sample 不移调播放时代表的 MIDI 音高。目标音高偏离 root 时，播放器通常通过 playback rate 移调。                                                                      |
| Key range / Exact key           | Zone 响应一段 MIDI 键盘闭区间，或只响应一个精确 MIDI 键。它们都是 selector，不等于 Sample 自身的频率范围。                                                          |
| Note On / Note Off              | MIDI 语义上的按键开始与结束事件。                                                                                                                                   |
| Voice                           | 一次正在播放或仍处于 release tail 的独立发声实例；相同音高的重叠 Note 仍可形成不同 Voice。                                                                          |
| Polyphony                       | 播放器同时维持的 Voice 数量或上限。超过上限时如何 voice stealing 是另一项播放策略。                                                                                 |
| Gated                           | Voice 的常规结束受 Note Off 控制；Note Off 通常启动 release envelope，而不是立即硬停。                                                                              |
| One-shot                        | Note On 后通常让 Sample 自然播放到末尾，普通 Note Off 不提前结束；drum hit 和部分短奏法常用。Choke 或强制停止仍可以结束它。                                         |
| Loop                            | 到达 loop end 后回到 loop start，重复播放 Sample 内的一段；它不是时间线 Clip Loop。                                                                                 |
| Sustain loop                    | 为延长持续音而重复 Sample 中稳定片段的做法。当前控制文件没有显式 loop mode；依据尾部长度推断出的候选含义更接近 SFZ `loop_continuous`，不是已证明的 `loop_sustain`。 |
| Envelope / ADSR                 | 随时间改变 gain、pitch 或 filter 等参数的轮廓。ADSR 是 Attack、Decay、Sustain、Release 的常见简写；当前 Mapping 只显式提供部分 attack / release 信息。              |
| Attack                          | Note On 后从起始 gain 变化到目标 gain 的阶段及持续时间。                                                                                                            |
| Release / Release tail          | Note Off 后让 gain 衰减至静音的阶段；这段仍可听但 Note 已逻辑结束的声音称 release tail。                                                                            |
| Velocity layer / Velocity gain  | 前者按力度选择不同 Sample，后者只用同一 Sample 改变音量。当前控制文件没有 velocity layer，不能把两者混称。                                                          |
| Tune / Playback rate            | `tune` 是以 cent 表示的微调；playback rate 是播放器综合目标音高、root 和 tune 后使用的播放速率。                                                                    |
| Start offset                    | 跳过 Sample 开头一段数据再开始播放的位置；当前源字段以 source sample frame 表示。                                                                                   |
| Choke / Mutex / Exclusive group | 新 Voice 触发时让指定组中的旧 Voice 快速结束，例如 closed hi-hat 截断 open hi-hat。                                                                                 |
| Round-robin                     | 多枚等价 Sample 按轮次切换，以减少机械重复感；当前 Mapping 没有该字段。                                                                                             |

## 4. 控制文件分工

| 输入                                   | 在源数据中的作用                                     | 是否直接提供发声证据              |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| `catalog/soundbanks.raw.json`          | 分类、集合、完整 Catalog 与 GM 映射的原始来源        | 否                                |
| `catalog/selected-soundbanks.json`     | 当前选择的 439 个 Soundbank Catalog Record           | 否                                |
| `<slug>.catalog.json`                  | 单音源显示名、分类、预览与 Archive 地址              | 只提供显示与资源发现信息          |
| `indexes/soundbank-map.json`           | slug → engine、文件、Archive 与 GM 的本地反向索引    | 否                                |
| `indexes/by-general-midi-program.json` | GM Program → 候选与 canonical Soundbank              | 否                                |
| `<slug>.mapping.json`                  | Sample Zone 与控制字段                               | 是                                |
| Archive 内 `<slug>.json`               | 与外部 Mapping 重复，也支持只从 Archive 恢复控制数据 | 是，与外部 Mapping 语义相等       |
| Archive 内 WAV / M4A                   | 实际 Sample 数据                                     | 是，需要与 Mapping 的资源引用结合 |

289 个 MIDISampleSynth 都能由 Index 反向定位，其中 198 个映射到真实 GM Program `0...127`，91 个
位于本地索引的 `-1` 未分类分组；63 个是对应 Program 的 canonical 候选。GM 身份有助于导入、
推荐或替代映射，但不能决定 Sample 的 loop、包络或触发方式。

`sfz` 顶层字段出现在 36 个 Mapping 中，值只是原始 SFZ authoring path；快照不包含对应 SFZ
文件。它能佐证部分字段的来源与单位，但不能替代当前 Mapping。

## 5. Mapping 实际形状

### 5.1 Soundbank 顶层

所有 Mapping 都包含同一组基础字段，另有可选的 `mutexSets` 与 `sfz`：

| 字段                               | 当前事实                                            | 逆向分析意义                   |
| ---------------------------------- | --------------------------------------------------- | ------------------------------ |
| `synth`                            | 289 个均为 `MIDISampleSynth`                        | Engine discriminator           |
| `slug` / `name`                    | 与目录和 Catalog 一致                               | 上游身份 / 显示输入            |
| `category`                         | 200 个 `instrument`，89 个 `kit`                    | 可能携带 bank-level 触发默认值 |
| `instrumentSlug` / `filters`       | 展示与发现分类                                      | 未观察到直接发声作用           |
| `release`                          | 199 个 finite number，90 个 `null`，范围 `0...0.25` | Soundbank 级 release 候选      |
| `mutexSets`                        | 226 个缺失、22 个 `null`、40 个空数组、1 个非空数组 | 空值或 MIDI choke group        |
| `sfz`                              | 36 个 string，其余缺失                              | authoring provenance           |
| `defaultOctave` / `userInterfaces` | Keyboard / Pad UI 默认值                            | 未观察到发声作用               |
| `color` / `subTitle` / `updatedAt` | Catalog / 展示元数据                                | 未观察到发声作用               |

唯一非空 `mutexSets` 来自 `james-alister-kit-v4`，值为 `[[42, 46]]`，对应 closed / open hi-hat
键位。

### 5.2 Sample Zone

全部 4,664 个 Zone 都包含：

```text
fileName
midiNumber
minRange / maxRange
loopStart / loopEnd
crossfade
urls.wav / urls.m4a
```

可选控制字段的覆盖为：

| 字段组合                       | Soundbank 数 | Zone 数 | 候选单位 / 含义                            |
| ------------------------------ | -----------: | ------: | ------------------------------------------ |
| `tune`                         |           31 |     532 | cents                                      |
| `attackTime` + `attackCurve`   |           22 |     488 | seconds + unitless curve                   |
| `releaseTime` + `releaseCurve` |            5 |      64 | seconds + unitless curve，逐 Zone override |
| `oneshot: true`                |            3 |      85 | 普通 Note Off 不结束 Sample                |
| `offset`                       |            1 |      12 | source sample frames                       |

字段组合具有以下一致性：

- `minRange` 与 `maxRange` 总是同时为整数或同时为 `null`，没有半缺失；
- `loopStart` 与 `loopEnd` 总是成对出现，没有半缺失或反向区间；
- `attackTime` 与 `attackCurve`、`releaseTime` 与 `releaseCurve` 总是分别成对出现；
- `oneshot` 只观察到 `true`，缺失表示未设置，不存在显式 `false`；
- `crossfade` 在全部 4,664 个 Zone 中都是 `0`；
- 每个 Mapping 内 `fileName` 与 `midiNumber` 都唯一；
- 没有 velocity range、round-robin、random 或多麦克风 layer 字段。

`tune` 和 `offset` 与 SFZ 字段语义相符：SFZ `tune` 以 cents 表示，`offset` 以 source sample
frame 表示。当前 Mapping 已把常见的 loop frame 转换成秒；不能把 loop 与 offset 当成同一单位。

### 5.3 与 SFZ 字段的对应证据

| 当前 Mapping                   | 接近的 SFZ 概念                         | 证据边界                                  |
| ------------------------------ | --------------------------------------- | ----------------------------------------- |
| `minRange` / `maxRange`        | `lokey` / `hikey`                       | 基本含义一致                              |
| `midiNumber`                   | `pitch_keycenter` / `key`               | 当前 JSON 合并了 root 与 exact-key 用途   |
| `tune`                         | `tune`                                  | cents 语义高度一致                        |
| `offset`                       | `offset`                                | source frame 语义高度一致                 |
| `oneshot`                      | `loop_mode=one_shot`                    | 普通 Note Off 行为相近                    |
| `attackTime` / `attackCurve`   | `ampeg_attack` / `ampeg_attack_shape`   | curve 的精确数学函数未证明                |
| `releaseTime` / `releaseCurve` | `ampeg_release` / `ampeg_release_shape` | 顶层 fallback 是当前 JSON 特有的继承形状  |
| `loopStart` / `loopEnd`        | `loop_start` / `loop_end`               | JSON 使用秒且丢失了显式 loop mode         |
| `mutexSets`                    | `group` / `off_by` / `off_mode`         | 只能确认 choke 意图，不能证明全部参数等价 |
| `category=kit -> one-shot`     | 没有直接等价的显式 opcode               | 由当前数据闭合关系推断                    |

因此这套 JSON 不能被称为 SFZ。字段对应只用于解释其来源和构建兼容性适配器。

## 6. Zone 选择

### 6.1 两种 selector

Zone 选择形状应按字段组合解释，而不能只按 `category` 分支：

1. `minRange` 与 `maxRange` 都是整数：使用闭区间 `[minRange, maxRange]`；`midiNumber` 表示
   Sample root pitch。
2. 两者都是 `null`：只在输入 MIDI pitch 等于 `midiNumber` 时触发，不进行相邻键扩展。

当前分布为：

| Zone selector                         | Zone 数 |
| ------------------------------------- | ------: |
| 非单点 numeric range                  |   2,951 |
| `minRange = maxRange = midiNumber`    |     366 |
| `minRange = maxRange = null` 的精确键 |   1,347 |

按 Soundbank 统计：174 个只有非单点 range，21 个混合 range 与 numeric exact key，8 个只有
numeric exact key，86 个只有 null exact key。null exact key 不只存在于 Kit：`Growler Bass`
为 MIDI `36...108` 每键一枚 Sample，两个 General MIDI Drum 音源也使用该形状。

### 6.2 排序与覆盖

三个吉他 Mapping（12 String Guitar、Jazz Guitar、Acoustic Guitar）的原始 Zone 数组没有按
range 排序。按 selector 规范化排序后，所有含 range 的 Mapping 都满足：

- root pitch 位于自身闭区间；
- 相邻区间没有重叠或空洞；
- 一个输入 pitch 最多命中一个 Zone。

因此兼容性读取不能依赖上游数组顺序。精确键之间可以存在没有 Sample 的 MIDI pitch，不能把
它们自动扩展成 range。每个 Soundbank 的有效音高范围来自自身数据，不存在整个家族统一的范围。

## 7. 源播放行为推断

本节的“推断”只为解释当前 BandLab 数据。显式 SFZ 或其他未来格式应按照各自已声明的语义导入，
不继承这里的私有默认值。

### 7.1 Trigger mode

当前 289 份 Mapping 可以由以下兼容性优先级完整解释：

```text
zone.oneshot === true -> one-shot
else soundbank.category === "kit" -> one-shot
else -> gated
```

应用后：

- 1,337 个 Zone 为 one-shot：1,252 个 Kit Zone 加 85 个显式 `oneshot` Zone；
- 3,327 个 Zone 为 gated；
- 每个 gated Zone 都能由 `zone.releaseTime ?? soundbank.release` 得到 finite、非负 release；
- 85 个显式 one-shot Zone 也能解析到 release，但按 Kit 默认成为 one-shot 的 Zone 通常没有；
- 88 个 Kit 的 `release` 为 `null`，Afro Cuban Percussion 为 `0`，Kit Zone 不重复写入
  `oneshot`。

这种闭合关系强烈支持 `category=kit` 是当前源格式的 bank-level one-shot 默认值，但仍需要原
播放器 A/B 验证。One-shot 描述的是普通 Note Off 行为，不意味着 choke 或停止操作无法结束声音。

### 7.2 Loop

loop 形状在每个 Soundbank 内一致：

| 上游形状                     | Soundbank 数 | Zone 数 | 候选含义  |
| ---------------------------- | -----------: | ------: | --------- |
| `0 <= loopStart < loopEnd`   |           91 |   1,626 | 有效 loop |
| `loopStart = loopEnd = 0`    |           12 |     230 | 无 loop   |
| `loopStart = loopEnd = null` |          186 |   2,808 | 无 loop   |

有效值的单位是 source buffer second。依据包括：

- 44.1 kHz 下 `loopStart * sampleRate` 与 `loopEnd * sampleRate` 落在整数 frame 附近；
- 91 个有效 loop Soundbank 的首 Zone WAV 总长都只比 `loopEnd` 多约 20 ms；
- 抽查 WAV 没有 `smpl` loop chunk；若忽略 Mapping，持续音会很快自然结束。

例如 Accordion 首 Zone 的 loop 为 `1.768005...4.090998` 秒，WAV 总长约 `4.110998` 秒；Alto
Sax 首 Zone 的 loop end 为 `1.409002` 秒，WAV 总长约 `1.429002` 秒。

由于 JSON 丢失了显式 `loop_mode`，当前数据最自洽的兼容性推断是 continuous loop：gated Note
Off 后仍在 loop 中完成 release。约 20 ms 的 post-loop 尾部通常不足以承载已声明的 release。
这项推断只适用于当前 Adapter；若未来来源数据明确写出 `loop_sustain` 或其他模式，应保留其显式
含义。

`crossfade` 当前全部为零，无法证明正值的单位与曲线。遇到非零值时应报告未知控制，而不是
假设可安全忽略。

### 7.3 Attack 与 Release

当前数据中的 release 继承形状为：

```text
zone.releaseTime ?? soundbank.release
```

逐 Zone `releaseTime` 是 override，`releaseCurve` 与它成对；否则使用 Soundbank 顶层
`release`。91 个 loop Soundbank 中，90 个使用 numeric 顶层 release；唯一顶层为 `null` 的
Classic Rock Organ 为全部 21 个 Zone 提供 `releaseTime = 0.01`。

字段量级与 SFZ authoring 来源共同支持 `attackTime`、`releaseTime` 和顶层 `release` 使用秒。
Curve 是无单位形状参数：当前 `releaseCurve` 全部为 `0`；`attackCurve` 绝大多数为 `0`，另有
两种负值。SFZ 中 `0` 表示线性、负值偏向更快的初始变化，但快照本身不能证明 BandLab 播放器
采用完全相同的数学函数。因此兼容转换应保留原始 curve 证据，精确曲线仍需渲染或听觉比较。

### 7.4 Pitch 与 Tune

对命中 Zone 的 MIDI pitch，和当前字段最一致的公式为：

```text
pitchDistanceCent = (targetMidiPitch - rootMidiPitch) * 100 + tuneCent
playbackRate = 2 ** (pitchDistanceCent / 1200)
```

`tune` 缺失时的候选值为 `0`。正值提高 Sample 音高，负值降低。精确键 selector 通常使目标
pitch 与 root 相等，但 Taiko 等音源仍使用非零 tune，因此 exact key 不能跳过 tune。

### 7.5 Start offset

只有 Solo Female Ahh 的 12 个 Zone 含 `offset`，范围为 `1497...7325`。这些值与 SFZ 一样是
source sample frame，不是秒；在 44.1 kHz 输入中首 Zone `7325` 对应约 `0.1661` 秒。

兼容转换需要用编码源自己的 sample rate 把 frame 转换为时间，并验证 offset 未超出 Sample。
不能使用之后可能已经重采样的输出 sample rate 反推源位置。

### 7.6 Mutex / choke

唯一非空 `mutexSets=[[42, 46]]` 表示对称 MIDI choke group：触发 closed 或 open hi-hat 时，
另一键已有声音应结束。数据能证明互斥意图，但不能证明原播放器使用的 fade 时长或精确曲线。

### 7.7 Sample 自然结束与 Note 长度

根据字段组合，可区分这些候选行为：

- gated、无 loop：播放到 Note Off 后执行 release，或更早到达 Sample 自然末尾；没有证据支持
  自动拉伸或补造 loop；
- gated、有 loop：loop 维持持续音，当前尾部证据支持 Note Off 后在 loop 中完成 release；
- one-shot：普通 Note Off 不提前结束，Sample 播放至自然末尾；
- mutex / choke：可以提前结束同组声音，但具体淡出仍未从数据中确定。

### 7.8 Velocity、Gain 与 Pan

控制文件没有 velocity layer、velocity curve、sample gain 或 pan 字段，也没有同一 MIDI root 的
重复 Zone。任何 velocity-to-gain、pan、polyphony 或 voice-stealing 策略都不能从这套 Mapping
中推导出来。

## 8. Archive 观察

当前 WAV / M4A Archive 都把 Mapping JSON 与 Sample 放在同一个 ZIP 中。外部 Mapping 与 Archive
内 JSON 语义相等，音频条目也能与 `fileName` 一一对应，因此 Archive 本身足以恢复单个
Soundbank 的控制数据与 Sample 集合。

WAV 与 M4A 必须分别验证。尤其 `offset` 以 source frame 表达，而有损编码可能包含 priming /
trim；在未证明 M4A 解码后 frame 与 loop 对齐前，不能把 WAV 的位置测量无条件套用到 M4A。

ZIP entry 安全、大小预算、checksum、取消和产品 Bundle 形状不属于本逆向分析。当前开发期
资源边界与生成结果见
[Studio Grand 本地验证资产记录](./studio-grand-local-validation-assets.md)。

## 9. 仍未解决的逆向问题

- `attackCurve` 负值的精确数学曲线，以及顶层 `release` 没有 curve 时原播放器使用的形状；
- `category=kit` 默认 one-shot 是否与原播放器逐样本一致；
- 显式 one-shot 上保留的 release envelope 是否用于 choke 或其他强制结束；
- 有效 loop 是否确实在 Note Off 后保持到 release 完成，以及 click / phase 边界；
- 非零 `crossfade` 若在其他数据中出现时的单位、窗口与实现；
- M4A 解码后的 priming、duration、offset 和 loop 对齐；
- velocity、最大 polyphony、voice stealing、Sustain Pedal、release sample、多力度层、
  round-robin、共鸣和物理建模；当前 Mapping 没有足够字段回答这些问题。

## 10. 代表性源数据

以下输入覆盖了当前快照中最重要的不同形状：

| Soundbank         | 代表性证据                                       |
| ----------------- | ------------------------------------------------ |
| Studio Grand      | range selector、无 loop、Soundbank-level release |
| Accordion         | 有效 loop 及很短的 post-loop tail                |
| Felt Piano        | `0/0` loop、tune 与 envelope override            |
| Tabla / Taiko     | 同一 Soundbank 中显式 one-shot 与 gated Zone     |
| James Alister Kit | `category=kit` 默认 one-shot 与非空 `mutexSets`  |
| Solo Female Ahh   | source-frame offset 与有效 loop                  |
| 12 String Guitar  | 原始 Zone 顺序不可作为 selector 优先级           |

## 11. 字段语义参考

以下公开资料只用于解释疑似由 SFZ authoring pipeline 继承的字段。当前 Mapping 与实际音频测量
仍是本快照的直接证据：

- [SFZ tune：cents](https://sfzformat.com/opcodes/tune/)
- [SFZ offset：sample units](https://sfzformat.com/opcodes/offset_ccN/)
- [SFZ loop mode 与 one-shot](https://sfzformat.com/opcodes/loopmode/)
- [SFZ amplitude release：seconds](https://sfzformat.com/opcodes/ampeg_release_onccN/)
- [SFZ attack shape](https://sfzformat.com/opcodes/ampeg_attack_shape/)
- [SFZ release shape](https://sfzformat.com/opcodes/ampeg_release_shape/)
