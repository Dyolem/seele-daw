# Studio Keyboard

键位、输入分派、用户 Keymap 与快捷键录制。Action 的身份与执行属于
[Action 模块](../actions/studio-action.ts)；Keyboard 不写项目事实。

## 入口

- [index.ts](./index.ts)：feature 可用的类型、能力与目录查询，从 `@/workbench/keyboard` 导入。
- [setup.ts](./setup.ts)：构造函数，只给 `bootstrap/` 使用。实际装配在
  [studio-action-runtime.ts](../../bootstrap/studio-action-runtime.ts)。

模块外只能导入这两个入口；模块内直接引用具体文件。

## 三层

| 目录         | 内容                                                                              | 可依赖                   |
| ------------ | --------------------------------------------------------------------------------- | ------------------------ |
| `contracts/` | Binding、输入能力、录制、用户 Keymap 状态、冲突关系，以及 Registry / Storage Port | `contracts/`             |
| `runtime/`   | Keymap 组装、路由冲突分析、Input Router、User Keymap、Vue 绑定、目录查询          | `contracts/`、`runtime/` |
| `browser/`   | TanStack 匹配与录制、localStorage                                                 | `contracts/`、`browser/` |

`runtime/` 与 `browser/` 只通过 `contracts/` 相遇；依赖方向由架构检查执行。Router 本身接收
`KeyboardEvent`，所以 runtime 并不是平台无关的，这里隔离的是第三方库与存储。

## 一次按键

```text
TanStack Registry（browser）    匹配按键组合、平台映射、过滤可编辑控件
→ Input Router（runtime）        暂停、Modal、上下文优先级、控件对按键的归属、Repeat
→ StudioActionCoordinator        解析当前目标并执行 Action
```

被接受的输入会被消费，即使之后执行失败；只有 `unavailable` 才回退到更低优先级的上下文。

## 修改键位

```text
设置页草稿或 Recorder 结果
→ User Keymap：校验、预览冲突、生成候选覆盖
→ Router.replaceKeymap：准备注册 → 保存记录 → 发布快照 → 释放旧注册
→ Vue 绑定：菜单、按钮提示与设置页一起更新
```

Recorder 只产出草稿，不保存 Keymap。保存失败时，Action 与已生效的键位都不变。

## 改哪里

- 默认键位、Repeat：对应 Action 声明的 `keys`、`repeat`。
- 区域优先级与重叠：对应上下文声明的 `priority`、`overlaps`；冲突分析在
  `runtime/studio-keyboard-routes.ts`。
- 覆盖的保存与回退：`runtime/studio-user-keymap.ts`。
- 浏览器占用键、录制过滤：`browser/` 中对应的 Adapter。
- 设置页布局：`features/keyboard-shortcuts/`。

快捷键的产品行为（默认键位、Escape 的先后顺序、可编辑控件中的行为）见
[PRODUCT](../../../../../PRODUCT.md)。
