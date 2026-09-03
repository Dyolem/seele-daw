# Workbench

应用外壳、服务装配、命令、上下文、生命周期和 Contribution 注册放在这里。只有 Studio 的
Composition Root 可以知道并装配全部领域包与浏览器实现。

当前应用级能力还包括 `StudioKeyboardShortcutCoordinator`：

- Composition Root 创建唯一实例，并通过类型化 Context 提供；
- Action ID、Scope、enabled 和 handled policy 属于 Studio；
- `@tanstack/hotkeys@0.8.0` 仅隐藏在 Browser Binding Registry 中；
- Feature 注册必须返回 disposer，应用释放时 Coordinator 再统一兜底清理；
- Handler 只调用既有应用能力，不把 ProjectSession、Selection 或 dirty 权威复制进快捷键
  注册表。
- Feature 只按 Action ID 从 Coordinator 获取 Binding；默认值集中在
  `STUDIO_DEFAULT_KEYMAP`，不在组件内散落按键字面量；
- 动态用户字符串必须先取得 Validation 结果，有效后才能成为 branded
  `StudioKeyboardBinding`。

完整规则见
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
- Soundbank 资源缺失会在播放准备时明确失败，不能回滚已经合法提交的 Instrument Replace。

完整规则见
[Studio Built-in Instrument Catalogue V1](../../docs/built-in-instrument-catalogue-v1.md)。
