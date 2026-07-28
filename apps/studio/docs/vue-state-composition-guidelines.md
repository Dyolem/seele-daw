# Studio Vue 状态与依赖组合准则

> Status: Normative
> Scope: `apps/studio` Vue application layer
> Last updated: 2026-07-24

本文档规定 Seele Studio 如何在组件本地状态、Props / Emits、Pinia 与
`provide / inject` 之间选择。它补充根目录 `DESIGN.md` 的状态所有权约束，不改变
Project Core、Active Project 或浏览器 Runtime 的权威边界。

## 1. 两个不能混为一谈的问题

选择状态工具前必须分别回答：

1. **谁拥有这项状态或能力的权威？**
2. **它如何进入 Vue 组件树并被消费？**

`provide / inject` 是依赖组合机制，不天然等于状态管理。Pinia 是 Vue UI 层的
响应式 Store 机制，也不天然拥有任何业务权威。

同一个应用服务可以通过 Context 注入；一个 Context 也可以携带响应式状态。能否实现
不是决策标准，状态的权威、生命周期、变化模型和消费者范围才是。

## 2. 决策顺序

### 2.1 组件本地状态

状态只影响一个组件或紧密耦合的子树时，优先使用 `ref`、`shallowRef` 或
`computed`。

典型示例：

- 菜单是否打开；
- 当前 Toast；
- Pointer Drag Preview；
- Splitter 正在进行的拖动交互。

状态不应仅因为“以后可能复用”就提前提升为全局 Store。

### 2.2 Props / Emits

父组件已经拥有数据，并且消费者沿清晰的直接层级分布时，使用 Props 传递事实、Emits
上报用户意图。

典型示例：

- Workbench 把 Project Track Presentation 传给 Arrangement；
- Transport 上报 Undo / Redo 意图；
- Dock 控件上报 Close / Minimize。

Props / Emits 保持组件契约显式。只有出现多个远距离消费者或跨分支协调时，才考虑
Store 或 Context。

### 2.3 `provide / inject`

以下条件成立时使用类型化 Vue Context：

- Composition Root 创建并拥有唯一实例；
- 消费者需要的是命令能力、Port、Service 或 Runtime Binding；
- 实例需要替换为测试实现；
- 生命周期由应用组合负责，而不是由任意组件创建；
- 不希望把基础设施能力层层透传为 Props。

当前示例：

| Context | 注入内容 | 原因 |
| --- | --- | --- |
| Active Project | Service + shallow Vue Binding | 权威在应用服务，Vue 只观察 |
| Project Entry | Coordinator | 应用用例能力 |
| Project Track | Coordinator | Project Command 能力 |
| Project Clip | Coordinator | Project Command 能力 |
| Project MIDI Note | Coordinator | Clip 目标校验与 Project Command 能力 |
| Navigation Decision | pending binding + resolver | 一次性异步决策 Port |

Context 可以携带 `shallowRef`，但如果该对象开始拥有大量 UI 状态、派生值、协调动作、
重置规则和多个跨分支消费者，它已经成为手写 Store，应重新评估 Pinia。

### 2.4 Pinia

以下条件同时成立时使用 feature-scoped Pinia Store：

- 权威属于 Vue / Workbench UI 层；
- 状态轻量且可从 Project facts 或用户操作重建；
- 多个非父子组件需要读取或触发状态转换；
- 状态有明确的协调动作，例如 activate、select、reconcile、reset；
- Devtools 中观察状态转换有实际调试价值。

当前首个正式 Store 是 Project Workbench Selection。它只保存：

- 当前 Selection 所属的 `ProjectId`；
- `selectedTrackId`；
- `selectedClipId`。

它不保存 Track / Clip Record、Project Snapshot 或 Session。页面用最新 Snapshot 的
`trackOrder` 与 Clip 所有权协调 Selection；选中实体被 Undo 或后续 Remove Command
移除时，Store 清空失效 ID。切换或离开 Project 时也清空 Selection。

## 3. 为什么 Workbench Selection 使用 Pinia

Track / Clip Selection 是编辑会话状态，不是 Project fact：

- 选择 Track 不应产生 Project Commit；
- 不应进入 Undo / Redo；
- 不应触发 dirty；
- 不写入 Checkpoint；
- 刷新后可以安全重建。

它同时连接 Track Row、Arrangement Lane、Clip、Context Editor Dock 和 Project 页面生命周期。
这些消费者分布在不同组件分支，Selection 还需要处理 Project 切换和模型变化后的
失效协调。因此使用 feature Store 比创建一个带 Ref 与 Actions 的自定义 Context 更
清晰。

这里使用 Pinia 不是因为 `inject` 做不到，而是因为：

- Selection 本身就是 Vue UI 权威状态，而不是外部服务的 Vue 入口；
- Store actions 明确表达状态机边界；
- 不需要在 Composition Root 手动创建、provide 和 dispose 一个无外部资源的实例；
- 测试可以为每个挂载创建独立 Pinia，隔离状态；
- Track 与 Clip Selection 具有同一个明确归属，但不会污染 Project Model。

Clip Selection 保持 `selectedClipId -> selectedTrackId` 所有权一致性：选择 Clip 同时选择
所属 Track；直接选择 Track 会退出 Clip Selection；Clip 消失时只清除 Clip 身份并尽可能保留
仍存在的 Track。

## 4. 禁止进入 Pinia 的内容

Pinia MUST NOT 持有：

- `ProjectSession`；
- Project History 或 Undo / Redo 权威；
- dirty、saved content state 或保存结果的权威；
- Project Snapshot、完整 Track / Clip / Note 图；
- IndexedDB 连接、Checkpoint Store 或其他浏览器资源；
- pending Promise resolver；
- Audio / Playback Runtime；
- Canvas 大型索引、波形缓存或逐帧 Drag Preview。

Store 可以持有指向 Project 实体的 branded ID，并由最新 Project facts 校验该 ID。

## 5. 生命周期与协调规则

Feature Store 必须定义清理条件，不能依赖组件偶然销毁：

1. 进入另一个 Project 时清空旧 Project Selection；
2. 离开当前 Project 时清空 Store；
3. Snapshot 更新后校验所选 ID 是否仍存在；
4. transient interaction 结束时清理 Preview；
5. 测试为每个用例创建新的 Pinia 实例。

UI Store 的协调不得反向修改 Project facts。若用户操作需要修改 Project，Store 或组件
必须调用应用层 Coordinator，由 Coordinator 执行 Project Command。

## 6. 快速选择表

| 场景 | 默认工具 |
| --- | --- |
| 单组件开关、Hover、临时反馈 | Local Ref |
| 明确父子数据与意图 | Props / Emits |
| 应用服务、Coordinator、Port、Runtime Binding | Typed Context |
| 跨分支、轻量、可重建的 UI 会话状态 | Pinia |
| Track、Clip、Note、dirty、History | 对应领域或应用权威，不进入上述 UI Store |

当两个方案都可实现时，优先选择能最准确表达权威和生命周期的方案，而不是代码最少或
最流行的方案。
