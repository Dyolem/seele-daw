# Editor Input Foundation V1 阶段计划

> 状态：计划已获批准；S1 已于 2026-09-22 通过用户审核；S2–S3 / G1–G4 尚未实施
>
> 日期：2026-09-11
>
> 代码基线：`b28049f`，Workbench Action Catalogue WA1–WA4 已审核并提交

## 1. 重新确定优先级

下一阶段优先解决两个独立主题：**Shortcut Catalogue / User Keymap** 与
**Editor Interaction Architecture**。先交付能够查询和修改快捷键的完整产品入口，再迁移
编辑手势基础；共同的输入所有权、取消和作用域规则在第一批确定。

旧的 [Minimal Gesture / Semantic Layer 草案](../../../packages/editor/docs/minimal-gesture-semantic-layer-v1-phase-plan.md)
被本计划替代。其范围只覆盖 Piano Roll，不能充分验证后续 Arrangement Clip 的复用；提前
决定删除 XState，以及把所有 Viewport 变化都视为取消，也缺乏跨编辑器依据。这两项决定撤回。

本阶段采用新的职责划分来判断现有实现。被替代的生命周期、键位映射和局部业务快捷键必须
删除；复用已存在且边界清楚的能力，不要求保留原有文件结构。Velocity、Clip 编辑新功能与
WAV Export 等待这两个主题完成后再排期。

## 2. 规划时已核实的基线（S1 之前）

完整盘点见 [Studio 输入行为清单](./studio-input-inventory.md)。这里区分已有基础与产品缺口：

- Action Catalogue 有 12 个稳定 Action，其中 7 个有默认快捷键，5 个尚未分配。Save、
  History、Playback、Note / CC64 Delete、Clear、Cancel 已通过统一调用路径执行。
- `@tanstack/hotkeys@0.8.0` 已安装并用于浏览器注册、匹配、Mod、格式化和输入验证。
  `createStudioKeyboardKeymap(overrides)` 支持程序传入覆盖，但当前 Router 只保留创建时快照。
- 默认键位与 `ACTION_SCOPES` 分开维护；Action metadata 又来自各功能定义。缺少可查询的
  完整投影，也缺少用户设置、持久化、录制、运行时替换和面向用户的冲突解释。
- Tempo Event 删除和取消、时间轴定位取消、Clip 的 Enter 操作、Toast F8 等仍有局部入口。
  另有 Widget 键盘行为和按键触发的 Follow 暂停，不能只迁移直接执行 Command 的 `keydown`。
- Note 使用 XState Session；CC64 有另一套手写 Session；Tempo Lane 在 Vue 中拥有 Pointer
  生命周期；Track Pencil 主要在 End 解析当前状态；Arrangement Locate 有独立 Capture、
  Cancel 与 Edge Scroll。共同职责已经跨越 Piano Roll。

WA 阶段的价值保留，但它的完成不代表 Studio 全部键盘行为已经治理完成。

## 3. 成熟系统提供的参考

以下是公开设计中可借鉴的模式；具体分层与产品政策是 Seele 的设计判断，不宣称存在一套
所有大型编辑器都使用的通用框架。

| 系统    | 公开设计                                                                                                                                                    | 对 Seele 的启示                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blender | Operator 通过稳定 ID 被按钮、快捷键等引用；Context / poll 判断适用性；Modal Operator 可以跨多个事件存活，并明确完成、取消和事件是否继续传播。               | 一次交互应有独立实例和生命周期；业务操作与触发方式分开。参见 [Operators](https://developer.blender.org/docs/features//interface/operators/)。                                         |
| tldraw  | Tool 是 Statechart 的顶层状态，可有子状态；核心 Editor 可由外部提供工具。                                                                                   | 共享状态协议，具体工具解释输入；新增对象不应继续往 Note 状态机添加分支。参见 [Tools](https://tldraw.dev/docs/tools)。                                                                 |
| tldraw  | History 提供 mark、bail 和 squash，将复杂交互组织成用户可理解的一步；Edge Scroll 由正在拖动的工具状态启用。                                                 | 一次交互需要明确撤销边界，坐标映射必须支持拖动期间滚动。参见 [History](https://tldraw.dev/sdk-features/history) 与 [Edge scrolling](https://tldraw.dev/sdk-features/edge-scrolling)。 |
| VS Code | Keyboard Shortcuts Editor 列出有键位和无键位的命令，支持查询、修改、移除、恢复和查看相同键位；Binding 使用 Command ID 与 Context 条件，用户覆盖运行时生效。 | 建立完整操作目录和可解释的有效键位表，避免让用户依靠记忆。参见 [Keyboard shortcuts](https://code.visualstudio.com/docs/configure/keybindings)。                                       |

不照搬 Blender / tldraw 在交互中写数据再撤销的方式。Seele 保留自己的事实边界：创作编辑的
Preview 不写 Project，完成时提交一个原子 Command；Selection 不进入 Project History。
Statechart 思想也不要求采用某一状态机库或继承体系。

## 4. 两个主题之间的共同边界

```text
Keyboard → TanStack Adapter → Context / Effective Keymap → Studio Action
                                                            ↓
Pointer → Browser Adapter → Tool / Interaction Session → Semantic Operation
                                                            ↓
                                          Studio 当前目标 / 业务 Coordinator
                                                            ↓
                                            Project Command（需要写事实时）
```

高频 Pointer Update 直接进入 Interaction Session。取消、删除、选择 Tool、切换 Snap 等
离散动作进入 Action；两者可以调用同一语义操作，键盘不需要伪造 PointerEvent。

输入所有权由明确上下文决定：录制中的局部输入、打开的 Menu / Dialog、控件自己的键盘
操作、活动交互、当前聚焦编辑区域、Workbench / Global。录制发生在 Settings Dialog 内时，
只接管自己的录制区域；两者共同阻止后台动作。Modal 无匹配 Action 时仍然是屏障。

当前 `global / workbench / editor / interaction` 只有层级，无法表达 Tempo Lane 与 Piano
Roll 是否互斥。增加有类型的 Focused Surface 与活动 Interaction Owner；不引入用户可编写的
`when` 表达式语言。Focus、Selection、业务可用性保持不同含义，菜单仍能调用明确目标。

同一输入只能被一个业务动作接受；已经接受但执行失败不能继续落到另一个动作。活动交互
通过带身份的取消能力接入输入层，旧 Surface 的释放不能取消新 Surface 的交互。

## 5. Shortcut Catalogue / User Keymap

### 5.1 一个可查询目录，一份默认键位政策

Action Catalogue 继续是用户动作的唯一目录。增加类别、检索词和快捷键资格等必要 metadata，
不另建平行 Command Bus。业务实现保留在各 Feature；应用装配时得到完整静态目录，未挂载
或当前不可执行的 Action 也能在 Settings 中查询。

集中改造 `workbench/keyboard/` 的默认定义：每条快捷键政策包含 Action ID、默认 Binding、
明确 Context、是否允许重复触发，以及是否允许用户覆盖。移除 Router 内部另存的
`ACTION_SCOPES`。Action 名称和描述从 Catalogue 关联读取，不在 Keymap 中复制。

统一查询结果至少包含：功能名称、类别、当前键位、默认键位、作用区域、默认 / 用户来源、
未分配状态、可否修改和冲突解释。菜单、Tooltip、Settings 读取同一有效 Keymap 的响应式
投影，不能继续缓存应用启动时的文案。

组件可以绑定当前目标和调用 Action，不能自行注册可重绑定的业务按键。架构检查限制
TanStack 运行时依赖进入叶子 Adapter，并检查 Catalogue 的键盘政策覆盖完整性；不粗暴禁止
所有 `keydown`，以免误伤控件操作和输入适配器。

### 5.2 清理遗漏与 Action 身份

在用户 Keymap 首次持久化前，建议把跨编辑器能力明确为 `editor.selection.delete`、
`editor.selection.clear` 与 `interaction.cancel`，替代现有三个 Piano Roll 前缀 ID。
它们分别绑定聚焦 Selection 能力和活动 Interaction 能力，不让 Tempo 或未来 Clip 冒用
Piano Roll 身份。当前没有持久化消费者，可在一个批次内迁移全部调用方并删除旧 ID；首次
保存后 ID 开始承担用户配置兼容责任。

Note / CC64 / Tempo 共用 Delete 的调用身份，各自决定可删除集合和约束；Tempo tick 0
事件继续不可删除。Clear 只对提供该能力的目标可用，不借迁移改变选择规则。Cancel 接入
Note、CC64、Tempo 和 Timeline Locate，停止分散监听 Escape。

Clip Enter 打开和 Bar Enter 创建是带具体目标的编辑操作，分别声明聚焦 Clip 与聚焦 Bar 的
快捷键上下文，接入稳定 Action。指针选择和键盘焦点仍分别维护；打开 Clip 不与仅打开 MIDI
Dock 的 `midi-editor.open` 混同。F8 接入通知区域的 Focus Action，Reka 自带的重复触发入口
通过其公开配置停用，并由自定义 UI 暴露 Focus 能力。

现有 Cursor / Pencil 切换与 Snap 开关也加入可绑定 Action，首版保留未分配键位，用户可以
自行设置。单一 Grid Preset 和带任意数值的字段仍是控件操作，不预建参数化 Action 系统。

### 5.3 用户设置与保存

- 提供稳定的“快捷键”设置入口，列出所有可绑定 Action，包括未分配项；支持按功能、
  按键、作用区域和已修改状态筛选。提供添加、修改、移除、恢复单项和恢复全部。
- 有效配置采用内置默认值加用户差异覆盖。缺少条目表示跟随默认，空数组表示主动解除；
  恢复默认删除覆盖记录。保留 `Mod`，按当前平台显示 Command / Control。
- 建议首版使用独立、版本化的浏览器本地 Keymap 记录，保存稳定 Action ID 与经过验证的
  Binding 数据。小规模偏好采用窄 `localStorage` Adapter 即可；不进入 Project File、
  Project IndexedDB schema、dirty、History 或 Playback，也不扩展成通用偏好平台。
- 支持运行时替换：先生成并验证候选路由，暂停分派，复用不变物理注册，准备新增注册；
  成功保存用户覆盖后才发布新的有效配置与 UI 投影，再释放旧注册。准备或保存失败时
  撤销候选、保持旧配置；不能出现新文案搭配旧按键，或部分配置已生效。
- 初始化时解析 schema、Action ID、键位和整表冲突。未知 ID 保留但不执行；非法条目或
  冲突覆盖不激活，并可在 Settings 中修复；不能让损坏配置阻止应用启动，也不能静默
  重写原始记录。首版以当前标签页生效、重新打开加载保存值为边界，不实现跨标签页同步。

### 5.4 冲突由 Studio 解释

TanStack 的同 Target 注册冲突不等于产品冲突。Studio 根据相同平台标准化键位和声明的
上下文计算：互斥区域可以共用；可能同时生效且没有明确优先关系的 Binding 必须拒绝或由
用户显式替换；已有优先覆盖关系则展示谁优先、何时可用。

不能以“当前没有选择”推断未来也不会冲突，也不能以注册先后顺序隐式决定获胜者。保留
Cancel 优先于 Clear 的 Escape 规则；配置冲突页应解释该关系，而不是把它误报为重复键位。
浏览器保留键的 Validation 警告展示给用户；不能保证浏览器未交付的按键可以被覆盖。

### 5.5 TanStack 的具体职责

继续采用 framework-agnostic Core，隔离在 Studio Adapter 中，使用其公开的注册、匹配、
标准化、显示、Validation 和 Recorder。其 [Core API](https://tanstack.com/hotkeys/latest/docs/reference)
提供相应能力；完整功能目录、作用域所有权、持久化协议和 Settings 产品界面仍由 Studio
负责。库的实时 registration 列表不能代表无 Binding 或未挂载的全部功能。

本地 `0.8.0` 已核验：Registration Handle 可更新 callback / options，没有直接修改
hotkey 的接口；整表替换由 Studio 编排注册差异。无需为本计划自动升级依赖，也不在每个
Feature 分散使用 `useHotkey`。

Recorder 默认把 Escape 当作取消，把无修饰键的 Delete / Backspace 当作清空，并输出
portable Mod。该行为见 [官方录制指南](https://tanstack.com/hotkeys/latest/docs/framework/vue/guides/hotkey-recording)，
与已安装源码一致。因此录制只产生草稿，清空也只是草稿；提供经过同一 Validation 的键名
输入或特殊键选择，使 Escape / Delete / Backspace 仍可绑定。开始录制先暂停后台路由，
完成、取消、失焦或卸载均清理 Recorder 和暂停能力；IME 输入不能被保存为快捷键。

### 5.6 快捷键、控件按键与手势修饰键

| 类型             | 处理方式                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户动作快捷键   | 集中声明、Context 路由、可查询、可自定义、可保存。                                                                                                  |
| Widget 键盘协议  | Tab、菜单方向键、Slider / Splitter 按键、输入字段 Enter / Escape 由控件负责；在统一帮助中解释，首版不允许 Keymap 覆盖其保留键。                     |
| Gesture Modifier | 集中声明语义及 origin / current 取值时机，例如 `bypassSnap` 与 `toggleSelection`；由 Pointer / Key State Adapter 传入 Session，帮助中显示当前规则。 |

控件自身的基础操作是完整键盘可用性的前提，不能靠增加全局快捷键替代。
[WAI-ARIA Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
明确区分控件间 Tab 导航、控件内部按键与额外快捷键。具体操作归类见输入清单；不把全部
物理事件机械移到一份巨型文件。

首版自定义范围是离散 Action Binding。Modifier 规则先集中并可查询，鼠标按键改绑、Modifier
自定义、多键 Sequence 和 Command Palette 后续单独设计，不以此阻塞查询与改键交付。

## 6. 独立的 Editor Interaction Architecture

### 6.1 按变化原因分层

| 层                    | 责任与扩展方式                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Browser Input Adapter | Pointer Capture、主指针、阈值、物理按键状态、Cancel / Blur / Dispose；向 Common 交付稳定输入。                 |
| Surface / Tool        | 提供 Hit Test、坐标映射、目标能力；按工具和命中结果选择一次具体 Operation。DOM / Canvas 绘制不进入内核。       |
| Interaction Session   | 拥有交互身份、开始 / 更新 / 完成 / 取消、资源释放与 Preview 生命周期。内核不枚举 Note、CC64 或 Clip。          |
| Semantic Operation    | 接收领域快照和语义输入，计算 Preview 与完成结果；Note Move、Note Resize、CC64 Value、Tempo Move 分别保留规则。 |
| Studio 执行与交接     | 解析有身份的当前业务能力，提交一次 Command 或完成一次视图操作；向所属 Session 回告结果。                       |

初期在已有 `@seele-daw/editor` 内建立 `common/interaction` 与 `browser/interaction` 边界，
不新建 package。泛型仅承载明确的 Target / Preview / Intent，禁止 `any` 或任意属性袋；
真实 Operation 通过组合接入，不建设开放插件发现或层层继承。

一个 Surface 宿主同一时刻至多拥有一个活动交互，每次 Begin 产生独立身份。生命周期表达
`idle → active → completing → finished / cancelled`；active 内可以有 pressing / dragging
等确有消费者的子状态。事实编辑额外组合一次 Commit 回告与权威视图交接；Timeline Locate
不应被迫提供 Project revision 或 History。这比让所有交互继承 Piano Roll 的
`awaiting-authority` 状态更准确。

现有 XState 可以继续作为封装内部的 Statechart 实现；迁移依据是上述协议，删除依赖不作为
验收目标。G1 结合 Note 与 Tempo 的转换表记录最终内部实现决定；若现有 XState 无法简洁
表达，再按相同协议替换。业务层和 package root 不暴露 Actor、XState Event 或 Snapshot。

### 6.2 冻结、动态输入与一次完成

- Begin 冻结 Session / Project 身份、操作对象、相关事实、选择、Tool、Grid、Snap 和
  语义锚点；完成时不重新用“当前选中的 Clip”解释原始输入。Track Pencil 也遵守。
- Pointer position、按下中的 Modifier、明确支持的滚动偏移可以动态更新。Click Selection
  使用 origin modifiers；临时关闭 Snap 使用 current modifiers。把物理 Alt 等映射移出
  领域 Resolver，操作接收 `bypassSnap` 等语义。
- Note、CC64、Tempo 等创作编辑在 Update 期间只改 Preview。完成返回 Selection / View
  结果或领域写意图；零变化不发 Command，一次事实编辑最多一个 Command / History step。
- Cancel、捕获丢失、Window blur、目标替换、释放或输入消费者失败统一关闭未提交会话；
  取消后迟到的 Pointer End 无效。捕获和观察者各自清理，错误报告不能留下可提交状态。
- 提交回告绑定本次交互身份，不能只使用可复用的 Pointer ID。已提交事实不因后续 Selection
  或显示失败回滚；权威通知先到或后到都必须能完成同一目标的 Preview 交接。

### 6.3 坐标与失效策略不能一刀切

目标身份或 Document / Project 切换必须终止旧交互。事实编辑以冻结的 base revision 提交，
不在 Pointer End 读取最新 revision 掩盖冲突。首版对编辑期间外部 Project Commit 采用
取消政策；本次提交的同步通知通过身份和提交阶段区分。后续精确到对象的 rebase 应另行设计。

语义锚点和坐标变换分开：平移滚动通过显式 Mapping 更新，把当前 CSS Pointer 重新映射到
同一时间坐标系，保留起点及抓取偏移。现有 Timeline Locate 的 Edge Scroll 必须继续可用。
未知映射重建、Scope 切换或未支持的 Zoom 在无法证明连续性时取消；不以 Scroll 或 resize
事件本身直接判定所有交互失效。未支持滚动更新的 Surface 可以声明取消政策，不能成为
所有消费者的固定限制。

现有 Tempo Coordinator 在执行时读取当前 Session / revision；迁移必须把冻结身份与前置
条件送到实际业务执行边界，不能只在 UI 保存一个随后未使用的 snapshot。

### 6.4 如何接入未来 Clip

Clip Body / Edge Hit 由 Arrangement 提供；Clip Move、Trim 或 Stretch 用独立 Operation
计算时间、Track、Source Offset 等领域结果，再提交对应原子 Command。Clip 的边缘操作
不能直接套用 Note Duration 算法，Loop、共享 Source 和跨 Track 约束仍属于 Clip 领域。

新增 Clip 时应复用 Pointer 生命周期、取消、Modifier、坐标映射、Preview 交接和 Action
上下文；仅增加 Hit / Operation / Preview 投影与必要的 Project Command。V1 先用已有
Tempo 和 Timeline Locate 验证跨域边界，不创建没有生产消费者的 Clip 占位 API。

## 7. 实施批次与验收

S 与 G 是两个主题，整体协议共同审核。建议先完成 S1–S3，再实施 G1–G4；每批完成后交付
审核，遵守用户对连续实施的明确授权。

| 批次                     | 内容                                                                                                                                                                     | 用户可验证的结果                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| S1：完整目录与输入归属   | 改造默认键位政策、Context 与 Action 身份；迁移业务快捷键、Cancel、F8；Tool / Snap 加入可绑定目录；提供只读 Settings 和 Widget / Modifier 帮助；Follow 暂停关联语义导航。 | 查到已绑定及未绑定操作；Tempo / Note / CC64 删除按焦点路由；Escape 取消当前交互且不穿透；控件保留键不触发后台播放。 |
| S2：User Keymap 闭环     | Settings 增加修改、添加、移除、恢复；窄存储 Adapter、schema 解析、整表验证和运行时替换。                                                                                 | 改键后菜单与按钮同步，旧键失效，刷新保留；存储或注册失败保留原配置，损坏记录不影响启动。                            |
| S3：Recorder 与键盘收口  | 接入 TanStack Recorder、特殊键输入、冲突说明和解除冲突操作；验证输入所有权及跨平台政策。                                                                                 | 用户可录制或指定键位，录制不保存项目或触发删除；能区分合理共用、优先覆盖和真实冲突。                                |
| G1：中立协议与 Note 切片 | 从 Note-specific 文件提取 Browser / Common 边界；确定状态实现 ADR；迁移 Note 的 Click / Add / Move / Resize 与提交回告，使用 Tempo 转换表检查契约。                      | Note 行为保持，取消与失效可靠；Common 内核没有 Note / Pitch 专属分支；新公开接口有生产消费者。                      |
| G2：Tempo 跨域验证       | 迁移 Tempo Lane 的独立 Pointer 生命周期、Preview 和完成协议；增加冻结目标与 revision 的执行校验。                                                                        | 时间 / BPM 拖动保留原轴规则；同一内核实际服务 Piano Roll 之外的消费者；第一枚 Tempo 事件约束不变。                  |
| G3：其余消费者迁移       | 迁移 CC64、Track Pencil，以及 Timeline Locate 的共同输入与终止生命周期；保留 Locate 自己的 Playback 会话；集中 Modifier 语义。                                           | Note / CC64 / Tempo 一次 Undo；Track 目标冻结；Locate Edge Scroll 和取消恢复播放行为不回退。                        |
| G4：交互收口             | 删除被替代生命周期与重复监听，完成跨 Surface 切换、失败和资源释放回归；同步架构文档与产品记录。                                                                          | 新编辑对象可按既定边界接入；没有迁移完成后仍运行的旧输入路径。                                                      |

纯 UI Splitter 与 Reka 菜单、Slider、输入字段不强制使用事实编辑 Session。它们的键盘协议
纳入盘点和帮助；只有共享浏览器机械职责确实减少重复时才复用 Pointer Adapter。

## 8. 验证与退出条件

键盘测试覆盖平台标准化、IME / Editable 过滤、控件保留键、Repeat 政策、互斥 Context、
Modal / Recorder 屏障、失败不回退、热替换一致性、保存 / 加载和部分注册失败。任何新 Action
必须显式声明默认键位或未分配，不依赖人工维护另一本快捷键表。

交互测试覆盖 Begin 冻结、动态 Modifier、移动阈值、错误 Pointer、重复 End、Cancel 后 End、
目标替换、外部 Commit、提交通知先后、旧回告、失败关闭和释放。业务集成验证 Note、CC64、
Tempo、Track Pencil 的原子 History，以及不写 Project 的 Locate 与 Edge Scroll。

每批执行受影响 Type Check、行为测试与根级适用 Lint；跨包公开边界、应用组合和持久化按
工程准则完成完整门禁。S3 / G4 各自收口运行 `pnpm check` 并用 Codex 内置浏览器验证真实
改键、菜单提示、录制、拖动、滚动、取消和 Scope 切换。不新增 E2E；人工结果与自动结果
分别记录。

S1 的实施和验证记录见下方批次记录；尚未实施的批次不作为当前产品能力。

## 9. S1 实施记录（2026-09-11）

- 完成 19 个 Action 的集中 metadata 和默认 Binding / Context / Repeat 声明；首份用户
  Keymap 持久化之前，把选择和取消 ID 泛化为 `editor.selection.*` / `interaction.cancel`。
- Focus 激活选区目标，Mount 不抢占；活动交互使用独立 Cancel 能力。Tempo 删除保留
  Page 的 Playback 准备、业务结果和失败反馈；初始事件仍不可删除。
- Tempo Delete / Cancel、Timeline Locate Cancel、Clip / Bar Enter 和 Toast F8 已迁移；
  Cursor / Pencil / Snap 工具栏共用 Action，默认未分配键位。删除了被替代的局部业务监听
  和 `TIMELINE_INTERACTION_KEYS`；Widget 协议与现有 Edge Scroll 保留。
- 项目入口和 Project Menu 提供 Keyboard shortcuts 只读窗口；支持中英文搜索、绑定状态
  筛选、当前／默认键位、作用区域、Repeat 和 Widget / Modifier 帮助。菜单打开窗口前先
  恢复稳定入口焦点；Escape 关闭窗口不会取消后台手势。
- 完整 `pnpm check` 通过：架构、workspace 命令一致性、格式、Oxlint、ESLint、全工作区
  Type Check、165 个测试文件 / 1,486 项测试、Production Build 和 soundbank dist boundary。
  Studio 为 70 个文件 / 520 项测试。构建保留原有大 chunk 提示，不影响构建通过。
- 文档本地链接 63 项通过，`git diff --check` 通过。没有新增 E2E；真实 DOM / Reka
  键盘集成测试与浏览器人工验证分开记录。
- 本次会话没有可操作的内置浏览器自动化接口，未声称完成视觉或人工 smoke。已启动本机
  预览用于审阅；没有操作用户的个人 Chrome。

S1 已于 2026-09-22 通过用户审核，按授权提交。用户 Keymap 编辑／保存／热替换属于 S2，Recorder 与冲突
交互属于 S3；共享手势协议仍按 G1–G4 独立推进。
