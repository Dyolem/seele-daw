# Expression Quality Integration V1 阶段计划

> Status: EQ0 audit and EQ1 pedal-aware Voice Stealing committed (`f47bf38`); EQ2 Chromium PCM gate implemented in the working tree, pending review
>
> Date: 2026-09-02
>
> Prerequisites: Audio Quality Foundation V1A (`9b4c0c9`) and binary CC64 playback (`3ff2853`)

Expression Quality Integration V1 是 CC64 基础播放完成后、WAV Offline Export 开始前的音质门禁。
它不重新打开已经冻结的 V1A Velocity、增益、Envelope、Loop 或复音预算，而是验证踏板保持进入
同一 Sample Voice Runtime 后的组合行为，并只在真实问题需要时形成新的可听政策。

本文沿用 [Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。
CC64 的 Project、导入和 Playback 时间语义见
[MIDI Sustain Pedal CC64 Playback V1](../../playback/docs/midi-sustain-pedal-cc64-playback-v1.md)。

## 1. 产品边界

本阶段必须保持：

- Project Note 的按键释放与 CC64 派生的最终发声释放仍是两个不同事实；
- Playback 负责浏览器无关的 Controller Chase 和最终释放时间，Audio Web 不读取 Project CC64；
- 实时 Runtime 与未来 WAV Backend 必须执行相同的 Voice、Envelope、复音和收尾政策；
- 自动门禁只能证明数值与生命周期约束，人工听测未运行时必须继续记录为 `not-run`。

本阶段不加入 half-pedal、制音器共鸣、踏板噪声、松键采样、Velocity Layer、隐藏 limiter 或物理
钢琴模型。当前 Studio Grand 没有 Sample Loop；其他受支持 Manifest 若声明 continuous / sustain
loop 或 one-shot，仍执行各自公开语义。

## 2. EQ0 只读审计结论

CC64 已把 `keyReleasePlaybackClockSecond` 和 `releasePlaybackClockSecond` 一起交给生产 Runtime。
Pedal Up、Clip 终点、Controller Chase、同 Tick 顺序与播放中选择性重协调已有代码级回归。

审计发现一个真实音质缺口：AQ3 的 Voice Stealing 只区分“已经进入最终 release”和“尚未进入
release”。踏板保持声部虽然已经松键，却会与仍由演奏者按住的声部进入同一候选等级，再按有效
增益排序。因此，一个很轻但仍按键的 Voice 可能先于更响的 pedal-held Voice 被偷音。

## 3. EQ1：Pedal-aware Voice Stealing

EQ1 冻结以下候选顺序，序号越小越先退场：

| 生命周期等级      | 优先级 | 含义                                                                      |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| `release-started` | `0`    | 已经进入正常或强制释放；优先释放其剩余尾音。                              |
| `key-released`    | `1`    | 按键已经松开但尚未进入最终释放；对 gated Voice 而言通常是 CC64 踏板保持。 |
| `key-held`        | `2`    | 演奏者仍按住按键；最后才进入偷音候选。                                    |

生命周期等级之后才继续使用 AQ3 已冻结的有效增益、起音时间和稳定 Voice Token。相同 pitch 的
不同 occurrence 继续独立 attack，不做全局 choke；64 / 128 发声槽和 16 个退场尾音预算不变。
One-shot 仍忽略普通最终 Gate Release，但在按键已经松开后可以先于 key-held Voice 退场，不改变
其正常自然播放语义。

EQ1 的可听政策扩展标识为：

```text
seele.audio-quality-expression-v1-eq1
```

它显式引用基础政策 `seele.audio-quality-foundation-v1a-aq3`，不覆盖或伪造 V1A 历史报告。未来
WAV 报告必须记录实际执行的基础政策和表达力政策。

### 3.1 用户预期听觉

- 普通演奏没有达到 64 / 128 发声槽上限时，EQ1 不改变声音、音量、踏板时长或 Note 起音；
- 密集踏板演奏触发偷音时，用户仍在按住的音应比已经松键、只由踏板保持的尾音更连续；
- 被选择的踏板保持音使用既有 6 ms 快速淡出，因此预期是较短的尾音退场，而不是立即硬切；
- 极端复音仍可能听见尾音缩短或新音因 16 个退场尾音预算已满而未被接纳，EQ1 只让选择顺序更
  符合演奏意图，不承诺无限复音或完全听不见偷音；
- EQ1 不增加新的钢琴音色、共鸣、半踏板层次、踏板噪声或松键采样，因此这些听感不应发生变化。

自动测试只能证明上述选择顺序、淡出时间和资源预算。是否存在主观可闻的截断、click 或 pumping
仍必须由后续 PCM 门禁和人工听测分别记录，不能由策略测试代替。

## 4. EQ2：Pedal PCM 与 Headroom 门禁

EQ2 扩展既有 developer-only `OfflineAudioContext` 综合报告，不建立第二套参考渲染器，也不读取
Project 或本地 Soundbank。报告直接把合成 PCM 和 Voice Plan 交给生产
`SampleInstrumentVoiceRuntime`，同时记录基础政策
`seele.audio-quality-foundation-v1a-aq3` 与表达力政策
`seele.audio-quality-expression-v1-eq1`。综合报告 schema version 从 `4` 升为 `5`；这只是报告字段
形状升级，不是 Project File 或渲染政策升级。

固定输入与门禁如下：

| 场景                        | 固定输入                                                                                            | 自动门禁                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Key Release / Pedal Up 分离 | no-loop、continuous loop、sustain loop、one-shot 各一个满力度 Voice；`0.15 s` 松键，`0.30 s` 抬踏板 | 松键附近不得提前进入最终 release；三个 gated Voice 在 Pedal Up 后须匹配 Manifest 的 `80 ms` release；one-shot 继续自然播放 |
| 踏板保持压力                | 32 个同相、同频、满力度 no-loop Voice                                                               | 松键前后 RMS 比在 `0.99...1.01`；峰值不高于 `-3 dBFS`；无满刻度帧                                                          |
| 踏板下同音重触发            | 第一 Voice 已松键但由踏板保持时，启动第二个相同 pitch occurrence                                    | 同时保留两个独立发声槽、无 steal，合成相干电平比在 `1.99...2.01`                                                           |
| 收尾与清理                  | 所有上述输入渲染至 release、自然结束与尾部窗口之后                                                  | 包络最大绝对误差不高于 `1e-4` full scale；尾部低于 `-90 dBFS` 或数字静音；渲染后及 dispose 后资源统计归零                  |

32 Voice 是低于 64 个单乐器发声槽的确定性表达力压力输入，用于证明踏板保持本身不触发偷音或
额外衰减。它不是最大复音保证，也不替代 AQ3 已有的 64 / 128 / 16 溢出门禁。

### 4.1 用户预期听觉

- 踏板按下时松开琴键，gated Voice 不应在 Note Off 处突然变小或进入尾音；它应继续执行该 Zone
  已声明的 loop / no-loop 语义，直到真正 Pedal Up 或素材自然耗尽；
- Pedal Up 后，gated Voice 应沿 Manifest 已声明的 release 平滑退场，不应由“按键释放 / 最终释放”
  生命周期切换额外制造 click；素材本身、零 Attack 或不连续 loop point 已有的瞬态不在此保证内；
- 踏板保持旧音时再次弹同音，应听到一个新的起音叠加在旧尾音上，而不是旧音被同 pitch 全局
  choke。合成 fixture 中短时电平恰好翻倍只证明两个 occurrence 独立，不承诺真实素材一定翻倍，
  也不表示已经支持 round-robin 或不同力度层音色；
- 32 Voice 踏板保持输入在 Key Release 前后应保持同一持续电平，并保留至少 3 dB 峰值余量；
  Runtime 没有隐藏 limiter，真实项目的更高 Track / Master Gain 或更极端相干叠加仍可能削波；
- one-shot 继续忽略普通最终 Gate Release 并自然结束；continuous loop 在 release 期间继续循环；
  sustain loop 在最终 Gate Release 离开循环；no-loop 素材可能在 Pedal Up 前自然耗尽。用户听到的
  区别应来自 Manifest，而不是 CC64 偷换 Trigger 或 Loop 语义。

上述预期不包含制音器共鸣、琴弦耦合、半踏板层次、踏板噪声、松键采样、Velocity Layer 或新的
Studio Grand 音色。EQ2 客观 PCM 门禁可以发现提前衰减、硬切、削波、错误叠加和卡死资源，但不能
替代真实音源与扬声器上的主观听测。

### 4.2 Chromium 证据

2026-09-02 在 Chromium `151.0.0.0`、48 kHz、macOS 浏览器环境运行 schema version `5`
综合报告，全部 EQ2 检查通过：

- 四种 Trigger / Loop 场景的 Key Release 最大绝对误差均约 `6.42e-10`；三个 gated 场景的
  Pedal Up release 最大绝对误差均约 `1.49e-9`；
- 32 Voice 压力峰值约 `-9.86 dBFS`，满刻度帧为 `0`，松键前后 RMS 比约 `1.0000`；
- 同音重触发保留 `2` 个发声槽、steal 为 `0`，重叠 / 单 Voice RMS 比为 `2.0`；
- 全部场景尾部为数字静音，渲染后与 dispose 后的 Voice、Node、source、listener 统计均归零。

这次运行是自动 Chromium PCM 门禁，不是 developer-local Studio Grand 人工听测；后者继续记录为
`not-run`。

## 5. 后续批次

### EQ3：Transport、重协调与确定性收尾

- 汇总 Locate/Seek Controller Chase、Stop、Pause、Generation、设备替换和 CC64 编辑重协调；
- 验证失败不会留下卡死 Voice，也不会回滚合法 Project Commit；
- 冻结“结束时踏板仍按下”的实时/离线共同收尾政策；
- 记录自动门禁、Chromium PCM、developer-local listening matrix 和明确未运行项。

EQ3 收口并通过审核后，WAV Offline Export 才能依赖这组实时语义。

## 6. 当前验收状态

EQ1 已提交证据：

- Expression Policy、Polyphony Selector 与生产 Voice Runtime 的 3 个目标测试文件 / 40 项测试通过；
- Audio Web Type Check 与 19 个测试文件 / 134 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- EQ1 已审核并提交为 `f47bf38`。

EQ2 当前工作树证据：

- 合成 fixture 的 3 项结构性测试通过；
- Audio Web 源码、工具配置与 Studio 开发入口 Type Check 通过；
- Audio Web 20 个测试文件 / 137 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- Studio Production Build 与 soundbank dist boundary 通过；
- Chromium 151 / 48 kHz / schema version 5 综合报告的全部 EQ2 检查通过；
- developer-local Studio Grand 最大复音、Pedal Up 与同音重触发人工听测仍为 `not-run`。
