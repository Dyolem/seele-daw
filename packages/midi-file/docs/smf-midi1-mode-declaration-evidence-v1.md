# SMF MIDI 1.0 Mode Declaration Evidence V1

> Status: MI6C reviewed; full root check passed
>
> Date: 2026-09-07
>
> Scope owner: `@seele-daw/midi-file`; evidence transit through `@seele-daw/project-midi`

本文定义传统 Standard MIDI File 中模式声明的第一批客观证据。它回答“文件明确发送了什么系统模式
消息”，不直接回答“每个 Note 应该如何解释”，也不会让当前 Sample Runtime 获得尚未实现的
Keyswitch、Drum Map、Bank、Articulation 或合成能力。

相关基础术语见
[多乐器总谱发声 V1 术语表](../../audio-web/docs/built-in-multi-instrument-score-playback-v1-glossary.md)，
Source Envelope 的分层和生命周期见
[MIDI Source Envelope V1](./midi-source-envelope-v1.md)。

## 1. 本批识别范围

检查器只接受以下完整、精确的 MIDI 1.0 System Exclusive 数据。表中的数据不含 SMF 事件状态字节
`F0`，但包含消息终止字节 `F7`：

| 证据种类                 | 精确数据模式                          | 保存的 Device ID |
| ------------------------ | ------------------------------------- | ---------------- |
| General MIDI 1 System On | `7E <00..7F> 09 01 F7`                | 原始 7-bit 值    |
| General MIDI System Off  | `7E <00..7F> 09 02 F7`                | 原始 7-bit 值    |
| General MIDI 2 System On | `7E <00..7F> 09 03 F7`                | 原始 7-bit 值    |
| Roland GS Reset          | `41 <00..1F> 42 12 40 00 7F 00 41 F7` | 原始值           |
| Yamaha XG System On      | `43 <10..1F> 4C 00 00 7E 00 F7`       | `1n` 的低 4 bit  |

每条声明保留 `kind`、文件级 `scope`、绝对 `tick`、来源 Track / Event 索引与 Device ID。检查器会重组
由一个 `F0` 事件开始、由后续一个或多个 `F7` continuation event 完成的消息；位置固定为起始 `F0`
事件的位置。

长度、常量、Checksum 或 Device ID 范围只要有一项不匹配，就不能升级为上述声明。其他厂商 SysEx、
标准消息、独立 `F7` escape、未完成消息和近似字节全部只增加
`unclassifiedSystemExclusiveMessageCount`，不会被猜成某个模式。

## 2. Evidence 状态

成功完成限定检查时，`MidiSourceEnvelope.semanticEvidence` 为：

```text
status: inspected
inspectionPolicy: smf-midi-1-mode-declarations-v1
declarations: [...零到多条精确声明...]
unclassifiedSystemExclusiveMessageCount: 0..n
```

“`inspected` 且 declarations 为空”只表示这项 V1 政策没有识别到五类消息，不表示文件明确声明“非
GM”，也不表示文件没有其他可用语义证据。若限定检查使用的底层 parser 失败，但主 Decoder 仍能
读取音乐事件，则 Evidence 保持 `unresolved / profile-declaration-inspection-failed`；不能把失败
降格为“没有声明”。

## 3. Decoder、Encoder 与导入边界

```text
SMF bytes
  -> 限定 SysEx 检查：只生成 Mode Declaration Evidence
  -> Tone.js 投影：生成既有 Note / CC / Program 等中立事件
  -> MidiFileDocument.sourceEnvelope
  -> Project MIDI 验证并深度复制到 Import Summary
  -> Studio 原样转交结果，不改变声音
```

- Decoder 对同一输入执行证据检查和既有音乐投影；第三方 parser 类型不越过 package root。
- Project MIDI 接受 `inspected` 或诚实的 `unresolved` Evidence，不把它写入 Project Snapshot、
  Project File、History、dirty 或 Playback Plan。
- 当前 Encoder 会把五类已识别声明按 `tick / sourceTrackIndex / sourceEventIndex / kind` 的确定顺序
  写入 Type 1 conductor Track。
- 若检查失败或存在未分类 SysEx，Encoder 会在写出前拒绝，因为当前中立 Document 没有原始字节，
  继续导出会静默丢失证据。
- Encoder 移动声明到 conductor Track，因此新文件重新解析后的来源 Track / Event 索引可以改变；
  声明种类、Device ID、Tick 与确定顺序保持。

## 4. 与 Semantic Binding 的分界

本批没有建立可执行的 `MIDI Semantic Binding`：

- 多种 On / Off / Reset 声明可能按时间切换，或在不同 Type 1 Track 的同一 Tick 产生顺序歧义；
- GM、GS 或 XG 模式证据不能证明任意低音 Note 是 Keyswitch；
- 没有模式声明的文件仍可能按 GM 习惯创作，现有 Program / Channel 10 兼容路由也不会在本批改变；
- 即使绑定成功，只有已经实现的 Project Fact 与 Runtime 能力才能执行，不能伪造缺少的音源或控制。

下一批 MI6D 才会从这些位置化声明生成保守、版本化、带冲突结果的绑定。MI6D 必须保留原始 Evidence，
并继续把“无声明”“未分类”“检查失败”“互相冲突”区分开。

## 5. 术语速查

| 术语                     | 直白解释                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| System Exclusive / SysEx | MIDI 中承载通用或厂商专有数据的消息；同样的后续字节在不同厂商下可有不同含义 |
| Mode Declaration         | 明确要求设备进入或退出某个兼容模式的消息                                    |
| Continuation Event       | SMF 用 `F7` 事件继续前一段尚未结束的 `F0` SysEx 数据                        |
| Inspection Policy        | 本次检查承诺识别的有限消息集合，不等于“理解了所有 SysEx”                    |
| Unclassified             | 看见了 SysEx，但当前政策不能精确分类；不等于错误或可以删除                  |
| Semantic Binding         | 后续把证据转成可执行解释的独立步骤；Evidence 本身不会改变 Note              |

## 6. 自动验证门禁

- 精确识别五类声明，并把近似 GM 子类型、错误 GS Checksum 与厂商私有消息保持为未分类；
- 一个 `F0` 加多个 `F7` continuation packet 可重组，检查 parser 失败保持 `unresolved`；
- Source Envelope、声明数组与声明对象在 Decoder、Project MIDI Import Summary 边界保持深度不可变；
- Encoder 覆盖五类消息、确定顺序和重新解析，并拒绝检查失败或存在未分类 SysEx 的来源；
- 2026-09-07 完整 `pnpm check` 已通过 Architecture、Workspace Quality、Format、Oxlint、ESLint、
  全工作区 Type Check、159 个测试文件 / 1,384 项测试、Studio Production Build 与 soundbank dist
  boundary。

这些门禁证明有限证据契约与失败边界，不表示已解释声明、改变导入路由或实现新发声功能。

## 7. 规范依据

- [The MIDI Association：MIDI 1.0 Universal System Exclusive Messages](https://midi.org/midi-1-0-universal-system-exclusive-messages)
  列出 General MIDI 的 `09 / 01`、`09 / 02` 与 `09 / 03` 子标识。
- [Roland：Sending a GS Reset](https://support.roland.com/hc/en-us/articles/201924639-PMA-5-Sending-a-GS-Reset)
  给出 GS Reset 的完整消息。
- [Yamaha PSR-8000 官方手册](https://fi.yamaha.com/files/download/other_assets/2/317132/PSR8000E.pdf)
  在 MIDI Data Format 中定义 XG System On 与 `1n` Device Number。

这些依据只支持上述消息识别，不授权 Seele 推断文件中其他事件的演奏法或乐器意图。
