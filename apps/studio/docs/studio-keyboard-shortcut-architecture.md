# Studio Keyboard Input 架构

> 状态：WA1–WA4 已审核；Input Foundation S1 / S2 已审核提交；S3 已于 2026-09-23 通过用户审核
>
> 日期：2026-09-23
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
打开同一个 Dialog，支持功能／键位／作用区域搜索、已分配／未分配／已修改筛选、当前／
默认键位和 Repeat 提示。
Widget / Pointer Modifier 作为独立帮助内容，不伪装成可重绑定的 Action。

S2 由 `StudioUserKeymap` 协调用户覆盖记录、整表验证和 Router 替换；Vue Binding 订阅成功
提交的冻结快照。菜单、Tooltip 和 Settings 读取同一响应式 `StudioKeyboardInput`，组件不能
直接替换物理注册。编辑草稿仅由 Settings 的 `StudioShortcutEditor` 持有，成功保存前不影响
当前键位。S3 增加 Recorder、特殊键选择和冲突重新分配，沿用同一草稿与保存事务。

`StudioKeyboardBinding` 使用 Brand，内置配置由 `defineStudioKeyboardBinding()` 检查
Hotkey 拼写；动态输入在 Browser Adapter 验证后才成为 Binding。`@tanstack/hotkeys@0.8.0`
运行时依赖仅进入 `browser-tanstack-hotkey-registry.ts` 与
`browser-tanstack-hotkey-recorder.ts`，Binding 文件只导入类型；架构检查
禁止组件直接导入该库或其框架适配包。升级需重验匹配、输入过滤、规范化冲突和释放。

## 3. 输入归属与焦点

输入优先顺序为：

1. 正在录制且仍聚焦的局部区域：只生成 Settings 草稿，Escape 只取消录制。
2. 打开的 Menu / Dialog：无匹配动作仍是屏障，自己负责导航、Escape 和焦点恢复。
3. 当前控件保留键：Editable / IME、按钮 Enter / Space、Slider / Splitter 导航键等。
4. 活动 Interaction：独立持有 Cancel 能力，不要求原视图仍获得焦点。
5. Focused Surface：Editor Selection、Piano Roll Tool、Arrangement Clip 或 Bar。
6. Workbench，然后是 Global。

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

## 6. 用户覆盖记录与恢复

`BrowserUserKeymapStorage` 只读写 `seele.studio.user-keymap`，记录格式为：

```json
{
  "version": 1,
  "overrides": {
    "project.save": ["Mod+K"],
    "piano-roll.tool.pencil": [],
    "notifications.focus": ["F9", "F10"]
  }
}
```

- 缺少 Action 条目表示跟随默认；空数组表示主动解除全部绑定；恢复单项删除该覆盖。
  主动保存与默认相同的键位仍是用户覆盖，以便与未来默认政策变更区分。
- 持久化输入保留 portable `Mod`，当前平台仅负责显示和匹配，不把记录改写成 Meta / Control。
- Action ID 已成为持久化协议。未知 ID 连同原始值保留，不注册，也不会因普通编辑或
  “恢复全部默认”被删除；已知非法记录保留到用户修复或恢复对应 Action。
- 加载先检查 JSON、版本和顶层 schema，再逐项验证 Binding，最后按规范化键位检查整个
  Context 路由。非法条目或同层重叠冲突覆盖回退默认；回退后再次验证，直到不再产生连锁
  冲突。有效且无冲突的覆盖仍可使用。相同 Action 的重复物理键位同样拒绝。
- 未识别键名等 TanStack Validation warning 在编辑草稿中显示；warning 不等于非法格式。
  错误和真实冲突阻止保存，不自建另一份第三方键名字典。S3 额外拒绝纯 Modifier 和
  保留给焦点导航的 Tab / Shift+Tab；常见浏览器／系统组合只作提示，见第 8 节。
- 加载不写回存储。损坏、未知版本或读取失败不会阻止启动；设置解释默认值已生效，普通编辑
  暂停，只有用户明确确认重置才替换不可读记录。写入再次失败则保留原记录和提示。
- 加载注册失败时保留默认、原记录及诊断；可修改相关 Action 或恢复默认后重试。
- 设置修改重新验证整份候选记录；不让一个新操作静默禁用原来正常的其他覆盖。旧的非法条目
  可以继续保留；修复解除冲突后，原先因冲突停用且现已有效的覆盖可以一并恢复。
- 记录在当前浏览器本地保存；当前标签页立即生效，重新打开应用加载保存值。没有跨标签页
  同步，不进入 Project File、Project IndexedDB、dirty、History 或 Playback。

## 7. 运行时替换事务

`StudioKeyboardInputRouter.replaceKeymap()` 与 `StudioUserKeymap` 的同步事务顺序：

1. 从默认和候选覆盖生成完整冻结 Keymap，验证格式、重复物理键位和 Context 冲突。
2. 暂停分派；复用规范化身份相同的注册，为新增键位准备 Listener。
3. 成功保存用户覆盖后，发布 Router 的新路由和 User Keymap 快照；Vue Binding 同步接收。
4. 释放不再使用的旧注册，结束暂停。已打开的 Menu / Dialog 暂停令牌继续有效。

准备或持久化失败时撤回新增注册，不发布快照；原路由、UI 提示、存储内容都保持原值。
注册 callback 按物理身份查询已发布路由，而不是闭包保存旧 Action 列表，因此键位交换和
同平台别名替换可以复用原 Listener。成功提交后的旧注册清理异常只记录诊断，不伪报保存
回退；已移除路由不再派发 Action。订阅者异常隔离，不能把已经保存的结果解释为失败。

Composition Root 创建并释放 Storage、User Keymap、Vue Binding 和 Router；Vue 只持有
可丢弃投影及本地草稿。S2 回归包括加载／刷新语义、未知 ID、非法／冲突连锁回退、单项／
全部恢复、注册／存储失败、事务输入暂停、实际 TanStack Mod 匹配和交换路由，以及真实
Reka Dialog、菜单／按钮提示更新与焦点恢复。

## 8. Recorder 与特殊键

Composition Root 创建唯一 `StudioShortcutRecorder`，通过 Vue Context 提供录制能力，释放时
先停止 Recorder 再释放 Router。Settings 按钮是本次录制的焦点所有者；Adapter 暂停后台
Action 路由，调用 TanStack 的公开 `HotkeyRecorder`，完成后将结果交回本地草稿。它不执行
Action，不保存用户设置，也不接触 Project。

- 正常录制输出 portable `Mod`，经过与手动输入相同的 Validation 后写入当前草稿行。
- Escape 只取消录制；无修饰键的 Delete / Backspace 只移除当前草稿行。用户需要绑定这些
  按键时，可以手动输入或使用 Special key 选择；带修饰键的 Delete 仍可正常录制。
- IME、legacy 229、Dead / Process / Unidentified、AltGraph、Repeat 和已消费事件不会生成
  Binding。库自身没有完整处理这些条件，因此过滤放在窄 Browser Adapter 中。
- 完成、取消、焦点离开、Window blur、页面隐藏、组件卸载或应用释放时，清理录制监听与
  本次暂停令牌。旧 cancel 不能结束新录制；Dialog 自己的暂停令牌不受录制结束影响。
- 录制启动失败同样清理资源并保留草稿。保存按钮在录制期间禁用；结果仍需显式保存才生效。

上述 Escape / Delete 和 portable Mod 行为依据已安装的 `0.8.0` 源码与
[TanStack 录制指南](https://tanstack.com/hotkeys/latest/docs/framework/vue/guides/hotkey-recording)。
对常见浏览器／系统组合提供非阻断提示；列表是有限提醒，不是平台保留键的完整数据库。
浏览器未交付的事件无法被页面录制或覆盖，用户仍可手动输入。浏览器组合参考
[Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179?hl=en)。

## 9. 冲突预览与重新分配

`analyzeStudioKeyboardRoutes()` 是运行时验证、加载验证和草稿说明的共同规则，按当前平台的
物理键位身份比较 Action 对，返回三类关系：

| 关系        | 解释与处理                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `exclusive` | 聚焦区域互斥，允许共用；例如 Arrangement Clip / Bar 的 Enter。                                       |
| `priority`  | Context 可能重叠，但优先级明确；例如 Cancel 优先于 Clear。只有上层不可用才尝试下层，执行失败不回退。 |
| `conflict`  | Context 可能重叠且同优先级，普通保存被阻止；用户需要改键或显式重新分配。                             |

`StudioUserKeymap.inspectBindings()` 只读分析候选覆盖，包含尚未因冲突隔离的原始请求，因此
能解释冲突对象，而不是拿默认回退后的路由误判为无冲突。UI 列出 Action 名称、键位和作用
区域；合理共用不会被删除。

选择 Reassign 后先展示将受影响的 Action 和键位，焦点进入确认按钮。最终保存只从同层
冲突 Action 移除对应物理键位，保留其余绑定、未知记录和兼容的共用关系。整批改动复用
第 7 节的一次保存事务，注册或存储失败时全部保持原值。其他 Action 的损坏记录必须先由
用户修复，不能为移除一个键而丢弃整份记录。

确认保留当时的 User Keymap 快照；配置已变化时拒绝旧确认，要求重新检查。编辑草稿会
撤销当前确认；Escape 依次退出重新分配确认、编辑草稿、Settings Dialog。录制中的 Escape
在这一层级之前被 Recorder 接管。macOS / Windows / Linux 的 Mod 与别名冲突由自动测试
验证，真实浏览器 smoke 范围单独记在阶段计划中。
