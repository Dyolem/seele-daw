# ADR-006：所有 revision 共用一个音频输出

- 状态：Accepted
- 日期：2026-10-24
- 实施：与本文同一提交

## Context

播放运行时原本按 plan revision 分代。每次 `prepare` 返回一个 `PreparedPlaybackRuntime`，它有自己的
时钟、Voice、`allNotesOff`、`advanceGeneration` 与 `dispose`；Studio 每准备一次就新建一个
`SampleInstrumentVoiceRuntime`。播放中编辑时，旧 revision 的 Runtime 被“退役”，引擎的
`VoiceLedger` 每 25 ms 扫描它的 Voice，等尾音结束再 dispose。

这让同一件事分散在三个地方：

- Generation 记了三份（Transport、Scheduler、Voice Runtime）。引擎用 8 处 `advanceGeneration` 让
  audio-web 跟上；Voice 以 `(engineGeneration, occurrenceKey)` 为 token，Studio 再用 token 包出 handle。
- 复音预算按 Runtime 计算：handoff 之后，旧 revision 的尾音和新 revision 的 Voice 各有一份 64 / 128
  个发声槽。`allNotesOff` 也只管一个 Runtime，暂停与停止时引擎要逐个处理退役的 Runtime。
- 为了回收退役 Runtime，暂停、停止之后引擎仍要每 25 ms 唤醒，直到尾音结束。
- Studio 用 230 行把 audio-web 的类适配成端口，准备结果的类型在两个包里各写一套（audio-web 复盘
  3.1、3.2）。

## Decision

1. 一个应用只有一个输出：AudioContext、master、解码缓存和一个 Voice 池。第一次 `prepare` 时创建，
   `dispose` 时释放。所有 revision 的 Voice 都在这个池里，复音预算、偷 Voice 与 `allNotesOff` 覆盖
   全部 Voice。
2. `PlaybackRuntimePort` 描述这个输出：`prepare`、`now()`、`allNotesOff()`、`dispose()`。`prepare` 只
   加载 Plan 用到的乐器，返回 `PreparedPlaybackPlan`：准备失败、没有 Zone 的音符，以及
   `schedule(voicePlan) → PlaybackVoice | null`。准备结果没有生命周期；换 revision 只是换一张乐器表。
3. `PlaybackVoice` 就是 audio-web 的 Voice：`cancel`、`isActive`、`rescheduleRelease`，都不返回结果。
   `schedule` 返回 null 表示这个 Voice 不会发声：已经过期、没有 Zone，或被复音预算丢弃。
4. 没有 generation，也没有 token。handoff 时，引擎只取消或改期需要改的 Voice，其余的自然结束。
   引擎只记住自己还在跟踪的 Voice；一个都没有时，`allNotesOff` 不调用输出。Voice Plan 不再携带
   `engineGeneration`；Transport 的 generation 只供 Scheduler 识别映射变化。
5. audio-web 自己实现端口。`createWebAudioPlaybackRuntime({ assetBaseUrl, expectedOrigin, limits })`
   是包里唯一公开的函数。Studio 的适配层删除，Studio 只提供目录给出的资产地址与资源预算
   （`workbench/instrument/built-in-sample-assets.ts`）。

## Consequences

- 删除 `VoiceLedger`、Runtime 退役、`advanceGeneration` 与 Studio 的 `browser-runtime.ts`。非测试代码
  净减约 850 行；`voice-runtime.ts` 从 1,117 行降到 764 行，`prepare-plan-resources.ts` 从 322 行降到
  151 行，audio-web 的公开入口从 23 个符号降到 1 个函数。
- 尾音完全由输出负责：暂停、停止、Return 和 Tempo handoff 各调用一次 `allNotesOff`，Voice 以 6 ms
  快速释放淡出，source 的 `ended` 事件回收节点。暂停与停止之后引擎不再唤醒。
- handoff 前后的 Voice 共用 128 个发声槽和 16 个退场尾音，偷 Voice 可能偷走旧 revision 仍在响的尾音。
  这才是复音预算本来的含义。
- 主音量只在 Voice Plan 带来不同的值时设置一次，不再每个音符设置一次。
- 播放中每次编辑仍会重新 prepare 整个 Plan。乐器已经缓存，剩下的成本是逐个音符找 Zone，大项目下
  还没有测过。
- 引擎的行为测试仍在 Studio 的 coordinator spec 里，跑在一个单输出的假实现上。下一步把它们移进
  playback。

## Validation

- `voice-runtime.spec`（24 个用例）：Voice 的取消、改期，以及结束后不再响应；同一 occurrence 的两个
  Voice 互不影响；过期计划与没有 Zone 的音高返回 null；复音预算；主音量只在变化时设置；dispose
  之后 `schedule` 抛错，`allNotesOff` 不做任何事。
- `web-audio-playback-runtime.spec`：从 Studio 移入，覆盖共享缓存、未覆盖音符、选择性失败、重试与中止。
- `project-playback-coordinator.spec`：
  - 过期的准备结果从未调度过 Voice；
  - 暂停后的编辑不改动正在淡出的 Voice；
  - 自然结束时尾音不被切断，引擎不再唤醒，再次播放复用同一个准备结果；
  - Voice 都已淡出时，Return 不再调用输出。
- `pnpm check` 全部通过（playback 107、audio-web 163、Studio 694 个测试）。

## Revisit Trigger

- 需要第二个输出，例如独立的试听总线，或离线导出与实时播放同时进行：每个输出各自一个端口实例，
  而不是恢复按 revision 分代。
- 引擎需要知道某个 Voice 属于哪个 revision，例如跨线程 ACK：把 revision 记在引擎跟踪的 Voice 上，
  而不是让输出理解 generation。
