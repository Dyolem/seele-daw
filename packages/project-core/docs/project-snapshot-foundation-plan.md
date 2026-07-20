# ProjectSnapshot 基础层计划

## 目标

本阶段为 ProjectSession 建立完整、revision-consistent、只读且可长期持有的运行时项目视图。Snapshot 是当前权威 ModelStore 在某一 `modelRevision` 上的公开投影，不是第二份可写模型，也不是项目文件格式。

```text
ModelStore(revision N)
-> ProjectSnapshot(revision N)
   ├── initial Playback compile
   ├── ProjectFileDTO projection
   ├── Worker / offline task input
   ├── missed-delta recovery
   └── diagnostics / export
```

Snapshot 完成后，外部消费者可以取得一份完整基线，再通过 ProjectCommit / ProjectDelta 追踪后续变化；如果丢失增量或消费者自身状态损坏，可以丢弃派生状态并从新 Snapshot 全量重建。

## Snapshot 的作用

ModelStore 回答“内核现在如何高效持有和修改项目”，Snapshot 回答“某个消费者可以稳定观察哪一版完整项目”。两者服务的生命周期不同：

- Query 用于高频、局部地读取当前状态；
- Commit / Delta 用于描述一次已成功提交的增量变化；
- Snapshot 用于低频地取得某个 revision 的完整一致基线；
- ProjectFileDTO 用于不可信、版本化、可迁移的外部存储。

主要场景：

1. Playback 首次启动或失去增量后，从完整 Snapshot 编译当前播放计划；
2. 保存和 checkpoint 从 Snapshot 生成确定性的 ProjectFileDTO，而不是读取私有 Store；
3. Worker、离线分析和离线导出固定一个 revision，避免任务执行期间输入在背后变化；
4. UI 或其他派生消费者检测到 Commit 缺口时，用新 Snapshot 全量恢复；
5. 诊断、测试和问题复现记录明确的项目版本与完整事实集合。

Snapshot 不用于每个 pointermove、每帧渲染或普通单实体读取；这些路径继续使用 Interaction Preview、Query 和局部缓存。

## 为什么不直接复制 ModelStore

ModelStore 是包内有状态协作者，不是数据传输对象：

- 它拥有私有可变 Map、显式顺序容器和当前 revision；
- 它与唯一 MutationApplier writer lease 及 CAS 写闭包共同形成写权限边界；
- Map insertion order、索引方式和分区布局属于内核实现细节；
- Class 的 `#private` 字段、原型和关联 WeakMap capability 不能通过展开、JSON 或 structured clone 得到合法副本。

直接浅拷贝只会复制 Store 引用或仍指向同一批可变容器，后续提交会改变所谓“快照”。深拷贝 Store 则会把 Map、Class、writer 状态和当前存储布局暴露为公共协议，使未来替换索引或实体表结构变成破坏性 API 变化。复制出来的第二个 Store 还会产生“它是否可写、是否拥有 writer lease、revision 如何继续”的错误问题。

ProjectSnapshot 采用显式投影：只选择消费者需要的项目事实和 revision，复制并冻结公开容器，不携带写方法、Map、Index、History、Subscription 或 writer capability。它可以稳定演进为不同于 ModelStore 的公开形状。

## Snapshot 与 Record 引用

当前领域 Record 使用 TypeScript `readonly` 和内核替换而非原地修改形成逻辑不可变契约，并未对所有 Record 递归 deep-freeze。Snapshot 延续已建立的 Query / Commit 语义：

- Snapshot 复制并冻结自己拥有的数组、分区对象和顶层外壳；
- Project、Track、Clip、Source、Note、Timeline Event、Device 和 Master Record 保持引用共享；
- 后续 Commit 通过新 Record 替换 Store 中的旧 Record，因此旧 Snapshot 仍引用旧版本；
- 调用方若绕过 readonly 契约强制修改共享 Record，属于越权写入，Query / Commit 同样不保证这种行为。

这样 Snapshot 的容器复制成本与实体数量线性相关，规范排序通常为 `O(n log n)`，但不会为十万 Note 重新构造十万个领域对象。若未来需要跨信任边界或 Worker structured clone，ProjectFileDTO / Worker DTO 再执行显式深值投影。

## 公开结构

```ts
interface ProjectSnapshot {
  readonly modelRevision: ModelRevision
  readonly project: ProjectRecord
  readonly master: MasterChannelRecord
  readonly trackOrder: readonly TrackId[]
  readonly tracks: readonly TrackRecord[]
  readonly clips: readonly ClipRecord[]
  readonly midiSources: readonly MidiSourceRecord[]
  readonly midiNotePartitions: readonly MidiNotePartitionSnapshot[]
  readonly tempoEvents: readonly TempoEventRecord[]
  readonly timeSignatureEvents: readonly TimeSignatureEventRecord[]
  readonly devices: readonly DeviceDescriptor[]
}

interface MidiNotePartitionSnapshot {
  readonly sourceId: MidiSourceId
  readonly notes: readonly MidiNoteRecord[]
}
```

Snapshot 使用数组而不是 ReadonlyMap。JavaScript 的 `Object.freeze(map)` 不能阻止 `map.set()`，而公开 Map 也会泄漏内部存储选择。Record 本身携带 ID，不需要额外暴露 `[id, record]` tuple。

## 确定性顺序

内部 Map insertion order 不是项目语义。Snapshot 使用明确的规范顺序：

- `trackOrder` 保留权威 Track 顺序；
- Track、Clip、MidiSource、Device 和 MIDI Note 分区按 opaque ID 升序；
- 每个 Note 分区按 Note ID 升序；
- Tempo 与 Time Signature Event 按 `[tick, id]` 升序。

Snapshot 不把 Clip 的时间排序或 Note 的钢琴卷帘排序伪装成新的领域关系；需要这些访问模式的消费者使用 QueryIndex 或自己的派生索引。规范顺序只保证相同事实得到确定的完整投影，并为后续 DTO golden fixture 和 checksum 奠定基础。

## Revision 与生成时机

`ProjectSession.getSnapshot()` 同步读取当前 ModelStore。V1 Project Kernel 在主线程单写，不会有另一条写事务在同步生成过程中插入，因此 Snapshot 的 revision 和全部实体来自同一状态。

每次调用都重新复制容器，不缓存 Snapshot，也不在每次 Commit 后自动创建。典型调用频率是 Playback 全量编译、显式保存、debounced checkpoint、Worker 任务开始或消费者恢复，而不是每个编辑动作。

Snapshot 的 `modelRevision` 是运行时观察版本。后续 ProjectFileDTO 投影必须显式省略它，因为新 Session 的本地 revision 从 `0` 开始；文件格式版本、Journal sequence 和 cloud version 继续使用各自的概念。

## 模块位置与公开边界

```text
src/snapshots/
└── project-snapshot.ts
```

Snapshot 生成目前是无状态同步投影，因此使用模块函数，不创建只有静态方法或没有生命周期状态的 Class。

package root 只公开：

- `ProjectSnapshot`；
- `MidiNotePartitionSnapshot`；
- `ProjectSession.getSnapshot()`。

包内 `createProjectSnapshot(reader)`、ModelStoreReader 和排序函数不公开。Snapshot 不包含 ModelStore、MutationApplier、QueryIndex、History、ChangePublisher 或任何可写能力。

## 测试边界

- 最小空项目和完整 fixture 的全部字段；
- Snapshot 外壳、所有数组、分区对象和分区 Note 数组运行时冻结；
- Snapshot 不包含 Map，领域 Record 保持引用共享；
- Track order 保留，其他实体表和 Timeline 使用规范顺序；
- 不同 Map insertion order 产生等价 Snapshot；
- Add / Move / Remove 后旧 Snapshot 的 revision、容器和 Record 版本不变；
- Undo / Redo 生成新 revision Snapshot，并恢复对应 Record 版本；
- Snapshot factory 不从 package root 导出。

## 本阶段不包含

- ProjectFileDTO、JSON stringify / parse、schema validation 或 migrations；
- 从 Snapshot 创建新 ModelStore 或加载 ProjectSession；
- Snapshot 缓存、增量 copy-on-write root 或性能 benchmark 优化；
- IndexedDB、OPFS、Journal、checksum、checkpoint 指针或浏览器端口；
- Worker message、Playback compiler、Offline Export 或 Vue adapter。

## 完成边界

完成 ProjectSnapshot 基础层后停止等待审阅，不连续实现 ProjectFileDTO、迁移或持久化。

## 实施结果

本阶段已于 2026-07-20 按上述边界完成：

- package root 已公开 `ProjectSnapshot` 与 `MidiNotePartitionSnapshot`，ProjectSession 已增加同步 `getSnapshot()`；
- 无状态 `createProjectSnapshot(reader)` 位于 `src/snapshots/` 并保持包内，未建立无生命周期状态的 SnapshotFactory Class；
- Snapshot 已覆盖 Project、Master、Track order、Track、Clip、MidiSource、Note 分区、Tempo、Time Signature 和 Device 全部当前项目事实；
- 所有 Snapshot 自有容器、分区和顶层外壳运行时冻结，领域 Record 保持引用共享；
- Track order 保留显式领域顺序，普通实体按 ID、Timeline 按 `[tick, id]` 规范排序；
- 不同 Map insertion order 产生等价 Snapshot，重复读取复制容器但复用未变化 Record；
- Add、Move、Remove、Undo 和 Redo 后，旧 Snapshot 保持原 revision、容器内容和 Record 版本；
- Project Core 基线为 20 个测试文件、311 项测试。
