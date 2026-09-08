# Studio Action 架构

> 状态：WA1／WA2 已实现并通过审核
>
> 日期：2026-09-08

## 1. 职责归属与应用装配

Studio Action 表达一个用户意图。应用在装配时一次性组合所有 Action 定义；Workbench 和
Piano Roll 视图挂载后，绑定各自当前的业务操作目标。Action 定义与实际按键注册的生命周期
长于这些视图。替换目标时，先使旧目标失效，再发布新绑定；延迟执行的 disposer 只能释放
它自己对应的绑定。

```text
Menu / Toolbar ─────────────────────────┐
Keyboard → Browser Registry → Input Router
                                      ↓
                            Studio Action Coordinator
                                      ↓
                     当前 Workbench / Piano Roll 操作目标
                                      ↓
          ActiveProjectService / ProjectSession / Playback / Editor
                                      ↓
                      修改事实时调用 Project Command
```

`bootstrap/studio-action-runtime.ts` 装配各功能的 Action 定义、两个目标槽位和键盘路由器。
`studio-application.ts` 负责释放这些资源，并将非预期错误接入现有 Toast 通道和控制台诊断。
各视图通过带类型约束的 Vue context 注入能力。Handler、等待完成的 resolver、目标绑定、
History、dirty 状态和播放资源均不进入 Pinia。

旧的 `StudioKeyboardShortcutCoordinator.register()` API 和由组件注册 Action 的机制已移除。
所有已迁移入口使用同一套调用系统，不保留并行的兼容注册表。

## 2. 接口契约

- 对外公开的 Catalogue 不可变，只包含稳定 ID、名称和说明，不包含 Handler 或绑定。
- 各功能的 Action 定义负责解析当前目标，并从业务状态的权威持有方派生 `enabled`、`busy`、
  可选的 `checked`、名称和禁用原因。Presentation 是可随时释放的派生视图。
- Keyboard、Menu、Toolbar 和 Context Menu 都是调用来源，共用同一个 Handler。
- 每次调用都重新解析当前能力。先前的 Presentation 显示为可用，不代表调用时仍可使用已失效的目标。
- 键盘焦点与覆盖层的输入所有权由输入路由器处理。DOM 焦点转移到菜单，本身不会禁用针对
  仍然有效的当前编辑目标的显式 Action 调用。
- 允许 Action 没有按键绑定。移除快捷键不会从 Catalogue 中移除 Action，也不会禁用菜单调用。

本批次只使用 Workbench 和 Piano Roll 两个目标槽位，不引入通用的参数化 Action 总线、
上下文表达式语言或应用级故障恢复平台。

## 3. 接受调用、完成结果与失败处理

| 结果                     | 含义                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `unavailable`            | 当前没有目标或业务能力，未执行 Handler。                                                 |
| 调用阶段的 `failed`      | 解析目标或能力失败，已报告诊断信息。                                                     |
| `accepted`               | 已同步开始执行，保留浏览器的 user activation；后续通过 completion Promise 返回完成结果。 |
| Completion `completed`   | 业务操作已完成。                                                                         |
| Completion `not-applied` | 业务权威未应用变更；接受调用不代表执行成功。                                             |
| Completion `failed`      | 业务失败或 Handler 抛出已被捕获的异常；`reported` 记录是否已向用户反馈。                 |
| Completion `cancelled`   | 目标或应用的生命周期已结束，当前调用方停止等待。                                         |

键盘路由器会消费已接受的输入，即使执行在同步阶段或后续异步阶段失败。解析目标或能力失败时也会
消费输入，避免高优先级处理出错后意外触发低优先级 Action。只有 `unavailable` 允许回退到
较低优先级的 Scope。

Presentation 派生、目标解析和执行过程中的非预期错误都会被捕获并报告。同一个尚未恢复的错误
不会因为反复读取 Presentation 而重复弹出 Toast。预期内的 Save 失败继续通过
ActiveProjectService 的保存状态呈现；播放和编辑器失败沿用现有业务反馈。已经反馈的失败
不会再次触发 Toast。

目标替换、视图卸载和应用释放时，已接受但仍在等待的调用会立即以 `cancelled` 结束。
Action Coordinator 不会把旧调用随后返回的成功或拒绝结果当作新目标的结果，也不会据此触发通知。这里的取消
不会撤销 Project Commit，也不会中止由 ActiveProjectService 持有的持久化操作。
业务并发控制与 busy 状态仍由对应的 Service 或 Coordinator 负责。

视图在目标身份发生变化时，以及 `onBeforeUnmount` 阶段，显式释放目标。根据具体视图，
Session、Project、Track、Clip、MIDI source、Channel 和当前获得焦点的编辑类型共同确定目标身份。
选择状态的版本变化和 Save 进度变化不会反复释放目标。目标槽位不复制业务的响应式状态；
Vue Presentation 直接读取业务 refs。

## 4. 本批次已贯通的调用链

### 4.1 Workbench（WA1／WA2）

Save 菜单项、Save 按钮和 `Mod+S` 都调用 `project.save`，并共用同一份 Presentation：
dirty 时启用 Save；Saving 时显示忙碌并禁用；失败时提供 Retry save；当前内容成功持久化后
禁用 Save。菜单快捷键文本和按钮提示统一使用键盘路由器按当前平台格式化的按键绑定。

Undo、Redo 和 Play/Pause 的菜单项、Transport 按钮与既有快捷键共用 Action 定义。
Project Menu 新增 History 和 Playback 分组，按钮名称、菜单文案、忙碌状态与禁用原因均从
同一份 Presentation 派生。菜单快捷键和按钮提示都使用 Input Router 的平台化文案；
未绑定快捷键的 Action 不显示虚构的键位。菜单高度受可用视口限制，内容较多时允许滚动。

| Action ID                                | 入口与语义                                                         | 状态与执行权威                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `history.undo` / `history.redo`          | Menu、Transport、Keyboard；一次调用只执行一次 Undo／Redo           | ProjectSession                                                     |
| `playback.toggle`                        | Menu、Transport、Keyboard；Play／Loading…／Pause，Loading 时禁用   | ProjectPlaybackCoordinator                                         |
| `playback.return-to-last-start-position` | Menu、Transport；停止并返回上次开始位置，Loading 时仍可调用        | Coordinator 的 Return 能力与 Return Anchor                         |
| `projects.show`                          | Project Menu、窄视口的 Back to projects；导航等待期间禁用重复调用  | Router 与既有导航确认；Page 只持有此次导航的 busy 状态             |
| `project.import-midi`                    | Project Menu；选择文件并导入为新项目                               | 页面文件选择器、ProjectMidiImportCoordinator、ActiveProjectService |
| `project.import-midi-tracks`             | Project Menu、Arrangement 空状态和尾部按钮；导入为当前项目的新轨道 | 页面文件选择器、ProjectMidiImportCoordinator                       |
| `midi-editor.open`                       | View Menu、Transport；打开或恢复 MIDI editor，保留选择             | Workspace 的 Dock 状态与临时操作端口                               |

WA2 新增的五个 Action 默认没有 Binding；显式提供合法 Binding 后仍通过同一路径调用。
参数化的 Tempo、Add Track、音色选择，以及 Clip 双击后的上下文定位保留各自现有业务入口。

MIDI 文件选择器必须在原始用户输入的同步调用栈中打开。页面的 `useProjectWorkbenchMidiImport`
持有原生 input、选择／导入阶段和 pending resolver；两种导入 Action 共用这一阶段状态，
完成结果覆盖文件选择和后续导入。取消选择或取消替换项目返回 `not-applied`；预期业务失败
沿用导入反馈，Action 不重复通知。新轨道的放置 tick 在打开选择器时捕获。

页面卸载、路由切换或新轨道导入的 Session 被替换时，等待立即取消，迟到的结果不再修改
选择或产生反馈。新项目导入会主动激活新的 Session，使旧 Action 调用方的等待结束；
已完成创建的业务流程仍继续反馈导入结果并导航到新项目。释放页面等待不会中止业务权威
已经接管的解码、Project Command 或持久化。

Dock 的 `checked` 直接读取 Workspace 当前状态；Shell 不再通过事件维护第二份开关状态。
页面通过当前 Shell 的临时端口找到 Workspace，Action 定义仍属于应用生命周期。

### 4.2 Piano Roll（WA1）

Piano Roll 区分三个独立意图：

- `piano-roll.selection.delete` 使用现有集合 Command 删除当前选中的 Note 或 CC64 事件，
  一次调用只产生一个 Command 和一个 History step。它替换了语义不准确的内部 ID
  `piano-roll.notes.remove`，因为旧 Action 实际上也会删除 CC64 事件。没有持久化 Keymap
  或 Project 协议使用该旧 ID。
- `piano-roll.selection.clear` 只清空选择，在手势进行期间禁用。
- `piano-roll.interaction.cancel` 只取消手势，保留选择。Escape 优先路由到此 Action，
  然后才是 Clear Selection；再次按 Escape 时可以清空选择。

Track Scope 尚无完整的 Note 选择与编辑流程。焦点进入其 Note 区域后，不能删除先前的 CC64
选择；通过键盘聚焦 CC64 lane 时，会重新激活对应的选择目标。Track／Clip 替换时，
不再依赖组件的卸载顺序来避免重复 Action ID。

WA1 未实现右键菜单，也未确定右键选择策略。

## 5. 中英术语表

| English                 | 中文               | 本项目含义与用户预期                                                       |
| ----------------------- | ------------------ | -------------------------------------------------------------------------- |
| Action                  | 用户动作           | Save、Delete Selection 等单一意图；不等于一次事实写入。                    |
| Catalogue               | 动作目录           | 应用装配时固定的身份与说明；页面未打开也能查询。                           |
| Descriptor              | 静态描述           | 稳定 ID、名称与说明，不包含当前是否可用。                                  |
| Handler                 | 执行函数           | 调用业务权威完成意图；不会因入口不同重复实现。                             |
| Target / capability     | 操作目标／当前能力 | 当前项目或当前编辑对象的临时端口；切换后旧端口失效。                       |
| Presentation            | 呈现状态           | 可用、忙碌、勾选、名称与禁用原因；由现有权威派生。                         |
| Invocation source       | 调用来源           | Keyboard、Menu、Toolbar、Context Menu，用于区分入口和诊断。                |
| Acceptance              | 接受调用           | 当前输入已被接管；后续仍可能取消或失败。                                   |
| Completion              | 完成结果           | 业务执行完成、未应用、失败或调用等待被取消。                               |
| Command                 | 项目命令           | Project Core 中参数完整的原子事实修改，支持 History。                      |
| Commit / History step   | 提交／历史步骤     | 一次合法事实变更及其撤销边界；Action 失败不能回滚它。                      |
| Binding / Keymap        | 按键绑定／键位表   | 输入组合与 Action ID 的映射；Action 可以没有快捷键。                       |
| Scope / input ownership | 作用域／输入所有权 | 决定当前按键由交互、编辑器、工作台或覆盖层处理。                           |
| Disposer / invalidation | 释放函数／失效     | 结束临时能力；旧组件的延迟清理不能移除新目标。                             |
| CC64 / Sustain Pedal    | 延音踏板控制器     | 按 MIDI Channel 编辑的踏板事件；与音符拥有各自选择。                       |
| Return Anchor           | 播放返回位置       | Playback Coordinator 持有的上次开始位置；Return 停止播放并返回该位置。     |
| Native file chooser     | 原生文件选择器     | 在用户输入的同步调用栈中打开；取消选择不导入文件、不生成 Project Command。 |
| Navigation guard        | 导航守卫           | Router 调用既有导航确认，处理尚未保存的变更；Projects Action 沿用该流程。  |

键盘策略详见 [Studio 快捷键架构](./studio-keyboard-shortcut-architecture.md)。
批次范围与进度见 [Workbench Action Catalogue V1 阶段计划](./workbench-action-catalogue-v1-phase-plan.md)。
