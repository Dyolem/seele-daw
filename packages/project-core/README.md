# @seele-daw/project-core

`project-core` 是与框架和浏览器无关的项目内核，拥有 Web DAW 唯一的创作事实，并负责把一次编辑转换为可验证、可撤销、可订阅的原子提交。

> 当前状态：MIDI V1 领域记录、私有 ModelStore、全局不变量、合法初始化、MutationPlan、写时投影、MutationApplier 原子写入、Add / Move / Remove MIDI Note Command、Note 级 ProjectCommit / ProjectDelta、ProjectSession，以及会话级 History / Undo / Redo 已经实现；Query、Snapshot 和订阅尚未开始。

## 包定位

本包是依赖图最内层的业务包，只对纯编译期的 `@seele-daw/type-utils` 建立 package 依赖。Track、Clip、Note、Tempo、Device 等可保存、可撤销的数据只能由这里的 Project Model 持有。Vue、Canvas、AudioNode、Selection、波形缓存和播放头都不是项目事实源。

```text
Editor / Workbench
-> ProjectCommand
-> Project Kernel
-> ProjectCommit
   ├── Editor Read Model
   ├── Playback Compiler
   ├── Persistence
   └── Diagnostics
```

Project Kernel 只有一个写入者。Editor、Playback、Persistence 和 Vue 都是项目提交的消费者，不能绕过内核修改项目。

## 核心存储策略

本项目选择：

> 私有的受控可变实体表 + 不可变实体记录 + 提交级不可变外部语义。

这不是允许任意对象原地修改。可变性被限制在 `ModelStore` 的表容器和唯一的 `MutationApplier` 内；实体记录使用只读对象，每次修改以新记录替换旧记录；包外代码只能观察 Snapshot、Query Result、ProjectCommit 和 ProjectDelta。

```text
内部
  ModelStore
    Map / ordered ID collections   受控可变，不对外暴露
    Entity records                 readonly，修改时整体替换
  QueryIndex                       可变的派生缓存，可重建

边界
  MutationApplier                  唯一写入口

外部
  ProjectSnapshot                  稳定、带 revision 的不可变快照
  Query Result / Read Model        只读投影
  ProjectCommit / ProjectDelta     不可变提交结果
```

### 为什么不采用普通的纯不可变 Map 更新

纯不可变模型具有清晰的旧状态保留能力，但 JavaScript 中常见的写法会在单实体编辑时复制整张表：

```ts
const nextNotes = new Map(previousNotes)
nextNotes.set(noteId, changedNote)
```

当一个项目包含十万级 Note、千级 Clip 和多个派生索引时，这种复制成本会进入常规编辑路径。引入 HAMT、Immer 或自研持久化结构可以改变复杂度，但会提前增加依赖、调试成本和数据结构约束，而且仍需另外生成 Query invalidation 与 Playback delta。

受控可变表更符合本项目的访问模式：

- 大多数 Project Command 只修改少量已知实体；
- 批量编辑可以在一个 MutationPlan 中一次应用；
- Undo / Redo 已计划保存 forward/inverse mutations，而不是整棵旧状态；
- QueryIndex、Renderer 和 Playback 都需要精确的增量信息；
- 拖拽预览不逐帧写入项目，真正提交频率是事务级；
- Project Kernel 是单写者，不需要多个线程共享可写模型。

如果基准测试证明某张表需要持久化结构或分块存储，可以在 `ModelStore` 内替换实现，而不改变 Command、Commit、Query 和 Snapshot 契约。

## 状态分层

| 层级            | 是否权威                 | 是否可变       | 说明                                       |
| --------------- | ------------------------ | -------------- | ------------------------------------------ |
| ModelStore      | 是                       | 仅内核受控可变 | 保存实体表、有序关系和当前 `modelRevision` |
| Entity Record   | 是                       | 否             | 只读值对象；修改时创建新记录并替换表项     |
| QueryIndex      | 否                       | 受控可变       | 从 ModelStore 派生，失败后可以全量重建     |
| ProjectSnapshot | 某一 revision 的稳定视图 | 否             | 用于首次编译、保存、Worker 和诊断          |
| ProjectCommit   | 否                       | 否             | 一次提交的结果、版本和元数据               |
| ProjectDelta    | 否                       | 否             | 告知消费者哪些语义范围失效                 |
| History         | 否                       | 受控维护       | 保存可逆 mutation，不是项目文件            |
| Journal         | 否                       | 外部持久化     | 用于崩溃恢复，不等于 Undo History          |

只有 ModelStore 中的项目实体是当前创作事实。Snapshot 是某一 revision 的固定观察结果，QueryIndex 和 Delta 都可以丢弃并重新生成。

## ModelStore 组织原则

Project Model 使用规范化实体表，而不是深层可变对象树：

```text
ModelStore
├── project metadata
├── trackOrder: TrackId[]
├── tracks: Map<TrackId, Track>
├── clips: Map<ClipId, Clip>
├── midiSources: Map<MidiSourceId, MidiSource>
├── note storage: 按 MidiSource 所有权组织
├── devices: Map<DeviceId, Device>
└── current modelRevision
```

`ModelStore` 是包内 Class，不从 `@seele-daw/project-core` 的公共入口导出。实体表使用 ECMAScript `#private` 字段；内部消费者通过 `ModelStoreReader` 的类型化查找和迭代方法读取记录，不能取得 `Map`、`ReadonlyMap` 或 `trackOrder` 的数组引用。

构造输入使用已经规范化为实体表的 `ModelStoreSeed`，它不是外部 DTO。构造器复制 `trackOrder`、所有顶层 Map 和每张 MIDI Note 分区 Map，从而取得容器所有权；表中的只读 Record 保持原引用，避免为大型项目重新创建全部实体并保留引用相等语义。

ModelStore 构造器只取得存储容器所有权并注册内部 write lease，不验证或修复跨实体关系。Seed 是否满足 Track 顺序、外键、Source 所有权、Timeline 初始事件和 Device 所有权等全局规则，由 `InvariantValidator` 判断。新 Store 的 `modelRevision` 固定从 `0` 开始；构造器向包内 `WeakMap` 注册一组捕获 `#private` 字段的细粒度写闭包，只有 `MutationApplier` 可以一次性领取这份 lease。同一个 Store 不能创建第二个写入者，也不能从 Store 实例取得 Map、数组、通用 setter 或任意 patch 能力。

写闭包使用 compare-and-swap 语义：entity write 携带 expected / next Record，顺序 write 携带 index / ID，Note 分区删除携带完整 expected Record 集合。每个 primitive 必须先完成全部检查和临时结构准备，最后只执行一次权威容器修改。这样真实写入与投影之间一旦出现程序错误，MutationApplier 能准确知道哪些 forward mutation 已经完整完成。

这里描述的是组织原则。具体字段、所有权、运行时索引、持久化 DTO 和跨实体不变量以 [MIDI Project Model V1](./docs/midi-project-model-v1.md) 为当前实现基线。

该基线已经确定：

- 运行时使用私有 Map，项目文件使用 JSON 友好的 Record DTO；
- 所有 Clip 位于统一表中，并通过 `trackId` 单向引用 Track；
- Track 到 Clip 的反向查询由可重建索引提供；
- V1 中一个 MidiClip 独占一个 MidiSource，普通复制会深复制 Source 和 Note；
- Note 按 MidiSource 分区存储，不在每个 Note 中重复保存 `sourceId`；
- Add Note 与同一 MidiSource 内 Move Note 的严格边界已经确定；Clip Move、跨 Source Note Move、Resize 与 Split 留到对应命令实现前单独讨论。

必须遵守：

- 实体 ID 是不可变 opaque string，不包含数组下标或父级路径；
- 有序关系保存 ID 序列，实体内容保存在表中；
- 所有时间区间使用半开区间 `[start, end)`；
- 子实体拥有明确的所有者和删除语义；
- 不向包外返回内部 Map、可变数组或可写实体引用；
- 不通过任意 JSON path 修改领域对象；
- 不建立一份供 Vue 修改、另一份供 Audio 修改的双写状态。

### 为什么实体记录本身保持不可变

表容器允许 `set/delete/splice`，但表中的 `Track`、`Clip`、`Note` 等记录不直接修改字段：

```ts
const before = notes.get(noteId)
const after = { ...before, startTick: nextStartTick }
notes.set(noteId, after)
```

这样可以：

- 让 `before` 安全地用于 inverse mutation；
- 避免 Query consumer 持有的对象在背后改变；
- 让 selector 通过引用相等快速判断实体是否变化；
- 在开发模式冻结实体，尽早发现越权写入；
- 保留将单张表替换为其他存储实现的空间。

### 跨实体不变量验证

`InvariantValidator` 是接受 `ModelStoreReader` 的无状态纯函数模块，不持有 Store，也不使用只有静态方法的 Class。它返回带稳定错误码、诊断信息和相关实体引用的完整违规集合；需要强制合法状态的边界再通过 `assertModelInvariants` 抛出包含全部违规的 `ModelInvariantError`。

实体工厂负责名称、Tick、MIDI 值、gain、BPM 等单记录值域，InvariantValidator 负责必须同时观察多个实体或容器才能判断的顺序、外键、唯一所有权、Source 范围、Timeline 初始事件和设备拓扑规则。Validator 不修复模型，也不依赖 Map 插入顺序；违规列表按稳定诊断键排序。

Note 虽然按 MidiSource 分区存储，`NoteId` 仍在整个项目内保持唯一，`MidiNoteAddress` 用于直接定位分区而不是定义局部身份。Device 角色兼容性需要尚未实现的 Device Definition Catalog；当前只验证 Descriptor 存在且恰好拥有一个拓扑位置，未知实现仍可被完整保留。

### 合法项目初始化

`createInitialModelStore` 是包内的新项目初始化入口。调用方提供 Project、Tempo Event 和 Time Signature Event 的 opaque ID 以及项目名称；内核不调用 `crypto.randomUUID()`，因此初始化过程保持确定性并且不依赖浏览器或 Node 环境。

初始模型包含 Tick 0 的 120 BPM Tempo、Tick 0 的 4/4 Time Signature、unity gain 且未静音的空 Master，以及空的 Track、Clip、MidiSource、Note 分区和 Device 表。初始化完成后必须通过 `assertModelInvariants`，从而在未来增加新不变量时让过期的初始化逻辑立即失败，而不是发布非法 Store。

内核不会自动创建默认 Track。Instrument Track 需要明确的 Device Definition 和 Device ID，“新建项目时出现哪些轨道与设备”属于 Studio 产品模板。完整测试 fixture 也不等于产品默认项目：它只用于覆盖所有当前实体关系和拓扑位置。

底层初始化器不从 package root 导出，因为它返回包内私有的 `ModelStore`；公开 `createInitialProjectSession` 已经包装该流程。`ModelStore` 构造器仍保持低层职责，只复制已经规范化的 Seed，不自动验证或修复外部加载结果。

## ProjectSession 与内部组件

`ProjectSession` 是供上层使用的门面，不是管理所有系统的 God Object：

```text
ProjectSession
├── CommandProcessor       路由命令、检查 baseRevision
├── CommandHandlers        读取模型并生成 MutationPlan
├── InvariantValidator     验证跨实体和时间不变量
├── MutationApplier        唯一允许修改 ModelStore 的组件
├── ModelStore             保存实体表和 revision
├── HistoryController      forward/inverse、Undo/Redo 双栈
├── QueryIndex             派生索引和局部查询
├── SnapshotFactory        生成 revision-consistent snapshot
└── ChangePublisher        在成功提交后发布 ProjectCommit
```

Durability 和 Playback 通过端口或订阅接收结果。Project commit 不等待磁盘、音频设备或 Worker；外部失败不能回滚已经合法的创作事实。

当前 `ProjectSession` 已经公开 `modelRevision`、`canUndo`、`canRedo`、同步 `execute(command)`、`undo()` 和 `redo()`，并由公开 `createInitialProjectSession` 包装合法项目初始化。Session 的实际 Class、ModelStore、MutationApplier、HistoryController 和包内组合入口保持隐藏。`execute` 返回 frozen 的 `committed` / `no-change` 判别联合：ready 分支在写入前构造完整 Commit、结果外壳与 History transition，apply 成功后直接返回；no-change 不生成计划、Commit、revision 或 History entry。空 History 的 Undo / Redo 返回 `null`，实际重放则返回新的 ProjectCommit。Query、Snapshot、listener 和故障恢复状态留给后续独立模块。完整边界见 [ProjectSession 最小执行门面计划](./docs/project-session-execution-foundation-plan.md) 与 [Project History / Undo / Redo 基础层计划](./docs/project-history-foundation-plan.md)。

## 命令与原子提交管线

一次写入严格经过：

```text
ProjectCommand
-> resolve handler
-> validate command and baseRevision
-> read current entity records
-> build forward mutations
-> create a closed MutationPlan with generated inverse mutations
-> prepare immutable ProjectCommit + ProjectDelta candidate
-> freeze committed execute result
-> prepare and stage the History transition
-> MutationApplier projects and validates the plan, then applies mutations
-> modelRevision + 1
-> return the already prepared result
```

History 已接入同一原子边界：普通 committed Command 进入 undo 栈，Undo / Redo 从当前 revision 重新建立 MutationPlan，并在模型写入前暂存新的双栈头；apply 失败会恢复旧栈头。QueryIndex、ChangePublisher、durability 和 Playback 尚未接入。它们必须延续同一边界：可预计算内容在写前准备，可重建派生状态在提交后恢复，外部 listener 或 I/O 失败不能回滚已经合法的模型提交。

### MIDI Note Command 纵向切片

当前已经实现 `AddNoteCommand`、`MoveNoteCommand` 和 `RemoveNoteCommand`。公开 Command 使用稳定判别字段、完整领域参数和 `baseRevision`；包内 preparer 重新验证 Command、拒绝陈旧 revision，并通过无状态 handler 读取 `ModelStoreReader`、创建 MidiNoteRecord 和一条 Note mutation，最终形成 MutationPlan。

Add 和同一 MidiSource 内的 Move 使用严格 Source 边界，不 clamp、wrap 或自动扩展 Source / Clip。Move 使用绝对 `nextStartTick` 与 `nextPitch`，目标未变化时返回包内 `no-change`，不创建空 MutationPlan。Command preparer 与 handler 不从 package root 导出；ProjectSession 是正式执行入口。完整规则和实现边界见 [MIDI Note Command 层执行计划](./docs/midi-note-command-layer-plan.md)。

### ProjectCommit / ProjectDelta 基础层

当前公开契约能够表达 `midi-note.added`、`midi-note.removed` 和 `midi-note.updated` 三种语义变化。每条 change 携带 Source / Note 身份、before / after Record，以及半开区间形式的受影响 Tick 范围；Move 使用旧、新区间的保守并集。Delta 保持实际执行方向的 mutation 顺序并携带提交后的 `modelRevision`，Commit 记录 base / committed revision，以及 Command 或 History origin；History origin 额外记录 Undo / Redo 方向和原始 Command 类型。

包内 Commit candidate 工厂在 MutationApplier 写入前验证 Command / Plan 对应关系、推进 revision 并完成全部 Delta 映射。当前不支持的 mutation 会失败关闭，避免模型变化被静默遗漏；ProjectSession 只在 apply 成功后返回已准备好的候选。Delta 构造不是独立生产入口，也不为白盒测试额外导出。所有结果外壳在运行时冻结，领域 Record 继续保持引用共享。完整边界见 [ProjectCommit / ProjectDelta 基础层执行计划](./docs/project-commit-delta-foundation-plan.md)。

### MutationPlan 的作用

MutationPlan 是结构完整且可逆的变化计划。它只包含：

- 当前 `baseRevision`；
- 类型化的 forward mutations；
- 由工厂自动生成、按执行顺序排列的 inverse mutations。

Mutation 使用领域类型表达，例如 entity insert/remove/replace、ordered relation insert/remove，而不是任意 JSON Patch。计划工厂负责拒绝空计划、身份变化、同引用 replace 和无效顺序索引，并冻结自身拥有的 mutation / 数组；包内 `WeakSet` 证明 plan 外壳、mutation 序列和 inverse 由同一个工厂配对，使 Applier 不会信任仅在 TypeScript 结构上相似的对象或 plan Proxy。该证明不会复制或深冻结 payload Record；Record 仍遵守项目既定的运行时共享、逻辑不可变契约。计划工厂不读取 ModelStore，因此仍不声称该计划适用于某个具体 Store。`MutationApplier` 必须先在写时复制投影上验证 revision、当前记录引用、关系位置和最终跨实体不变量，全部通过后才进入真实写入阶段。

所有 mutation 判别名称集中在包内 `PROJECT_MUTATION_TYPE` 常量表中；类型定义、穷尽分支和测试共同引用这份运行时词汇。Mutation 的 payload 结构仍由显式判别联合描述，不从常量表动态生成。

History label、merge key、Editor restore point 和 Delta 提示分别属于后续 History、Command 或 Commit 包装层，不放进底层 MutationPlan。这样回滚机制不会反向依赖界面交互或发布协议。

### 原子性保障

- `MutationApplier` 构造时验证初始 Store，并一次性领取该 Store 的唯一写 lease；第二个 Applier 无法绕过 faulted 状态继续写入；
- apply 首先拒绝 faulted / reentrant 调用，再精确检查 `baseRevision`，并在任何写入前计算不会溢出的下一 revision；
- 所有存在性、权限、范围和跨实体不变量在 apply 前验证；
- `ProjectedModelStoreReader` 通过实体表 overlay、删除标记和按需复制的 Track 顺序 / Note 分区预演完整 forward 序列，不复制整个项目；
- 每条基础 mutation 只检查当前投影视图上的存在性、`before` 引用和顺序位置，最终投影只执行一次全局 `InvariantValidator`，因此允许级联操作的中间状态暂时不完整；
- MutationApplier 通过 CAS 写闭包按确定顺序执行已经验证的基础操作，并在真实 Store 上再次执行防御性不变量检查；
- `modelRevision` 是成功路径的最后一次写入，一份计划只递增一次，失败和回滚都不能递增或倒退 revision；
- Commit / Delta 候选在写入前完整准备，只有全部成功后才能返回和发布；
- 业务失败不会产生部分模型、History Entry 或可观察的 Delta；
- History transition 在模型写入前只替换私有 undo / redo 栈头；apply 失败时恢复旧栈头，成功 revision 写入后不再分配 History 节点；
- 意外程序错误发生在第 `k` 条已完成的 forward 之后时，只执行完整 inverse 数组末尾对应的 `k` 条 mutation；回滚后重新验证不变量和原计划前置条件。这里依赖唯一写 lease 与 CAS primitive 的正确性，不通过每次提交前复制整个 Store 来对抗任意内部实现错误；
- 如果防御性回滚或恢复验证失败，MutationApplier 立即锁存为 faulted，并同时保留 apply cause 与 rollback cause；未来 Session 在此基础上进入 faulted/read-only 状态。

普通实体表和 Note 表的 Map insertion order 不是项目语义。remove 后通过 inverse insert 会恢复原 Record 引用和项目关系，但键可能追加到 Map 尾部；显式顺序只由 `trackOrder` 等 ID 序列表达。未来 Snapshot / DTO 如需确定性输出，应在对应边界稳定排序，不能让内部 Map 顺序成为隐藏领域规则。

QueryIndex 不是事实。索引的增量更新失败时，应从已经一致的 ModelStore 重建；不能让模型与索引各自成为一份可写真相。

## Undo、Redo 与 Journal

当前 History 是 `ProjectSession` 私有的会话状态，每个 entry 保存原始 Command 类型和类型化的 forward / inverse mutations：

```text
HistoryEntry
├── commandType
├── forward mutations
└── inverse mutations
```

- undo / redo 使用不可变单链栈节点，push / pop 只替换栈头，复杂度为 O(1)；
- Undo 和 Redo 从当前 revision 创建新的 MutationPlan，仍通过完整提交管线、继续验证不变量并产生新的 ProjectCommit / ProjectDelta；
- 新的 committed Command 清空 redo 分支；no-change、命令拒绝和 apply 失败保留原分支；
- 空栈返回 `null`，不推进 revision；
- History 不直接写入项目文件，也不跨 Session 保留；
- label、Editor restore point、gesture merge 和容量淘汰需要后续产品规则，本阶段没有猜测默认行为；
- Journal 用于崩溃恢复，具有独立 sequence、checksum 和持久化格式；
- 不能把内存 Mutation 对象未经版本化就永久保存为 Journal。

## Query、订阅与 Read Model

外部读取通过 Query 和局部订阅完成，禁止取得内部表：

```text
session.query(query)
session.subscribe(filter, listener)
session.getSnapshot()
```

QueryIndex 规划维护：

- `trackId -> ordered clips`；
- 时间范围到 Clip；
- `sourceId + tick/pitch range -> notes`；
- `assetId -> referencing entities`；
- Track 到 Device / Routing summary。

订阅使用 topic、entity ID 和时间范围过滤。不能用单个全局 revision ref 让 Mixer、Piano Roll、Inspector 和 Arrangement 在任意 Note 变化后全部重算。

Query 返回只读投影或稳定实体记录：未变化实体可以保持引用相等，变化实体必须是新引用。大型集合优先返回窗口化、分页或迭代结果，不能把十万 Note 在每次提交后复制给 Vue。

## Snapshot 语义

`ProjectSnapshot` 必须是某个明确 `modelRevision` 的稳定不可变值，不能只是指向仍会变化的内部 Map。

Snapshot 主要用于：

- 首次 Playback 全量编译；
- ProjectFileDTO 生成和 checkpoint；
- 发送到 Worker 的版本化输入；
- 导出、诊断和测试 fixture。

Snapshot 不在每个 pointermove 或普通 selector 中生成。V1 可以在低频边界显式复制规范化表；如果大项目 checkpoint 的复制成本成为瓶颈，再根据 benchmark 引入分块、copy-on-write 或结构共享。优化只能发生在 SnapshotFactory/ModelStore 内部，不能改变外部稳定语义。

## ProjectDelta 与消费者同步

ProjectDelta 描述一次提交造成的语义变化，例如：

```text
entity changes
query invalidations
timeline ranges
graph invalidations
asset reference changes
```

规则：

- Delta 由 MutationPlan 和提交结果直接生成，不通过深比较前后完整模型推断；
- Delta 携带提交后的 `modelRevision`；
- Playback 使用自己的 `engineGeneration`，不能复用 modelRevision；
- Persistence 使用 `journalSequence`，不能复用 modelRevision；
- Delta 可以丢弃；消费者错过增量后必须能从 Snapshot 全量重建。

当前已实现 Note Add / Remove / Update 的 change 映射和受影响 Tick 范围；query invalidation、graph invalidation 与 asset reference change 仍由后续对应模块补充。

## 并发与线程模型

V1 中 Project Kernel 运行在主线程并保持单写者：

- Worker 不共享或直接修改 ModelStore；
- Worker 接收带 revision 的 Snapshot/DTO，返回带 request ID/revision 的结果；
- 过期 Worker 结果被丢弃或重新计算；
- AudioWorklet 只接收 Playback 编译结果，永远不读取 Project 对象；
- 云同步以后通过稳定 Command/Delta/cloudVersion 边界接入，不提前把模型改造成 CRDT。

## 性能策略

- 单实体编辑只替换目标实体记录，不复制完整实体表；
- 批量选择、量化和粘贴使用一个 MutationPlan 批量提交；
- 拖拽、缩放和框选的逐帧 Preview 留在 Editor；
- QueryIndex 按 Delta 增量维护，并始终提供全量重建路径；
- Snapshot 和序列化只在明确的低频边界执行；
- 从 MIDI 纵向切片开始记录 command、validation、apply、index 和 snapshot 时长；
- 使用 100k Note / 32 Track 固定数据验证 P50/P95，而不是凭感觉引入 Immer、HAMT 或自研结构。

## 主要职责

| 领域     | 规划职责                                                            |
| -------- | ------------------------------------------------------------------- |
| 模型     | ProjectModel、受控实体表、有序 ID 集合、跨实体不变量                |
| 文件边界 | ProjectFileDTO、运行时校验、迁移、normalize；DTO 不直接充当内存模型 |
| 时间     | branded Tick、PPQ、TempoMap、半开区间 `[start, end)`                |
| 命令     | 完整参数的 ProjectCommand、baseRevision 校验、MutationPlan          |
| 提交     | 原子应用、modelRevision、类型化 ProjectDelta、ChangePublisher       |
| 历史     | Undo / Redo、inverse mutation、gesture merge、EditorRestorePoint    |
| 查询     | QueryIndex、局部 selector、按 topic/entity/range 订阅、索引重建     |
| 端口     | Durability、Playback Sync 等外部能力的接口，不包含浏览器实现        |

## 建议的内部模块

目录随第一条 MIDI 纵向切片逐步生长，不预建空泛层级：

```text
src/
├── model/          ModelStore、实体、ID 与不变量
├── time/           Tick、区间、TempoMap
├── mutation/       可逆基础变化、MutationPlan 与原子应用
├── commands/       Command 与 handler
├── commit/         ProjectCommit、ProjectDelta 与语义 change
├── session/        ProjectSession、提交管线与通知
├── history/        Undo / Redo 与合并策略
├── queries/        QueryIndex、查询与订阅
├── snapshots/      稳定 Snapshot 生成
├── persistence/    DTO、迁移与持久化端口
└── index.ts        唯一公开入口
```

这些名称是规划方向，不要求一次性全部创建。只有产生真实代码和稳定职责时才新增目录。

目录归属遵守以下规则：

- 通用规范化实体和所有权结构放在 `model/`；
- 已经形成独立规则与算法体系的子领域可以提升为顶层模块；
- 目录位置不决定数据是否持久化，是否进入 `ModelStore` 才决定它是不是项目事实。

因此，Timeline 虽然拥有可持久化的 Tempo Event 和 Time Signature Event，仍可以作为 `time/` 顶层子领域组织；其事件进入 `ModelStore` 后依然是权威项目事实。目录表达的是代码职责与领域内聚性，而不是持久化层级。

## 公开 API 原则

- 其他包只能从 `@seele-daw/project-core` 公开入口导入，禁止深层路径导入；
- 不导出内部 Map、可变数组、MutationApplier 或 ModelStore；
- 包外写入只通过 ProjectSession.execute / undo / redo，不提供直接 plan/apply 入口；
- 命令必须携带稳定实体 ID 和完整参数，不能读取 Editor Selection；
- 一次用户动作只增加一次 modelRevision，并只产生一个 History Entry；
- Commit、Delta、Snapshot 和 Query Result 在包外视为不可变；
- Project commit 不等待 Audio Runtime、IndexedDB、OPFS 或网络；
- 索引、缓存和运行时计划必须可以从 Snapshot 重建。

## 依赖边界

本包只允许依赖不产生运行时代码的 `@seele-daw/type-utils`；Brand、ValueOf 等跨领域类型工具由该独立包拥有。

本包禁止依赖：

- Vue、Pinia 或任何 UI 框架；
- DOM、Canvas、Web Audio 或具体 AudioNode；
- IndexedDB、OPFS、File System API；
- `apps/studio`、`editor`、`playback`、`audio-web`、`platform-browser`；
- 无明确领域所有者的 `shared`、`utils` 收容模块。

运行环境仅使用 ECMAScript 能力，核心测试必须能在 Node.js 中执行。

## 分阶段计划

1. 建立 ModelStore、opaque ID、Tick 和只读实体记录约定。
2. 按 [MIDI Project Model V1](./docs/midi-project-model-v1.md) 定义 Project、Instrument Track、MidiClip、MidiSource、Note、Timeline 和最小 Device Descriptor。
3. 实现 MutationPlan、MutationApplier 和原子提交骨架。
4. 实现 `AddNoteCommand`、`MoveNoteCommand`、`RemoveNoteCommand`。
5. 建立 Note 级 ProjectCommit、ProjectDelta 与写前准备边界。
6. 实现 ProjectSession 最小执行门面和提交发布时机。
7. 实现 Undo / Redo，并验证一次拖拽只产生一次历史记录。
8. 增加 QueryIndex 与局部订阅。
9. 定义 ProjectSnapshot、ProjectFileDTO、schema validation 和迁移。
10. 接入 snapshot/journal 端口；Audio Clip、完整 Device 能力和 Automation 只在对应产品阶段加入。

## 测试与验收

当前 Project Core 基线为 16 个测试文件、282 项测试，其中 History / Undo / Redo 基础层新增 9 项。

测试套件保持在 `src/__tests__/*.spec.ts` 平级组织；复用 fixture、driver 和断言助手统一位于 `src/__tests__/support/`。生产目录不得为白盒测试暴露额外入口，生产源码反向依赖 `__tests__` 会被架构检查拒绝。详细规则见 [`src/__tests__/README.md`](./src/__tests__/README.md)。

- 只有 MutationApplier 可以修改内部表的架构约束测试；
- 同一个 ModelStore 的 writer lease 只能领取一次；
- 全部 mutation 分支的真实结果与写时投影一致，成功计划只递增一次 revision；
- 陈旧计划、重复 apply、revision 溢出和投影验证失败都不会执行真实写入；
- apply 中部分写入失败时只回滚已经完成的 forward 前缀，成功恢复后 revision 保持不变；
- rollback 失败时保留双重 cause、锁存 faulted，并永久拒绝后续 apply；
- 命令成功、拒绝和陈旧 `baseRevision` 的确定性测试；
- apply 中意外失败时不发布部分 Commit，并能完成防御性回滚；
- 每种命令的 forward/inverse round trip；
- 随机命令序列后的模型不变量；
- 未变化实体保持引用，变化实体产生新只读记录；
- QueryIndex 与全量扫描结果一致，索引重建结果一致；
- Snapshot 在后续提交后仍保持原 revision 内容；
- snapshot、迁移与 journal replay 的 golden fixtures；
- 100k Note / 32 Track 下的 command、apply、query 和 snapshot benchmark。

## 架构依据

- [阶段成果：安全模型与原子 Mutation 内核](./docs/project-core-transaction-foundation-milestone.md)
- [MIDI Note Command 层执行计划](./docs/midi-note-command-layer-plan.md)
- [ProjectCommit / ProjectDelta 基础层执行计划](./docs/project-commit-delta-foundation-plan.md)
- [ProjectSession 最小执行门面计划](./docs/project-session-execution-foundation-plan.md)
- [Project History / Undo / Redo 基础层计划](./docs/project-history-foundation-plan.md)
- [MIDI Project Model V1](./docs/midi-project-model-v1.md)
- [Record、Class 与生命周期协作者](./docs/records-classes-and-lifecycles.md)
- [小型实体、组合边界与模型演进](./docs/small-records-and-model-evolution.md)
- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
