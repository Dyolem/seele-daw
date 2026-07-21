# ProjectFileDTO V1 读取校验计划

## 目标

本阶段在已实现的 `ProjectSnapshot -> ProjectFileDTO` 写出边界之后，建立对称的第一段读取边界：

```text
external unknown
-> decodeProjectFileDTO
-> detached, deeply frozen ProjectFileDTO V1
-> future domain normalization / ModelStore / ProjectSession
```

输入是不可信的 `unknown`，可能来自 `JSON.parse()`、IndexedDB structured clone、Worker 消息或测试 fixture。输出是经过运行时结构校验、重新取得容器所有权并深度冻结的当前 V1 DTO。

本阶段不创建领域 Record、ModelStore 或 ProjectSession，也不把结构校验误当成跨实体语义校验。

本计划描述统一 [Seele Project File Format V1](./project-file-format-v1.md) 的 reader 分支。Decoder 与 Snapshot projector 共享一份方向无关的持久化协议，不把导入实现当成第二份文件格式。

## 边界分层

项目文件读取长期保持以下顺序：

```text
JSON text / structured clone
-> syntax or transport decoding
-> ProjectFileDTO version dispatch and structural validation
-> ordered migrations
-> current DTO domain normalization
-> cross-entity invariant validation
-> ProjectSession composition
```

`decodeProjectFileDTO(input: unknown)` 从第二层后的 `unknown` 开始。它不接受 JSON text，因为核心文件协议不应与单一传输编码绑定。未来的 JSON codec 可以在语法解析后调用同一解码器。

## V1 严格结构规则

V1 按当前 `ProjectFileDTO` 显式校验每个字段：

- object 必须是普通对象或 null-prototype object，不接受 Class instance、Map、Set、Date 或数组代替 object；
- object 只能拥有 enumerable string data property，不触发 getter，不接受 symbol、accessor 或 non-enumerable 协议字段；
- 每个协议 object 都必须拥有完整必填字段，并拒绝未声明字段；
- `formatVersion` 必须严格等于 `1`；
- Track 只允许 `instrument` / `audio`，Clip 只允许 `midi`；
- JSON number 必须有限；Tick、MIDI 整数、拍号整数与 Device definition version 在协议形状上必须是安全整数；
- 实体表的 property key 必须与记录内部 `id` 一致；
- Device `parameters` 必须是 JsonObject，`opaqueState` 必须是 JsonValue 或 null；
- 输入不能包含循环引用、稀疏数组或 JSON 无法表达的值。

空 ID、Tick 正负、gain 范围、Note 越界、Track / Clip 外键、Timeline 初始事件和 Device 拓扑属于后续领域工厂与 `InvariantValidator` 边界。解码器不重复实现这些领域规则。

## 未知字段和扩展区

V1 拒绝未知协议字段。向 Project、Track、Clip 等对象增加持久化字段需要显式的格式演进，不通过默默忽略 typo 或未知内容获得伪向前兼容。

Device `parameters` 和 `opaqueState` 是协议明确的 opaque JsonValue 扩展区，其嵌套 object key 不应用 ProjectFileDTO 字段表限制，但仍必须完整通过 JsonValue 校验。

## requiredFeatures

`requiredFeatures` 是必须理解才能安全编辑文件的稳定 capability ID 集合，不是 Device `typeId`。V1 当前支持集为空：

- feature ID 必须是非空 string；
- 重复 feature ID 使文件结构无效；
- 任何非空的当前未知 feature 使可写解码失败；
- 只读检查或降级打开等产品语义留到能够组合 Session 状态后设计。

## 版本路由与迁移

当前只有真实 V1：

- `formatVersion === 1` 进入 V1 解码器；
- 数字但不支持的版本抛出稳定 `unsupported-format-version`；
- 缺失或非数字版本按结构错误处理。

本阶段不伪造 V0 / V2，也不建立没有真实输入的通用 migration registry。第一次出现 V2 时，同时加入 V1 golden fixture、V1 validator、纯函数 V1 -> V2 migration 和 ordered runner。

## 所有权、冻结与安全 key

解码成功后：

- 所有 DTO object、entity table、array 和嵌套 JsonValue 都是新容器；
- 所有输出容器递归 `Object.freeze`；
- 修改、删除或替换原始输入不影响已解码 DTO；
- entity table 和 JsonObject 通过 own data property 创建 key，使 `__proto__` 和 `constructor` 等 opaque string 不触发原型语义；
- entity table 和 JsonObject key 按字符串稳定顺序复制，但仍不宣称输出是未来 checksum 的 canonical JSON encoding。

## 错误协议

`ProjectFileValidationError` 是本阶段公开的失败边界，提供：

- 稳定 `code`；
- frozen 结构化 `path: readonly (string | number)[]`；
- `expected` / `actual` 诊断描述；
- 可选 feature ID、table key 和 entity ID。

路径使用片段而不是一个自行拼接的字符串，使包含点、方括号或 `__proto__` 的 opaque ID 仍然没有歧义。结构校验确定性 fail-fast；后续跨实体不变量仍由 `InvariantValidator` 聚合违规。

## 模块与公开边界

```text
src/persistence/
├── project-file-dto.ts
├── project-file-v1-protocol.ts
├── project-file-projector.ts
├── project-file-projection-error.ts
├── project-file-decoder.ts
└── project-file-validation-error.ts
```

package root 新增公开：

- `decodeProjectFileDTO(input: unknown)`；
- `ProjectFileValidationError`；
- 稳定错误码、详情与路径类型。

ModelStore seed normalizer、Session loader、migration runner、JSON text codec 和 storage adapter 均不公开也不在本阶段创建。

## 测试边界

- projector 输出及其 `JSON.stringify` / `JSON.parse` 结果可成功解码；
- 静态 V1 golden JSON 可成功解码，并与当前 complete fixture 的 writer 投影等价；
- 解码结果与输入深度相等，但不共享任何复合引用并且深度冻结；
- 原输入在解码后继续修改不影响 DTO；
- 必填字段、未知字段、错误类型、非有限数、非安全整数与未知判别值失败关闭；
- 不支持的 format version、重复 / 未知 required feature 使用独立错误码；
- entity table key / `id` 不一致失败；
- Device JsonValue 中的 symbol、accessor、稀疏数组、循环引用和非 JSON 值失败；
- `__proto__` 实体 ID 和 JsonObject key 作为安全 own property 往返保留；
- 错误 path 准确指向失败字段。

## 完成边界

完成 V1 读取校验后停止等待审阅。不连续实现 DTO -> domain normalize、ProjectSession 加载、IndexedDB 或 migration。

## 实施结果

本阶段已于 2026-07-21 按上述边界完成：

- package root 已公开 `decodeProjectFileDTO(input: unknown)`、`ProjectFileValidationError` 及错误协议类型；
- 已建立规范性 [Seele Project File Format V1](./project-file-format-v1.md)，持久化 property、JSON 类型、数值单位、跨实体关系和版本演进不再依赖当前运行时命名；
- 包内 `PROJECT_FILE_V1_PROTOCOL` 通过 exact mapped field map 与每个 DTO interface 对齐，decoder 直接消费该运行时协议；
- 静态 complete-project V1 golden JSON 不由当前 projector 动态生成，并在测试中同时校准 reader 和 writer；
- 解码器以 `formatVersion` 优先分流，对 V1 执行严格字段、判别联合、有限数 / 安全整数、entity key / ID 和 required feature 校验；
- object 只接受可检查的 enumerable string data property，accessor 不会被调用；
- Device JsonValue 会拒绝 symbol、accessor、稀疏数组、循环引用和非有限数；
- 输出 DTO 完全重建并深度冻结，entity table 与 JsonObject 安全保留 `__proto__` 等 opaque key；
- 结构校验不越界处理 ID 空值、数值业务范围或跨实体不变量；
- Project Core 基线为 22 个测试文件、333 项测试。
