# 小型实体、组合边界与模型演进

本文记录 Seele DAW 开发过程中，由 `ProjectRecord` 为什么只有 `id` 和 `name` 引出的架构思考。它讨论的不是如何让接口永远不变，而是如何划分实体职责，使数据模型能够在需求不断增加时继续受控演进。

核心结论是：

> 先按照身份、生命周期和修改边界拆分领域模型，再决定使用值对象嵌套还是实体 ID 引用。接口不需要在第一天穷举未来字段，但概念边界必须足够清楚，使新增功能能够落到正确的位置。

## `ProjectRecord` 不是整个项目对象树

当前模型中的 `ProjectRecord` 很小：

```ts
interface ProjectRecord {
  readonly id: ProjectId
  readonly name: string
}
```

它表达的是“项目自身的元数据实体”，而不是包含全部 Track、Clip、Note 和 Device 的大型根对象。

完整项目状态在概念上由规范化实体集合组成：

```ts
interface ProjectDocument {
  readonly project: ProjectRecord
  readonly tracks: Readonly<Record<TrackId, TrackRecord>>
  readonly clips: Readonly<Record<ClipId, ClipRecord>>
  readonly midiSources: Readonly<Record<MidiSourceId, MidiSourceRecord>>
  readonly devices: Readonly<Record<DeviceId, DeviceRecord>>
}
```

这里的 `ProjectDocument` 只是用于说明层次的概念名称，不代表当前已经确定的公开 API。运行时的 `ModelStore` 可以使用私有 Map 和有序 ID 集合，持久化层则会使用适合校验、迁移和 JSON 序列化的 DTO。

两个层次回答不同的问题：

- `ProjectRecord` 回答“项目自身有哪些属性”；
- 完整模型回答“构成这个项目的所有实体当前是什么状态”。

如果把后者全部嵌入 `ProjectRecord`，它会迅速变成一个大型对象树：

```ts
interface OversizedProjectRecord {
  readonly id: ProjectId
  readonly name: string
  readonly tracks: readonly TrackRecord[]
  readonly clips: readonly ClipRecord[]
  readonly devices: readonly DeviceRecord[]
}
```

这种结构会带来一系列耦合：

- 修改一个 Note 时，概念上的更新路径需要穿过整棵项目树；
- Track、Clip 和 Device 的身份被对象嵌套位置间接定义；
- 移动、复制和删除实体时，需要同步维护多个父子关系；
- 高频 Note 编辑与低频项目元数据共享同一个更新边界；
- Undo、Snapshot、增量通知和引用相等判断的变化范围被放大；
- 新增 Automation、Asset 或其他领域概念时，根对象会持续吸收职责。

因此，`ProjectRecord` 当前只有两个字段，不代表项目永远只有两个属性。它代表目前已经确认属于 Project 实体本身的事实只有这两个字段，其余事实由各自的实体或值对象拥有。

## 不是为了“小”而拆分

小型 Record 只是边界划分后的结果，不是独立目标。把每个字段都拆成单独类型或实体，同样会造成过度设计。

判断一个概念放在哪里，需要关注三类边界。

### 身份边界

如果一份数据拥有稳定且独立的领域身份，就更适合成为实体：

- Track 由 `TrackId` 标识；
- Clip 由 `ClipId` 标识；
- MidiSource 由 `MidiSourceId` 标识；
- Device 由 `DeviceId` 标识。

实体即使被修改、移动或重新排序，身份仍然保持不变。数组下标、对象路径和 UI 位置都不能代替这种身份。

### 生命周期边界

如果一个概念可以独立创建、删除、复制、移动或被其他实体引用，它通常需要独立存储。

相反，如果一组字段始终由父实体完整拥有，与父实体一起创建和销毁，就更适合作为嵌套值对象。例如 `ChannelStripDescriptor` 没有独立 ID，也不需要脱离 Track 单独存在，因此直接组合在 Track 中更自然。

### 修改边界

如果一份数据体量很大、修改频繁，或需要单独生成增量和 Undo，它通常不应被埋入一个低频更新的大型根对象。

MIDI Note 是典型例子：项目名称很少修改，但一次钢琴卷帘编辑可能改动大量 Note。将两者放入同一深层对象树，会让无关数据共享更新成本和变更范围。

## 值对象嵌套与实体 ID 引用并存

规范化模型不要求所有关系都变成 ID。当前设计同时使用值对象组合和实体引用。

### 直接嵌套值对象

```ts
interface TrackBase {
  readonly id: TrackId
  readonly name: string
  readonly channel: ChannelStripDescriptor
}
```

适合直接嵌套的结构通常具有以下特征：

- 没有独立领域身份；
- 不会被多个实体共享引用；
- 不需要独立选择、排序、创建或删除；
- 与父实体具有相同生命周期；
- 体量较小，整体替换能够清楚表达一次修改。

### 通过 ID 引用实体

```ts
interface InstrumentTrackRecord {
  readonly instrumentDeviceId: DeviceId
  readonly midiEffectIds: readonly DeviceId[]
  readonly audioEffectIds: readonly DeviceId[]
}
```

适合使用 ID 引用的结构通常具有以下特征：

- 拥有独立身份和生命周期；
- 需要在独立实体表中查询；
- 可能被替换、移动、排序或单独删除；
- 需要独立验证、持久化或产生 Undo 变化；
- 关系本身具有顺序或所有权语义。

因此，设计原则不是“尽量嵌套”，也不是“尽量规范化”，而是：

> 有独立身份和生命周期的数据进入实体表，并通过 ID 建立关系；没有独立身份、由父实体完整拥有的小型数据使用值对象组合。

## 新需求首先判断它是不是新概念

接口演进时，最危险的习惯是把每项新功能都直接加到已有根接口上。面对一个新字段，首先需要判断：

1. 它是否描述 Project 自身？
2. 它是否只是现有实体不可分割的一组属性？
3. 它是否已经形成拥有独立规则和生命周期的新领域概念？
4. 它是否只是 UI、Runtime、缓存或派生状态，而不是项目事实？

例如，简单的项目描述可能适合扩展 `ProjectRecord`。但 Tempo Map 包含有序事件、时间规则和独立编辑语义，它更可能成为独立模型结构，而不是不断向 `ProjectRecord` 增加 `bpm`、`timeSignature` 和 `tempoEvents`。

同样，Selection、播放头、Canvas 坐标和 AudioNode 即使与当前项目有关，也不属于持久化 Project Record。它们应由 Editor Session 或 Runtime 的生命周期对象拥有。

新增功能不一定意味着扩展旧接口；它也可能意味着新增实体、值对象、判别联合分支、派生索引或外部协作者。

## 大型项目如何管理接口演进

大型项目无法消除数据结构变化，只能让变化变得明确、局部、可验证和可迁移。

### 稳定边界，而不是冻结字段

早期设计最值得稳定的是：

- 哪些概念是独立实体；
- 哪些关系由哪一侧保存；
- 哪些数据是权威项目事实；
- 哪些数据只是派生索引或运行时状态；
- 哪个模块拥有写权限和校验责任。

字段可以随着产品需求增长，但如果这些边界稳定，新增字段通常只是局部变化。如果概念边界错误，即使第一版字段看似完整，后续也会通过双写、循环引用和跨层依赖偿还成本。

### 通过工厂集中构造规则

`createProjectRecord()` 的价值不在于少写一次对象字面量，而在于建立统一的领域入口：

```ts
const project = createProjectRecord({
  id,
  name,
})
```

以后字段发生变化时，工厂可以集中负责：

- 默认值；
- 运行时校验；
- 字符串或数值规范化；
- 防御性复制；
- 创建输入到完整 Record 的转换。

领域输出类型可以保持严格，而创建输入可以根据产品语义允许省略某些值：

```ts
interface CreateProjectRecordInput {
  readonly id: ProjectId
  readonly name: string
  readonly color?: ProjectColor | null
}

interface ProjectRecord {
  readonly id: ProjectId
  readonly name: string
  readonly color: ProjectColor | null
}
```

工厂把省略的 `color` 规范化为 `null`，使创建后的领域实体始终具有确定形状。

### 区分添加字段和修改语义

接口变化至少有三种不同风险：

- 增加一个具有明确默认值的字段；
- 增加一个必须由旧数据推导或人工决定的字段；
- 改变已有字段的含义、单位或所有权。

第一种通常可以由工厂和迁移补齐。第二种需要明确迁移策略。第三种风险最高，因为名称未变不代表语义兼容，必须同时审查序列化、Undo、命令、查询和消费者契约。

例如，把存储增益从线性值改成分贝，不只是 TypeScript 类型调整，它会改变旧工程文件中每个数值的解释方式。此类变化必须被视为 schema 语义迁移。

### 为持久化格式建立版本和迁移

TypeScript 接口只描述当前代码期望的数据，不能让历史文件自动符合新接口。持久化边界需要显式版本：

```ts
interface SerializedProjectV1 {
  readonly schemaVersion: 1
  // V1 fields
}

interface SerializedProjectV2 {
  readonly schemaVersion: 2
  // V2 fields
}
```

加载流程应当是：

```text
外部未知数据
-> 按 schemaVersion 校验
-> 逐版本迁移到当前 DTO
-> 转换并校验当前领域模型
-> 建立可重建索引和 Runtime 状态
```

迁移函数需要可测试、确定且不依赖 UI。保存时只写当前版本，读取时负责兼容受支持的历史版本。

### 不用可选字段掩盖迁移问题

面对旧数据缺少新字段时，把领域字段全部写成可选很方便：

```ts
interface ProjectRecord {
  readonly color?: ProjectColor
}
```

但如果当前业务要求每个 Project 都有明确的颜色语义，这会把一次迁移问题扩散为所有消费者永久处理 `undefined` 的问题。

使用可选字段或 `null` 应当表达真实领域语义：

- 业务上确实允许不存在：使用可选字段或 `null`；
- 只有历史数据缺失：由迁移补齐；
- 创建时允许省略、创建后必须确定：输入可选，Record 输出必填。

可选性不是兼容策略的替代品。

### 使用判别联合管理类型扩展

Track 和 Clip 这类存在不同拓扑或语义分支的概念，适合通过判别联合演进：

```ts
type TrackRecord = InstrumentTrackRecord | AudioTrackRecord
```

增加新分支时，TypeScript 能够暴露需要重新审查的穷尽分支。新增字段则应放在真正共享的 Base 或特定分支中，不能为了减少重复把只属于一种 Track 的字段提升到所有 Track。

### 用测试保护不变量，而不只保护形状

接口类型只能证明字段形状，无法完整证明领域关系。模型演进时需要同时保护：

- 工厂的本地值域校验；
- ID 集合的唯一性和顺序语义；
- 跨实体引用与所有权规则；
- 旧 schema 到当前 schema 的迁移结果；
- 判别联合的合法组合；
- Snapshot 或序列化往返的一致性。

一次接口扩展只有在这些规则仍然成立时，才算完成。

## 接口扩展的审查清单

向领域模型增加字段或类型前，可以依次检查：

1. 这是权威项目事实、派生数据，还是 UI/Runtime 状态？
2. 它属于现有实体，还是已经形成新的领域概念？
3. 它有没有独立身份、生命周期、选择或 Undo 语义？
4. 它应该作为小型值对象嵌套，还是通过 ID 引用独立实体？
5. 关系的权威方向在哪里，是否正在制造双写？
6. 创建工厂需要增加什么默认值和本地校验？
7. 跨实体不变量应由谁验证？
8. 旧项目文件如何迁移，新字段是否真的允许缺失？
9. Command、History、Snapshot、Query 和 Playback 哪些契约会受影响？
10. 是否需要新增判别联合分支，而不是向所有类型添加无意义字段？

## 对当前实现的约束

基于以上原则，当前阶段保持以下决定：

- `ProjectRecord` 只保存已经确认属于项目自身的 `id` 和 `name`；
- Track、Clip、MidiSource、Note 和未来 Device 分别拥有自己的实体记录；
- `ChannelStripDescriptor` 作为没有独立身份的值对象嵌入 Track；
- Device 通过 `DeviceId` 被 Track 引用，不把设备内容嵌入 Track；
- 完整工程状态将由 `ModelStore` 和持久化 DTO 组织，而不是把全部实体塞入 `ProjectRecord`；
- 新字段先确认所有权和生命周期，再修改权威模型文档与实现；
- 持久化格式确定后，所有不兼容演进必须通过 schema version 和迁移处理。

这里追求的不是一个永远不需要修改的接口，而是一套能够明确回答“变化应该发生在哪里”的模型。大型项目的可扩展性，来自边界内允许演进、边界间保持清晰，而不是在第一版中猜出所有未来字段。
