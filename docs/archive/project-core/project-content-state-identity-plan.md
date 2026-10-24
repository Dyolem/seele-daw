# Project Content State Identity 与精确保存点计划

## 目标

本阶段在 Project History 中为每个可到达的内容状态建立稳定、会话级身份，使上层能够准确判断当前 Session 是否回到了最近成功保存的 History 位置：

```text
ProjectSession
├── modelRevision     每次成功事务递增的提交序号
└── contentStateId    当前 History 内容位置的稳定身份
```

`modelRevision` 继续承担 CAS、查询一致性、Commit 顺序和异步诊断。`contentStateId` 只回答当前内容状态是否就是先前观察到的同一个 History 状态。两者不能互相替代。

## 为什么 revision 不足以判断 Dirty

假设保存点是状态 A：

```text
A(revision 10, state A)
-> edit B(revision 11, state B)
-> Undo(revision 12, state A)
```

Undo 本身是新的成功事务，所以 revision 必须继续增长到 12；但内容已经回到保存过的 A。只比较 `12 !== 10` 会产生一次保守误报。

反向情况也必须保持 dirty：

```text
edit B
-> save B
-> Undo
-> state A
```

这里 Undo 离开了保存点 B，不能因为它是 Undo 就清除 dirty。正确判断依据不是操作方向，而是当前内容状态身份是否等于保存回执捕获的身份。

## 身份语义

`ProjectContentStateId` 复用共享的 `Brand<symbol, 'ProjectContentStateId'>`，是一个 opaque、会话级 symbol token，具有以下规则：

- 只使用严格引用相等 `===` / `Object.is` 比较；
- 每个新 Session 创建一个初始身份；
- 每个成功、实际改变项目事实的 Command 创建一个新的 after-state 身份；
- Undo 恢复 entry 的 before-state 身份；
- Redo 恢复同一个 entry 的 after-state 身份；
- Undo 后的新 Command 创建全新身份并放弃 redo 分支；
- no-change、命令拒绝和写入失败不改变身份；
- 身份只在同一个 ProjectSession 生命周期内有意义。

它不是随机 UUID、递增数字、项目事实、内容哈希、Project File 字段或跨 Session 身份。关闭后重新打开项目会创建 fresh Session 和新的初始身份；Active Project 将该新初始身份同时视为当前状态与已保存状态。

## HistoryEntry 扩展

HistoryEntry 在既有重放事实上增加状态边：

```text
HistoryEntry
├── commandType
├── forward mutations
├── inverse mutations
├── beforeContentStateId
└── afterContentStateId
```

状态身份描述的是 History 图中的位置，不是 entry 自身身份。一个 entry 连接 before 和 after 两个状态：

```text
beforeContentStateId
  -- forward / Redo --> afterContentStateId
  <-- inverse / Undo --
```

这也不同于此前延期的 History entry ID。未来 entry ID 可以用于 UI label、merge、Journal 或诊断；content-state identity 用于判断当前模型位于哪一个状态节点。

## 分支规则

假设提交 A、B 后 Undo B：

```text
S0 --A--> S1 --B--> S2
                 Undo -> S1
```

此时 Redo B 会回到原来的 `S2` 身份。若在 S1 提交 C，则创建新的 S3：

```text
S0 --A--> S1 --C--> S3
             \
              B -> S2  abandoned redo branch
```

S3 即使通过字段变化偶然得到与 S2 相同的项目事实，也不是同一个 History 位置，因此身份不同并保持 dirty。这是有意的安全边界：本阶段不在每次提交后捕获全量 Snapshot 或计算规范化内容哈希。

## 与模型事务的原子性

History transition 现在同时预备：

```text
expected undo / redo heads
expected contentStateId
next undo / redo heads
next contentStateId
MutationPlan
```

Session 仍按既有顺序 stage QueryIndex 与 History，再执行 MutationApplier。History stage 同时替换栈头和当前 content identity；apply 失败时 rollback 同时恢复三者。成功 revision 写入后不再分配身份 token。

Undo / Redo 还会校验当前 identity 确实匹配 entry 的 after / before 状态，防止内部栈和状态位置发生静默漂移。

## ProjectSession 公开边界

```ts
interface ProjectSession {
  readonly modelRevision: ModelRevision
  readonly contentStateId: ProjectContentStateId
  // existing query / execute / history APIs
}
```

类型从 Project Core package root 公开，但创建函数保持包内。调用方可以保存并比较 token，不能构造有持久化语义的新身份。

## Checkpoint 保存回执

持久化 envelope 保持 V1，不增加 content identity：

```text
ProjectCheckpoint V1
├── checkpoint ID
├── project ID
├── source model revision
└── ProjectFileDTO
```

`saveProjectCheckpoint` 在同一个同步调用栈内捕获 Session 的 `contentStateId` 和 Snapshot。成功回执增加：

```ts
interface ProjectCheckpointSaveReceipt {
  readonly sourceModelRevision: ModelRevision
  readonly sourceContentStateId: ProjectContentStateId
}
```

`sourceContentStateId` 只回到发起保存的 Session，不写入 Store，也不参与 checkpoint decoder、数据库版本或 Project File 格式。保存期间继续编辑时，回执仍指向真正被 Snapshot 捕获的 History 状态。

## Active Project Dirty 规则

Ready state 同时保留 revision 诊断和内容保存点：

```text
isDirty = savedContentStateId is null
       or currentContentStateId !== savedContentStateId
```

`savedRevision` 继续显示保存来源 revision，并帮助诊断保存期间的提交顺序，但不再单独决定 dirty。

因此以下情况成立：

- 新建首个 Checkpoint 成功：clean；
- 打开并恢复 fresh Session：clean；
- Command 后：dirty；
- Undo 一个已经保存的 Command：dirty；
- Redo 回保存点：clean；
- 未保存 Command 后 Undo 回保存点：clean；
- 保存 B 期间到 C，再 Undo 回 B，保存完成：clean；
- 保存 B 期间 Undo 到 A，保存完成：dirty。

## 模块位置

```text
packages/project-core/
├── docs/project-content-state-identity-plan.md
└── src/
    ├── history/history-controller.ts
    ├── session/project-content-state-id.ts
    ├── session/project-session.ts
    └── persistence/checkpoint/project-checkpoint-coordinator.ts

apps/studio/src/workbench/project/
├── active-project-state.ts
└── active-project-service.ts
```

身份由 Project Core History 生成，Studio 只消费 Session 和 save receipt 的公开事实。ModelStore、Snapshot、ProjectFileDTO、Checkpoint envelope 和 IndexedDB schema 均不增加该字段。

## 测试与验收

- 新 Session 初始 identity 冻结且稳定；
- 成功 Command 创建新 identity；
- Undo / Redo 恢复准确的 before / after identity；
- 新分支 identity 不复用被放弃的 redo 状态；
- no-change、拒绝和 apply failure 保持 identity；
- History replay failure 同时恢复栈头和 identity；
- Checkpoint receipt 捕获来源 identity，但持久化 envelope 不包含它；
- fresh 恢复 Session 不复用旧 Session identity；
- Active Project 准确区分 Undo 离开保存点与 Undo / Redo 回到保存点；
- 保存竞态按来源 identity，而不是 completion 时 revision，判断 dirty；
- workspace 类型、架构、测试、lint 与构建保持通过。

完成本独立模块后停止等待审阅，不连续实施导航确认协议。

## 本阶段不包含

- Project 内容哈希或跨 Session 等价判断；
- History entry ID、label、merge 或持久化；
- 将 History / identity 写入 Project File、Checkpoint 或 Journal；
- 自动保存、导航确认或 UI；
- 协同编辑、选择性 Undo 或分支可视化。

## 实施结果

本阶段已按上述边界完成：

- Project Core 已公开 opaque `ProjectContentStateId` 类型与 `ProjectSession.contentStateId`，身份 factory 继续保持包内；
- HistoryEntry 已记录 before / after content-state identity，普通 Command、Undo、Redo 和新分支按协议推进同一状态图；
- History transition 会把 undo / redo 栈头和当前 identity 一起 stage，Command 与 History replay 写入失败会一起 rollback；
- `ProjectCheckpointSaveReceipt` 已返回 `sourceContentStateId`，但 ProjectCheckpoint V1、ProjectFileDTO、Snapshot 与 IndexedDB schema 均未增加该字段；
- Active Project ready state 已同时记录当前与已保存 identity，`isDirty` 不再由 revision 差异单独决定；
- 已验证 Undo 离开保存点保持 dirty、Undo / Redo 回保存点恢复 clean，以及保存期间离开再回到来源状态的竞态；
- Project Core 当前为 24 个测试文件、348 项测试，Studio 为 6 个测试文件、44 项测试，platform-browser 18 项测试保持通过；
- workspace lint、架构检查、类型检查、全部测试和 Studio 生产构建通过。

导航确认协议尚未开始实施。
