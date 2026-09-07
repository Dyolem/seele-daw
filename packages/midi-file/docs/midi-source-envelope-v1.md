# MIDI Source Envelope V1

> Status: MI6B reviewed and committed as `40ce3f3`; MI6C extension reviewed
>
> Date: 2026-09-04
>
> Scope owner: `@seele-daw/midi-file` and `@seele-daw/project-midi`

本文定义 Seele 在解释 MIDI 事件之前保留的最小来源证据。目标不是提前实现 GM / GM2 / GS / XG、
Keyswitch、Articulation Map、MIDI 2.0 或 MIDI-CI，而是让后续代码能够区分“已经证明的协议事实”和
“尚未检查的语义声明”，不再只凭 Pitch、Program 或未覆盖结果猜用途。

相关采样、协议与语义术语见
[多乐器总谱发声 V1 术语表](../../audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 当前可证明的来源事实

当前 `ToneJsMidiFileDecoder` 先读取 Standard MIDI File Header，只接受 Type 0 / Type 1 与 PPQ time
division。成功后，每个 `MidiFileDocument` 必须携带一个深度冻结的 `sourceEnvelope`。它自己的
`schemaVersion` 固定为 `1`；该值是 Envelope 契约版本，不是 SMF 或 MIDI 协议版本：

| 字段                      | 当前值                      | 准确含义                                             |
| ------------------------- | --------------------------- | ---------------------------------------------------- |
| `container.kind`          | `standard-midi-file`        | 输入是传统 Standard MIDI File 容器                   |
| `container.format`        | `0` 或 `1`                  | SMF Header 中的文件组织格式                          |
| `container.timeDivision`  | `ppq`                       | 时间使用每四分音符 Tick，不是 SMPTE division         |
| `messageProtocol`         | `midi-1.0`                  | 当前 SMF Channel Voice 事件采用 MIDI 1.0 消息语义    |
| `semanticEvidence.status` | `unresolved` 或 `inspected` | 声明检查是否完成；两者都不表示已经建立可执行语义绑定 |
| `semanticEvidence.reason` | 仅 `unresolved` 时存在      | 区分尚未检查和限定检查失败                           |

普通调用方构造 Envelope 时使用 `unresolved / profile-declarations-not-inspected`。MI6C Decoder 会按
限定政策检查传统 SMF SysEx：成功时保存 `inspected`、零到多条位置化 Mode Declaration，以及未分类
SysEx 消息计数；检查器自身失败时保存 `unresolved / profile-declaration-inspection-failed`。
“未检查”“检查失败”和“检查后未识别到声明”三者不能互换。

## 2. 数据流与生命周期

```text
SMF bytes
  -> Header / Decoder 建立 MidiSourceEnvelope
  -> MidiFileDocument
  -> Project MIDI 验证格式一致性并制作不可变副本
  -> ProjectMidiImportSummary
  -> Studio Import Result
```

Source Envelope 是导入来源证据，不是音乐创作事实：

- 不写入 Project Snapshot、Project File V2、History、dirty 或 Playback Plan；
- 不改变 Note、CC64、Program、Track 或 Device Descriptor；
- Studio 当前只转交摘要，不依据它自动改变音色或事件语义；
- 导入完成后若未来产品需要让用户查看、修改或长期保存 Interpretation Profile，应另行设计明确、
  可版本化的 Project Fact，而不是悄悄复用这份瞬态摘要。

Encoder 接受同一中立 `MidiFileDocument`，因此会验证 Envelope 与 `document.format` 一致。MI6C
可以把五类已识别 Mode Declaration 写入 Type 1 conductor Track；检查失败或存在未分类 SysEx 时
拒绝写出，避免在缺少原始字节的情况下静默丢失证据。

## 3. 失败与兼容边界

| 输入 / 状态                                        | 当前行为                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| SMF Type 0 / 1、PPQ                                | 建立对应 Source Envelope                                        |
| Envelope 缺失、字段未知或与 Document format 不一致 | Codec / Project MIDI 边界明确拒绝                               |
| SMF Type 2 或 SMPTE division                       | 沿用既有稳定错误，不伪造受支持 Envelope                         |
| 普通构造路径没有检查声明                           | 保持 `unresolved / profile-declarations-not-inspected`          |
| 限定检查成功                                       | 保存位置化声明和未分类 SysEx 消息计数                           |
| 限定检查失败                                       | 保持 `unresolved / profile-declaration-inspection-failed`       |
| 合法 Pitch 没有当前 Sample Zone                    | 仍由 MI6A 按 Occurrence 隔离；不能据此回推 Keyswitch 或错误音符 |
| Project 保存                                       | 不持久化这份瞬态来源摘要，不升级 Project File schema            |

## 4. 后续证据路线

后续实现必须由真实纵向切片逐步扩展：

1. MI6C 检查传统 SMF 中五类精确 GM / GM2 / GS / XG Mode Declaration，同时计数其他 SysEx；
2. 后续建立版本化 `MIDI Semantic Binding`，记录证据来源、版本以及适用 Device / Group / Channel 范围；
3. 只有绑定唯一且执行能力已实现时，才把事件解释成 Drum、Articulation、Keyswitch 或其他控制；
4. MIDI 2.0 UMP、MIDI Clip / SMF2 等新容器使用各自 Decoder，不伪装成传统 SMF；
5. 实时 MIDI-CI Discovery、Profiles 与 Property Exchange 属于设备会话证据，不作为 `.mid` 文件
   版本检测的替代品。

MI6C 的精确消息、分片、未分类与 Encoder 行为见
[SMF MIDI 1.0 Mode Declaration Evidence V1](./smf-midi1-mode-declaration-evidence-v1.md)。语义绑定、
用户覆盖配置、Project 持久化、MIDI 2.0 与 MIDI-CI 仍明确延期。

## 5. 自动验证门禁

- `midi-file`：Creator 深度冻结、Type 0 / 1 解码证据、schema / protocol / format 不一致拒绝、
  Encoder round-trip 与公开 API；
- `project-midi`：缺失或不一致 Envelope 在 Project 写入前失败；新项目和新 Track 导入摘要保留
  防御性不可变副本；
- Studio：两种导入结果、Project Entry / Workspace、Composition Root 与原创总谱 fixture 回归；
- Project Snapshot / Project File 没有新增字段，既有音频与播放测试保持通过。

2026-09-04 的最终 `pnpm check` 已通过 Architecture、Workspace Quality、Format、Oxlint、ESLint、
全工作区 Type Check、158 个测试文件 / 1,375 项测试、Studio Production Build 与 soundbank dist
boundary。该结果验证来源证据和兼容边界，不代表已经解释 GM / GS / XG、Keyswitch 或 MIDI 2.0。

2026-09-07 的 MI6C 扩展又通过完整 `pnpm check`：159 个测试文件 / 1,384 项测试及相同构建门禁。
该增量只证明五类 Mode Declaration 的检查、传递与受限重写，不代表已经建立 Semantic Binding。
