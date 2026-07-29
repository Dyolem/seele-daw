# MIDI Note Command 层执行计划

> 状态：实现完成
>
> 日期：2026-07-17
>
> 范围：`AddNoteCommand`、`MoveNoteCommand`、`RemoveNotesCommand`
>
> 2026-07-29 校准：单个与多个 Note 删除统一使用 `RemoveNotesCommand`；一元素
> `noteIds` 是单 Note 删除的规范表达，不再维护平行的单 Note 公共 Command。跨 Command
> 的数量与事务设计遵循
> [Project Command 集合与事务语义](./project-command-collection-semantics.md)。

## 文档目的

Project Core 已经具备受验证的领域 Record、私有规范化 ModelStore、跨实体不变量、可逆 MutationPlan 和原子 MutationApplier。本阶段负责建立第一层产品级编辑入口，把 MIDI Note 编辑意图翻译为安全的底层变化计划：

```text
ProjectCommand
-> validate and normalize command
-> check baseRevision
-> read ModelStoreReader
-> create domain Record
-> ProjectMutation[]
-> MutationPlan
```

本阶段不会创建 ProjectSession、ProjectCommit、ProjectDelta、History、QueryIndex、Snapshot 或持久化能力。Command handler 只准备计划，不领取写能力，也不发布提交。

## 已确认的产品决定

### Note 越界严格拒绝

Add 和同一 MidiSource 内的 Move 必须满足：

```text
note.startTick >= 0
note.durationTick > 0
note.startTick + note.durationTick <= midiSource.lengthTick
```

越界时 Command 返回类型化拒绝。第一版不执行以下隐式行为：

- 不 clamp 到 Source 边界；
- 不 wrap 到 Loop 区域；
- 不自动延长 MidiSource；
- 不自动改变 Clip span、offset 或 loop；
- 不在 Command 内执行 Snap 或量化。

如果产品以后需要“绘制或拖拽到边界外时自动扩展内容”，应把它定义为显式策略，并生成 `MIDI_SOURCE.REPLACE` 与 Note mutation 组成的多实体 MutationPlan。

### 无变化动作返回 `no-change`

Move 的绝对目标与当前 Note 的 `startTick`、`pitch` 都相同时，Command 准备结果为 `no-change`：

- 不创建空 MutationPlan；
- 不调用 MutationApplier；
- 不增加 modelRevision；
- 不产生未来的 ProjectCommit 或 History Entry。

即使目标看起来没有变化，也必须先验证 Command 并检查 `baseRevision`，避免静默吞掉基于陈旧模型的编辑意图。

Add 的重复 Note ID，以及 RemoveNotes 的任一目标不存在，都不是 `no-change`，而是调用方
状态与当前模型不一致的类型化拒绝。

## 模块归属

### 保留在 `@seele-daw/project-core`

Command 层属于 Project Core，而不是新的 workspace package，原因是：

- Command 表达对 Project 权威事实的产品级修改语义；
- handler 必须读取包内 `ModelStoreReader`；
- handler 必须调用 Project Core 的领域工厂；
- handler 必须生成包内 `ProjectMutation[]` 和 `MutationPlan`；
- 拆出独立包会迫使 ModelStoreReader、MutationPlan 或其他内部能力成为跨包 API，破坏当前封装；
- Command 不能依赖 Editor、Vue、Playback 或浏览器环境，因此仍符合 Project Core 的最内层依赖边界。

### 使用顶层 `src/commands/`

计划新增：

```text
packages/project-core/src/commands/
├── project-command-preparation.ts
├── project-command.ts
├── project-command-error.ts
├── project-command-preparer.ts
└── midi-note-command-handler.ts
```

目录职责：

- `project-command.ts`：公开的 Command 判别词汇、readonly Command Record 和构造函数；
- `project-command-error.ts`：稳定的产品语义拒绝错误；
- `project-command-preparation.ts`：包内 `ready` / `no-change` 准备结果；
- `project-command-preparer.ts`：共享校验、revision 检查和穷尽分派；
- `midi-note-command-handler.ts`：Add、Move、RemoveNotes 的无状态计划生成算法。

不放入 `model/`，因为 Command 不是可保存的项目事实；不放入 `mutation/`，因为 Command 表达产品意图，而 Mutation 只表达规范化存储变化。handler 当前没有跨调用状态、资源或生命周期，因此使用模块函数，不创建只有静态方法的 Class。

## Command 协议

### 共同约束

每个 Command：

- 使用 readonly 判别 Record；
- 携带调用方观察到的 `baseRevision`；
- 携带稳定实体 ID 和完整领域参数；
- 不读取 Selection、当前工具、Snap 设置、Pointer Event 或 Editor Preview；
- 不包含 History、Delta、Persistence 或 Playback 元数据；
- 不分配 ID，不读取随机数或时钟；
- 是内存协议，不直接作为 Journal 或 ProjectFileDTO 持久化。

### AddNoteCommand

```ts
interface AddNoteCommand {
  readonly type: 'midi-note.add'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}
```

调用方必须提供完整 Note 值。Project Core 不猜测默认 velocity、channel 或 duration。

### MoveNoteCommand

```ts
interface MoveNoteCommand {
  readonly type: 'midi-note.move'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
  readonly nextStartTick: Tick
  readonly nextPitch: MidiPitch
}
```

Move 使用绝对目标而不是 delta：

- Snap、量化和像素到 Tick/Pitch 的转换由 Editor 完成；
- handler 不依赖拖拽起点或选择状态；
- Note ID、MidiSource、duration、velocity 和 channel 保持不变；
- 跨 Source 移动不属于本 Command，未来应以独立产品语义讨论身份、所有权和历史规则。

### RemoveNotesCommand

```ts
interface RemoveNotesCommand {
  readonly type: 'midi-note.remove'
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}
```

RemoveNotes 接受同一 MidiSource 中非空、无重复的 Note ID 集合。单个 Note 删除使用
`noteIds: [noteId]`；它与多 Note 删除共享同一验证、Commit、Delta 和 History 语义。
Preparer 在建立计划前验证全部目标，任一目标缺失时不发生部分删除。Command 不缩短
MidiSource，不改变 Clip，也不清理空 Source。

这是一个由多选删除产品意图驱动的专用事务 Command，不代表 Project Core 已提供通用批量
Command、混合类型 Composite Command、跨 MidiSource 批处理，或多 Note Move / Resize。
内部仍由每个目标对应的单 Note Remove Mutation 表达最小事实变化。

## 准备结果

包内 Command preparer 返回判别联合：

```ts
type ProjectCommandPreparation =
  | {
      readonly status: 'ready'
      readonly command: ProjectCommand
      readonly plan: MutationPlan
    }
  | {
      readonly status: 'no-change'
      readonly reason: 'already-at-target'
      readonly baseRevision: ModelRevision
    }
```

准备结果保持包内。`ready.command` 是 preparer 重新验证后得到的规范化实例；它和
MutationPlan 共享由 Command 直接拥有的 Record 引用，供 Commit candidate 验证二者确实来自
同一次准备。ProjectSession 已将准备结果映射为公开的 execute result，并只对 `ready` 分支调用
MutationApplier。

## 准备管线

共享入口按以下顺序工作：

```text
normalize command through its constructor
-> validate baseRevision shape
-> compare command.baseRevision with reader.modelRevision
-> dispatch by command.type
-> resolve Source / Note from ModelStoreReader
-> apply command-specific product rules
-> create new MidiNoteRecord when needed
-> create one Note mutation
-> createMutationPlan(command.baseRevision, mutations)
```

Command 层的 revision 检查用于尽早拒绝陈旧产品意图；MutationApplier 仍保留自己的 revision 检查，负责真实写入边界的最终防御。

## 三个 handler 的计划

### Add

1. 验证并规范化完整 Command。
2. 确认 MidiSource 和对应 Note 分区存在。
3. 确认 Note ID 在整个项目内尚未使用。
4. 通过 `createMidiNoteRecord` 创建新 Record。
5. 验证 Note 半开区间完整落在 Source 内。
6. 创建一条 `NOTE.INSERT` mutation。
7. 创建 MutationPlan。

在 QueryIndex 尚未实现前，全局 Note ID 检查遍历 Note 分区。该扫描是临时正确性路径；未来可以由可重建索引优化，但索引不能改变身份规则或成为事实源。

### Remove

1. 验证并规范化 Command。
2. 确认 MidiSource 和对应 Note 分区存在。
3. 读取当前 MidiNoteRecord；目标不存在时拒绝。
4. 使用当前 Record 引用创建一条 `NOTE.REMOVE` mutation。
5. 创建 MutationPlan。

MutationPlan 自动生成的 inverse 将保留相同 Record 引用并恢复 Note。

### Move

1. 验证并规范化 Command。
2. 确认 MidiSource、Note 分区和目标 Note 存在。
3. 若绝对目标与当前位置和音高相同，返回 `no-change`。
4. 使用原 Note ID、duration、velocity、channel 和新的 start/pitch 调用 `createMidiNoteRecord`。
5. 验证新 Note 半开区间完整落在 Source 内。
6. 创建一条 `NOTE.REPLACE` mutation，`before` 为当前 Record，`after` 为新 Record。
7. 创建 MutationPlan。

## 错误边界

计划使用稳定的 `ProjectCommandError` code 表达产品语义拒绝：

- `invalid-base-revision`；
- `base-revision-mismatch`；
- `unknown-command-type`；
- `midi-source-not-found`；
- `midi-note-partition-missing`；
- `midi-note-not-found`；
- `note-id-already-exists`；
- `note-out-of-source-range`。

ID、Tick、duration、pitch、velocity 和 channel 的本地值域继续由已有 parser 与领域工厂验证。投影前置条件和全局 InvariantValidator 继续作为更底层的防御边界，不能被 Command 检查替代。

## 公开 API 与内部 API

计划从 package root 公开：

- `PROJECT_COMMAND_TYPE`；
- Add、Move、Remove Command 类型；
- 三个 Command 构造函数及其输入类型；
- `ProjectCommand` 联合类型；
- `ProjectCommandError` 及其 code 类型；
- Command 所需的 `ModelRevision` 类型。

以下能力继续保持包内：

- `ModelStore` 和 `ModelStoreReader`；
- Command preparer 与 handler；
- `ProjectMutation`；
- `MutationPlan`；
- `MutationApplier`。

公开 Command 表达上层可以创建的意图，公开 API 不提供绕过 ProjectSession 执行这些意图的写入口。

## 实现顺序

1. 更新权威模型文档，记录已经确定的 Add/Move Note 边界规则。
2. 建立 Command 判别词汇、Record、构造函数和错误类型。
3. 实现共享 preparer、Command 规范化、revision 检查和穷尽分派。
4. 实现 Add handler，打通 Record 创建与 `NOTE.INSERT`。
5. 实现 Remove handler，验证当前 Record 捕获与 inverse。
6. 实现 Move handler，落实绝对目标、`no-change` 和边界拒绝。
7. 增加 Command 构造、成功计划、拒绝、no-change、apply/inverse round trip 和公开 API 测试。
8. 运行 Project Core 测试、workspace type-check、架构检查和格式/静态检查。
9. 更新 README 当前状态与测试基线，然后停止等待阶段审阅。

## 实现结果

- Command 代码位于 `packages/project-core/src/commands/`，未新增 workspace package。
- package root 只公开 Command 判别词汇、Command Record / 构造函数、错误类型和 `ModelRevision` 类型。
- Command preparer、准备结果、handler、ProjectMutation、MutationPlan、MutationApplier 和 ModelStore 保持包内。
- Add、Remove、Move 分别生成单条 `NOTE.INSERT`、`NOTE.REMOVE`、`NOTE.REPLACE`。
- 严格 Source 边界、陈旧 revision、全局 Note ID、目标缺失、`no-change` 和 inverse round trip 均有确定性测试。
- Project Core 当前为 13 个测试文件、252 项测试；workspace 类型检查、架构检查、递归测试和 Studio production build 通过。

## 验收标准

- 三种 Command 都通过稳定判别联合表达，并携带 `baseRevision`。
- 构造函数拒绝非法 ID、Tick、duration、pitch、velocity、channel 和 revision。
- 陈旧 baseRevision 在任何计划创建前被拒绝。
- Add 只产生一条 `NOTE.INSERT`，且拒绝全局重复 Note ID 和 Source 越界。
- Remove 只产生一条 `NOTE.REMOVE`，目标缺失时拒绝。
- Move 只产生一条 `NOTE.REPLACE`，保持身份与非移动字段，Source 越界时拒绝。
- Move 到当前绝对目标返回 `no-change`，不创建 MutationPlan。
- 成功计划能够由现有 MutationApplier 应用，并且 inverse 作为新事务恢复原状态。
- Command 代码不能取得 ModelStore write access，也不导出 MutationApplier、MutationPlan 或 ModelStore。
- 不依赖 Vue、Editor、Playback、DOM、Web Audio、随机数或时钟。
- 完成该独立 Command 模块后停止，不连续实现 ProjectSession、Commit、Delta 或 History。
