# Seele DAW 架构

本文描述代码现在的样子：分层、一次编辑如何流动、新代码放在哪里，以及常见改动要碰哪些文件。
本文与代码不一致时，以代码为准，并修正本文。

- 为什么这样设计：[ADR](docs/adr/README.md)、[2026-10 架构复盘](docs/architecture/web-daw-architecture-review-2026-10.md)、[audio-web 复盘](docs/architecture/audio-web-review-2026-10.md)
- 长期方向（尚未实现的部分）：[长期路线 v3](docs/architecture/web-daw-long-term-architecture-v3.md)
- 产品行为与设计语言：[PRODUCT](PRODUCT.md)、[DESIGN](DESIGN.md)；编码约定：[CODE_GUIDELINES](CODE_GUIDELINES.md)
- 已完成阶段的计划与收口报告：[docs/archive](docs/archive/README.md)

## 1. 分层

| 包                 | 职责                                                             | 可以依赖                           |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------- |
| `project-core`     | 项目模型、命令、事务、历史、查询与持久化 DTO                     | type-utils                         |
| `editor`           | Pointer 输入 → 手势 → 意图；Piano Roll 的几何、命中与渲染        | project-core、type-utils           |
| `playback`         | 编译、调和、调度、Transport 与 PlaybackEngine                    | project-core、type-utils           |
| `audio-web`        | Web Audio 与采样音源；Studio 把它适配成 playback 的 Runtime Port | playback、type-utils               |
| `platform-browser` | IndexedDB 项目目录与 Checkpoint、本地文件读取                    | project-core、playback、type-utils |
| `midi-file`        | 标准 MIDI 文件编解码                                             | 无                                 |
| `project-midi`     | MIDI 文档 ↔ 项目模型                                             | midi-file、project-core            |
| `type-utils`       | 纯编译期类型工具                                                 | 无                                 |
| `apps/studio`      | 唯一组合根：Vue 界面、浏览器实现、产品默认值                     | 以上全部                           |

`tooling/architecture-rules` 在 `pnpm lint` 中检查以下规则：

- 包之间只能按上表依赖，并且只能从 `@seele-daw/<package>` 的根入口导入；包内用
  `#internal/*`，Studio 内用 `@/`。
- project-core、editor、playback、midi-file、project-midi 不导入 Vue、Pinia 或 Router；editor 的
  `common/` 不碰 DOM，浏览器适配集中在 `browser/`。
- ModelStore 的写能力只能由 ModelStore 注册，只能由 MutationApplier 领取。
- TanStack Hotkeys 的运行时只出现在 Studio Keyboard 的 `browser/` 层；契约层只借用它的按键类型。
- 生产代码不导入 `__tests__`。

规则只守护依赖方向与平台隔离，不规定包或 feature 内部的目录形状。

## 2. 一次编辑的流向

以“拖动一个音符”为例：

```text
EditorPointerInputAdapter       editor/browser   DOM Pointer → 中立的 Pointer 输入
→ GestureSession                editor/common    capture、预览；遇到别人的 Commit 即失效；只完成一次
→ completeGesture → edits.notes Studio           检查项目就绪、手势未过期；把 Clip 内 Tick 换成
                                                 Source Tick；构造 Project Command
→ ProjectSession.execute        project-core
    prepareProjectCommand          命令注册表：normalize → 检查 baseRevision → handler 产出 MutationPlan
    createProjectCommitCandidate   Commit 直接发布 Plan 写入的存储变化（ADR-004）
    History / QueryIndex 预备
    MutationApplier                投影 → 一次全量不变量校验 → 写入（ADR-001）
    ChangePublisher                在微任务中通知订阅者
→ 订阅者
    ActiveProjectService → Vue 绑定（Snapshot 按 revision 缓存）
    ProjectPlaybackCoordinator → PlaybackEngine.commit   按变化调和，不看命令类型（ADR-002）
    GestureSession                 看到自己那次 Commit 的 revision 后，结束交接
```

失败时：业务不变量只由 project-core 判断，抛 `ProjectCommandError`；Studio 只用
`ProjectEditError` 表达应用层前置条件（`project-not-ready`、`target-stale`、`unsupported`、
`not-placeable`）。界面直接显示错误的 `message`。

Undo / Redo 走同一条提交管线，只是 Plan 来自 History。

## 3. 状态归属

| 状态                                | 权威                     | 备注                        |
| ----------------------------------- | ------------------------ | --------------------------- |
| 可保存的项目事实、History、revision | `ProjectSession`         | 只能通过命令修改            |
| 当前项目、加载、保存、dirty         | `ActiveProjectService`   | Studio `workbench/project/` |
| 播放状态、Voice                     | `PlaybackEngine`         | Studio 只做投影             |
| 选择、工具、预览、缩放、面板        | editor 会话或 feature UI | 可随时丢弃                  |
| 用户键位覆盖                        | `StudioUserKeymap`       | 存在 localStorage           |
| Read Model、Scene、Canvas           | 可重建的投影             | 不反向修改事实              |

`ProjectSession`、播放运行时和等待中的 resolver 不进 Pinia，也不进 Vue 深代理。整项目视图读
`getSnapshot()`；编辑器读 `query()` 并订阅变化。

## 4. 新代码放在哪里

| 要做的事                       | 位置                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| 命令的形状与工厂               | project-core `commands/protocol/project-command.ts`                                       |
| 命令的校验与 MutationPlan      | `commands/<实体>/command-handler.ts`，并在 `preparation/project-command-preparer.ts` 注册 |
| Studio 写项目的用例            | `apps/studio/src/workbench/edits/*-edits.ts`，普通函数，汇总在 `project-edits.ts`         |
| 有生命周期的应用服务           | `workbench/project/…`；在 `bootstrap/studio-application.ts` 创建，放进 `StudioServices`   |
| 用户动作（菜单、按钮、快捷键） | 所属 feature 的 `actions/`，用 `defineStudioAction` 声明                                  |
| 焦点上下文                     | `defineStudioContext`；视图挂载或聚焦时用 `contexts.bind` 绑定目标                        |
| 拖拽手势                       | `new GestureSession(start)`；提交用 `completeGesture`                                     |
| 播放行为                       | `packages/playback`：`engine/`、`reconciliation/`、`scheduler/`                           |
| 浏览器音频与音源               | `packages/audio-web`；接入点是 Studio 的 `workbench/project/playback/browser-runtime.ts`  |
| 可见功能                       | `apps/studio/src/features/<功能>/`                                                        |
| 与具体功能无关的控件和样式     | `apps/studio/src/ui/`                                                                     |

组件通过 `useStudio()` 取得服务：`edits`、`actions`、`project`、`playback`、`navigation`、
`midiImport`、`projectEntry`。InjectionKey 与它的 provide / inject 函数写在同一个文件里。

## 5. 改动配方

### 给已有实体加一条命令

1. `protocol/project-command.ts`：在 `PROJECT_COMMAND_TYPE` 中加类型，写命令接口与工厂。
2. `commands/<实体>/command-handler.ts`：写 `prepare`，产出 MutationPlan。
3. `preparation/project-command-preparer.ts`：加注册项（normalize、address、prepare）。
   注册表按命令类型穷举，漏了就是类型错误。
4. `index.ts`：导出工厂与类型。
5. `__tests__/command-properties.spec.ts`：加一条用例；缺用例时完整性检查会失败。
6. Studio：在 `workbench/edits` 中加用例函数，再由界面调用。

播放不需要改，它按存储变化反应。

### 加一个 Action

在所属 feature 的 actions 文件里加一个 `defineStudioAction({ id, context, label, description,
category, keywords, keys, resolve })`。新建 actions 文件时，再把它加进
`workbench/actions/studio-actions.ts`。ID 类型、目录、默认键位和设置页都从这一处声明派生。
需要新的焦点区域时，再加一个 `defineStudioContext`，并在视图里绑定目标。

### 加一种拖拽手势

写一个 `InteractionOperation`（`update` / `complete`），再用 `GestureSession` 包装：`start`
回调决定按下时能否开始，并返回 `authority`、`operation` 和冻结的 `target`。在意图处理里调用
`completeGesture`，传入 `apply`（执行编辑）和 `onFailure`。可参考
`features/project-workspace/tempo-track/interaction/tempo-track-drag-session.ts`。

### 加一个应用服务

只有拥有生命周期或状态的东西才做成服务；无状态的逻辑写成函数。服务在
`studio-application.ts` 中创建，交给 `DisposalStack` 按逆序释放，再加进 `StudioServices`。

### 加一种实体（例如 Automation 点）

存储层只需声明，不用写分支（见 ADR-003、ADR-004）：

1. `model/model-tables.ts`：加一张表，按 ID 存储或按 MIDI Source 分区。`ModelStoreSeed` 随之多出
   一个必填字段，类型检查会指出初始化器、项目文件归一化和测试夹具里要补的地方。这张表的变化
   （`table.op`）、反转、投影与写入随即可用。
2. 需要类型化访问器时，在 `ModelStoreReader` 中写一次；也可以直接用 `reader.recordTable('…')`。
3. `__tests__/mutation-plan.spec.ts` 会要求为新表的每种操作补一个变化例子。

其余是领域本身，仍要逐项编写：记录类型与 ID、`model/invariant-validator.ts` 中的不变量、
Snapshot 字段、`persistence/` 中的项目文件协议与版本迁移，以及命令（见上）。

## 6. 检查

`pnpm check` 依次运行 lint（含架构规则）、type-check、全部测试和构建。各包可以单独运行
`pnpm --filter @seele-daw/<package> test:run`。project-core 的提交成本基准：
`pnpm --filter @seele-daw/project-core bench`。
