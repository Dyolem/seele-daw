# Studio Keyboard Shortcut Architecture

> Status: Implemented; Binding and Keymap refinement awaiting review
>
> Date: 2026-07-28
>
> Scope: `apps/studio`

## 1. 目标

Studio 的快捷键系统需要统一解决：

- 跨平台 `Mod` 语义与按键匹配；
- Action ID、文案、Binding 和 enabled policy；
- Modal、Focused Editor、Workbench 与 Global 的作用域优先级；
- 输入控件、IME composing 与浏览器默认行为；
- Feature 注册、卸载与应用释放；
- 菜单、帮助面板和未来 Command Palette 可复用的 metadata。

它不拥有 Project History、dirty、Selection 或任何 Project fact。快捷键只找到当前应该执行
的 Action，业务结果仍由 Active Project、ProjectSession 或 Editor Session 决定。

## 2. 第三方库决定

固定使用 MIT 许可的 `@tanstack/hotkeys@0.8.0` 核心包，不使用 Vue Adapter：

- 核心 `HotkeyManager` 已提供 `Mod`、按键解析、输入过滤、目标监听和显式 unregister；
- Coordinator 由 Studio Composition Root 创建，不应绑定任意 Vue 组件的 composable 生命周期；
- 当前库仍为 alpha，API 可能变化；生产代码只有 Browser Adapter 可以运行时导入它，
  `studio-keyboard-binding.ts` 只导入其 `Hotkey` 类型约束内置配置；
- `package.json` 使用精确版本，升级必须重新运行输入过滤、跨平台匹配、冲突和 cleanup 测试。

官方依据：

- [TanStack Hotkeys Overview](https://tanstack.com/hotkeys/latest/docs/overview)
- [HotkeyManager API](https://tanstack.com/hotkeys/latest/docs/reference/classes/HotkeyManager)
- [npm package](https://www.npmjs.com/package/@tanstack/hotkeys)

## 3. 分层

```text
KeyboardEvent
  -> BrowserTanStackHotkeyRegistry
     - parsing / Mod / editable filtering / listener cleanup
  -> StudioKeyboardShortcutCoordinator
     - Action identity / scope / enabled / handled policy
  -> Feature Handler
     - ActiveProjectService / ProjectSession / EditorSession
```

Browser Registry 是第三方兼容层，不知道 Save、Undo、Piano Roll 或 Modal。Coordinator
不知道 TanStack 类型，也不进入 Pinia；它作为应用级命令能力通过类型化 Vue Context 注入。

Binding 配置链为：

```text
compile-time Hotkey literal
  -> StudioKeyboardBinding
  -> STUDIO_DEFAULT_KEYMAP
  -> Composition Root
  -> Coordinator.bindingsFor(actionId)
  -> Feature registration
```

页面不保存默认按键字面量。Composition Root 当前注入完整默认 Keymap；未来加载用户偏好后，
可以在同一边界传入合并后的冻结 Keymap，而不修改 Feature。

## 4. Action 契约

每个注册 Action 必须定义：

- 稳定 `actionId`；
- 一个或多个 Binding；
- label 与 description；
- Scope；
- 可选的动态 `isEnabled`；
- 返回 `boolean` 的同步 `run`。

`run()` 返回 `true` 表示该 Action 已处理当前按键；异步业务可以在内部启动，但必须同步决定
是否接受该意图。Coordinator 只在返回 `true` 后调用 `preventDefault()` 和
`stopPropagation()`。

Metadata 以冻结快照公开，包含平台格式化后的 Binding，可供菜单和未来帮助面板使用；不公开
Handler。

`StudioKeyboardBinding` 使用共享 `Brand<string, 'StudioKeyboardBinding'>` 定义项目自有的
nominal identity。内置配置必须通过
`defineStudioKeyboardBinding()` 编写，其泛型受 TanStack `Hotkey` 类型约束，因此拼写错误在
Type Check 阶段失败；Coordinator、Feature 和 Context 不接受任意 `string`。

## 5. Scope 与冲突

优先级固定为：

1. Modal / Dialog：300；
2. focused Piano Roll：200；
3. Workbench：100；
4. Global：0。

同一 Binding 可以在不同 Scope 注册。按键发生时从高到低查找 enabled Action；高优先级
Handler 返回 `false` 时允许较低 Scope 接管。同一 Scope 的同一 Binding 不允许出现两个
所有者，避免依赖注册顺序。

Action ID 在应用中唯一。Feature 注册返回幂等 disposer；最后一个 Action 离开某个 Binding
后才卸载底层浏览器 Listener。

## 6. 浏览器事件规则

- 第三方 Adapter 强制 `ignoreInputs: true`，包括 `Mod` 和 `Escape`；
- `isComposing` 或 legacy keyCode 229 不进入 Action；
- 已被更高层处理的 `defaultPrevented` Event 不再分派；
- TanStack 的默认 `preventDefault` / `stopPropagation` 被关闭；
- enabled check 或 Handler failure 不落到更低 Scope，也不逃逸进浏览器事件循环；
- Composition Root dispose 必须释放 Coordinator；Feature unmount 必须调用自己的 disposer。

### 6.1 动态用户输入

未来 Settings 输入是运行时字符串，不能伪装成编译期 Binding：

1. UI 调用 Coordinator 的 `validateBindingInput()`；
2. Browser Adapter 返回项目自有的冻结 Validation，包括 errors、warnings 和可选 Binding；
3. 无效输入在当前字段旁显示，不保存、不替换默认值，也不进入注册流程；
4. 有效 Binding 才进入用户覆盖 Keymap；
5. 加载到损坏或已不兼容的持久化覆盖时，回退对应默认 Binding，并在 Settings 中提示。

注册阶段的内置 Keymap 错误属于开发配置错误，应由类型检查或启动失败尽早暴露，不使用 Toast
掩盖；用户可修正的输入错误则必须在未来 Keymap Settings 面板内提供行内反馈。

## 7. 首批 Action

| Action ID                    | Binding                    | Scope      | 当前 enabled 条件                            |
| ---------------------------- | -------------------------- | ---------- | -------------------------------------------- |
| `project.save`               | `Mod+S`                    | Workbench  | Ready、dirty 且不在 Saving                   |
| `history.undo`               | `Mod+Z`                    | Workbench  | 当前 Session 可以 Undo                       |
| `history.redo`               | `Mod+Shift+Z`、`Control+Y` | Workbench  | 当前 Session 可以 Redo                       |
| `piano-roll.selection.clear` | `Escape`                   | Piano Roll | 下一批：Piano Roll focused 且 Selection 非空 |

Piano Roll Action ID 和 Scope 已稳定，但本批不注册一个没有 Editor Session 权威的空 Handler。
它与可见 Selection 一起在第三阶段 Batch 4 接入。

## 8. 暂不实现

- 用户自定义 Keymap 与持久化；
- Shortcut Recorder；
- 多键 Sequence；
- Shortcut Settings 或 Command Palette；
- 组件内直接使用 TanStack Vue composable；
- 用 Pinia 保存注册表、Handler 或浏览器 Listener。

当前已建立默认 Keymap、动态输入验证结果和注入边界，但尚未提供用户可见的 Keymap Settings
面板或持久化覆盖。
