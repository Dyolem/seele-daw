# Audio Quality Foundation V1A 收口报告

> Status: Closed; AQ0–AQ4 reviewed and committed (`40c44a1`, `1b74d26`, `dfa2411`, `64118f7`, `9b4c0c9`)
>
> Date: 2026-08-26

本文汇总 Audio Quality Foundation V1A 的最终产品行为、自动门禁、听测状态、兼容边界与后续
依赖。指标定义见
[AQ0 基线与质量契约](./audio-quality-foundation-v1a-aq0-quality-contract.md)，行业词汇见
[V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。

## 1. 收口结论

V1A 在现有单层采样器范围内冻结以下生产政策：

| 领域         | 最终 V1A 行为                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Velocity     | 带 `-36 dB` 数学下限的平方增益响应；Playback 与 Project 继续保存原始 `1...127`。                  |
| 输出校准     | Project Master 之后独立应用 `-12 dB` 系统校准；不加入隐藏 limiter、compressor 或 soft clipper。   |
| Envelope     | 保留 Manifest attack/release；非零 shape 使用 32 段线性 ramp 近似。                               |
| Loop/Trigger | 保留 continuous、sustain、one-shot 与 directed mutex 的公开 Manifest 语义；不猜 crossfade。       |
| 快速释放     | Stop、Cancel、Generation、fast mutex 与 Voice Stealing 使用 `6 ms` 线性释放及 `1 ms` stop guard。 |
| Retrigger    | 不同 occurrence 保持独立 Voice Token 和 attack；相同 pitch 不做全局 choke。                       |
| Polyphony    | 每个 `instrumentDeviceId` 64 个发声槽、项目 Voice Runtime 128 个，另有最多 16 个分配器退场尾音。  |
| Overflow     | 退场预算已满时返回 `polyphony-dropped`；不硬切已有尾音，也不回滚合法 Project Commit。             |

最终生产政策标识冻结为：

```text
seele.audio-quality-foundation-v1a-aq3
```

AQ4 不改变声音算法，因此不虚构新的 `aq4` 音频政策版本。未来 WAV Offline Export 报告应记录上述
实际政策标识；在离线后端真正实现前，不为此扩大当前 package root API。

## 2. 自动与浏览器证据

| Gate                                 | 状态     | 证据                                                                                                |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------- |
| AQ0 fixture / 历史特征               | `passed` | 自有 48 kHz Float32 PCM、固定 Voice Plan、有限数值、资源清理与 dist 边界。                          |
| AQ1 Velocity / Headroom              | `passed` | 参考三和弦 `-16.321 dBFS`；10 Voice 相干压力 `-1.031 dBFS`；无满刻度帧。                            |
| AQ2 Envelope / Loop / Trigger        | `passed` | Envelope 与合成 loop seam 误差 `<= 1e-4` full scale；one-shot/mutex 行为和资源清理通过。            |
| AQ3 Retrigger / Polyphony / Stealing | `passed` | 10,000 Note On 精确得到 64 发声、16 退场、9,920 drop；项目第 129 Voice 维持 128 发声并 steal 1 个。 |
| Chromium `OfflineAudioContext`       | `passed` | Chromium 151、48 kHz、schema version 4；全部顶层检查为 `true`。                                     |
| Studio Grand 静态完整性              | `passed` | 本地确定性测量报告仍与当前 Manifest/WAV 输入一致。                                                  |
| 完整根级 `pnpm check`                | `passed` | Architecture、Workspace Quality、Lint、全工作区 Type Check、全部测试、Studio Build 与 dist 边界。   |

浏览器报告直接运行生产 `SampleInstrumentVoiceRuntime`；只在调度窗口适配
`OfflineAudioContext.state`。它不是第二套参考渲染器，也不是 WAV Export Backend。

完整测试基线为 137 个文件 / 1,219 项：Project Core 31 / 432、MIDI File 3 / 14、Platform Browser
3 / 23、Editor 11 / 112、Project MIDI 3 / 22、Playback 9 / 102、Audio Web 19 / 132、Studio
57 / 380、Type Utils 1 / 2。

## 3. 人工听测状态

| Listening Gate                         | 状态             | 解释                                                                                                 |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-08-13 Studio Grand 单音发声 smoke | `passed`         | 历史验证确认资源可加载、解码并用 `0.133 s` release 平滑结束；它早于 AQ1–AQ3，不代表最终 V1A 全矩阵。 |
| 最终 V1A level-matched Velocity A/B    | `not-run`        | 尚未由人在当前政策下完成五档 Velocity 与四种 Note length 的响度匹配比较。                            |
| 最大复音、快速同音与 steal 听感        | `not-run`        | 合成 PCM 指标通过，但尚未由人在开发者本地 Studio Grand 上判断 click、截断感或 pumping。              |
| 真实资产 loop seam                     | `not-applicable` | 当前 Studio Grand Zone 无 loop；合成门禁只证明 Runtime 不额外制造接缝。                              |

`not-run` 不伪装成通过，也不阻断已经可自动证明的 Runtime 安全收口。若后续试听发现问题，必须形成新的
可审阅音频政策版本与同一套数值回归，不能静默改常数。

## 4. 兼容与失败边界

- AQ1 有意改变旧项目的听感，但不修改 MIDI Velocity、Track Gain、Master Gain、Project File 或
  History；不需要 Project schema migration。
- AQ2/AQ3 只改变可重建的 Audio Runtime 执行政策；modelRevision、engineGeneration 和持久化
  sequence 仍相互独立。
- Playback 继续传递浏览器无关 Voice Plan；Velocity 曲线、Web Audio Envelope 与复音分配器不下沉
  到 Playback 或 Project Core。
- 未知 Device 继续保存并显示 Missing Device；V1A 不静默替换音源。
- 资源、decode、graph 或 schedule 失败不回滚合法 Project Commit；`polyphony-dropped` 是运行时
  未接纳诊断，不是项目编辑失败。
- V1A 收口范围本身没有 Velocity Layer、CC64、half-pedal、resonance、release sample、pedal noise、
  物理钢琴建模或用户可见 Meter。后续独立 CC64 批次已接通二值导入与最终 Gate Release，但没有
  改写 V1A 的冻结音质政策，也没有补齐其余高级钢琴模型。

## 5. 后续依赖

下一阶段保持已批准顺序：

```text
Workbench Action / Menu / Shortcut
-> Minimal Gesture / Semantic Layer
-> Velocity Editing
-> Sustain Pedal CC64
-> expression quality integration gate
-> WAV Offline Export
```

CC64 基础播放完成后、WAV Export 开始前仍必须重新验证 pedal-held Voice 的优先级、同音重触发、
Pedal Up release、Locate/Seek controller chase、peak/headroom 和导出结尾收尾。V1A 冻结政策
本身不能被描述为包含 Sustain Pedal；产品能力必须以独立 CC64 契约及实际集成门禁为准。
