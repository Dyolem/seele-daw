# ADR-007：Snapshot 在 revision 之间共享没变的部分

- 状态：Accepted
- 日期：2026-10-24
- 实施：与本文同一提交

## Context

每次提交之后，读到的 Snapshot 都是整份新拷贝：每张表、每个 MIDI Source 的音符分区都重新复制、
重新排序。消费者因此无法分辨哪些部分没变，只能每次从头推导。播放就是这样：每个提交都把整份
播放计划重新编译一遍，再把新旧计划的全部音符逐个比较。

在 16 轨、每轨 5,000 个音符的项目上，播放时移动一个音符要用约 150 ms：提交 18 ms，读 Snapshot
7.5 ms，编译 63 ms，调和 55 ms。主线程停顿这么久，调度器每 25 ms 一次的唤醒就会被耽误。

## Decision

1. Session 记住每次提交写过的表，以及分区表里写过的 MIDI Source。下一次读 Snapshot 时，只重新
   复制这些部分，其余的直接沿用上一份 Snapshot 的对象。于是没被改动的表和分区，在 revision 之间
   保持同一个对象。这是 Snapshot 的契约，消费者可以依赖它。
2. 播放编译按 Clip 记忆结果：只要 Clip 记录、它的 Source 的音符数组和踏板数组都还是同一个对象，
   就沿用上次的 span 数组。记忆用以 Clip 记录为键的 `WeakMap`，编译仍是同一个纯函数。每个 Clip
   的 span 已经排好序，整份计划的排序只需合并这些有序段。
3. 计划带上 `clipSpans`：每个 Clip 的 span 数组。调和只比较数组不同的 Clip，因为一个 occurrence
   只属于一个 Clip。

## Consequences

- 上面的编辑降到约 33 ms：读 Snapshot 约 0.1 ms，没有改动时编译约 10 ms，调和约 2 ms。剩下的
  主要是提交本身。
- 收益的单位是 Clip 和 Source。只有一个 80,000 音符 Clip 的项目，一次编辑仍要重新编译、重新比较
  整个 Clip，约 150 ms。要更细，就得在 Source 内按音符增量，目前没有这样做。
- 记忆按对象身份判断。如果 project-core 把没变的部分也换成新对象，结果仍然正确，只是变慢；
  `project-snapshot.spec` 固定了共享行为。
- 提交到读取之间，Session 只保存被写过的表名和 Source ID，与提交次数无关。

## Validation

- `project-snapshot.spec`：两次提交后读到的 Snapshot 只换了被编辑的分区；未触碰的分区、表与轨道
  顺序是同一个对象；撤销后内容复原。
- `audible-midi-compiler.spec`：只编辑一个 Source 后，其他 Clip 的 span 数组是同一个对象，并且结果
  等于对同一项目的全新对象从头编译。
- 基准：`pnpm --filter @seele-daw/playback bench`、`pnpm --filter @seele-daw/project-core bench`。
- `pnpm check` 全部通过。

## Revisit Trigger

- 大型单 Clip 的编辑延迟成为问题：在 Source 内按音符增量编译与调和。
- 有消费者需要知道哪些部分变了却不能比较对象身份，例如跨线程：让 Snapshot 直接携带变化范围。
