# @seele-daw/audio-web

`audio-web` 是 Playback Core 的 Web Audio 执行后端，负责把浏览器无关的 RuntimeDelta、GraphPlan 和调度事件映射为 AudioContext、AudioNode、AudioParam 与 AudioWorklet 资源。

> 当前状态：仅完成 package 骨架和公开入口，尚未创建音频上下文或运行时图。

## 包定位

```text
@seele-daw/playback plans
-> Web Audio graph reconciler
-> main-thread scheduled native nodes
-> AudioWorklet event queue / DSP
-> audio output and runtime diagnostics
```

本包是可丢弃、可重建的运行时，不是项目事实源。它执行已编译计划，不读取 ProjectModel，也不解释 Editor Command。

## 主要职责

| 领域               | 规划职责                                                  |
| ------------------ | --------------------------------------------------------- |
| AudioContext       | 用户手势解锁、suspend/resume、latency 与设备生命周期      |
| Graph Runtime      | create/connect/ramp/bypass/reconnect/dispose              |
| Scheduler Executor | 提前调用 native node start/stop/automation                |
| Worklet Runtime    | Synth、Sampler、Meter、PCM Capture 与目标 frame 队列      |
| Device Runtime     | Instrument/Effect adapter、latency、tail、allNotesOff     |
| Voice Lifecycle    | 一次性 source、voice token、release、steal 和资源回收     |
| Diagnostics        | late event、underrun、queue depth、active voice/node 计数 |
| Offline Backend    | 后续阶段的冻结版本离线渲染和设备能力检查                  |

## 两级调度中的职责

规划层属于 [`@seele-daw/playback`](../playback/README.md)；本包实现执行层：

- 原生 AudioBufferSource/Oscillator/AudioParam 在主线程按 `AudioContext.currentTime` 提前排程；
- 自定义 Synth、Sampler、DSP 接收带 `targetFrame` 的批量 Worklet 事件；
- MessagePort 是正确性基线，SharedArrayBuffer 仅是 cross-origin isolated 环境下的优化；
- 两条执行路径共用 `engineGeneration`、`EventKey` 和测试向量；
- 收到旧 generation 的事件必须丢弃，迟到和溢出必须可观测。

## 建议的内部模块

```text
src/
├── context/        AudioContext、设备与生命周期
├── graph/          节点运行时和 Graph Reconciler
├── scheduler/      native node 与 Worklet 执行适配
├── devices/        instrument/effect runtime adapters
├── voices/         source、voice token 与 allNotesOff
├── worklets/       processor、协议与 bundle entry
├── recording/      后续 PCM capture runtime
├── offline/        后续离线渲染 backend
└── index.ts        主线程唯一公开入口
```

Worklet entry 必须保持独立，只导入实时安全的协议和 DSP 代码，不能通过根入口把应用层打入 Worklet bundle。

## 实时与资源规则

- AudioWorklet `process()` 禁止 DOM、Vue、IndexedDB、网络、JSON parse 和项目对象。
- 热路径使用预分配缓冲和有界队列，明确 overflow、late event 和 underrun 策略。
- Meter 可降采样和丢帧；Note、Transport 和录音 PCM 不得静默丢失。
- AudioBufferSourceNode 是一次性 Voice，不属于长生命周期 Graph。
- 参数更新优先短 ramp，替换节点使用安全边界或短交叉淡化，避免 click。
- 所有 listener、timer、MessagePort、AudioNode 和 voice 都必须可幂等 `dispose()`。
- 项目切换或关闭 AudioContext 前执行全局 `allNotesOff` 并核对资源计数归零。

## 依赖边界

- 只依赖 `@seele-daw/playback` 的公开计划和协议。
- 禁止依赖 `editor`、Vue、Pinia、项目持久化实现或 `apps/studio`。
- 禁止读取完整 ProjectModel；需要的全部语义由 Playback plans 提供。
- Tone.js 只能作为原型或叶子 Device Adapter，不能成为 Transport、Graph 或项目格式。
- 浏览器存储、文件和权限实现属于 `platform-browser`，由 Studio 组合根协作装配。

## 分阶段计划

1. 建立 AudioContext lifecycle、最小 master output 和资源统计。
2. 执行 MIDI Note 计划，提供简单 Synth 与可靠 `allNotesOff`。
3. 实现 look-ahead native executor、generation 丢弃和 late-event 诊断。
4. 增加稳定 Graph Runtime、Gain/Pan/Meter 和 Device contract suite。
5. 实现 Sampler、Audio Clip voice 与 Worklet 消息协议。
6. 后续加入 PCM recording、复杂 DSP/WASM 和 OfflineAudioContext 导出。

## 测试与验收

- 使用 fake clock/backend 验证节点开始、停止、取消和 generation；
- Graph reconcile 前后连接、参数和 dispose 状态一致；
- Worklet 协议版本、队列 overflow 和 MessagePort fallback；
- seek、stop、项目关闭后无残留 voice、node、listener 或 timer；
- Offline 与 realtime backend 的事件语义一致；
- 浏览器 E2E 验证 AudioContext interruption、设备切换和实际输出。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
