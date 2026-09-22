# Studio Action 架构

> 状态：WA1–WA4 已审核；Input Foundation S1 已于 2026-09-22 通过用户审核
>
> 日期：2026-09-11

## 1. 职责归属与应用装配

Studio Action 表达一个用户意图。应用在装配时一次性组合所有 Action 定义；Workbench 和
Piano Roll 视图挂载后，绑定各自当前的业务操作目标。Action 定义与实际按键注册的生命周期
长于这些视图。替换目标时，先使旧目标失效，再发布新绑定；延迟执行的 disposer 只能释放
它自己对应的绑定。

```text
Menu / Toolbar / Context Menu ──────────┐
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

`bootstrap/studio-action-runtime.ts` 装配各功能的 Action 定义、按所有权拆分的目标槽位和键盘路由器。
`studio-application.ts` 负责释放这些资源，并将非预期错误接入现有 Toast 通道和控制台诊断。
各视图通过带类型约束的 Vue context 注入能力。Handler、等待完成的 resolver、目标绑定、
History、dirty 状态和播放资源均不进入 Pinia。

旧的 `StudioKeyboardShortcutCoordinator.register()` API 和由组件注册 Action 的机制已移除。
所有已迁移入口使用同一套调用系统，不保留并行的兼容注册表。

## 2. 接口契约

- 对外公开的 Catalogue 不可变，只包含稳定 ID、名称、说明、类别与检索词，不包含 Handler 或绑定。
- 各功能的 Action 定义负责解析当前目标，并从业务状态的权威持有方派生 `enabled`、`busy`、
  可选的 `checked`、名称和禁用原因。Presentation 是可随时释放的派生视图。
- Keyboard、Menu、Toolbar 和 Context Menu 都是调用来源，共用同一个 Handler。
- 每次调用都重新解析当前能力。先前的 Presentation 显示为可用，不代表调用时仍可使用已失效的目标。
- 键盘焦点与覆盖层的输入所有权由输入路由器处理。DOM 焦点转移到菜单，本身不会禁用针对
  仍然有效的当前编辑目标的显式 Action 调用。
- 允许 Action 没有按键绑定。移除快捷键不会从 Catalogue 中移除 Action，也不会禁用菜单调用。

Workbench、选区、活动交互、Piano Roll Tool、Arrangement Clip／Bar 和界面操作分别提供
当前能力；这些有限槽位不解释任意参数或用户 Context 表达式。未引入通用参数化 Action
总线或应用级故障恢复平台。

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

从 Project Menu 执行 Projects 时，Workbench UI 先在菜单的 `close-auto-focus` 阶段恢复
菜单按钮焦点，再调用 Action。这样导航确认框拥有仍然存在的返回目标，Cancel 或 Escape
关闭后可以回到该按钮。组件卸载会清理尚未派发的导航意图；这段焦点交接不进入 Action
Coordinator 或导航业务契约，也不延迟需要同步 user activation 的 MIDI 文件选择器。

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

### 4.2 编辑区域（WA1／WA3 与 Input Foundation S1）

S1 把尚未持久化的 Piano Roll 专属选择／取消 ID 泛化为三个独立意图：

- `editor.selection.delete` 删除聚焦区域的 Note／CC64 选择，或聚焦且选中的可删除 Tempo
  Event。每次事实删除仍经既有业务 Coordinator 形成一个 Command / History step。
- `editor.selection.clear` 只清空支持此能力的编辑器选择；Tempo 不声明该能力。
- `interaction.cancel` 取消当前活动 Note／CC64／Tempo 手势或 Timeline Locate，不清空
  选择。键盘不要求交互持有焦点；下一次 Escape 才可能执行 Clear Selection。

选区能力由 `useStudioEditorSelectionTarget()` 在 Focus 时激活，Mount 不抢占。身份变更
使旧 Binding 和菜单失效；旧组件卸载只释放自己的 Binding。活动交互使用另一 Slot，
在 Begin / End 的活动状态变化时绑定和释放，不跟随选区 Focus。两个 Slot 不保存选区、
Preview 或 Project facts 的副本。Tempo 删除由 Page 提供窄能力，保留 Playback 准备、
Command 结果、失败反馈和选择清理；Lane 不通过无返回值的 Emit 冒充业务完成。

Cursor、Pencil、Snap、Arrangement Clip 打开／创建，以及通知焦点和快捷键查询均已进入
Catalogue；具体能力仍属于各 Feature。静态 metadata 集中在 `studio-action-catalogue.ts`，
默认 Binding / Context / Repeat 集中在 `studio-default-keymap.ts`，新增 ID 必须补齐两份
穷尽配置。Settings 在 Feature 未挂载时仍能查询完整目录。

Track Scope 尚无完整的 Note 选择与编辑流程。焦点进入其 Note 区域后，不能删除先前的 CC64
选择；通过键盘聚焦 CC64 lane 时，会重新激活对应的选择目标。Track／Clip 替换时，
不再依赖组件的卸载顺序来避免重复 Action ID。

WA3 接入 Reka Context Menu，提供 Delete Selection 和 Clear Selection。右键选择策略已获
确认：右键未选中的 Note 或 CC64 事件，先单选该对象；右键多选成员，保留原多选。背景区域
有选择时操作该选择；没有可执行动作、存在进行中的手势或命中不可编辑对象时不显示菜单。
选择变化仍归 Editor Session 或 CC64 Lane 管理，不写入 Project，也不建立新的选择 Store。

Clip Focus 支持 Note 和 CC64 菜单；Track Scope 只支持 Active Clip 的 CC64 事件。非 Active
Clip 的事件不会因右键而自动改变 Active Clip。CC64 DOM marker 同时携带事件 ID 和 Clip
occurrence ID，避免同一 Source 事件在不同 Clip 中显示时被错当成当前可编辑 occurrence。
Track Scope 的完整 Note 选择与编辑流程仍未实现。

菜单通过发起视图返回的短期目标，记录当前 Action Binding 和用于恢复焦点的编辑区域。
它只读取 Catalogue Presentation 与 Input Router 的平台化快捷键提示；Workbench 和编辑器
菜单共用 `presentStudioAction()`，不再在不同 Feature 内复制文案拼接规则。菜单不保存
Selection 副本，也不广播整份编辑器状态。没有 Binding 的 Action 仍可从菜单执行。

Reka 拥有菜单开关、导航与 Escape；菜单打开期间持有键盘暂停能力。Escape 关闭菜单并将
焦点恢复到原 Note 区域或 CC64 Lane，不清空选择。随后再次按 Escape 才路由到编辑器的
Clear Selection。恢复位置由编辑器明确提供，连续右键不会错误记录上一层菜单的 DOM 焦点。
关闭时只在原 Binding 仍有效的情况下恢复焦点，避免延迟聚焦旧视图。

Session、Track、Clip、Source、CC64 Channel 或当前编辑种类替换时，旧 Binding 同步失效并
关闭菜单。Clip Focus 重建 Editor Session 所依赖的 Clip window 变化也会使其失效。菜单
调用前再次检查该 Binding；即使新视图先挂载、旧视图稍后才卸载，旧菜单或旧视图也不能借
全局当前槽位操作新目标。选择消失后菜单自动关闭。删除仍调用现有集合 Command，多个
Note 或 CC64 事件只产生一个 History step；Clear Selection 不改变 Project revision。

### 4.3 菜单内容与交互的归属

Project Menu、Add Track 和 Piano Roll Context Menu 通过 Reka 的 `as-child` 组合
`UiMenuSurface`，由其原生 DOM 节点承接 scoped 样式。背景、边框、层级、间距、滚动与
视口尺寸上限属于 Studio UI；`UiMenuItem` 统一普通命令项的文字、图标和快捷键提示布局。
这些组件不依赖 Reka、Action Coordinator 或业务状态，不建立额外的菜单注册系统。
Add Track 的多行菜单项与音色选择器使用各自的原生内容布局。

Reka 继续负责触发、Portal、定位与碰撞处理、键盘导航、ARIA、Escape 和焦点管理。
尺寸约束使用标准 CSS 视口单位与 Studio 令牌，不引用 Reka 的 available-width／height
CSS 变量，也不为其建立别名。内容受视口限制并自行滚动；Reka 的 `prioritize-position`
允许浮层在空间不足时调整位置，必要时覆盖触发区域，以保持内容可达。

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
完整门禁、浏览器证据与人工验收状态见 [阶段收口报告](./workbench-action-catalogue-v1-closure-report.md)。
