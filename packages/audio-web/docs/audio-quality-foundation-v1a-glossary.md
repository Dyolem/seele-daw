# Audio Quality Foundation V1A 术语表

> Status: Active reference for Audio Quality Foundation V1A and Expression Quality Integration V1
>
> Date: 2026-09-02

本文用尽量直白的中文解释 Audio Quality Foundation V1A 与后续 Expression Quality Integration V1
中反复出现的音频、MIDI 与测试术语。
英文原词保留在表中，是为了便于对照源码、Web Audio API 和第三方资料，不要求读者先理解英文
才能审阅阶段计划。

阅读其他 V1A 文档时，术语首次出现应优先写成“中文（English）”；后续可以只使用中文或已经
稳定的源码名称。这里描述的是 Seele 当前阶段中的具体含义，不是完整的行业百科定义。

## 1. 电平与测量

| 中文术语     | 英文原词                              | 在 Seele V1A 中的含义                                                                                                  |
| ------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 脉冲编码调制 | PCM, Pulse-Code Modulation            | 把声音表示成连续数字采样值的方式。AQ0 的合成测试信号直接使用 PCM，不依赖受限音源。                                     |
| 采样值       | Sample                                | 某个声道在某一瞬间的数字振幅。不要与“采样乐器的一段 WAV 素材”混淆。                                                    |
| 音频帧       | Audio Frame                           | 同一时刻所有声道采样值的集合；立体声一帧包含左、右两个采样值。                                                         |
| 采样率       | Sample Rate                           | 每秒音频帧数量，例如 48 kHz 表示每秒 48,000 帧。                                                                       |
| 振幅         | Amplitude                             | 波形瞬时大小。数字音频常把 `-1...1` 作为规范化范围。                                                                   |
| 线性增益     | Linear Gain                           | 直接乘到振幅上的倍率；`0.5` 是一半振幅，`1` 保持不变。它不是“听起来一半响”的保证。                                     |
| 分贝满刻度   | dBFS, Decibels relative to Full Scale | 以数字系统最大幅度为 `0 dBFS` 的电平单位；负数表示低于上限。数字静音没有有限 dBFS 值。                                 |
| 峰值         | Peak                                  | 测量窗口内绝对采样值的最大值，用于发现削波风险和异常尖峰。                                                             |
| 均方根电平   | RMS, Root Mean Square                 | 描述一段波形平均能量的指标，比单个峰值更接近持续响度，但不等于人耳响度模型。                                           |
| 直流偏移     | DC Offset                             | 波形长期围绕非零值摆动。异常偏移可能浪费 headroom，或在切换时产生 click。                                              |
| 增益分级     | Gain Staging                          | 安排 Voice、Track、Master 与系统输出各层增益，使正常内容保留余量且不过早削波。                                         |
| 峰值余量     | Headroom                              | 当前峰值到 `0 dBFS` 之间保留的空间。例如峰值 `-6 dBFS` 约有 6 dB 余量。                                                |
| 校准衰减     | Calibration Trim                      | 项目 Master 之后、系统输出之前的固定校准增益。它不修改 Project Fact，也不等同于用户 Master Gain。                      |
| 低电平下限   | Velocity Floor                        | 力度响应函数在输入接近零时保留的最小增益。AQ1 的 `-36 dB` 是 Velocity 0 的数学下限；合法最小值 Velocity 1 会略高于它。 |
| 相干叠加     | Coherent Summation                    | 多个同相、同频波形的峰值直接相加。10 个完全相同 Voice 是刻意严苛的峰值压力输入，不代表普通和弦的常见听感。             |
| 等功率声像   | Equal-power Panning                   | 中心声像把单声道信号按等功率规则送到左右声道；每个声道通常比原单声道低约 3 dB。                                        |
| 削波         | Clipping                              | 波形超过输出范围后被截平，通常产生明显失真。固定 trim 无法对任意增益与任意相干复音作绝对防削波保证。                   |
| 限幅器       | Limiter                               | 为阻止峰值超过阈值而自动降低增益的处理器。它会改变声音，若采用就必须在实时和离线导出中保持一致。                       |
| 压缩器       | Compressor                            | 按动态范围自动改变增益的处理器。V1A 不把它当作无副作用的安全开关。                                                     |
| 瞬态         | Transient                             | 起音等位置短而快速的能量变化，决定敲击感，也最容易暴露削波或 click。                                                   |
| 点击杂音     | Click                                 | 不连续电平变化产生的短促高频杂音。`attack = 0` 或素材自身不连续可能有意或不可避免地形成突变。                          |
| 渲染量子     | Render Quantum                        | Web Audio 分块处理音频的最小工作单位；当前浏览器通常以 128 帧处理，但质量契约不把平台实现细节当作 Project Fact。       |

## 2. MIDI、动态与发声生命周期

| 中文术语     | 英文原词                      | 在 Seele V1A 中的含义                                                                                                                      |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 力度         | MIDI Velocity                 | MIDI Note 的 `1...127` 创作事实。当前 Sample Runtime 只用它控制振幅，不改变采样音色。                                                      |
| 力度响应曲线 | Velocity Response Curve       | 把 MIDI Velocity 转成线性增益的函数。AQ1 当前使用带低电平下限的平方曲线。                                                                  |
| 平方力度响应 | Quadratic Velocity Response   | 先把 Velocity 归一化再取平方，使中低力度比线性振幅政策更安静；它只改变音量映射，不会创造新的采样音色。                                     |
| 力度层       | Velocity Layer                | 同一音高按力度选择不同采样素材。当前 Manifest 和 Studio Grand 没有该能力，不能把音量曲线称为力度层。                                       |
| 起音         | Note On / Attack              | 新 Note 开始发声，以及包络从零进入稳定电平的阶段。                                                                                         |
| 松音         | Note Off / Release            | Note 结束输入，以及包络把声音降到静音的阶段。Note Off 不等于立即销毁 AudioNode。                                                           |
| 包络         | Envelope                      | 控制 Voice 振幅随时间变化的曲线；当前 Profile 明确包含 attack 和 release。                                                                 |
| 分段曲线近似 | Piecewise Curve Approximation | 把一条非线性包络拆成多个短线性 ramp 执行。AQ2 固定使用 32 段，目的是稳定逼近 Manifest 曲线，不是改变作者给出的时长。                       |
| 门控触发     | Gated                         | Note Off 会启动 release；音符时长参与声音生命周期。                                                                                        |
| 单次触发     | One-shot                      | 普通 Note Off 不截断素材，让素材自然播放；显式 cancel 或 mutex 仍可停止它。                                                                |
| 声部实例     | Voice                         | 一次具体发声所拥有的 source、gain、可选 pan、包络状态与清理责任。它不是 Project Track。                                                    |
| 复音数       | Polyphony                     | 同时存在或同时发声的 Voice 数量。AQ3 的预算按 Runtime 已接纳并拥有的 Voice 图计数，不等同于瞬时声学响度。                                  |
| 发声槽       | Sounding Voice Slot           | AQ3 中尚未被复音分配器标记为退场的 Runtime Voice 名额；每个乐器设备 64 个、同一项目 Runtime 128 个。                                       |
| 同音重触发   | Same-pitch Retrigger          | 旧 Voice 仍在发声时，相同 pitch 再次 Note On。不同 occurrence 保持独立，不全局强制 choke；EQ2 预期听到新起音叠加旧尾音，而不是旧音被切断。 |
| 声部窃取     | Voice Stealing                | 发声槽达到预算时，按确定性规则选择旧 Voice 并让其快速 release，为新 Voice 腾出名额。                                                       |
| 退场尾音     | Retirement Tail               | AQ3 中专指被复音分配器 steal、正在快速 release、尚未完成清理的 Voice；最多 16 个。Stop/Cancel 尾音不混入该计数。                           |
| 复音丢弃     | Polyphony Drop                | 退场尾音预算也已满时，不接纳新 Voice Plan，并返回 `polyphony-dropped`；已有尾音不会被硬切。                                                |
| 溢出诊断     | Overflow Diagnostics          | 累计 steal/drop 次数和当前发声槽/退场尾音数量，用于确认压力行为；当前不是 Project Fact 或 Studio 持久化警告。                              |
| 卡死声部     | Stuck Voice                   | 本应结束却继续发声或继续占有节点的 Voice。任何 stop、failure、generation 切换和 dispose 后都不能残留。                                     |
| 互斥组       | Mutex / Exclusive Group       | 新 Voice 触发时按 Manifest 规则关闭同组旧 Voice，常见于开闭镲等互斥发声。                                                                  |
| 快速释放     | Fast Release                  | stop、cancel、steal 或 fast mutex 使用的短 release。AQ2 将既有值正式冻结为 6 ms 线性淡出，避免直接硬切。                                   |
| 停止保护间隔 | Source Stop Guard             | release 排程结束到真正停止 source 之间的短保护时间。AQ2 固定为 1 ms，防止调度舍入让 source 提前截断包络。                                  |

## 3. 采样、Zone 与循环

| 中文术语 | 英文原词        | 在 Seele V1A 中的含义                                                                                                                |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 采样素材 | Sample Asset    | 被 AudioBufferSourceNode 播放的 WAV/AudioBuffer。开发者本地音源不等于可分发资产。                                                    |
| 音区     | Zone            | Manifest 中把 pitch 范围、素材、root pitch、包络、loop、offset 与 mutex 组合起来的发声规则。                                         |
| 根音高   | Root Pitch      | 素材未经转调时对应的 MIDI pitch；目标 pitch 与它的差决定播放速率。                                                                   |
| 转调     | Transposition   | 通过改变播放速率让一个素材覆盖其他 pitch；也会改变素材的自然持续时间。                                                               |
| 源偏移   | Source Offset   | 从素材内部哪个时间点开始播放。                                                                                                       |
| 连续循环 | Continuous Loop | 进入 loop 后在 Note On 和 release 期间都继续循环，直到 Voice 完全停止。                                                              |
| 延音循环 | Sustain Loop    | Gate 保持时循环，最终 Gate Release 后离开循环并进入素材非循环尾部。没有 CC64 保持时，该边界就是 Note Off；它本身不是 Sustain Pedal。 |
| 循环接缝 | Loop Seam       | loop 末端跳回开头的边界。素材或 loop point 不连续时可能产生 click。                                                                  |
| 接缝误差 | Loop Seam Error | 实际回绕点附近 PCM 与首轮参考片段之间的最大差值。AQ2 用它检查 Runtime 是否额外制造不连续，不替真实资产保证无缝。                     |
| 交叉淡化 | Crossfade       | 在两个片段或 loop 边界间重叠并渐变。当前 Supported SFZ Profile 不支持非零 loop crossfade。                                           |
| 自然尾部 | Natural Tail    | 不再循环后由素材剩余部分或 release 包络形成的尾音。                                                                                  |

## 4. 调度、测试与质量流程

| 中文术语           | 英文原词                     | 在 Seele V1A 中的含义                                                                                                                                                                           |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发声计划           | Voice Plan                   | Playback 产生的浏览器无关调度 DTO，包含时间、pitch、velocity、gain、pan 与目标设备。                                                                                                            |
| 出现实例           | Occurrence                   | Arrangement 展开后一次具体 Note 出现；重叠同音必须用 occurrence 区分。                                                                                                                          |
| 发声令牌           | Voice Token                  | 当前由 `(engineGeneration, occurrenceKey)` 组成的 Voice 身份，用于 cancel、重排和清理。                                                                                                         |
| 引擎代次           | Engine Generation            | Transport 时间映射或全局状态失效时推进的运行时代次；旧代计划必须被丢弃。它不是 modelRevision。                                                                                                  |
| 渲染政策标识       | Render Policy ID             | 标记一组实际发声算法与常数的代码级字符串。最终 V1A 为 `seele.audio-quality-foundation-v1a-aq3`；它不是 Project Fact 或文件 schema。                                                             |
| 报告结构版本       | Report Schema Version        | 标记浏览器质量报告字段形状的整数。V1A 收口历史报告是 version 4，加入 EQ2 字段后的综合报告是 version 5；两者都不表示 Project File 版本，也不等于渲染政策版本。                                   |
| 离线音频上下文     | OfflineAudioContext          | 浏览器中不连接扬声器、尽快渲染到 AudioBuffer 的 Web Audio 后端。AQ0 用它运行真实 Voice Runtime 和合成素材。                                                                                     |
| 离线上下文适配视图 | Offline Context Adapter View | `OfflineAudioContext` 在开始渲染前报告 `suspended`，但生产 Voice Runtime 只接收已激活的 `running` 上下文。AQ0 只在调度窗口把状态读取适配为 `running`；节点和 PCM 仍由原生离线上下文创建和渲染。 |
| 实时/离线一致性    | Realtime/Offline Parity      | 实时播放和未来 WAV 导出使用相同发声政策，而不是两套听起来不同的实现。                                                                                                                           |
| 测试样本           | Fixture                      | 固定、可重复的测试输入。AQ0 fixture 是自行生成的 PCM 与 Voice Plan，不包含受限音源。                                                                                                            |
| 基线               | Baseline                     | 改动前被明确记录的当前行为。基线不代表该行为永远正确，只用于审阅差异。                                                                                                                          |
| 质量门禁           | Quality Gate                 | 必须达到的客观检查或人工听测条件；未运行必须写成“未运行”，不能记作通过。                                                                                                                        |
| 特征测试           | Characterization Test        | 固定当前行为的测试。AQ1 有意改变 Velocity 时，应同时更新特征测试和阶段记录。                                                                                                                    |
| 硬门禁             | Hard Gate                    | 可自动判断通过/失败的约束，例如无 NaN、资源归零或确定性顺序。                                                                                                                                   |
| 校准门禁           | Calibrated Gate              | 需要先取得基线再冻结阈值的指标，例如 reference chord peak。                                                                                                                                     |
| 人工听测           | Listening Gate               | 由人判断 click、截断感、动态和音色接受度；数值测试不能替代它。                                                                                                                                  |
| A/B 对比           | A/B Comparison               | 在响度匹配等受控条件下比较旧政策和候选政策，避免把单纯更响误认为更好。                                                                                                                          |
| 满刻度帧           | Full-scale Frame             | 至少一个声道的绝对采样值达到或超过 `1` 的音频帧。AQ1 合成报告把数量非零视为削波风险证据。                                                                                                       |
| 参考三和弦         | Reference Triad              | 固定 pitch `60, 64, 67`、Velocity 96 的三 Voice 输入，用于观察普通复音路径的 peak、RMS、尾部与清理。                                                                                            |
| 相干压力输入       | Coherent Stress Fixture      | 同时启动 10 个完全相同、满力度 Voice 的确定性最坏情况输入，用来校准 headroom；它不是 Voice 上限或真实乐曲模型。                                                                                 |
| 最大绝对误差       | Maximum Absolute Error       | 实际 PCM 与同一时刻解析目标值之差的最大绝对值。AQ2 的 Envelope 门禁用 full scale 比例表达，`1e-4` 约等于满刻度的万分之一。                                                                      |
| 踏板保持电平比     | Pedal-hold Level Ratio       | EQ2 中按键松开后、Pedal Up 前的 RMS 除以松键前 RMS。接近 `1` 表示二值踏板保持没有额外衰减；它不证明真实钢琴共鸣、主观响度或无限延音。                                                           |
| 重触发叠加比       | Retrigger Level Ratio        | EQ2 合成同相正弦中两个同音 occurrence 重叠 RMS 除以单 Voice RMS。接近 `2` 证明两个 Voice 独立叠加；真实采样因相位、音色和包络不同不必得到同一比值。                                             |
| 抬踏板释放误差     | Pedal-up Release Error       | Pedal Up 后生产 PCM 与 Manifest 解析 release 包络之间的最大绝对误差，用于发现提前释放、硬切或错误包络；它不是人耳 click 检测，也不评价素材本身。                                                |
| 尾部窗口           | Tail Window                  | release 与 source stop 理应完成后用于检查残余信号的时间窗；数字静音记为 `null dBFS`，不是测量失败。                                                                                             |
| 确定性             | Deterministic                | 相同输入和政策得到相同调度、保留/steal 顺序与报告结构，不依赖 Map 偶然顺序。                                                                                                                    |

## 5. Sustain Pedal 播放术语

| 中文术语     | 英文原词                  | 在 Seele 当前阶段中的含义                                                                                              |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 延音踏板控制 | MIDI CC64 / Sustain Pedal | MIDI Control Change 64。保留原始 `0...127`，当前以 `>=64` 判断踏板按下；AQ3 本身未实现，后续 CC64 批次已接通二值播放。 |
| 按键释放     | Key Release / Note Off    | Note 自己记录的松键时间。踏板不会改写它，Playback Plan 以 `endTick` 保留。                                             |
| 按键保持声部 | Key-held Voice            | 当前时间仍早于按键释放；演奏者仍按着键的 Voice。Expression EQ1 在复音溢出时最后才选择它。                              |
| 已松键声部   | Key-released Voice        | 按键已经松开但尚未进入最终 release；对 gated Voice 而言通常是踏板保持，对 one-shot 则仍保留自然播放语义。              |
| 踏板保持声部 | Pedal-held Voice          | Note Off 已到达、但因对应 Channel 的 CC64 按下而不能进入最终 release 的 Voice。                                        |
| 释放中声部   | Release-started Voice     | 正常或强制 release 已经开始、但节点和尾音尚未清理完成的 Voice；Expression EQ1 优先让它退场。                           |
| 抬踏板       | Pedal Up                  | CC64 值回到 `<64`；它让此前已经松键的 pedal-held Voice 到达最终 Gate Release。                                         |
| 最终发声释放 | Final Gate Release        | gated Voice 真正解除 Gate 的时间；无踏板保持时等于 Note Off，保持时等于 Pedal Up，且不越过 Clip 末端。                 |
| 控制器追赶   | Controller Chase          | 从歌曲中间播放或 seek 时，恢复该位置之前最后生效的 CC 状态；它不等于补发已经开始的 Note。                              |
| 半踏板       | Half-pedal                | 使用 CC64 中间值表达连续制音程度；当前只保留原值并做二值播放，不实现连续制音模型。                                     |
| 制音器共鸣   | Damper Resonance          | 踏板按下后琴弦与琴体额外共鸣的声学效果；当前单层 Sample Runtime 不具备。                                               |
| 松键采样     | Release Sample            | Note Off 或 Pedal Up 时额外触发的素材；当前 Manifest 未声明该能力。                                                    |

## 6. 最容易混淆的边界

- **力度不等于响度**：Velocity 是 MIDI 输入；曲线、素材、复音和输出设备共同决定听感。
- **延音循环不等于延音踏板**：前者是单个 Zone 的素材循环规则，后者是 CC64 控制器状态。
- **release 不等于立刻 stop**：release 期间 Voice 仍发声并占用有限资源。
- **退场尾音不等于所有快速释放 Voice**：AQ3 的 16 个预算只属于声部窃取分配器；Stop、Cancel、
  Generation 和 mutex 仍按各自生命周期释放。
- **复音丢弃不等于项目编辑失败**：它是 Audio Runtime 没有接纳某个发声计划的诊断，不回滚合法
  Project Commit，也不修改 MIDI Note。
- **headroom 不等于绝不削波**：固定 trim 只能覆盖已声明的增益和 fixture 范围。
- **客观指标不等于主观音质**：peak、RMS 和 seam 可以发现错误，但不能决定钢琴是否自然。
- **开发者本地听测不等于可分发资产**：Studio Grand 仍受既有资产边界约束。
