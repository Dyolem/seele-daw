# Audio Quality Foundation V1A 阶段计划

> Status: AQ0 and AQ1 reviewed and committed (`40c44a1`, `1b74d26`); AQ2 implemented for review; AQ3–AQ4 not implemented
>
> Date: 2026-08-26
>
> Prerequisite checkpoint: `checkpoint/project-tempo-control-2026-08-25`

Audio Quality Foundation V1A 是“MIDI 音质、表现力与编辑基础”大阶段的第一个切片。它遵循已经
确认的后续顺序：

```text
4. Audio Quality Foundation V1A
-> 5. Workbench Action / Menu / Shortcut
-> 1. Minimal Gesture / Semantic Layer
-> 2. Velocity Editing
-> 3. Sustain Pedal CC64
-> expression quality integration gate
-> 6. WAV Offline Export
```

本文使用的音频和 MIDI 行业词汇统一收录在
[Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。AQ0 的 fixture、
测量窗口、报告结构和验收方式见
[AQ0 基线与质量契约](./audio-quality-foundation-v1a-aq0-quality-contract.md)。

## 1. 已批准的产品定位

V1A 在现有单层采样能力内解决以下问题：

- Velocity 动态、Track/Master/System gain staging 有明确且可测试的政策；
- attack、release、continuous loop、sustain loop、one-shot 与 mutex 保持可预测；
- 快速重复和密集复音不会无限增长，也不会产生不确定的 steal 结果；
- natural end、cancel、all-notes-off、generation、failure 和 dispose 后资源计数归零；
- 实时 Runtime 的政策可以在未来 WAV 离线导出中原样复用。

V1A 不把“基础可靠性”描述成完整钢琴真实性。当前单层 Sample 只能让 Velocity 改变音量，不能
产生 Velocity Layer 音色变化；CC64、half-pedal、damper resonance、release sample、pedal noise
和物理钢琴建模均不在 V1A。

## 2. 已批准的首轮候选政策

### 2.1 Velocity 与 gain staging

AQ1 已冻结并提交带 `-36 dB` 低电平下限的平方响应：

```text
floor = 10 ^ (-36 / 20)
gain(velocity) = floor + (1 - floor) * (velocity / 127) ^ 2
```

系统 calibration trim 为 `-12 dB`，位于 Project Master Gain 之后的独立 GainNode。它不是 Project
Fact，不修改保存的 Track/Master Gain。AQ0 已记录线性振幅、无 calibration trim 的历史基线；
AQ1 使用相同 fixture 记录当前政策。自动数值对照已经完成，developer-local soundbank 的
level-matched 人工听测仍为 `not-run`，须在后续收口时如实记录。

V1A 默认不静默加入 compressor、soft clipper 或 limiter。由于 Track Gain、Master Gain 均允许
`0...4`，加上任意相干复音，固定 trim 不可能对所有输入作绝对不削波保证。V1A 的 peak 门禁只
覆盖已声明的默认增益与测试向量。若未来要求任意输入都硬性不削波，limiter 必须成为显式实时/
离线共同语义，而不是浏览器后端的隐藏补丁。

### 2.2 Retrigger 与初始 Voice 预算

- 不同 occurrence 继续拥有独立 Voice Token；相同 pitch 不被全局强制 choke；
- 每次 Note On 产生新 attack；已经 release 的同音尾部可以成为优先 steal 对象；
- 首轮校准预算为每个乐器 Runtime 64 个 sounding Voice、全项目 128 个 sounding Voice，以及
  最多 16 个 retirement tail；
- 候选 steal 顺序为 release 状态、较低有效增益、较早起音、稳定 Voice Token；
- 被 steal 的 Voice 使用 fast release，不直接硬切；溢出必须可观测，不能变成 Project Commit
  失败。

上述数字在 AQ3 压测前是获准使用的校准起点，不是已实现事实。

## 3. 分批计划

### AQ0：基线与质量契约

AQ0 不改变生产发声行为，只建立后续变化可复核的尺子：

- 自有合成 PCM fixture 与固定 Voice Plan 场景矩阵；
- 当前线性 Velocity、无 calibration trim、无 Voice cap 的特征基线；
- Fake Web Audio 控制语义测试与真实浏览器 OfflineAudioContext PCM 报告入口；
- hard、calibrated、listening 三类 Gate，禁止把“未运行”写成“通过”；
- developer-local Studio Grand 听测矩阵与不可分发边界；
- 中文术语表和报告模板。

状态：已审核并提交为 `40c44a1`。

### AQ1：Velocity 与 gain staging

- 把 Velocity 响应收敛为 `audio-web` 内部纯政策，Playback 继续传原始 `1...127`；
- 实施并测试获准的首轮曲线和 calibration trim；
- 固定 Velocity 锚点、单调性、Track/Master/System 乘法、mute 和 failure cleanup；
- 用 AQ0 同一输入完成 level-matched A/B，再决定是否保留候选数值。

已审核证据：

- 纯政策函数覆盖全部 `1...127`、五个固定锚点和非法输入；Playback 仍传递原始 Velocity；
- Project Master 与固定输出校准是两个职责不同的 GainNode，dispose 和 graph failure 均回收；
- Chromium 48 kHz 合成报告的参考三和弦峰值为 `-16.321 dBFS`，10 Voice 完全同相压力峰值为
  `-1.031 dBFS`；无满刻度帧，release 后数字静音，Runtime 资源归零；
- 自动测试与浏览器校准门禁为 `passed`；developer-local soundbank 人工听测为 `not-run`；
- AQ1 已审核并提交为 `1b74d26`。

### AQ2：Envelope 与 Loop

- 把当前 fast release 从无说明常数变成有名称、有测量证据的政策；
- 验证短 Note、normal/fast release、reschedule、continuous/sustain loop、one-shot 和 mutex；
- 合成无缝 loop 的 Runtime seam 是硬门禁；真实资产自身 seam 单独报告，不由 Runtime 猜
  crossfade；
- `attack = 0` 仍表示立即起音，不偷偷覆盖 Manifest 作者语义。

当前工作树证据：

- `6 ms` fast release、`1 ms` source stop guard 与 `32` 段非线性 Envelope 近似已进入同一个
  `seele.audio-quality-foundation-v1a-aq2` 渲染政策；数值与现有声音语义保持兼容；
- Node 语义测试继续覆盖 short Note、normal/fast release、Note Off reschedule、continuous/sustain
  loop、one-shot、mutex、自然结束与资源回收；
- Chromium 48 kHz 生产 Runtime 合成报告实际测得 shaped/short Envelope 最大绝对误差分别为
  `4.861e-5`、`4.715e-5` full scale，fast release 为 `1.038e-8`，均满足 `<= 1e-4`；
- continuous/sustain loop 的最大 seam error 均为 `1.197e-5` full scale，one-shot 在普通 Note Off
  后继续发声，fast mutex 旧 Voice 误差为 `1.209e-8` 且新 Voice 正常接管；
- 所有 AQ2 输入在 render 完成和 dispose 后的 Voice、node 与 listener 统计归零，最终 tail 满足
  `< -90 dBFS`；自动与浏览器门禁为 `passed`，真实 soundbank seam/听感仍为 `not-run`；
- AQ2 尚未提交，等待本批功能审阅。

### AQ3：Retrigger、Polyphony 与 Voice Stealing

- 在 Sample Voice 所有权内增加最小有界 allocator，不建立通用 Device/Graph 平台；
- 用已批准的 64/128/16 起点压测，再冻结实际预算；
- 固定 deterministic steal 顺序、fast-release retirement 和 overflow diagnostics；
- 覆盖密集和弦、快速同音、10,000 事件压力、future schedule、generation 与清理。

### AQ4：集成与收口

- 自动 Gate、真实浏览器 PCM 报告和 developer-local listening matrix 全部记录；
- 只有本阶段收口才运行完整根级 `pnpm check`；
- 更新产品与架构状态，明确改变旧项目听感但不改变 Project File schema；
- 为渲染政策提供代码级版本标识，供未来 WAV 导出报告记录，但不自动升级为 Project Fact。

每个批次完成后默认停止等待审核，除非用户另行要求连续实施。

## 4. CC64 后的表达力音质门禁

CC64 完成后、WAV Export 开始前必须增加一次集成门禁，至少重新检查：

- pedal-held 密集和弦的 peak/headroom；
- key-held、released、pedal-held Voice 的 steal 优先级；
- 踏板按下时的同音 retrigger；
- Pedal Up release、click 与资源回收；
- Locate/Seek controller chase；
- 导出结尾仍按下踏板时的确定性收尾政策。

V1A 不预建这些语义，也不把 Sustain Loop 当作 Sustain Pedal。

## 5. 兼容与失败边界

- Project Core、Project File、History 与 dirty 语义在 V1A 不变；
- Playback 继续输出浏览器无关 Voice Plan，不承载 Web Audio gain 曲线或节点实现；
- 旧项目在 AQ1 后会有意获得新的动态/headroom，但创作事实和保存值不迁移；
- 未知 Device 继续 Missing Device，不静默替换 Studio Grand；
- 资源定位、fetch、decode、schedule 或 graph 失败不能回滚合法 Project Commit；
- 不支持的 Manifest 能力继续明确拒绝或诊断，不猜 loop、crossfade、Velocity Layer 或 Pedal；
- developer-local soundbank、报告和生成 WAV 不进入 production dist。
