# Web DAW 架构复盘与精简提案（2026-10）

> 状态：已实施（2026-10-23）。结果、偏差与复测数字见[第 9 节](#9-实施结果2026-10-23)；现状以
> [ARCHITECTURE](../../ARCHITECTURE.md) 为准。下文第 1–8 节保留评审时的原文，文中的文件路径
> 指向基线 `e556d9e`，其中一些文件已被删除。
>
> 日期：2026-10-23
>
> 代码基线：`main` 分支 `e556d9e`
>
> 适用范围：全仓库，重点是 `apps/studio`、`packages/project-core`、`packages/editor` 与
> `packages/playback`。

## 0. 如何使用本文

本文回答三个问题：当前架构是什么样、哪些设计是冗余的、应该往哪里收敛。它补充而不替代
[简洁架构总纲](../archive/architecture/web-daw-architecture-brief.md)与
[长期路线与架构设计 v3](./web-daw-long-term-architecture-v3.md)，也不修改任何既有规范。

文中的数字均在代码基线上测得，复测方法见文末附录。迁移路线中的每一步都应单独评审、单独
合并。

## 1. 结论

1. 宏观架构是对的，不需要推倒重来。ProjectSession 作为唯一事实源；所有修改走命令、事务和
   历史；编辑和播放是项目的两个消费者；核心不依赖平台；Studio 是唯一组合根。这些决定都
   站得住，包之间的依赖方向也基本干净。
2. “做一个功能要改很多文件”的主因不是层数多，而是两件事：
   - 同一份知识在每一层各写了一遍；
   - 每个概念都套用同一套模板：interface + Impl + factory + 专属错误类 + Vue context +
     Vue 错误类 + Symbol + 组合根登记。
3. Coordinator 有一半确实包装过度。编辑类（Clip / Track / Tempo / Note / CC64）包装过度，
   其中 Tempo 基本只是转发；播放、项目生命周期、导航确认、MIDI 导入是真正的协调者，但播放
   协调器已经长到 1590 行。最贵的不是 Coordinator 类本身，而是它周围那一圈配套文件。

## 2. 证据：改动面有多大

| 指标                                       | 数值                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CC64（延音踏板）一个功能涉及的非测试源文件 | 77 个：Studio 25、editor 14、project-core 30、project-midi 5、playback 3                                                                                                                                                                                                                                                                                                                                                          |
| 最近几次结构性重构提交改动的文件数         | 124（`c614b9c`）/ 51（`5179bee`）/ 49（`2b2d8c6`）/ 47（`f65bd17`）/ 35（`c83d906`）                                                                                                                                                                                                                                                                                                                                              |
| 变更次数最多的非测试源文件                 | [`project-core/src/index.ts`](../../packages/project-core/src/index.ts) 31 次；[`ProjectWorkbenchArrangement.vue`](../../apps/studio/src/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue) 26 次；[`ProjectWorkspacePage.vue`](../../apps/studio/src/features/project-workspace/ProjectWorkspacePage.vue) 25 次；[`studio-application.ts`](../../apps/studio/src/bootstrap/studio-application.ts) 22 次 |
| 文档量                                     | 114 个 `.md`，共 1.65 MB；同期生产源码 2.37 MB，测试 2.10 MB                                                                                                                                                                                                                                                                                                                                                                      |

改得最多的都是“枢纽文件”，也就是每加一个概念都必须去登记的地方。CC64 本身横跨模型、编辑、
播放与导入，涉及面大是正常的；不正常的是 project-core 里那 30 个文件，其中大部分只是按实体
机械地增加分支。

拖动一个音符，从 Pointer 事件到提交后重新选中，大约要经过 20 跳：

```text
PointerInputAdapter → PianoRollInteractionSession → InteractionSession → MoveOperation
→ intent → useNoteInteraction → IntentHandler → ProjectMidiNoteCoordinator
→ execute → prepare（normalize + revision + handler）
→ CommitCandidate（delta + 命令与 plan 的对应校验）
→ History / QueryIndex / ChangePublisher 预备
→ MutationApplier（投影 + 全量不变量 + 写入 + 再次全量不变量）
→ ActiveProjectService → Vue 绑定 / 播放重编译 / dirty
→ handoff → 选中 → finish
```

每一跳单独看都有道理，但新增一种编辑，要在其中 6–8 跳里各写一段。

## 3. 冗余诊断

按代价从高到低排列。

### 3.1 Coordinator 逐个评估

| Coordinator                                                         | 行数      | 判断                                                                                                                       |
| ------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ProjectPlaybackCoordinator`                                        | 1590      | 真协调者，但同时管 ActiveProject 订阅、编译、Transport、Scheduler、资源准备、Voice 与 Locate，有 20 多个可变字段，需要拆分 |
| `ActiveProjectService`                                              | 610       | 合理：项目生命周期状态机、保存与 dirty                                                                                     |
| `ProjectNavigationConfirmationCoordinator`                          | 298       | 合理：异步未保存确认与竞态                                                                                                 |
| `ProjectMidiImportCoordinator`                                      | 188       | 合理：解码 → 映射 → 激活                                                                                                   |
| `ProjectEntryCoordinator`                                           | 176       | 合理，可以退化为一个函数                                                                                                   |
| `ProjectMidiNoteCoordinator` / `ProjectMidiSustainPedalCoordinator` | 498 / 421 | 一半必要：Track 放置 → 命令的映射；一半与 core 重复：存在性与修订号校验                                                    |
| `ProjectTrackCoordinator` / `ProjectClipCoordinator`                | 179 / 114 | 只承载产品默认值（命名、配色、默认乐器、小节对齐），普通函数即可                                                           |
| `ProjectTempoEventCoordinator`                                      | 139       | 4 个方法里有 3 个只是“就绪检查 + execute”，不符合准则 6.3 “Coordinator 不应只是转发一个方法”                               |

配套成本：每个应用能力都要有 coordinator、error、`vue/*-context`、`vue/*-vue-error`、
`symbols.ts` 中的一个 key、
[`studio-application.ts`](../../apps/studio/src/bootstrap/studio-application.ts) 中的构造与
provide，以及对应测试。具体表现：

- 8 个 Vue 错误类中，7 个只有 `missing-context` 一个错误码；
- 5 个编辑错误类都带一组 typed 字段（clipId、sourceId、trackKind 等），生产代码只在 1 处按
  类型判别（`use-track-sustain-pedal.ts`）；整个 Studio 应用层的错误类在生产代码中也只有
  2 处判别，其余地方只读 `.message`；
- `phase !== ACTIVE_PROJECT_PHASE.READY` 守卫复制了 11 处，
  `'unexpectedly produced no Project change'` 复制了 8 处；
- 两个 Vue Binding 暴露的 `stateDeliveryFailure` 没有消费者；
- 同一个 Action Runtime（或其子对象）通过 6 个不同的 InjectionKey 分别 provide；
- 组合根有两份按 7 个资源逐层嵌套的 `try / finally`：正常释放一份，构造失败回滚一份。

### 3.2 同一不变量被校验 3–4 次

以 MoveNotes 为例：

1. Studio 协调器检查 Clip、MidiSource、Note partition 是否存在，以及 Session 是否过期
   （`project-midi-note-coordinator.ts`
   的 `requireEditableMidiNoteTarget`）；
2. core handler 再检查 MidiSource、partition、修订号与范围；
3. [`project-commit-candidate.ts`](../../packages/project-core/src/commit/project-commit-candidate.ts)
   中约 500 行 `matchesXxx` 把每条命令的语义重新实现一遍，用来核对 MutationPlan；
4. [`mutation-applier.ts`](../../packages/project-core/src/mutation/mutation-applier.ts) 先构造
   投影（[`ProjectedModelStoreReader`](../../packages/project-core/src/mutation/projected-model-store-reader.ts)
   的构造函数做一次全量 `assertModelInvariants`），写入后再做一次全量校验。

Studio 侧的查找本身是必要的：要把 Clip 局部 Tick 换算为 Source Tick。多余的是为每种缺失定义
独立错误码，以及重复 partition 与修订号检查。

第 3 条存在的根本原因，是下游按命令类型路由行为。播放协调器的
`supportsSelectiveReconciliation` 与 `reschedulesActiveVoiceRelease` 都是对命令类型的穷举
`switch`，播放 reconciliation 也给每个变化附带 `commandTypes`。消费者依赖的是命令标签而不是
Delta，core 才必须证明“标签与 plan 一致”。Tempo 已经改为按 Delta 路由（`changesTempoMap`），
方向正确，只是没有推广。这也意味着新增任何命令类型，都必须修改 Studio 的播放协调器。

每次提交两次全量校验是 O(项目规模) 的开销：导入大型 MIDI 后，单次拖拽的成本会随项目大小
线性增长。该结论来自代码阅读，尚未做基准测试。

### 3.3 手势 Session 复制了 4 份

“共享交互生命周期”重构只抽出了内层的 `InteractionSession` 与 `InteractionCommitHandoff`。
外层包装在每处都抄了一份：Pointer capture 匹配、过期检查、提交订阅、executing 认领、
handoff、publish / clear。

| 文件                                                                                                                                          | 行数 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| [`tempo-track-drag-session.ts`](../../apps/studio/src/features/project-workspace/tempo-track/interaction/tempo-track-drag-session.ts)         | 240  |
| [`track-placement-session.ts`](../../apps/studio/src/features/piano-roll/components/track-surface/interaction/track-placement-session.ts)     | 240  |
| [`piano-roll-interaction-session.ts`](../../packages/editor/src/common/piano-roll/interaction/piano-roll-interaction-session.ts)              | 311  |
| [`sustain-pedal-interaction-session.ts`](../../packages/editor/src/common/piano-roll/sustain-pedal-lane/sustain-pedal-interaction-session.ts) | 283  |

前两者统一命名后只有 46 行不同；后两者结构相同。另有 4 处 intent 收尾流程（“认领 → 执行 →
确认提交 → 选中 → finish”）各写一遍：两个 Piano Roll intent handler、`use-tempo-track-drag.ts`
与 `use-track-placement.ts`。

### 3.4 project-core 的实体代码按技术层摊开

内核本身很扎实（ModelStore + 可逆 Mutation + History + revision）。问题在于 Mutation 类型、
applier、projected reader、change 推导、commit candidate、invariant validator 与 persistence
都为每种实体手写一个分支，没有针对“实体表”泛化。CC64 这一种实体就涉及 project-core 的
30 个文件；路线图上的 Automation、Audio Clip、Mixer 每一个都会再付一次同样的代价。

### 3.5 Action 元数据拆成多张平行表

新增一个 Action 依次要改：`STUDIO_ACTION` 加 ID →
`studio-action-catalogue.ts`
加文案 →
`studio-default-keymap.ts`
加快捷键策略 → 某个 `create*Actions` 加 `resolve`。

如果需要新的焦点上下文，还要改 `StudioKeyboardContext` 类型、`STUDIO_KEYBOARD_CONTEXTS`、
[`studio-action-runtime.ts`](../../apps/studio/src/bootstrap/studio-action-runtime.ts) 中的
target slot 与 `isContextActive` switch、`symbols.ts`、组合根 provide，以及一个 inject hook，
最多约 10 处。`satisfies Record<StudioActionId, …>` 能保证不会漏改，但不能减少要改的地方。

### 3.6 UI 数据流有两套风格

- Piano Roll 的 hook 直接 inject 协调器来写入；
- Tempo 编辑从 `TempoTrackLane` / `TempoTrackControl` 出发，经 `ProjectWorkbenchArrangement` →
  `ProjectWorkbenchWorkspace` → `ProjectWorkbenchShell` → `ProjectWorkspacePage`，把 6–7 个
  事件一层层原样转发。

结果是每个 Tempo 交互都要改 4–5 个组件，而中间几层并不关心 Tempo。

### 3.7 其他

- 上帝组件：`ProjectWorkbenchArrangement.vue` 1334 行，`ProjectWorkspacePage.vue` 722 行，
  几乎所有派生都写在页面里；准则 9.1 要求接近 800 行时重新评估。
- 读路径不统一：[`createProjectSnapshot`](../../packages/project-core/src/snapshots/project-snapshot.ts)
  每次复制并排序所有表，`getSnapshot()` 不按 revision 缓存；同时还有 `query()` 索引读路径，
  但没有规则说明什么时候用哪个。
- 架构规则冻结了目录形状：检查除了守护依赖方向，还规定了 keyboard 的 7 层、piano-roll 的
  `hooks / types` 私有性和 Symbol 集中登记，所以每次重组都要同时改规则。
- 文档过多过散：有为单个协调器方法写的 phase plan（如
  [`add-empty-midi-clip-coordinator-plan.md`](../archive/studio/add-empty-midi-clip-coordinator-plan.md)），
  [架构总纲](../archive/architecture/web-daw-architecture-brief.md)的 0.1 节已经变成变更日志，而
  [ADR 目录](../adr/README.md)仍是空的。知识分散在 114 个文件里，这本身就是项目难以整体
  把握的重要原因。

## 4. 根因

1. 按技术层组织，而不是按概念组织：一个概念被切成很多片，散在各层。
2. 每一层都做纵深防御：每一层都必须“认识”每一个新概念。
3. 仪式与需要不成比例：无状态用例也套全套 class、专属错误和专属 context。
4. 抽象只做了一半：交互生命周期与 Action 系统的核心已经抽出，外壳仍逐个复制。

## 5. 目标架构

### 5.1 原则

1. 一个概念，一个家。一条命令的校验、Mutation 与 inverse 放在一个文件；一个 Action 的 ID、
   文案、快捷键与处理写在一个声明里。
2. 在权威处只校验一次。业务不变量只放在 project-core；Studio 只检查应用层前置条件（项目
   是否就绪、手势目标是否仍有效）；core 错误码在一张表里统一映射成用户文案。
3. 消费者依赖 Delta，不依赖命令名。
4. 仪式与需要成比例。无状态用例写成普通函数；只有拥有生命周期或状态的对象才是 class 或
   service。
5. UI 数据流只有一种。组件通过注入的服务写入，通过视图模型读取；中间层不转发与自己无关的
   事件。

### 5.2 结构

包划分基本不变：

```text
apps/studio/src
├─ app/        组合根：单一 provide；用一个 disposable owner 按逆序释放，
│              替代手写的 try / finally 嵌套
├─ services/   有生命周期的服务：active-project、playback-binding、
│              actions（含 keyboard）、navigation、midi-import
├─ edits/      无状态编辑用例（普通函数）
│  ├─ run-edit.ts   就绪检查 + 过期检查 + execute + 统一错误
│  └─ note / pedal / clip / track / tempo-edits.ts
├─ features/   视图模型 + 组件 + 交互特化
└─ ui/

packages/editor/src/common/interaction   唯一一个 GestureSession 外壳
packages/playback                        接收从 Studio 移入的 PlaybackEngine
packages/project-core                    一个命令一个文件；实体表泛化
```

### 5.3 各部分怎么改

#### Studio 应用层

- 5 个编辑协调器改为 `edits/*` 中的普通函数，统一入参 `EditContext { activeProject, createId }`，
  统一挂在一个 `projectEdits` 服务上，只使用一个注入 key。
- 用一个 `StudioError { code, message, cause }` 表达应用层前置条件（如 `not-ready`、
  `target-stale`、`looped-clip-unsupported`），用一个 `describeEditFailure()` 把
  `ProjectCommandError` 的 code 映射为文案，替代 5 个编辑错误类与 7 个只含 `missing-context`
  的 Vue 错误类。导航决策 Binding 的 `binding-disposed`、`invalid-decision` 有真实语义，可以
  保留。
- 用一个泛型 `injectRequired(key, name)` 替代所有 context hook 中的 null 检查。
- Track 放置、CC64 放置这类真正的“编辑意图 → 命令”映射保留在 `edits/` 中，这是 Studio 应有
  的应用逻辑。

#### 手势

- 在 `editor/common/interaction` 提供完整的 `GestureSession<Input, Preview, Result, Target>`，
  拥有 capture 匹配、过期检查、提交订阅、认领、handoff 与发布；特化只实现
  `begin(input, config) → { operation, target } | null`。
- 提供 `completeGesture(intent, { commit, onCommitted, onFailure })`，统一 4 处 intent 收尾。
- 预期 4 个 240–311 行的 Session 变为 1 个通用实现加 4 个几十行的特化。

#### Action 与键盘

- 每个 Action 一个声明，ID 联合类型从声明表推导，删除三张平行表：

  ```ts
  defineAction({
    id: 'piano-roll.tool.pencil',
    label: 'Pencil tool',
    description: 'Select the piano roll pencil tool.',
    category: 'editor',
    keywords: ['画笔', '铅笔', '音符'],
    shortcut: { context: 'piano-roll', keys: ['8'], repeat: false },
    resolve: (target) => ({ presentation, execute }),
  })
  ```

- 焦点上下文改为注册表：`bindContext(contextId, target) → dispose`，`isContextActive(id)`
  查表即可；上下文的 label 与 priority 一处声明，替代 7 个具名 slot 与对应 key。
- 键盘的 router、user keymap 与冲突分析质量良好，保留；分层检查从 7 层收敛为 contracts /
  runtime / browser 3 层。

#### 播放

- 把浏览器无关的部分移入 `packages/playback`，按职责拆为：
  - `PlaybackEngine`：Transport + Scheduler 循环 + Voice 跟踪；
  - `PlanReconciler`：提交批处理，决定选择性、Tempo 或全量 handoff；
  - `RuntimePreparation`：异步准备、取消与请求序号；
  - `LocateSession`。
- 按 Delta 而不是命令类型决定能否选择性 reconciliation、是否重排 release，让命令类型知识
  离开 Studio 的 `switch`。
- 反馈文案（如 `feedbackForPreparationResults`）移到 Studio 的 presentation 层。
- Studio 只保留一个薄的 Playback Binding：订阅 Active Project，把 Snapshot 与 Commit 交给
  引擎，并把状态投影到 Vue。

#### UI

- Tempo 交互与 Piano Roll 一样直接调用 `projectEdits.tempo.*`，删除 Shell 与 Workspace 中的
  转发事件。
- `ProjectWorkbenchArrangement.vue` 按完整视觉区域拆为 Ruler / Locate / Follow、TrackList、
  TempoLane 与 ClipGrid。
- `ProjectWorkspacePage.vue` 的派生移入纯函数
  `createWorkspaceViewModel(snapshot, selection, playback)`，页面只负责路由与生命周期。
- 提供 `useProjectSnapshot()`：只订阅一次、按 revision 缓存，供所有整项目视图共用。约定：
  整项目视图读 Snapshot，编辑器读 Query 与变更订阅。

#### project-core

- `getSnapshot()` 按 `modelRevision` 缓存。改动很小，可以先做。
- 一个命令一个文件，导出 `{ type, create, prepare, address }`；preparer 中的两个 `switch`
  （分派与 `commandAddress`）改为一张注册表。
- Mutation 泛化为 `{ table, op, key, before, after }`，applier、projected reader 与 change
  推导面向表描述符编程；按 MidiSource 分区的 Note 与 CC64 作为一种分区表类型。新增实体只需
  一个表描述符、命令与 DTO 编解码。
- 当 3.2 中的消费者改为按 Delta 路由后，把 `matchesXxx` 从运行时移到性质测试：forward 之后
  执行 inverse 等于恒等；plan 只触及命令声明的实体。
- 全量不变量校验保留在加载、导入与开发模式中；生产提交路径的策略（增量校验被触及的实体，
  或保留一次全量）在大项目基准测试后决定。

#### 规则与文档

- 架构检查只守护依赖方向与平台隔离，不再规定 feature 内部的目录形状。
- 文档收敛为几份活文档：README（地图）；一页 ARCHITECTURE（分层、数据流、“X 放在哪”、
  改动配方）；精简后的 `CODE_GUIDELINES.md`；`PRODUCT.md` 与 `DESIGN.md`。
- Phase plan 与 closure report 移入 `docs/archive/`（git 历史本来就保留）；长期决定写成 ADR。

### 5.4 验收标准：改动配方

用“做一件常见的事要碰几个生产文件”衡量重构是否成功。“现在”一列按基线代码估算。

| 改动                             | 现在                                                                                                        | 目标                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 给已有实体加一条命令             | 8–10：协议、handler、preparer、commit candidate 校验器、index、播放协调器 switch、协调器、错误类、UI 调用方 | 3–4：core 命令文件与公开导出、edits 函数、UI 调用方     |
| 新增一个 Action                  | 4–10                                                                                                        | 1 个声明 + 1 处绑定                                     |
| 新增一种实体（如 Automation 点） | project-core 约 30，Studio 若干                                                                             | 约 6–8：表描述符、命令、DTO 编解码、Snapshot 字段、导出 |
| 新增一种拖拽手势                 | 复制一个约 240 行的 Session                                                                                 | 一个几十行的特化                                        |
| 新增一个应用服务                 | 6–7：服务、错误类、context、Vue 错误类、symbol、组合根两处                                                  | 2：服务与组合根一处                                     |

## 6. 迁移路线

每一步保持行为不变、可单独合并，依靠现有行为测试兜底。

| 阶段 | 内容                                                                                                                                                                  | 风险  | 前置                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------- |
| 0    | 写一页 ARCHITECTURE 与改动配方；归档 phase 文档；建立大项目提交基准                                                                                                   | 低    | 无                                  |
| 1    | Studio 管道收敛：`injectRequired`、`StudioError`、`run-edit`；编辑协调器改为函数并合并为单一服务；删除与 core 重复的校验和 `stateDeliveryFailure`；`getSnapshot` 缓存 | 低    | 无                                  |
| 2    | 手势统一：先迁 Tempo 与 Track placement（两者几乎相同），再迁 CC64，最后迁 Note                                                                                       | 中    | 1                                   |
| 3    | Action 单一声明与焦点上下文注册表                                                                                                                                     | 低–中 | 1                                   |
| 4    | UI：删除 Tempo 事件转发；拆分 Arrangement；WorkspacePage 视图模型；`useProjectSnapshot`                                                                               | 中    | 1                                   |
| 5    | 播放拆分并移入 playback 包；改为按 Delta 路由                                                                                                                         | 中–高 | 4                                   |
| 6    | project-core：一个命令一个文件、实体表泛化、校验器移入性质测试、确定不变量策略                                                                                        | 高    | 5，并在加入下一个新实体类型之前完成 |

第 1–3 步都是净删除。粗估仅第 1、2 步就能删除一两千行（含测试），`studio-application.ts`
与 `symbols.ts` 也不再是变更热点。

## 7. 保留不动的部分

- 包划分与依赖方向；
- ModelStore + 可逆 Mutation + History 的内核；
- `ActiveProjectService` 与导航确认；
- `midi-file` 与 `project-midi` 的分工；
- `platform-browser` 适配器；
- 包边界检查；
- 现有行为测试，它们是这次重构的安全网。

## 8. 未验证与待决事项

- 3.2 中全量不变量校验的性能影响来自代码阅读，未做基准测试；阶段 0 的基准用于确认或推翻。
- 应用服务注入采用单一 `useStudio()` Context，还是保留按服务划分的 key（但删除配套的错误类
  与 hook 样板），需要在阶段 1 前决定。
- `PlaybackEngine` 移入 `packages/playback`，还是先留在 Studio 内只做拆分，取决于阶段 5 时
  playback 包的公开 API 能否保持小而完整。
- 阶段 0 的文档归档是移入 `docs/archive/` 还是直接删除（git 历史保留），需要维护者决定。
- 5.4 节“现在”一列为估算；每个阶段完成后应按附录方法复测。

## 9. 实施结果（2026-10-23）

第 0–6 阶段全部完成，均直接提交在 `main` 上。自基线以来，生产与测试代码共改动 250 个
`.ts` / `.vue` 文件，新增 9,496 行、删除 14,100 行。

| 阶段 | 提交                                       | 内容                                                                                     |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1    | `acf3bc1`、`e62cb2b`                       | 编辑协调器改为 `workbench/edits` 中的函数，单一 `useStudio()`；Snapshot 按 revision 缓存 |
| 2    | `2183fcd`                                  | `GestureSession` 与 `completeGesture`，4 个手势只剩特化                                  |
| 3    | `8decff6`                                  | `defineStudioAction` 单一声明；焦点上下文注册表                                          |
| 4    | `85aacf7`、`65763b3`、`4708a75`            | Tempo 注入模型；Arrangement 与 WorkspacePage 拆分                                        |
| 5    | `9d5579c`、`daba6a1`                       | 播放按变化路由；PlaybackEngine 移入 playback 包                                          |
| 6    | `91e1fef`、`5f54e36`、`bdfeee8`、`318d508` | 一次校验；属性测试取代 `matchesXxx`；共享分区表；命令注册表                              |
| 0    | `6537644` 与文档提交                       | 架构规则只管依赖方向；ARCHITECTURE、ADR、归档；提交成本基准                              |

### 复测

| 指标                              | 基线                             | 现在                                            |
| --------------------------------- | -------------------------------- | ----------------------------------------------- |
| CC64 涉及的非测试源文件           | 77（Studio 25、project-core 30） | 72（Studio 21、project-core 30）                |
| 播放协调器                        | Studio 中 1590 行                | Studio 适配器 246 行；playback 包中引擎 1128 行 |
| 4 个手势 Session                  | 240 / 240 / 311 / 283 行         | 共用 `GestureSession` 349 行，特化 33–70 行     |
| `ProjectWorkbenchArrangement.vue` | 1334 行                          | 811 行                                          |
| `ProjectWorkspacePage.vue`        | 722 行                           | 352 行                                          |
| `project-commit-candidate.ts`     | 1154 行                          | 593 行                                          |
| 每次提交的全量校验                | 2 次                             | 1 次（ADR-001）                                 |
| 文档                              | 114 篇，1.65 MB                  | 在用 57 篇，约 0.94 MB；另有 62 篇归档          |

### 改动配方（对照 5.4）

| 改动                 | 目标                | 现在                                                                       |
| -------------------- | ------------------- | -------------------------------------------------------------------------- |
| 给已有实体加一条命令 | 3–4                 | 5 个生产文件（协议、handler、注册项、导出、edits）加界面调用方；播放不用改 |
| 新增一个 Action      | 1 个声明 + 1 处绑定 | 达成                                                                       |
| 新增一种实体         | 约 6–8              | 未达成，project-core 仍约 30 个文件                                        |
| 新增一种拖拽手势     | 一个几十行的特化    | 达成                                                                       |
| 新增一个应用服务     | 2                   | 达成：服务、组合根、`StudioServices` 字段                                  |

### 与提案的偏差

- 没有做“一个命令一个文件”。命令协议仍集中在 `protocol/project-command.ts`，它是公开契约，
  注册表的穷尽类型也依赖它；三个平行的 `switch` 已合并为一张注册表。
- 没有把 Mutation 泛化为 `{ table, op, key, before, after }`。Applier 的分派本身很平，改形状
  会改动大部分 project-core 测试的期望值；只把两种按 Source 分区的实体合并成一套分区表实现。
  所以“新增一种实体”仍然昂贵，这是剩下最大的一项。建议在加入 Automation 之前完成。
- PlaybackEngine 保持为一个状态机，没有再拆成 Reconciler、RuntimePreparation 与 LocateSession
  三个对象：它们共享 Transport、Voice 与请求序号，拆开后同一组不变量会分散到多个对象里。
  调和决策是 `reconciliation/` 中的纯函数，Voice 跟踪由 `VoiceLedger` 负责。
- 没有做 `useProjectSnapshot()`：整项目 Snapshot 只有 WorkspacePage 一个读者。
- 5 个编辑错误类合并为一个 `ProjectEditError`（4 个 code），7 个只含 `missing-context` 的 Vue
  错误类删除；导航决策的错误类有真实语义，保留。没有引入通用的 `StudioError`。

### 第 8 节待决事项的结论

- 服务注入：单一 `useStudio()`，配套的错误类与 hook 样板全部删除。
- PlaybackEngine：移入 `packages/playback`，并改用结构化的 abort signal；该包的 tsconfig 不含
  DOM lib，所以不依赖 DOM 由类型检查保证。
- 文档归档：移入 `docs/archive/`，不删除。
- 不变量策略：每次提交在投影上做一次全量校验（ADR-001）。新基准显示，剩余成本的主要部分随
  被编辑的 MIDI Source 大小增长，而不随项目大小增长。

## 附录：度量方法

在仓库根目录用 Git Bash 执行：

```sh
# 某个功能涉及的非测试源文件
grep -rli "sustainpedal\|sustain-pedal" --include=*.ts --include=*.vue apps packages \
  | grep -v __tests__ | grep -v node_modules

# 非测试源文件的变更热点
git log --name-only --pretty=format: | grep -E "\.(ts|vue)$" | grep -v __tests__ \
  | grep -v "\.spec\." | sort | uniq -c | sort -rn | head -30

# 最近提交的改动文件数
git log --pretty=format:"%h %s" --shortstat -40

# 两个手势 Session 统一命名后的差异行数
diff \
  <(sed -E 's/TempoTrackDrag|TempoTrack|Tempo|tempo/X/g' \
    apps/studio/src/features/project-workspace/tempo-track/interaction/tempo-track-drag-session.ts) \
  <(sed -E 's/TrackPlacement|Placement|placement/X/g' \
    apps/studio/src/features/piano-roll/components/track-surface/interaction/track-placement-session.ts) \
  | grep -c '^[<>]'

# Markdown 文件数与总字节数
find . -name "*.md" -not -path "*/node_modules/*" | wc -l
find . -name "*.md" -not -path "*/node_modules/*" | xargs cat | wc -c
```
