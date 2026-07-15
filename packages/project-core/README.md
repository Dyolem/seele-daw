# @seele-daw/project-core

`project-core` 是与框架和浏览器无关的项目内核，拥有 Web DAW 唯一的创作事实，并负责把一次编辑转换为可验证、可撤销、可订阅的原子提交。

> 当前状态：仅完成 package 骨架和公开入口，尚未实现领域模型。

## 包定位

本包位于依赖图最内层。Track、Clip、Note、Tempo、Device 等可保存、可撤销的数据只能由这里的 `ProjectModel` 持有。Vue、Canvas、AudioNode、Selection、波形缓存和播放头都不是项目事实源。

一次项目修改的标准链路为：

```text
ProjectCommand
-> validate + build MutationPlan
-> atomic commit
-> ProjectCommit(modelRevision + ProjectDelta)
-> History / Query / Durability / Playback consumers
```

## 主要职责

| 领域     | 规划职责                                                            |
| -------- | ------------------------------------------------------------------- |
| 模型     | ProjectModel、实体表、有序 ID 集合、跨实体不变量                    |
| 文件边界 | ProjectFileDTO、运行时校验、迁移、normalize；DTO 不直接充当内存模型 |
| 时间     | branded Tick、PPQ、TempoMap、半开区间 `[start, end)`                |
| 命令     | 完整参数的 ProjectCommand、baseRevision 校验、MutationPlan          |
| 提交     | 原子应用、modelRevision、类型化 ProjectDelta、ChangePublisher       |
| 历史     | Undo / Redo、inverse mutation、gesture merge、EditorRestorePoint    |
| 查询     | QueryIndex、局部 selector、按 topic/entity 订阅、索引重建           |
| 端口     | Durability、Playback Sync 等外部能力的接口，不包含浏览器实现        |

`ProjectSession` 只作为对上层的门面，内部应拆分为 Command Processor、Model Store、Invariant Validator、History Controller、Query Index 和 Change Publisher，不能演变成管理所有系统的 God Object。

## 建议的内部模块

目录应随第一条 MIDI 纵向切片逐步生长，不预建空泛层级：

```text
src/
├── model/          ProjectModel、实体、ID 与不变量
├── time/           Tick、区间、TempoMap
├── commands/       命令、handler 与 MutationPlan
├── session/        ProjectSession、提交管线与通知
├── history/        Undo / Redo 与合并策略
├── queries/        索引、查询与订阅
├── persistence/    DTO、迁移与持久化端口
└── index.ts        唯一公开入口
```

这些名称是规划方向，不要求一次性全部创建。只有产生真实代码和稳定职责时才新增目录。

## 公开 API 原则

- 其他包只能从 `@seele-daw/project-core` 公开入口导入，禁止深层路径导入。
- 命令必须携带稳定实体 ID 和完整参数，不能读取 Editor Selection。
- 一次用户动作只增加一次 `modelRevision`，并只产生一个 History Entry。
- `ProjectDelta` 是提交结果和失效提示，不是项目事实，也不是永久事件溯源日志。
- Project commit 不等待音频设备、IndexedDB 或 OPFS；外部失败通过端口状态返回。
- 索引、缓存和运行时计划必须可以从当前模型重建。

## 依赖边界

本包禁止依赖：

- Vue、Pinia 或任何 UI 框架；
- DOM、Canvas、Web Audio 或具体 AudioNode；
- IndexedDB、OPFS、File System API；
- `apps/studio`、`audio-web`、`platform-browser`；
- 无明确领域所有者的 `shared`、`utils` 收容模块。

运行环境仅使用 ECMAScript 能力，核心测试必须能在 Node.js 中执行。

## 分阶段计划

1. 定义 ID、Tick、Project、Instrument Track、MidiClip、MidiSource 和 Note。
2. 实现 `AddNoteCommand`、`MoveNoteCommand`、`RemoveNoteCommand` 与原子提交。
3. 实现 Undo / Redo，并验证一次拖拽只产生一次历史记录。
4. 增加类型化 `ProjectDelta`、QueryIndex 与局部订阅。
5. 定义 ProjectFileDTO、schema validation、迁移和 snapshot/journal 端口。
6. Audio Clip、Device、Automation 等模型只在对应产品阶段进入本包。

## 测试与验收

- 命令成功、拒绝和陈旧 `baseRevision` 的确定性测试；
- 每种命令的 forward/inverse round trip；
- 随机命令序列后的模型不变量；
- snapshot、迁移与 journal replay 的 golden fixtures；
- QueryIndex 与全量扫描结果一致；
- 100k Note / 32 Track 基准数据下的命令和查询性能。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
