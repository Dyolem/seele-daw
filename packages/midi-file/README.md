# @seele-daw/midi-file

`midi-file` 是浏览器、音频运行时和 Project Model 无关的 Standard MIDI File 边界。它将第三方
Codec 的对象投影成 Seele 自有的 `MidiFileDocument`，并提供可独立替换的 Decoder / Encoder
契约。

## 当前能力

- `ToneJsMidiFileDecoder` 使用固定版本的 `@tonejs/midi` 解析 SMF；
- 接受 Type 0 / Type 1 与 PPQ time division；
- 为每个成功解析的 Document 建立不可变 MIDI Source Envelope，明确记录 SMF 格式、PPQ、MIDI 1.0
  消息协议，以及 Profile 声明“尚未检查”的证据状态；
- 明确拒绝 Type 2、SMPTE division 和损坏的 Header；
- 保留 tick-domain Note、Tempo、Time Signature、Key Signature、文本事件、Program、Channel、
  Control Change、Pitch Bend 与 End of Track tick；
- `StandardMidiFileEncoder` 使用 `midi-file` writer 输出 Type 1，并在调用第三方代码前验证当前契约值域；
- 第三方异常统一转换为带稳定 code 的 `MidiFileCodecError`。

`@tonejs/midi` 会把一个源 Track 按 Channel / Program 拆成多个 normalized Track，并把 Note On /
Note Off 配对为 Note。`MidiFileDocument.tracks` 明确表示这种规范化结果，不承诺保留原始 chunk
身份或原始事件顺序。当前投影也不是无损 SMF AST：SysEx、Aftertouch 与未识别 Meta Event 尚不在
契约内。需要这些事实时，应扩展中立契约或替换 Adapter，而不是让第三方类型越过 package root。

当前第三方 SMF 文本实现按单字节字符串读写。Encoder 会拒绝超出 byte range 的文字，避免静默
截断；在 Studio Export 接入前必须单独确认 UTF-8 与外部 DAW 兼容策略。Decoder 现阶段保留第三方
返回的字节字符串，不宣称已经识别来源文件的字符集。

Source Envelope 的字段、瞬态生命周期、失败边界与后续语义证据路线见
[MIDI Source Envelope V1](./docs/midi-source-envelope-v1.md)。`profile-declarations-not-inspected`
不等于“文件没有 Profile”；当前 Decoder 不会据此选择 Keyswitch、Drum Map 或 Articulation。

## 边界

- 本包不依赖 `project-core`，也不包含 Track、Clip、Project ID、默认音源或 PPQ 960 产品规则；
- Project 导入与导出映射属于独立 `project-midi` bridge，不进入本包；
- Source Envelope 是中立解析证据，不是 Project Fact；本包不会把它写入 Project File；
- Studio / Browser 负责读取或下载字节，本包不访问 DOM、File、Blob 或 URL；
- `Midi`、`Track`、`Note` 等 `@tonejs/midi` 类型不得从公开入口导出。

```text
Uint8Array
  -> MidiFileDecoder
  -> MidiFileDocument
  -> Project MIDI bridge
```

Encoder 采用相反方向。未来的低层 TypeScript、WASM 或 Worker Codec 只需实现同一契约，不要求上层
修改 Project 映射。
