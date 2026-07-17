# @seele-daw/type-utils

`type-utils` 是 Seele DAW 的纯编译期类型工具叶子包。它只拥有与具体业务领域无关、在多个 package 中可复用的 TypeScript 类型代数，不提供运行时函数、常量、状态或平台能力。

## 当前工具

- `Brand<Value, Name>`：为已有运行时值增加编译期 nominal identity；
- `ValueOf<ObjectType>`：取得对象属性值类型的联合，并保留条件类型对联合输入的分发语义。

所有调用方只允许从 `@seele-daw/type-utils` 的 package root 导入。

## 本次全仓审计

已经抽取：

- `Brand`：原位于 `project-core/model`，实际被 ID、MIDI 标量、Tick、Tempo、Time Signature 和 ModelRevision 共同使用；
- `ValueOf`：原在 Project Command 和 Project Mutation 判别词汇中重复定义。

保留在领域模块：

- `EntityMutation`：绑定 Project Mutation 词汇、identified Record 和 inverse 语义；
- `TablePatch`：绑定写前投影的 overlay、删除标记和实体遍历规则；
- `ProjectCommandBase`：绑定 Project Command envelope；
- `TimeSignatureDenominator` 等索引访问联合：属于领域事实，不是通用类型工具；
- 测试 fixture 的 `ReturnType`：使用 TypeScript 内建工具，没有自定义抽取价值。

## 收录规则

新增工具必须同时满足：

- 完全是类型级定义，编译后不产生运行时代码；
- 不引用 Project、Editor、Playback、Audio 或浏览器领域类型；
- 至少存在明确的跨模块复用，或已经出现等价重复定义；
- 名称和语义能够独立说明，不能成为 `shared` / `utils` 式杂项收容；
- 具有类型测试，覆盖关键赋值关系或条件类型行为。

`Brand` 的 `Name` 是 nominal domain 的一部分。跨 package 新增 Brand 时应使用稳定、具有领域区分度的名称，避免两个无关概念复用相同 Value 与 Name。
