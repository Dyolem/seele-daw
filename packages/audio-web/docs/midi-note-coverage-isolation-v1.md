# MIDI Note Coverage Isolation V1

> Status: MI6A implementation pending review; full root check passed
>
> Date: 2026-09-04
>
> Scope owner: `@seele-daw/audio-web` resource preparation and Studio Playback Composition Root

本文定义总谱播放收口后的兼容性加固批次 MI6A。它解决一个具体问题：一份合法 MIDI 中只要有
一个 Note 没有命中当前音源控制文件的 Sample Zone，旧实现就会让整份 Playback 准备失败。新行为
只隔离该次 Note Occurrence，继续播放同一 Track 和其他 Track 中能够被当前音源覆盖的 Note。

相关名词见
[多乐器总谱发声 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)。本文中的
“未覆盖”只描述当前 Manifest 没有匹配 Zone，不判断该事件是不是 Keyswitch、鼓组扩展、错误音符
或超出演奏音域。

## 1. 用户可见行为

1. 合法 MIDI Pitch `0...127` 命中当前 Soundbank Manifest Zone 时，按既有资源、Envelope、Loop、
   Trigger、CC64 与复音政策播放。
2. 合法 Pitch 没有命中 Zone 时，只跳过对应的 Note Occurrence；它不会阻断其他可覆盖 Note，也不
   修改 Project Fact、Note 时长、Pitch 或 Track Instrument。
3. Studio 汇总显示 Warning，包含跳过的事件数以及最多六组 `soundbankId + MIDI Pitch + 次数`；
   它不逐音符弹出错误，也不猜测音乐语义。
4. 如果当前计划的全部 Note Occurrence 都未覆盖，资源准备仍成功，但 Transport 保持 Stopped，
   Play 返回未启动，并显示同一类 Warning。再次点击 Play 不重复下载或重新准备相同 Plan。
5. 当未来用户选择了真正覆盖这些 Pitch 的音源，或明确的版本化语义绑定把事件解释为受支持控制
   后，下一次 Plan / Runtime 准备会重新计算覆盖结果；原始 Note 没有被破坏，因此可以自动恢复。

## 2. 分层实现边界

```text
AudibleMidiProjectPlan
  -> Audio Web 按 Soundbank + Note Occurrence 分组
  -> 严格读取 Manifest
  -> 命中 Zone：收集并去重 WAV Resource Key
  -> 未命中 Zone：产生 no-matching-zone 结构化记录
  -> Browser Runtime 按 occurrenceKey 跳过已知未覆盖 Voice Plan
  -> Studio Coordinator 汇总 Warning，并继续调度其余 Voice
  -> Sample Voice Runtime 仍严格拒绝任何直接送入的未覆盖 Pitch
```

容错只发生在“已完成 Manifest 检查、准备交给 Voice Runtime”这一层。底层 Voice Runtime 不增加
最近邻 Sample、钳制 Pitch 或默认钢琴等回退；这样任何绕过准备层的错误调用仍会快速暴露。

结构化记录固定包含：

- `reason: no-matching-zone`；
- `occurrenceKey`，用于只隔离这一处计划事件；
- `trackId`、`soundbankId` 与原始 `pitch`，用于确定性汇总和未来定位。

它不包含 `keyswitch`、`GM2 percussion`、`out-of-range` 等推测标签。音频执行层没有足够证据作出
这些判断。

## 3. 失败与兼容矩阵

| 输入 / 状态                                  | MI6A 行为                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| 合法 Pitch，Manifest 有匹配 Zone             | 准备对应 Resource，并正常调度                                                  |
| 合法 Pitch，Manifest 无匹配 Zone             | 记录单个 `no-matching-zone` Occurrence，跳过该次调度                           |
| 同一未覆盖 Pitch 出现多次                    | 保留每个 Occurrence；用户反馈按 Soundbank / Pitch 计数汇总                     |
| 全部 Note 均未覆盖                           | 准备成功、保持 Stopped、显示 Warning，不进入 Failed                            |
| Pitch 不是整数或超出 `0...127`               | 仍以 `invalid-pitch` 失败；这不是兼容性缺口                                    |
| Manifest/WAV 缺失、损坏、跨源或超出资源预算  | 继续遵守既有首次 fail-fast / 选择性 Soundbank 隔离政策                         |
| 直接向 Sample Voice Runtime 调度未覆盖 Pitch | 继续抛出严格 `unsupported-pitch`，证明 Runtime 契约没有被放宽                  |
| 未支持 Program、未知 Device 或缺少 Engine    | 继续走既有 Placeholder / Missing Device / Runtime unavailable 边界，不混入本批 |

本批不修改 Project File schema，也不新增 History 步骤。Warning 是从当前不可变 Playback Plan 与当前
Manifest 派生的 Runtime 状态，不成为创作事实。

## 4. MIDI 语义证据的后续路线

Pitch 数值只能说明消息携带了哪个键号，不能单独证明它是音乐音符还是控制键。后续导入与设备协商按
以下顺序增加证据，不能反过来从越界结果猜含义：

```text
文件 / 容器识别
  -> 消息协议（MIDI 1.0 或 MIDI 2.0 UMP）
  -> 文件或设备明确声明的 Profile / Property / 厂商证据
  -> Profile 版本与适用 Channel / Group / Device 范围
  -> Seele MIDI Semantic Binding
  -> Project Fact、控制语义或仍保持 Unknown
```

`MIDI Semantic Binding` 是未来的内部中立契约，不等同于“MIDI 1.0 Interpretation Profile”：

- MIDI 1.0 文件可由明确 GM / GM2 / GS / XG、厂商或用户指定配置提供绑定证据；
- MIDI 2.0 文件可由 UMP、MIDI Clip 元数据或其他明确声明提供更丰富证据；
- 实时 MIDI-CI Discovery、Profiles 与 Property Exchange 属于设备会话能力，不能被当作 `.mid`
  文件版本位；
- 只有精确、版本化且范围唯一的绑定才允许自动把保留事件恢复为控制语义；证据不足时仍保持
  Unknown，不把所有低音 Note 一次性改成 Keyswitch。

因此 MI6A 只保证“未知事件不会拖垮已知声音”和“原始事实没有丢失”。它不预建完整 Articulation、
Drum Map、MIDI-CI 或 MIDI 2.0 平台。

## 5. 自动验证门禁

- Audio Web：混合覆盖 Plan 只加载命中 Zone 的唯一 WAV；重复的未覆盖 Pitch 保留逐 Occurrence
  记录；全未覆盖 Plan 只读取 Manifest；非法 Pitch 仍失败。
- Browser Runtime：只按精确 `occurrenceKey` 跳过已知未覆盖 Voice Plan；资源缺失仍按 Soundbank
  隔离；Voice Runtime 严格拒绝测试继续通过。
- Studio Coordinator：部分覆盖时进入 Playing、保持 `failureCause = null` 并显示汇总 Warning；
  全未覆盖时保持 Stopped、无 Timer / Generation / Voice，并复用已准备 Runtime。
- 包级 Type Check、Audio Web 与 Studio 全测试、根级 lint / build / 完整 `pnpm check` 作为本批
  最终审核门禁；不把这些自动测试写成人工试听结论。

2026-09-04 的最终 `pnpm check` 已通过：157 个测试文件 / 1,370 项测试，并通过 Architecture、
Workspace Quality、Format、Oxlint、ESLint、全工作区 Type Check、Studio Production Build 与
soundbank dist boundary。该结果验证调度和失败边界，不代表新增或改变任何采样音质，也不是人工
试听结论。

## 6. 明确延期

- MIDI Source Envelope 与导入证据持久化；
- 用户选择或编辑 Interpretation Profile / Drum Map / Articulation Map；
- Keyswitch、Program/Bank 时间线、CC1、CC11、Pitch Bend、Aftertouch、MPE；
- MIDI 2.0 UMP、MIDI Clip File、SMF2 Container 与实时 MIDI-CI 会话；
- 最近邻 Sample、自动八度移调或任何隐藏声音替换。
