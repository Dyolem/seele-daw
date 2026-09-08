# Studio Keyboard Shortcut Architecture

> 状态：WA1／WA2 已实现并通过审核
>
> Date: 2026-09-08
>
> Scope: `apps/studio`

## 1. 边界

Keyboard 是 Action 的一个输入入口。应用级静态目录、当前操作目标、呈现状态与执行结果见
[Studio Action Architecture](./studio-action-architecture.md)。旧的
`StudioKeyboardShortcutCoordinator` 和 Feature 动态注册接口已移除。

```text
KeyboardEvent
  → BrowserTanStackHotkeyRegistry (matching / Mod / editable filtering)
  → StudioKeyboardInputRouter (input ownership / scopes / keymap)
  → StudioActionCoordinator (current capability / acceptance / completion)
  → Current business target (Save / History / Playback / Editor)
```

Browser Registry 不知道 Save、Piano Roll 或 Modal。Input Router 不执行 Command、不拥有业务
busy 状态，也不把键盘焦点变成菜单 Action 的通用 enabled 条件。

## 2. 默认键位与平台边界

默认 Binding 集中在 `studio-default-keymap.ts`。`StudioKeyboardBinding` 仍使用共享 Brand，
内置配置由 `defineStudioKeyboardBinding()` 提供编译期 Hotkey 拼写检查；动态字符串通过
Browser Adapter 的 Validation 后才成为 Binding。空 Binding 列表表示未分配快捷键，Action
仍保留在目录中并可由菜单调用。

Composition Root 提供冻结 Keymap；Router 保存自己的不可变快照并提供平台化显示文案。
页面不注册按键、不保存默认 Binding 字符串，也不因 Track / Clip 切换重建底层 Listener。

`@tanstack/hotkeys@0.8.0` 继续作为已有浏览器叶子 Adapter，未引入其 Vue composable。
生产运行时导入仅限 `browser-tanstack-hotkey-registry.ts`；Binding 类型文件仅导入 Hotkey
类型。升级需要重验平台匹配、输入过滤、标准化冲突和释放。

## 3. 输入所有权与冲突

优先级为：

1. 打开的 Reka Menu / Modal 接管输入，阻止后台 Action；没有匹配动作也不向后台穿透。
2. 当前编辑交互（Interaction），例如 Escape 取消拖动。
3. 聚焦编辑器（Editor），例如清空或删除选择。
4. Workbench。
5. Global（当前没有该作用域的 Action）。

导航确认的 pending 状态由 Composition Root 提供 Modal barrier；Project Menu 打开期间持有
可嵌套的键盘暂停能力。Reka 继续负责菜单导航、Escape 关闭及焦点恢复。菜单显式选中 Save
仍可调用同一 Action Handler。

每个物理键位仅注册一次。Browser Adapter 先用同一平台规则标准化 Binding，因此 macOS 上
`Mod+S` 与 `Meta+S` 会被识别为同一物理组合。相同 Scope 的冲突在任何物理注册前拒绝；
不同 Scope 可共用键位，例如两个含义独立的 Escape Action。若后续浏览器注册失败，回滚
已创建的 Listener，不留下部分生效的键位表。

分派时只有 `unavailable` 向低优先级 Scope 回退。接受调用或解析失败都会同步阻止浏览器
默认行为及传播；业务随后成功、未应用或失败，由独立 Completion 表达，不再使用 boolean
同时代表接管输入与业务成功。

每个按键只读取匹配作用域的上下文，编辑器焦点查询失败不会连带禁用 Workbench Save。

## 4. 当前目录与绑定

| Action ID                                            | 默认 Binding               | Scope       | 业务能力                                                         |
| ---------------------------------------------------- | -------------------------- | ----------- | ---------------------------------------------------------------- |
| `project.save`                                       | `Mod+S`                    | Workbench   | Ready、dirty 且不在 Saving                                       |
| `history.undo`                                       | `Mod+Z`                    | Workbench   | Session 可以 Undo                                                |
| `history.redo`                                       | `Mod+Shift+Z`、`Control+Y` | Workbench   | Session 可以 Redo                                                |
| `playback.toggle`                                    | `Space`                    | Workbench   | 当前项目有可播放计划且不在 Loading                               |
| `playback.return-to-last-start-position`             | 未分配                     | Workbench   | Coordinator 允许 Return；Loading 不会禁用 Return                 |
| `projects.show`                                      | 未分配                     | Workbench   | 当前项目 Ready，且没有正在等待的返回项目列表导航                 |
| `project.import-midi` / `project.import-midi-tracks` | 未分配                     | Workbench   | 当前项目 Ready，文件选择器可用，且没有正在选择或导入的 MIDI 文件 |
| `midi-editor.open`                                   | 未分配                     | Workbench   | 当前 Workspace 的 Dock 操作端口可用                              |
| `piano-roll.selection.delete`                        | `Delete`、`Backspace`      | Editor      | 当前 Note 或 CC64 选择非空且没有进行中的手势                     |
| `piano-roll.selection.clear`                         | `Escape`                   | Editor      | 当前选择非空且没有进行中的手势                                   |
| `piano-roll.interaction.cancel`                      | `Escape`                   | Interaction | 当前编辑目标有进行中的手势                                       |

`piano-roll.notes.remove` 被语义准确的 `piano-roll.selection.delete` 替代，旧 ID 没有持久化
消费者。Cancel Interaction 不清空选择，Clear Selection 不兼任取消。Track 音符区域聚焦时，
不能删除之前选中的 CC64 事件；通过 Tab 聚焦回 Lane 后才恢复该目标的键盘操作。

## 5. 浏览器事件与生命周期

- `Mod` 在 macOS 对应 Command，在 Windows / Linux 对应 Control。
- Adapter 强制 `ignoreInputs: true`，包括带 Mod 的组合和 Escape。
- `isComposing`、legacy keyCode 229、已被处理的 `defaultPrevented` Event 不进入 Action。
- TanStack 默认 `preventDefault` / `stopPropagation` 关闭，由 Router 在接管时决定。
- 单个 Handler 出错不破坏其他 Action；根级诊断接收器必须接入。
- Feature 卸载只释放自己的目标；应用释放才卸载整个物理键位表。
- 目标替换和应用释放结束挂起的 Action 等待，不回滚 Project Commit。

## 6. 后续范围

本批没有用户 Keymap 持久化、Settings、Recorder、多键 Sequence 或 Command Palette。已存在
动态 Binding 验证边界；未来 Settings 必须在字段旁显示无效输入并保留原值，不能把原始
字符串断言为合法 Binding。损坏持久化覆盖的回退策略留给真正的 V1B 保存/加载切片实现。

Workbench 菜单、Transport 和 Arrangement 导入按钮已在 WA2 接入统一调用与 Presentation；
右键菜单及其选择语义在 WA3。批次状态见
[Workbench Action Catalogue V1 phase plan](./workbench-action-catalogue-v1-phase-plan.md)。
