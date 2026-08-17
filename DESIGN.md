# Seele Studio Design Language

> Status: Normative Draft  
> Scope: Seele Studio editor and workbench  
> Default theme: Piano Black  
> Last updated: 2026-08-10

本文档定义 Seele Studio 编辑器的产品界面、交互模型与视觉语言。它是产品设计、前端实现、Canvas 渲染、主题开发和设计评审共同遵循的基线。

Project Entry 与编辑器共享主题语义、组件状态和可访问性基线，但其宽松欢迎布局不是
Workbench 高密度布局的参考。

## 1. 如何使用本规范

本文中的关键词遵循以下含义：

- **MUST**：不可破坏的产品或架构约束。
- **SHOULD**：默认应遵循；偏离时需要说明具体原因。
- **MAY**：可选能力，不构成当前版本要求。

新增界面时，先确定它属于哪个功能模块、由哪一层状态拥有，再选择语义令牌和组件。禁止从某张效果图直接复制颜色、尺寸和阴影后再反推产品结构。

## 2. 产品体验目标

Seele Studio 是浏览器优先、面向个人创作者的桌面级 DAW。它不应像一个普通的内容管理后台，而应像一件精密、安静、耐用的乐器。

### 2.1 Piano Black

Piano Black 的灵感来自黑色三角钢琴：

- 深黑烤漆外壳，克制而有层次。
- 暖白琴键与清晰刻度，提供长时间工作的可读性。
- 少量金属或黄铜色细节，用于焦点与高级质感，而非大面积装饰。
- 彩色轨道像乐谱标记和舞台灯光，只承载音乐内容身份。
- 动效短促、稳定，不漂浮、不弹跳，不打断节奏判断。

Piano Black 不是木纹、琴盖或琴键的拟物复制，也不是其他在线 DAW 的像素级复刻。它应形成 Seele 自己的布局、组件比例和状态语义。

### 2.2 体验关键词

| 关键词             | 界面含义                             |
| ------------------ | ------------------------------------ |
| Precise 精确       | 时间、音高、选择和编辑结果清晰可预测 |
| Quiet 安静         | 非当前任务的控件降低存在感           |
| Tactile 可触       | 悬停、按下、拖动和提交都有明确反馈   |
| Focused 专注       | 音乐内容优先于品牌装饰与应用外壳     |
| Durable 耐用       | 高频操作稳定，长时间使用不过度刺激   |
| Recoverable 可恢复 | 危险操作可撤销；离开脏项目时明确确认 |

## 3. 不可破坏的设计原则

### 3.1 内容高于界面框架

轨道、Clip、音符、波形、自动化和播放位置是视觉主角。工具栏、边框和面板只负责建立秩序，不能与音乐内容争夺注意力。

### 3.2 高密度不等于拥挤

DAW 需要同时显示大量信息。密度来自稳定的对齐、紧凑的控件和渐进式披露，而不是缩小所有文字和点击区域。

### 3.3 同一状态必须有同一语义

Hover、Pressed、Selected、Focused、Disabled、Busy 和 Error 在所有组件中含义一致。颜色、边框、亮度和形状不能在不同功能里随意交换语义。

### 3.4 主题不改变操作模型

主题可以改变色彩、材质、字体表达和部分装饰强度，但不能改变：

- 信息架构；
- 面板位置与核心尺寸；
- 控件含义；
- 快捷键；
- 编辑手势；
- 状态颜色的基本含义；
- 可访问性底线。

用户切换主题后，不需要重新学习软件。

### 3.5 颜色不是唯一信号

轨道颜色、选中颜色、录音状态和错误状态必须同时使用轮廓、图标、文字或形状表达。色觉差异不应导致功能不可辨认。

### 3.6 一次手势，一次提交

拖动过程只更新预览；释放指针时产生一个 Project Command 和一个 History 条目。拖动过程中禁止逐帧写入 Project Core。

### 3.7 先服务真实场景

只有当具体编辑器界面需要某种通用能力时，才扩展 Workbench 基础设施。不能脱离产品切片预建完整的通用 UI 平台。

## 4. 功能模块

### 4.1 模块总览

| 模块                | 主要职责                               | 主要表面                 | 当前定位                |
| ------------------- | -------------------------------------- | ------------------------ | ----------------------- |
| Project Entry       | 新建、打开、最近项目、失败反馈         | 启动页                   | Piano Black 首批入口    |
| Project Lifecycle   | 当前项目、保存、dirty、离开确认        | 全局状态与对话框         | 已有应用服务，UI 待完善 |
| Global Bar          | 品牌入口、项目名、保存状态、全局菜单   | 顶部全局区               | 首批外壳已实现          |
| Transport           | 播放、暂停、返回开头、时间、速度、拍号 | 顶部全局区或独立控制行   | 首次可听切片已接入      |
| Workbench Shell     | 区域布局、面板生命周期、焦点与尺寸     | 整个编辑器框架           | 首批外壳已实现          |
| Track List          | 轨道身份、颜色、静音、独奏、音量等     | Arrangement 左列         | Arrangement 切片        |
| Arrangement         | 时间线、Clip、播放头、选择与编辑       | 主工作区                 | 核心编辑表面            |
| Context Editor Dock | 承载当前内容的下方编辑器               | 下方可调整面板           | Piano Roll 切片         |
| Piano Roll          | MIDI 音符编辑、键盘、网格、力度        | 下方面板或工作区全屏     | 第一类业务编辑器        |
| Inspector           | 当前选择的属性与批量操作               | 左下或侧边区域           | 随业务能力渐进实现      |
| Browser / Library   | 乐器、Loop、文件和预设浏览             | 可停靠侧栏               | 后续阶段                |
| Mixer               | 通道、路由、发送、插件与电平           | 独立工作区或面板         | 后续阶段                |
| Menus & Commands    | 可发现命令、快捷键、上下文动作         | 菜单、右键菜单、命令面板 | 随功能同步建设          |
| Feedback Layer      | 对话框、Toast、进度、内联错误          | 覆盖层与状态区           | 跨模块能力              |

### 4.2 Workbench Shell 的定义

Workbench Shell 是编辑器的稳定骨架，不等于完整编辑器功能。它负责：

- 顶部 Global Bar 和 Transport 的容器；
- Track List、Arrangement、Inspector、Context Editor Dock 的空间关系；
- 面板打开、关闭、最小化、调整尺寸和工作区全屏；
- 焦点、菜单、快捷键上下文和覆盖层的组合；
- 在项目切换或应用销毁时释放 UI 生命周期资源。

Workbench Shell 不负责：

- 音符、Clip、轨道等 Project Model；
- Undo / Redo History；
- IndexedDB 持久化；
- 播放引擎内部状态；
- 某一个编辑器的业务算法。

```text
┌──────────────────────────────── Global Bar ────────────────────────────────┐
├──────────────────────────────── Transport ─────────────────────────────────┤
│ Track List / Inspector │                 Arrangement                       │
│                        │                                                    │
├───────────────┬────────┴──────── Context Editor Dock ──────────────────────┤
│ Editor Tools  │                  Piano Roll                                │
└───────────────┴────────────────────────────────────────────────────────────┘
```

该图表达区域关系，不提前锁定 Global Bar 与 Transport 最终采用单行还是双行。

左列和主画布在上下区域中 SHOULD 保持视觉对齐。时间轴、播放头和横向滚动位置在 Arrangement 与 Piano Roll 中可以相关联，但不应未经用户选择就强制同步所有 Zoom。

## 5. 信息架构与布局契约

### 5.1 桌面优先

编辑器第一阶段面向键盘、鼠标或触控板的桌面环境：

| 视口宽度     | 行为                                                 |
| ------------ | ---------------------------------------------------- |
| ≥ 1440 px    | 完整工具标签、完整左列和多面板布局                   |
| 1152–1439 px | 缩短非关键标签，Inspector 可折叠                     |
| 900–1151 px  | 次级面板默认折叠或以覆盖层打开                       |
| < 900 px     | 第一阶段不承诺完整编辑体验；可展示项目管理与明确提示 |

布局不得仅通过缩放整个应用来适配窄屏。

### 5.2 基准尺寸

这些值是默认密度的布局假设，不是允许组件直接硬编码的数值。Global Bar 与 Transport 若合并为一行，应重新验证总高度、信息优先级和窄屏行为。

| 区域                  |         默认 | 约束                                  |
| --------------------- | -----------: | ------------------------------------- |
| Global Bar            |     52 px 高 | 不随内容滚动                          |
| Transport             |     48 px 高 | 关键播放控件保持固定位置              |
| Track column          |    260 px 宽 | 最小 220 px，最大 360 px              |
| Timeline ruler        |     28 px 高 | 与 Track List 标题区对齐              |
| Track row             |     80 px 高 | 紧凑模式可为 64 px                    |
| Context Editor header |     44 px 高 | 最小化时保留                          |
| Context Editor dock   | 视口高的 38% | 可调整，编辑区最小 220 px，最大约 72% |
| Splitter visible line |       1–4 px | 实际命中区域至少 12 px                |
| Primary control       |  32–36 px 高 | 高频图标按钮至少 32 × 32 px           |

最低高度应按“可完成核心任务”定义，而不是按还看得到几行内容定义。若视口无法同时满足两个编辑区的最低高度，系统 SHOULD 主动最小化非焦点编辑器。

### 5.3 Context Editor Dock 状态

下方面板使用明确状态，而不是零散布尔值：

```text
Closed
  └─ open selection ─→ Docked(default height)
Docked
  ├─ drag splitter ─→ Docked(custom height)
  ├─ minimize ──────→ Minimized(header only)
  ├─ maximize ──────→ Docked(max height)
  └─ full screen ───→ Workspace Fullscreen
Workspace Fullscreen
  └─ exit ──────────→ Docked(previous height)
```

规则：

- “工作区全屏”是编辑器占满应用工作区，不等同于浏览器 Fullscreen API。
- 退出工作区全屏 MUST 恢复进入前的 Docked 高度。
- 用户调整后的高度属于本地 Workbench Preference，不属于 Project Model。
- Project 切换时 MAY 保留面板偏好，但 MUST 清理失效的编辑对象与选择。
- Splitter 拖动必须即时跟手，过程中不播放缓动动画。

### 5.4 空间层级

界面层级由语义令牌管理，禁止组件自行使用任意 `z-index`：

1. Canvas content：网格、Clip、音符。
2. Sticky chrome：标尺、轨道标题、面板标题。
3. Floating controls：工具浮条、Tooltip。
4. Popover：菜单、选择器、上下文菜单。
5. Modal：确认对话框和阻塞任务。
6. Critical overlay：不可恢复错误或应用级阻塞。

## 6. 状态所有权

视觉设计必须尊重状态边界。一个状态显示在哪里，不等于它就由那个 Vue 组件拥有。

| 状态类型                  | 示例                              | 权威归属                                 | 持久化                 |
| ------------------------- | --------------------------------- | ---------------------------------------- | ---------------------- |
| Project facts             | 轨道、Clip、音符、轨道主题色      | Project Core                             | Project Checkpoint     |
| Project lifecycle         | 当前项目、dirty、保存结果         | ActiveProjectService / application layer | 由项目服务协调         |
| Workbench preferences     | 主题、密度、面板高度、面板模式    | Workbench / preference store             | 本地用户偏好           |
| Studio editor preferences | Scope、Tool、Snap、Grid Preset    | Studio preference store                  | 首批仅应用生命周期     |
| Editor session            | 当前 Clip Selection、Zoom、Scroll | 对应 Editor state                        | 默认不写入项目         |
| Transient interaction     | Hover、拖动预览、框选区域         | Surface interaction state                | 不持久化               |
| Audio runtime             | 播放、调度、电平、设备状态        | Audio / playback runtime                 | 不进入 Project History |

### 6.1 Vue / Pinia 边界

Vue 或 Pinia MAY 保存轻量、可重建的 UI 状态。它们 MUST NOT 接管：

- ProjectSession；
- History；
- dirty 的权威计算；
- IndexedDB 资源；
- pending Promise resolver；
- 大型 Project Model 或音频运行时对象。

Studio 中组件本地状态、Props / Emits、Pinia 与类型化 Vue Context 的具体选择规则，
见 [Studio Vue 状态与依赖组合准则](./apps/studio/docs/vue-state-composition-guidelines.md)。

## 7. 核心 UX 操作

### 7.1 新建、打开与保存

- 新建项目成功前，应先建立可恢复的最小 Checkpoint。
- 打开项目只打开已有项目；找不到、损坏或恢复失败必须给出明确结果。
- Project Entry 应保持一个清晰的 New Project 主操作，并把最近项目作为本地资源库呈现。
- Project Entry 的 Loading、Empty、Route notice 与恢复错误使用局部反馈，不阻塞无关信息。
- Global Bar 应持续显示项目名与保存状态，但不使用频繁跳动的通知。
- 保存进行中使用短暂的 Busy 状态；成功后回到安静状态。
- 保存失败必须保留 dirty，并提供可重试动作。

建议的保存状态文案：

| 状态   | 显示                         |
| ------ | ---------------------------- |
| Clean  | `Saved` 或最近保存时间       |
| Dirty  | `Unsaved changes`，Save 可用 |
| Saving | `Saving…`，防止重复提交      |
| Failed | `Couldn’t save` + Retry      |

### 7.2 离开脏项目

任何可能离开当前脏项目的动作，统一进入 Save / Discard / Cancel 决策：

- **Save**：保存成功后允许该次导航；失败则留在当前项目。
- **Discard**：只授权该次导航，不提前将项目标记为 clean，也不清空 History。
- **Cancel**：拒绝导航，焦点返回触发动作的控件或合理编辑位置。

对话框必须说明“将离开哪个项目”，不得只显示泛化的 “Are you sure?”。

确认只对请求发起时观察到的 `ProjectContentStateId` 有效。如果内容从 B 变为 C，旧确认不可复用；如果 B → C → Undo 回到 B，则允许复用针对 B 的决定。

### 7.3 命令、菜单和快捷键

菜单项、工具栏按钮、快捷键和右键菜单 SHOULD 调用同一个 Command，而不是各自实现业务逻辑。

每个命令至少定义：

- stable command id；
- label；
- enabled 条件；
- checked / selected 状态（如适用）；
- keybinding（如适用）；
- 执行结果与错误反馈。

快捷键显示使用当前平台习惯。不可用命令应显示 Disabled 原因或通过上下文避免出现，而不是点击后静默失败。

快捷键系统遵循：

- Stable Action ID、Scope、enabled policy 和 Handler 由 Seele Studio 拥有；
- 作用域优先级固定为 Modal / Dialog → focused Piano Roll → Workbench → Global；
- Feature 必须显式注册并返回 disposer，不在组件中散布第三方快捷键 composable；
- 普通可编辑元素和 IME composing 默认不触发编辑 Action；
- 只有当前 Scope 中 enabled Action 真正处理按键时才阻止浏览器默认行为；
- Action metadata 与 Binding 必须可被菜单、帮助面板和未来 Command Palette 复用；
- 内置按键集中在强类型默认 Keymap；Feature 只按 Action ID 获取当前 Binding，不散落字符串；
- 用户输入必须先验证，无效 Binding 在 Settings 字段旁提示且不得进入注册或持久化；
- 首批 Workbench Binding 为 Save `Mod+S`、Undo `Mod+Z`、Redo `Mod+Shift+Z`，并兼容
  Windows `Control+Y`；Transport Play / Pause 使用 `Space`；
- focused Piano Roll 的 `Escape` 清空 Selection，但只有 Editor Session 已接入且该表面
  获得焦点时才注册。

当前按键解析与浏览器监听固定通过隔离的 `@tanstack/hotkeys@0.8.0` Adapter 完成；业务
模块不得直接依赖其 alpha API。架构见
[Studio Keyboard Shortcut Architecture](./apps/studio/docs/studio-keyboard-shortcut-architecture.md)。

### 7.4 Transport 首次可听状态

- Play 在 Playing 时必须切换成 Pause 图标、pressed 状态和可访问名称；
- 首播资源准备期间保持按钮原尺寸，以旋转状态图标和 `Loading instrument…` 命名表达 Busy，
  并阻止重复请求；Reduced Motion 下只降低转速，不移除必要状态区别；
- Return to Start 只在 Loading、Playing 或当前位置非零时可用；Record 与 Loop 在能力接通前继续
  Disabled；
- 时间使用稳定的 `mm:ss.mmm`，由 Transport 权威位置投影，不能累计视觉帧差；
- 没有真实 Meter 数据时显示 `Meter —`，不得用 `0.0 dB` 暗示已有实时测量；
- Empty 通过 disabled reason 安静反馈；Blocked、Partial 与 Runtime Failure 必须通过邻近 title
  或 Toast 明确反馈；失败不改变 Project dirty、History 或保存事实；
- Play / Pause 的 `Space` 属于 Workbench Scope，可编辑控件、IME composing 和 Modal 仍优先。

### 7.5 选择模型

所有编辑表面共享以下概念：

- **Primary selection**：Inspector 和上下文编辑器的主要对象。
- **Selection set**：批量操作的完整对象集合。
- **Anchor**：范围选择起点。
- **Focus target**：接收键盘命令的编辑表面或对象。

选择变化属于 Editor state，不产生 Project History。删除等命令读取当时的稳定对象引用，提交后清理失效选择。

点击规则：

- 单击空白区域：清除当前表面选择。
- 单击对象：替换选择，并设置 Primary。
- 修饰键单击：切换对象是否在 Selection set 中。
- 拖动空白区域：框选；开始拖动对象则是移动，不同时开始框选。
- Escape：先取消当前瞬时交互，再关闭非模态浮层，最后才清除选择。

### 7.5 拖动与编辑事务

每个 Drag Interaction MUST 明确定义：

1. 命中对象和拖动阈值；
2. Pointer Capture；
3. 开始时的 Project revision / content state；
4. 原始值和稳定对象身份；
5. Snap 策略；
6. 不写入项目的 Preview；
7. Pointer Up 时的单一 Command；
8. Escape、`pointercancel`、失焦和对象失效时的取消路径。

如果提交前 Project 已发生不兼容变化，交互应取消或重新验证，不能把过期预览强行写回。

### 7.6 时间线、滚动与缩放

- 鼠标滚轮默认纵向滚动当前表面。
- Arrangement 右侧时间内容 MUST 是唯一真实纵向滚动权威和唯一 `scrollTop` 持有者；左侧
  Track 控制区是裁切的从视图，只按该位置执行合成层位移，不得维护第二个可漂移的滚动状态。
- Track 控制行与对应 Lane MUST 消费同一排序和固定行高来源。Track 区域的纵向滚轮输入应转发
  给 Arrangement；键盘焦点进入被裁切的 Track 控件时，必须通过 Arrangement 权威使该行可见。
- Arrangement Ruler 与全部 Lane MUST 共用同一个横向滚动权威；横向移动时间内容时，左侧
  Track 标题、操作区和控制行保持固定，原生横向滚动轨道不得延伸到 Track 控制列下方。
- 默认时间轴至少覆盖项目起始拍号的 150 小节，并由最远 Clip 末端精确扩展；Ruler、Lane、
  Clip 定位与 Transport 自然结束必须消费同一派生范围。
- Transport Position MUST 是播放期间视觉位置的唯一运行时权威。视图 MAY 使用
  `requestAnimationFrame` 决定采样时机，但不得累计 frame delta 形成第二套播放时钟；后台恢复、
  Pause、Return、自然结束和项目切换后必须重新读取权威位置。
- 当前时间显示、Arrangement Playhead 与 Piano Roll Playhead MUST 消费同一共享视觉位置投影；
  高频视觉位置不得进入 Project、Pinia、History、dirty 或 Commit Subscription。
- Arrangement Playhead MUST 位于不接收 Pointer 命中的独立轻量图层，并用
  `transform: translate3d(...)` 移动；高频更新不得修改 `left`、`inset-inline-start` 或其他触发布局
  的动态位置属性。Follow 只分页滚动右侧时间视口，左侧 Track 控制列保持固定。
- Piano Roll Playhead MUST 按当前编辑 Scope 投影同一位置：`Track` 模式直接使用全局 Tick；
  `Clip Focus` 模式使用 `globalTick - clip.startTick`，并只在 Clip 与当前 Viewport 范围内显示。
  两种模式都通过独立 transform-only 图层移动。`sourceStartTick` 表示 MIDI Source 读取偏移，
  MUST NOT 被当作 Clip 在 Arrangement 的起点。
- 用户主动横向滚动或操作时间轴时，本次 Follow 暂停；可见 Follow 控制 MUST 能立即恢复。该状态
  是当前视图的瞬时产品状态，不属于 Project Fact。
- 横向滚动和缩放的具体修饰键必须由 Keybinding 层统一定义，并允许平台适配。
- Zoom 应围绕指针、播放头或明确焦点稳定缩放，不能无缘由跳回时间零点。
- Arrangement 与 Piano Roll 可以分别保存 Zoom；“同步视图”应是显式选项。
- 时间标尺、网格和 Snap 使用同一时间换算来源，避免视觉与编辑结果不一致。
- Zoom 到密集层级时，应减少次要网格与标签，而不是堆叠不可读文字。

### 7.7 轨道操作

- 新建轨道时从受控调色板分配主题色，并尽量避免与相邻轨道重复。
- 轨道颜色是 Project fact，保存到项目中；后续修改应由 Command 执行并支持 Undo / Redo。
- 轨道颜色同时影响 Track Header、Clip、Piano Roll Note 和相关选择强调，但不替代选中轮廓。
- Mute、Solo、Record Arm 必须同时使用文字或图标状态，不只改变颜色。
- 删除轨道等高影响操作在可可靠 Undo 时无需每次弹出确认；不可恢复时才使用确认对话框。

### 7.8 Clip 与 Context Editor

- 双击 MIDI Clip 或执行 “Open in MIDI Editor” 打开 Piano Roll。
- 打开新 Clip 时，Context Editor Dock 默认复用当前位置和高度。
- Arrangement 中的 Clip 选择与 Piano Roll 当前编辑对象必须可区分：选择多个 Clip 不代表把所有内容混入同一个编辑器。
- Piano Roll 的 `Track` / `Clip Focus` 是同一 Project Clip 图的视图 Scope，不建立编辑器私有
  Clip。Active Clip 在重叠区域提供明确写入目标，但不能改变 Arrangement Selection 的含义。
- 若被编辑对象被删除，Piano Roll 应退出失效上下文，显示空状态或关闭，而不是保留幽灵数据。

### 7.9 Piano Roll

第一阶段核心任务：

- 读取选中 MIDI Clip 的音符；
- 添加、移动和删除音符；
- 选择单个或多个音符；
- 横向时间 Zoom / Scroll；
- 纵向音高 Scroll；
- 网格和 Snap；
- 显示播放头；
- 通过 Inspector 或工具区编辑基础属性。

已确认的双模式结构：

- `Track` 是默认 Scope，以全局 Project Tick 显示当前 Instrument Track 上的全部 MIDI Clip；
- `Clip Focus` 是可选 Scope，以 Clip-local Tick 聚焦一个 Clip；
- Scope 是 Studio 应用生命周期偏好，不进入 Project Fact、History、dirty 或 Checkpoint；
- Scope 使用公共 MIDI Editor 标题栏中的持续单选控件，并通过可见选中态与 `aria-pressed`
  表达；控件在空 Clip Focus 状态仍保持可用，使用户可以显式返回 Track；
- 两种模式读取相同的 `MidiClipRecord`、`MidiSourceRecord` 与 Note Partition；Clip 末端只由
  `startTick + spanTick` 派生；
- Track 投影中非循环 Note 的全局位置是
  `clip.startTick + note.startTick - clip.sourceOffsetTick`；
- looped Clip 在循环实例编辑语义确认前可以显示，但 MUST 明确不可编辑。

Track 模式在空白时间创建 Note 时，优先写入命中的 Active 非循环 Clip；Note 尾端越界或 Pointer
位于左侧相邻 Clip 末端后一个当前小节以内时，可以向右扩展该 Clip，但 MUST NOT 跨越下一 Clip。
更远空白以及既有 Clip 之前的空白创建新的、按小节边界对齐的非循环 Clip / MidiSource；V1 不
自动左扩已有 Clip。创建 / 扩展 Clip 与创建 Note MUST 由一次原子 Project Command 完成。
Clip Focus 不自动创建其他 Clip。重叠区域没有 Active Clip 或目标为 looped Clip 时，交互 MUST
拒绝提交并解释原因，不能猜测写入归属。

首批默认编辑语义：

- MIDI 60 显示为 `C4`，初始纵向视图以 C4 附近为中心；
- Clip Focus 初次打开 Clip 时横向显示完整 Clip，Arrangement 与 Piano Roll 暂不强制同步 Zoom；
- 初始 Grid 为 `1/16`，Snap 默认开启；
- 显式提供 Pencil 与 Cursor，默认工具为 Pencil；
- Cursor 负责 Note Selection 与 Note Body Move，不在空白 Grid 创建 Note；
- Pencil Click 空白 Grid 创建 Note，Click 已有 Note 不创建也不改变 Selection；
- Note 左右 Edge Hit 的 Resize 同时对 Cursor 与 Pencil 开放，Edge Hit 优先于 Note Body；
- 创建成功后只选中新 Note，并保持 Pencil 激活以支持连续 Click 输入；
- 新 Note 初始长度为一个当前 Grid 单元、Velocity 100、UI MIDI Channel 1；
- X 受 Timeline Grid Snap 影响；开启 Snap 时使用 Pointer 所在 Grid 单元的左边界，关闭
  Snap 时保留 Pencil X 对应的最近整数 Tick；
- Y 不进入 Timeline Snap，直接使用 Pointer 覆盖的离散 Pitch Row。
- Scope、Tool、Snap 与 Grid Preset 属于 Studio 应用生命周期偏好；切换 Project、Clip 或 Dock
  布局不重置，页面刷新恢复默认值；
- 首批只确认 `1/16` Grid Preset，其他直线、三连音或附点 Preset 必须由后续产品切片定义。

Tool、Snap、创建结果、失败、History 和边界的完整显式规则见
[Piano Roll Note Creation 第四阶段计划](./packages/editor/docs/piano-roll-note-creation-phase-plan.md)。

首批 Note Selection 语义：

- 普通单击 Note 只选择该 Note；
- `Shift`、`Command` 或 `Control` 单击切换该 Note 的选中状态；
- 单击空白 Grid 或在已聚焦 Piano Roll 中按 `Escape` 清空 Selection；
- 右键不改变 Selection；
- 切换 Clip 时不继承 Selection；
- Note 移出可见 Viewport 时保留 Selection，被删除或移出当前 Clip Source 时间窗口时清理；
- Undo / Redo 使 Note 消失后清理 Selection，Note 再次出现时不自动恢复；
- Selection 只保存稳定 `NoteId`，不复制 `MidiNoteRecord` 或进入 Project History。

当前混合 Renderer 切片：

- DOM 承载标尺、MIDI 48–72 钢琴键盘、焦点和可访问摘要；
- 静态 Pitch / Grid 使用 Canvas；首批可见 Note 使用 keyed DOM；
- Canvas bitmap 按设备像素比配置，DOM / Canvas Note Adapter 共享 CSS Pixel Scene；
- Renderer 主题颜色只能来自宿主解析后的 Editor Rendering Tokens 与 Track Color；
- Grid 级别密度小于可辨识 CSS Pixel 时可以省略，避免生成不可见的高频线；
- Read Model、Renderer 和 ResizeObserver 必须随 Clip / Surface 生命周期释放。

首批 Pointer Input 语义：

- Note 不安装独立事件监听器，Surface 使用事件委托把 DOM 命中标准化为稳定
  `NoteId + Hit Zone`；
- Tool 与 Selection Session 只能消费 Renderer-neutral Hit 和 Surface-local CSS Pixel，
  不读取 DOM 元素、CSS class 或 Vue Event；
- Pointer Down 冻结手势起点、命中目标与修饰键；Pointer Capture 后允许指针离开 Surface；
- 同一 Surface 同时只接受一个 Primary Pointer 手势，右键不进入编辑手势；
- Click 与 Drag 使用 4 CSS Pixel 阈值区分，Selection 只在 Pointer Up 且未跨越阈值时确认；
- Cancel、lost pointer capture、Surface dispose 都必须显式取消手势，不能提交部分结果；
- DOM 命中转换边界即使不迁移到 Canvas 也保留；只有真实性能数据要求时才增加 Canvas
  Hit 或空间索引。

后续再引入力度编辑、多 Note Resize、Split、复制、Humanize、Quantize、Scale Assist 等能力；
其产品边界必须在对应 Command 前讨论。

视觉与操作规则：

- Piano Roll 公共标题栏提供 Track / Clip Focus Scope 单选；Surface 顶部继续使用紧凑工具栏，
  Pencil / Cursor 作为一个持续单选组，Snap 与 Grid 值作为相邻但独立的时间编辑组；
- 当前 Tool 与 Snap 必须在 Pointer 离开后仍通过边界、背景和 `aria-pressed` 清晰表达，
  不能只依赖 Tooltip 或图标颜色；
- Pencil 激活时空白 Grid 使用 Crosshair Cursor；Note Body 按 Tool 表达 Move / Pencil
  语义，左右 Edge Hit 使用水平 Resize Cursor；Resize Handle 只在 Hover、Focus 或
  Selected 等可操作状态出现，不常驻干扰密集 Note；
- 创建失败使用全局 Error Toast，并让 Piano Roll 的可访问 Live Status 同步解释原因；
- 左侧钢琴键盘固定，音符网格横向滚动。
- 黑键行通过轻微明度差异识别，不使用高对比棋盘纹。
- 小节、拍和细分网格有明确的三级强度。
- 音符继承轨道颜色；Selected 使用高亮轮廓、控制点或亮度变化叠加表达。
- Move Preview 是半透明或描边 Ghost，不隐藏原始基准位置。
- 首批新建音符长度使用当前 Grid；“最近使用长度”留待后续产品切片决定。
- 音高名称和时间读数应在拖动时可见，但避免常驻 Tooltip 遮挡附近音符。

### 7.10 异步、空状态与错误

- 空状态要告诉用户下一步可做什么，例如 “Select a MIDI clip to edit”。
- 预计超过 150 ms 的等待应提供局部 Busy 反馈。
- 全屏 Spinner 仅用于整个应用确实无法操作的任务。
- Toast 适合已完成、非阻塞事件；错误如果需要用户采取行动，应留在相关区域。
- 同一错误不能同时通过 Toast、对话框和内联消息重复轰炸。

## 8. 视觉系统架构

### 8.1 四层令牌

```text
Primitive Tokens
  └─ Semantic Tokens
       ├─ Component Tokens
       └─ Editor Rendering Tokens

Track Content Palette ────────────┘
```

1. **Primitive Tokens**：原始颜色、间距、字号、圆角和时长。
2. **Semantic Tokens**：`surface`、`text`、`border`、`focus` 等用途。
3. **Component Tokens**：Button、Menu、Dialog、Slider 等组件内部映射。
4. **Editor Rendering Tokens**：Canvas 网格、播放头、选择框和 Ghost。
5. **Track Content Palette**：项目内容颜色，独立于 UI 主题。

业务组件 MUST 使用语义或组件令牌，不得直接使用 Primitive 色值。

### 8.2 命名规则

CSS 自定义属性使用 `--sd-` 前缀：

```css
--sd-color-surface-canvas
--sd-color-surface-panel
--sd-color-text-primary
--sd-color-border-focus
--sd-control-height-md
--sd-space-3
--sd-radius-md
--sd-motion-duration-fast
--sd-editor-grid-bar
--sd-editor-playhead
```

规则：

- 名称描述用途，不描述当前颜色，例如使用 `text-primary`，不使用 `text-white`。
- 状态后缀统一为 `hover`、`pressed`、`selected`、`disabled`、`focus`。
- 方向性属性优先使用逻辑方向，例如 `inline`、`block`，为本地化保留空间。
- Feature 组件不得根据 `themeId` 写条件分支。

## 9. Piano Black 基准主题

以下色值是第一轮基准，不代表未经验证即可进入生产。每组实际前景与背景组合 MUST 通过对比度检查。

### 9.1 Surfaces

| Token               | 基准值    | 用途                                 |
| ------------------- | --------- | ------------------------------------ |
| `surface-canvas`    | `#070809` | Arrangement / Piano Roll 最深背景    |
| `surface-workspace` | `#0B0D0F` | 主工作区                             |
| `surface-panel`     | `#101317` | Track Header、Inspector、Dock header |
| `surface-raised`    | `#171B20` | Toolbar group、输入框、次级按钮      |
| `surface-overlay`   | `#1D2228` | Menu、Popover、Dialog                |
| `surface-sunken`    | `#050607` | 深槽、滚动轨道、仪表背景             |

相邻 Surface 应主要靠明度和细边界分层，不依赖大面积阴影。

### 9.2 Text

| Token            | 基准值    | 用途                 |
| ---------------- | --------- | -------------------- |
| `text-primary`   | `#F2EEE5` | 主要标签和重要数值   |
| `text-secondary` | `#B8B2A8` | 次级信息             |
| `text-muted`     | `#8B8B8D` | 辅助提示与非焦点标签 |
| `text-disabled`  | `#5E6165` | Disabled 内容        |
| `text-inverse`   | `#08090A` | 明亮背景上的文字     |

主文字使用略暖的象牙白，不使用大面积纯白，以降低长时间工作时的眩光。

### 9.3 Borders and focus

| Token               | 基准值                   | 用途                   |
| ------------------- | ------------------------ | ---------------------- |
| `border-subtle`     | `rgb(242 238 229 / 8%)`  | 区域分隔与网格         |
| `border-default`    | `rgb(242 238 229 / 14%)` | 控件边界               |
| `border-strong`     | `rgb(242 238 229 / 24%)` | 选中前的强分隔         |
| `focus-ring`        | `#C7AE72`                | 键盘焦点与精确输入焦点 |
| `focus-ring-offset` | `#070809`                | 保证焦点环与内容分离   |

黄铜色只用于 Focus、少量高级强调和品牌细节；它不是常规 Primary Action 颜色。

`border-subtle`、`border-default` 和 `border-strong` 默认只承担装饰性分层。需要表达控件边界、选中状态或 Focus 的线条，必须使用经当前背景计算后达到 3:1 的专用语义令牌。

### 9.4 Functional states

| Token              | 基准值    | 用途              |
| ------------------ | --------- | ----------------- |
| `state-info`       | `#68A8FF` | 信息与链接        |
| `state-success`    | `#59C28C` | 成功与安全状态    |
| `state-warning`    | `#E5B45B` | 警告              |
| `state-danger`     | `#F06C68` | 错误与危险动作    |
| `state-record`     | `#FF4D47` | Record 与录音状态 |
| `editor-playhead`  | `#FF4D47` | 播放头            |
| `editor-selection` | `#E8D9A8` | 跨轨道选择轮廓    |

Record 红色只能表示录音、危险或停止性错误，不应成为普通品牌强调色。

### 9.5 Editor selection rendering

| Token                         | 基准值                   | 用途                           |
| ----------------------------- | ------------------------ | ------------------------------ |
| `editor-note-selected-border` | `#F4E7B9`                | Selected Note 的高对比实体轮廓 |
| `editor-note-selected-glow`   | `rgb(232 217 168 / 58%)` | Selected Note 的辅助外发光     |

Selected Border 是状态识别的主要信号；Glow 只用于从密集网格中提升层次，不能单独承担
Selection 语义。DOM 与 Canvas Note Renderer 必须消费同一 Scene 中已经解析的 Border、Glow
和 `selected` 状态，不得分别定义颜色或推断 Selection。键盘 Focus Ring 与 Note Selection
必须保持可区分。

### 9.6 材质表达

- Global Bar 和大型浮层 MAY 使用非常轻微的纵向明度变化，表现钢琴烤漆的深度。
- 禁止高强度玻璃拟态、彩虹描边和大面积背景模糊。
- 阴影只表示覆盖关系，不作为普通面板分隔。
- 高光面积应小于组件主体，且不影响文字对比度。
- 背景中不使用装饰性噪点干扰时间网格。

## 10. 轨道内容色彩

### 10.1 与主题分离

轨道色是音乐内容身份，不是应用主题色。切换 Piano Black、Modern Studio 或其他主题时，项目中的轨道颜色必须保持可识别和语义稳定。

轨道 SHOULD 保存稳定的 Palette ID；如果未来允许任意色，再保存规范化颜色值。渲染层根据主题派生背景、边框、文本和 Ghost 变体。

### 10.2 建议初始调色板

| ID       | 基准色    | 名称   |
| -------- | --------- | ------ |
| `violet` | `#8B6FE8` | Violet |
| `cobalt` | `#438FE8` | Cobalt |
| `cyan`   | `#36AFC2` | Cyan   |
| `teal`   | `#3BAA8C` | Teal   |
| `green`  | `#68A85A` | Leaf   |
| `lime`   | `#A4B84F` | Lime   |
| `amber`  | `#D99B43` | Amber  |
| `orange` | `#DF7848` | Orange |
| `coral`  | `#DF666A` | Coral  |
| `rose`   | `#C95A8E` | Rose   |
| `indigo` | `#6674D9` | Indigo |
| `slate`  | `#71849A` | Slate  |

这些是内容基准色，不可直接作为所有状态的填充色。至少需要派生：

- `track-solid`：图标、细强调和播放中电平；
- `track-surface`：Track Header 或 Clip 的低明度背景；
- `track-surface-hover`；
- `track-surface-selected`；
- `track-border`；
- `track-text-on-solid`；
- `track-ghost`。

### 10.3 分配与编辑

- 新建轨道时从调色板随机选择，但 SHOULD 避免与前后相邻轨道相同。
- 随机结果在创建 Command 中确定，不能在每次渲染时重新生成。
- 用户后续可以通过 Track Menu 或 Inspector 修改颜色。
- 改色属于可持久化、可 Undo 的 Project Command。
- 同一轨道的 Clip 和 MIDI Note 共享颜色族，但不同对象类型可以使用不同亮度和透明度。

## 11. 字体与数字

### 11.1 字体角色

| Role    | 用途                            | 建议                                     |
| ------- | ------------------------------- | ---------------------------------------- |
| UI Sans | 菜单、按钮、Inspector、轨道名称 | 中性、窄幅、清晰的无衬线字体             |
| Display | 项目标题或少量品牌区域          | MAY 使用精致衬线字体                     |
| Numeric | 时间、BPM、拍号、参数           | 支持 tabular numerals 的 UI Sans 或 Mono |

Display 字体不得进入密集参数区、网格标签和小尺寸按钮。最终字体家族在性能、授权和多语言覆盖评估后单独决定。

### 11.2 字号体系

| Token     | Size / Line height | 用途                         |
| --------- | ------------------ | ---------------------------- |
| `type-xs` | 11 / 16 px         | 次要标尺与紧凑元数据         |
| `type-sm` | 12 / 18 px         | 菜单辅助信息、Inspector 标签 |
| `type-md` | 14 / 20 px         | 默认 UI 文字                 |
| `type-lg` | 16 / 24 px         | 面板标题、重要数值           |
| `type-xl` | 20 / 28 px         | 项目标题或空状态标题         |

低于 11 px 的文字禁止承载必要信息。时间、BPM 和量化值使用 tabular numerals，避免数值变化引起布局抖动。

## 12. 间距、圆角与密度

### 12.1 4 px 基础网格

| Token       | Value |
| ----------- | ----: |
| `space-0_5` |  2 px |
| `space-1`   |  4 px |
| `space-2`   |  8 px |
| `space-3`   | 12 px |
| `space-4`   | 16 px |
| `space-6`   | 24 px |
| `space-8`   | 32 px |

文字、图标和控件应落在统一节奏上。紧凑模式通过组件令牌改变间距与高度，不允许 Feature 自行缩放。

### 12.2 圆角

| Token         |  Value | 用途                      |
| ------------- | -----: | ------------------------- |
| `radius-xs`   |   3 px | Clip、Note、细小选择      |
| `radius-sm`   |   5 px | 输入框、小按钮            |
| `radius-md`   |   8 px | Toolbar group、Menu item  |
| `radius-lg`   |  12 px | Popover、Dialog           |
| `radius-pill` | 999 px | Transport group、状态胶囊 |

Piano Black 的轮廓应像精密乐器：外层柔和、内部网格锐利。不可把所有矩形都变成相同的大圆角卡片。

### 12.3 Density、Scale 和 Contrast

以下是彼此独立的用户偏好：

- **Density**：Comfortable / Compact，改变间距和控件高度。
- **UI Scale**：整体可读尺寸，例如 90% / 100% / 110% / 125%。
- **Contrast**：Standard / High，提高边界和非文本图形对比度。
- **Motion**：Full / Reduced。

它们不是主题的一部分，也不应通过复制整套主题实现。

## 13. 图标

- 产品功能图标 MUST 使用 Iconify 收录的 Fluent UI System Icons，prefix 为 `fluent`。
- 默认使用与显示尺寸匹配的 Regular 图标，例如 `fluent:midi-20-regular`；Filled 只表达
  Selected、Checked 或 Active 等持续状态。
- 图标在构建期按需编译为本地 SVG Component，生产运行时 MUST NOT 请求 Iconify API。
- 品牌标记与 Fluent 无法准确表达的专业 DAW 语义 MAY 使用 Seele 自有图标；自有图标必须遵循
  相同网格、视觉重量和圆角语言，并作为受控集合维护。
- Feature MUST NOT 为接近语义而临时混用其他 Iconify 图标集，也不得复制 Fluent SVG Path。
- 常规图标尺寸为 16、20、24 px。
- 图标按钮必须有可访问名称和 Tooltip。
- 禁止使用 Emoji 作为生产功能图标。
- Save、Play、Record、Mute、Solo 等高频动作保持行业惯例，但必须使用 Seele 自己的组件比例和状态表达。
- 同一图标不可在同一上下文中代表两个不同动作。

## 14. 组件语言

### 14.1 通用状态矩阵

每个交互组件至少验证以下状态：

| State              | 视觉要求                        |
| ------------------ | ------------------------------- |
| Default            | 清晰但不抢占内容                |
| Hover              | 轻微提高背景或边界，不移动布局  |
| Pressed            | 更深或更实的即时反馈            |
| Selected / Checked | 持续状态，区别于 Pressed        |
| Focus-visible      | 高对比 Focus Ring，不依赖 Hover |
| Disabled           | 降低强调，同时保持文字可辨      |
| Busy               | 保留原尺寸，避免布局跳动        |
| Error              | 错误语义与恢复动作同时可见      |

### 14.2 Button

层级：

- **Primary**：一个局部决策区域最多一个，例如 Save / Create。
- **Secondary**：可见但不主导，例如 Discard。
- **Ghost**：工具栏与高频非破坏动作。
- **Icon**：Transport、面板标题和对象快捷动作。
- **Danger**：不可轻易恢复的破坏动作。

按钮文案使用动词或明确结果。图标与文字同时出现时，两者必须表达同一个动作。

### 14.3 Toggle 与模式按钮

Mute、Solo、Record Arm、Snap 和 Tool 都是持续状态，不应只在按下瞬间反馈：

- Selected 状态必须在指针离开后仍清晰。
- Record Arm 使用红色与形状/图标共同表达。
- Mute / Solo 的颜色语义由组件统一，不随轨道颜色改变。
- 工具模式切换使用单选组语义。

### 14.4 Toolbar

- 按任务分组，不按实现模块分组。
- 同组控件间距小于组间距。
- 高频命令固定位置，避免随选择状态大幅移动。
- 次级命令可进入 Overflow，但不得隐藏当前活动状态。
- 键盘导航使用 Roving Tab Index；Tab 进入工具栏，方向键在组内移动。

### 14.5 Input、Slider 与 Knob

- 精确数值必须同时可键盘输入，不能只依赖拖动。
- Slider 显示当前值；双击或菜单可恢复默认值。
- Knob 只用于符合音频习惯的连续参数，拖动方向必须稳定，并提供精确调整修饰键。
- 参数拖动使用 Preview，提交和自动化写入的边界由具体能力定义。
- 输入错误保留用户文本并解释格式，不静默替换为不相关值。

### 14.6 Menu 与 Context Menu

- 菜单用于命令发现，不承载复杂表单。
- 子菜单只在确有层级时使用，避免三级以上嵌套。
- 当前状态使用 Checkmark 或 Radio，不仅靠文字颜色。
- 危险项与普通项分组，并使用明确名称。
- 菜单打开后焦点进入菜单；Escape 关闭并返回触发按钮。

### 14.7 Dialog

- Modal 只用于必须先决策才能继续的情况。
- 标题说明决策对象，正文说明后果，按钮使用具体动词。
- 初始焦点根据风险选择；危险操作不得默认聚焦破坏按钮。
- 焦点限制在 Modal 内，背景不可交互。
- 关闭后恢复到触发元素；若触发元素消失，恢复到合理的工作区焦点。

Save / Discard / Cancel 的推荐顺序由平台约定适配，但主动作、破坏动作和取消动作的视觉层级必须稳定。

### 14.8 Toast、Banner 与 Inline Message

| 组件           | 使用场景                               |
| -------------- | -------------------------------------- |
| Toast          | 已完成、无需立即处理、短暂可撤销的事件 |
| Banner         | 影响整个项目或设备、仍可继续工作的状态 |
| Inline Message | 与某个字段、面板或资源直接相关的错误   |
| Dialog         | 必须在继续前做出决定                   |

### 14.9 Tooltip

- 解释只有图标的控件、截断文字和不熟悉的功能。
- SHOULD 同时显示快捷键。
- 不应遮挡正在拖动的目标。
- 不承载必须阅读才能完成任务的关键信息。

### 14.10 Splitter 与 Scrollbar

- Splitter 可视线可细，但命中区域必须足够宽。
- Hover 和 Focus 时显示拖动方向。
- 双击 Splitter MAY 恢复默认高度。
- 编辑器 Scrollbar 使用低对比轨道和可辨识 Thumb；不得在非触控环境中永久隐藏必要滚动能力。

## 15. Arrangement 视觉语法

### 15.1 Canvas 层

推荐从后向前分层：

1. Static Grid：小节、拍、细分、轨道分隔。
2. Content：Clip、波形、自动化。
3. Selection：选中轮廓、范围区域。
4. Interaction Preview：拖动 Ghost、Snap Guide。
5. Playhead：播放头与录音位置。
6. Tooltip / Cursor：数值读数和工具光标。

层之间必须可独立失效和重绘。播放头移动不应导致静态网格和全部 Clip 重绘。

### 15.2 网格层级

- 小节线最强，拍线次之，细分线最弱。
- 轨道交替背景只能使用非常小的明度差，避免类似表格斑马纹。
- Snap Guide 是短时强调，强于网格、弱于 Selected Outline。
- 网格密度随 Zoom 调整，不能出现比像素更密的闪烁线。

### 15.3 Clip 状态

| 状态         | 表达                                  |
| ------------ | ------------------------------------- |
| Normal       | 轨道色低明度 Surface + 清晰标题       |
| Hover        | 提升边界或顶部高光                    |
| Selected     | 独立 Selection Outline + 轻微亮度提升 |
| Muted        | 降低饱和度，并显示 Mute 语义          |
| Drag Preview | Ghost + Snap Guide，保留原始基准      |
| Invalid      | 危险轮廓或禁止光标，不提交            |

选中不得仅通过把 Clip 变成另一种轨道颜色来表达。

## 16. Piano Roll 视觉语法

### 16.1 行与键盘

- 白键与黑键行只需要足够区分音高结构，不模拟真实琴键材质。
- 每个 C 音 MAY 有更清晰标签，其他音名根据 Zoom 和设置渐进显示。
- 左侧键盘与网格行严格对齐；滚动时不能出现亚像素漂移。
- 鼠标按下琴键的听音反馈属于 Playback/UI 接入能力，不应阻塞基础编辑实现。

### 16.2 Note 状态

| 状态         | 表达                                             |
| ------------ | ------------------------------------------------ |
| Normal       | 轨道色 Solid / Surface 组合                      |
| Hover        | 轻微高光或边界                                   |
| Selected     | 高对比轮廓 + 克制 Glow，必要时显示 Resize Handle |
| Muted        | 降低饱和度和不透明度，并保留形状                 |
| Preview      | Ghost 或描边，不覆盖原位置                       |
| Out of scale | 后续功能；不可只靠红色判错                       |

极短音符仍需保留可点击命中区域。视觉宽度和交互命中宽度可以不同。

### 16.3 Inspector

Inspector 只显示当前选择能够编辑的属性：

- 无选择：显示上下文帮助或 Clip 摘要。
- 单个 Note：Pitch、Start、Duration、Velocity。
- 多个 Note：显示共同值或 Mixed 状态，支持批量相对变更。
- 无法修改的派生值使用只读样式，不伪装成 Disabled 输入框。

## 17. 主题系统

### 17.1 定义

主题系统由两部分组成：

1. **严谨统一的 Design Tokens 和视觉语义**：产品实现基础。
2. **可命名的主题预设**：用户感知的风格，例如 Piano Black、Modern Studio、Neon Circuit。

“古典、现代、电子朋克、小清新、二次元”可以成为主题的创作方向，但只有在通过同一语义系统表达后，才是可维护的产品主题。

### 17.2 跨主题不变量

| 保持不变           | 可以变化             |
| ------------------ | -------------------- |
| 信息架构和布局骨架 | Surface 色相与明度   |
| 功能和手势         | 文字冷暖与字体表达   |
| 状态含义           | 边界、阴影和材质强度 |
| 尺寸语义           | 部分圆角与装饰细节   |
| 可访问性要求       | 内容色的主题适配变体 |
| 快捷键和命令       | 品牌插画与空状态图形 |

### 17.3 推荐模型

```ts
interface AppearancePreferences {
  themeId: 'piano-black' | 'modern-studio' | 'neon-circuit'
  density: 'comfortable' | 'compact'
  uiScale: 0.9 | 1 | 1.1 | 1.25
  contrast: 'standard' | 'high'
  motion: 'full' | 'reduced'
}
```

这是产品模型示意，不要求立即实现同名接口。

主题是用户偏好，不是 Project fact。打开他人的项目不会自动改变当前用户主题。

### 17.4 主题开发约束

- 每套主题必须提供完整的 Semantic Tokens，不允许 Feature 兜底到某个主题的 Raw Color。
- 主题发布前必须完成组件状态矩阵与编辑器 Canvas 的视觉回归。
- Canvas 获取解析后的 Theme Snapshot；主题变化时统一使相关渲染层失效。
- 禁止在 Canvas 绘制代码中散落主题 Hex。
- 主题不能为了“风格”降低文字、Focus、网格和关键控件的可辨识度。

## 18. 可访问性

### 18.1 对比度

- 普通文字与背景对比度 MUST 至少为 4.5:1。
- 大号文字 MAY 使用至少 3:1。
- 关键控件边界、Focus Indicator 和传达状态的非文本图形 MUST 至少为 3:1。
- Disabled 控件虽有例外，仍 SHOULD 尽量可读并解释不可用原因。

### 18.2 目标尺寸

- 交互目标 MUST 满足至少 24 × 24 CSS px，或满足标准允许的间距例外。
- Seele 的高频 Toolbar 控件 SHOULD 以至少 32 × 32 px 为默认目标。
- Canvas 中极小 Note / Clip 可以使用更大的隐形 Hit Target，但不能让相邻对象无法准确选择。

### 18.3 键盘与焦点

- 所有可见命令必须可通过键盘到达或有等价快捷键。
- Focus Ring 始终可见，不能仅使用浏览器默认值后又被全局样式移除。
- Toolbar 使用单一 Tab Stop 和方向键内部导航。
- Menu Button 正确暴露展开状态；菜单支持方向键、Enter、Space 和 Escape。
- Modal 打开后背景不可交互，Tab 焦点保持在内部。
- Canvas Surface 必须是可聚焦区域，并通过状态栏、Inspector 或可访问文本提供当前选择和操作反馈。

### 18.4 动效、缩放与本地化

- 尊重 `prefers-reduced-motion`，并允许应用内偏好覆盖为更少动效。
- UI Scale 不应影响 Project 的时间与音高精度。
- 文案容器为较长语言保留空间，不依赖固定英文宽度。
- 不把 Hover 作为唯一发现入口；触屏或键盘路径必须等价。

## 19. 动效与反馈

### 19.1 时长

| Token            | Duration | 用途                   |
| ---------------- | -------: | ---------------------- |
| `motion-instant` |  0–60 ms | Press、拖动反馈        |
| `motion-fast`    |    80 ms | Hover、Focus、Toggle   |
| `motion-normal`  |   140 ms | Menu、Popover          |
| `motion-slow`    |   220 ms | 面板打开、布局模式变化 |

### 19.2 原则

- 拖动、Resize、播放头和电平表直接跟随输入，不使用补间动画。
- Menu 和 Popover 动效使用短距离淡入，不使用弹簧回弹。
- Panel 打开可动画，关闭后应立即释放不可见交互层。
- Undo / Redo 的内容结果不使用大幅飞入动画。
- Reduced Motion 下保留必要的状态变化，但去除位移、缩放和闪烁。

## 20. 文案与命名

- 使用 Sentence case，不使用所有单词首字母大写。
- 动作用动词：`Save`、`Add track`、`Open in MIDI editor`。
- 状态用事实：`Saving…`、`Saved`、`Unsaved changes`。
- 会继续打开对话框或选择器的命令 MAY 使用省略号，例如 `Export…`。
- 避免泛化文案：使用 `Couldn’t save “Project name”`，不使用 `Something went wrong` 作为唯一信息。
- DAW 专有名词在产品术语表中统一，不在不同区域混用 Track / Channel、Clip / Region 等称呼。

## 21. 实现规则

### 21.1 DOM 与 Canvas

SHOULD 使用 DOM 的区域：

- App shell；
- Global Bar 与 Transport；
- Track Header；
- Inspector；
- Menu、Popover、Dialog；
- 表单、按钮和可访问文本。

SHOULD 使用 Canvas 的区域：

- Arrangement 网格与大量 Clip；
- Piano Roll 网格与 Note；
- 自动化曲线；
- 波形缩略图；
- 高频 Playhead / Meter 图层。

Canvas 不是绕开可访问性和状态边界的理由。DOM 与 Canvas 必须读取同一 Editor state 和 Project Query，不得各自维护业务副本。

当前至少 150 小节、少量 Clip、尚无 Zoom / Drag 的 Arrangement 纵向切片 MAY
继续使用 DOM，以验证真实创建、选择、打开、横向滚动和可访问交互。Track 控制行与 Lane 已经
消费同一排序和行高；右侧 Arrangement 是唯一二维滚动视口，左侧 Track 列以裁切的合成层从
视图跟随其纵向位置。Ruler 与 Lane 共享横向滚动，原生横向滚动条只属于 Arrangement；引入
可变 Zoom、大量 Clip、高频播放图层或拖动预览前，必须以性能数据和交互需求重新评估 Canvas /
分层渲染；渲染技术迁移不得改变 Project Command、Presentation、Selection 与滚动权威边界。

Studio 已建立应用级共享视觉位置投影：普通 Playback State 只发布 Play、Pause、Return、自然
结束、项目切换和失败等低频转换；一个受生命周期管理的动画帧循环在播放时直接采样 Transport。
Scheduler cadence 只负责音频 look-ahead，不是 UI 刷新源。后续 DOM 或 Canvas Playhead 必须读取
这份投影，并只更新独立轻量图层，不能各自维护计时器或累计时间。

Arrangement 当前使用独立 DOM Playhead 子组件直接消费该投影，并只更新一个合成层的
`translate3d(...)`。Ruler、Lane、Clip Scene 不消费高频位置；分页 Follow 由 Arrangement 右侧
滚动权威执行，手动横向导航会暂停当前播放轮次的自动滚动。

Piano Roll 同样由独立 Playhead 子组件直接消费视觉位置。已交付的 Clip Focus Playhead 由 Studio
Presentation 显式携带 Project 身份和 Arrangement `clip.startTick`，子组件再映射到当前
Clip-local Viewport。Track Surface 与双 Scope 切换已经可见，但 Track Playhead 尚未接入；后续
Track Playhead 直接消费全局 Tick，并在自身横向权威上分页 Follow。静态 Canvas Grid、DOM Note
Scene、Project Query 和 Editor Session 都不订阅高频 Transport 帧。当前可见的完整 Clip 视口
没有 Zoom、横向滚动或 Follow。

### 21.2 禁止项

生产 Feature 组件不得：

- 直接写 Raw Hex、任意阴影、任意圆角或任意 `z-index`；
- 通过 `themeId === "piano-black"` 改变业务行为；
- 每帧向 Project Core 提交拖动结果；
- 把 ProjectSession 或大型 Model 放入 Pinia 深代理；
- 用轨道颜色表达 Focus、Error 或 Record；
- 将 Project Entry 的宽松欢迎布局当作编辑器密度与区域布局依据；
- 为尚无产品场景的能力提前搭建通用框架。

### 21.3 组件与主题验证

每个新增组件至少检查：

- 默认、Hover、Pressed、Selected、Focus、Disabled、Busy、Error；
- Standard / High Contrast；
- Comfortable / Compact；
- 100% 和 125% UI Scale；
- Piano Black 以及至少一个对比主题；
- 键盘操作；
- Reduced Motion；
- 长文案和空值。

Canvas 功能至少检查：

- 不同 Device Pixel Ratio；
- 极限 Zoom；
- 大量对象；
- Track Color 全调色板；
- 选择、Ghost、播放头和网格的层级；
- 主题切换后的完整重绘；
- 键盘 Focus 与可访问反馈。

## 22. 设计评审清单

提交 UI 切片前回答：

### 产品

- 用户在这个界面要完成的主要任务是什么？
- Primary Action 是否唯一且明确？
- 空状态、加载、失败和恢复路径是否完整？
- 功能是否需要撤销，还是需要确认？

### 状态

- 这是 Project、Application、Workbench、Editor 还是 Transient 状态？
- Project 切换后哪些状态必须清理？
- 拖动是否只在 Pointer Up 提交一次？
- 异步结果如何处理过期请求？

### 视觉

- 是否使用语义令牌而非 Raw Value？
- 音乐内容是否比界面框架更突出？
- Track Color 是否保持内容语义？
- Focus、Selected、Record、Error 是否容易区分？

### 交互与可访问性

- 键盘能否完成同一任务？
- Escape 的取消顺序是否明确？
- 点击目标和对比度是否达标？
- Reduced Motion、UI Scale 和长文案是否可用？

### 工程

- Command、Menu、Button 和 Keybinding 是否共享同一动作？
- DOM / Canvas 边界是否合理？
- 是否复用 Workbench 能力，或有真实理由扩展它？
- 是否包含与风险相称的单元、交互或视觉验证？

## 23. 已确认的产品决定

1. 默认主题为 Piano Black，追求黑色三角钢琴般精致、克制、专业的质感。
2. Project Entry 使用同一主题语义，但其欢迎布局不决定编辑器的信息密度与区域结构。
3. 轨道拥有多种主题色；创建时受控随机，之后可手动修改。
4. 轨道色是 Project fact，应持久化并最终支持 Undo / Redo。
5. Piano Roll 默认停靠在下方，支持最小化、拖动调整高度、最大化和工作区全屏。
6. 退出 Piano Roll 工作区全屏后恢复之前的停靠高度。
7. Design Tokens 是主题实现基础；古典、现代、电子朋克等是主题预设的用户表达。
8. 主题改变视觉表达，不改变布局、功能和交互语义。
9. Theme、Density、UI Scale、Contrast、Motion 是独立设置。
10. Workbench Shell 只提供编辑器骨架；真正的 Arrangement、Piano Roll 等业务界面按产品切片规划实现。
11. Arrangement Clip 切片使用 DOM，默认派生至少 150 小节；右侧 Arrangement 独占真实二维
    滚动状态，左侧 Track 列以无独立 `scrollTop` 的裁切从视图跟随，Ruler 与 Lane 共用横向
    滚动；进入 Zoom、大量对象或高频交互前重新评估 Canvas。
12. Piano Roll 使用混合表面：Toolbar、标尺、钢琴键盘和可访问状态使用 DOM，Grid 使用 Canvas，Note 通过可替换 Renderer Port 输出。
13. MIDI 60 显示为 C4；首批视图以 C4 附近为中心，Clip Focus 横向初始显示完整 Clip。
14. Piano Roll 显式提供 Pencil 与 Cursor，默认 Pencil；Cursor 负责 Selection 与 Note
    Body Move，Pencil 不发起 Move。
15. Piano Roll 初始 Grid 为 1/16、Snap 默认开启；视觉 Grid 与交互 Snap 消费同一 Common Grid。
16. Pencil Click 空白 Grid 创建长度为一格、Velocity 100、UI Channel 1 的 Note；成功后只选中新 Note并保持 Pencil。
17. Note 左右边缘 Resize 对 Cursor 与 Pencil 同时开放；一次 Drag 只产生一次提交。
18. Piano Roll 首批使用 DPR-aware Canvas Grid 与 keyed DOM Note；Canvas Note Adapter 消费同一 Scene，是否切换由真实基准决定。
19. Piano Roll 使用同一 Project 模型的双 Scope：默认 `Track` 全局时间轴，可选 `Clip Focus`
    局部时间轴；Scope 是应用偏好，不是 Project Fact。Track 空白区域的 Clip 自动创建 / 向右
    扩展与 Note 创建必须是一个原子 Command，且自动扩展不能跨越下一 Clip。

## 24. 待后续切片决定

以下问题不应在缺少业务原型时提前锁死：

- 最终 UI Sans、Display 和 Numeric 字体家族；
- Global Bar 与 Transport 是一行合并还是两行布局；
- Inspector 默认位于左下、右侧，还是根据编辑器切换；
- Arrangement 与 Piano Roll 横向 Zoom 的默认同步规则；
- Piano Roll Box Selection、多 Note Resize、Split、Copy 的精确手势与边界；
- Track Color 是固定 Palette ID，还是允许任意色值；
- 首批内置主题除 Piano Black 外的数量和视觉方向；
- Browser / Library 与 Mixer 的最终工作区模式；
- 用户 Keymap、Shortcut Settings 与平台冲突定制策略。

每项应在对应纵向产品切片开始前，结合可操作原型单独确认。

## 25. 规范治理

- 本文是设计决策入口，不是某一张效果图的说明附件。
- 已确认的设计决定写入“已确认的产品决定”；仍需原型验证的问题保留在“待后续切片决定”。
- 如果实现需要偏离 MUST，同一批变更必须先更新本文并说明原因和替代约束。
- 新主题只能扩展 Token 值和受控表达，不能在 Feature 中建立第二套设计语言。
- 效果图、原型和截图默认是探索性材料；只有被本文明确吸收的规则才具有规范性。
- Design Token 进入代码后，代码中的 Token Schema 是可执行定义，本文负责解释语义和使用边界；两者必须在同一变更中保持一致。
- 每完成一个独立编辑器模块，应依据第 22 节进行设计评审，并在进入下一模块前由项目负责人确认。

## 26. 参考

项目内：

- [Web DAW architecture brief](./docs/architecture/web-daw-architecture-brief.md)
- [Web DAW long-term architecture](./docs/architecture/web-daw-long-term-architecture-v3.md)
- [Studio workbench](./apps/studio/src/workbench/README.md)
- [Piano Roll feature](./apps/studio/src/features/piano-roll/README.md)
- [Project navigation composition plan](./apps/studio/docs/studio-project-navigation-composition-plan.md)

外部规范：

- [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI-ARIA APG: Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
- [WAI-ARIA APG: Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)
- [WAI-ARIA APG: Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)
- [WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)
