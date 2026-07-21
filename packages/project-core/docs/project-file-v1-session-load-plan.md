# Project File V1 Session 加载计划

## 目标

本阶段在 V1 projector 与严格 decoder 之后，补齐第一条可信的内存读回闭环：

```text
external unknown
-> decodeProjectFileDTO
-> ProjectFileDTO V1
-> domain normalization
-> ModelStore
-> cross-entity invariant validation
-> fresh ProjectSession
```

公开入口接收已经由 transport 层取得的结构化 `unknown`。它不读取路径、不解析 JSON 文本，也不处理 IndexedDB、bundle、migration 或自动修复。

## 三层校验职责

加载边界不能把 decoder 成功等同于项目可运行：

1. `decodeProjectFileDTO` 校验 V1 property、JSON 类型、判别值、版本和 entity key / `id` 一致性，并取得 DTO 容器所有权；
2. domain normalizer 对每个字段调用既有 ID、Tick、MIDI、Channel、Timeline、Device 解析器和 Record factory，不能用 TypeScript cast 把普通值伪装成 Brand；
3. `assertModelInvariants` 在完整 ModelStore 上聚合检查引用、所有权、Track 顺序、Source / Note 范围、Device 拓扑和 Timeline 初始事件。

结构错误继续抛出 `ProjectFileValidationError`。领域值或完整模型失败抛出 `ProjectFileLoadError`，避免调用方根据英文 message 猜测失败阶段。

## 模块位置与公开边界

这些能力属于持久化协议到运行时组合的防腐层，放在 `src/persistence/`，而不是放进 Model、Session 或 storage adapter：

```text
src/persistence/
├── project-file-decoder.ts
├── project-file-normalizer.ts       # internal DTO -> ModelStoreSeed
├── project-file-loader.ts           # public orchestration boundary
└── project-file-load-error.ts
```

package root 公开：

- `createProjectSessionFromProjectFile(input: unknown): ProjectSession`；
- `ProjectFileLoadError` 及稳定错误协议类型。

normalizer、`ModelStoreSeed`、`ModelStore` 和内部 Session composition entry 不从 package root 导出。公开函数名刻意使用 `ProjectFile` 而不是 `JSON` 或 `Path`：输入是一份结构化项目文件值，本函数没有 I/O 或文本编码职责。

## DTO 到领域模型的映射

normalizer 显式创建当前运行时结构：

- 顶层 `projectId` / `name` 创建 `ProjectRecord`；
- V1 entity table 创建私有 Map，`trackOrder` 创建 Brand ID 数组；
- Track、Clip、Tempo、Time Signature 与 Device 分别通过当前领域 factory 创建；
- `MidiSourceDTO.notes` 拆分为 ModelStore 的 `midiSources` 与 `midiNotesBySource` 两张分区表；
- Device parameters 的 property key 逐个解析为 `ParameterId`，JsonValue 由领域边界重新取得所有权；
- `master` 创建 `MasterChannelRecord`；
- DTO 中不存在的 `modelRevision`、History、QueryIndex、subscriptions 和 writer lease 不被推断或恢复。

opaque ID 可以是 `__proto__` 等特殊字符串。normalizer 只通过 own keys 读取协议表，并用 Map 表达权威实体表，不依赖普通 object 的原型语义。

## 新 Session 语义

加载成功总是组合一个新的内存会话：

- ModelStore 从 `modelRevision = 0` 开始；
- History 的 undo / redo 栈为空；
- QueryIndex 从加载后的权威 ModelStore 重建；
- subscriptions 为空；
- Session 在其他组件成功构造后取得唯一 writer lease。

文件保存的是项目事实，不是某次应用进程的操作历史、缓存或观察者。未来若产品需要恢复这些状态，应定义独立协议，不能混入 V1 Project File。

## 错误协议

`ProjectFileLoadError` 使用两类稳定错误码：

- `invalid-domain-value`：结构合法的 DTO 字段不能创建当前领域值或 Record；
- `model-invariants-violated`：所有 Record 均合法，但完整 ModelStore 的跨实体关系不成立。

错误持有 frozen `path` 和原始 `failureCause`。领域解析尽量把 path 定位到具体 V1 字段；涉及多个字段的 factory 约束定位到相应实体或复合对象。跨实体违规没有唯一字段路径，因此使用根路径，并通过 cause 保留完整 `ModelInvariantError` 诊断。

解码阶段的 `ProjectFileValidationError` 不包装为 load error；意外的内部编程错误也不伪装成用户文件错误。

## 测试边界

- 静态 V1 golden 与 projector 输出均可加载为新 Session；
- `ProjectFile -> Session Snapshot -> ProjectFileDTO` 无损往返；
- 加载后的 revision 为 `0`，undo / redo 为空，QueryIndex 可立即查询；
- 加载后可执行 Command，且不修改输入 DTO；
- 结构错误仍保留 `ProjectFileValidationError`；
- 空 ID、非法 color、MIDI / gain / Timeline 范围等在正确 path 抛出 `invalid-domain-value`；
- Track 顺序、悬空引用、Source 所有权、Note 范围与缺失初始 Timeline 事件抛出 `model-invariants-violated`；
- 特殊 opaque key 能安全加载。

## 完成边界

本阶段完成结构化 V1 值到 fresh ProjectSession 的内存加载后停止等待审阅。不连续实现 JSON codec、文件系统、IndexedDB、migration、autosave 或 crash recovery。

## 实施结果

本阶段已于 2026-07-21 按上述边界完成：

- package root 已公开 `createProjectSessionFromProjectFile(input)`、`ProjectFileLoadError` 及错误协议类型；
- 包内 normalizer 显式调用全部当前领域解析器与 Record factory，并建立 ModelStoreSeed 所需的规范化表和 Note 分区；
- loader 保留 decoder 的结构错误，在领域失败时提供稳定 V1 path，并把聚合 `ModelInvariantError` 保留为跨实体失败 cause；
- 成功加载会创建 revision `0`、空 History / subscriptions、重建 QueryIndex 且取得唯一 writer lease 的 fresh Session；
- 静态 golden 已覆盖无损 read -> runtime -> write 往返、加载后查询与 Command、输入隔离、领域错误、跨实体不变量及 `__proto__` 安全 key；
- Project Core 基线为 23 个测试文件、339 项测试。
