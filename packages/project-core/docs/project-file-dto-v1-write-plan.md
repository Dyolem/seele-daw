# ProjectFileDTO V1 写出边界计划

## 目标

本阶段定义 Seele DAW 第一版公开项目文件数据格式，并建立确定性的 `ProjectSnapshot -> ProjectFileDTO` 单向投影。DTO 是 JSON 友好、版本化、与运行时 ModelStore 分离的纯数据，不包含 Class、Map、Brand capability、History、QueryIndex、Subscription 或写权限。

```text
ModelStore
-> ProjectSnapshot(modelRevision)
-> ProjectFileDTO(formatVersion 1)
-> future serializer / checksum / storage adapter
```

本阶段只建立可信 Snapshot 的写出边界。外部 `unknown` 数据的 schema validation、迁移、语义 normalize 和 Session 加载属于下一独立模块，不能因为 TypeScript 定义存在就直接 cast 文件输入。

## 为什么 DTO 不直接等于 Snapshot

Snapshot 服务当前运行时消费者，携带本地 `modelRevision`，按 ModelStore 的规范化表表达全部项目事实，并允许共享逻辑不可变的领域 Record。ProjectFileDTO 服务跨 Session、跨版本和跨实现的长期数据交换：

- 文件必须使用无 Brand 的 string / number / boolean / null；
- 本地 `modelRevision` 不能跨 Session 恢复；
- Note 在文件中嵌套到所属 MidiSource，运行时再规范化为分区表；
- Device 参数和 opaque state 必须成为 DTO 自己拥有的 JSON 值；
- 文件格式演进由 `formatVersion` 和 ordered migration 管理；
- DTO 结构可以为了兼容而与高频内存结构不同。

因此保存是显式字段投影，不调用 `JSON.stringify(ModelStore)`，也不把 Snapshot 接口本身承诺为永久文件格式。

## 版本词汇

V1 使用：

```ts
const PROJECT_FILE_FORMAT_VERSION = 1
```

字段名选择 `formatVersion`，与 MIDI Project Model V1 和长期架构文档保持一致。它描述整个项目文件格式，不是 `modelRevision`、Device `definitionVersion`、Journal sequence 或 cloud version。

当前 V1 `requiredFeatures` 固定为空 frozen 数组。Device `typeId` 标识可保留的设备实现，不等同于项目文件格式 feature。未来只有当某个文件结构或语义需要客户端显式声明支持时，才由投影器根据内容生成稳定 feature ID。

## V1 顶层结构

```ts
interface ProjectFileDTO {
  readonly formatVersion: 1
  readonly requiredFeatures: readonly string[]
  readonly projectId: string
  readonly name: string
  readonly trackOrder: readonly string[]
  readonly tracks: Readonly<Record<string, TrackDTO>>
  readonly clips: Readonly<Record<string, MidiClipDTO>>
  readonly midiSources: Readonly<Record<string, MidiSourceDTO>>
  readonly tempoEvents: Readonly<Record<string, TempoEventDTO>>
  readonly timeSignatureEvents: Readonly<Record<string, TimeSignatureEventDTO>>
  readonly devices: Readonly<Record<string, DeviceDTO>>
  readonly master: MasterChannelDTO
}

interface MidiSourceDTO {
  readonly id: string
  readonly lengthTick: number
  readonly notes: Readonly<Record<string, MidiNoteDTO>>
}
```

Track 保留 `instrument` / `audio` 判别联合，Clip V1 只有 `midi` 分支。DTO 显式展开 Channel、Loop、Note、Tempo、Time Signature、Device 和 Master 字段，不复用领域 Record 类型；这样后续领域类型演进不会无意中修改文件协议。

## 字典与 opaque ID 安全

沿用已确定的 JSON object entity table，而不是在本阶段改成数组。每张表同时使用属性 key 和 DTO 自身 `id`，未来加载器必须验证两者一致。

Opaque ID 允许 `__proto__`、`constructor` 和纯数字字符串等普通值。投影器不能用 `table[id] = value`，因为特殊 key 可能触发原型语义；必须通过 `Object.defineProperty` 创建 enumerable own data property，并在完成后冻结 table。

输出使用普通 `Object.prototype` 对象，能够被原生 `JSON.stringify` 处理。字典枚举顺序不构成领域语义；投影器按 Snapshot 的规范顺序访问实体，嵌套 JsonObject key 也在复制前排序。未来 checksum 或跨语言字节级一致性仍需独立 canonical JSON serializer，不能把普通对象枚举偶然当成永久哈希协议。

## DTO 所有权与冻结

ProjectFileDTO 是新的值边界，不共享 Snapshot 中的复合容器：

- 所有 DTO object、entity table 和数组都重新创建并运行时冻结；
- Track / Master 的 Device ID 数组重新复制；
- Channel 和 Clip Loop 重新创建；
- Device `parameters` 与 `opaqueState` 先通过 JsonValue 边界重新校验、深复制，再递归冻结；
- string、number、boolean 和 null 直接复用值。

这与 Snapshot 共享领域 Record 的策略不同。DTO 可能被交给序列化器、Worker 或外部适配器，必须与当前 Session 的 Record 引用完全解耦。

## MIDI Note 分区投影

Snapshot 中 Source 与 Note partition 分开保存；DTO 把 Note table 嵌入对应 `MidiSourceDTO.notes`：

```text
snapshot.midiSources[sourceId]
+ snapshot.midiNotePartitions[sourceId]
-> dto.midiSources[sourceId] { id, lengthTick, notes }
```

投影器必须拒绝：

- 重复的 entity ID；
- 重复的 Note partition；
- Source 缺少对应 partition；
- 没有 Source 的孤立 partition。

正常 Session Snapshot 已由 ModelStore 不变量保证不会出现这些情况；失败关闭仍能防止结构化伪造的 Snapshot 静默生成丢失内容的文件。

## 确定性边界

相同项目事实必须生成深度相等的 DTO。当前确定性来自：

- Snapshot 已规范化实体与 Timeline 顺序；
- projector 按输入顺序建立 entity tables；
- Device JsonObject key 递归排序；
- 顶层字段使用固定声明顺序；
- 不写入时间戳、随机 ID、modelRevision 或运行环境信息。

本阶段验证原生 `JSON.stringify(dto)` 对等价 Snapshot 产生相同文本，但不把该文本声明为未来 checksum 的 canonical encoding。

## 模块位置与公开边界

```text
src/persistence/
├── project-file-dto.ts
├── project-file-projection-error.ts
└── project-file-projector.ts
```

package root 公开：

- `PROJECT_FILE_FORMAT_VERSION`；
- ProjectFileDTO 及全部组成 DTO 类型；
- `createProjectFileDTO(snapshot)`；
- `ProjectFileProjectionError` 及稳定错误码。

本阶段没有 ProjectFile parser、validator、migration registry、ModelStore loader 或浏览器存储端口。

## 测试边界

- 完整 fixture 的全部字段与 V1 format version；
- `modelRevision`、History、Index 和订阅状态不进入 DTO；
- 输出可由原生 JSON stringify / parse 无损往返；
- DTO 全部自有 object / array / table 运行时冻结且不共享复合 Record；
- Track / Clip 判别分支、Note 分区嵌套和 Device JsonValue 深复制；
- 等价 Snapshot 与不同嵌套 JsonObject 插入顺序产生相同 DTO / JSON；
- `__proto__` 等 opaque ID 作为普通 own property 安全保留；
- 重复、缺失和孤立 Note partition 失败关闭；
- projector 不从 Snapshot 写入 `modelRevision`。

## 本阶段不包含

- 将 JSON text 或 `unknown` cast / validate 为 ProjectFileDTO；
- 历史 format version、ordered migrations 或 golden legacy files；
- DTO -> domain Record -> ModelStore -> ProjectSession 加载；
- requiredFeatures capability negotiation 或只读打开模式；
- canonical JSON、checksum、压缩、加密或 Project Bundle；
- IndexedDB、OPFS、File System API、Journal 或 checkpoint adapter。

## 完成边界

完成 ProjectFileDTO V1 写出边界后停止等待审阅，不连续实现加载、schema validation、迁移或浏览器持久化。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- package root 已公开 `PROJECT_FILE_FORMAT_VERSION`、ProjectFileDTO V1 组成类型、`createProjectFileDTO(snapshot)` 和投影错误；
- V1 已显式覆盖 Project、Track order、两种 Track、MIDI Clip / Loop、MidiSource / Note、Tempo、Time Signature、Device 和 Master；
- DTO 使用 primitive 和普通 object table，Note 嵌套到 Source，本地 `modelRevision` 与全部 Session-only 状态被省略；
- DTO 顶层、entity table、record、数组、Channel、Loop 和 Device JsonValue 均重新创建并递归冻结；
- Entity table 通过 own data property 安全保留 `__proto__` 等 opaque ID，Device JsonObject key 递归规范排序；
- 重复 entity、重复/缺失/孤立 Note partition 会以稳定 `ProjectFileProjectionError` 失败关闭；
- 等价 Snapshot 产生深度相等且原生 JSON 文本相同的 DTO，已投影 DTO 不受后续 Project Commit 影响；
- Project Core 基线为 21 个测试文件、321 项测试。
