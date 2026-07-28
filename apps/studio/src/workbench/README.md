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
