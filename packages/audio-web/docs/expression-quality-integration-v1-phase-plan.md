# Expression Quality Integration V1 阶段计划

> Status: EQ0–EQ2 committed (`f47bf38`, `3c29bc9`); EQ3A inactive-tail ownership cleanup implemented and reviewed
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

## 5. EQ3：Transport、重协调与确定性收尾

### 5.1 只读审计矩阵

| 场景                                       | 当前权威路径                                                                                      | 收尾政策                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Clip 终点仍为 Pedal Down                   | Playback Compiler 把 Final Gate Release 限制在非循环 Clip Source Window 终点                      | gated Voice 在 Clip 终点进入 Manifest 正常 release；不改写 Note Duration 或 CC64 Fact                  |
| Pause、Locate Preview、Return              | Transport 推进 generation，Studio 停止 Scheduler 并调用全部 Runtime 的 `allNotesOff`              | 当前 Voice 使用既有 `6 ms` fast release；准备好的资源与可恢复音乐位置保留                              |
| Locate / Seek 后继续                       | Compiler 保留 Controller Chase；Scheduler 只调度目标位置之后实际出现或允许 late-immediate 的 Note | 旧 Voice 已由 Locate 中断收尾；当前仍不做 Note Chase                                                   |
| 播放中 CC64 编辑                           | Reconciliation 只更新受影响 Source occurrence；活动 gated Voice 调用 `rescheduleRelease`          | 未来 Pedal Up 可前后重排；新释放点已在过去时从“现在”启动正常 release；已经开始 release 的 Voice 不复活 |
| Instrument / Track 替换                    | 只 cancel 受影响 Track Voice，准备下一 Runtime；不相关 Track 保持活动                             | 受影响 Voice 使用 fast release；缺失新 Soundbank 显式 warning，不静默替换                              |
| Tempo、修订链断裂、准备失败或 Project 替换 | 完整 Handoff / Reset 调用 `allNotesOff` 并 dispose 不再可信的 Runtime                             | 播放失败进入可见失败状态，但不回滚已经合法提交的 Project Commit                                        |
| Transport 自然结束                         | 保留 Timeline End 位置，不调用全局 `allNotesOff`                                                  | 已排程的正常 release 或 one-shot 自然尾部可以完成，之后只回收应用层 Handle / Runtime 所有权            |

审计确认前六条已有生产路径和回归；真实缺口位于最后一条及 Paused 状态的应用层引用收尾。
`SampleInstrumentVoiceRuntime` 会在 source `ended` 后归零 AudioNode，但 Studio Scheduler 停止后只会
轮询 retired Runtime。当前 prepared Runtime 中仍在 normal / fast release 的 Voice Handle 即使稍后
结束，也可能一直保留到下次 Play、下一次 Commit 或 dispose。

### 5.2 EQ3A：Inactive-tail Ownership Cleanup

EQ3A 把既有 25 ms 低频清理轮询扩展为“非播放态 Voice 清理”：Paused / Stopped 后，只要仍有活动
Voice Handle 或 retired Runtime，就继续检查终态；两者都归零后立即停止 Timer。进入 Playing 时仍
停止这枚清理 Timer，由既有 Scheduler Tick 负责同一收集逻辑。

这不是新的音频 Timer、DSP 或 Pedal 状态机。它不修改 Envelope、不提前 stop source，也不 dispose
仍可复用的 prepared Runtime；它只在 `isActive()` 已经变为 false 后释放 Studio 持有的 Handle、Plan
与 Runtime 引用。单个 Handle 查询失败时继续按既有失败关闭语义视为不可用，不能阻止其他尾音和
Runtime 被回收。

### 5.3 用户预期听觉

- Clip 结束时踏板仍按下，gated Voice 应在 Clip 边界按 Manifest 正常 release，而不是无限保持，
  也不是由 Studio 清理 Timer 硬切；未来 WAV 导出必须为该 release tail 保留渲染尾部；
- Transport 自然结束允许已经排程的 release 或 one-shot 尾部自然完成。EQ3A 只清理结束后的应用层
  引用，因此不应产生新的音量、音色、click 或尾音长度变化；
- Pause、Locate Preview 与 Return 是用户显式中断，当前预期听见既有 6 ms 快速淡出，而不是完整
  Zone release；这能降低硬切 click，但不承诺完全听不见中断；
- 播放中提前 Pedal Up 或把 Pedal Up 移到已经过去的位置，应让受影响 Voice 从现在进入正常 release；
  延后 Pedal Up 应延后尚未开始的 release。已经进入 release 的 Voice 不会被编辑重新复活；
- 替换 Instrument 时，目标 Track 可以短淡出，不相关 Track 不应中断；失败不能让合法编辑从
  Project History 消失。

这些政策仍不增加 half-pedal、repedaling 声学模型、共鸣、pedal noise、release sample、Note
Chase 或 Looped Clip Controller 展开。清理测试证明所有权终结，不等于主观听测已经通过。

### 5.4 后续收口

EQ3 后续批次仍需：

- 汇总 Audio Runtime 的 fast release PCM 与 Studio Transport / Reconciliation 回归为最终门禁；
- 冻结实时与未来 WAV Backend 对 Arrangement / Clip 边界及渲染尾部的共同输入输出契约；
- 记录 developer-local Studio Grand 的 Pause、Pedal Up、同音重触发和最大复音听测矩阵，未运行项
  继续写为 `not-run`。

EQ3 收口并通过审核后，WAV Offline Export 才能依赖这组实时语义。

## 6. 当前验收状态

EQ1 已提交证据：

- Expression Policy、Polyphony Selector 与生产 Voice Runtime 的 3 个目标测试文件 / 40 项测试通过；
- Audio Web Type Check 与 19 个测试文件 / 134 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- EQ1 已审核并提交为 `f47bf38`。

EQ2 已提交证据：

- 合成 fixture 的 3 项结构性测试通过；
- Audio Web 源码、工具配置与 Studio 开发入口 Type Check 通过；
- Audio Web 20 个测试文件 / 137 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- Studio Production Build 与 soundbank dist boundary 通过；
- Chromium 151 / 48 kHz / schema version 5 综合报告的全部 EQ2 检查通过；
- developer-local Studio Grand 最大复音、Pedal Up 与同音重触发人工听测仍为 `not-run`；
- EQ2 已审核并提交为 `3c29bc9`。

EQ3A 已审核证据：

- Studio Playback Coordinator 定向 1 个测试文件 / 40 项测试通过；
- Paused fast-release tail 会启动非播放态清理轮询，并在后续 selective handoff 后回收 retired Runtime；
- Transport 自然结束不调用 `allNotesOff`，尾音结束后停止清理 Timer，同时保留 prepared Runtime
  供下一次 Play 复用；
- Studio Type Check 与 61 个测试文件 / 397 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- Studio Production Build 与 soundbank dist boundary 通过；
- EQ3A 不改变 PCM 或 AudioNode 调度，因此没有把 EQ2 Chromium 报告重复运行冒充新的听测证据。
- EQ3A 已通过审核并随本次提交交付。
