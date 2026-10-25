# 产品功能变更记录与阶段基线

这里是 [PRODUCT](../../../PRODUCT.md) 在 2026-10 之前维护的功能变更记录与各阶段的验证基线，
已不再更新。表中提到的命令、Delta、generation 与文件版本可能已经不存在；现状以 PRODUCT、
[ARCHITECTURE](../../../ARCHITECTURE.md) 与 [ADR](../../adr/README.md) 为准。

## 功能变更记录

| 日期       | 功能编号                                                   | 变化                                                                                                                                                             | 提交                                       |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 2026-07-22 | `PROJECT-ENTRY`、`PROJECT-LIFECYCLE`、`PROJECT-NAVIGATION` | 完成 Active Project、IndexedDB Recent Projects、导航确认及 Composition Root 基础。                                                                               | `5ea1256` 阶段基线                         |
| 2026-07-23 | `PROJECT-ENTRY`、`WORKBENCH-SHELL`、`UI-FOUNDATION`        | 接入真实路由、Piano Black Project Entry、导航 Dialog 与 Workbench Shell。                                                                                        | `cae096b`、`f205333`、`a841205`            |
| 2026-07-24 | `TRACK-CREATE`、`UI-FOUNDATION`                            | 完成 Instrument Track Command、应用协调、Add Track 菜单与 Toast。                                                                                                | `580884b`—`681880d`                        |
| 2026-07-27 | `TRACK-SELECTION`                                          | 完成项目作用域 Track Selection、新建自动选择及 Workbench 联动。                                                                                                  | `ea1f7f5`                                  |
| 2026-07-27 | 文档基线                                                   | 首次汇总当前产品功能、内部能力、限制与持续维护规则。                                                                                                             | `f2abf53`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`                                         | 确认创建交互与默认事实；Project Core 完成空 Clip 所有权图 Command、Delta、History 和 QueryIndex 语义。                                                           | `6e6f6bb`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`                                         | Studio 完成小节吸附、产品默认值协调、Composition Context 与 Clip Selection。                                                                                     | `2f43690`                                  |
| 2026-07-27 | `MIDI-CLIP-CREATE`、`CONTEXT-EDITOR-DOCK`                  | Arrangement 接入空 Clip 创建、视觉、选择、打开和错误反馈；Dock 显示 Clip 上下文。                                                                                | `99d9001`                                  |
| 2026-07-27 | `PIANO-ROLL`                                               | Editor Common 完成非循环 Clip Context、Viewport 坐标与 Query/Subscription Note Read Model。                                                                      | `15edc39`                                  |
| 2026-07-27 | `PIANO-ROLL`                                               | Editor Browser 完成 Canvas Grid、Note Scene 与 DOM / Canvas Adapter。                                                                                            | `b888a78`                                  |
| 2026-07-27 | `PIANO-ROLL`、`CONTEXT-EDITOR-DOCK`                        | Studio Dock 默认接入 keyed DOM Note 与真实 Project Query / Subscription。                                                                                        | `f3778f0`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Common 完成 Clip-scoped Note Selection Session、权威存在性校准与第三阶段交互计划。                                                                        | `054377d`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Browser 完成 Surface 级 DOM Hit、Primary Pointer Capture、CSS Pixel Input 与 Drag Threshold。                                                             | `007c24e`                                  |
| 2026-07-28 | `KEYBOARD-SHORTCUTS`                                       | Studio 完成 Scoped Action Coordinator、TanStack Browser Adapter，以及 Workbench Save / Undo / Redo Binding。                                                     | `cdf9577`                                  |
| 2026-07-28 | `KEYBOARD-SHORTCUTS`                                       | 集中默认 Keymap、强类型 Binding 和动态输入 Validation；用户设置面板仍未实现。                                                                                    | `378c253`、`659b8c4`                       |
| 2026-07-28 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS`                         | Studio 接入 Clip-scoped Note Selection、共享 selected Scene、Pointer Click 与 focused Escape。                                                                   | `f9d7fe7`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | 第四阶段显式定义 Pencil / Cursor、Snap、Note 创建结果与失败规则；Editor Common 建立共享 Timeline Grid Snap。                                                     | `cc3bbb5`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Studio 建立 Project MIDI Note Coordinator、默认 Note Facts、Clip / Source 校验与 Typed Vue Context；尚未接入可见创建手势。                                       | `df66936`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Studio 建立应用生命周期级 Pencil / Cursor、Snap 与 `1/16` Grid Preference Store；Canvas Grid 消费同一 Preset。                                                   | `67509d8`                                  |
| 2026-07-28 | `PIANO-ROLL`                                               | Editor Common 完成 Pencil Note Placement；Studio 接入可见 Tool / Snap、Add Note、创建后 Selection、失败 Toast 与 History 回归。                                  | `6cba7d2`                                  |
| 2026-07-29 | `PIANO-ROLL`、`UI-FOUNDATION`                              | Pencil Snap 改为当前 Grid 单元左边界；Snap 沿用 Fluent Grid；Toast 改为应用级命令触发与单一声明式 Region。                                                       | `1bc6dac`                                  |
| 2026-07-29 | `PIANO-ROLL`、`KEYBOARD-SHORTCUTS`                         | 明确 Cursor Move、Cursor / Pencil Resize 归属；接入多 Note 原子删除、Delete / Backspace、Selection 校准与失败 Toast。                                            | `52dc03c`                                  |
| 2026-07-29 | `MIDI-NOTE-CORE`                                           | 单个与多个 Note 删除统一为数量无关的 `midi-note.remove` 集合协议，移除重叠的单 Note Command。                                                                    | `df4cdf3`                                  |
| 2026-07-29 | `MIDI-NOTE-CORE`、`PIANO-ROLL`                             | Batch 5.2 统一共享 Delta 的 `MoveNotesCommand`；接入 Cursor Selection Move、Absolute / Relative Snap、冻结 Preview、Guide、Escape Cancel 与单 Commit / History。 | `2535db4`                                  |
| 2026-07-29 | `PIANO-ROLL`                                               | Note Move Snap 统一改为由绝对目标时间解析当前 Grid Coordinate；Off-grid Note 不再保留旧 Resolution 或自由移动偏移。                                              | `494b9de`                                  |
| 2026-08-10 | `PIANO-ROLL`                                               | 引入框架无关 Pointer Interaction Session，统一 Click / Add / Move 状态生命周期、动态 Alt、Window blur、显式取消与权威 revision 交接。                            | `94c3b54`                                  |
| 2026-08-10 | `MIDI-NOTE-CORE`                                           | Batch 3A 建立单 Note `ResizeNoteCommand`、最终几何验证、No-change、Note Update Delta 与 Undo / Redo；尚未接入 Studio。                                           | `0564669`                                  |
| 2026-08-10 | `PIANO-ROLL`                                               | Batch 3B 建立 Cursor / Pencil 单 Note Resize Gesture、左右 Edge 几何、Absolute Grid Snap、Source 边界、Preview、Intent 与 Interaction Session 分支。             | `aac0b20`                                  |
| 2026-08-10 | `MIDI-NOTE-CORE`、`PIANO-ROLL`                             | Batch 3C 接入 DOM 左右 Edge Hit、Resize Scene / Guide、Studio 单次 Command、Selection、Toast、权威 revision 交接与 Undo。                                        | `b7772b1`                                  |
| 2026-08-11 | `INSTRUMENT-SELECTION`                                     | Project Core 建立 Instrument Device Replace、No-change、Delta、History、QueryIndex 与持久化回归。                                                                | `6b172d9`                                  |
| 2026-08-11 | `TRACK-CREATE`、`INSTRUMENT-SELECTION`                     | Playback 建立 Studio Grand Definition；新 Track 默认持久化选择，旧空 Slot 可从持续可见的 Inspector 显式选择，并显示 Missing 与失败反馈。                         | `88ce879`                                  |
| 2026-08-11 | Playback TempoMap                                          | 建立浏览器无关的多 Tempo Segment、Tick / Project Second 双向换算与严格时间错误边界。                                                                             | `b077dba`                                  |
| 2026-08-11 | Audible MIDI Compiler                                      | 建立通用 MIDISampleSynth Device schema、冻结 Track / Note Span 计划、稳定 occurrence key、unsupported content policy 与中性 Arrangement 范围。                   | `ac1cc31`                                  |
| 2026-08-11 | Audible MIDI Transport                                     | 建立注入单调时钟的 stopped / playing / paused 映射、独立 generation、自然结束与双向调度时间换算；尚未接入 Studio 或声音。                                        | `ae87ca4`                                  |
| 2026-08-12 | Audible MIDI Scheduler                                     | 建立连续半开 look-ahead 窗口、冻结 Sample Voice Plan、generation / occurrence 去重、迟到立即开始与过期丢弃；尚未执行声音。                                       | `145b3ab`                                  |
| 2026-08-13 | Audio Web Sample Resource Preparation                      | 按稳定 Playback Plan 准备实际引用的 Manifest/WAV，建立同源边界、byte budget、并发去重、取消、失败重试和应用生命周期解码缓存；尚未接入 Studio。                   | `dc8ccfd`                                  |
| 2026-08-13 | Audio Web Sample Voice Runtime                             | 建立用户激活的 AudioContext、master output、Manifest 驱动的 Pitch/Envelope/Loop/Mutex Voice、generation/cancel/allNotesOff 与零残留资源统计；已通过审阅。        | `772210f`                                  |
| 2026-08-13 | `PLAYBACK`、`KEYBOARD-SHORTCUTS`                           | Studio 组合 Compiler、Transport、Scheduler、资源准备与 Voice；接通 Play/Pause/Return、Space、时间、Loading/失败反馈和清理；已通过功能审核。                      | `7242a52`（核心）与本次 UI 提交            |
| 2026-08-14 | `PLAYBACK`                                                 | 建立完整 Plan Reconciliation、Transport 原位 handoff 与 generation/断音解耦的选择性 Voice 生命周期。                                                             | `33a9ea0`、`365044b`、`475d32c`            |
| 2026-08-14 | `PLAYBACK`                                                 | Studio 接入 Commit 顺序、Note / Track / Clip / Instrument 选择性生效、按 Soundbank 局部资源失败，以及 stale/gap/Pause/项目切换回归；Batch 6A–6F 已通过统一审核。 | `2729357`、`a730119`、`dfbddce`            |
| 2026-08-14 | `WORKBENCH-SHELL`                                          | Arrangement Track 控制行与 Lane 改为单一纵向滚动权威，固定标题区并保持逐行水平对齐。                                                                             | `42e5a0b`                                  |
| 2026-08-17 | `PIANO-ROLL`                                               | 建立 Track 全局 Read Model、原子 Clip / Note 放置、Track-time Surface，以及不写 Project Fact 的 Track / Clip Focus 可见切换。                                    | `5e50228`、`113aabb`、`4d935fd`、`ea87d53` |
| 2026-08-17 | `PIANO-ROLL`、`PLAYBACK-VIEW`                              | Track 与 Clip Focus 共用权威 Transport 视觉位置；Track 增加 transform-only Playhead、独立分页 Follow 与手动导航暂停。                                            | `78ee8ea`                                  |
| 2026-08-17 | `PLAYBACK`、`PLAYBACK-VIEW`                                | 完成后台视觉恢复、Timeline / Transport、生命周期与资源清理证据审计；Audible MIDI Playback V1 全部批次通过审核并收口。                                            | `f1d0298`                                  |
| 2026-08-18 | `TIMELINE-LOCATE`、`PLAYBACK`                              | 建立 Ruler 点击 / 静默拖动、连续边缘滚动、键盘 / ARIA、播放中安全重调度、Return Anchor、Follow 恢复及纵向可见 Playhead；已通过统一审核与用户浏览器验证。         | `2b89595..f4cb601`                         |
| 2026-08-20 | `MIDI-IMPORT`                                              | 完成 Project Entry 导入纵向切片，并在 Workbench 项目菜单与 Arrangement 末尾增加明确的“导入为新项目”入口及 dirty 导航保护。                                       | `fca1c49`、`2b95ee9`                       |
| 2026-08-24 | `TEMPO-CONTROL`                                            | Studio 接通单 Tempo 主控精度显示、数值编辑、播放中自动 Pause、History 与多 Tempo 当前值只读投影。                                                                | `554c2f9`                                  |
| 2026-08-24 | `TEMPO-TRACK`                                              | Project Core 完成 Tempo Event Add / Move / Remove 生命周期；Playback 对全部 Tempo Change 使用保留连续 Tick 的完整 handoff。                                      | `003b557`、`a2a2092`                       |
| 2026-08-24 | `TEMPO-TRACK`                                              | Studio 增加固定 Tempo Track、事件选择、双击新增、单轴拖动、精确数值编辑、删除、失败反馈与 Composition Root ID 协调。                                             | `f62f384`                                  |
| 2026-08-24 | `TEMPO-TRACK`                                              | MT4A 区分 `5..999` 领域范围与 `40..240` 默认视图，统一 Studio 编辑精度，并建立按 Project 重置、同一 Project 内只扩不缩的瞬态纵轴。                               | `254c46b`                                  |
| 2026-08-24 | `TEMPO-TRACK`、`TIMELINE`                                  | MT4B 为所选 Tempo Event 提供音乐位置 / 多 Tempo 绝对时间、前后事件导航和不移动 Playhead 的显式居中定位，并在播放中暂停 Follow。                                  | `c0a7554`                                  |
| 2026-08-24 | `TEMPO-TRACK`                                              | MT4C 以水平段和垂直过渡段绘制连续 Step 轮廓，增加线段命中、重叠点最近选择、所选层级及近点双击保护，不引入 ramp 或事件简化。                                      | `b0bacbe`                                  |
| 2026-08-25 | `TEMPO-TRACK`                                              | MT4C 视觉修正把节点中心精确锚定到 Tick / BPM，改用紧凑菱形并弱化垂直跳变；保留真实 Step 阶梯，不把离散事件伪装成 Linear / Ramp 折线。                            | `9eb7855`                                  |
| 2026-08-25 | `TEMPO-TRACK`                                              | MT4D 增加 BAR / BEAT / OFFSET 组合位置输入与 TIME 标签，保留网格 / Timeline 校验、无变化短路和单次 Move Command；初始位置只读。                                  | `31b5040`                                  |
| 2026-08-25 | `TEMPO-TRACK`                                              | MT4E 由 Arrangement 持有 feature-scoped 交互控制器，令轨道拖拽与左侧 BPM / 位置 / TIME 共用瞬时预览；取消不写事实，松手只交接一次既有命令。                      | `31b5040`                                  |
| 2026-08-25 | `TEMPO-CONTROL`、`TEMPO-TRACK`                             | MT5 收口 Project Tempo Control V1 已交付范围，集中记录曲线、多事件工具、Time Signature / SMPTE 编辑和通用 Automation 平台等延期边界。                            | `147b376`                                  |
| 2026-08-26 | `AUDIO-QUALITY`                                            | AQ0–AQ3 建立合成 PCM 基线、平方 Velocity / `-12 dB` 输出校准、Envelope/Loop 门禁，以及 64/128/16 有界复音、确定性 Voice Stealing 与溢出诊断。                    | `40c44a1`、`1b74d26`、`dfa2411`、`64118f7` |
| 2026-08-26 | `AUDIO-QUALITY`                                            | AQ4 冻结最终 V1A 政策标识、综合 Chromium 门禁、听测状态、兼容/失败边界及 CC64 后表达力集成门禁；未把开发报告冒充 WAV Export Backend。                            | `9b4c0c9`                                  |
| 2026-08-28 | `MIDI-CC64`                                                | Project Core 建立独立 CC64 Fact、命令、事务、Delta、Project File V2 与 V1 迁移；不把踏板状态烘焙进 Note Duration。                                               | `d6fa7f4`                                  |
| 2026-08-31 | `MIDI-IMPORT`、`PLAYBACK`、`MIDI-CC64`                     | 接通 CC64 导入、Channel 状态追赶、按键释放 / 最终 Gate Release、Manifest-aware Audio Runtime 与播放中选择性重协调；高级钢琴模型仍延期。                          | `3ff2853`                                  |
| 2026-08-31 | `EDITOR`、`MIDI-CC64`                                      | 建立 CC64 Clip / Track Lane Read Model、Value Viewport、Semantic Hit / Pointer 与只解析完成空白 Click 的 Pencil Placement Foundation。                           | `2fb0764`                                  |
| 2026-08-31 | `PIANO-ROLL`、`MIDI-CC64`                                  | 接入 Track / Clip Focus 可见 Lane、Channel Preference、显式 Active Clip 写入、单 Command Add、Terminal Marker 与可见失败；高级 Event 编辑仍延期。                | `a1f4e5e`                                  |
| 2026-09-01 | `EDITOR`、`MIDI-CC64`                                      | 建立显式 Active Clip 编辑作用域、Event Selection / Remove Target、主导轴批量 Move / 单 Event Replace Value、Preview 与 authority handoff；Studio 尚未接入。      | `0ed4523`                                  |
| 2026-09-02 | `PIANO-ROLL`、`MIDI-CC64`                                  | Studio 接入瞬态 Selection、Marker Preview、单 Command Move / Replace Value / Remove、authority handoff 与按聚焦编辑目标路由的既有 Delete / Escape Action。       | `210f2c9`                                  |
| 2026-09-02 | `AUDIO-QUALITY`、`MIDI-CC64`                               | Expression EQ1 让复音分配器先退场 release-started、再退场 key-released / pedal-held，最后才选择 key-held Voice；不改变 64 / 128 / 16 预算。                      | `f47bf38`                                  |
| 2026-09-02 | `AUDIO-QUALITY`、`MIDI-CC64`                               | Expression EQ2 将 CC64 合成 PCM 场景加入 schema version 5 Chromium 门禁；人工听测仍未运行。                                                                      | `3c29bc9`                                  |
| 2026-09-02 | `AUDIO-QUALITY`、`PLAYBACK`                                | Expression EQ3A 在 Paused / Stopped 尾音结束后确定性清理 Studio 所有权，不改变声音。                                                                             | `5ef34a5`                                  |
| 2026-09-02 | `AUDIO-QUALITY`、`PLAYBACK`                                | Expression EQ3B 区分编排内容、交互 Timeline 与音频输出渲染终点，冻结未来 WAV 必须覆盖音乐范围并保留更晚结束的正常 release / one-shot 尾部。                      | 本收口提交                                 |
| 2026-09-03 | `SCORE-INSTRUMENTS`                                        | MI0 / MI1A 冻结总谱核心范围、术语、Program 三态与安全规范化内核；MI1B 准备并审计 22 个 developer-local Soundbank。                                               | `f7af1db`、`7c36a17`                       |
| 2026-09-03 | `SCORE-INSTRUMENTS`                                        | MI1C 为固定 GM Percussion 来源建立 47 个 one-shot 与 MIDI 42 / 44 / 46 Hi-hat Choke 兼容政策。                                                                   | `fddeb3e`                                  |
| 2026-09-03 | `INSTRUMENT-SELECTION`、`SCORE-INSTRUMENTS`                | MI2 接入 Studio-owned 22 项目录、分组 Reka UI Inspector 选择、通用 Sample Device 工厂与同源开发资产位置派生。                                                    | `f13df2f`                                  |
| 2026-09-03 | `MIDI-IMPORT`、`SCORE-INSTRUMENTS`                         | MI3A 接入 21 个精确 GM Program、Channel 10 优先路由、通用三态映射诊断，以及可见、可保存、可修复的无声 Program Placeholder。                                      | `cd043b9`                                  |
| 2026-09-03 | `MIDI-IMPORT`、`SCORE-INSTRUMENTS`                         | MI3B 把来源首个 Note 前或同 Tick 最终生效的 CC7 / CC10 写入 Track 初始 Gain / Pan，保留后续动态 Controller 的明确诊断。                                          | `5b62b68`                                  |
| 2026-09-03 | `AUDIO-QUALITY`、`SCORE-INSTRUMENTS`                       | MI4 用真实 Score Core 参考集合校准 `192 MiB` decoded Float32 LRU 缓存预算，并门禁多 Soundbank 并发、复用、Abort、重试与局部失败。                                | `8072aca`                                  |
| 2026-09-03 | `AUDIO-QUALITY`、`SCORE-INSTRUMENTS`                       | MI5 用原创 Type 1 总谱通过真实七音源 Chromium PCM 门禁，并把来源名含 URL 分隔符的 WAV 规范化为可追溯的安全资源名；人工听测保持 `not-run`。                       | `5c541dc`                                  |
| 2026-09-04 | `PLAYBACK`、`SCORE-INSTRUMENTS`                            | MI6A 将合法但无匹配 Manifest Zone 的 MIDI Note 按 Occurrence 隔离并汇总 Warning；不猜语义、不改 Project Fact，全部未覆盖时保持 Stopped。                         | `041e945`                                  |
| 2026-09-04 | `MIDI-IMPORT`                                              | MI6B 建立 SMF / PPQ / MIDI 1.0 Source Envelope，并明确区分 Profile 声明尚未检查；只贯穿中立 Document、导入摘要与 Studio 结果，不升级 Project File。              | `40ce3f3`                                  |
| 2026-09-07 | `MIDI-IMPORT`                                              | MI6C 精确检查五类 MIDI 1.0 Mode Declaration、重组 SysEx 分片并计数未分类消息；当前不建立 Semantic Binding，也不改变导入路由或发声。                              | `32a8f36`                                  |
| 2026-09-07 | `MIDI-IMPORT`                                              | MI6D 从 Mode Evidence 派生版本化、文件级 Bound / Unbound / Unresolved / Conflicted 结果并接入 Studio 反馈；不改变 Instrument 路由或 Project Fact。               | 已审核                                     |
| 2026-10-19 | `EDITOR`、`PIANO-ROLL`、`TEMPO-TRACK`、`TIMELINE`          | G1–G3 完成公共交互生命周期迁移；G4 补齐跨 Surface 取消、初始化失败回滚和 Add track 菜单屏障，并通过完整自动化门禁；真实浏览器验收待补。                          | G3 `f65bd17`；G4 已审核通过                |

## 阶段收口与验证基线

Audible MIDI Playback V1 已于 2026-08-17 按
[阶段计划](../playback/audible-midi-playback-v1-phase-plan.md)完成收口，验收基线为
`f1d0298`。阶段完成与 Git checkpoint 相互独立；该阶段本身未单独创建 checkpoint tag。

其后的 [Manual Timeline Locate V1](../playback/manual-timeline-locate-v1-phase-plan.md)
已于 2026-08-18 完成四个独立主批次和一个 Playhead 纵向可见性 UX 修正，并通过用户统一代码
审核与浏览器功能验证；它不改变 Audible MIDI Playback V1 的已完成状态。阶段 checkpoint 为
`checkpoint/manual-timeline-locate-2026-08-18`。

Audible MIDI Playback V1 Batch 1A、Batch 1B、Batch 2A、Batch 2B、Batch 3A、Batch 3B、Batch 4A、
Batch 4B.1、Batch 4B.2、Batch 5A、Batch 6A–6F 与 Batch 7A–7F 已通过本地验证和功能审核。
Batch 5A 另通过浏览器运行时 smoke，Batch 7B 另通过
浏览器布局 smoke。按约定没有新增 E2E：

- Project Tempo Control V1 MT3 已于 2026-08-24 通过完整 `pnpm check`，包括 Architecture、
  Workspace Type Check、全部测试、Studio Production Build 与 soundbank dist boundary；Studio
  为 56 个测试文件 / 359 项测试。未执行浏览器人工测试，代码与功能已通过用户审核并提交为
  `f62f384`。

- Project Tempo Control V1 MT4A 已于 2026-08-24 通过根级 `pnpm lint`、Studio Type Check、
  56 个测试文件 / 363 项测试、Production Build 与 soundbank dist boundary。未执行浏览器人工
  测试，代码与功能已通过用户审核并提交为 `254c46b`。

- Project Tempo Control V1 MT4B 已于 2026-08-24 通过根级 `pnpm lint`、Playback Type Check 与
  9 个测试文件 / 102 项测试、Studio Type Check 与 57 个测试文件 / 370 项测试、Production
  Build 及 soundbank dist boundary。未执行浏览器人工测试，代码与功能已通过用户审核并提交为
  `c0a7554`。

- Project Tempo Control V1 MT4C 已于 2026-08-24 通过根级 `pnpm lint`、Studio Type Check、
  57 个测试文件 / 374 项测试、Production Build 与 soundbank dist boundary。未执行浏览器人工
  测试，代码与功能已通过用户审核并提交为 `b0bacbe`。

- Project Tempo Control V1 MT4C Step 节点锚点视觉修正已于 2026-08-24 通过根级 `pnpm lint`、
  Studio Type Check、57 个测试文件 / 374 项测试、Production Build 与 soundbank dist boundary。
  未执行浏览器人工测试，代码与功能已通过用户审核并提交为 `9eb7855`。

- Project Tempo Control V1 MT4D / MT4E 已于 2026-08-25 通过根级 `pnpm lint`、Studio Type
  Check、57 个测试文件 / 380 项测试、Production Build 与 soundbank dist boundary。本轮未执行
  浏览器人工测试，代码与功能已通过用户审核并提交为 `31b5040`。

- Project Tempo Control V1 MT5 阶段收口已于 2026-08-25 通过完整 `pnpm check`，包括
  Architecture、Workspace Quality、Format、Oxlint、ESLint、全工作区 Type Check、全部测试、
  Studio Production Build 与 soundbank dist boundary。测试基线为 Project Core 31 文件 / 432 项、
  MIDI File 3 / 14、Platform Browser 3 / 23、Editor 11 / 112、Project MIDI 3 / 22、Playback
  9 / 102、Audio Web 16 / 110、Studio 57 / 380、Type Utils 1 / 2。本轮未执行浏览器人工测试，
  阶段收口文档已通过用户审核并随本次提交封版。阶段 checkpoint 为
  `checkpoint/project-tempo-control-2026-08-25`。

- Audio Quality Foundation V1A AQ0–AQ3 已于 2026-08-26 分批通过审核并提交为 `40c44a1`、
  `1b74d26`、`dfa2411` 与 `64118f7`；AQ4 已审核并提交为 `9b4c0c9`。Chromium 151 / 48 kHz /
  schema version 4 综合报告已通过 AQ1 headroom、AQ2 Envelope/Loop 与 AQ3 10,000 Note On
  全部检查；本地 Studio Grand 静态测量报告保持当前。完整根级 `pnpm check` 已通过 Architecture、
  Workspace Quality、Lint、全工作区 Type Check、137 个测试文件 / 1,219 项测试、Studio
  Production Build 与 soundbank dist boundary；AQ1–AQ3 最终政策的 developer-local 人工听测
  如实记录为 `not-run`，历史单音 smoke 不被重复计为通过。

- Expression Quality Integration V1 EQ1 已审核并提交为 `f47bf38`。它新增独立政策标识
  `seele.audio-quality-expression-v1-eq1`，让复音分配器先选择 release-started、再选择
  key-released / pedal-held、最后选择 key-held Voice，并保留 AQ3 的增益、年龄、Token 与
  64 / 128 / 16 预算。Audio Web Type Check、3 个目标测试文件 / 40 项测试、19 个测试文件 /
  134 项全包测试与根级 `pnpm lint` 已通过。

- Expression Quality Integration V1 EQ2 已审核并提交为 `3c29bc9`。它把四种 Manifest Trigger / Loop
  语义、32 Voice 踏板保持、踏板下同音重触发和 Pedal Up release 加入 schema version 5 综合报告。
  Chromium 151 / 48 kHz 运行已全部通过：32 Voice 峰值约 `-9.86 dBFS`、保持 RMS 比约 `1.0000`、
  同音重触发比为 `2.0`，全部输入无满刻度帧、尾部与 Runtime 资源归零。该报告证明固定合成输入下
  不提前释放、不错误 choke 和不削波；developer-local Studio Grand 人工听测仍如实记录为
  `not-run`，不能据此宣称新增力度层、共鸣、round-robin 或 release sample。Audio Web 20 个测试
  文件 / 137 项测试、根级 `pnpm lint`、Studio Type Check、Production Build 与 soundbank dist
  boundary 已通过。

- Expression Quality Integration V1 EQ3A 已通过审核并随本次提交交付。只读审计确认 Clip 末端踏板强制正常
  release、Pause / Locate / Return 快速释放、CC64 选择性重排、Instrument Track 选择性 cancel 和
  失败不回滚 Project Commit 的既有路径。实际修正让 Paused / Stopped 状态在活动尾音或 retired
  Runtime 存在时继续使用既有 25 ms 低频清理，终态归零后立即停止；自然结束仍不调用全局
  `allNotesOff`，prepared Runtime 可供下次 Play 复用。Studio Playback Coordinator 定向 1 个测试
  文件 / 40 项、Studio 全包 61 个测试文件 / 397 项、Type Check、根级 `pnpm lint`、Production
  Build 与 soundbank dist boundary 已通过。该批不改变 PCM，未重复运行 EQ2 Chromium 报告。

- Expression Quality Integration V1 EQ3B 已通过审核并由本收口提交交付。它冻结完整编排 V1 默认音乐范围
  `[0, arrangementEndTick]`，明确 `timelineEndTick` 只属于 Ruler 与实时 Transport，并要求未来
  WAV 至少覆盖音乐范围，并在需要时继续到最后一枚已接纳 Voice 完成 Manifest 正常 release 或
  one-shot 自然播放。该批不新增 Offline API 或声音算法；Playback Compiler 回归已显式固定踏板保持的
  `releaseTick = Clip End < timelineEndTick`。最终根级 `pnpm check` 已通过 148 个测试文件 /
  1,310 项测试、全工作区 Type Check、Studio Production Build 与 soundbank dist boundary；Studio
  Grand 的 Pause、Pedal Up、同音重触发与最大复音人工听测继续记录为 `not-run`。

- Built-in Multi-Instrument Score Playback MI2 已通过审核并提交为 `f13df2f`：Studio-owned Catalogue 同时驱动
  22 项分组 Inspector 选择与 browser asset location，Ready / Empty / Missing 都只能经用户显式
  Replace，未知 Descriptor 保持 round-trip。Playback Type Check 与 9 个测试文件 / 107 项、Studio
  Type Check 与 63 个测试文件 / 403 项、根级 `pnpm lint`、Studio Production Build 与 soundbank
  dist boundary 已通过。本地浏览器可见 smoke 已确认 Reka UI 分组弹层、滚动、选择、无原生
  Instrument `select` 与零控制台 warning / error；22 个选项均使用完整文本列并保持单行，最长的
  `General MIDI Percussion` 没有单词截断换行。未执行人工声音试听，也未在本独立批次重复完整
  `pnpm check`。该提交不包含 Program / Channel 10 自动路由。

- Built-in Multi-Instrument Score Playback MI3A 已通过审核并提交为 `cd043b9`：两种 MIDI 导入入口共用 Studio
  Program / Channel 10 工厂；21 个已审核 GM Program 创建对应 Sample Device，零基 Channel `9`
  优先创建 General MIDI Percussion，未命中 Program 则保存严格 V1 无声 Placeholder 并产生
  `program-unavailable` 非阻断诊断。`project-midi` 同时建立 Exact / Approximate / Unavailable 通用
  结果契约，但当前目录没有伪造任何未经审核的 Approximate 路由。Project MIDI 3 个测试文件 /
  26 项、MIDI File 3 / 15、Playback 9 / 107、Studio 64 / 412、受影响包 Type Check、根级
  `pnpm lint`、Studio Production Build 与 soundbank dist boundary 已通过；未执行人工声音试听或
  完整 `pnpm check`。

- Built-in Multi-Instrument Score Playback MI3B 已通过审核并提交为 `5b62b68`：两种导入模式从 normalized Track
  首个 Note 的来源 Tick 派生初始 Channel 状态；CC7 线性映射到 Gain，CC10 以 `64` 为精确中心映射
  到 Pan，缺失时保持 `1` / `0`。动态 CC7 / CC10 和其他未支持 Controller 继续保留事件数与编号
  诊断；CC64 仍是独立 Project Fact。Project MIDI 3 个测试文件 / 29 项、Playback 9 / 107、Studio
  64 / 412、受影响 Type Check、根级 `pnpm lint`、Studio Production Build 与 soundbank dist
  boundary 已通过。详细证据见
  [MIDI Initial Channel Controls V1](../../../packages/project-midi/docs/midi-initial-channel-controls-v1.md)；未
  执行人工试听、混合 Peak 门禁或完整 `pnpm check`。

- Built-in Multi-Instrument Score Playback MI4 已通过审核并提交为 `8072aca`：Audio Web 的应用级解码缓存新增
  decoded Float32 LRU 总量预算，Studio 默认 `192 MiB`。本地 22 音源参考集合实测为 68 枚唯一
  WAV、`84,609,040` decoded bytes；重复准备不增加 Fetch / Decode。自动化门禁覆盖跨 Soundbank
  并发、Abort、失败重试、首次 fail-fast、选择性局部失败、Project 切换既有回归与 Application
  dispose。Audio Web 23 个测试文件 / 158 项、Studio 64 / 415、两个受影响包 Type Check、根级
  `pnpm lint`、Studio Production Build 与 soundbank dist boundary 已通过；本地测量复跑保持
  `current`。详细证据见
  [Multi-Soundbank Runtime Resource Gate V1](../audio-web/multi-soundbank-runtime-resource-gate-v1.md)；
  MI5 已继续执行真实混合门禁。

- Built-in Multi-Instrument Score Playback MI5 已通过审核并提交为 `5c541dc`：原创 `747` bytes Type 1 MIDI 经
  Encoder / Decoder、Project MIDI、Studio Program / Channel 10 路由、Playback Compiler /
  Scheduler 与生产 Sample Runtime 渲染七个真实 Soundbank。Chromium 18 项自动检查全部通过；
  混合 Peak 为 `-12.893738 dBFS`、零削波，尾窗为数字静音，渲染后 Voice / Node 为零，缓存
  dispose 后也归零。真实门禁还发现并修复 34 枚来源名含 `#` 的 WAV public URL 歧义：生成资源
  使用确定性安全文件名，单音源审计报告升级到 schema version 2 并保留来源 Archive Key；362 枚
  WAV 的内容哈希集合没有变化。人工听测仍为 `not-run`。最终根级门禁已通过 155 个测试文件 /
  1,357 项测试、全工作区 Type Check、Studio Production
  Build 与 soundbank dist boundary。详细证据见
  [Built-in Multi-Instrument Score Playback V1 收口报告](../audio-web/built-in-multi-instrument-score-playback-v1-closure-report.md)。

- MIDI Note Coverage Isolation MI6A 已通过审核并提交为 `041e945`：Audio Web 按 Soundbank 与 Note
  Occurrence 对严格 Manifest 覆盖进行分区，只准备命中 Zone 的 WAV，并把未命中项记录为客观
  `no-matching-zone`；Browser Runtime 只跳过精确 Occurrence，Studio 以非失败 Warning 汇总
  Soundbank / Pitch / 次数。部分覆盖计划继续 Playing；全部未覆盖计划保持 Stopped 并复用已准备
  Runtime。非法 Pitch、损坏资源和直接绕过准备层的 Voice 调度仍严格失败。Project Fact 与文件
  schema 不变；未来语义恢复必须走版本化 `MIDI Semantic Binding` 证据，不能从 Pitch 猜
  Keyswitch。最终 `pnpm check` 已通过 157 个测试文件 / 1,370 项测试、全工作区 Type Check、
  Studio Production Build 与 soundbank dist boundary。详细边界与术语见
  [MIDI Note Coverage Isolation V1](../audio-web/midi-note-coverage-isolation-v1.md)。

- MIDI Source Envelope MI6B 已通过审核并提交为 `40ce3f3`：`midi-file` 为 Type 0 / 1 PPQ 文件建立深度冻结的 SMF、
  MIDI 1.0 与 `profile-declarations-not-inspected` 证据；`project-midi` 在写入任何 Project Fact 前
  验证格式一致性，并把防御性副本放入两种导入摘要，Studio 结果保持该证据。Project File V2、
  History、dirty 与 Playback 均不改变。完整 `pnpm check` 已通过 158 个测试文件 / 1,375 项测试、
  Studio Production Build 与 soundbank dist boundary。详细契约、术语和延期项见
  [MIDI Source Envelope V1](../../../packages/midi-file/docs/midi-source-envelope-v1.md)。

- SMF MIDI 1.0 Mode Declaration Evidence MI6C 已审核并提交为 `32a8f36`：限定检查器精确识别 GM1 On、GM Off、
  GM2 On、GS Reset 与 XG System On，并保留位置化声明、Device ID 与未分类 SysEx 消息数。完整与
  分片消息、近似字节拒绝、深度不可变传递及已识别声明的 Encoder 重写已有自动测试；MI6C 本身不生成
  Semantic Binding，不改变 Project Fact 或声音。完整 `pnpm check` 已通过 159 个测试文件 / 1,384
  项测试、Studio Production Build 与 soundbank dist boundary。详细边界见
  [SMF MIDI 1.0 Mode Declaration Evidence V1](../../../packages/midi-file/docs/smf-midi1-mode-declaration-evidence-v1.md)。

- MIDI Semantic Binding MI6D 已审核：`project-midi` 用固定 V1 政策把 Mode Evidence 分类为
  Bound / Unbound / Unresolved / Conflicted，并通过声明索引保留审计关系。Studio 导入反馈显示唯一
  模式，对 GM Off、冲突、未检查、检查失败和未分类 SysEx 各产生一个风险 notice，同时明确 Instrument
  路由未改变。Binding 仍是瞬态摘要，不进入 Project File、History、Playback 或 Pinia。完整
  `pnpm check` 已通过 160 个测试文件 / 1,398 项测试、Studio Production Build 与 soundbank dist
  boundary。详细边界见
  [MIDI Semantic Binding V1](../../../packages/project-midi/docs/midi-semantic-binding-v1.md)。

- Built-in Preset Catalogue and General MIDI Routing V1 已通过审核并提交为 `000aa9f`。Studio 的 Reka UI
  左目录 / 右选项浮层展示 15 类、439 个来源 Preset：289 个 MIDISampleSynth 可播放，139 个
  VASynth 与 11 个 FMSynth 点击只发 Warning 且不改变 Track。独立的 128 项 GM 导入路由包含
  108 项采样映射（63 Exact / 45 Approximate）和 20 项合成器 Runtime 暂缺，使用 289 项采样目录
  中的 86 个 Soundbank。完整本地准备复用既有 86 项并新增 203 项，生成 4,664 个 Zone /
  Resource；幂等复跑时 289 项全部为 `current`。根级 `pnpm check` 已通过 157 个测试文件 /
  1,365 项测试、Studio Production Build 与 soundbank dist boundary；真实浏览器布局与选择 smoke
  也通过，完整目录人工听测仍为 `not-run`。资产继续被 Git 与 production dist 排除。详细边界见
  [Studio Built-in Preset Catalogue and General MIDI Routing V1](../../../apps/studio/docs/general-midi-built-in-routing-v1.md)。

- MIDI Sustain Pedal CC64 Project Fact V1 已于 2026-08-28 通过审核并提交为 `d6fa7f4`；导入、
  Playback、Audio Runtime 与 Studio 选择性重协调已提交为 `3ff2853`，Editor Lane Foundation 已
  提交为 `2fb0764`，Studio Lane Add 已提交为 `a1f4e5e`，Editor Event Editing Foundation 已提交为
  `0ed4523`，Studio Event Editing 已提交为 `210f2c9`，Scope 切换 Action 生命周期修复已提交为
  `f83f62d`。该纵向切片接入 Selection、Move、Replace Value、Remove、Preview 与既有 Piano Roll
  Action，但不宣称 half-pedal、共鸣或 release sample 已交付。Editor Foundation 已通过根级
  `pnpm lint`、Editor Type Check 与 16 个测试文件 / 140 项测试；Studio 最终通过根级 `pnpm lint`、
  Studio Type Check、61 个测试文件 / 396 项测试、Production Build 与 soundbank dist boundary。
  未执行浏览器人工布局或听测。

- Standard MIDI File Import / Export V1 MI5 已于 2026-08-20 通过完整 `pnpm check`，包括
  Architecture、Workspace Type Check、全部测试、Studio Production Build 与 soundbank dist
  boundary；Studio 为 48 个测试文件 / 306 项测试。按阶段约定未新增 E2E，也未由实现方执行
  浏览器人工测试。

- MI6 当前项目 Track 导入实现已于 2026-08-21 通过根级 lint、Workspace Type Check、全部
  workspace 测试、Studio Production Build 与 soundbank dist boundary；Project Core 为 29 个
  测试文件 / 415 项测试，`project-midi` 为 3 / 20，Studio 为 48 / 310。按约定未新增 E2E，也未
  执行浏览器人工测试；代码与功能仍待用户审核。

- MI7 当前项目导入语义加固 Batch 1–4 已于 2026-08-21 通过完整 `pnpm check`，包括 Architecture、
  Workspace Type Check、全部测试、Studio Production Build 与 soundbank dist boundary；
  `project-midi` 为 3 / 22，Playback 为 9 / 101，Studio 为 49 / 313。按约定未新增 E2E，也未由
  实现方执行浏览器人工测试；四个批次仍待用户统一审核。

- Manual Timeline Locate V1 最终实现通过 2026-08-18 完整 `pnpm check`；Playback 为 9 文件 /
  100 项，Studio 为 46 / 284，并通过 Architecture、Workspace Type Check、Studio Production
  Build 与 soundbank dist boundary。按用户约定没有新增 E2E，也未由实现方执行浏览器人工手测。

- Batch 7F 覆盖审计确认多 Track 配对、150 小节与超长 Clip、自然结束、Voice 清理、Pause / Return、
  项目切换、dispose 及双视图 Follow 已有直接回归；新增后台帧停顿后读取最新权威 Transport 位置的
  显式测试。完整工作区验证见下列最新基线。

- Batch 7B 的 Playback、Audio Web 与 Studio 全包测试分别为 9 文件 / 93 项、16 / 110 与
  42 / 252；受影响包 type-check、架构检查与 Studio Production Build 通过。浏览器布局 smoke
  已确认 Arrangement 独占横向滚动条、Track 从视图行对齐和 Track 区域滚轮转发。
- Batch 6A–6F 已于 2026-08-14 完成统一逐提交审核；对应验收通过 `pnpm lint` 与 `pnpm check`，
  包括 Architecture、Workspace Type Check、全部测试、Studio Production Build
  与 soundbank dist boundary；Batch 6 按约定未新增 E2E。
- Batch 4B.2 已通过完整 `pnpm check`（Architecture、Workspace Type Check、全部测试、
  Studio Production Build 与 soundbank dist boundary），并通过改动范围的 Oxlint / ESLint 与格式检查。
- EQ3B 收口于 2026-09-02 通过最新完整 `pnpm check`；本节以下更新为该次可信基线：
- Project Core：32 个测试文件，465 项测试。
- midi-file：3 个测试文件，14 项测试。
- project-midi：3 个测试文件，25 项测试。
- platform-browser：3 个测试文件，23 项测试。
- editor：16 个测试文件，140 项测试。
- playback：9 个测试文件，107 项测试。
- audio-web：20 个测试文件，137 项测试。
- Studio：61 个测试文件，397 项测试。
- type-utils：1 个测试文件，2 项测试。

合计 148 个测试文件、1,310 项测试。完整 `pnpm check` 同时通过 Architecture、Workspace
Quality、Format、Oxlint、ESLint、全工作区 Type Check、Studio Production Build 与 soundbank
dist boundary。

后续功能完成时，测试数量可以增长；“全部验证通过”比固定数量更重要，但本节应保留最近一次可信基线。
