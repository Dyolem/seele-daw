# Audio Quality Foundation V1A：AQ0 基线与质量契约

> Status: AQ0 reviewed and committed (`40c44a1`); AQ1 evidence added from current working tree for review
>
> Date: 2026-08-26

本文冻结 AQ0 的输入、历史行为基线、测量方法和后续验收规则，并追加使用同一输入取得的 AQ1
证据。术语解释见
[V1A 术语表](./audio-quality-foundation-v1a-glossary.md)，完整阶段边界见
[V1A 阶段计划](./audio-quality-foundation-v1a-phase-plan.md)。

## 1. AQ0 的完成定义

AQ0 只建立质量测量基础，不修改 Voice Runtime、AudioContext master graph、Manifest、Playback
Plan 或 Project Fact。完成时必须具备：

1. `__tests__/support` 中可重复生成的自有 PCM fixture；
2. 固定的 Velocity、Note length、chord、retrigger、loop、one-shot 和 mutex Voice Plan 矩阵；
3. Node 测试中的 fixture 完整性与当前 Runtime 特征基线；
4. 真实浏览器 `OfflineAudioContext` 直接运行生产 `SampleInstrumentVoiceRuntime` 的开发入口；
5. 可复制的结构化浏览器报告；
6. hard、calibrated、listening 三类 Gate 和“未运行”状态；
7. 不依赖可分发权存疑的音频资产。

Node 测试的 Fake Web Audio 只能证明 schedule、automation、node 和 cleanup 控制语义，不能声称
测得真实 PCM。浏览器报告必须直接复用生产 Voice Runtime，禁止用独立参考渲染器替代它。

## 2. AQ0 历史行为特征基线

AQ0 在 2026-08-26 记录以下当时现状；它们是 AQ1–AQ3 的对照，不是永久产品承诺：

| 领域           | AQ0 当时行为                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Velocity       | Voice base gain 为 `(velocity / 127) * trackGain`，即线性振幅。                                          |
| Master         | Project `masterGain` 原值写入唯一 master GainNode；系统没有 calibration trim。                           |
| 增益范围       | Track/Master 均接受 `0...4`；没有 limiter、compressor 或 true-peak meter。                               |
| Retrigger      | Voice Token 使用 `(engineGeneration, occurrenceKey)`；相同 pitch 的不同 occurrence 独立。                |
| Polyphony      | 没有 per-runtime 或 project-wide Voice cap，也没有 steal policy。                                        |
| Fast release   | cancel、all-notes-off、generation 和 fast mutex 使用约 6 ms 线性 release，并在其后保留 1 ms stop guard。 |
| Normal release | gated Voice 使用 Zone release；one-shot 忽略普通 Note Off，但仍能 cancel/choke。                         |
| Loop           | continuous loop 贯穿 release；sustain loop 在 Note Off 转为未循环尾部。                                  |
| Cleanup        | 现有测试覆盖 natural end、cancel、all-notes-off、failure 与 dispose 后的 Voice/node/listener 回收。      |

AQ1 已有意改变前两项，相关特征测试已同步更新；本表继续保留为历史对照，不能改写成当前行为。

### 2.1 AQ1 当前工作树行为

| 领域     | AQ1 政策                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Velocity | Voice base gain 为 `floor + (1 - floor) * (velocity / 127) ^ 2`，其中 `floor = 10 ^ (-36 / 20)`，再乘 Track Gain。 |
| Master   | Project `masterGain` 原值写入 Project master GainNode；独立下游节点再应用固定 `-12 dB` 输出校准。                  |
| 项目事实 | MIDI Velocity、Track Gain、Master Gain、Project File 与 Playback Voice Plan 数值均不迁移、不重写。                 |
| 动态处理 | 没有隐藏 compressor、soft clipper、limiter 或 true-peak meter。                                                    |
| 其余领域 | Retrigger、Polyphony、Envelope、Loop、Fast release 与 Voice cleanup 仍保持 AQ0 所记录行为，等待 AQ2/AQ3。          |

## 3. 可提交合成 PCM fixture

所有 fixture 使用 `48,000 Hz` Float32 PCM，由测试代码确定性生成：

| Fixture            | 用途                              | 固定性质                              |
| ------------------ | --------------------------------- | ------------------------------------- |
| reference sine     | peak、RMS、Velocity 相对电平      | 整数周期、振幅 0.5、DC 约为 0         |
| impulse            | peak、极短 transient 与窗口边界   | 单个 full-scale frame，其余为数字静音 |
| seamless loop      | 检查 Runtime 不额外制造 loop seam | 首尾采样相同，内部为完整周期          |
| discontinuous loop | 证明 seam 指标能发现素材问题      | 首尾存在已知的大电平差                |
| opposed stereo     | 检查声道不会被错误折叠            | 右声道为左声道反相                    |

fixture 只放在测试支持目录，不进入生产 package API。

## 4. 固定 Voice Plan 场景

| 场景         | 固定向量                                               |
| ------------ | ------------------------------------------------------ |
| Velocity     | `1, 32, 64, 96, 127`                                   |
| Note length  | `0.08 s, 0.25 s, 1 s, 4 s`                             |
| triad        | `60, 64, 67`                                           |
| dense chord  | 10 个固定 pitch                                        |
| retrigger    | C4 五次，每次间隔 40 ms，occurrenceKey 独立            |
| loop/trigger | none、continuous、sustain、one-shot 与一对 mutex Voice |

Voice Plan 只描述 Playback 已有 DTO；loop/trigger 种类仍由测试 Manifest Zone 决定，不向 Playback
下沉 Sample Runtime 语义。

## 5. 测量窗口与结构化报告

开发入口：

```text
http://127.0.0.1:5173/audio-quality-aq0.html
```

运行方式：

```sh
pnpm --filter @seele-daw/studio dev
```

页面不读取 Studio Grand 或 Project，只创建合成 sine AudioBuffer，通过真实
`SampleInstrumentVoiceRuntime` 在 `OfflineAudioContext` 中渲染固定 Velocity 向量、参考三和弦与
10 Voice 相干压力输入。报告包含：

- schema/version、浏览器 user agent、sample rate 与 fixture 参数；
- 每个 Velocity 的 per-channel peak、RMS、DC offset；
- steady window 的 combined peak/RMS 与相对 `v127` dB；
- release 完成后的 tail peak；
- 每个输入的满刻度帧数量；
- render 完成和显式 dispose 后的 Runtime 资源统计；
- 当前完整 render policy 参数与代码级标识 `seele.audio-quality-foundation-v1a-aq1`。

原生 `OfflineAudioContext` 在 `startRendering()` 前报告 `suspended`，而生产 Voice Runtime
按实时安全边界只接收 `running` Context。AQ0 因此使用最小适配视图：仅在构建和调度 Voice 的
窗口把 `state` 读取映射为 `running`，所有 `createBufferSource`、Gain、Panner、AudioParam 和最终
PCM 仍委托给同一个原生 `OfflineAudioContext`；渲染开始后立即恢复原生状态读取。该适配只属于
developer-only harness，不修改生产 Runtime，也不是未来 Offline Backend 的最终契约。

该页面是 developer-only Vite entry，不进入默认 Studio production build。报告只供复制审阅，
不自动写入仓库或浏览器存储。

### 5.1 2026-08-26 Chromium AQ0 历史基线

在 Codex 内置 Chromium `151.0.0.0`、macOS user agent、48 kHz 条件下运行上述入口，四项浏览器
检查全部通过：测量值有限、渲染结束后资源归零、显式 dispose 后资源归零、tail 低于 `-90 dBFS`。
本次 tail 为数字静音，因此报告中的 `tailPeakDbfs` 为 `null`。

| Velocity | 当前 base gain | Peak dBFS | RMS dBFS | 相对 v127 RMS |
| -------: | -------------: | --------: | -------: | ------------: |
|        1 |       0.007874 |   -51.107 |  -54.117 |       -42.076 |
|       32 |       0.251969 |   -21.004 |  -24.014 |       -11.973 |
|       64 |       0.503937 |   -14.983 |  -17.994 |        -5.952 |
|       96 |       0.755906 |   -11.462 |  -14.472 |        -2.431 |
|      127 |              1 |    -9.031 |  -12.041 |             0 |

合成源自身 peak 为 `-6.021 dBFS`；center StereoPanner 的等功率声道分配使单声道源在每个输出声道
再降低约 3.01 dB。绝对值用于固定 AQ0 完整图路径，`relative v127 RMS` 则直接证明当时 Velocity
为线性振幅关系。该表只保留为历史对照。

### 5.2 2026-08-26 Chromium AQ1 报告

同一 Chromium `151.0.0.0`、macOS user agent、48 kHz 入口使用 schema version 2 运行当前生产
政策。七项自动检查全部通过：数值有限、无满刻度帧、参考与压力峰值满足阈值、渲染结束与 dispose
后资源归零、tail 低于 `-90 dBFS`。tail 为数字静音，因此 `tailPeakDbfs` 为 `null`。

| Velocity | AQ1 base gain | Peak dBFS | RMS dBFS | 相对 v127 RMS |
| -------: | ------------: | --------: | -------: | ------------: |
|        1 |      0.015910 |   -56.998 |  -60.008 |       -35.967 |
|       32 |      0.078331 |   -43.152 |  -46.163 |       -22.121 |
|       64 |      0.265777 |   -32.541 |  -35.551 |       -11.510 |
|       96 |      0.578186 |   -25.790 |  -28.800 |        -4.759 |
|      127 |             1 |   -21.031 |  -24.041 |             0 |

| 复音输入                         | Voice | Velocity | Peak dBFS | RMS dBFS | 满刻度帧 |
| -------------------------------- | ----: | -------: | --------: | -------: | -------: |
| 参考三和弦 `60, 64, 67`          |     3 |       96 |   -16.321 |  -24.021 |        0 |
| 10 Voice 完全同相、同 pitch 压力 |    10 |      127 |    -1.031 |   -4.041 |        0 |

与 AQ0 相比，Velocity 127 的完整图峰值准确降低约 12 dB；中低 Velocity 还叠加平方响应带来的额外
衰减。10 Voice 压力输入只比 `-1 dBFS` 门槛保留约 `0.031 dB`，因此该结果是固定参数下的校准证据，
不是任意项目或跨浏览器绝不削波的保证。AQ1 的 developer-local soundbank 人工听测仍为 `not-run`。

## 6. Gate 分类

### 6.1 AQ0 hard gate

- fixture 的 sample rate、frame count、peak、RMS、DC、loop wrap delta 与立体声反相关系稳定；
- Voice Plan 矩阵完全冻结、occurrenceKey 唯一、时间范围有效；
- AQ0 历史 Velocity 特征测试精确覆盖五个锚点并确认当时的线性 base gain；
- 任一指标没有 NaN/Infinity；数字静音的 dBFS 用 `null` 表示，不写入非法 JSON 数值；
- natural end、cancel、failure 和 dispose 后资源统计能够归零；
- 生产 build 不包含 AQ0 HTML、合成报告或 developer-local soundbank。

### 6.2 AQ1 与后续 calibrated gate

AQ1 已冻结并实际运行：

- reference triad 峰值 `<= -3 dBFS`，实测 `-16.321 dBFS`；
- coherent 10 Voice stress 峰值 `<= -1 dBFS`，实测 `-1.031 dBFS`；
- 所有 AQ1 输入的满刻度帧数量为 0，tail 与 Runtime 资源均归零。

后续批次仍待冻结：

- AQ2 非零 attack/release 合成边界误差候选 `<= 1e-4` full scale；
- AQ2 release 结束加一个 render quantum 后 tail 候选 `< -90 dBFS`；
- AQ3 sounding Voice 和 retirement tail 不超过最终冻结预算；
- AQ3 相同压力输入保留/steal 相同 Voice Token。

没有 limiter 时，这些 peak 阈值只适用于约定 fixture 和默认 gain，不外推为任意项目绝不削波。

### 6.3 listening gate

人工听测矩阵覆盖：

- 四种 Note length 与五个 Velocity；
- 单音、三和弦、10 音和弦；
- 快速 C4 retrigger；
- continuous/sustain loop、one-shot 和 mutex；
- stop、cancel、generation 和最大复音压力。

观察至少记录 click、截断感、动态跨度、重复音峰值、尾音、异常 pumping 和 stuck Voice。旧/新政策
比较必须尽量 level-match。监听设备和环境不同，因此人工结论不能伪装成跨设备 SLO。

## 7. 状态与报告模板

每次 Gate 只允许：

- `passed`：实际运行且满足已冻结条件；
- `failed`：实际运行且发现违反条件；
- `not-run`：环境、资产或人工审阅尚未进行；
- `not-applicable`：该 Gate 明确不适用于本批。

建议审阅记录：

```text
Date:
Commit / working tree:
Browser / OS:
Automated hard gate: passed | failed | not-run
OfflineAudioContext report: passed | failed | not-run
Developer-local soundbank listening: passed | failed | not-run
Observed peak / RMS / tail:
Listening observations:
Known limitations:
Reviewer decision:
```

## 8. AQ0 明确不做

以下是已完成 AQ0 批次的历史边界；AQ1 只按已批准范围改变了第一项中的 Velocity curve 与
calibration trim：

- 不实施新 Velocity curve、calibration trim、limiter 或 meter；
- 不修改 envelope、loop、fast release、retrigger 或 polyphony；
- 不新增 Project Fact、Command、History、Studio 用户功能或持久化设置；
- 不加入 CC64、Velocity Layer、resonance、release sample 或物理钢琴建模；
- 不开始 WAV Export，也不把 AQ0 OfflineAudioContext 报告工具称作离线导出后端；
- 不提交或分发 Studio Grand、本地生成 WAV 与本地测量报告。
