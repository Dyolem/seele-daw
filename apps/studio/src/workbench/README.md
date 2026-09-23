# Workbench

应用外壳、服务装配、命令、上下文、生命周期和 Contribution 注册放在这里。只有 Studio 的
Composition Root 可以知道并装配全部领域包与浏览器实现。

当前应用级操作能力按以下职责组成：

- `StudioActionCoordinator` 拥有静态目录、当前能力解析、调用接受与完成结果；
- `StudioKeyboardInputRouter` 拥有键位、输入上下文和物理 Listener 生命周期；
- `StudioUserKeymap` 拥有本地用户覆盖记录，协调验证、保存与 Router 替换；Vue Binding 只订阅
  已提交快照，菜单、按钮和设置共享当前键位；
- `StudioShortcutRecorder` 封装 TanStack 录制与输入暂停生命周期，只向 Settings 返回草稿；
  冲突说明与重新分配使用 User Keymap 的统一 Context 分析和原子保存；
- Composition Root 装配 Feature Action 定义；页面和编辑器只提供临时业务目标；
- 菜单、按钮和快捷键通过同一个 Action 调用业务权威，Save 与 WA2 Workbench 入口已接入；
- 文件选择器与导航等待由页面持有；Dock 能力直接读取 Workspace，均不成为应用状态副本；
- Pinia 不保存 Handler、目标能力、pending resolver 或底层业务对象。

详见 [Studio Action Architecture](../../docs/studio-action-architecture.md) 和
[Studio Keyboard Shortcut Architecture](../../docs/studio-keyboard-shortcut-architecture.md)。

当前应用级能力还包括 `ProjectPlaybackCoordinator`：

- Composition Root 创建唯一 Coordinator、Browser Runtime 与 Timer，并在 Active Project、Vue
  Binding 和浏览器音频资源之间建立显式生命周期；
- Coordinator 从稳定 Project Snapshot 编译计划，组合浏览器无关 Transport / Scheduler，再把
  Voice Plan 交给 Audio Web；它不写 Project Fact，也不进入 Pinia；
- Vue Context 只暴露命令能力和 shallow frozen playback state，Transport 组件继续通过 Props /
  Emits 接收展示状态与上报用户意图；
- 首个 Play 用户手势才激活 AudioContext 和准备当前计划所需的同源 Manifest/WAV；应用退出、
  项目切换和计划替换都会停止 Timer、使 Voice 失效并释放 Project playback lifetime；
- Studio-owned Built-in Instrument Catalogue 同时派生 Inspector 显示与 22 个 developer-local
  asset base，避免名称和 URL Map 漂移；production build 仍不复制 public Soundbank；
- 两种 Standard MIDI File 导入入口共用 Studio-owned Program / Channel 10 路由；未审核 Program
  保存无声、可见且可由 Inspector 显式替换的 Placeholder，不回退 Studio Grand；
- Project MIDI 提供瞬态、版本化的 Mode Semantic Binding；Studio 只在导入反馈中展示 Bound 模式或
  Unresolved / Conflicted notice，并明确检测不会改变现有 Instrument 路由；
- Project MIDI 同时把首个 Note 前或同 Tick 最终生效的 CC7 / CC10 写入现有 Track Gain / Pan；
  后续动态控制保持诊断，不在 Studio 维护第二份 Controller 状态；
- Soundbank 资源缺失会在播放准备时明确失败，不能回滚已经合法提交的 Instrument Replace。
- developer-only 音质页由 Studio 组合原创 Type 1 总谱、同一 MIDI Import Factory、Catalogue
  location、生产资源缓存和 Sample Voice Runtime；它验证真实多音源 PCM，但不会进入 production
  dist，也不会把自动报告冒充人工听测。

完整规则见
[Studio Built-in Instrument Catalogue V1](../../docs/built-in-instrument-catalogue-v1.md)和
[Studio MIDI Program Import Routing V1](../../docs/midi-program-import-routing-v1.md)。MI5 总谱门禁与
听测状态见
[Built-in Multi-Instrument Score Playback V1 收口报告](../../../../packages/audio-web/docs/built-in-multi-instrument-score-playback-v1-closure-report.md)。
