# Expression Quality Integration V1 阶段计划

> Status: EQ0 audit and EQ1 pedal-aware Voice Stealing implemented in the working tree; pending review
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

## 4. 后续批次

### EQ2：Pedal PCM 与 Headroom 门禁

- 合成 pedal-held 密集和弦、踏板下同音重触发与 Pedal Up 场景；
- 测量 peak、满刻度帧、Pedal Up 附近 click、release tail 与最终资源归零；
- 同时覆盖 no-loop、continuous loop、sustain loop 与 one-shot，不用 Sustain Loop 冒充 CC64；
- 浏览器报告直接运行生产 `SampleInstrumentVoiceRuntime`，不建立第二套参考渲染器。

### EQ3：Transport、重协调与确定性收尾

- 汇总 Locate/Seek Controller Chase、Stop、Pause、Generation、设备替换和 CC64 编辑重协调；
- 验证失败不会留下卡死 Voice，也不会回滚合法 Project Commit；
- 冻结“结束时踏板仍按下”的实时/离线共同收尾政策；
- 记录自动门禁、Chromium PCM、developer-local listening matrix 和明确未运行项。

EQ3 收口并通过审核后，WAV Offline Export 才能依赖这组实时语义。

## 5. 本批验收

- 纯策略测试证明生命周期等级先于增益、年龄与稳定 Token；
- 生产 Runtime 压满单乐器 64 个发声槽时，必须先偷取更响的 pedal-held Voice，而不是更轻的
  key-held Voice；
- steal 继续使用 6 ms fast release，退场尾音与溢出统计保持原预算；
- Audio Web Type Check、全包测试、根级 lint 与相关架构边界通过；
- EQ2 浏览器 PCM 与人工听测尚未运行时，不得记录为通过。

当前工作树证据：

- Expression Policy、Polyphony Selector 与生产 Voice Runtime 的 3 个目标测试文件 / 40 项测试通过；
- Audio Web Type Check 与 19 个测试文件 / 134 项全包测试通过；
- 根级 `pnpm lint` 通过 Architecture、Workspace Quality、Format、Oxlint 与 ESLint；
- EQ2 Chromium PCM、developer-local Studio Grand 最大复音听测与 Pedal Up 听测均为 `not-run`。
