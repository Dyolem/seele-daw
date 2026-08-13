# Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1

> Status: Batch 4A.1b reviewed and committed as `07f4218`
>
> Last updated: 2026-08-12

本文定义 Seele 内置 Sample Instrument 首个浏览器无关语义契约。它由两个彼此分离的层次组成：

1. **Seele Supported SFZ Profile V1**：面向可交换音源和未来 SFZ Importer 的公开 authoring
   子集；
2. **Sample Instrument Manifest V1**：Importer 规范化后交给 Seele Sample Runtime 的唯一数据
   形状。

Batch 4A.1a 已实现并通过审阅：Profile 常量、Manifest 类型、严格 validator 和默认内置
`MIDISampleSynth` Mapping Adapter 已提交。Batch 4A.1b 的独立受限 ZIP / WAV 边界与本地规范化
工具也已通过审阅并提交；Batch 4B.1 资源准备以及 Batch 4B.2 的生产 AudioContext 与 Voice 执行
均已通过审阅。尚未实现 SFZ 文本 parser；Studio Timeline 首次可听闭环已在 Batch 5A 实现并
等待审阅。

默认内置数据的字段统计与行为推断不是本规范的一部分，另见
[默认内置 MIDISampleSynth 控制文件逆向分析](./default-built-in-midi-sample-synth-reverse-analysis.md)。

## 1. 架构决定

Seele 不把任一厂商私有 Mapping 作为永久播放协议，也不要求不同来源在运行时共享各自的文件
格式。互操作发生在 Importer 边界：

```text
Supported SFZ Profile ----> SFZ Importer -----------------+
Built-in Mapping ---------> Built-in Compatibility Adapter +--> Manifest V1 --> Sample Runtime
SoundFont / DLS ----------> future importers -------------+
```

各层职责为：

- 外部格式描述作者输入；其语法、继承、默认值和来源特有兼容逻辑由对应 Importer 处理；
- Manifest V1 用显式 tagged union 和带单位字段保存已经解析完成的播放含义；
- Sample Runtime 只验证并执行 Manifest，不知道它来自 SFZ、默认内置 Mapping 还是未来格式；
- Project File 继续只保存稳定 `soundbankId`，不保存 Sample 路径、远程 URL 或 Importer 私有数据；
- Archive / Bundle 的 entry、checksum、解压预算和资源解析属于独立资源边界，不塞进发声语义。

SFZ 是开放、文本化且有多个 Player 实现的事实标准，但没有一个跨所有 Player 的完整一致性
认证。Seele 因此公开精确的 **Supported Profile**，不声称兼容完整 SFZ 1、SFZ 2 或 ARIA
extensions；未支持的 opcode 必须给出诊断，不能静默忽略。

## 2. Profile 身份与范围

Profile 的稳定身份是：

```text
id: seele.supported-sfz-profile
version: 1
audio media type: audio/wav
tune range: -100...100 cents
```

V1 只覆盖单一键位维度、一个 Zone 最多命中一次的基础 Sample Instrument。它包含当前真实产品
切片需要的音高选择、移调、起始位置、loop、振幅 attack / release 和 exclusive group，不提前
加入尚无消费者的调制系统。

### 2.1 支持的 header

| Header     | V1 含义                                                    |
| ---------- | ---------------------------------------------------------- |
| `<global>` | 文件级默认值；最多一个，必须位于 `<group>` / `<region>` 前 |
| `<group>`  | 后续 regions 共用的默认值                                  |
| `<region>` | 产生一个最终 Zone                                          |

未来 SFZ Importer 按 `region > group > global` 覆盖顺序解析属性，并在输出 Manifest 前消除全部
继承。Manifest 不保存 header 或继承关系。

### 2.2 支持的 opcode

| 领域              | Opcode                                 |
| ----------------- | -------------------------------------- |
| Sample resource   | `sample`                               |
| Key selector      | `key`, `lokey`, `hikey`                |
| Root / pitch      | `pitch_keycenter`, `tune`              |
| Start position    | `offset`                               |
| Loop / trigger    | `loop_mode`, `loop_start`, `loop_end`  |
| Amplitude attack  | `ampeg_attack`, `ampeg_attack_shape`   |
| Amplitude release | `ampeg_release`, `ampeg_release_shape` |
| Exclusive group   | `group`, `off_by`, `off_mode`          |

`<group>` 是 SFZ header；表中的 `group` 是 exclusive-group 数字 opcode。二者名称相同但语义
不同。

Profile V1 接受的 `loop_mode` 值只有：

| SFZ 值            | Manifest 结果                               |
| ----------------- | ------------------------------------------- |
| `no_loop`         | `triggerMode=gated`, `loop.kind=none`       |
| `one_shot`        | `triggerMode=one-shot`, `loop.kind=none`    |
| `loop_continuous` | `triggerMode=gated`, `loop.kind=continuous` |
| `loop_sustain`    | `triggerMode=gated`, `loop.kind=sustain`    |

### 2.3 解析规则

未来 SFZ Importer 必须遵守以下 Profile V1 规则：

- 每个 resolved region 必须解析到一枚 WAV `sample`；不接受远程 URL、绝对路径或非 WAV 媒体；
- selector 必须是一个 `key`，或完整的 `lokey` / `hikey` 闭区间；半缺失、反向范围和超出
  MIDI `0...127` 的值失败；
- `key` 同时提供 exact selector；若没有显式 `pitch_keycenter`，也提供 root pitch；
- range selector 必须解析到 `pitch_keycenter`，root 必须是 MIDI `0...127`；
- `tune` 缺失时为 `0`，只接受 finite `-100...100` cents；
- `offset` 缺失时为 `0` source sample frame；Importer 使用源 WAV sample rate 转换为
  `startOffsetSecond`；
- `loop_mode` 缺失时为 `no_loop`；`loop_continuous` 与 `loop_sustain` 必须同时解析到有效的
  `loop_start < loop_end` source frame，其他模式不得携带 loop point；
- `ampeg_attack` 缺失时为 `0` 秒；shape 缺失在 Manifest 中保持 `null`，不能伪装成源文件
  显式写入 `0`；
- gated region 的 `ampeg_release` 缺失时解析为 `0` 秒；one-shot 可以没有 release；
- `ampeg_*_shape` 只有在对应时长语义存在时才合法，所有时间必须 finite 且非负；
- exclusive group 要么完全缺失，要么解析出正整数 `group` 与 `off_by`；`off_mode` 只接受
  `fast` 或 `normal`，缺失时为 `fast`；`off_by` 必须指向 Manifest 中存在的 group；
- resolved regions 不得在 MIDI pitch 上重叠，因为 V1 没有 velocity / layer 条件来消除歧义；
- 任一未知 header、opcode、枚举值、非法组合或重复歧义都必须失败并报告位置。

这些是 Seele Profile 的明确约束。它们不改变 SFZ 生态中其他 Player 的支持范围，也不用于反推
任一来源私有字段的默认值。

## 3. Sample Instrument Manifest V1

Manifest 是已经完成继承、默认值处理、单位转换和来源兼容推断的不可变结果。稳定身份为：

```text
schema: seele.sample-instrument-manifest
schemaVersion: 1
```

### 3.1 顶层字段

| 字段            | 类型                 | 含义                                     |
| --------------- | -------------------- | ---------------------------------------- |
| `schema`        | 固定 string          | Manifest 家族身份                        |
| `schemaVersion` | 固定 integer `1`     | 当前 schema 版本                         |
| `soundbankId`   | stable nonblank ID   | Project / Playback 使用的产品身份        |
| `displayName`   | nonblank string      | 经 Importer 选择的显示名称               |
| `zones`         | non-empty Zone array | 已规范化并按 canonical order 排序的 Zone |

### 3.2 Zone 字段

```text
zoneId: string
selector:
  { kind: exact-midi, pitch }
  | { kind: midi-range, minimumPitch, maximumPitch }
rootMidiPitch: MIDI 0...127
tuneCent: finite -100...100
triggerMode: gated | one-shot
startOffsetSecond: finite non-negative second
loop:
  { kind: none }
  | { kind: continuous | sustain, startSecond, endSecond }
amplitudeEnvelope:
  attack: { durationSecond, curve: number | null }
  release: { durationSecond, curve: number | null } | null
exclusiveGroup:
  { groupId, offByGroupId, offMode: fast | normal } | null
resource:
  { key: safe-relative-posix-path, mediaType: audio/wav }
```

Manifest 使用秒，而 SFZ `offset` / `loop_start` / `loop_end` 使用 source sample frame。单位转换是
Importer 的责任；Runtime 不接收模糊的裸数值，也不重新读取源格式默认值。

Batch 4B.2 为 envelope shape 固定了一项 Seele Runtime 执行定义：`curve: null` 与 `0` 使用
linear amplitude；非零 curve 使用归一化指数进度
`expm1(shape * t) / expm1(shape)`，其中 `t` 为 `0...1`，shape 在执行时钳制到 `[-10, 10]`。
Runtime 用分段原生 linear ramps 逼近该曲线，使未来 cancel / choke 能替换尚未发生的 automation。
这不是对任一来源私有播放器数学实现的声明；未来 SFZ Importer 只负责保留 Profile 中的 shape
输入，Manifest Runtime 负责上述稳定执行含义。

### 3.3 Validator 不变量

`parseSampleInstrumentManifestV1(input)` 在不可信数据进入未来 Sample Runtime 前执行严格解码：

- 只接受 plain data object、精确字段集合和 schema version 1；accessor、symbol property、未知
  字段与缺失字段失败；
- 返回复制并冻结的 Manifest，不保留调用方可变 Record 或 Array；
- `displayName`、`zoneId`、`soundbankId` 必须非空，Zone ID 在 Manifest 内唯一；
- Zone 必须按 selector 起点、终点、root 与 Zone ID 使用稳定 code-point order 排序；
- 由于 V1 没有 velocity / layer 条件，任意两个 selector 覆盖同一 MIDI pitch 都失败；
- gated Zone 必须有 release segment；one-shot Zone 在 V1 不允许 loop；
- loop、envelope 和 offset 的时间必须 finite、非负，loop start 必须早于 end；
- exclusive-group ID 必须为正整数，`offByGroupId` 必须引用存在的 group；
- resource key 最长 1,024 字符，只接受安全相对 POSIX path；绝对路径、反斜杠、NUL、空段、
  `.` / `..`、编码后的 traversal、编码后的 slash 与非法 percent encoding 都失败；
- 资源媒体类型当前只接受 `audio/wav`。

稳定错误包含 code、data path 与 detail，使 Importer、测试和未来 Studio UI 不需要解析错误文案。
Archive entry 的 byte size、checksum 与解压比例不在 Manifest V1；它们由独立资源边界验证。

## 4. 默认内置 Mapping Compatibility Adapter

`adaptBuiltInMidiSampleSynthMapping(input, options)` 是当前默认内置 Mapping 到 Manifest V1 的
边界。它
严格识别已审计的 JSON 形状，隔离以下来源特有规则：

- 只接受 `synth=MIDISampleSynth`、已知顶层 / Zone 字段及 `category=instrument|kit`；
- `minRange/maxRange=null` 转成 exact MIDI selector，numeric pair 转成 exact 或 range；
- `oneshot=true` 或 `category=kit` 转成 one-shot；后者只是当前默认内置数据的推断；
- `loopStart/loopEnd=null/null` 或 `0/0` 转成无 loop；有效点依据当前尾部证据转成
  `continuous`，不是 Seele 或 SFZ 默认；
- `releaseTime/releaseCurve` 优先于 bank-level `release`；缺失 attack 转成零时长、null curve；
- `tune` 缺失转成零；source-frame `offset` 要求资源 resolver 提供源 sample rate 后转成秒；
- `mutexSets` 转成对称 `group/off_by`，当前兼容模式为 `fast`；
- WAV / M4A URL 只用于校验源 basename，远程 URL 不进入 Manifest；资源 resolver 注入安全相对
  WAV key；
- 当前 4,664 个 Zone 的 `crossfade` 都为零；遇到非零值失败，不猜测单位或曲线；
- 最终结果必须再次通过同一个 Manifest validator，Adapter 不能绕过规范契约。

当前 Adapter 与 validator 已通过仓库内 17 项合成测试；另用 developer-local 全量 289 份
Mapping、4,664 个 Zone 做过一次性兼容审计，全部可规范化。全量源数据仍受本地、不可分发资产
边界约束，没有进入仓库 fixture。

## 5. Archive 与本地规范化边界

Batch 4A.1b 不改变本文的发声语义，而是在 Manifest 外建立资源容器边界：

- 受限 ZIP Adapter 只解压调用方预先声明的精确 entry 集合，并限制路径、压缩方法、entry 数量、
  单文件 / 总解压大小和压缩比；支持 `AbortSignal`，返回稳定错误分类；
- 安全相对 resource key 规则由 Manifest validator 与 ZIP entry 共用，避免两套路径判断漂移；
- 严格 WAV metadata parser 只接受当前工具支持的 RIFF WAVE PCM / IEEE float 子集，并核对 format、
  block alignment、data frame 与时长；
- Studio Grand 开发工具交叉验证 Catalog / Indexes / Mapping、固定输入 SHA-256 与 Archive 内外
  Mapping，生成 Manifest、30 个 WAV 和逐文件校验报告；
- 生成目录被 Git 忽略并由 Vite production guard 排除，不能据此推导当前采样具有再分发范围。

通用 ZIP Adapter 不把来源、可信摘要或媒体规则硬编码进容器实现；这些由调用方提供和验证。
Manifest 只保存 Runtime 所需的稳定资源 key，不保存 ZIP entry、Catalog、远程 URL 或文件系统
路径。详细预算与真实输出见
[Studio Grand 本地验证资产记录](./studio-grand-local-validation-assets.md)。

## 6. 明确延期

本批次不实现：

- SFZ 文本 tokenizer / parser、include、macro、SFZ 2 或 ARIA extensions；
- velocity layer、round-robin、random、sequence、release trigger、key switch、controller 或复杂
  modulation；
- SoundFont、DLS、DecentSampler 或其他格式 Importer；
- 面向任意后端 Bundle 的可信 manifest / checksum 协议、任意 Archive 扫描与自动安装；
- M4A 自动协商；
- Studio Scheduler Executor、Transport UI、浏览器自动音频渲染 smoke 与真实 Timeline 发声闭环。

下一独立批次先基于本地规范化结果测量读取、解码内存与听觉边界，再确认浏览器 Sample Loader
与 Runtime 策略。SFZ 文本 Importer 仍可单独实现，并以本文 Profile 与相同 Manifest contract
tests 作为验收标准。

## 7. 行业背景与参考

行业没有要求所有 DAW 内置采样器共享同一内部播放器实现。开放格式解决交换问题，Importer
把它们转换为产品自己的稳定语义；Plugin API 则解决宿主与第三方声音引擎之间的通信，两者不是
同一层协议。

- [SFZ Format](https://sfzformat.com/)
- [LinuxSampler SFZ support](https://linuxsampler.org/sfz/)
- [sfizz open-source SFZ engine](https://github.com/sfztools/sfizz)
- [MIDI Association DLS](https://midi.org/dls)
- [SoundFont 2 Technical Specification](https://musescore.org/sites/musescore.org/files/2023-01/sfspec24.pdf)
- [VST3 Developer Portal](https://steinbergmedia.github.io/vst3_dev_portal/pages/What+is+the+VST+3+SDK/Index.html)
- [CLAP Audio Plugin API](https://github.com/free-audio/clap)
- [Logic Sampler third-party format import](https://support.apple.com/guide/logicpro/add-soundfont2-dls-and-gigasampler-files-lgsifc8653a8/mac)
- [Ableton supported Sample formats](https://help.ableton.com/hc/en-us/articles/115001134410-Supported-sample-formats)
