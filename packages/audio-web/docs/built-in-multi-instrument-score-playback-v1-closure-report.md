# Built-in Multi-Instrument Score Playback V1 收口报告

> Status: MI5 reviewed and committed as `5c541dc`; automated browser gate passed; human listening
> `not-run`; post-closure MI6A Note Coverage Isolation reviewed and committed as `041e945`
>
> Date: 2026-09-03

本文收口从 Standard MIDI File 到真实多 Soundbank PCM 的首个总谱验证闭环。它证明既有多乐器
路由、控制语义、资源准备与 Sample Voice Runtime 能在同一份可复现总谱中协作；它不把自动数值
等同于主观音质优秀，也不扩张为完整 General MIDI、管弦乐演奏法或可分发音源承诺。相关术语见
[多乐器总谱发声 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)和
[Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。

真实用户总谱随后暴露的“单个合法 Pitch 无匹配 Zone 会阻断整份计划”问题，不回写本报告的 MI5
PCM 结论；它作为增量兼容批次记录在
[MIDI Note Coverage Isolation V1](./midi-note-coverage-isolation-v1.md)。

## 1. 最小总谱与真实执行路径

Studio 开发模块用代码生成一份完全原创、可合法纳入仓库的 Type 1 MIDI fixture，不复制第三方
总谱。其 `747` bytes、`8` 个来源 Track 和 `26` 枚 Note 覆盖：

| 声部        | MIDI 路由              | 本轮真实行为                                              |
| ----------- | ---------------------- | --------------------------------------------------------- |
| Piano       | Program 0 / Channel 1  | Studio Grand、三音和弦与二值 CC64 延迟最终 Gate Release   |
| Strings     | Program 48 / Channel 2 | String Ensemble，长音执行 Manifest continuous loop        |
| Brass       | Program 56 / Channel 3 | Trumpet，长音执行 Manifest continuous loop                |
| Woodwind    | Program 73 / Channel 4 | Flute，长音执行 Manifest continuous loop                  |
| Bass        | Program 32 / Channel 5 | Acoustic Bass，包含来源名带 `#` 的真实 WAV                |
| Timpani     | Program 47 / Channel 6 | 普通 gated 定音打击乐，不误用鼓组 one-shot 政策           |
| Drum kit    | Channel 10             | GM Percussion one-shot 与 Open / Closed Hi-hat fast choke |
| Unsupported | Program 80 / Channel 7 | 可保存、可见、无声的 Program Placeholder                  |

每个可播放 Track 还包含首音之前的 CC7 / CC10。fixture 经过真实
`StandardMidiFileEncoder -> ToneJsMidiFileDecoder -> Project MIDI Import -> Project Snapshot ->
Playback Compiler -> Transport -> Scheduler`，再由 Studio Catalogue 定位开发者本地资产，使用
生产 `SampleInstrumentResourceCache` 和 `SampleInstrumentVoiceRuntime` 在
`OfflineAudioContext` 中渲染。占位 Track 保留在 Project 中，因此导入 Track / Note 数分别为
`8 / 26`；实际可播放 Track / Voice Plan 为 `7 / 25`。

## 2. Chromium PCM 证据

2026-09-03 在以下浏览器环境运行 Studio 开发门禁页：

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
AppleWebKit/537.36 (KHTML, like Gecko)
Chrome/151.0.0.0 Safari/537.36
```

渲染使用双声道 `48 kHz`、总长 `6 s`，尾窗为 `5.5...6 s`。18 项硬检查全部为 `true`：

- Program / Channel 10 路由集合、来源 Program、初始 CC7 / CC10 和全部总谱 Pitch 均符合冻结
  fixture；
- Piano CC64 确实把 Key Release 与最终 Gate Release 分开；
- Strings、Trumpet、Flute 选择到真实 Loop Zone；鼓组选择到 one-shot 与对称 Hi-hat Choke
  Group；
- `25 / 25` Voice Plan 均被生产 Runtime 接纳，没有 NaN、Infinity 或满刻度削波帧；
- 不支持 Program 产生 `program-unavailable` 与 `instrument-runtime-missing`，Project Plan 保持
  `partial`，没有回退为 Studio Grand；
- 渲染结束及 dispose 后 Voice、Source、Node、Listener 均为零；Cache dispose 后 Manifest、
  Resource、pending request 和字节统计均为零；
- 渲染后保留缓存为 `26,821,888` decoded Float32 bytes，低于 Studio 的 `192 MiB` LRU 保留预算。

本轮混合与资源实测：

| 指标                        |                                             结果 |
| --------------------------- | -----------------------------------------------: |
| 可播放 Soundbank / 实际 WAV |                                         `7 / 17` |
| WAV encoded bytes           |                                     `12,322,080` |
| decoded Float32 bytes       |                   `26,821,888`（约 `25.58 MiB`） |
| Mix peak                    |           `-12.893738 dBFS`（linear `0.226628`） |
| Mix RMS                     |           `-32.928529 dBFS`（linear `0.022572`） |
| Clipped frame               |                                              `0` |
| Tail peak，`5.5...6 s`      | linear `0`，即数字静音；JSON 中 dBFS 记为 `null` |

冻结阈值是 Peak 不高于 `-3 dBFS`、尾窗低于 `-90 dBFS`。现有混合留有约 `9.89 dB` 的额外峰值
余量，因此本批没有调高或调低既有 Track / Master gain staging，没有加入 limiter、normalization
或隐藏压缩。这里的 normalization 指响度归一化，不是本地资产格式规范化。

综合 AQ0 schema version 5 也在同一浏览器复跑，Velocity、Envelope、continuous / sustain loop、
one-shot、mutex、64 / 128 / 16 复音预算、Voice Stealing、CC64 Key Release / Pedal Up、同音重触发、
峰值、尾部和资源清理检查全部通过。真实总谱负责证明真实 Catalogue 资产与完整数据链；合成 AQ0
负责隔离验证难以从混合波形单独判断的 Envelope、Loop seam 和 fast choke 数值，两者不能互相
替代。

## 3. URL 安全资源名兼容修正

首次真实门禁暴露了一个此前测试未覆盖的开发资产兼容问题：34 枚来源 WAV 名称含 `#`，分布在
Acoustic Bass、String Ensemble、Pizzicato Strings 与 Tremolo Strings。浏览器会把 `#` 解释为
URL fragment；Vite 对这些 public 请求返回 HTML fallback，随后 WAV 容器校验会正确拒绝它。

修复保留严格 HTTP / WAV 校验，不在 Runtime 增加特殊重试或文件名猜测。开发期规范化工具现在把
每个来源 WAV 映射为确定性的 URL 安全名称：

```text
samples/sample-<四位稳定序号>-<WAV SHA-256 前 12 位>.wav
```

单音源 `preparation-report.json` 升级为 schema version 2，并为每枚 Resource 同时记录
`sourceArchiveKey`。Manifest 使用安全资源键；原始来源名、Zone ID、完整 WAV SHA-256 与审计映射
仍可追溯。22 个 Soundbank 的 362 枚 WAV 内容哈希集合在重建前后完全一致，说明该修正没有改变
PCM、Loop、Envelope、Trigger 或声音算法。全部 22 个目录、库存与测量报告随后复跑为 `current`。

当前本地库存报告 SHA-256 为
`6faff68a9c7adf521195a809d405f6b7b849047fbb19397247eedc8fb071b82b`；参考缓存报告 SHA-256 为
`fd43fc796d4d01d88523d942e90466cd41fe385645e5d7b3c0e4ec4d8a553978`。这些报告与 WAV 仍被 Git
忽略并由 Studio production dist boundary 排除。

## 4. 人工听测状态

人工听测保持诚实的 `not-run`。开发页提供可下载的同一份 MIDI 和结构化记录表，等待用户在
Studio 中检查：

1. 音色类别与起音是否符合声部预期；
2. Strings / Trumpet / Flute 长音有无可闻 Loop seam；
3. Studio Grand 松键、Pedal Up 和重触发是否自然；
4. 鼓件自然尾部与 Open / Closed Hi-hat 截音是否合理；
5. 左右声像与声部平衡是否适合实际总谱。

自动门禁只说明冻结输入没有削波、错误路由、资源泄漏或已知语义偏差。它不能判断音色审美、采样
噪声、乐器真实音域或混音美感；未完成上述试听前，不宣称“22 个音色已经通过人工音质验收”。

## 5. 兼容与失败边界

- 已声明 Soundbank 的 Manifest / WAV 缺失或损坏仍在首次 Play fail-fast；不能用占位或钢琴掩盖
  开发安装错误。
- Program Placeholder 是受支持的无声兼容结果；其他 Track 继续播放，Project Commit 不回滚。
- 当前只应用初始 CC7 / CC10 和二值 CC64。动态 CC7 / CC10、CC1、CC11、Pitch Bend、Aftertouch、
  Bank Select、Articulation 与 Automation 仍明确延期。
- Velocity 仍只改变单层 Sample 的增益；本批没有新增 Velocity Layer、Round Robin、Release
  Sample、Pedal Noise、Damper Resonance 或物理钢琴模型。
- 本地 22 项来源许可仍不足以随产品再分发；通过开发门禁不改变法律与 production build 边界。

## 6. 验证与阶段结论

最终根级 `pnpm check` 已通过 Architecture、Workspace Quality、Format、Oxlint、ESLint、全工作区
Type Check、155 个测试文件 / 1,357 项测试、Studio Production Build 与 soundbank dist boundary。
其中 Audio Web 为 23 / 158，Studio 为 65 / 418；本地 Soundbank、开发门禁页和测量报告均未进入
production dist。真实 Chromium 总谱与综合 AQ0 报告也已分别复跑通过。

在人工听测仍为 `not-run` 的限定下，MI5 实现可以审核的结论是：Seele 已有一条可复现的真实
多乐器总谱技术门禁，能同时验证 MIDI 路由、Project 兼容、资源预算、采样控制语义、PCM 峰值与
生命周期；没有证据要求改变既有声音增益政策。审核通过后，下一阶段回到已确认顺序中的统一
Workbench Action Catalogue、菜单与快捷键，不在本批预建 Gesture、Velocity Lane 或 WAV Export。
