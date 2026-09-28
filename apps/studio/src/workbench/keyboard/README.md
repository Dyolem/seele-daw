# Studio Keyboard

本模块拥有 Studio 的键位政策、输入分派、用户 Keymap 和录制能力。业务动作的身份及执行
继续由 [Action 模块](../actions/studio-action.ts) 拥有；Keyboard 不写 Project Facts。

## 从哪里开始阅读

1. [index.ts](./index.ts)：功能组件能使用的能力、类型、静态政策与目录查询。
2. [setup.ts](./setup.ts)：仅供 Studio bootstrap 使用的构造入口；导入时不创建实例。
3. [studio-action-runtime.ts](../../bootstrap/studio-action-runtime.ts)：实际装配、Context
   能力连接及资源释放顺序。实例所有权仍在这个 Composition Root。
4. 根据审阅主题，沿下方执行或配置主线进入实现。

完整产品语义与默认键位见 [Keyboard 架构](../../../docs/studio-keyboard-shortcut-architecture.md)。

## 目录与职责

| 位置         | 内容与所有权                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/` | 跨边界的 Binding、输入能力、录制能力、用户 Keymap 状态／结果、冲突关系，以及 Registry / Storage Port。局部类型仍留在所属实现中。 |
| `keymap/`    | 默认 Binding / Context / Repeat、区域关系、路由冲突分析和只读目录查询；不注册监听或持有用户记录。                                |
| `runtime/`   | Input Router 拥有物理注册和暂停令牌，User Keymap 拥有用户覆盖及保存事务；控件按键归属与分派放在一起。                            |
| `browser/`   | TanStack 匹配／录制、localStorage 和动态 Binding 错误；实现共享契约。                                                            |
| `vue/`       | 从已提交快照派生响应式键位和设置状态，管理自己的订阅。                                                                           |
| `__tests__/` | 各职责的行为回归、跨模块 DOM 集成与 `support/` 测试实现；仅测试可以直接引用内部文件。                                            |

当前模块属于 Studio 浏览器输入层：Router 接收 `KeyboardEvent`，Recorder 接收焦点所属
`HTMLElement`。这些现有 DOM 契约保持不变，`contracts/` 表示能力边界，不表示平台无关内核。

### 对外引用

功能组件、菜单展示及 Action Context 统一从 `@/workbench/keyboard` 导入。公开的
`StudioKeyboardInput` 不包含 `replaceKeymap`，`StudioUserKeymap` 和 `StudioShortcutRecorder`
不包含资源销毁能力。设置修改通过 User Keymap 的完整事务执行。

`apps/studio/src/bootstrap/` 从 `@/workbench/keyboard/setup` 导入已有构造函数、默认 Keymap
及注入 Port。`setup.ts` 明确导出构造能力，实际创建与释放仍在 Composition Root；不增加
新的总管理器，也不创建全局实例。

模块内部直接引用所属文件；不经过 `index.ts` / `setup.ts`，不建立子目录通配导出。
依赖方向由架构检查约束，包括 `@/`、`~/`、相对路径和绝对路径：

| 源目录／入口 | 允许依赖的 Keyboard 内部目录        |
| ------------ | ----------------------------------- |
| `contracts/` | `contracts/`                        |
| `keymap/`    | `contracts/`、`keymap/`             |
| `runtime/`   | `contracts/`、`keymap/`、`runtime/` |
| `browser/`   | `contracts/`、`browser/`            |
| `vue/`       | `contracts/`、`runtime/`、`vue/`    |
| `index.ts`   | `contracts/`、`keymap/`             |
| `setup.ts`   | 上述五个目录                        |

生产代码不能导入测试支持代码。根层仅保留两个 TypeScript 入口，入口使用明确导出。
TanStack 运行时导入限于两个 Browser Adapter；Binding 的编译期键名约束仍可导入其类型。

### 实例实现与生命周期

Input Router 与 User Keymap 使用模块内的 class 实现各自接口。实例字段集中声明，内部算法
使用 `#` 私有方法；阅读实现时依次查看字段、构造过程、公开能力和私有算法。默认政策、
冲突分析与目录查询继续使用普通数据和函数。

Router 的构造过程只建立实例状态，既有 `createStudioKeyboardInputRouter` 入口负责完成
首次物理注册后再返回；注册失败仍由替换事务释放已准备的资源。User Keymap 在构造时读取
用户记录、应用有效覆盖并建立首个快照。`createStudioUserKeymap` 保留现有构造契约与接口
返回类型，避免具体 class 身份进入装配消费者；本次不额外增加工厂层。

公开可调用能力使用绑定实例的箭头函数字段，保留单独传递给 Vue、数组回调或事件处理器的
行为。内部方法使用普通私有方法；暂停释放、取消订阅和保存事务的回调仍用局部闭包，分别
捕获对应令牌、订阅或事务。实例不进入 Vue 深代理，Composition Root 继续统一释放资源。

## 按键执行主线

```text
BrowserTanStackHotkeyRegistry：匹配组合、平台映射与 Editable 过滤
  → StudioKeyboardInputRouter：暂停、Modal、Context、控件归属、Repeat
  → StudioActionCoordinator：解析当前业务能力并调用 Action
```

审阅顺序：

1. [默认政策](./keymap/studio-default-keymap.ts) 与 [Context](./keymap/studio-keyboard-context.ts)。
2. [路由分析](./keymap/studio-keyboard-routes.ts)：相同物理键位的互斥、优先级和真实冲突。
3. [Input Router](./runtime/studio-keyboard-input-router.ts) 与
   [控件按键归属](./runtime/browser-keyboard-ownership.ts)：何时消费、回退或保留按键。
4. [TanStack Registry](./browser/browser-tanstack-hotkey-registry.ts)：第三方与平台边界。

## 修改配置主线

```text
Settings 草稿／Recorder 结果
  → StudioUserKeymap：检查输入、预览冲突、生成候选覆盖
  → Router.replaceKeymap：准备注册 → 保存记录 → 发布快照 → 释放旧注册
  → Vue Binding：更新菜单、按钮和设置显示
```

审阅顺序：

1. [User Keymap 契约](./contracts/studio-user-keymap.ts)：状态、诊断和编辑能力。
2. [User Keymap 实现](./runtime/studio-user-keymap.ts)：加载回退、保存与重新分配事务。
3. [Storage Port](./contracts/studio-user-keymap-storage.ts) 及
   [localStorage 实现](./browser/browser-user-keymap-storage.ts)。
4. [Vue Binding](./vue/studio-keyboard-vue-binding.ts) 和
   [目录查询](./keymap/studio-shortcut-catalogue.ts)。

录制独立遵循 [Recorder 契约](./contracts/studio-shortcut-recorder.ts)；
[Browser Recorder](./browser/browser-tanstack-hotkey-recorder.ts) 只返回草稿结果并管理当前录制
的暂停与清理，不保存 Keymap。整体行为由现有 Settings、DOM 和生命周期回归验证。

## 修改时如何定位

- 修改默认键位或 Repeat：`keymap/studio-default-keymap.ts`。
- 修改区域优先级／冲突：`keymap/studio-keyboard-context.ts` 和 `studio-keyboard-routes.ts`。
- 修改草稿保存或覆盖回退：`runtime/studio-user-keymap.ts`。
- 修改浏览器占键提示／录制过滤：`browser/` 对应 Adapter。
- 修改设置布局：`features/keyboard-shortcuts/`；通过公开入口消费本模块。
- 修改能力或依赖边界：同步契约、入口、本文档及 `tooling/architecture-rules/` 的规则和回归。
