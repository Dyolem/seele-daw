# Expression Quality Integration V1 收口报告

> Status: Closed; EQ0–EQ3B reviewed (`f47bf38`, `3c29bc9`, `5ef34a5`, EQ3B closure commit)
>
> Date: 2026-09-02

本文汇总 CC64 接入 Sample Voice Runtime 后的最终表达力政策、客观 PCM、Transport 收尾、人工
听测状态，以及未来 WAV Offline Export 必须继承的边界。阶段过程见
[Expression Quality Integration V1 阶段计划](./expression-quality-integration-v1-phase-plan.md)，
行业词汇见
[Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。

## 1. 收口结论

Expression Quality Integration V1 在现有二值 CC64 与单层采样器范围内冻结以下行为：

| 领域                  | 最终行为                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| 复音退场              | 先选择 `release-started`，再选择 `key-released` / pedal-held，最后选择 `key-held` Voice。                 |
| Pedal Up              | gated Voice 在 Playback 派生的 Final Gate Release 执行 Manifest 正常 release；按键释放本身不提前降音。    |
| 同音重触发            | 不同 occurrence 保持独立 Voice；踏板保持的旧音不因相同 pitch 的新 Note On 被全局 choke。                  |
| Clip 末端             | 踏板没有在非循环 Clip 内抬起时，Final Gate Release 固定在 Clip Source Window 末端，不延伸到 UI Timeline。 |
| 显式播放中断          | Pause、Locate Preview、Return 与完整 Reset 继续使用 `6 ms` fast release。                                 |
| Transport 自然结束    | 不调用全局 `allNotesOff`；已经排程的正常 release 或 one-shot 尾音可以结束。                               |
| 非播放态应用所有权    | Voice Handle 或 retired Runtime 终结前保持低频回收；终态归零后停止 Timer，不改变 PCM。                    |
| 实时 / 未来离线一致性 | WAV Backend 必须复用相同 Voice、Envelope、Loop、Trigger、复音、CC64 和收尾政策。                          |

实际声音算法仍由以下两个生产政策标识共同描述：

```text
seele.audio-quality-foundation-v1a-aq3
seele.audio-quality-expression-v1-eq1
```

EQ3A 与 EQ3B 没有改变 DSP、Envelope、AudioNode 排程或 Voice Stealing 选择，因此不虚构新的 `eq3`
声音政策标识，也不把报告 schema、Project File version、modelRevision 或 engineGeneration 混为一谈。

## 2. 实时与未来 WAV 的共同边界

### 2.1 三种终点不能混用

| 终点             | 当前权威                              | 用途                                                                                           |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 编排内容终点     | Playback `arrangementEndTick`         | 全部原始 Clip 的中性内容范围；未来完整编排 V1 导出的默认音乐范围为 `[0, arrangementEndTick]`。 |
| 交互时间线终点   | Playback `timelineEndTick`            | Ruler、滚动与实时 Transport 自然结束；至少 150 小节并可能包含 8 个尾部小节。                   |
| 音频输出渲染终点 | 音乐范围终点与 Voice Runtime 全部终态 | 至少覆盖音乐范围，并继续到最后一枚已接纳 Voice 完成正常 release 或 one-shot 自然播放。         |

`timelineEndTick` 是交互视图和实时播放位置的派生范围，不是 Project Fact，也不是未来 WAV 文件时长。
短项目不能因为 UI 保留 150 小节就导出大段静音；反过来，声音尾部超过编排或交互时间线终点时也不能被
静默截断。最终文件终点取音乐范围终点与声音尾部终点中较晚者：素材提前耗尽或末端内容静音时仍保留
完整音乐范围，release / one-shot 更晚结束时则继续保留尾部。

本契约只冻结完整编排 V1 的默认音乐范围。用户选择区间、Loop 区间或 Stem Export 的输入范围留给实际
WAV 纵向切片设计，不能从本报告推断为已经实现。

### 2.2 Clip 与 Voice 的收尾规则

1. 非循环 Clip 的 Source Window 保持半开区间。Note On 只从窗口内产生，按键释放和 CC64 派生的
   Final Gate Release 都不越过 Clip 末端。
2. Clip 末端仍为 Pedal Down 时，gated Voice 在该边界开始 Manifest 正常 release。Clip 只关闭
   Gate，不硬切素材或把 release 时长写回 Project Note。
3. no-loop 素材可能更早自然耗尽；continuous loop 在 release 期间继续循环；sustain loop 在 Final
   Gate Release 后离开循环；one-shot 忽略普通 Gate Release 并播放到素材自然结束。
4. Future WAV Backend 必须在默认音乐范围内安排相同 Voice Plan，至少渲染到音乐范围终点，并在
   必要时继续到所有已接纳 Voice 到达终态。显式 Pause / Locate / Return 的 fast release 不属于
   正常离线导出尾部。
5. 精确声音终点依赖 Manifest release、loop / trigger、AudioBuffer 时长、offset、移调播放速率和
   Runtime 资源终态，不能只靠 Project Tick 或 Playback Plan 猜测。因此这项知识继续归 Audio Web /
   Offline Backend，不下沉到 Project Core 或浏览器无关 Playback。

未来实现若需要安全时长预算，必须在导出准备阶段显式验证并以可见失败或用户决策结束；不能写出
“成功”文件后静默截掉 release、one-shot 或卡死 Voice。具体预算数值、取消、进度、sample rate、
channel count、PCM 编码、dither 与峰值报告仍属于 WAV Offline Export 阶段。

### 2.3 架构所有权

| 层                          | 当前与未来责任                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Project Core                | 保存 Note、CC64、Clip、Device、Tempo 与不可变 Snapshot；不知道 WAV、AudioNode 或声音尾部秒数。        |
| Playback                    | 编译 `endTick` / `releaseTick`、`arrangementEndTick`、`timelineEndTick` 与调度时间；不读取 Manifest。 |
| Audio Web / Offline Backend | 准备 Manifest / WAV，执行同一发声政策，并判断 Voice 与资源何时真正终结。                              |
| Studio                      | 冻结一次导出使用的 modelRevision，组合进度、取消、失败与文件交付；不成为第二套声音权威。              |

EQ3B 不新增 package root API 或占位 Offline service。实际 WAV 纵向切片出现真实消费者时，再把上述
责任落实为最小接口。

## 3. 自动与浏览器证据

| Gate                               | 状态     | 证据                                                                                                             |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| EQ1 pedal-aware Voice Stealing     | `passed` | 生命周期等级先于有效增益、起音时间和稳定 Token；64 / 128 / 16 预算不变。                                         |
| EQ2 Chromium `OfflineAudioContext` | `passed` | Chromium 151、48 kHz、schema version 5；Pedal Up、32 Voice headroom、重触发、尾部和资源归零均通过。              |
| AQ2 / AQ3 fast-release PCM         | `passed` | 显式 cancel、mutex 与 Voice Stealing 的 `6 ms` 包络误差、尾部静音和资源回收均在同一综合报告中通过。              |
| Playback Clip / Timeline 边界      | `passed` | Compiler 回归固定 `releaseTick = Clip End < timelineEndTick`，CC64 不把 Gate 延伸到派生 UI Timeline。            |
| Studio Transport / Reconciliation  | `passed` | Pause / Locate / Return、选择性 CC64 重排、设备替换、自然结束与非播放态尾音所有权均有 Coordinator 回归。         |
| 最终根级 `pnpm check`              | `passed` | Architecture、Workspace Quality、Lint、全工作区 Type Check、148 文件 / 1,310 项测试、Studio Build 与 dist 边界。 |

EQ2 之后的生产变化只调整 Voice Stealing 选择和 Studio 已结束 Handle 的应用层所有权；EQ3A / EQ3B 没有
修改 PCM 或 AudioNode 排程。因此本批复用已提交的 schema version 5 Chromium 报告，不把相同输入的
重复运行冒充新的人工听测或新音质算法。

当前完整测试基线为 148 个文件 / 1,310 项：Project Core 32 / 465、MIDI File 3 / 14、Platform
Browser 3 / 23、Editor 16 / 140、Project MIDI 3 / 25、Playback 9 / 107、Audio Web 20 / 137、
Studio 61 / 397、Type Utils 1 / 2。

## 4. 人工听测状态

| Listening Gate                                   | 状态      | 解释                                                                                 |
| ------------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| 2026-08-13 Studio Grand 单音加载与 release smoke | `passed`  | 历史验证确认资源可发声且 `0.133 s` 单音 release 未感知明显 click；不是当前完整矩阵。 |
| Pause / Return 的 `6 ms` fast release            | `not-run` | 自动 PCM 已通过，尚未由人在当前 Studio Grand 上判断中断感或 click。                  |
| Pedal Up release                                 | `not-run` | 合成 PCM 已通过，尚未用当前 Studio Grand 完成踏板保持与抬起听测。                    |
| 踏板下同音重触发                                 | `not-run` | 自动证据确认两个 occurrence 独立，尚未人工判断旧尾音与新起音的主观叠加。             |
| 最大复音与 pedal-aware steal                     | `not-run` | 预算和选择顺序已通过，尚未人工判断极端演奏中的截断感、click 或 pumping。             |

`not-run` 不伪装成通过，也不阻断已经可自动证明的确定性和资源安全收口。未来人工听测若发现
可闻问题，必须形成新的可审阅声音政策与相应 PCM 回归，不能静默修改常数。

## 5. 兼容、失败与延期边界

- 本阶段不修改 Project Fact、Project File、History、dirty、MIDI 导入事实或已有项目内容；不需要
  schema migration。
- Playback 失败、资源准备失败、AudioNode 调度失败或未来离线写文件失败都不能回滚合法 Project
  Commit。导出必须固定一次 modelRevision，不能把过程中到达的新编辑混进同一文件。
- 未知或缺失 Device 继续保存并显示 Missing Device；未来导出不能静默替换 Studio Grand 或跳过
  realtime-only / unsupported 内容后声称声音一致。
- 当前仍没有 half-pedal、repedaling 声学模型、damper resonance、pedal noise、release sample、
  Velocity Layer、Note Chase、Looped Clip Controller 展开、limiter 或物理钢琴建模。
- EQ3B 没有实现 WAV Backend、PCM 文件编码、实时 bounce、Normalization、Dither、进度或取消。
  Chromium 质量工具仍只是 developer-only 测试入口。

Expression Quality Integration V1 审核关闭后，剩余阶段按当前依赖回到 Workbench Action / Menu /
Shortcut、最小 Gesture / Semantic Layer、Velocity Editing，之后再实施依赖本契约的 WAV Offline
Export。错误隔离系统仍按已确认决定留作后续专项。
