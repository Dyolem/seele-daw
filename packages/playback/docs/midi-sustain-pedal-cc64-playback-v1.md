# MIDI Sustain Pedal CC64 Playback V1

> 状态：导入、Playback、Audio Runtime 与 Studio 选择性重协调已提交为 `3ff2853`
>
> 日期：2026-08-31

本文记录 Seele 第一版延音踏板播放契约。它只回答一件事：Standard MIDI File 中已经存在的
MIDI CC64 数据，如何作为独立 Project Fact 导入，并在播放时延后已经松键的声音。Controller
Lane、半踏板、钢琴共鸣与额外松键采样不属于本批次。

Project Core 的事实与命令契约见
[MIDI Sustain Pedal CC64 Project Fact V1](../../project-core/docs/midi-sustain-pedal-cc64-project-fact-v1.md)；
音频行业词汇的集中解释见
[Audio Quality Foundation V1A 术语表](../../audio-web/docs/audio-quality-foundation-v1a-glossary.md)。

## 术语与时间边界

| 中文术语     | 英文 / 源码名称                    | 本批次中的含义                                                                 |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------ |
| 按键释放     | Key Release / Note Off             | MIDI Note 自己记录的松键时间；Clip 边缘裁剪后写入 `endTick`。                  |
| 踏板保持声部 | Pedal-held Voice                   | 已经按键释放，但对应 Channel 的 CC64 仍为按下，因此尚未进入最终释放的 Voice。  |
| 最终发声释放 | Final Gate Release / `releaseTick` | 踏板不保持时等于按键释放；保持时等于后续 Pedal Up，最迟不超过 Clip 末端。      |
| 控制器追赶   | Controller Chase                   | 从 Clip 中途或时间线中途开始计算时，读取当前位置之前最后生效的 CC64 状态。     |
| 发声释放时间 | `releasePlaybackClockSecond`       | Scheduler 把 `releaseTick` 换算到 Playback Clock 后交给 Audio Runtime 的时间。 |

`endTick` 与 `releaseTick` 必须保持分离。前者保存乐谱中的 Note Off，后者是当次 Clip 出现实例的
派生播放结果。踏板编辑不会改写 Note Duration，也不会制造额外 Project History 中的 Note 修改。

## Standard MIDI File 导入

- 只导入 Controller Number `64`；原始整数值 `0..127` 与 Track Channel 原样保留；
- `value >= 64` 为 Pedal Down，`value < 64` 为 Pedal Up；本批次不连续解释中间值；
- CC64 与 Note 使用同一 PPQ 换算。若多个来源事件四舍五入到同一 Project Tick，按来源 Tick 和
  来源事件顺序确定性保留最后一条，并产生 `SUSTAIN_PEDAL_EVENTS_COLLAPSED` 诊断；
- 含 Note 的 normalized Track 会同时导入自己的 CC64。只有控制器、没有 Note 的 Track 仍不创建
  Instrument Track，并产生明确诊断；
- CC64 可以扩大导入 Clip 的前后内容边界，但不会把任何 Note 的时长改长；
- 其他 CC、Pitch Bend、Program、非零 Release Velocity 等仍按既有未支持事实诊断处理。

Project MIDI Export Bridge 尚未实现，因此当前没有把 Project CC64 写回 Standard MIDI File 的
产品入口。

## Playback 编译与确定性排序

每个 Source、Channel 分别建立 CC64 时间线。对一枚 Note：

1. 先计算 Clip Source Window，并把 Note Off 裁剪到窗口末端；
2. 查找该 Channel 在 Note Off Tick 当时的踏板状态；同 Tick 的 CC64 先于 Note Off 生效；
3. 若踏板为抬起，`releaseTick = endTick`；
4. 若踏板为按下，寻找窗口内下一枚 Pedal Up；找到则以它作为 `releaseTick`，否则在 Clip 末端
   强制形成最终释放边界；
5. 不同 Channel 的状态互不影响。

Compiler 会验证每个 Source 都有踏板分区，并拒绝同一 Source / Channel / Tick 的重复事实。
Project Core 正常快照不会产生这种重复；验证用于让伪造或损坏的 Snapshot 失败关闭。

当前 Looped MIDI Clip 仍整体不进入可听编译，因此本批次没有宣称完成跨循环的踏板状态展开。
非循环 Clip 采用半开 Source Window；位于终点的 CC64 Fact 可以保存和往返，但不会把声音延长到
Clip 之外。

## Locate、迟到调度与 Note Chase 边界

Controller Chase 是编译时派生：即使 Pedal Down 位于 Clip 可听窗口或当前 Scheduler Anchor
之前，它仍能决定后续 Note Off 是否保持。Scheduler 同时携带按键释放时间与最终发声释放时间。

这不等于 Note Chase。Locate 到一枚已经开始的长 Note 中间时，当前 Scheduler 仍不会补发这枚
Note On；只有 Locate 后实际被调度的 Note 才使用已经追赶到的 CC64 状态。迟到唤醒已经越过
Note On、但尚未越过最终释放时，可以按既有 `late-immediate` 政策立即开始。

## Audio Runtime 与音源控制文件

Audio Runtime 只执行 Playback 给出的最终 Gate Release，不读取 Project CC64，也不自行猜踏板
状态。最终释放仍服从每个 Zone 在 Manifest 中明确声明的行为：

- **无 Loop（no-loop）**：素材可以在踏板抬起前自然播放完；Runtime 不伪造循环；
- **连续循环（continuous loop）**：按控制文件规则在 release 阶段继续循环，直到 Voice 完成；
- **延音循环（sustain loop）**：保持 Gate 时继续循环，最终 Gate Release 后退出循环并进入素材
  尾部；这里的 Sustain Loop 仍不等于 CC64；
- **单次触发（one-shot）**：继续遵守 one-shot 自然结束政策，不因 CC64 被强制改成 gated；
- Envelope、Mutex、Velocity Range、Zone 选择、Voice Stealing 与资源回收政策均保持原契约。

Studio Grand 当前控制文件没有 Sample Loop，所以 CC64 最直接的效果是推迟包络 Release；若素材
本身先自然结束，踏板不会凭空补出声音。其他乐器若声明 Loop 或不同 Envelope，Runtime 会按其
各自 Manifest 执行，不使用 Studio Grand 的硬编码参数。

## 播放中编辑与失败边界

已有 CC64 Project Command 进入 Studio Playback Coordinator 的选择性 Reconciliation：Add、
Move、Remove 与 Replace Value 会重新编译受影响 Source 的 occurrence。已经开始且仍活动的 Voice
只重排最终释放时间；不相关 Voice 不执行全局 `allNotesOff`。当前 CC64 Controller Lane 已复用
这条路径，并保持一次手势只提交一个 Project Command / History 步骤。

以下能力仍明确延期：

- CC64 精确数值输入、批量 Value 变换、可见播放态踏板指示与通用 Controller Lane 平台；
- Looped MIDI Clip 的跨循环 Controller 展开与 Note Chase；
- half-pedal、repedaling 的连续声学模型、damper resonance、pedal noise 与 release sample；
- Project MIDI Export Bridge、Studio MIDI Export UI 与 WAV Offline Export；
- CC64 以外的通用 CC、Pitch Bend、Aftertouch、MPE 与 Automation 平台。

这些限制不影响保存原始 CC64 值，但禁止把当前能力描述为完整钢琴物理模型或完整 MIDI 控制器
实现。

## 本批次验证范围

自动测试覆盖：CC64 导入、PPQ 碰撞诊断、Channel 隔离、同 Tick 顺序、窗口前状态追赶、Clip
终点释放、Scheduler 的双释放时间、选择性 Reconciliation，以及 no-loop / continuous loop /
sustain loop / one-shot 对最终 Gate Release 的执行。

本批次不把代码级时间测试冒充人工听测。Controller Lane 完成后、WAV Export 开始前，仍需执行
表达力集成质量门禁，复核 Pedal Up click、release tail、复音峰值、Voice Stealing、停止 / Locate /
设备替换资源清理，以及实时与离线语义一致性。EQ1 Voice Stealing 与 EQ2 Chromium PCM 已分别提交
为 `f47bf38`、`3c29bc9`；EQ3 正在收口 Transport、重协调与确定性尾音所有权。
该门禁由
[Expression Quality Integration V1](../../audio-web/docs/expression-quality-integration-v1-phase-plan.md)
独立跟踪。
