# Studio 输入行为清单

S1 已将下表中的业务快捷键迁入统一 Action / Keyboard 路径：Tempo Delete、Note / CC64 /
Tempo / Locate Cancel、Clip / Bar Enter、Toast F8，以及 Cursor / Pencil / Snap。当前可查询
目录有 19 个 Action；默认绑定与作用区域见 [快捷键架构](./studio-keyboard-shortcut-architecture.md)。
第 1–2 节保留 S1 前的历史输入来源，不能用于判断当前能力；第 3–5 节记录 G4 审计的现行路径。

> 状态：S1–S3、G1–G3 已审核提交；G4 输入路径审计已完成，实施已审核通过
>
> 更新日期：2026-10-19
>
> 历史盘点基线：`b28049f`；G4 实施基线：`f65bd17`

本文提供当前快捷键与交互的查找入口，配套
[Editor Input Foundation V1 计划](./editor-input-foundation-v1-phase-plan.md)。盘点范围为
`apps/studio/src`、`packages/editor/src` 的生产输入代码，另核验已安装 TanStack 的公开实现。
浏览器 / 操作系统快捷键与第三方控件全部内部监听不计作 Studio 自有 Action。

S1 后产品内列表从 Catalogue 和有效 Keymap 自动生成，本文不成为另一份
人工维护的运行时键位权威。

## 1. S1 前已进入 Action Catalogue 的快捷键

默认键位权威是 [studio-default-keymap.ts](../src/workbench/keyboard/keymap/studio-default-keymap.ts)，
执行和 Scope 分派见 [Input Router](../src/workbench/keyboard/runtime/studio-keyboard-input-router.ts)。
`Mod` 在 macOS 表示 Command，在 Windows / Linux 表示 Control。

| 功能                  | 当前 Action ID                  | 默认键位                   | 当前作用域               |
| --------------------- | ------------------------------- | -------------------------- | ------------------------ |
| 保存项目              | `project.save`                  | `Mod+S`                    | Workbench                |
| 撤销                  | `history.undo`                  | `Mod+Z`                    | Workbench                |
| 重做                  | `history.redo`                  | `Mod+Shift+Z`、`Control+Y` | Workbench                |
| 播放 / 暂停           | `playback.toggle`               | `Space`                    | Workbench                |
| 删除 Note / CC64 选择 | `piano-roll.selection.delete`   | `Backspace`、`Delete`      | 聚焦 Piano Roll 编辑目标 |
| 清空 Note / CC64 选择 | `piano-roll.selection.clear`    | `Escape`                   | 聚焦编辑目标，无活动手势 |
| 取消 Note / CC64 手势 | `piano-roll.interaction.cancel` | `Escape`                   | 聚焦编辑目标，有活动手势 |

另外 5 个 Action 当前没有默认键位：

| 功能                   | Action ID                                |
| ---------------------- | ---------------------------------------- |
| 返回上次播放起点       | `playback.return-to-last-start-position` |
| 返回项目列表           | `projects.show`                          |
| 导入 MIDI 项目         | `project.import-midi`                    |
| 将 MIDI 导入为新 Track | `project.import-midi-tracks`             |
| 打开 MIDI Editor Dock  | `midi-editor.open`                       |

程序可向创建函数传入覆盖，但用户不能在界面中修改或持久保存，运行时也没有 Keymap 替换
入口。菜单 / Tooltip 已读取 Router 文案。相关当前边界见
[Keyboard Architecture](./studio-keyboard-shortcut-architecture.md)。

## 2. S1 前局部处理的键盘输入

| 位置                                                                                                                                | 当前按键和行为                                                                                                                                           | 分类 / 目标处理                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [TempoTrackLane](../src/features/project-workspace/tempo-track/TempoTrackLane.vue)                                                  | Delete / Backspace 删除当前选中且 tick 非 0 的 Tempo Event；局部及 Window Escape 取消活动拖动。                                                          | 业务快捷键。迁移到聚焦 Selection Delete 与统一 Interaction Cancel。                                 |
| [ProjectWorkbenchArrangement](../src/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue)                    | Escape 取消活动 Timeline Locate。                                                                                                                        | 交互取消。通过活动 Interaction Owner 路由，删除局部 Escape 分支。                                   |
| 同一 Arrangement 的 Ruler                                                                                                           | 聚焦 `role="slider"` 时，Left / Right 前后一个 Beat，PageUp / PageDown 前后一个 Bar，Home 到 0，End 到时间线末尾。                                       | Slider 键盘协议。保留控件语义，提取可解释的 Locate 操作，并在统一帮助中列出。                       |
| 同一 Arrangement 的 Bar 按钮                                                                                                        | Enter 在该 Track / Bar 创建空 MIDI Clip；单击选择 Track，双击也创建。                                                                                    | 有目标的编辑快捷键。声明聚焦 Bar Context 与创建 Action，保留指针选择语义。                          |
| [ProjectWorkbenchMidiClip](../src/features/project-workspace/workbench-shell/ProjectWorkbenchMidiClip.vue)                          | Enter 选择并打开当前 Clip；单击只选择，双击选择并打开。                                                                                                  | 有目标的编辑快捷键。声明聚焦 Clip Context 与打开 Action，不等同于仅打开 Dock。                      |
| [UiToastRegion](../src/ui/components/UiToastRegion.vue)                                                                             | `ToastViewport` 配置固定 F8，交给 Reka 处理通知区 Focus。                                                                                                | 应用 Focus 快捷键。纳入 Catalogue / 用户配置，保留单一执行入口。                                    |
| [ProjectWorkbenchWorkspace](../src/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue)                        | 聚焦 Splitter 时 Up / Down 调整 Dock 高度；Home 最小，End 最大。                                                                                         | `role="separator"` 的控件键盘协议，保留且纳入帮助。                                                 |
| [ProjectTempoControl](../src/features/project-workspace/tempo/ProjectTempoControl.vue)                                              | BPM 输入 Enter 提交并 Blur；Escape 撤销本地输入。                                                                                                        | 字段编辑协议。由字段拥有，不能触发后台 Clear / Cancel。                                             |
| [TempoTrackControl](../src/features/project-workspace/tempo-track/TempoTrackControl.vue)                                            | BPM 与 Position 字段 Enter 提交并 Blur，Escape 撤销本地输入。                                                                                            | 同上。清单应说明作用区域，无需把每个输入字段注册为全局 Action。                                     |
| Arrangement 与 [ProjectPianoRollTrackSurface](../src/features/piano-roll/components/track-surface/ProjectPianoRollTrackSurface.vue) | `TIMELINE_INTERACTION_KEYS` 中的 Space、Enter、Left / Right、Home / End、PageUp / PageDown 触发 Follow 暂停判断；Shift + Wheel / 横向滚动也暂停 Follow。 | 导航副作用，不是独立快捷键。改键后不能仍靠旧字面键表判断用户意图，应与已接受的导航 / 视图操作关联。 |
| [Pointer Adapter](../../../packages/editor/src/browser/piano-roll/piano-roll-pointer-input-adapter.ts)                              | 活动 Pointer 期间监听 Window keydown / keyup，在 Modifier 改变时发送同位置 Update。                                                                      | 持续输入状态。保持独立于离散 Hotkey，物理键与语义 Modifier 映射集中。                               |
| Reka Menu / Dialog / Select 等                                                                                                      | 内部方向键、Enter、Escape 和 Focus 管理。                                                                                                                | 第三方 Widget 协议，由自定义 UI 封装与输入屏障集成，不再加一套全局同键 Handler。                    |

Clip / Bar 的 Enter 在当前实现中区别于按钮默认的 Click / Space 选择行为，因此按业务操作
迁移。Ruler 的方向键已有 Slider 语义，不能仅因内部调用 Playback 就全部归为全局快捷键。

未发现当前生产代码为 Tool 切换、Snap 切换或 Grid 选择声明快捷键；它们已有 UI 操作。新计划
将 Cursor / Pencil / Snap 加入可绑定目录，默认保留未分配；单一 Grid 选项暂不增加 Action。

## 3. 当前 Gesture Modifier

| 语义                     | 当前物理输入                     | 取值时机                     | 当前入口                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note / CC64 选择切换     | Shift 或 Control 或 Meta + Click | origin modifiers             | [Note Select](../../../packages/editor/src/common/piano-roll/operations/piano-roll-select-interaction.ts)、[CC64 Session](../../../packages/editor/src/common/piano-roll/sustain-pedal-lane/sustain-pedal-interaction-session.ts) |
| 临时绕过 Snap            | Alt                              | 拖动中使用 current modifiers | Note Move / Resize、CC64 Tick Transform                                                                                                                                                                                           |
| 横向滚动关联 Follow 暂停 | 横向 Wheel 或 Shift + 纵向 Wheel | 当前 Wheel Event             | Arrangement / Track Surface                                                                                                                                                                                                       |

G3 的运行时与帮助权威为
[Interaction Modifier Rules](../../../packages/editor/src/common/interaction/interaction-modifiers.ts)。
这些规则不等于按一次触发一次 Action。Selection 固定 origin，Snap bypass 消费 current；
Keyboard Settings 查询同一只读声明，未提供 Modifier 自定义。

当前 Pencil Click 使用 Snap Preference；Track 放置函数没有读取 Alt，不能在帮助中宣称
Pencil 已支持 Alt 临时绕过吸附。

## 4. 当前手势生命周期分布

| 消费者                  | 当前所有者                                                                                                                                                                                   | 独立规则 / 迁移要点                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clip Focus Note         | [Note Interaction Session](../../../packages/editor/src/common/piano-roll/interaction/piano-roll-interaction-session.ts) 与 Studio Handler                                                   | 盘点时使用 XState；G1 已迁移为公共 InteractionSession 与 Note Operation，链接指向现行实现。                             |
| Clip Focus / Track CC64 | [CC64 Session](../../../packages/editor/src/common/piano-roll/sustain-pedal-lane/sustain-pedal-interaction-session.ts) 与 Lane                                                               | G3 已迁入公共 Session / Handoff；固定 Begin 选择、目标和 Tool；保留 Tick / Value 轴锁定，回告携带交互身份。             |
| Track Pencil            | [Track Surface](../src/features/piano-roll/components/track-surface/ProjectPianoRollTrackSurface.vue)                                                                                        | G3 已由局部 Placement Session 固定 Begin Tool、Active Clip、Grid、Read Model 与 Session 身份；Hover 仍使用当前配置。    |
| Tempo Lane              | [TempoTrackLane](../src/features/project-workspace/tempo-track/TempoTrackLane.vue) 与 [Tempo Session](../src/features/project-workspace/tempo-track/interaction/tempo-track-drag-session.ts) | G2 已迁入公共 Pointer / Session / Handoff；Begin 冻结目标与映射，执行校验 Session / revision，数值字段保留离散提交。    |
| Timeline Locate         | [Arrangement](../src/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue) 与 Playback Locate Session                                                                  | G3 已迁入公共 Pointer / Session；Client 坐标允许 Edge Scroll 重映射，Playback 保留 commit / cancel 恢复，不写 Project。 |
| Dock Splitter           | [Workspace](../src/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue)                                                                                                 | 界面布局调整，无 Project Commit / History；不强制进入事实编辑协议。                                                     |

现有边界已经足够检验跨对象复用。Clip Move / Trim / Stretch 尚未实现，不能把“未来可以
接入”当作已经证明；Tempo 已由 G2 完成实际跨域验证，G3 已接入其余现有编辑消费者。

## 5. G4 现行输入路径审计

| 入口                                                                                                       | 当前职责与保留理由                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Editor Pointer Adapter](../../../packages/editor/src/browser/interaction/editor-pointer-input-adapter.ts) | Note、CC64、Track Pencil、Tempo 与 Locate 的唯一 Pointer 生命周期实现；拥有 Capture、Window blur 与 Modifier Listener，构造失败回滚自身注册。 |
| [Studio Interaction Target](../src/workbench/actions/vue/studio-editor-action-context.ts)                  | 活动交互取得 Cancel；其他 Surface 接管或 runtime 释放会取消旧 owner；Focus 不代替手势状态，旧卸载不能释放新 owner。                           |
| [Keyboard Layer](../src/workbench/actions/vue/studio-action-context.ts)                                    | Project / Add track / Piano Roll 菜单及快捷键 Dialog 暂停后台 Action；导航 Modal 由应用屏障接管。关闭当前层后才恢复 Cancel / Selection 路由。 |
| Arrangement / Track 的 `pointerdown.capture`                                                               | 暂停各自 Timeline Follow，不拥有编辑 Capture、不提交事实。                                                                                    |
| Track 的 `pointermove / pointerleave`                                                                      | Hover 候选与退出清理；活动手势期间不覆盖冻结 Preview。                                                                                        |
| Piano Roll Context Menu 的 `pointerdown.capture`                                                           | 释放上次准备的菜单目标，不处理编辑 Pointer 生命周期。                                                                                         |
| Workspace Dock Splitter 的 Pointer 处理                                                                    | 改变布局尺寸，没有 Project Command / History，不强制接入事实编辑 Session。                                                                    |
| Ruler、Splitter、字段与 Reka 控件                                                                          | 保留 Slider / Separator / 输入提交与取消 / Widget 的键盘协议，区别于可改绑的 Action。                                                         |
| [Shortcut Recorder](../src/workbench/keyboard/browser/browser-tanstack-hotkey-recorder.ts)                 | 录制期间的捕获监听与所有权屏障，不是手势 Modifier 或后台 Action 的第二入口。                                                                  |

生产路径已无旧 Note XState、`TIMELINE_INTERACTION_KEYS` 字面键表、CC64
`resolveTransformCommit / skipTransformCommit`，Tempo 和 Locate 也没有独立的 Pointer /
Window Escape Handler。Note / CC64 的 Browser 工厂只是配置领域 Hit，委托同一个 Adapter。
G4 没有发现需要再删除的旧生命周期；保留上述监听的实际 owner，避免把布局、Hover 或控件
协议误认成重复编辑路径。

本批修复 Add track 菜单遗漏的 Keyboard Layer，并通过菜单 / Dialog 与活动 Locate 的组合
验证 Escape 不穿透；真实 TanStack DOM 测试另验证自定义 Cancel 组合的屏蔽与恢复。
跨 Surface、Scope、Active Clip、Channel、Project / Session、Dock 与资源释放结果见
[G4 实施记录](./editor-input-foundation-v1-phase-plan.md#19-g4交互收口2026-10-19)。
