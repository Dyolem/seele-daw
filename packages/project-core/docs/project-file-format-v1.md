# Seele Project File Format V1

## 协议状态

本文档是 Seele DAW 历史 `formatVersion: 1` 项目文件的规范性协议。它定义持久化字段、JSON
形状、数值单位、引用关系和兼容规则，不定义 ModelStore、ProjectSnapshot 或任意其他运行时
对象的内部布局。当前 writer 已输出 V2；严格 V1 reader 仍受支持，合法 V1 会确定性迁移为
当前 V2 DTO。

本协议一旦用于真实项目文件，V1 的以下内容必须保持稳定：

- property 名称、JSON 类型与必填性；
- discriminator 字符串；
- 数值单位和 null 语义；
- entity table key / `id` 对应关系；
- ordered collection 的顺序语义；
- 未知字段、未知 feature 和未知版本的处理方式。

不兼容变化必须定义新 `formatVersion` 和单向 migration，不能保持 `formatVersion: 1` 同时修改 V1 含义。

## 协议与运行时模型

Project File Format 不承诺与当前 TypeScript 领域 Record 同名或同构。运行时字段重命名、容器替换或类型名调整不得自动修改 V1；写出 projector 和读取 normalizer 负责显式映射。

```text
Runtime -> Snapshot -> current V2 Projector -> Project File Format V2

Project File Format V1 -> strict V1 Decoder -> V1-to-V2 Migration -> Runtime
Project File Format V2 -> strict V2 Decoder -----------------------> Runtime
```

这是一份方向无关的持久化协议，不是导出和导入各自拥有一份格式：

- `ProjectSnapshot` 是特定 `modelRevision` 的运行时视图，是 writer 的可信输入，不是可版本化文件；
- 历史 V1 projector 的字段映射由本协议与 golden 固定；当前 projector 写 V2，不再生成 V1；
- V1 decoder 按本协议校验外部数据，随后 V1-to-V2 migration 和 domain normalizer 创建当前
  运行时模型；
- Snapshot 可以随 package 运行时需求演进，但不能借此静默修改已发布的 V1 字段。

例如，运行时将 `TrackRecord.name` 重命名为 `displayName` 时，V1 文件仍使用 `name`，只调整两侧映射。

## 协议校准机制

文档不能单独保证实现正确。历史 V1 由以下四层共同校准：

1. **规范文档**：本文档供人工审阅字段和语义。
2. **编译期字段校准**：`project-file-v1-protocol.ts` 使用 mapped type 将 V1 运行时字段集与对应 DTO interface 对齐；漏字段、多字段和重命名会使类型检查失败。
3. **运行时协议校验**：`decodeProjectFileDTO(input)` 直接消费该 V1 字段集和判别值，对每份外部数据执行严格校验，不进行 TypeScript cast。
4. **历史兼容校准**：静态 V1 golden JSON 不由当前 projector 动态生成，必须始终能被当前
   reader 解码，并迁移为与原有事实等价、每个 Source 带空 CC64 Event 表的当前 DTO。

编译期校准只能检测 property 集与 TypeScript 形状偏移；数值单位、范围、外键和所有权等语义仍必须由运行时解码、领域工厂、`InvariantValidator` 和 golden 测试共同保护。

所有外部读取都必须通过 decoder。当前 Writer 从已验证的 ModelStore / Snapshot 边界生成 V2
DTO，通过 DTO 返回类型、完整投影测试和 V2 golden 校准保证协议一致，不在每次保存时再次
调用 decoder 复制整个大型项目。

## JSON 数据模型

V1 描述 JSON 数据，不在本版本固定文本编码、空白、object key 字节顺序或 checksum 算法。未来 canonical JSON 编码属于独立协议层。

因此本协议回答“项目数据是什么”；未来 serializer / bundle 协议另行回答 UTF-8、canonical key ordering、空白、checksum 输入字节、压缩、文件扩展名和 MIME 等“数据如何编码成字节”的问题。它不是第二份 ProjectFileDTO 协议。

- number 必须有限；
- 标记为 integer 的字段必须是 JavaScript 安全整数；
- array 必须稠密，不带自定义 property；
- object 只包含 enumerable string data property；
- `undefined`、BigInt、Symbol、function、accessor、Class instance、Date、Map、Set 和循环引用不是 V1 数据；
- protocol object 拒绝本文档未声明的 property；
- Device JsonValue object 是显式 opaque 扩展区，其 key 不受 protocol object 字段列表限制；
- `__proto__`、`constructor` 和纯数字字符串都可以是合法 opaque ID 或 JsonObject key，必须作为 own data property 处理。

## 通用标量

### Opaque ID

Project、Track、Clip、MidiSource、Note、Device、Tempo Event 和 Time Signature Event ID 都是非空 opaque string：

- 不允许首尾空白或控制字符；
- 不表达数组下标、所有者路径或实体类型；
- entity table 的 key 必须与对象内部 `id` 完全相同；
- Note ID 在整个项目内唯一，不只是在单个 MidiSource 中唯一。

### Tick

- 项目 PPQ 固定为 `960`，不在文件中保存；
- Tick 是非负安全整数；
- duration / span 字段必须大于 `0`；
- 时间区间使用半开区间 `[start, end)`；
- 所有 Tick 加法结果也必须是安全整数。

### Name 与 Color

- Project、Track 和 Clip `name` 为非空白、1 到 128 个 Unicode 字符；
- `color` 为规范化 `#RRGGBB` 或 `null`；
- Clip `color: null` 表示显示时继承 Track 颜色，Track `color: null` 表示使用产品默认色。

## 顶层对象

V1 顶层对象只允许以下必填 property：

| Property              | JSON 类型           | 语义                                          |
| --------------------- | ------------------- | --------------------------------------------- |
| `formatVersion`       | integer literal `1` | 整个项目文件格式版本                          |
| `requiredFeatures`    | string array        | 打开并写回文件时必须支持的 capability ID 集合 |
| `projectId`           | string              | Project opaque ID                             |
| `name`                | string              | Project name                                  |
| `trackOrder`          | string array        | Track ID 的唯一语义顺序                       |
| `tracks`              | entity table        | Track table                                   |
| `clips`               | entity table        | Clip table                                    |
| `midiSources`         | entity table        | MidiSource table，Note 嵌套于 Source          |
| `tempoEvents`         | entity table        | Tempo Event table                             |
| `timeSignatureEvents` | entity table        | Time Signature Event table                    |
| `devices`             | entity table        | Device Descriptor table                       |
| `master`              | object              | Master channel                                |

Entity table 是 JSON object，其每个 property key 是实体 ID，value 是含有相同 `id` 的实体对象。Entity table property 枚举顺序不是领域语义。

## Track

### ChannelStripDTO

| Property | JSON 类型             | 语义                   |
| -------- | --------------------- | ---------------------- |
| `gain`   | finite number `0..4`  | 线性增益，`1` 为 unity |
| `pan`    | finite number `-1..1` | 声像                   |
| `muted`  | boolean               | Track 静音             |
| `soloed` | boolean               | Track solo 事实        |

### InstrumentTrackDTO

| Property             | JSON 类型                      |
| -------------------- | ------------------------------ |
| `id`                 | string                         |
| `kind`               | literal `"instrument"`         |
| `name`               | string                         |
| `color`              | string or null                 |
| `channel`            | ChannelStripDTO                |
| `audioEffectIds`     | ordered unique Device ID array |
| `midiEffectIds`      | ordered unique Device ID array |
| `instrumentDeviceId` | Device ID string               |

### AudioTrackDTO

| Property         | JSON 类型                      |
| ---------------- | ------------------------------ |
| `id`             | string                         |
| `kind`           | literal `"audio"`              |
| `name`           | string                         |
| `color`          | string or null                 |
| `channel`        | ChannelStripDTO                |
| `audioEffectIds` | ordered unique Device ID array |

V1 允许保留 Audio Track 形状，但当前没有 AudioClip 分支。MIDI Clip 只能引用 Instrument Track。

## MidiClip

MidiClipDTO 只允许以下必填 property：

| Property           | JSON 类型           | 语义                        |
| ------------------ | ------------------- | --------------------------- |
| `id`               | string              | Clip ID                     |
| `kind`             | literal `"midi"`    | Clip discriminator          |
| `trackId`          | string              | 所属 Instrument Track ID    |
| `name`             | string              | Clip name                   |
| `color`            | string or null      | `null` 表示继承 Track 颜色  |
| `muted`            | boolean             | Clip 静音                   |
| `startTick`        | integer             | 项目时间线起点              |
| `spanTick`         | positive integer    | 项目时间线窗口长度          |
| `sourceId`         | string              | 独占 MidiSource ID          |
| `sourceOffsetTick` | integer             | Clip 起点对应的 Source 位置 |
| `loop`             | MidiLoopDTO or null | 循环参数                    |

MidiLoopDTO 只包含：

| Property          | JSON 类型        | 语义              |
| ----------------- | ---------------- | ----------------- |
| `sourceStartTick` | integer          | Source 内循环起点 |
| `sourceSpanTick`  | positive integer | Source 内循环长度 |

非循环 Clip 的 Source 窗口必须完整落在 Source 内。循环区域必须完整落在 Source 内，`sourceOffsetTick` 必须位于循环区间。

## MidiSource 与 MidiNote

MidiSourceDTO 只包含：

| Property     | JSON 类型             |
| ------------ | --------------------- |
| `id`         | string                |
| `lengthTick` | positive integer      |
| `notes`      | MidiNote entity table |

MidiNoteDTO 只包含：

| Property       | JSON 类型 | 范围 / 语义           |
| -------------- | --------- | --------------------- |
| `id`           | string    | Note ID               |
| `startTick`    | integer   | `>= 0`，相对于 Source |
| `durationTick` | integer   | `> 0`                 |
| `pitch`        | integer   | `0..127`              |
| `velocity`     | integer   | `1..127`              |
| `channel`      | integer   | `0..15`               |

Note 不重复保存 `sourceId`；它所在的 `MidiSourceDTO.notes` table 表达所有权。Note 区间必须完整落在 Source `[0, lengthTick)` 内。

V1 中每个 MidiClip 独占一个 MidiSource，每个 MidiSource 被且仅被一个 MidiClip 引用。

V1 不包含 `sustainPedalEvents`，也不持久化其他 MIDI CC。严格 V1 decoder 会拒绝提前出现的
V2 字段；通过校验后，V1-to-V2 migration 为每个 Source 添加空踏板事件表，不猜测踏板状态，
也不修改 Note Duration。当前扩展见 [Seele Project File Format V2](./project-file-format-v2.md)。

## Timeline

TempoEventDTO 只包含：

| Property | JSON 类型              |
| -------- | ---------------------- |
| `id`     | string                 |
| `tick`   | non-negative integer   |
| `bpm`    | finite number `5..999` |

TimeSignatureEventDTO 只包含：

| Property      | JSON 类型                   |
| ------------- | --------------------------- |
| `id`          | string                      |
| `tick`        | non-negative integer        |
| `numerator`   | integer `1..32`             |
| `denominator` | one of `1, 2, 4, 8, 16, 32` |

Tick `0` 必须恰好存在一个 Tempo Event 和一个 Time Signature Event；同类事件在相同 Tick 最多一个。V1 Tempo 是 step change，不表达 ramp。

## Device

DeviceDTO 只包含：

| Property            | JSON 类型           | 语义                                                     |
| ------------------- | ------------------- | -------------------------------------------------------- |
| `id`                | string              | Device ID                                                |
| `typeId`            | string              | 小写 namespaced Device type ID，例如 `seele.basic-synth` |
| `definitionVersion` | safe integer `>= 1` | Device Definition 状态版本                               |
| `enabled`           | boolean             | Device bypass / enabled 事实                             |
| `parameters`        | JsonObject          | Parameter ID 到 JsonValue，必须无损保留                  |
| `opaqueState`       | JsonValue or null   | Device 定义拥有的 opaque state                           |

`parameters` 的 key 必须是合法 Parameter ID。项目文件加载时即使当前环境没有对应 Device 实现，也不能丢弃未知 `parameters` 或 `opaqueState`。

每个 Device ID 必须恰好出现在一个 Track 或 Master 设备位置中。具体 MIDI Effect、Instrument 和 Audio Effect 角色兼容需要 Device Definition Catalog，不由 V1 JSON 形状自行推断。

## Master

MasterChannelDTO 只包含：

| Property         | JSON 类型                      |
| ---------------- | ------------------------------ |
| `gain`           | finite linear gain `0..4`      |
| `muted`          | boolean                        |
| `audioEffectIds` | ordered unique Device ID array |

Master 不进入 `tracks` 和 `trackOrder`，也不拥有 `soloed`。

## requiredFeatures

`requiredFeatures` 作为无序、不重复的非空 string 集合解释。它只声明不理解就不能安全写回文件的文件格式能力，不声明 Device `typeId`。

V1 当前支持集为空。任何非空 `requiredFeatures` 都必须阻止当前客户端将文件作为可写 ProjectSession 打开。未来只读检查不改变这条可写兼容规则。

## 跨实体不变量

一份结构合法的 V1 DTO 只有在以下领域关系同时成立时才能创建可写 Session：

1. `trackOrder` 与 `tracks` table 的 ID 完全对应，每个 ID 恰好一次。
2. 每个 Clip 引用存在且类型兼容的 Track。
3. 每个 MidiClip 引用存在的 MidiSource。
4. Clip 的 Source 窗口或 Loop 区域位于 Source 内。
5. 每个 MidiSource 被且仅被一个 MidiClip 引用。
6. 所有 Note 位于所属 Source 范围内，Note ID 在项目内唯一。
7. Tick `0` 存在唯一初始 Tempo 和 Time Signature，同类 Timeline 事件不共享 Tick。
8. 每个 Device Descriptor 拥有唯一 Track 或 Master 拓扑位置，所有 Device 引用存在。
9. 不存在孤立 Source、Device 或悬空外键。

V1 decoder 负责 JSON 形状与实体 key / ID。领域 Record 工厂负责 ID、数值范围和局部规则。`InvariantValidator` 负责需要观察多张表的关系。三层全部成功后才能创建可写 ProjectSession。

## 版本演进

- writer 只写当前格式版本；
- reader 先读取 `formatVersion`，再路由到对应版本 decoder；
- 历史 decoder 在仍支持该版本时保持不变；
- migration 是从一个已校验历史 DTO 到下一版 DTO 的确定性纯函数；
- 任何数字但不支持的 `formatVersion` 必须失败关闭；
- migration 失败不能覆盖原文件；
- 字段重命名、必填字段新增、判别值新增以及同类型数值语义改变都必须评估新 `formatVersion`。

### Track 演进决策

V1 Track 是封闭的 `instrument | audio` 判别联合，每个分支也拒绝未知 property。因此：

- 新增会持久化为新 `kind` 的 Group、Folder、Return 或其他 Track 分支必须定义晚于当前版本的
  新格式；
- 向现有 Instrument / Audio Track 增加新必填持久化字段也必须升级格式；
- 只是运行时 Record 重命名、缓存、索引或 UI 临时分组不修改文件格式；
- 能够完整由现有 Instrument / Audio Track 与 Device 结构表达的产品能力通常不需要新 Track 分支。

`requiredFeatures` 不是规避 `formatVersion` 的手段。只有当当前版本 schema 已经知道如何解析并无损保留一种结构时，feature ID 才能表明客户端是否理解其必需语义。V1 并不知道第三种 Track 形状，因此新 Track discriminator 必须升级版本。

## V1 参考实现与兼容样本

- DTO 类型：`src/persistence/project-file-dto.ts`
- 可执行字段协议：`src/persistence/project-file-v1-protocol.ts`
- 版本路由与运行时解码：`src/persistence/project-file-decoder.ts`
- V1 到 V2 迁移：`src/persistence/project-file-v1-to-v2-migration.ts`
- 当前领域映射：`src/persistence/project-file-normalizer.ts`
- fresh Session 加载：`src/persistence/project-file-loader.ts`
- 当前 V2 写出投影：`src/persistence/project-file-projector.ts`
- 静态兼容样本：`src/__tests__/fixtures/project-files/v1/complete-project.json`
- 当前协议：[Seele Project File Format V2](./project-file-format-v2.md)

参考实现可以重构，但本协议和已发布 golden 数据不能因运行时模型重构而被静默改写。
