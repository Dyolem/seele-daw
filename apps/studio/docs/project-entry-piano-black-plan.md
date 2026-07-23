# Project Entry Piano Black 主题迁移计划

## 目标

本阶段把已经完成产品流程的 Project Entry 从临时视觉迁移到 Seele Studio 的 Piano Black
设计语言：

```text
Piano Black Semantic Tokens
        |
        +-> Entry masthead and hero
        +-> New Project primary action
        +-> Recent Project library
        +-> Loading / Empty / Error states
```

Create、Open、Recent Catalog、Route notice、Retry 与请求 generation 保持不变。本阶段不实现
主题切换设置、Workbench Shell 或编辑器布局。

## 设计定位

Project Entry 是开始一次创作会话的安静入口，不是营销落地页，也不是后台管理 Dashboard：

- 品牌只占据窄 Masthead，不与项目任务争夺注意力；
- Hero 只表达一个 Primary Action：New project；
- Recent projects 是本地 Project library，以清晰、紧凑的资源卡片呈现；
- Piano Black 的质感来自深色 Surface、暖白文字、细边界和少量黄铜细节；
- 不使用荧光品牌色、Emoji 图标、玻璃拟态、彩虹描边或悬浮位移动效。

入口页使用与编辑器相同的主题语义，但其宽松欢迎布局不决定 Workbench 的高密度布局。

## 视觉层级

```text
Application canvas
└── Entry frame
    ├── Masthead
    │   ├── Seele mark
    │   └── Local workspace status
    ├── Hero
    │   ├── Product promise
    │   └── New Project action
    └── Project library panel
        ├── Heading / count / local-storage note
        ├── Inline error + retry
        └── Loading | Empty | Recent Project grid
```

- 页面背景使用 Canvas / Workspace 的轻微纵向层次和受控 brass highlight；
- Masthead 与 Library 使用 `border-subtle` 建立秩序；
- Library 使用 Panel，Project item 使用 Raised，Hover 使用 Overlay；
- Primary Action 复用 `UiButton`，不在 Feature 中复制 Button 状态；
- Recent Project 保持整卡原生 Button，Hover 不移动布局；
- 功能图标使用构建期按需编译的 Fluent UI System Icons 与 `currentColor`，不复制 SVG Path，
  不使用 Emoji；Seele 品牌标记保留自有 SVG。

## 状态

### Loading

- 保留局部 loading，不遮蔽整个页面；
- 使用语义 Focus 色的紧凑 Spinner；
- New Project 在 Catalog 初次加载期间保持 disabled，避免并发入口动作。

### Empty

- 说明项目会保存在当前浏览器；
- 页面已有唯一 New Project 主操作，空状态不复制第二个 Primary Button。

### Error / Route notice

- 使用 Inline Message，不弹 Modal；
- danger 文本、细轮廓与错误图标共同表达；
- Refresh 使用 Ghost Button；
- unavailable Project 继续从当前 Catalog 视图隐藏。

### Busy

- New / Open 动作保留原尺寸；
- New Project 使用 `UiButton.busy`；
- Open item 保留卡片宽度，只替换尾部状态文字。

## 响应式与可访问性

- Desktop 使用双列 Hero 和双列 Recent Project grid；
- 中等宽度切为单列 Hero；
- 窄屏 Recent Project 切为单列，卡片尾部缩短但保留可访问名称；
- 所有交互目标至少 36 px，高频主操作高于该值；
- Focus-visible 使用主题 Focus Ring；
- Reduced Motion 通过全局 Motion Tokens 缩短动效；
- 项目名截断只影响视觉，Button 可访问名称仍包含完整文字。

## 验收

- Project Entry 生产样式不含 Raw Hex、私有主题色、任意阴影或任意 `z-index`；
- New Project 与 Refresh 复用 Seele `UiButton`；
- 生产图标不使用 Emoji；
- Create、Open、Retry、missing / invalid notice 与 Catalog 行为不变；
- Desktop 与 390 px 窄视口无横向溢出；
- 键盘 Focus、Disabled、Busy、Loading、Empty 与 Error 状态可辨认；
- lint、architecture、workspace type-check、全部测试和 Studio production build 通过；
- 完成本独立入口页视觉切片后停止等待审阅。

## 实施结果

- Masthead、Hero、New Project、Project library 与全部局部状态已迁移到 Piano Black；
- New Project 与 Refresh 复用 `UiButton`，Project item 保留原生整卡 Button；
- 功能图标通过 `UiIcon` 使用本地打包的 Fluent Regular 图标，品牌标记保留自有 SVG；
- Create、Open、Retry、不可用 Project 过滤与请求 generation 行为保持不变；
- 1440 px 实测为双列 Hero / 双列 Project grid，390 px 实测为单列且无横向溢出；
- 键盘焦点使用 2 px 主题 Focus Ring，浏览器控制台无 warning 或 error；
- Fluent 图标迁移按用户要求不重复浏览器视觉验证，由界面审查确认最终图形选择；
- architecture、workspace type-check、99 项 Studio 测试与 production build 通过。
