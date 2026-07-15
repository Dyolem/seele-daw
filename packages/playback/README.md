# @seele-daw/playback

`playback` 是浏览器无关的播放编译核心，负责把项目快照和增量变化解释为图计划、时间线事件和 RuntimeDelta；它描述“应该播放什么、何时播放”，但不创建 AudioContext 或 AudioNode。

> 当前状态：仅完成 package 骨架和公开入口。长期架构中的名称 `playback-core` 对应当前包。

## 包定位

```text
ProjectSnapshot + ProjectDelta
-> Playback Model
-> GraphPlan + TimelineIndex + AutomationPlan
-> RuntimeDelta(engineGeneration)
-> audio-web
```

Audio Runtime 不读取完整 ProjectModel；所有项目语义都必须先在本包编译成稳定、可序列化、可测试的计划。

## 主要职责

| 领域              | 规划职责                                                  |
| ----------------- | --------------------------------------------------------- |
| PlaybackCompiler  | 全量编译与按 ProjectDelta 增量失效                        |
| TempoMap          | Tick、ProjectSecond 与播放时间的确定性转换                |
| Transport         | stopped/playing/paused/recording、anchor、loop、seek 语义 |
| TimelineIndex     | Clip 窗口、循环展开、Note/Automation 范围查询             |
| Scheduler Planner | look-ahead window、EventKey、generation、迟到恢复策略     |
| GraphPlan         | Track、Device、Mixer、Master 的逻辑拓扑                   |
| RuntimeDelta      | graph ops、timeline invalidation、parameter ops           |
| Playback Sync     | modelRevision 与 engineGeneration 的对应和 ACK 状态       |

## 核心契约

- `modelRevision` 表示项目提交版本，`engineGeneration` 表示运行时计划世代，二者不得混用。
- Seek、Stop、项目切换和需要重建未来事件的编辑必须增加 generation，使旧事件可被丢弃。
- 所有事件具有稳定 `EventKey`，循环展开不能重复或漏发事件。
- Loop 和时间区间统一使用半开区间 `[start, end)`。
- 播放中编辑的取消、release、重建和生效边界按操作定义，不能交给设备自行猜测。
- 具体 look-ahead 毫秒数由 benchmark 决定，不作为固定架构常量。

## 建议的内部模块

```text
src/
├── compiler/       snapshot/delta -> playback plans
├── transport/      状态、锚点、loop、seek 与 generation
├── time/           TempoMap 与时间映射
├── timeline/       索引、Clip loop 与事件展开
├── scheduler/      窗口规划、EventKey 与迟到策略
├── graph/          GraphPlan、参数地址与逻辑路由
├── protocol/       RuntimeDelta 与 ScheduledRuntimeEvent DTO
└── index.ts        唯一公开入口
```

## 依赖边界

- 只依赖 [`@seele-daw/project-core`](../project-core/README.md) 的模型快照、增量和稳定类型。
- 禁止依赖 Vue、Pinia、DOM、Canvas、IndexedDB 或 OPFS。
- 禁止创建或暴露具体 AudioContext、AudioNode、AudioParam 实例。
- 禁止依赖 `editor`、`audio-web`、`platform-browser` 或 `apps/studio`。
- 第三方音频库不能定义项目时间、Transport、Device 身份或保存格式。

## 分阶段计划

1. 实现固定 PPQ 的 TempoMap、Transport 和 Tick/second 转换。
2. 编译 MIDI Note 事件，并建立确定性的 EventKey。
3. 实现规划层 look-ahead scheduler 和 generation 失效。
4. 支持播放中移动/删除 Note、Seek、Loop 和 Tempo change。
5. 增加 Track/Device GraphPlan、参数计划和增量 reconciler 输入。
6. 在后续阶段加入 Audio Clip、Automation、Recording monitoring 和 frozen-revision export 计划。

## 测试与验收

- TempoMap、Tick/second 转换和 loop 边界 property tests；
- 相同 snapshot 必须生成稳定一致的 plans；
- 全量编译与 delta 增量编译结果等价；
- scheduler 不重复、不漏发，旧 generation 事件必须失效；
- timer jitter、长任务、seek、loop 和播放中编辑的虚拟时钟测试；
- 大项目下编译时间、窗口查询和事件数量基准。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
