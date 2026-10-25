# ADR-009：播放计划只按 Clip 保存音符

- 状态：Accepted
- 日期：2026-10-25
- 实施：与本文同一提交

## Context

ADR-007 之后，编译按 Clip 记忆结果，计划也带上了按 Clip 分组的 `clipSpans`。但计划仍另有一份
全局排序的 `midiNoteSpans`：每次编译都把所有 Clip 的 span 合并、排序、冻结一遍。它的读者也都
按整份计划工作：Scheduler 创建时逐个检查并复制全部 span，再建一个查重用的集合；audio-web 准备
资源时逐个 span 查 Zone。

引擎在每次提交后都会编译，并为新计划建 Scheduler，不论是否在播放。所以在 16 轨、每轨 5,000
音符的项目上，即使提交本身已经只要 0.03 ms（ADR-008），移动一个音符仍要花十几毫秒去重建与
检查那 80,000 个 span。

## Decision

1. 计划只按 Clip 保存 span：`clipSpans` 的每个数组是一个 Clip 的 span，按“起点、终点、
   occurrence key”排序。全局的 `midiNoteSpans` 删除，编译不再合并或排序整份计划。
2. 计划的契约由 Compiler 保证：span 有效、每个 Clip 内有序、occurrence key 在整份计划中唯一、
   所属 Track 可发声；没有改动的 Clip 在下一份计划里是同一个数组。读者信任它，不再检查或复制。
3. 读者按 Clip 工作：
   - Scheduler 为每个 Clip 保留一个 cursor，每个窗口从各 Clip 读起点落在窗口里的 span，再把这一批
     按 span 顺序排序，所以 Voice Plan 的顺序不变。每代只处理一次的查重集合删除，因为 cursor
     本来就只经过每个 span 一次；只用于测试的批次计数也删除。
   - audio-web 按 Clip 记忆它用到的音高（以 span 数组为键的 `WeakMap`），只在某个音高没有 Zone
     时才逐个检查这个 Clip 的音符。
   - 调和与“有没有能发声的音符”的判断也逐 Clip 遍历。

## Consequences

- 16 × 5,000 上，没有改动时重新编译整份计划从约 10 ms 降到约 0.03 ms；移动一个音符后编译、
  调和、建 Scheduler 合计约 6 ms（之前编译与调和约 17 ms，建 Scheduler 另算）；乐器已缓存时
  准备资源从约 6.5 ms 降到约 0.14 ms。
- 收益的单位仍是 Clip。一个 80,000 音符的 Clip，一次编辑仍要重新编译并比较整个 Clip，约
  110 ms（ADR-007 的重新评估条件）。
- 需要整份有序 span 的地方（目前只有测试）自己合并：`[...plan.clipSpans.values()].flat()` 再排序。
- 计划不再自证正确。手工构造的计划如果违反契约，后果未定义；计划只应来自
  `compileAudibleMidiProject`。

## Validation

- `audible-midi-scheduler.spec`：一份两个 Clip 的计划连续规划到结束，每个 span 恰好安排一次，
  顺序与按 span 顺序合并的结果相同。其余排期、迟到、过期与 generation 的测试不变。
- 基准：`pnpm --filter @seele-daw/playback bench`、`pnpm --filter @seele-daw/audio-web bench`。
- `pnpm check` 全部通过。

## Revisit Trigger

- 单个 Clip 的编辑延迟成为问题：在 Clip 内按音符增量编译与调和（同 ADR-007）。
- Clip 数量大到每个窗口逐 Clip 检查成为负担（数千个以上）：为窗口查询建按起点的跨 Clip 索引。
