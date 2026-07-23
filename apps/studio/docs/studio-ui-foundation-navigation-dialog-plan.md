# Studio UI Foundation 与 Navigation Decision Dialog 计划

## 目标

本阶段用一个真实、可见的产品切片建立 Seele Studio 的第一层 UI 基础：

```text
Piano Black Design Tokens
        |
        +-> Seele Button
        |
        +-> Seele Alert Dialog shell
                  |
                  v
Project Navigation Decision Dialog
        |
        v
existing ProjectNavigationDecisionVueContext
```

完成后，现有 Navigation Decision Binding 产生的 pending request 会有真实的
Save / Discard / Cancel 消费者。Router guard、Workbench Shell 和 Piano Roll 不在本阶段实现。

## 为什么从这个切片开始

项目已经具备框架无关的 Project Navigation Confirmation Coordinator 和应用唯一的 Vue
Decision Binding。如果继续安装 Router guard，dirty 导航会等待一个用户看不到、也无法完成的
Promise。

Navigation Decision Dialog 同时能验证以下 UI 基础：

- Piano Black 的语义色、间距、圆角、Focus 和动效令牌；
- 原生 Button 的 Seele 外观封装；
- Headless Dialog 的焦点限制、Escape、可访问标题与描述；
- Teleport 后的主题令牌是否仍然有效；
- 业务 Feature 是否只依赖 Seele UI，而不直接依赖第三方组件。

这是具体产品需求驱动的最小基础，不扩建通用组件目录。

## Headless 依赖边界

本阶段选择 Reka UI 作为复杂交互原语的首个实现候选：

- Reka UI 只进入 `apps/studio/src/ui/`；
- Feature、Workbench、Project Core 和其他 workspace package 不直接 import `reka-ui`；
- Seele UI 组件拥有最终 DOM 外观、Design Token 映射和可访问文案；
- Reka UI 只提供 Modal、Focus、Portal、Escape 和 ARIA 行为；
- 不引入 Tailwind、shadcn-vue 初始化产物或第二套主题变量；
- 不同时引入 Vuetify0，避免两套 Overlay / Focus / Portal 语义。

如果以后替换 Headless 实现，Feature API 不应改变。

## 模块位置

```text
apps/studio/
├── docs/
│   └── studio-ui-foundation-navigation-dialog-plan.md
└── src/
    ├── ui/
    │   ├── components/
    │   │   ├── UiAlertDialog.vue
    │   │   └── UiButton.vue
    │   └── styles/
    │       ├── base.css
    │       └── piano-black.css
    ├── features/
    │   └── project-navigation/
    │       ├── ProjectNavigationDecisionDialog.vue
    │       └── __tests__/
    │           └── ProjectNavigationDecisionDialog.spec.ts
    └── App.vue
```

本阶段不创建 `packages/ui`。只有出现第二个真实消费者、组件 API 稳定且需要独立构建时，
才讨论抽取 workspace package。

## Design Token 范围

首批只实现当前对话框和后续编辑器外壳确定会使用的语义：

- Canvas、Workspace、Panel、Raised、Overlay、Sunken Surface；
- Primary、Secondary、Muted、Disabled、Inverse Text；
- Subtle、Default、Strong Border；
- Focus、Info、Success、Warning、Danger、Record；
- Control Default、Hover、Pressed、Disabled；
- 4 px Spacing；
- Button、Dialog 和 Pill Radius；
- Fast、Normal、Slow Motion；
- Dialog Overlay 与 Elevation。

Raw color 只允许出现在 Piano Black Token 文件中。Feature 和组件样式只使用
`--sd-*` 语义令牌。

Project Entry 是临时页面，其现有局部样式不在本阶段迁移。

## UiButton

`UiButton` 是原生 `<button>` 的薄封装：

- 保留原生 Button 语义和键盘行为；
- 支持 `primary`、`secondary`、`danger`、`ghost` 四种视觉层级；
- 支持默认与小尺寸；
- 统一 Hover、Pressed、Focus-visible、Disabled 和 Busy 状态；
- `busy` 时保持原尺寸、设置 `aria-busy` 并阻止重复动作；
- 不包含 Project、Command 或导航语义。

## UiAlertDialog

`UiAlertDialog` 封装 Reka Alert Dialog 的行为原语：

- 由调用方通过 `open` 控制，不内部复制业务状态；
- 提供可访问 Title、Description、Body 和 Actions slots；
- 使用 Portal，把 Overlay 和 Content 放入全局覆盖层；
- Escape 或 Headless close request 只发出 `request-close`；
- 不把 Close 自动解释成任何业务结果；
- 不依赖 Project Navigation 类型。

业务按钮使用普通 `UiButton`。点击 Save / Discard / Cancel 后，Decision Context 同步清除
pending，受控 `open` 随之关闭。这样不会让 Headless Action 的自动关闭顺序抢先把 Save
误解释为 Cancel。

## Navigation Decision Dialog

`ProjectNavigationDecisionDialog` 只注入
`ProjectNavigationDecisionVueContext`：

- 根据 intent 显示 Create、Open 或 Leave 的明确标题；
- 标识当前含未保存内容的 Project ID；
- previous save failure 存在时显示可恢复错误；
- Save、Discard、Cancel 都使用组件实际渲染的 pending capability；
- Escape 等关闭请求解释为 Cancel；
- 不直接调用 `activeProject.save()`；
- 不修改 dirty、History 或 saved identity；
- 不执行真正导航。

为满足 latest-request-wins，组件维护一个与当前 DOM 渲染批次对应的 shallow
`renderedPending`。Binding 在 DOM 更新前替换请求时，旧按钮仍提交旧 capability，因此
`context.resolve()` 会返回 `false`，不会错误完成最新请求。

## App 挂载

Dialog 作为 App 全局兄弟节点挂载：

```text
Project ready placeholder | RouterView
                +
ProjectNavigationDecisionDialog
```

Dialog 不属于某条 Route。这样 Router 后续切换或组件树变化时，pending request 仍由应用唯一
Overlay 消费。

## 测试

### UI 组件

- Button 默认类型为 `button`；
- variant、size、Disabled 与 Busy 状态稳定；
- Alert Dialog 在 open 时渲染可访问标题和描述；
- Escape / close request 由业务层决定结果。

### Navigation Dialog

- null pending 时不显示；
- Create / Open / Leave intent 文案正确；
- Save、Discard、Cancel 返回对应 Decision；
- Escape 返回 Cancel；
- previous save failure 可见；
- latest request 替换后，旧 pending capability 不能完成新请求。

### 应用集成

- App 始终挂载唯一 Dialog consumer；
- Project Entry 与 Ready placeholder 既有行为不变；
- Composition Root 的 pending request 能通过真实 Dialog 完成；
- dispose 仍能 Cancel pending 并释放资源。

## 验收

- `reka-ui` 只被 Studio UI 层 import；
- 没有 Tailwind、shadcn-vue 或独立 UI package；
- Project Entry 视觉不被本阶段重构；
- Router、Route 和 Project Navigation Coordinator 不修改；
- lint、architecture、workspace type-check、全部测试和 Studio production build 通过；
- 本独立 UI 切片完成后停止等待审阅。

## 实施结果

本阶段已于 2026-07-23 按上述边界完成：

- Studio 已固定引入 Reka UI 2.10.1，且只有 `src/ui/components/UiAlertDialog.vue`
  直接 import 第三方 Headless primitive；
- `vue-demi` 的版本选择脚本经源码核验后，以 workspace 单包白名单允许执行，没有开放其他
  依赖构建脚本；
- Piano Black 首批语义令牌、全局基础样式、原生 `UiButton` 和受控 `UiAlertDialog`
  已建立，没有引入 Tailwind、shadcn-vue 或独立 UI package；
- `ProjectNavigationDecisionDialog` 已作为 App 唯一全局消费者挂载，Save / Discard / Cancel
  只完成组件渲染的 pending capability，不取得 Coordinator 或 Active Project；
- latest-request-wins 的陈旧 DOM 事件已验证不会完成新请求，Escape 与 Cancel 均返回 Cancel；
- 真实浏览器验证确认桌面宽度、Cancel 初始焦点、390 px 窄视口布局、Escape 行为和无溢出；
- Project Entry 保持临时局部样式，Ready placeholder 只改用 Piano Black 语义令牌；
- Studio 当前为 13 个测试文件、81 项测试；Project Core 348 项、platform-browser 18 项与
  type-utils 2 项保持通过；
- lint、architecture、workspace type-check、全部测试和 Studio production build 通过；
- Router guard、Workbench Shell、Toast、Menu、Splitter 和 Piano Roll SDK 均未提前实施。
