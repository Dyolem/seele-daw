# MIDI Source Envelope V1

> Status: MI6B implementation pending review; full root check passed
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

| 字段                      | 当前值                               | 准确含义                                              |
| ------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `container.kind`          | `standard-midi-file`                 | 输入是传统 Standard MIDI File 容器                    |
| `container.format`        | `0` 或 `1`                           | SMF Header 中的文件组织格式                           |
| `container.timeDivision`  | `ppq`                                | 时间使用每四分音符 Tick，不是 SMPTE division          |
| `messageProtocol`         | `midi-1.0`                           | 当前 SMF Channel Voice 事件采用 MIDI 1.0 消息语义     |
| `semanticEvidence.status` | `unresolved`                         | 尚未建立可执行的版本化语义绑定                        |
| `semanticEvidence.reason` | `profile-declarations-not-inspected` | 当前 Decoder 没有检查 Profile、厂商声明或其他解释证据 |

`profile-declarations-not-inspected` 不等于“文件没有 Profile”，也不等于“文件明确声明为 GM”。它只陈述
当前解析能力没有做这项检查。后续批次若检查 SysEx、Meta Event 或新容器元数据，必须用新的明确证据状态
表达结果，不能把当前 `unresolved` 静默改写成推测。

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

Encoder 接受同一中立 `MidiFileDocument`，因此会验证 Envelope 与 `document.format` 一致；当前
Type 1 Writer 不把 Envelope 当作额外 MIDI 事件写入文件，也不声称已经写出 Profile 声明。

## 3. 失败与兼容边界

| 输入 / 状态                                        | 当前行为                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| SMF Type 0 / 1、PPQ                                | 建立对应 Source Envelope                                        |
| Envelope 缺失、字段未知或与 Document format 不一致 | Codec / Project MIDI 边界明确拒绝                               |
| SMF Type 2 或 SMPTE division                       | 沿用既有稳定错误，不伪造受支持 Envelope                         |
| 没有检查 Profile / 厂商声明                        | 保持 `unresolved / profile-declarations-not-inspected`          |
| 合法 Pitch 没有当前 Sample Zone                    | 仍由 MI6A 按 Occurrence 隔离；不能据此回推 Keyswitch 或错误音符 |
| Project 保存                                       | 不持久化这份瞬态来源摘要，不升级 Project File schema            |

## 4. 后续证据路线

后续实现必须由真实纵向切片逐步扩展：

1. 在不丢失原始证据的前提下检查传统 SMF 中明确的 GM / GM2 / GS / XG 或厂商声明；
2. 建立版本化 `MIDI Semantic Binding`，记录证据来源、版本以及适用 Device / Group / Channel 范围；
3. 只有绑定唯一且执行能力已实现时，才把事件解释成 Drum、Articulation、Keyswitch 或其他控制；
4. MIDI 2.0 UMP、MIDI Clip / SMF2 等新容器使用各自 Decoder，不伪装成传统 SMF；
5. 实时 MIDI-CI Discovery、Profiles 与 Property Exchange 属于设备会话证据，不作为 `.mid` 文件
   版本检测的替代品。

本批只建立第零层来源证据与传递边界。Profile 检查、语义绑定、用户覆盖配置、Project 持久化、
MIDI 2.0 与 MIDI-CI 均明确延期。

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
