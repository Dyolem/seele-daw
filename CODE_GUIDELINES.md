# Seele DAW 工程代码准则

> Status: Normative
>
> Scope: `apps/`、`packages/` 与 `tooling/` 中所有人工维护的生产代码、测试和工程文档
>
> Last updated: 2026-07-28

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

| 问题                                         | 主要执行者                             |
| -------------------------------------------- | -------------------------------------- |
| 格式、未使用代码和常见语法问题               | Oxlint、ESLint、Prettier compatibility |
| 类型安全、项目引用和 Vue 模板类型            | TypeScript、`vue-tsc`                  |
| Workspace 依赖、私有别名和测试反向依赖       | `tooling/architecture-rules`           |
| 行为、不变量、失败恢复和生命周期             | 自动化测试                             |
| 抽象是否必要、命名是否准确、状态归属是否合理 | 设计与代码评审                         |

不要在本文档中规定空格、分号、引号或 import 排序等格式细节。若规则会产生大量误报，也不要
为了“更严格”而强行加入 lint；应先证明它能识别项目中的真实缺陷。

提交前至少运行与改动风险相称的检查。跨 package、状态权威、持久化或生产组合变更默认运行
`pnpm check`；纯文档变更至少运行链接、格式和 `git diff --check` 等适用检查。

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

选择 Local Ref、Props / Emits、Typed Context 或 Pinia 前，必须先确定权威和生命周期。完整
规则见 [Studio Vue 状态与依赖组合准则](./apps/studio/docs/vue-state-composition-guidelines.md)。

补充要求：

- `ProjectSession`、History、dirty、IndexedDB、Playback Runtime 和 pending resolver 不进入
  Pinia 或 Vue 深代理。
- 纯派生数据优先 `computed`，不要用 `watch` 把一个响应值手动同步到另一个响应值。
- `watch` / `watchEffect` 适用于命令式副作用、订阅、Renderer 调用和资源重建；必须明确
  cleanup、触发源和竞态策略。
- Composition Root 创建并释放应用级 Service、Coordinator、Binding 和浏览器资源。
- Vue 组件不直接拥有 Project Command 之外的领域写能力。
- 组件应按产品责任拆分。除样式外，单个组件的 template 与逻辑接近 800 行时必须重新评估，
  但不得为了数字合规制造无语义的透传组件。

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
- [Google Testing Blog: Tests Too DRY? Make Them DAMP!](https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html)
  — 测试可读性与复用的取舍；
- [typescript-eslint: no-magic-numbers](https://typescript-eslint.io/rules/no-magic-numbers/)
  — magic number 自动检查的能力与配置边界；
- [Linux kernel coding style](https://docs.kernel.org/process/coding-style.html)
  — 简单控制流、短职责函数和避免技巧性表达式的工程取向。
