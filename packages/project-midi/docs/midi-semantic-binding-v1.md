# MIDI Semantic Binding V1

> Status: MI6D reviewed; full root check passed
>
> Date: 2026-09-07
>
> Scope owner: `@seele-daw/project-midi`; user feedback owned by Studio

本文定义 Seele 第一个可执行前的 MIDI 语义绑定结果。它把 MI6C 已保存的客观 Mode Declaration
Evidence 分类为“可绑定、未绑定、未解析或冲突”，但不据此改变乐器、Note、Controller 或发声。

来源字节证据仍由
[SMF MIDI 1.0 Mode Declaration Evidence V1](../../midi-file/docs/smf-midi1-mode-declaration-evidence-v1.md)
拥有；常用中英术语见
[多乐器总谱发声 V1 术语表](../../audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 用户可见行为

- 导入文件只有一种一致的 GM1、GM2、GS 或 XG 启用模式时，完成提示会显示来源声明的模式，并明确
  说明检测没有改变 Instrument routing；
- GM System Off 与启用模式并存、多种启用模式并存、声明检查失败或存在未分类 SysEx 时，导入仍可
  完成，但会产生一个清楚的 notice，现有 Program / Channel 10 路由保持不变；
- 检查后没有模式声明是正常的 `unbound / no-mode-declaration`，不增加噪声提示，也不自动假定 GM；
- 只有 GM System Off 时保存 `unbound / general-midi-system-off` 并提示，因为继续使用当前兼容路由
  可能与来源意图不同；
- 普通构造路径的“尚未检查”状态继续保留为 `unresolved`；若它进入 Studio 导入结果也会提示，不能把
  它静默伪装成“没有声明”。

## 2. 版本化契约

每个 `ProjectMidiImportSummary` 同时携带不可变 `sourceEnvelope` 和不可变 `semanticBinding`：

```text
sourceEnvelope.semanticEvidence  --客观来源字节证据-->
  project-midi policy            --保守分类-->
semanticBinding                  --瞬态导入解释结果-->
  Studio feedback                --只展示，不改变声音-->
```

Binding 的 `schemaVersion` 为 `1`，`policy` 为 `smf-midi-1-mode-binding-v1`，`scope` 为 `file`。
这里的 `file` 只表示结果属于本次来源文件，不表示已解析外部硬件 Device、MIDI Port、MIDI 2.0 Group
或每个 Channel 的独立适用范围。声明中的 Device ID 仍留在 Source Envelope Evidence。

`sourceDeclarationIndexes` 指向同一 Import Summary 内
`sourceEnvelope.semanticEvidence.declarations` 的索引。这样 Binding 可以追溯证据而不复制、改写或
取代原始声明。

| Status       | 直白含义               | V1 结果                                         |
| ------------ | ---------------------- | ----------------------------------------------- |
| `bound`      | 证据只指向一种启用模式 | 保存 GM1、GM2、GS 或 XG mode 与全部声明索引     |
| `unbound`    | 没有可启用的唯一模式   | 区分“没有声明”与“明确 GM Off”                   |
| `unresolved` | 当前证据不足以安全绑定 | 区分尚未检查、检查失败和存在未分类 SysEx        |
| `conflicted` | 已识别证据互不兼容     | 保存候选模式、GM Off 标记与声明索引，不选择赢家 |

## 3. 保守解析政策

V1 不解释跨 Tick 的模式切换，也不为不同 Track 的同 Tick 事件虚构全局先后顺序：

1. Evidence 尚未检查或检查失败时，分别返回对应 `unresolved` reason；
2. 只要有一条未分类 SysEx，整个 Binding 保持 `unresolved`，因为未知消息可能改变模式或目标范围；
3. 零条声明返回 `unbound / no-mode-declaration`；
4. 一条或多条声明全部指向同一种启用模式时返回 `bound`，重复声明不会制造冲突；
5. 只有 GM System Off 时返回 `unbound / general-midi-system-off`；
6. 多种启用模式，或任意启用模式与 GM Off 并存时返回 `conflicted`。

因此常见的“先 GM On、再 GS / XG Reset”在当前政策下也会保持冲突，而不是猜测后一条一定覆盖前一
条。后续若真实产品切片需要时间分段、MIDI Port 或 Device 目标，必须用新政策版本明确加入顺序和
范围，不能悄悄改变 V1 的结果。

## 4. 生命周期与架构边界

- `midi-file` 继续只解析和保存 Evidence，不依赖 Project 或 Studio；
- `project-midi` 在已经验证 Source Envelope 后派生 Binding，并把两者放入两种导入摘要；
- Binding 不写入 Project Snapshot、Project File、History 或 dirty，也不形成额外 Command；
- Studio 只读取 Binding 生成一次导入反馈，不把它放入 Pinia 或 Playback Runtime；
- Program / Channel 10、初始 CC7 / CC10、CC64、音源选择和 Note Coverage 行为均不改变；
- 未来只有执行能力已经实现、范围唯一且产品政策明确时，Binding 才能参与实际路由或控制解释。

## 5. 失败与兼容矩阵

| 来源状态                              | Binding                             | 导入 / 用户反馈                                   |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| 单一 GM1 / GM2 / GS / XG              | `bound`                             | 成功并显示检测模式；明确路由未改变                |
| 重复的同一种模式                      | `bound`                             | 保留全部证据索引，不重复提示                      |
| 无 Mode Declaration                   | `unbound / no-mode-declaration`     | 正常导入，不假定 GM，不增加提示                   |
| 只有 GM System Off                    | `unbound / general-midi-system-off` | 正常导入并增加一个 notice                         |
| 多模式或 On / Off 混合                | `conflicted`                        | 正常导入并增加一个 notice，不选择赢家             |
| 未分类 SysEx                          | `unresolved`                        | 正常导入并显示数量；不忽略未知证据                |
| 检查器失败                            | `unresolved`                        | 主音乐 Decoder 成功时仍可导入，并增加一个 notice  |
| 普通构造路径尚未检查                  | `unresolved`                        | 保持诚实状态；若进入 Studio 结果则增加一个 notice |
| Project 保存、Undo / Redo 或 Playback | 不参与                              | 没有新事实、History 步骤或声音变化                |

## 6. 术语速查

| 术语               | 直白解释                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| Evidence           | 文件实际包含的已识别消息及位置；它回答“看见了什么”                      |
| Semantic Binding   | 对 Evidence 的版本化解释结果；它回答“当前政策能否安全归类”              |
| Bound              | 所有已知且允许参与的证据只指向一个模式                                  |
| Unbound            | 已完成判断，但没有一个启用模式；不等于解析失败                          |
| Unresolved         | 证据没有检查完、检查失败或包含未知内容；不能当成“没有声明”              |
| Conflicted         | 已识别声明互不兼容；V1 不按位置或厂商偏好擅自选择                       |
| Instrument routing | 把 Program / Channel 映射到 Seele Device 的产品政策；本批明确不修改它   |
| Evidence reference | Binding 中指回 Source Envelope 声明数组的索引，用来审计结论来自哪些消息 |

## 7. 自动验证门禁

- Project MIDI 单元测试覆盖四种 Status、全部 Reason、同模式重复、候选模式顺序、GM Off 与深度冻结；
- 两种导入摘要必须携带与 Source Envelope 配对的 Binding；
- Studio 测试覆盖 Bound 信息、Conflict、GM Off、检查失败、未分类 SysEx notice，以及既有 Timeline
  notice 合并；
- 2026-09-07 完整 `pnpm check` 已通过 Architecture、Workspace Quality、Format、Oxlint、ESLint、
  全工作区 Type Check、160 个测试文件 / 1,398 项测试、Studio Production Build 与 soundbank dist
  boundary。

自动测试只能证明分类与反馈契约，不代表已支持 GM2 Drum Map、GS / XG Bank、Keyswitch、
Articulation、MIDI 2.0 或 MIDI-CI。
