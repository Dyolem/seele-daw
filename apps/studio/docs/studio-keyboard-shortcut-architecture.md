# Studio Keyboard Input 架构

> 状态：WA1–WA4 已审核；Input Foundation S1 已于 2026-09-22 通过用户审核
>
> 日期：2026-09-11
>
> 范围：`apps/studio`

## 1. 职责边界

Keyboard 是 Action 的一个入口。静态 metadata、动态业务能力和执行结果见
[Studio Action 架构](./studio-action-architecture.md)。组件只绑定语义能力和调用 Action，
不注册业务键位；字段、Slider、Splitter 与菜单自身的键盘协议仍由控件负责。

```text
KeyboardEvent
  → BrowserTanStackHotkeyRegistry（匹配、Mod、Editable 过滤、格式化）
  → StudioKeyboardInputRouter（输入归属、Context、Repeat、Keymap）
  → StudioActionCoordinator（当前能力、接受调用、完成结果）
  → Feature / 业务 Coordinator
  → Project Command（需要写事实时）
```

TanStack Adapter 不知道业务 Action、Selection 或 Modal。Router 不执行 Command、不保存
业务状态，也不把焦点判断变成所有菜单调用的 enabled 条件。Composition Root 创建并释放
目录、目标槽位和唯一物理键位表；视图切换只改变目标，不重复注册 Listener。

## 2. 可查询目录与默认政策

静态名称、说明、类别和中英文检索词由 `studio-action-catalogue.ts` 集中声明。
`studio-default-keymap.ts` 为每个 Action 显式声明默认 Binding 或未分配、Context 和 Repeat。
两份配置都以完整 `StudioActionId` Record 约束；新增 Action 不能悄悄省略默认政策。

`queryStudioShortcuts()` 从 Catalogue、政策和 Router 的有效 Keymap 派生只读查询结果。
未挂载或当前不可执行的 Action 仍然可查，不通过扫描组件或另建手工列表取得操作目录。
Project Entry 的 Keyboard shortcuts 按钮和 Project Menu → View → Keyboard shortcuts
打开同一个 Dialog，支持搜索、已分配／未分配筛选、当前／默认键位、作用区域和 Repeat 提示。
Widget / Pointer Modifier 作为独立帮助内容，不伪装成可重绑定的 Action。

S1 的有效 Keymap 仍是创建时的冻结快照；菜单、Tooltip 和查询窗口均从该 Router 读取。
用户编辑、持久化、响应式替换和 Recorder 由 S2–S3 实现，当前界面不提供修改能力。

`StudioKeyboardBinding` 使用 Brand，内置配置由 `defineStudioKeyboardBinding()` 检查
Hotkey 拼写；动态输入在 Browser Adapter 验证后才成为 Binding。`@tanstack/hotkeys@0.8.0`
运行时依赖仅进入 `browser-tanstack-hotkey-registry.ts`，Binding 文件只导入类型；架构检查
禁止组件直接导入该库或其框架适配包。升级需重验匹配、输入过滤、规范化冲突和释放。

## 3. 输入归属与焦点

输入优先顺序为：

1. 打开的 Menu / Dialog：无匹配动作仍是屏障，自己负责导航、Escape 和焦点恢复。
2. 当前控件保留键：Editable / IME、按钮 Enter / Space、Slider / Splitter 导航键等。
3. 活动 Interaction：独立持有 Cancel 能力，不要求原视图仍获得焦点。
4. Focused Surface：Editor Selection、Piano Roll Tool、Arrangement Clip 或 Bar。
5. Workbench，然后是 Global。

选区目标通过 Focus 激活；Mount 不抢占其他区域的选择。菜单可以使用仍有效的明确目标，
不因为进入菜单时的 DOM 失焦自动禁用。目标身份变化、另一编辑区域获得焦点或卸载会使旧
Binding 失效；旧 disposer 不会释放新 Binding。Selection 与 Preview 保留在原所有者中。

活动 Note、CC64、Tempo 和 Locate 生命周期通过独立交互槽位提供 Cancel。Escape 先取消
交互并保留选择；下一次按下才可能清空选择。接受但执行失败的 Cancel 不向 Clear 回退。
这批仅接入输入取消能力；共享 Pointer / Operation / Preview 协议在 G1–G4 迁移。

Context 明确表达焦点区域：Clip 和 Bar 互斥，可以共用 Enter；Piano Roll 与其选区可能
同时有效。同层且可能重叠的同键位被拒绝；不同优先级允许共用（例如 Cancel / Clear）。
不依赖偶然的 enabled 状态判断冲突，也不支持用户编写 `when` 表达式。

普通按钮的 Enter / Space 保留原生激活语义；聚焦 Arrangement Clip / Bar 的 Enter 是明确
的上下文例外，分别执行打开／创建。字段 Enter / Escape、Ruler Arrow / Home / End / Page
以及 Splitter Arrow / Home / End 仍为 Widget 协议。Follow 暂停由实际导航和滚动触发，
已移除 `TIMELINE_INTERACTION_KEYS` 这份物理按键表。

Project Menu 在打开导航确认或 Keyboard shortcuts Dialog 前，先关闭菜单并恢复入口按钮
焦点；Dialog 关闭后回到该稳定入口。MIDI 文件选择器保留原始用户输入调用栈中的同步触发。
通知区域通过 Action 获得焦点；Reka `ToastViewport` 接收空 hotkey，避免存在独立 F8 监听。

## 4. 当前默认绑定

以下为产品规则说明；运行时权威是 `STUDIO_SHORTCUT_POLICIES`，UI 不从本文读取。

| Action ID                                            | 默认 Binding               | Context / 能力                                                         |
| ---------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `project.save`                                       | `Mod+S`                    | Ready、dirty 且不在 Saving 的 Workbench                                |
| `history.undo`                                       | `Mod+Z`                    | Workbench 可以 Undo；允许 Repeat                                       |
| `history.redo`                                       | `Mod+Shift+Z`、`Control+Y` | Workbench 可以 Redo；允许 Repeat                                       |
| `playback.toggle`                                    | `Space`                    | 当前项目可播放且不在 Loading                                           |
| `playback.return-to-last-start-position`             | 未分配                     | Playback 允许 Return                                                   |
| `projects.show`                                      | 未分配                     | Ready Workbench，没有等待中的返回导航                                  |
| `project.import-midi` / `project.import-midi-tracks` | 未分配                     | Ready Workbench，文件选择／导入能力可用                                |
| `midi-editor.open`                                   | 未分配                     | 当前 Workspace 的 Dock 能力可用                                        |
| `editor.selection.delete`                            | `Backspace`、`Delete`      | 聚焦 Note／CC64 的非空选择，或聚焦且选中的后续 Tempo Event；无活动手势 |
| `editor.selection.clear`                             | `Escape`                   | 聚焦区域有选择且支持 Clear；无活动手势                                 |
| `interaction.cancel`                                 | `Escape`                   | 活动 Note／CC64／Tempo／Locate 交互                                    |
| `arrangement.clip.open`                              | `Enter`                    | 聚焦的 Arrangement MIDI Clip                                           |
| `arrangement.clip.create`                            | `Enter`                    | 聚焦的 Arrangement Track Bar                                           |
| `piano-roll.tool.cursor` / `piano-roll.tool.pencil`  | 未分配                     | 聚焦的 Piano Roll                                                      |
| `piano-roll.snap.toggle`                             | 未分配                     | 聚焦的 Piano Roll                                                      |
| `notifications.focus`                                | `F8`                       | Global                                                                 |
| `shortcuts.show`                                     | 未分配                     | Global                                                                 |

共 19 个 Action，10 个有默认键位，9 个未分配。除 Undo / Redo 外，长按不会重复调用。
S1 在首份用户 Keymap 持久化之前，把旧 `piano-roll.selection.*` 和
`piano-roll.interaction.cancel` 泛化；没有持久化消费者需要兼容旧 ID。Track Note 区域
仍无完整 Note Selection，不能用其焦点删除旧 CC64 选择；Tempo 初始事件仍不可删除。

## 5. 失败与释放

- `Mod` 在 macOS 映射 Command，在 Windows / Linux 映射 Control。
- Adapter 使用 `ignoreInputs: true`，包括带 Mod 的组合与 Escape；Router 拦截 IME、
  legacy keyCode 229 和已经 defaultPrevented 的输入。
- 每个规范化物理组合只注册一次；同层冲突在任何注册前拒绝，注册中途失败撤回全部新 Listener。
- 只有 `unavailable` 可以向下层回退。接受调用或解析失败后同步阻止默认行为和传播；
  Completion 单独表达成功、未应用、取消或失败，不再混用一个 boolean。
- 仅查询匹配 Context；失效编辑器不能连带破坏 Workbench Save。
- Feature 释放自己的目标，应用释放所有键位和能力；Action 等待结束不回滚合法 Commit。

S1 回归包含目录完整性、互斥 Enter、真实 DOM 控件按键、Repeat、焦点选择、活动手势取消、
Settings / Toast 和菜单焦点。实施计划与验证记录见
[Editor Input Foundation V1](./editor-input-foundation-v1-phase-plan.md)；WA 历史验证保留在
[Workbench Action Catalogue 收口报告](./workbench-action-catalogue-v1-closure-report.md)。
