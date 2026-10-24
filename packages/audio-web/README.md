# @seele-daw/audio-web

浏览器里的播放后端：实现 playback 的 `PlaybackRuntimePort`，用 Web Audio 原生节点播放 Manifest
描述的采样乐器。它只读 playback 的计划，不读项目模型。Studio 只提供资产地址和资源预算。

## 对外接口

包根只公开一个函数：

```ts
createWebAudioPlaybackRuntime({
  assetBaseUrl, // (soundbankId) => 该 Soundbank 资产目录的 URL；没有时返回 null
  limits, // Manifest、单个 WAV 与解码缓存的字节预算
}): PlaybackRuntimePort
```

创建时不碰浏览器的音频设备。第一次 `prepare` 在 Play 手势的同步调用栈里创建或恢复 AudioContext，
同时建立整个应用共用的输出：master、输出校准、解码缓存和 Voice 池
（[ADR-006](../../docs/adr/ADR-006-one-audio-output-for-every-revision.md)）。

## 一个音符怎么发声

```text
prepare(plan)
  按 Soundbank 分组音符 → 取 Manifest（缓存）→ 为每个音符找 Zone
  → 没有 Zone 的音符报告为 no-matching-zone
  → 取 WAV，解码，放进 LRU 缓存（按 URL 作键）
  → PreparedPlaybackPlan：乐器表与报告
schedule(voicePlan)
  找 Zone → 复音准入，必要时偷一个 Voice
  → AudioBufferSource → Gain（包络）→ StereoPanner → master
  → 互斥组 choke → PlaybackVoice
```

同一资源的并发请求共享一次 fetch 与解码；某个等待者取消不影响其他等待者，最后一个离开才取消底层
请求；失败的请求不留在缓存里。Studio 默认的解码预算是 192 MiB。

## 发声规则

常数集中在 `audio-quality/render-policy.ts`：

- 力度：平方响应，下限 -36 dB，再乘 Track Gain。Project Master 保持原值，之后固定做 -12 dB 输出
  校准，没有隐藏的 limiter。
- 包络：attack 与 release 来自 Zone。`curve` 为 null 或 0 时是线性，否则是归一化的指数形状，用 32
  段线性 ramp 近似。
- 释放：gated Zone 在计划的最终 Gate Release 按 Zone 的 release 退场；one-shot 不看音符长度，自然
  结束。cancel、互斥 choke、偷 Voice 与 `allNotesOff` 都用 6 ms 线性快速释放。source 在释放结束后
  再留 1 ms 才 stop。
- Loop：continuous loop 在释放阶段继续循环；sustain loop 在释放点换成一个不循环的尾音 source。
- 复音：每个 Instrument Device 最多 64 个发声的 Voice，整个输出最多 128 个，另外最多 16 个正在退场
  的尾音。超出时先按 release-started、key-released、key-held 的顺序，再按当前增益、起音时间与调度
  顺序选出被偷的 Voice；退场尾音也满了，就丢弃新 Voice。
- 声像：使用 `StereoPannerNode`；浏览器没有它时只允许居中。
- 回收：Voice 的 source、gain、panner 与 `ended` 监听在 source 结束、出错或 dispose 时全部释放。

## 结构

```text
src/
├── web-audio-playback-runtime.ts   端口实现：激活输出、准备、调度
├── context/                        AudioContext、master 与输出校准
├── audio-quality/                  渲染政策常数与力度曲线
├── sample-instrument/
│   ├── contract/   Manifest V1、Supported SFZ Profile、resource key、WAV 文件头（脚本与运行时共用）
│   ├── loading/    Zone 选择、资源缓存、计划的资源准备
│   └── voice/      包络、偷 Voice 的排序、Voice 池
└── development/    开发报告页、离线渲染与加载测量
scripts/            本地 Soundbank 的准备与测量，含 Mapping Adapter 与受限 ZIP
```

## 本地 Soundbank

采样不随构建分发。输入与输出都在 git 忽略的 `apps/studio/public/soundbanks/` 下：来源文件按每个
Soundbank 定义里的相对路径读取，规范化后的 Manifest 与 WAV 写到 `generated/<soundbankId>/`，
Studio 从同一路径加载。

| 命令（`pnpm --filter @seele-daw/audio-web …`） | 产出                        |
| ---------------------------------------------- | --------------------------- |
| `prepare:studio-grand-local`                   | Studio Grand                |
| `prepare:general-midi-percussion-local`        | General MIDI 打击乐         |
| `prepare:score-core-local`                     | 总谱用的 22 个 Soundbank    |
| `prepare:general-midi-local`                   | GM 路由用的 86 个 Soundbank |
| `prepare:built-in-presets-local`               | 全部 289 个采样 Preset      |

每个定义都固定来源身份、Program、音域、ZIP 预算和输入文件的 SHA-256。目标目录已经存在时，文件
必须逐一相同，否则拒绝覆盖。`measure:studio-grand-local` 与 `measure:score-core-runtime-cache-local`
测量加载成本。

## 延伸阅读

- [Seele Supported SFZ Profile V1 与 Sample Instrument Manifest V1](./docs/seele-supported-sfz-profile-v1.md)：
  Manifest 的规范语义
- [默认内置 MIDISampleSynth 控制文件逆向分析](./docs/default-built-in-midi-sample-synth-reverse-analysis.md)
- [General MIDI Percussion Compatibility Policy V1](./docs/general-midi-percussion-compatibility-policy-v1.md)
- [audio-web 复盘（2026-10）](../../docs/architecture/audio-web-review-2026-10.md)
- 已完成阶段的计划、收口报告、审计、术语表与本地资产记录：
  [docs/archive/audio-web](../../docs/archive/audio-web/)
