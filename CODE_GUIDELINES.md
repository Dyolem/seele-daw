# Seele DAW 工程代码准则

> Status: Normative
>
> Scope: `apps/`、`packages/` 与 `tooling/` 中所有人工维护的生产代码、测试和工程文档
>
> Last updated: 2026-09-29

本文档规定 Seele DAW 在代码清晰度、复用、抽象、配置、状态所有权和测试方面的共同工程
准则。它不重复格式化器、ESLint、TypeScript 或专项架构文档已经能够明确决定的细节。

文中的 MUST、MUST NOT、SHOULD、SHOULD NOT 与 MAY 分别表示必须、禁止、默认应当、默认
不应当与允许。偏离 MUST 需要先修改规则或记录明确的架构决定；偏离 SHOULD 需要在代码、
测试或评审中说明当前场景的理由。

## 1. 优先级

发生取舍时，按以下顺序判断：

1. 领域不变量、数据正确性与资源安全；
2. 对下一位维护者清晰、可验证；
3. 只解决当前已知产品需求的最小完整设计；
4. 模块内聚、依赖方向和状态所有权；
5. 消除真正的知识重复；
6. 代码行数、技巧性或形式上的“优雅”。

更短、模式更多或复用层级更高，不自动代表设计更好。代码必须先准确表达产品语义和生命周期。

## 2. 自动化与人工判断

能够稳定自动检查的规则 SHOULD 进入工具链，而不是只写在文档中：

| 问题                                         | 主要执行者                   |
| -------------------------------------------- | ---------------------------- |
| 格式                                         | Oxfmt                        |
| 未使用代码和常见语法问题                     | Oxlint、ESLint               |
| 类型安全、项目引用和 Vue 模板类型            | TypeScript、`vue-tsc`        |
| Workspace 依赖、私有别名和测试反向依赖       | `tooling/architecture-rules` |
| 行为、不变量、失败恢复和生命周期             | 自动化测试                   |
| 抽象是否必要、命名是否准确、状态归属是否合理 | 设计与代码评审               |

不要在本文档中规定空格、分号、引号或 import 排序等格式细节。若规则会产生大量误报，也不要
为了“更严格”而强行加入 lint；应先证明它能识别项目中的真实缺陷。

提交前至少运行与改动风险相称的检查。跨 package、状态权威、持久化或生产组合变更默认运行
`pnpm check`；纯文档变更至少运行链接、格式和 `git diff --check` 等适用检查。

### 2.1 Workspace 质量命令

- 根 `package.json`、`.oxfmtrc.json`、`.oxlintrc.json` 与 `eslint.config.ts` 是质量工具的
  唯一配置权威。Workspace package MUST NOT 建立自己的格式或 lint 配置。
- `pnpm lint`、`pnpm format:check` 与 `pnpm check` MUST 对源码保持只读；其中 `pnpm lint`
  同时执行架构、workspace 命令一致性、Oxfmt、Oxlint 与 ESLint 检查，`pnpm check` 必须包含
  完整 `pnpm lint`。
- 只有显式写入命令 `pnpm format` 与 `pnpm lint:fix` 可以批量改写源码。不得把直接运行
  `pnpm exec oxfmt`、`oxlint --fix` 或 `eslint --fix` 当作提交前检查。
- 各 workspace package 的 `lint`、`lint:fix`、`format` 与 `format:check` 脚本 MUST 只委托
  根命令。在 package 或其功能子目录运行 `pnpm lint`，语义与仓库根目录完全相同；package
  范围的类型和测试命令仍可独立运行。
- 全仓 Oxfmt 基线必须保持通过。格式器解析版本由 `pnpm-lock.yaml` 锁定；版本或规则升级需要
  单独批次：更新 lockfile 与配置、生成一次机械格式提交并完成完整验证，不得与产品行为改动
  混在同一提交。

## 3. 以产品切片驱动实现

- 新能力 MUST 从一个可见、可验证的产品场景出发。
- 不得脱离当前消费者预建通用基础设施、未来协议或“也许会需要”的扩展点。
- 一个切片 SHOULD 同时包含必要的生产代码、测试和文档更新。
- 大功能 SHOULD 拆为可以独立理解、验证和回退的批次。
- 大规模重构 SHOULD 与行为变更分开；局部且直接服务当前实现的整理可以同批完成。
- 新公开 API SHOULD 在同一批次拥有真实消费者，不能只提交未使用的抽象。

如果实现前仍无法说明用户行为、权威数据、失败结果或生命周期，应先完成产品或架构讨论。

## 4. 依赖与模块边界

### 4.1 依赖方向

- 跨 workspace 依赖 MUST 从 `@seele-daw/<package>` package root 导入，并在消费者
  `package.json` 中声明。
- package 内部使用已配置的 `#internal/*`；Studio 使用 `@/*` 或 `~/*`。紧邻局部模块可用
  `./` 保留局部关系。
- 禁止用深层相对路径、公开 subpath 或别的 package 的私有 alias 绕过边界。
- package root 只导出稳定、确实需要的能力。不得为了测试或一次调用暴露内部写能力。
- 浏览器、Vue、Router、Pinia、IndexedDB、Web Audio 等平台细节不得反向进入
  `project-core`。

完整结构与依赖方向见 [README](./README.md) 和
[Architecture Brief](./docs/architecture/web-daw-architecture-brief.md)。

### 4.2 新模块与新 package

先把实现放在拥有该语义的最小现有模块中。只有满足以下条件时才考虑提升边界：

- 已有明确且稳定的职责；
- 当前存在真实消费者或替代实现；
- 独立后能减少错误依赖、隔离平台或明确生命周期；
- 公开 API 可以小而完整，不需要泄漏内部对象；
- 拆分收益大于构建、版本、测试和导航成本。

文件变长只是检查信号，不是拆分理由。组件或模块应按产品责任、状态所有权和变化原因拆分，
不能为了行数制造只做透传的碎片。

### 4.3 Studio 各层职责

`apps/studio/src` 按以下边界组织。所有 feature 的新增代码和相应模块的修改遵循同一规则，
既有模块随业务改动逐步调整，不为目录外观一致进行全仓机械迁移。

| 位置         | 职责及边界                                                           |
| ------------ | -------------------------------------------------------------------- |
| `bootstrap/` | 组合应用级服务，注入能力，定义创建失败回滚和最终释放顺序             |
| `workbench/` | Studio 应用用例、Action / Keyboard、Project 与 Playback 的应用层协调 |
| `features/`  | 可见功能、局部编辑目标、视图投影、Vue 组合与 UI 会话状态             |
| `ui/`        | 不依赖具体 feature 的基础控件、设计令牌和通知展示                    |
| `symbols.ts` | 稳定 InjectionKey 与唯一身份工厂，遵循本文 Symbol 注册约束           |

- 业务操作沿统一 Action、Coordinator 与 Project Command 路径执行；目录整理不得改变
  ProjectSession、History、Playback 或 Editor Session 的权威归属。
- Feature 可以组合其他 feature 明确提供的组件与契约，MUST NOT 导入对方私有 hooks、
  DOM refs 或内部状态对象。既存共享依赖必须在 README 中列明 owner，调整其归属时单独
  评估公共边界，不能通过搬目录悄悄更换状态权威。
- `ui/` 不反向依赖业务 feature；`workbench/` 的运行时服务不依赖功能组件。
  编译期类型引用与运行时依赖分别检查，不得借助 barrel 隐藏运行时循环。

### 4.4 Studio Feature 内部组织

先按功能归属，再按局部职责拆分。文件默认放在实际消费者的最小共同范围：

| 消费范围                      | 默认位置                                                |
| ----------------------------- | ------------------------------------------------------- |
| 单个文件内部                  | 当前文件内的私有类型、函数                              |
| 一个组件子模块内部            | `components/<submodule>/`，共置组件与私有实现           |
| 同一子模块的多个文件共享类型  | 该子模块的 `types/`                                     |
| 同一 feature 的多个子模块共享 | feature 层的具名职责目录，共享契约进入该层 `types/`     |
| 多个 feature 共用             | 按语义评估既有 `workbench/`、`ui/` 或明确的公共能力边界 |

- Feature 根层可保留少量清晰的页面或功能入口。复杂 UI 子模块使用
  `components/<submodule>/` 聚合，一个主组件与密切相关的文件共置；hooks 较多时使用
  局部 `hooks/`。MUST NOT 按 DOM 每层嵌套目录或为每个按钮建立目录。
- 多文件共享类型按概念放入最小共同范围的 `types/`，单文件私有类型留在原文件。
  不把所有类型堆入一个 `types.ts`，不从 `.vue` 实例类型反向推导公共能力。
- `types/` 可以共置契约需要的有限 discriminator 常量，但 MUST NOT 创建服务、执行订阅
  或加载运行时实现。类型依赖使用 `import type`。
- `state/` 只保存本 feature 拥有的轻量 UI Store；手势对象、Read Model、Renderer 不进入
  Store。`presentation/` 放投影、展示政策与主题读取；`interaction/` 放 Intent 提交适配。
  仅属于一个子模块的实现放在该子模块内。
- `actions/` 放 Action 定义与能力绑定，不另建快捷键系统，不绕过统一 Action 调用。
- 跨子模块共享的契约、Preferences、展示政策与 Action 留在 feature 层；相似代码不自动
  构成共享理由，也不得因此创建无 owner 的全局 `utils`。
- 小 feature MAY 保持简单结构，不复制完整目录模板、不预建空目录。出现不同消费者、
  生命周期或独立变化原因时，再建立对应子模块。

### 4.5 Studio 引用与阅读入口

- Studio 内跨目录导入使用 `@/`，相邻文件可用 `./`；跨 package 仍遵循 package root 边界。
- 子模块通过 Props / Emits、明确的 Handle 或共享契约协作，不相互导入私有 hooks。
- 不强制为每个目录创建 `index.ts`。确有公共能力边界时，入口 MUST 显式列出导出，
  不用 `export *` 汇总私有实现。既有 Keyboard 的 `index / setup / contracts` 边界继续遵循
  专项规则，不机械套用 feature 目录。
- 成熟 feature 的 README SHOULD 列出公开入口、职责地图、推荐阅读顺序、外部依赖及
  资源清理顺序；移动职责时同步更新。

## 5. 代码复用

### 5.1 复用顺序

实现新工具前依次检查：

1. JavaScript、TypeScript、DOM、Vue 或浏览器平台是否已有清晰能力；
2. 当前模块是否已经拥有同语义函数或类型；
3. 当前 workspace package 的 public API 是否已有能力；
4. 其他 workspace 是否有真正跨领域且允许依赖的公共工具；
5. 外部库是否能在可隔离边界内解决问题；
6. 最后才新增局部工具或共享抽象。

搜索到相似名字不等于可以复用。必须比较输入约束、失败语义、生命周期、身份和所有权。

### 5.2 语义重复与文本重复

应消除的是同一知识或同一产品规则的多份权威，例如：

- Action ID 与默认 Binding 的映射；
- Project File 协议字段；
- Track Color Palette；
- 数据库 schema version；
- 同一个领域值的解析和校验规则。

以下情况允许保留少量相似代码：

- 两处代码目前相似，但属于不同领域、会因不同原因变化；
- 提取 helper 会隐藏测试意图或关键业务步骤；
- 共享后需要大量 boolean、callback 或 mode 参数才能区分行为；
- 抽象名称只能叫 `common`、`shared`、`utils`、`manager` 等含糊词。

重复出现是提取的信号，不是自动命令。先确认同一语义和同一变化原因，再从最局部范围抽取。
测试代码尤其优先可读性；公共 fixture 或 builder 只能隐藏无关细节，不能隐藏被测行为。

### 5.3 `type-utils`

`@seele-daw/type-utils` 只收录纯编译期、跨领域、无运行时代码的类型代数。新增前必须遵循
[type-utils 收录规则](./packages/type-utils/README.md)，优先复用已有 `Brand` 与
`ValueOf`，不得在业务包重复定义等价工具。

普通运行时 helper 不得因为“多个地方可能使用”就进入 `type-utils`，也不得新建无所有者的
全局 `utils` 包。

## 6. 抽象与设计模式

### 6.1 引入抽象的有效理由

Interface、Port、Adapter、Factory、Coordinator 或 Strategy 至少应解决一个当前问题：

- 隔离第三方或平台 API；
- 保护领域层不依赖框架；
- 组合明确的资源生命周期；
- 协调多个权威之间的用例、失败和竞态；
- 支持当前已有的替代实现；
- 固定需要被测试的输入输出边界；
- 允许替换渲染、存储或输入 Adapter，同时保持 Common 语义。

“以后可能替换”“看起来更专业”或“测试里方便 mock”本身不是充分理由。

### 6.2 常见过度设计

- 只有一个简单调用，却增加 Interface → Implementation → Factory → Coordinator 链；
- 为尚未出现的 Track 类型、Renderer 或存储策略预建通用注册系统；
- 用继承树表达可以由判别联合或组合表达的有限状态；
- 为所有函数建立 class 或 service；
- 用事件总线隐藏本可显式调用的局部数据流；
- 为避免两三行清晰重复而引入难以命名的泛型 helper；
- 在没有基准证据时引入缓存、空间索引、Worker、虚拟化或 GPU 框架。

删除一层后如果所有权、失败和测试仍同样清楚，应优先更直接的设计。

### 6.3 项目中的专用角色

- **Factory**：负责验证、身份生成、依赖组合或资源创建；不应只是 `new` 的别名。
- **Coordinator**：负责跨权威用例、异步决策、失败解释或事务顺序；不应只是转发一个方法。
- **Binding / Adapter**：负责框架或平台转换；不得成为第二份业务权威。
- **Store**：只拥有被明确分配的状态；不得成为任意共享对象的容器。
- **Read Model / Scene**：是可丢弃投影；不得反向修改 Project facts。

## 7. 常量、配置与硬编码

“字面量存在于代码中”不等于硬编码。判断标准是该值是否承载需要统一维护的产品或协议知识。

### 7.1 必须集中管理

- 稳定 ID、协议 discriminator、数据库名称与 schema version；
- 默认 Keymap、Track Palette、Grid Preset 和其他跨 Feature 产品映射；
- 会被多个消费者使用或需要用户覆盖的默认值；
- 设计颜色、间距、圆角、层级、动效时长等视觉语义；
- 有单位、边界或算法含义的阈值；
- 同一值改变时必须同步修改多处的规则。

配置对象 SHOULD 使用准确类型、`satisfies`、readonly 或冻结快照，使新增 Action 或字段时由
类型检查暴露遗漏。

#### Symbol 注册与身份

- 生产 `Symbol()` 必须集中在所属 owner 的注册文件：Studio 的 `apps/studio/src/symbols.ts`、
  Editor 的 `packages/editor/src/common/interaction/interaction-symbols.ts`、Project Core 的
  `packages/project-core/src/project-symbols.ts`。新增 owner 时同步登记架构检查。
- 稳定的 InjectionKey / Sentinel 导出单个常量；Interaction、Pointer Capture、Keyboard
  Owner、History Content State 通过命名工厂每次创建新 Symbol。不能因统一注册而共享不同
  生命周期的身份，也不保存已生成 token 的全局表。
- 注册文件只允许 `import type`，不能加载消费者的运行时实现；生产代码不使用 `Symbol.for`。
  测试 fixture 可以直接创建独立 Symbol，标准 `Symbol.iterator` 等协议不受此限制。
- 注册表属于各自运行时边界，不进入纯类型的 `type-utils`，不扩大 package public API。

### 7.2 可以保持局部

- 数组首项 `0`、单步增量 `1` 等语义显然的语言操作；
- 只属于单个测试场景的输入值；
- 数学公式中已由变量名、单位或标准定义解释的数字；
- 不构成产品规则的一次性局部标签。

不要把每个数字或字符串都提升为远处常量，这会增加跳转成本并削弱上下文。项目不会仅为了
形式纯粹而全局启用 `no-magic-numbers`；应优先提取真正具有名称和统一修改需求的值。

## 8. TypeScript

### 8.1 类型表达

- 优先使用判别联合、穷尽分支、readonly 数据和准确返回类型表达状态。
- 具有相同运行时表示但不能互换的领域值 SHOULD 使用共享 `Brand`。
- 配置完整性优先使用类型注解或 `satisfies`，不要用对象整体 `as SomeType` 掩盖缺失字段。
- 外部数据、持久化数据和用户输入必须在边界解析；解析后内部代码消费已验证类型。
- `unknown` 应在靠近来源处收窄，不能沿多层以 `any` 传播。

### 8.2 类型断言

`as` 和非空断言不会执行运行时检查，SHOULD NOT 作为修复类型错误的捷径。允许的典型场景：

- 验证器成功后把值提升为 Brand；
- 第三方库类型与已验证运行时事实之间的窄 Adapter；
- TypeScript 无法表达但可由局部不变量证明的转换。

断言必须集中在最小边界；理由不明显时添加英文注释，并由类型测试或运行时测试覆盖。不允许把
任意用户字符串直接断言为已验证类型。

### 8.3 控制流与数据演进

- 禁止嵌套三元表达式；复杂条件使用 guard、`if`、`switch` 或命名函数。
- 分支应该让成功路径和失败路径容易追踪，避免多层嵌套。
- 不要在多个 mapper 中逐字段手写“是否完全相等”来决定复用旧对象；类型增加字段时这种逻辑
  容易静默过期。应集中投影、比较明确的版本/身份，或让构造结果成为唯一权威。
- 不要为了 immutable 外观到处浅拷贝。只在权威边界、公开快照或确有隔离需求时创建冻结结果。
- 错误类型应表达稳定 code 与必要 context；用户可修正错误和开发配置错误不能混为一类。

## 9. Vue 与 Studio 状态

### 9.1 状态与依赖归属

选择 Local Ref、Props / Emits、Typed Context 或 Pinia 前，必须先确定权威和生命周期。完整
规则见 [Studio Vue 状态与依赖组合准则](./apps/studio/docs/vue-state-composition-guidelines.md)。

补充要求：

- `ProjectSession`、History、dirty、IndexedDB、Playback Runtime 和 pending resolver 不进入
  Pinia 或 Vue 深代理。
- 纯派生数据优先 `computed`，不要用 `watch` 把一个响应值手动同步到另一个响应值。
- `watch` / `watchEffect` 适用于命令式副作用、订阅、Renderer 调用和资源重建；必须明确
  cleanup、触发源、flush 时机和竞态策略。目标变化时，必须明确取消、重建、Selection
  协调和旧回调失效分别由谁负责。
- Composition Root 创建并释放应用级 Service、Coordinator、Binding 和浏览器资源。
- Vue 组件不直接拥有 Project Command 之外的领域写能力。
- 组件应按产品责任拆分。除样式外，单个组件的 template 与逻辑接近 800 行时必须重新评估，
  但不得为了数字合规制造无语义的透传组件。

### 9.2 组件、Hook、Class 与纯函数

| 形式              | 应拥有的职责                                             | 应避免的问题                                     |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Vue 组件          | 模板、局部 DOM refs、Props / Emits、无障碍语义与组合顺序 | 内嵌完整输入协议、提交事务和大量几何计算         |
| Hook / Composable | Vue 响应式适配、订阅、监听和局部资源组合                 | 将整个组件脚本搬入一个巨大 `useSurface()`        |
| Class             | 独立会话、状态转换、资源身份与明确生命周期               | 为无状态计算建立空壳 class，或复制 Editor 状态机 |
| 普通函数          | 投影、几何、解析和不可变输入到输出的转换                 | 只为统一名称而加 `use` 前缀或读取全局组件状态    |

- 每个 hook SHOULD 能用一句话说明职责。参数只传所需 refs、getter 或能力，不传包含整个
  feature 状态与 setter 的大 Context；只读观察值和修改能力分开暴露。
- Hook 与 Class 都不得成为第二份 Project、Playback 或 Editor 权威。Class 负责独立状态与
  生命周期，Hook 负责 Vue 适配，纯计算保持普通函数；不为统一形式强制使用某一种。
- 子组件按完整视觉区域提取，区域样式随 owner 移动，布局协调样式留在父组件。
  SHOULD NOT 用大量 `:deep()` 控制子组件内部，也不得为缩短文件把内聚样式移入无关全局文件。
- 基础按钮、菜单、下拉框遵循 Studio `ui/` 的组件政策，子组件不另建控件皮肤或 Action
  路由。拆分共享控件时，原 owner 继续拥有 Action Target，不重复注册。

## 10. Project、Editor 与浏览器边界

- `ProjectSession` 是可保存 Project facts、History 和 content identity 的权威。
- UI 操作通过 Project Command 修改事实；Commit 后重新读取权威结果。
- Selection、Tool、Drag Preview、Zoom 和面板状态属于 Editor / UI，会话结束即可丢弃。
- Read Model、Scene、DOM、Canvas bitmap 和缓存只保存可重建投影。
- Browser Adapter 必须把 DOM、Pointer、Keyboard、IndexedDB 或 Canvas 细节转换为稳定项目
  契约；Common 与 Project Core 不依赖 `HTMLElement`、Vue 或浏览器事件。
- 性能优化必须先有目标场景和基准。Renderer 决策遵循
  [Piano Roll Note Renderer 决策](./packages/editor/docs/piano-roll-note-renderer-decision.md)。

## 11. 生命周期、异步与清理

- 注册 Listener、Subscription、Observer、Timer 或外部资源的 API MUST 返回 disposer，或由
  明确 owner 提供统一 `dispose()`。
- disposer SHOULD 幂等；部分创建失败时必须回滚已经创建的资源。
- Studio Hook 的独立订阅可以绑定 Vue scope 清理。多个资源有依赖顺序时，组件或具名组合
  入口 MUST 显式安排 `mount / dispose`，不能依赖多个 `onMounted` 的偶然注册顺序。
  组合入口的 `dispose` 必须幂等，初始化失败按创建顺序逆序回收；释放后的排队任务必须失效，
  不得继续操作旧 DOM 或旧会话。
- 异步请求必须定义重复请求、过期结果、取消、释放和错误传播语义。
- Promise resolver 不得放入 Pinia，也不得在组件卸载或应用释放后悬挂。
- latest-request-wins、队列、拒绝并发或合并请求必须由用例明确选择，不能依赖偶然时序。
- 保存、导航、Command 或持久化失败不得通过修改 UI 镜像伪装成功。

## 12. 测试

- 测试产品行为、领域不变量、边界协议、失败恢复和资源释放，不只覆盖实现行。
- 生产逻辑改变时，同批更新能在逻辑损坏时真正失败的测试。
- 测试应能从用例主体看出 Given / When / Then；避免跨多层 helper 才能理解输入。
- 少量重复如果能让测试意图更直接，可以保留。共享 helper 只抽取稳定且无关的机械细节。
- 测试 support、fixture、fake 和 fault injection 只放在 `__tests__/support` 或
  `__tests__/fixtures`，不得进入生产目录或 package root。
- Studio 组件与 feature 的既有行为测试保留在 feature 的 `__tests__/`；独立子模块的新测试
  MAY 放局部 `__tests__/`。优先沿用行为测试验证组织重构，只为缺失的边界或失败路径新增
  用例，不为搬目录机械迁移测试，也不编写镜像 Hook 内部方法的测试。
- 生产模块不得为了测试暴露额外写入口。
- 时间、随机身份、浏览器资源和调度器在需要确定性时通过已有 Port 注入。

Project Core 的具体目录约定见
[Project Core 测试目录约定](./packages/project-core/src/__tests__/README.md)。

## 13. 注释、命名与文档

### 13.1 命名

- 名称必须表达领域角色、单位、所有权或动作，不依赖调用者猜测。
- 避免无语义的 `data`、`item`、`value`、`common`、`utils`、`manager`；局部上下文完全明确时
  可使用简短名称。
- 文件名长度不设硬限制；只要能提高搜索、导入和脱离目录后的可读性，可以合理重复父目录的
  领域限定词。不得仅为统一命名风格机械重命名存量文件，也不得为缩短名称改成含糊词。
- 模块文件持续增加或开始包含不同变化原因、依赖方向和生命周期时，必须及时评估是否按内聚
  职责划分子目录，避免目录长期无边界平铺；同时不得只为增加层级建立无稳定职责的单文件目录。
- `packages/project-core/src/commands/` 根层不放置 `.ts` 源码；跨命令共享协议与错误属于
  `protocol/`，准备结果与穷尽分派属于 `preparation/`，领域 handler、validation 及局部协作者
  进入以产品职责命名的功能目录。新增命令不得重新在 commands 根层创建平铺文件，该边界由
  架构检查执行。
- ID、Command type、Action ID 与 protocol field 一旦持久化或跨边界，就视为稳定契约。

Studio 的人工维护代码采用以下约定：

| 对象                   | 约定                           | 示例                                     |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| 普通目录               | kebab-case                     | `track-surface/`、`sustain-pedal/`       |
| Vue 组件文件与组件标识 | PascalCase，多词且有业务辨识度 | `ProjectPianoRollTrackSurface.vue`       |
| 普通 TS 文件           | kebab-case，表达概念与职责     | `track-placement.ts`                     |
| Composable 文件 / 函数 | `use-xxx.ts` / `useXxx`        | `use-track-follow.ts` / `useTrackFollow` |
| TS 类型与 Class        | PascalCase                     | `TrackPlacementPreview`                  |
| 普通函数与变量         | camelCase                      | `resolvePlacement`、`activeClipId`       |
| 稳定枚举式常量、注册键 | UPPER_SNAKE_CASE               | `PIANO_ROLL_TOOL`                        |
| 普通 TS 测试           | 对应文件名 + `.spec.ts`        | `track-placement.spec.ts`                |
| Vue 组件测试           | 保留对应组件名 + `.spec.ts`    | `ProjectPianoRollTrackSurface.spec.ts`   |

`README.md`、`index.ts`、框架入口和生成文件遵循其用途；Vue 组件测试是普通 TS 文件采用
kebab-case 的明确例外。上述约定是本项目选择，不是前端行业统一标准；Vue 的 `useXxx`
约定针对函数，并不要求文件名也采用 camelCase。

- 跨 feature 的公开组件、类型和能力保留领域限定词，例如 `PianoRollSustainPedalLaneHandle`。
- 组件私有文件 MAY 省略外围 `studio / project / piano-roll` 前缀，保留局部领域与角色。
  例如 `components/track-surface/hooks/use-track-follow.ts`，不机械堆叠为
  `use-project-piano-roll-track-surface-timeline-follow.ts`。
- 名称应在文件搜索、编辑器标签和 import 中仍可辨认，不要求全仓唯一；也不统一缩成
  `types.ts / state.ts / helpers.ts / use-interaction.ts` 等缺乏业务范围的名称。
- 必要的职责迁移可同步精简私有文件名，公开 Vue 组件名保持业务辨识度；不因此发起存量文件
  的纯风格全量重命名。

### 13.2 注释

- 生产代码中的必要注释使用英文。
- 注释解释原因、竞态、不变量、单位、平台限制或非显然取舍，不逐句翻译代码。
- 如果一段代码必须靠长注释才能解释控制流，优先简化代码。
- TODO 必须说明缺失行为或解除条件，不能只写模糊的 “refactor later”。

### 13.3 文档

- 用户可见功能或产品规则变化更新 [PRODUCT](./PRODUCT.md)。
- 设计令牌、交互语义和无障碍规则更新 [DESIGN](./DESIGN.md)。
- 状态所有权、协议或跨模块长期决定更新专项文档或 ADR。
- 阶段计划记录范围和批次，不应成为已经实现功能的唯一说明。
- 删除或替换实现时同步清理过期文档，不保留与现状冲突的“历史真相”。

## 14. 评审检查表

提交评审前回答：

### 需求与正确性

- 这批代码解决哪个当前产品行为？
- 权威状态在哪里？失败、Undo / Redo、保存和释放后会怎样？
- 是否存在竞态、过期结果或部分成功？

### 简洁性

- 删除一层 Interface、Factory、Coordinator 或 Store 后是否仍同样清楚？
- 是否实现了没有当前消费者的扩展能力？
- helper 是减少知识重复，还是仅减少文本重复？

### 类型与配置

- 是否复用了已有 `Brand`、`ValueOf`、Parser、Command 或设计令牌？
- 任意 `as` 是否位于已验证边界且理由明确？
- 新增字段后，配置、映射、比较和投影能否由类型检查暴露遗漏？
- 产品规则是否散落为多个字符串或数字？

### Vue 与生命周期

- 这项状态应该是 Local、Props、Context、Pinia、Editor 还是 Project fact？
- `watch` 是否用于必要副作用，而不是复制派生状态？
- Listener、Subscription、Observer 与 pending Promise 是否完整清理？

### 测试与文档

- 测试会在行为损坏时失败吗？用例主体是否容易理解？
- 是否把测试帮助代码留在测试目录？
- `PRODUCT.md`、`DESIGN.md`、README 或架构决定是否需要同步？
- 是否运行了与风险相称的验证？

## 15. 外部参考

以下文档提供原则参考，但 Seele DAW 的明确规则和自动化检查优先：

- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
  — 简洁性、避免推测性过度工程、测试和注释；
- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
  — 自包含、可验证、可回退的变更批次；
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
  — TypeScript 类型断言、命名、控制流与可读性；
- [Vue Style Guide](https://vuejs.org/style-guide/)
  — Vue 组件的错误预防和一致性建议；
- [Vue：SFC 文件命名](https://vuejs.org/style-guide/rules-strongly-recommended.html#single-file-component-filename-casing)
  与[紧密关联的子组件命名](https://vuejs.org/style-guide/rules-strongly-recommended.html#tightly-coupled-component-names)
  — 一致的大小写和有意义的组件前缀；
- [Vue：Composable 命名](https://vuejs.org/guide/reusability/composables.html#naming)
  — `useXxx` 函数命名约定；
- [Angular：Coding Style Guide](https://angular.dev/style-guide)
  — kebab-case 文件命名的生态参考，不作为 Vue 的强制规则；
- [Google Testing Blog: Tests Too DRY? Make Them DAMP!](https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html)
  — 测试可读性与复用的取舍；
- [typescript-eslint: no-magic-numbers](https://typescript-eslint.io/rules/no-magic-numbers/)
  — magic number 自动检查的能力与配置边界；
- [Linux kernel coding style](https://docs.kernel.org/process/coding-style.html)
  — 简单控制流、短职责函数和避免技巧性表达式的工程取向。
