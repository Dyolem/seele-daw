# ProjectQuery / MIDI Note QueryIndex 基础层计划

## 目标

本阶段为 ProjectSession 建立首个正式只读边界，并为当前 MIDI Note Command 纵向切片提供可重建、revision-consistent 的内存索引。

Query 定义调用方可以观察什么以及结果语义；QueryIndex 只是 Query 的包内性能实现。ModelStore 仍是唯一权威事实，索引不进入项目文件、History 或 Snapshot，也不向包外暴露可变容器。

## 为什么现在建立

当前 ProjectSession 已具备 Command、Commit、History 和原子写入能力，但包外不能读取私有 ModelStore。若 Editor、Playback 或 Studio 在 Query 契约出现前取得内部 Map，后续索引、订阅和存储替换都会被具体容器结构锁定。

ProjectDelta 已能完整表达 Note Add / Remove / Update 的 before / after Record，因此现在也具备在模型写入前准备增量索引 transition 的稳定输入。此时建立 revision 对齐和失败回滚协议，比多个消费者接入后再补充更安全。

## 本地内存边界

本阶段使用数据库领域的通用数据结构思想，但不引入后端数据库或浏览器持久化：

```text
ModelStore                    权威内存实体表
ProjectQuery                 公开只读请求
QueryIndex                   可丢弃、可重建的内存次级索引
ProjectQueryResult           某一 modelRevision 的只读投影
ProjectFileDTO / IndexedDB   后续独立持久化边界
```

代码中使用 Query Result / Read Model 一词，避免把它与 Vue View 或 SQL View 混为一谈。

## 首批公开 Query

### 单 Note 查询

输入：

```text
sourceId + noteId
```

输出携带查询时的 `modelRevision` 和 `MidiNoteRecord | undefined`。Source、分区或 Note 不存在时返回 `undefined`，因为 UI 在一次删除提交后短暂持有旧实体 ID 是正常读取状态。

### MIDI Note 范围查询

输入：

```text
sourceId
[startTick, endTick)
[minimumPitch, maximumPitch]
```

规则：

- Tick 使用非空半开区间，要求 `endTick > startTick`；
- Note 的 `[note.startTick, note.endTick)` 与查询区间相交即命中；
- Pitch 是离散 MIDI 值，使用闭区间；
- Source 或 Note 分区不存在时返回 frozen 空数组；
- 结果按 `[startTick, pitch, noteId]` 稳定排序；
- 结果外壳和数组运行时冻结，领域 Record 保留当前 ModelStore 引用；
- 结果携带 `modelRevision`，调用方不需要分别读取 Session revision 再猜测一致性。

Query 使用带稳定 `type` 的只读 descriptor 和工厂函数；ProjectSession 只增加一个泛型 `query(query)` 入口，不为每种读取持续增加专用方法。包内执行边界重新规范化结构化输入，不能只信任 TypeScript 类型。

无效 Tick / Pitch / ID 值继续由领域 parser 拒绝；Tick 或 Pitch 上下界关系错误、未知 Query 判别由 `ProjectQueryError` 使用稳定错误码拒绝，不自动交换或 clamp。

## 扫描基准

包内保留直接从 ModelStoreReader 执行相同 Query 的扫描路径。它有两个真实职责：

- QueryIndex revision 与 ModelStore 不一致时提供正确的降级读取；
- 作为索引增量更新和 rebuild 的等价性基准。

扫描路径不从 package root 导出，也不为了测试放进生产模型目录。

## MIDI Note 索引结构

首版按 MidiSource 分区：

```text
QueryIndexRoot(modelRevision)
└── partitions: Map<MidiSourceId, MidiNotePartitionIndex>
    ├── byId: Map<NoteId, MidiNoteRecord>
    ├── byStart: readonly MidiNoteRecord[]
    └── prefixMaxEnd: readonly Tick[]
```

`byId` 支持单 Note O(1) 查找。`byStart` 按公开结果顺序排列；`prefixMaxEnd[i]` 保存 `0..i` Note 的最大结束 Tick。

范围查询先二分得到：

- `byStart.startTick < query.endTick` 的候选右边界；
- `prefixMaxEnd > query.startTick` 的候选左边界；

再在候选段执行准确的区间相交与 Pitch 过滤。最坏情况仍可能因一枚极长 Note 扩大候选段，但常规查询不再固定扫描整个 Source；内部结构可以根据 100k Note benchmark 替换，而不改变公开 Query。

## Rebuild 与增量维护

QueryIndex 构造和显式 rebuild 都从 ModelStoreReader 全量创建新 root，完成后一次替换旧 root。重建失败不得破坏旧索引。

普通提交、Undo 和 Redo 已经在写入前得到 ProjectDelta。QueryIndex 按 Delta 的 before / after Record 验证当前索引前置条件，只复制 partitions 外层 Map、受影响 Source 的 `byId` Map，并重建该 Source 的排序数组与 prefixMaxEnd。未变化 Source 的分区引用保持不变。

当前 ProjectChange 只有 Note 变化。未来新增 Clip、Track 或 Device Change 时，必须显式增加对应索引分支；不能让未知变化静默通过并返回陈旧结果。

## Revision 与原子 transition

QueryIndex root 始终携带自己对应的 `modelRevision`。正常 Session 状态必须满足：

```text
ModelStore.modelRevision === QueryIndex.modelRevision
```

Session 在权威写入前完成：

```text
prepare Commit / Delta
-> prepare History transition
-> prepare QueryIndex transition and next root
-> stage QueryIndex root
-> stage History heads
-> MutationApplier.apply(plan)
   ├── success -> return already prepared result
   └── failure -> rollback History -> rollback QueryIndex -> rethrow
```

stage 只替换包内引用，在同步单写者 apply 期间不会向外发布。全部 Map、数组、结果和回滚闭包都在模型写入前分配；revision 成功写入后仍保持 bare return。

若包内调用在异常恢复场景发现 Index revision 落后于 ModelStore，Query 必须使用扫描路径，不能返回陈旧索引结果；下一次 prepare 可以先 rebuild 当前 Store 再生成增量 transition。

## 模块位置与公开边界

```text
src/queries/
├── project-query.ts
├── project-query-error.ts
├── midi-note-query-semantics.ts
├── project-query-executor.ts
└── query-index.ts
```

package root 只公开：

- Query 判别常量；
- 两种 Query descriptor、input、result 类型；
- Query 工厂；
- ProjectQueryError 及其公开错误类型；
- ProjectSession 的 `query()`。

QueryIndex、索引 root / partition、扫描 executor、transition 和 rebuild 保持包内。

## 测试边界

- Query factory 与包内规范化拒绝非法范围和未知判别；
- 单 Note 的存在、不存在和 Record 引用语义；
- Tick 半开区间相交、包含视口的长 Note、Pitch 闭区间和稳定排序；
- frozen Query / result / result array 与 modelRevision；
- 初始 rebuild、增量 Add / Move / Remove、Undo / Redo 的索引结果等于扫描结果；
- no-change 不推进模型或索引 revision；
- apply 失败时模型、History 和 QueryIndex transition 一起恢复；
- 索引 revision 落后时扫描降级仍返回当前模型；
- QueryIndex 和扫描 executor 不从 package root 导出。

## 本阶段不包含

- Clip、Track、Tempo、Device、Asset 或 Automation QueryIndex；
- ChangePublisher、listener、topic / entity / range subscription；
- Vue selector、shallowRef 或 Editor Render Primitive；
- ProjectSnapshot、ProjectFileDTO、IndexedDB、OPFS 或 Journal；
- 通用数据库查询语言、任意 predicate callback 或可写 Read Model；
- 分页、窗口缓存和 benchmark 驱动的数据结构替换。

## 完成边界

完成 MIDI Note ProjectQuery / QueryIndex 模块后停止等待审阅，不连续实现订阅、Snapshot 或其他实体索引。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- package root 已公开两种 frozen MIDI Note Query descriptor、revisioned result、工厂、判别常量和类型化错误；
- ProjectSession 已加入泛型 `query(query)`，QueryIndex、扫描 executor、root、partition 和 transition 保持包内；
- 单 Note 查询保持 Record 引用，范围查询实现半开 Tick 相交、闭区间 Pitch 和 `[startTick, pitch, noteId]` 稳定排序；
- QueryIndex 已实现按 Source 分区的 ID Map、startTick 排序数组和 prefixMaxEnd 二分候选；
- Index 支持全量 rebuild、ProjectDelta 增量 copy-on-write root、revision 落后时扫描降级，以及索引前置条件漂移时 rebuild 后重试；
- 普通 Command、Undo 和 Redo 在模型写入前一起 stage History / QueryIndex transition，apply 失败时恢复两者；
- 权威写入故障注入已收敛到 `src/__tests__/support/`，不会把投影或索引的 Map 操作误判为 ModelStore 写入；
- Project Core 基线为 18 个测试文件、293 项测试。
