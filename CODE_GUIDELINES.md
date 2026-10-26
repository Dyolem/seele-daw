# Seele DAW 工程代码准则

适用于 `apps/`、`packages/` 与 `tooling/` 中人工维护的代码、测试和工程文档。能由工具判断的事
交给工具：格式用 Oxfmt，未使用代码与常见错误用 Oxlint 和 ESLint，类型用 `tsc` 与 `vue-tsc`，
依赖方向用 `tooling/architecture-rules`。本文只写需要人来判断的事。分层与“代码放在哪里”见
[ARCHITECTURE](./ARCHITECTURE.md)。

## 1. 取舍顺序

1. 领域不变量、数据正确性与资源安全；
2. 下一位维护者能看懂、能验证；
3. 满足当前需求的最小完整设计；
4. 内聚、依赖方向与状态归属；
5. 消除真正的知识重复；
6. 行数、技巧或形式上的“优雅”。

更短、模式更多、复用层级更高，都不自动代表更好。

## 2. 质量命令

- 根目录的 `package.json`、`.oxfmtrc.json`、`.oxlintrc.json` 与 `eslint.config.ts` 是唯一配置。
  各包的 `lint`、`lint:fix`、`format`、`format:check` 只委托根命令（由 lint 检查）。
- `pnpm lint`、`pnpm format:check` 与 `pnpm check` 不改写源码；只有 `pnpm format` 与
  `pnpm lint:fix` 会改写。
- 提交前运行与风险相称的检查。跨包、状态权威、持久化或组合根的改动运行 `pnpm check`。
- 格式器或 lint 规则升级单独提交，不与行为改动混在一起。

## 3. 切片与提交

- 从一个可见、可验证的产品场景出发，不为“以后也许需要”预建扩展点或通用基础设施。
- 一次改动同时带上必要的测试和文档更新。
- 大规模重构与行为变更分开提交；直接服务于当前实现的局部整理可以同批完成。
- 新的公开 API 在同一次改动中要有真实消费者。

说不清用户行为、权威数据、失败结果或生命周期时，先讨论清楚再动手。

## 4. 边界

- 包根只导出确实需要的能力，不为测试或一次调用暴露写能力。
- 新包或新模块只在职责稳定、已有真实消费者、能隔离平台或明确生命周期时才拆。文件变长只是
  信号，不是拆分理由；按产品责任、状态归属和变化原因拆，不制造只做转发的碎片。
- Feature 之间只使用对方明确提供的组件和契约，不导入对方的私有 hook、DOM ref 或内部状态。
- 文件放在消费者的最小共同范围：只有一个文件用，就留在文件内；一个子模块用，放在子模块里；
  多个子模块用，放在 feature 层；多个 feature 用，放进 `workbench/` 或 `ui/`。不预建空目录，
  不建没有 owner 的 `utils`。
- 只在确有公共边界时建 `index.ts`，并显式列出导出，不用 `export *` 汇总私有实现。

## 5. 复用与重复

- 新写工具之前，依次看平台（JS、DOM、Vue）、当前模块、当前包的公开 API、其他允许依赖的
  包，最后才新增。名字相似不等于能复用，要比较输入约束、失败语义、生命周期和所有权。
- 要消除的是同一知识的多份权威，例如 Action 与键位、协议字段、Track 调色板、schema
  version、同一个领域值的解析规则。
- 以下情况可以保留相似代码：属于不同领域、会因不同原因变化；提取后会藏起测试意图或关键
  步骤；共享需要一堆 boolean、callback 或 mode 参数；抽象只能叫 `common`、`utils`、`manager`。
- `@seele-daw/type-utils` 只收纯编译期、跨领域的类型工具，见
  [收录规则](./packages/type-utils/README.md)。

## 6. 抽象

- 引入 Interface、Port、Adapter、Factory、Coordinator 或 Strategy，必须解决一个当前问题：隔离
  平台或第三方 API、让领域不依赖框架、组合资源生命周期、协调多个权威之间的异步决策与竞态、
  支持已经存在的替代实现。“以后可能替换”“方便 mock”不算。
- 无状态的用例写成普通函数，例如 `workbench/edits`。只有拥有状态和生命周期的东西才做成
  class 或服务。
- Coordinator 只用于跨权威、有异步决策或竞态的用例，例如项目入口、导航确认、MIDI 导入。
  只转发一个方法的 Coordinator 不要建。
- 只有调用方要按 code 分支时才新增错误类，否则用已有的错误类型。
- 删掉一层之后，所有权、失败路径和测试仍然一样清楚，就删掉它。
- 缓存、空间索引、Worker、虚拟化等性能手段，先有目标场景和基准再引入。

## 7. 常量与配置

- 需要集中管理的值：稳定 ID、协议 discriminator、数据库名与版本、跨 feature 的产品映射
  （Track Palette、Grid Preset）、可被用户覆盖的默认值、设计令牌、有单位或算法含义的阈值。
- 可以留在局部的值：语义自明的字面量、只属于一个测试的输入、由变量名和单位解释清楚的公式。
  不要为了形式把每个数字都提到远处。
- 配置用准确类型、`satisfies` 或 readonly，让新增字段时的遗漏变成类型错误。
- InjectionKey 与它的 provide / inject 函数写在同一个文件。需要独立身份时现场创建
  `Symbol`，不用 `Symbol.for`。

## 8. TypeScript

- 用判别联合、穷尽分支和 readonly 数据表达状态；运行时表示相同但不能互换的领域值用 `Brand`。
- 外部数据、持久化数据和用户输入在边界解析，内部只消费已验证的类型；`unknown` 就近收窄。
- 上游已经保证的事不再检查：Snapshot 的不变量、编译出的计划、自己算出的几何。检查只放在值从
  外部进入的地方，例如文件、存储、布局尺寸与浏览器 API 的返回值。
- `as` 与非空断言只用在已验证的边界上（例如验证后提升为 Brand），理由不明显时写注释。
- 不写嵌套三元表达式，改用 guard、`switch` 或命名函数。
- 不要在多个 mapper 中逐字段比较“是否相等”来复用旧对象，字段一多就会悄悄过期；比较版本或
  身份。
- 只有调用方会按 code 分支的错误才带 code；其余抛 `Error` 或 `RangeError`，消息写清哪里错了。
  用户可修正的错误与开发配置错误分开。

## 9. Vue 与状态

先回答两个问题：谁拥有这个状态？它怎么进入组件树？

| 场景                                      | 工具                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| 单个组件的开关、Hover、临时反馈、拖动预览 | 本地 `ref` / `computed`                                     |
| 父组件已有数据，消费者在直接层级上        | Props / Emits                                               |
| 组合根创建的服务、Port、Runtime Binding   | `useStudio()`，或 feature 自己的 typed provide / inject     |
| 跨分支、轻量、可从事实重建的 UI 会话状态  | feature 级 Pinia Store（Selection、Piano Roll 偏好、Toast） |
| 项目事实、History、dirty                  | `ProjectSession` / `ActiveProjectService`                   |

- Pinia 不持有 `ProjectSession`、History、dirty、Snapshot、浏览器资源、等待中的 resolver、
  播放运行时和逐帧预览。Store 可以保存 branded ID，但要用最新事实校验它。
- Store 写清自己的清理条件：切换或离开项目时清空，Snapshot 更新后校验 ID 是否仍存在。
- 纯派生用 `computed`。`watch` 只用于副作用、订阅和渲染器调用，并写清 cleanup、flush 时机和
  竞态策略。
- 组件修改项目只通过服务（通常是 `useStudio().edits`）执行命令，命令提交后重新读取权威结果。
- 组件按完整视觉区域拆分；模板加逻辑接近 800 行时重新评估，但不为凑行数制造转发组件。

| 形式       | 负责                                          | 避免                                     |
| ---------- | --------------------------------------------- | ---------------------------------------- |
| Vue 组件   | 模板、局部 DOM ref、Props / Emits、无障碍语义 | 内嵌完整输入协议、提交事务和大量几何计算 |
| Composable | 响应式适配、订阅、监听和局部资源组合          | 把整个组件脚本搬进一个巨大的 `useXxx()`  |
| Class      | 独立会话、状态转换和明确的生命周期            | 为无状态计算建空壳 class                 |
| 普通函数   | 投影、几何、解析和纯转换                      | 只为统一名称加 `use` 前缀                |

Composable 的参数只传需要的 ref、getter 或能力，不传装着整个 feature 状态的大对象。

## 10. 生命周期与异步

- 注册 Listener、Subscription、Observer、Timer 或外部资源的 API 返回 disposer，或由明确的
  owner 提供 `dispose()`。disposer 应当幂等；部分创建失败时回滚已创建的资源。
- 订阅者是函数。发布者逐个调用，某个监听者抛错时用 `reportListenerError` 报告，继续通知其余
  监听者，也不退订它；不提供 `onError` 回送（ADR-011）。
- 多个资源有依赖顺序时显式安排创建与释放（组合根用 `DisposalStack`），不依赖多个
  `onMounted` 的注册顺序。释放后排队的任务必须失效，不能再操作旧 DOM 或旧会话。
- 异步请求要定义重复请求、过期结果、取消、释放和错误传播；latest-wins、排队或拒绝并发由用例
  明确选择。
- 保存、导航、命令或持久化失败时，不能通过修改 UI 镜像假装成功。

## 11. 测试

- 测产品行为、领域不变量、边界协议、失败恢复和资源释放，而不是覆盖实现行。生产逻辑改变时，
  同批更新那些在逻辑损坏时真会失败的测试。
- 用例主体应能直接看出 Given / When / Then。少量重复如果让意图更直接，可以保留。
- 测试 support、fixture、fake 只放在 `__tests__/` 下，生产代码不得导入（由架构检查执行），
  也不得为测试暴露额外写入口。
- 每种命令类型在 `command-properties.spec.ts` 中有一条用例，每种 Mutation 类型在
  `mutation-applier.spec.ts` 中有对应用例（见 ADR-001、ADR-002）。
- 时间、随机身份、浏览器资源和调度器在需要确定性时通过已有 Port 注入。

## 12. 命名、注释与文档

| 对象                   | 约定                           | 示例                                     |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| 目录、普通 TS 文件     | kebab-case                     | `track-surface/`、`track-placement.ts`   |
| Vue 组件               | PascalCase，多词且有业务辨识度 | `ProjectPianoRollTrackSurface.vue`       |
| Composable 文件 / 函数 | `use-xxx.ts` / `useXxx`        | `use-track-follow.ts` / `useTrackFollow` |
| 类型与 class           | PascalCase                     | `TrackPlacementPreview`                  |
| 函数与变量             | camelCase                      | `resolvePlacement`                       |
| 稳定枚举式常量         | UPPER_SNAKE_CASE               | `PIANO_ROLL_TOOL`                        |
| 测试                   | 对应文件名 + `.spec.ts`        | `track-placement.spec.ts`                |

- 名称表达领域角色、单位、所有权或动作；避免 `data`、`item`、`manager`、`utils`。跨 feature 的
  公开名称保留领域限定词，私有文件可以省略外围前缀。不为统一风格批量重命名存量文件。
- ID、命令类型、Action ID 和协议字段一旦持久化或跨边界，就是稳定契约。
- 生产代码的注释用英文，解释原因、竞态、不变量、单位或平台限制，不逐句翻译代码。需要长注释
  才能讲清控制流时，先简化代码。TODO 写明缺失的行为或解除条件。
- 文档：产品行为改 [PRODUCT](./PRODUCT.md)；设计令牌与交互语义改 [DESIGN](./DESIGN.md)；分层或
  “放在哪里”的变化改 [ARCHITECTURE](./ARCHITECTURE.md) 或对应包的 README；长期决定写
  [ADR](./docs/adr/README.md)。阶段计划完成后移入 `docs/archive/`。删除或替换实现时，同步删除
  过期的说明。

## 13. 评审清单

- 这次改动解决哪个当前产品行为？权威状态在哪里？失败、Undo / Redo、保存和释放后会怎样？
- 有没有竞态、过期结果或部分成功？
- 删掉某一层 Interface、Factory、Coordinator 或 Store 之后，是否同样清楚？
- 有没有实现没有消费者的扩展能力？helper 减少的是知识重复，还是只是文本重复？
- `as` 是否都在已验证边界上？新增字段时，类型检查能否暴露遗漏？
- `watch` 是在做必要的副作用，还是在复制派生状态？Listener、订阅和等待中的 Promise 都清理了吗？
- 测试会在行为损坏时失败吗？PRODUCT、DESIGN、ARCHITECTURE 或 ADR 需要同步吗？
