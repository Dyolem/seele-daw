# @seele-daw/playback

播放核心：把 Project Snapshot 编译成播放计划，按 Transport 与 look-ahead 窗口决定每个 Voice 何时开始、
何时释放，播放中再按 Commit 的存储变化调和计划。它不依赖 DOM，也不创建 AudioNode；声音由实现
`PlaybackRuntimePort` 的后端发出，浏览器里是 [audio-web](../audio-web/README.md)。分层与依赖规则见
[ARCHITECTURE](../../ARCHITECTURE.md)。

## 结构

| 目录                 | 内容                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `compiler/`          | Snapshot → `AudibleMidiProjectPlan`：Track 路由、Note Span、CC64 的最终释放、诊断 |
| `time/`、`timeline/` | Tempo Map、Tick 与秒的换算、时间线范围                                            |
| `transport/`         | 停止 / 播放 / 暂停，位置映射，Locate 与 Return Anchor                             |
| `scheduler/`         | look-ahead 窗口：每个窗口里该开始的 Voice Plan                                    |
| `reconciliation/`    | 比较新旧计划：哪些 Voice 要切断、哪些只需改期、什么时候必须整体重来               |
| `engine/`            | `PlaybackEngine` 与运行时端口                                                     |

`sample-instrument-device.ts` 定义所有采样乐器共用的 Device（`seele.sample-instrument`，状态只有
`soundbankId`）；Studio Grand 是它的默认实例。

## 一次播放

```text
engine.load(snapshot)              编译计划，建立 Transport 与 Scheduler
engine.play()
→ runtime.prepare(plan, signal)    后端加载计划用到的乐器；第一次调用同时启动输出
→ transport.play()
→ 每 25 ms 唤醒一次                Scheduler 规划之后 200 ms 内该开始的 Voice Plan
    prepared.schedule(voicePlan)   → PlaybackVoice，或 null（不会发声）
Pause、Return、切换项目            runtime.allNotesOff()：所有 Voice 快速淡出
```

时钟只有一个，就是后端的 `runtime.now()`（浏览器里是 `AudioContext.currentTime`）。Transport 用它
映射位置，视图在动画帧里读取 Transport，不自己累计时间。自然结束不等尾音：Transport 到达时间线末端
就停止，尾音由后端放完。

## 运行时端口

`PlaybackRuntimePort` 描述一个音频输出，所有 revision 共用它（[ADR-006](../../docs/adr/ADR-006-one-audio-output-for-every-revision.md)）：

| 成员                             | 作用                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `prepare(plan, signal, options)` | 加载乐器，返回 `PreparedPlaybackPlan`：准备失败、没有 Zone 的音符和 `schedule` |
| `now()`                          | 输出时钟                                                                       |
| `allNotesOff()`                  | 所有 Voice 快速淡出                                                            |
| `dispose()`                      | 立即停止所有声音，释放输出                                                     |

`PlaybackVoice` 只有 `cancel`、`isActive` 与 `rescheduleRelease`。引擎只记住它可能还要调整的 Voice；
尾音、复音预算和节点回收都由输出负责。

开始播放时用 `FAIL_PLAN`，任何乐器加载失败都拒绝播放。播放中的编辑用
`SKIP_UNAVAILABLE_INSTRUMENTS`：加载失败的乐器静音并报告，其他 Track 继续。没有 Zone 的音符逐个
跳过；一个能响的音符都没有时，Play 不开始。

## 播放中的编辑

每个 Commit 都会让引擎重新编译计划，但编译按 Clip 记忆：Clip 记录和它的 Source 的音符、踏板数组
都没变时，沿用上次的 span 数组（Snapshot 共享没变的部分，见
[ADR-007](../../docs/adr/ADR-007-snapshots-share-unchanged-parts.md)）。计划只按 Clip 保存 span
（`clipSpans`），调和、Scheduler 与 audio-web 的资源准备都逐 Clip 工作，没变的 Clip 不必重新处理
（[ADR-009](../../docs/adr/ADR-009-playback-plans-keep-spans-by-clip.md)）。停止时不调和，直接换上
新计划。成本见 `pnpm --filter @seele-daw/playback bench`。

引擎读 Commit 的存储变化，不读命令类型（[ADR-002](../../docs/adr/ADR-002-consumers-read-changes-not-command-types.md)）。
同一个任务里的 Commit 合并成一次调和：

- 有 `tempoEvents` 变化：保留当前 Tick，按新 Tempo 重算秒数。正在播放就暂停并淡出所有 Voice，等
  下一次 Play。
- Commit 链有缺口、调和要求整体重来（例如 Master 变化），或者当前既没在播放也没暂停：按停止状态
  装入新计划。
- 其余情况做选择性交接：
  1. 被改动的 Track 和 Note 的 Voice 被切断。已经在响的 Note 若只改了结束点（Resize、CC64 编辑、Clip
     延长露出尾部），只改期它的释放。
  2. 重新 prepare 新计划。
  3. 取消还没开始的 Voice，由新计划从当前位置继续调度。已经越过起点的 Note 不会被追赶。

## 延伸阅读

- [Audible MIDI Scheduler 工作原理](./docs/audible-midi-scheduler-primer.md)：Compiler、Transport 与
  Scheduler 的协作和术语
- [MIDI Sustain Pedal CC64 Playback V1](./docs/midi-sustain-pedal-cc64-playback-v1.md)：踏板的追赶、
  排序与最终释放
- 已完成阶段：[Audible MIDI Playback V1](../../docs/archive/playback/audible-midi-playback-v1-phase-plan.md)、
  [Manual Timeline Locate V1](../../docs/archive/playback/manual-timeline-locate-v1-phase-plan.md)
- 尚未实现的方向（GraphPlan、Automation、Loop、跨线程 ACK）：
  [长期路线 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
