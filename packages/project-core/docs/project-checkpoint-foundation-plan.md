# Project Checkpoint 基础协议与存储端口计划

## 目标

本阶段在 Project File V1 已能完整写出和加载之后，建立 storage-neutral 的完整 Snapshot checkpoint 边界：

```text
save
ProjectSession
-> capture one ProjectSnapshot
-> createProjectFileDTO
-> ProjectCheckpoint
-> ProjectCheckpointStore.save

restore
ProjectCheckpointStore.readCandidates
-> unknown checkpoint candidates
-> checkpoint decode
-> decoded ProjectFileDTO domain load
-> fresh ProjectSession
```

Checkpoint 表达“一份完整项目事实已经被某个存储实现接受”。它不是 Undo History、Journal entry、JSON 文本或浏览器数据库记录，也不进入普通 Command 提交的同步路径。

## 为什么先做 Checkpoint

当前只有真实 Project File V1，尚不存在需要迁移的 V2；提前建立通用 migration registry 仍是假抽象。首个 IndexedDB 纵向切片可以直接保存 structured-clone-compatible DTO，也不需要先固定 JSON 空白、UTF-8、canonical byte order 或 checksum。

Journal 还需要独立的 persisted mutation 版本、连续 sequence、幂等 transaction ID、checksum 和 replay 规则。架构路线要求先完成完整 Snapshot 保存与恢复，再增加增量 Journal。

因此顺序固定为：

```text
Checkpoint core protocol / port
-> platform-browser IndexedDB adapter
-> Studio save and refresh recovery
-> Journal and crash recovery
```

## 为什么不直接把 ProjectFileDTO 存入浏览器

直接按 `projectId -> ProjectFileDTO` 写入 IndexedDB 是可行的最简实现，足以完成“不带精确保存状态和恢复副本的保存 / 刷新 / 打开”。Checkpoint 不是因为 ProjectFileDTO 缄默了项目事实，也不重新定义、清洗或序列化一份项目格式；它只是把同一个 `ProjectFileDTO` 包装成一次可识别的本地保存记录。

两者回答不同问题：

```text
ProjectFileDTO   项目包含什么长期事实
ProjectCheckpoint   哪一次本地保存接受了这些事实，以及它来自哪个运行时 revision
```

本项目增加 envelope 有四个已知需求：

1. **异步保存对账**：Project File 按设计不保存 Session 运行时状态。Checkpoint receipt 最初保留 `sourceModelRevision`；后续精确保存点阶段又加入不持久化的 `sourceContentStateId`。若保存期间继续编辑，完成回执仍能指向真正被捕获的 History 内容状态。
2. **不可变保存记录**：后续 IndexedDB adapter 写入新的 checkpoint record，成功后再原子切换 active pointer，而不是原地覆盖唯一有效 ProjectFileDTO；previous checkpoint 可以继续作为恢复候选。
3. **候选恢复与诊断**：active checkpoint 的 envelope、Project File 或领域关系损坏时，核心可以按顺序拒绝它并尝试 previous，同时保留每个 candidate failure。一个只返回单份 DTO 的端口没有表达这一恢复协议的位置。
4. **版本概念分离**：`projectFile.formatVersion`、`checkpointFormatVersion`、IndexedDB database version 和未来 `journalSequence` 分别演进。增加保存元数据或修改数据库布局不应迫使 Project File V1 升级。

如果产品永远只需要单记录覆盖、不显示精确 Saved / Dirty、不保留 previous 且不做损坏回退，则可以删除 Checkpoint，直接存 ProjectFileDTO。当前路线已经明确需要上述恢复能力；即使从直接保存开始，后来增加的那张“保存元数据 + ProjectFileDTO”记录本质上仍会成为 Checkpoint，因此现在显式建立边界能避免由浏览器 adapter 反向定义项目保存语义。

Checkpoint 只用于应用内部的本地持久化与恢复。用户导入、导出的项目文件仍然是 Project File Format；外部 JSON / bundle 不应包含 checkpoint ID、来源 revision、active/previous 指针或 IndexedDB 元数据。

## 独立版本与身份

`ProjectCheckpoint` 是可 structured clone 的持久化 envelope：

```ts
interface ProjectCheckpoint {
  readonly checkpointFormatVersion: 1
  readonly checkpointId: ProjectCheckpointId
  readonly projectId: ProjectId
  readonly sourceModelRevision: ModelRevision
  readonly projectFile: ProjectFileDTO
}
```

- `checkpointFormatVersion` 只版本化 checkpoint envelope，不复用 `projectFile.formatVersion`、IndexedDB database version、Journal sequence 或 cloud version；
- `checkpointId` 是非空 opaque string，由调用方生成并注入，project-core 不读取时钟或调用随机数 API；
- `projectId` 与嵌套 `projectFile.projectId` 必须完全一致；
- `sourceModelRevision` 记录生成 Snapshot 时的 Session revision，用于提交顺序和保存来源诊断；精确 dirty 判断由 save receipt 的会话级 content-state identity 完成；
- 恢复后的 fresh Session 仍从 revision `0` 开始，不能把旧进程 revision 写回 ModelStore。

本阶段不加入 `createdAt`。墙上时钟属于 adapter 或产品元数据，不能参与 checkpoint 正确性。

## Snapshot 一致性与异步保存

保存协调函数必须只调用一次 `session.getSnapshot()`，再从该 Snapshot 同时取得 `sourceModelRevision`、Project ID 和 ProjectFileDTO。后续精确保存点阶段会在同一个同步调用栈内先读取当前 `session.contentStateId`，紧接着捕获 Snapshot；中间没有 await、外部 callback 或可重入写入口，因此二者描述同一 Session 状态。不能在异步存储前后分别读取这些字段。

`saveProjectCheckpoint` 返回 frozen receipt，其中保留 checkpoint ID、Project ID、来源 revision，以及后续加入的 `sourceContentStateId`。后者只返回调用方，不写入 ProjectCheckpoint envelope 或 Store。保存期间 Session 可以继续编辑；调用方以当前 `session.contentStateId === receipt.sourceContentStateId` 判断是否回到被保存的同一个 History 状态。Checkpoint 保存不阻塞或回滚已提交 Command。

本阶段不在 core 中实现 debounce、save queue 或 dirty ref。这些需要 Studio 生命周期与产品策略；receipt 提供正确组合它们所需的 revision 事实。

## 存储端口

`ProjectCheckpointStore` 由 project-core 拥有，浏览器实现由 `platform-browser` 提供：

```ts
interface ProjectCheckpointStore {
  save(checkpoint: ProjectCheckpoint): Promise<void>
  readCandidates(projectId: ProjectId): Promise<readonly unknown[]>
}
```

- save 输入是经过工厂创建、深度冻结的可信 checkpoint；
- read 返回的每个值仍是不可信 `unknown`，必须重新执行 envelope、Project File 和领域校验；
- candidates 按存储层恢复优先级排列，例如 active 在前、previous 在后；
- core 决定候选是否能形成合法 Session，adapter 不通过 TypeScript cast 宣称存储数据可信；
- 空 candidates 表示项目没有 checkpoint；有候选但全部无效是明确恢复失败。

端口不暴露 IndexedDB transaction、object store、DOMException、OPFS handle 或浏览器生命周期。

## 候选回退

恢复协调按顺序逐个尝试候选：

1. 严格解码 checkpoint envelope；
2. 校验 checkpoint Project ID、内部 Project File Project ID 和请求 Project ID 一致；
3. 使用已解码 ProjectFileDTO 创建 fresh Session；
4. 第一个完整成功的候选成为恢复结果。

预期的数据失败会记录为 frozen candidate failure，并继续尝试下一候选。若 previous 成功，结果同时返回被拒绝的较新候选诊断；若全部失败，抛出带全部 failure 的 `ProjectCheckpointOperationError`。意外的内部编程错误不能被伪装成坏 checkpoint。

## 错误边界

本阶段区分：

- `ProjectCheckpointValidationError`：envelope 类型、字段、版本、ID、revision 或 Project ID 对应关系无效；
- `ProjectCheckpointOperationError`：store read/write 失败，或存在候选但没有任何可恢复 checkpoint；
- 嵌套 Project File 结构错误在 checkpoint decoder 中保留为 validation cause 和带 `projectFile` 前缀的 path；
- 已解码文件的领域错误继续保留 `ProjectFileLoadError`，并作为 candidate failure；
- Project File projector 自身失败不包装为 store write failure。

错误对象保留稳定 code、frozen path / candidate failure 集合和原始 cause，调用方不需要解析英文 message。

## 模块位置与公开边界

Checkpoint 是 project persistence 语义，放在现有 package 内的独立子目录：

```text
src/persistence/checkpoint/
├── project-checkpoint.ts
├── project-checkpoint-decoder.ts
├── project-checkpoint-error.ts
├── project-checkpoint-store.ts
└── project-checkpoint-coordinator.ts
```

package root 公开 checkpoint 值、decoder、store port、save/restore 函数、receipt/result 与错误类型。Checkpoint 不取得 ModelStore、MutationApplier 或 Session writer 能力。

Project File loader 增加包内“从已解码 DTO 组合 Session”的入口，使 checkpoint decoder 完成一次大型 DTO 复制后不再重复 decode；该入口不从 package root 导出。

## 测试边界

- Checkpoint factory 只捕获一次 Snapshot，输出深度冻结并与 Session 后续编辑隔离；
- envelope version、字段、data property、checkpoint ID、revision 和三处 Project ID 对应关系严格校验；
- decoder 输出与输入容器分离，并安全接受合法 opaque ID；
- 保存 receipt 固定来源 revision 与会话级 content-state identity；异步保存期间继续编辑不会改变 receipt 或 checkpoint；
- content-state identity 不进入持久化 envelope，fresh 恢复 Session 生成自己的初始 identity；
- store write/read failure 使用稳定 operation error 且不改变 Session；
- 空候选返回 `null`；
- active 有效时直接恢复，active 损坏时回退 previous 并保留诊断；
- 请求 Project ID 不匹配的候选不能被错误打开；
- 全部候选无效时返回完整、稳定顺序的 failure 集；
- 恢复后的 Session revision 为 `0`、History 为空、QueryIndex 可用并能继续执行 Command。

## 完成边界

本阶段完成 storage-neutral Checkpoint 协议、端口和协调后停止等待审阅。不连续实现 IndexedDB adapter、Studio 接入、JSON codec、checksum、migration、autosave、Journal 或 OPFS。

## 实施结果

本阶段已按上述边界完成：

- package root 已公开独立版本的 `ProjectCheckpoint`、opaque ID parser、factory、严格 decoder 与错误协议；
- `ProjectCheckpointStore` 只暴露可信 save 和按优先级返回不可信 candidates 的 storage-neutral 契约；
- `saveProjectCheckpoint` 只捕获一次 Snapshot，并以 frozen receipt 返回来源 revision；后续精确保存点阶段又在 receipt 中返回同一同步捕获边界的 Session content-state identity，但不改变 Checkpoint V1；
- `restoreProjectCheckpoint` 能区分空存储与全部候选损坏，并在结构、领域或请求 Project 错误后按顺序回退；
- Project File loader 增加未公开的 decoded-DTO 组合入口，避免恢复大型项目时重复全量 decode/copy；
- opaque ID 与 ModelRevision 的公共包内解析逻辑已复用，未为 Checkpoint 重复定义同一规则；
- Project Core 基线为 24 个测试文件、347 项测试；
- IndexedDB、Studio、JSON、checksum、migration、autosave、Journal 与 OPFS 均未进入本阶段。
