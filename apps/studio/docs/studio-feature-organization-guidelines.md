# Studio Feature 组织规范落地与 Piano Roll 拆分计划

> 状态：Implemented，已通过代码审核。通用规范已纳入根 `CODE_GUIDELINES.md`，O1–O3 已实现。
>
> 日期：2026-09-29
>
> 适用范围：`apps/studio/src` 的人工维护代码，重点约束 `features/` 的增量开发。
>
> 首个应用范围：Piano Roll。其余 feature 在新增或修改相应模块时采用同一原则。

## 1. 规范入口

已审定的通用条款以根 [工程代码准则](../../../CODE_GUIDELINES.md) 为唯一维护入口，
本文只记录 Piano Roll 的具体实施范围和验收条件：

- Studio 分层、Feature 内部组织与引用入口：工程代码准则第 4.3–4.5 节。
- Vue 组件、Hook、Class 与纯函数分工：第 9 节；生命周期和资源清理：第 11 节。
- 行为测试与测试支持文件归属：第 12 节。
- 文件、组件、Composable 命名与领域前缀：第 13.1 节；外部依据：第 15 节。

规范约束职责、所有权、依赖方向和生命周期，不要求小 feature 复制完整目录模板。
原有 Keyboard 的公共入口与专项边界继续保留；其他 feature 随业务改动逐步采用同一规范。

## 2. Piano Roll 的拆分记录

### 2.1 拆分前的集中职责

| 组件                               | 拆分前总行数 / script 行数 | 聚集在一起的职责                                                                              |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `ProjectPianoRollTrackSurface.vue` | 1,283 / 733                | Timeline 布局、Viewport、Renderer、Pencil Placement、Active Clip、Follow、CC64 和 Actions     |
| `PianoRollSustainPedalLane.vue`    | 839 / 634                  | Lane 投影、Viewport、Selection、Interaction Session、Pointer Adapter、Command 与 Context Menu |

行数按 2026-09-29 制定方案时的工作区统计，script 包含导入、类型和起始标签。
已有 Clip Focus hook 拆分保留，进一步把私有 hook 与组件共置，使三块都遵循同一规则。

Piano Roll 当前依赖 Project Workspace 的 Selection Store 与 Timeline 尺度 / 布局函数。
这些既存共享点需要在 README 明确列出，继续由原 owner 提供；后续跨 feature 治理时
再决定其公共能力或共享模块归属，不能通过改目录更换 Selection 权威。

### 2.2 已实施目录

以下为已实施结构，未列出的现有文件保持原有职责。子模块内部只在有实际消费者时新增更细目录。

```text
features/piano-roll/
  components/
    clip-focus/
      ProjectPianoRollSurface.vue
      hooks/                         # 五个私有 hooks，文件名省略外围 piano-roll 前缀
      types/clip-focus.ts             # Clip Focus 局部共享契约
    track-surface/
      ProjectPianoRollTrackSurface.vue
      PianoRollTrackToolbar.vue
      hooks/
        use-track-layout.ts
        use-track-rendering.ts
        use-track-placement.ts
        use-track-follow.ts
        use-track-actions.ts
        use-track-sustain-pedal.ts
    sustain-pedal/
      PianoRollSustainPedalLane.vue
      hooks/
        use-sustain-pedal-viewport.ts
        use-sustain-pedal-selection.ts
        use-sustain-pedal-interaction.ts
        use-sustain-pedal-projection.ts
        use-sustain-pedal-actions.ts
      types/
        sustain-pedal-lane.ts
    PianoRollToolControls.vue         # Clip Focus 与 Track 共用的工具 / Snap 控件
  types/                             # 跨子模块契约，如 CC64 Placement / Handle
  presentation/                      # 共享 Theme、Pitch Layout、Renderer 政策等
  state/                             # 共享 Preferences
  interaction/                       # 既有 Note / CC64 Intent Handler
  actions/                           # 既有 Action 与 Context Menu
  playhead/                          # 既有 Clip / Track Playhead
  __tests__/
  README.md
```

原 feature 级 `hooks/` 的五个 hook 已迁入 Clip Focus，空目录已移除；其局部契约从
`piano-roll-surface.ts` 迁入 `components/clip-focus/types/clip-focus.ts`。Track 的 Props 与
Placement Preview 当前各自只有单文件消费者，按规范保留为私有类型，不建立空的 `types/`。
Lane 的 Placement / Handle 被两种 Surface 使用，继续保留在 feature 级 `types/`。
`playhead/` 和 `actions/` 已有清晰边界，本批不为对齐目录形状再次搬迁。

### 2.3 Track Surface

| 提取对象                | 具体职责                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useTrackLayout`        | Timeline Bars、内容宽度、可见 Note、Clip Windows、Note 到 Clip 的映射，以及 Viewport 测量 / ResizeObserver    |
| `useTrackRendering`     | Grid / Note Renderer 创建、场景投影、错误反馈和释放；消费 Layout 的 Viewport                                  |
| `useTrackPlacement`     | Hover、坐标到放置候选、Preview、Pointer Adapter 与提交已有 Track 放置用例                                     |
| `useTrackFollow`        | Playback 分页跟随、用户暂停 / 恢复，区分程序滚动和手动滚动，清理排队任务                                      |
| `useTrackActions`       | Active Clip 选择、Note Hit 对应 Clip 激活、CC64 Selection Target / Context Menu / Cancel 路由                 |
| `useTrackSustainPedal`  | Track CC64 Read Model、Channel 与 Placement，保留 Warning / Danger 区分                                       |
| `PianoRollTrackToolbar` | Track Toolbar 完整视图区域：Tool Controls、Follow、Active Clip、Channel 和 Preview 提示；只接收状态并上报意图 |

Surface 保留 DOM refs、总体布局和显式组合顺序；各 hook 通过所需的 getter、refs 和能力连接。
例如 Actions 提供 `activateClip` 给 Placement；Follow 提供 `suspend` 给 Actions。不得让两个
hook 相互导入或通过一个全功能 Context 读写对方内部变量。

提取共享 Tool Controls 时，每个 Surface 仍只注册一次 Tool Action Target。
子组件沿传入的 Action 调用能力触发操作，不因复用按钮再次注册整套 Action。
Clip Windows 的当前模板可以继续留在 Surface；不强制把每层 DOM 都做成一个子组件。

### 2.4 Sustain Pedal Lane

| 提取对象                     | 具体职责                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `useSustainPedalViewport`    | Lane 元素测量、Value Lane Viewport、ResizeObserver 与 fallback listener           |
| `useSustainPedalSelection`   | 当前编辑 Scope、selected IDs、权威更新后的协调；复用 Editor 的 Selection Resolver |
| `useSustainPedalInteraction` | 组合现有 Session、Pointer Adapter、Begin 配置、Intent Handler、提交回告和取消     |
| `useSustainPedalProjection`  | Occurrence / Window / Segment / Marker / Threshold / Preview 与无障碍摘要的派生   |
| `useSustainPedalActions`     | Delete / Clear、Focus、Context Menu 和对外能力组合                                |

Lane 的 template 只有约 64 行，当前适合保留为一个内聚视图。组件继续通过
`PianoRollSustainPedalLaneHandle` 暴露已有能力，不暴露完整 Session 或内部 refs。

Selection 的写入入口只有一个，Interaction 和 Actions 消费该能力；Projection 只观察。
Clip Scope 与 Track Scope 共用 Lane，但 Placement 仍交给两种 Surface 的既有用例处理。
链接 Clip 的同一个 Event ID 可以出现多次，Context Menu 的 Clip 身份校验必须保留。

### 2.5 行为与生命周期约束

- Track Pencil 的新增 / 右扩 / 新建 Clip 保留一次 History 步骤；阻止放置仍给出既有反馈。
- Playback Follow 每次开始播放重新启用；手动滚动暂停，程序分页不会被当作手动操作。
- CC64 保留 `0..127`、Down Threshold、Terminal Marker、多选、Move / Replace / Delete、
  原始值和提交到权威 revision 的 Preview 交接。
- Project / Scope / Clip / Channel / Viewport 的失效来源与 watcher 时机显式记录，验证取消、
  选择协调和旧回调隔离，不能因提取 hook 改变提交次数或目标。
- 资源部分初始化失败必须立即回收；拆分中发现的初始化回滚遗漏作为本批资源归属问题修正，
  配套失败路径回归。不会引入通用全应用错误恢复平台。
- Track / CC64 的中立语义协议迁移仍属于 G3，本次不把组织重构等同于迁移完成，也不提前实施
  Tempo、Locate 或新增编辑行为。

## 3. 实施批次与验收

| 批次              | 范围                                                                                              | 验证                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| O1：规范与归属    | 将审定规则纳入正式文档；建立三块组件子目录，迁入 Clip Focus 私有 hooks / types，更新引用与 README | 类型检查、现有 Piano Roll 行为回归、链接和格式                                               |
| O2：CC64 Lane     | 按五项职责提取 hook，保留 Handle，明确 Selection 与 Interaction 所有权及回滚                      | 两种 Scope、Linked Clip 身份、Channel / 目标切换、取消、Preview 交接、卸载与初始化失败       |
| O3：Track Surface | 拆出六项职责、Track Toolbar 与实际共用的 Tool Controls，保留 Follow / Placement 语义              | Follow 暂停 / 恢复与程序滚动、Placement 各分支、Action 路由、资源清理；最后完整 `pnpm check` |

优先使用现有行为测试验证重构，只有缺失的资源边界和失败路径才新增用例。测试验证可见结果、
事实、History 和清理，不镜像 hook 的内部方法。按需使用 Codex 内置浏览器做手工 smoke，不新增 E2E。

已将稳定依赖边界加入架构检查：私有 hooks 不被外部子模块导入、生产代码不导入测试支持、
共享契约不反向依赖组件实现。先只在完成迁移的 Piano Roll 生效，不把旧 feature 立即判为违规。
文件长度和是否需要提取子组件仍由人工审阅，不用强制数字规则制造碎片。

O1–O3 已全部实现，具体入口与清理顺序见 [Piano Roll README](../src/features/piano-roll/README.md)。
规范由根目录 [`.AGENT`](../../../.AGENT) 引用，其他 feature 在后续业务改动时按根规范演进。

本次同时补齐三块组件的初始化失败回收与过期回调隔离。共享 Tool Controls 不注册 Action，
两个 Surface 仍各自注册一次；Active Clip / Channel 使用 UiSelect small 规格。
新增架构规则保护 Piano Roll 私有 hooks / types、共享契约依赖方向和测试支持边界。

## 4. 验证结果

- 根 `pnpm check` 通过：168 个 Vitest 文件、1,583 项测试；14 项 Node 架构规则回归，
  含新增的 4 项 Piano Roll 边界回归。格式、lint、类型、构建和音源资源边界全部通过。
- Piano Roll 保留既有行为测试，新增三块组件的初始化失败回收及 Track / CC64 的 Viewport
  变化取消与释放后回调隔离，共 5 项回归；原生下拉框断言改为验证自定义菜单的实际选择。
- Track 主组件 script 从 733 行减为 171 行，CC64 Lane 从 634 行减为 123 行；样式保留在
  对应组件内，不以移动样式压低逻辑行数。实际入口和清理顺序由 README 维护。
- Codex 内置浏览器验证 Track / Clip Focus 工具栏、Channel 与 Active Clip 菜单、Scope
  切换；Console 无 warning / error。临时轨道和 Clip 已撤销，项目恢复为已保存状态。
- 构建仍有既有的大 chunk 提示。此次代码已通过用户审核，按授权提交。

## 5. 相关文档

- [工程代码准则](../../../CODE_GUIDELINES.md)
- [Vue 状态与依赖组合准则](./vue-state-composition-guidelines.md)
- [Piano Roll 阅读说明](../src/features/piano-roll/README.md)
- [输入基础设施阶段计划](./editor-input-foundation-v1-phase-plan.md)
