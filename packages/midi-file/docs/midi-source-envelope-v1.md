# MIDI Source Envelope V1

本文定义 Seele 在解释 MIDI 事件之前保留的最小来源证据，由 `@seele-daw/midi-file` 与
`@seele-daw/project-midi` 共同维护。目标不是提前实现 GM / GM2 / GS / XG、Keyswitch、
Articulation Map、MIDI 2.0 或 MIDI-CI，而是让代码能区分“已经证明的协议事实”和“尚未检查的语义
声明”，不再只凭 Pitch、Program 或缺少 Zone 去猜用途。

相关采样、协议与语义术语见
[多乐器总谱发声 V1 术语表](../../../docs/archive/audio-web/built-in-multi-instrument-score-playback-v1-glossary.md)。

## 1. 可证明的来源事实

`ToneJsMidiFileDecoder` 先读取 Standard MIDI File Header，只接受 Type 0 / Type 1 与 PPQ time
division。成功后，每个 `MidiFileDocument` 都带一个深度冻结的 `sourceEnvelope`。它的
`schemaVersion` 固定为 `1`，这是 Envelope 契约版本，不是 SMF 或 MIDI 协议版本：

| 字段                      | 值                          | 含义                                                 |
| ------------------------- | --------------------------- | ---------------------------------------------------- |
| `container.kind`          | `standard-midi-file`        | 输入是传统 Standard MIDI File 容器                   |
| `container.format`        | `0` 或 `1`                  | SMF Header 中的文件组织格式                          |
| `container.timeDivision`  | `ppq`                       | 时间使用每四分音符 Tick，不是 SMPTE division         |
| `messageProtocol`         | `midi-1.0`                  | SMF Channel Voice 事件采用 MIDI 1.0 消息语义         |
| `semanticEvidence.status` | `unresolved` 或 `inspected` | 声明检查是否完成；两者都不表示已经建立可执行语义绑定 |
| `semanticEvidence.reason` | 仅 `unresolved` 时存在      | 区分尚未检查和检查失败                               |

普通调用方构造 Envelope 时使用 `unresolved / profile-declarations-not-inspected`。Decoder 按限定
政策检查传统 SMF SysEx：成功时保存 `inspected`、零到多条位置化 Mode Declaration，以及未分类 SysEx
消息计数；检查器自身失败时保存 `unresolved / profile-declaration-inspection-failed`。“未检查”
“检查失败”和“检查后没有声明”三者不能互换。

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

- 不写入 Project Snapshot、项目文件、History、dirty 或 Playback Plan；
- 不改变 Note、CC64、Program、Track 或 Device Descriptor；
- Studio 只转交摘要，不依据它自动改变音色或事件语义；
- 如果产品将来要让用户查看、修改或长期保存 Interpretation Profile，应另行设计明确、可版本化的
  Project Fact，而不是复用这份瞬态摘要。

Encoder 接受同一中立 `MidiFileDocument`，会验证 Envelope 与 `document.format` 一致，并可以把五类
已识别的 Mode Declaration 写入 Type 1 conductor Track；检查失败或存在未分类 SysEx 时拒绝写出，
避免在没有原始字节时静默丢失证据。

## 3. 失败与兼容边界

| 输入 / 状态                                        | 行为                                                       |
| -------------------------------------------------- | ---------------------------------------------------------- |
| SMF Type 0 / 1、PPQ                                | 建立对应 Source Envelope                                   |
| Envelope 缺失、字段未知或与 Document format 不一致 | Codec / Project MIDI 边界明确拒绝                          |
| SMF Type 2 或 SMPTE division                       | 沿用既有稳定错误，不伪造受支持的 Envelope                  |
| 普通构造路径没有检查声明                           | 保持 `unresolved / profile-declarations-not-inspected`     |
| 限定检查成功                                       | 保存位置化声明和未分类 SysEx 消息计数                      |
| 限定检查失败                                       | 保持 `unresolved / profile-declaration-inspection-failed`  |
| 合法 Pitch 没有当前 Sample Zone                    | 播放按 Occurrence 跳过并汇总 Warning；不据此推断 Keyswitch |
| Project 保存                                       | 不持久化这份瞬态来源摘要，不改变 Project File schema       |

## 4. 证据路线

已经实现：五类 Mode Declaration 的精确检查（见
[SMF MIDI 1.0 Mode Declaration Evidence V1](./smf-midi1-mode-declaration-evidence-v1.md)），以及
文件级 `MIDI Semantic Binding`（见
[MIDI Semantic Binding V1](../../project-midi/docs/midi-semantic-binding-v1.md)）。之后：

1. 只有绑定唯一、且对应的执行能力已经实现时，才把事件解释成 Drum、Articulation、Keyswitch 或
   其他控制；
2. Device / Group / Channel 粒度的绑定等真实需求出现再做；
3. MIDI 2.0 UMP、MIDI Clip / SMF2 等新容器使用各自的 Decoder，不伪装成传统 SMF；
4. 实时 MIDI-CI Discovery、Profiles 与 Property Exchange 属于设备会话证据，不替代 `.mid` 文件的
   版本检测。

用户覆盖配置、Project 持久化、MIDI 2.0 与 MIDI-CI 仍明确延期。

## 5. 测试覆盖

- `midi-file`：深度冻结、Type 0 / 1 解码证据、schema / protocol / format 不一致的拒绝、Encoder
  往返与公开 API；
- `project-midi`：缺失或不一致的 Envelope 在 Project 写入前失败；新项目与新 Track 的导入摘要保留
  不可变副本；
- Studio：两种导入结果与原创总谱 fixture 的回归。
