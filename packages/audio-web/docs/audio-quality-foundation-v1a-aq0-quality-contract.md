# Audio Quality Foundation V1A：AQ0 基线与质量契约

> Status: AQ0–AQ2 reviewed and committed (`40c44a1`, `1b74d26`, `dfa2411`); AQ3 evidence added from current working tree for review
>
> Date: 2026-08-26

本文冻结 AQ0 的输入、历史行为基线、测量方法和后续验收规则，并追加使用生产 Runtime 取得的
AQ1、AQ2 与 AQ3 证据。术语解释见
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

### 2.1 AQ1 当前政策

| 领域     | AQ1 政策                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Velocity | Voice base gain 为 `floor + (1 - floor) * (velocity / 127) ^ 2`，其中 `floor = 10 ^ (-36 / 20)`，再乘 Track Gain。 |
| Master   | Project `masterGain` 原值写入 Project master GainNode；独立下游节点再应用固定 `-12 dB` 输出校准。                  |
| 项目事实 | MIDI Velocity、Track Gain、Master Gain、Project File 与 Playback Voice Plan 数值均不迁移、不重写。                 |
| 动态处理 | 没有隐藏 compressor、soft clipper、limiter 或 true-peak meter。                                                    |
| 其余领域 | Retrigger、Polyphony、Envelope、Loop、Fast release 与 Voice cleanup 在 AQ1 仍保持 AQ0 所记录行为。                 |

### 2.2 AQ2 已提交政策

AQ2 没有改写 Manifest 作者给出的 attack、release、loop 或 trigger 值，也没有引入 crossfade。它把
既有实现数值收进同一个可版本化政策，并用真实浏览器 PCM 冻结兼容行为：

| 领域            | AQ2 政策                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Fast release    | cancel、Stop、generation、all-notes-off 与 fast mutex 使用 `6 ms` 线性释放。                         |
| Source stop     | 释放结束后保留 `1 ms` source stop guard，避免调度边界提前停止。                                      |
| Shaped Envelope | 非零 curve 使用 `32` 段线性 ramp 近似 Seele Manifest 指数形状；`curve: null` 与 `0` 仍保持原生线性。 |
| Trigger / Loop  | one-shot、continuous loop、sustain loop 与 directed mutex 的既有产品语义不变。                       |
| 版本标识        | 完整渲染政策为 `seele.audio-quality-foundation-v1a-aq2`。                                            |
| 仍待 AQ3 的领域 | Retrigger 保持 occurrence 独立；Polyphony 仍无 Voice cap 或 steal policy。                           |

### 2.3 AQ3 当前工作树政策

AQ3 不改变发声计划（Voice Plan）或项目数据，只在项目级 Sample Voice Runtime 内限制已经接纳的
Web Audio Voice 图数量：

| 领域               | AQ3 政策                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| 乐器发声槽预算     | 每个 `instrumentDeviceId` 最多 `64` 个非分配器退场 Voice。                                               |
| Runtime 发声槽预算 | 同一个项目 `SampleInstrumentVoiceRuntime` 最多 `128` 个非分配器退场 Voice。                              |
| 分配器退场尾音预算 | 最多 `16` 个因声部窃取而执行 `6 ms` 快速释放、尚未清理的 Voice；普通 Stop/Cancel 尾音不混入该计数。      |
| 确定性候选顺序     | 已进入 release 优先，其次当前有效增益较低、start 较早、稳定 Voice Token 较小。                           |
| 同音重触发         | 不同 occurrence 继续产生独立 Voice 和 attack；相同 pitch 不会被全局强制 choke。                          |
| 退场预算已满       | 新计划返回 `polyphony-dropped`；不创建新 AudioNode、不硬切已有退场尾音，也不使合法 Project Commit 失败。 |
| 可观测计数         | Runtime 公开累计 steal/drop 与当前发声槽/分配器退场尾音数量；目前没有新增 Studio 用户提示或持久化诊断。  |
| 版本标识           | 完整渲染政策为 `seele.audio-quality-foundation-v1a-aq3`。                                                |
| 尚未包含           | CC64、pedal-held Voice、Velocity Layer、release sample、共鸣、limiter 与未来 WAV Offline Backend。       |

这里的“发声槽”指 Runtime 已接纳并仍拥有、且没有被复音分配器标记为退场的 Voice。它包括提前调度的
Voice 图，因此是确定的资源所有权预算，不声称等于某一采样帧上实际非零的声学 Voice 数量。

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

页面不读取 Studio Grand 或 Project，只创建合成 AudioBuffer，通过真实
`SampleInstrumentVoiceRuntime` 在 `OfflineAudioContext` 中渲染固定 Velocity 向量、参考三和弦、
10 Voice 相干压力输入、AQ2 Envelope/Loop/Trigger 场景，以及 AQ3 的 10,000 Note On 与项目级
复音预算场景。报告包含：

- schema/version、浏览器 user agent、sample rate 与 fixture 参数；
- 每个 Velocity 的 per-channel peak、RMS、DC offset；
- steady window 的 combined peak/RMS 与相对 `v127` dB；
- release 完成后的 tail peak；
- 每个输入的满刻度帧数量；
- shaped/short/fast Envelope 相对解析目标曲线的最大绝对误差；
- continuous/sustain loop 的 seam error、one-shot Note Off 后电平与 fast mutex 接管结果；
- AQ3 的 scheduled/drop 数量、发声槽/退场尾音预算、steal/drop 累计计数、退场快速释放 PCM
  误差与保留 Voice 电平误差；
- render 完成和显式 dispose 后的 Runtime 资源统计；
- 当前完整 render policy 参数与代码级标识 `seele.audio-quality-foundation-v1a-aq3`。

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

### 5.3 2026-08-26 Chromium AQ2 报告

同一 Chromium `151.0.0.0`、macOS user agent、48 kHz 入口使用 schema version 3 运行生产 AQ2
渲染政策。报告的 AQ1 peak/headroom 检查继续通过，并增加以下 AQ2 PCM 结果：

| Envelope 输入 | 最大绝对误差（full scale） | 门禁      |
| ------------- | -------------------------: | --------- |
| shaped        |                 `4.861e-5` | `<= 1e-4` |
| short Note    |                 `4.715e-5` | `<= 1e-4` |
| fast release  |                 `1.038e-8` | `<= 1e-4` |

| Loop / Trigger 输入 | 实测结果                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| continuous loop     | 9 个回绕点，最大 seam error `1.197e-5` full scale                                |
| sustain loop        | 6 个回绕/离环点，最大 seam error `1.197e-5` full scale                           |
| one-shot            | 普通 Note Off 后测量窗口峰值 `0.088809`，确认素材继续发声                        |
| fast mutex          | 旧 Voice release 误差 `1.209e-8`；一个 render quantum 后旧声道为 `-342.281 dBFS` |

全部测量值有限；两类 Loop 保持可听信号；mutex 新 Voice 正常接管；所有场景在 render 完成与 dispose
后的 Voice、source、node 和 listener 统计归零，最终 tail 为数字静音。合成报告能证明 Runtime 没有
额外制造超阈值接缝，不能证明真实资产的 loop point 天然无缝；developer-local soundbank 的 seam 与
主观听测仍为 `not-run`。

### 5.4 2026-08-26 Chromium AQ3 报告

同一 Chromium `151.0.0.0`、macOS user agent、48 kHz 入口使用 schema version 4 运行生产 AQ3
渲染政策。原有 AQ1 peak/headroom 与 AQ2 Envelope/Loop 的所有检查继续通过，AQ3 新增结果如下：

| 压力输入                 |   Plan | Scheduled |  Drop | 发声槽 | 退场尾音 | Steal | 满刻度帧 |
| ------------------------ | -----: | --------: | ----: | -----: | -------: | ----: | -------: |
| 单乐器 10,000 Note On    | 10,000 |        80 | 9,920 |     64 |       16 |    16 |        0 |
| 三乐器项目级第 129 Voice |    129 |       129 |     0 |    128 |        1 |     1 |        0 |

10,000 Note On 输入中，前 64 个 Voice 占用乐器发声槽，接下来的 16 个新 Voice 各自确定性选择一个
旧 Voice 执行快速释放；分配器退场尾音达到 16 后，其余 9,920 个计划返回 `polyphony-dropped`。
项目级输入由两个各 64 Voice 的乐器先占满 128 个 Runtime 发声槽，第 129 个不同乐器 Voice 确定性
steal 最早的稳定候选，没有触发 drop。

| PCM 指标                    | 单乐器 10,000 输入 | 项目级 129 输入 | 门禁      |
| --------------------------- | -----------------: | --------------: | --------- |
| 退场快速释放最大绝对误差    |         `6.240e-9` |     `1.893e-10` | `<= 1e-5` |
| 保留 Voice 电平最大绝对误差 |         `4.526e-8` |      `1.203e-7` | `<= 1e-5` |
| 退场声道尾部                |    `-346.157 dBFS` | `-340.137 dBFS` | `< -90`   |
| 最终 tail                   |           数字静音 |        数字静音 | `< -90`   |

两组场景的 Voice、source、node 与 listener 在 render 和 dispose 后均归零；累计 steal/drop 计数保留
用于诊断，当前占用计数归零。该合成门禁证明预算、选择结果和快速释放 PCM 可重复，不替代真实
Soundbank 在最大复音下的主观听测；该 listening gate 仍为 `not-run`。

## 6. Gate 分类

### 6.1 AQ0 hard gate

- fixture 的 sample rate、frame count、peak、RMS、DC、loop wrap delta 与立体声反相关系稳定；
- Voice Plan 矩阵完全冻结、occurrenceKey 唯一、时间范围有效；
- AQ0 历史 Velocity 特征测试精确覆盖五个锚点并确认当时的线性 base gain；
- 任一指标没有 NaN/Infinity；数字静音的 dBFS 用 `null` 表示，不写入非法 JSON 数值；
- natural end、cancel、failure 和 dispose 后资源统计能够归零；
- 生产 build 不包含 AQ0 HTML、合成报告或 developer-local soundbank。

### 6.2 AQ1–AQ3 calibrated gate

AQ1 已冻结并实际运行：

- reference triad 峰值 `<= -3 dBFS`，实测 `-16.321 dBFS`；
- coherent 10 Voice stress 峰值 `<= -1 dBFS`，实测 `-1.031 dBFS`；
- 所有 AQ1 输入的满刻度帧数量为 0，tail 与 Runtime 资源均归零。

AQ2 已冻结并实际运行：

- shaped、short Note 与 fast release 的 Envelope 最大绝对误差 `<= 1e-4` full scale；
- continuous 与 sustain loop 的合成 seam error `<= 1e-4` full scale；
- one-shot 在普通 Note Off 后继续可听，fast mutex 在释放旧 Voice 后由新 Voice 接管；
- release 结束加一个 render quantum 后旧 mutex 声道与最终 tail `< -90 dBFS`；
- 所有 AQ2 场景在 render 和 dispose 后的 Runtime 资源统计归零。

AQ3 已冻结并实际运行：

- 每个 `instrumentDeviceId` 最多 64 个发声槽，同一项目 Runtime 最多 128 个发声槽；
- 复音分配器最多保留 16 个退场尾音；达到上限后的新计划明确返回 `polyphony-dropped`；
- 相同压力输入按 release、当前有效增益、start 与稳定 Voice Token 选择同一个 steal 候选；
- 退场快速释放和保留 Voice 电平最大绝对误差均 `<= 1e-5` full scale；
- 所有 AQ3 合成压力场景无满刻度帧，最终 tail `< -90 dBFS`，Runtime 资源归零。

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
calibration trim，AQ2 只把既有 Envelope/Loop/Trigger 语义版本化并增加真实 PCM 门禁，AQ3 只在
Sample Voice Runtime 内加入有界复音分配与诊断：

- 不实施新 Velocity curve、calibration trim、limiter 或 meter；
- 不修改 envelope、loop、fast release、retrigger 或 polyphony；
- 不新增 Project Fact、Command、History、Studio 用户功能或持久化设置；
- 不加入 CC64、Velocity Layer、resonance、release sample 或物理钢琴建模；
- 不开始 WAV Export，也不把 AQ0 OfflineAudioContext 报告工具称作离线导出后端；
- 不提交或分发 Studio Grand、本地生成 WAV 与本地测量报告。
