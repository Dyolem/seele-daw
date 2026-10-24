# audio-web 复盘（2026-10）

> 日期：2026-10-24
>
> 代码基线：`main` 分支 `b36fbb1`，文中行号都指这个基线。
>
> 范围：`packages/audio-web`，以及 Studio 中把它接入播放引擎的 `browser-runtime.ts`（已删除，
> 见第 7 节）。
> [2026-10 架构复盘](./web-daw-architecture-review-2026-10.md)没有覆盖这个包。本文只做诊断，每条建议
> 单独决定、单独提交。数字的复测方法见附录。

## 1. 结论

1. 发声的核心是对的：Manifest 驱动的 Zone 选择、可以中途取消的分段包络、确定性的有界复音、带预算的
   解码缓存，以及 Voice Runtime 的 21 个行为用例，都应保留。
2. 问题与 2026-10 复盘在其他包里看到的一样：同一份知识写了好几处，每一层都做纵深防御。
   - “准备结果”和“一个 Voice”在 playback、Studio 适配器和 audio-web 里各有一套描述；
   - 上游已经保证的取值范围、Plan 路由和资产格式，进入 audio-web 后又校验一遍；
   - 运行路径上有 9 个错误类、56 个错误码，包外没有一处读 `code`。
3. `src/` 中只有 3,394 行在 Studio 的运行路径上；另有 1,091 行只服务资产准备脚本，3,216 行是已收口
   阶段的开发报告页。
4. 收益最大的两步：让 audio-web 直接实现 `PlaybackRuntimePort`；让 `schedule` 返回的 Voice 本身就是
   `PlaybackVoiceHandle`。

## 2. 现状

### 2.1 一个音符怎么发声

```text
Studio 组合根：createBrowserProjectPlaybackRuntime({ assetBaseBySoundbank, expectedOrigin })
开始播放，或播放中提交了编辑 → runtime.prepare(plan, signal, options)          Studio 230 行
  把 PlaybackAbortSignal 转成 DOM AbortController
  WebAudioContextRuntime.activate()      创建或恢复 AudioContext；master → 输出校准 → destination
  SampleInstrumentResourceCache          第一次 prepare 时创建，之后整个应用共用
  prepareAudibleMidiSampleResources      按 Soundbank 分组音符 → 取 Manifest → 逐个音符找 Zone
                                         → 记下没有 Zone 的音符 → fetch、读 WAV 头、解码、进 LRU
  new SampleInstrumentVoiceRuntime({ output, preparedResources })
引擎每 25 ms 规划之后 200 ms → prepared.schedule(voicePlan)
  Studio：跳过加载失败的 Soundbank 和没有 Zone 的音符
  SampleInstrumentVoiceRuntime.schedule  校验计划 → 找 Zone → 复音准入，必要时偷一个 Voice
                                         → Source → Gain → Panner → master；互斥组 choke
                                         → 返回 { outcome, token, playbackRate, zoneId }
  Studio：用 token 包出 PlaybackVoiceHandle（cancel、isActive、rescheduleRelease）
```

### 2.2 代码分布

| 部分                                                                 | 行数   | 使用者                 |
| -------------------------------------------------------------------- | ------ | ---------------------- |
| 运行路径：`index.ts` 的导入闭包，15 个文件                           | 3,394  | Studio 播放            |
| `built-in-mapping-adapter.ts`、`restricted-zip.ts`、`measurement.ts` | 1,091  | `scripts/` 与开发页    |
| `src/development/`，16 个文件                                        | 3,216  | 开发报告页与它们的测试 |
| Studio `src/development/`（TS，不含测试）                            | 1,202  | 开发报告页             |
| `scripts/`（含测试）                                                 | 4,849  | 本地资产准备           |
| README 与 `docs/`，共 12 篇                                          | 192 KB |                        |

运行路径中最大的四个文件：`voice-runtime.ts` 1,117 行，`resource-cache.ts` 605 行，
`manifest-validator.ts` 403 行，`prepare-plan-resources.ts` 322 行。

## 3. 发现

先按收益、再按风险排序。

| 节  | 发现                                      | 收益 | 风险 |
| --- | ----------------------------------------- | ---- | ---- |
| 3.1 | 适配层放在 Studio，准备结果的类型写了两套 | 高   | 低   |
| 3.2 | Voice 句柄绕了三层                        | 高   | 中   |
| 3.3 | 文档以阶段状态为主                        | 中   | 无   |
| 3.4 | 上游已保证的事再校验一遍，错误码没有读者  | 中   | 低   |
| 3.5 | 资产工具与开发报告放在运行时的 `src/` 里  | 中   | 低   |
| 3.6 | Sustain 尾音切换写了三遍                  | 中   | 中   |
| 3.7 | 资产位置的身份层守着不存在的调用方        | 低   | 低   |

### 3.1 适配层放在 Studio，准备结果的类型写了两套

- audio-web 已经依赖 playback，却由 Studio 写 230 行、两个类，把它适配成 `PlaybackRuntimePort`。
- 同一组概念写了两遍：audio-web 的 `AudibleMidiSamplePreparationFailure`、
  `AudibleMidiUnsupportedSampleNoteOccurrence` 与 `AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE`
  （`fail-fast`），和 playback 的 `InstrumentPreparationFailure`、`UnsupportedNoteOccurrence` 与
  `PLAYBACK_INSTRUMENT_FAILURE_MODE`（`fail-plan`）字段相同。Studio 的 `resolvePreparationFailureMode`
  在两者之间翻译，audio-web 又用 `parseFailureMode` 和错误码 `invalid-failure-mode` 再查一次。
- “哪些音符能响”由 `prepareAudibleMidiSampleResources` 算出。Studio 拿它建两个 Set 过滤
  `schedule`，因为不过滤的话 Voice Runtime 会抛 `missing-instrument` 或 `unsupported-pitch`；引擎的
  `hasCoveredNote` 也读同一份列表。
- 公开入口导出 23 个符号。Studio 生产代码只用其中 9 个，全在 `browser-runtime.ts` 一个文件里；其余 14 个
  在包外没有使用者。

下一步：在 audio-web 提供 `createWebAudioPlaybackRuntime({ assetBaseUrl, limits })`，返回
`PlaybackRuntimePort`。把两个适配类和 `browser-runtime.spec.ts` 移进去，直接使用 playback 的类型与常量，
删除镜像类型和两处翻译。Studio 只留目录查找与资源预算，二三十行。audio-web 的公开入口只剩这个工厂和它的
选项类型。

### 3.2 Voice 句柄绕了三层

- `schedule` 返回 `{ outcome, token, playbackRate, zoneId }`，其中 `playbackRate` 和 `zoneId` 没有读者。
  Studio 再用 token 包出 handle；每次 `isActive()` 都要校验 token、拼
  `JSON.stringify([engineGeneration, occurrenceKey])`、查 Map。`VoiceLedger.collect()` 每 25 ms 对每个
  Voice 调用一次。
- `rescheduleRelease` 区分 6 种结果，Studio 把它折成一个布尔值；引擎调用 `cancel` 和
  `rescheduleRelease` 共 7 处，没有一处读返回值。
- Generation 记了三份：Transport（权威）、Scheduler 和 Voice Runtime。引擎用 8 处 `advanceGeneration`
  让 audio-web 跟上，而 audio-web 只拿它拒绝不属于当前代的计划（`stale-generation`、
  `generation-not-active`）。引擎总是先推进再调度，所以这两个检查只在引擎出错时才会触发。
- 主音量是 Plan 级的状态（它一变，调和就整体重置），却在每个音符调度时设一次
  （`voice-runtime.ts:565`），每次还要再校验一遍范围。

下一步：先在 audio-web 内部让 `schedule(plan)` 返回 `SampleVoice | null`，由 `SampleVoice` 直接实现
`PlaybackVoiceHandle`；删除 token、`voiceKey`、`hasVoice`、结果枚举和没有读者的字段；主音量在 prepare 时
设一次。再单独一步改 playback 的端口：删除 `PreparedPlaybackRuntime.advanceGeneration`，`cancel` 与
`rescheduleRelease` 不再返回值。Voice Runtime 的 21 个用例是安全网，但其中 17 个也断言了结果枚举、token
或统计，要跟着改写断言。

### 3.3 文档以阶段状态为主

- README 298 行、22 KB，前 200 行几乎都是批次与提交记录（“Batch 4B.1”“MI1B 已提交为 `7c36a17`”）；
  `docs/` 另有 11 篇、170 KB，多数以 “Status: … reviewed and committed as …” 开头。
- 仓库其他部分的阶段文档已经在 2026-10 移进 `docs/archive/`，这个包的没有。

下一步：README 改成一页：包里有什么、一个音符怎么发声、复音与释放的几个常数（64 / 128 个 Voice、6 ms
快速释放、-12 dB 输出校准）、怎样生成本地 Soundbank。阶段报告与审计移到 `docs/archive/audio-web/`，只把
Manifest 与 SFZ Profile 的契约留作活文档。

### 3.4 上游已保证的事再校验一遍，错误码没有读者

- `validateVoicePlan`（41 行）重查增益 0–4、声像 -1–1、音高 0–127、力度 1–127 和时间先后。这些值进入
  Plan 时已由 project-core 的品牌类型限定，时间先后由 Scheduler 保证。之后音高在
  `findSampleInstrumentZoneForPitch` 里再查一次，力度在 `calculateAudioQualityV1aVelocityGain` 里再查一次，
  主音量在 `setMasterGainAtTime` 里再查一次。
- `prepareAudibleMidiSampleResources` 重查 Plan 的路由（重复、缺失、不可听），Scheduler 已经查过同样三条
  （`audible-midi-scheduler.ts:168`、`:229`、`:234`）。
- 资产由本仓库的脚本生成。生成时已经解析 Manifest、读每个 WAV 的头、核对 Zone 时间不越过 WAV 长度
  （`prepare-local-sample-instrument.ts:77`、`:97`，`prepare-built-in-local-sample-instrument.ts:418`）。
  运行时又对每个 WAV 读一次头；Voice Runtime 还在每个音符调度时核对一次 Zone 时间
  （`assertZoneMatchesResource`）。
- 运行路径上有 9 个错误类、56 个错误码、15 处 `instanceof` 转译，以及 7 份 `fail()`、3 份
  `errorDetail()`。包外没有一处引用这些类，Studio 只显示 `message`（`project-playback-feedback.ts`）。

下一步：删除 `validateVoicePlan`、`validateVoiceToken`、路由复查和每个音符的时长核对；运行时不再读 WAV
头，`wav-file.ts` 留给脚本。Manifest 仍在加载时解析一次，每个 Soundbank 一次，代价很小。错误改为普通
`Error`，保留可读的 message；测试改为断言 message。

### 3.5 资产工具与开发报告放在运行时的 `src/` 里

- `built-in-mapping-adapter.ts`（611 行）与 `restricted-zip.ts`（285 行）只被
  `scripts/prepare-built-in-local-sample-instrument.ts` 使用；`measurement.ts`（195 行）只被开发页和两个
  脚本使用。`fflate` 列在运行时依赖里，却只服务 `restricted-zip.ts`。适配器还抄了 `readMidiPitch`、
  `readNonNegativeNumber`（与 `manifest-validator.ts` 相同）和按音高匹配 Zone（与 `zone-selection.ts`
  相同）。
- `src/development/` 3,216 行，加上 Studio 的开发页 1,202 行，服务 AQ、EQ、MI 等已收口阶段的报告。其中
  `sample-instrument-audition.ts`（454 行）是第二个小运行时：自己取 Manifest、自己缓存、自己管
  AudioContext、自己定义力度曲线。音高换算公式因此有 3 份（`voice-runtime.ts:270`、
  `measurement.ts:182`、`sample-instrument-audition.ts:242`）。
- 离线渲染（`offline-render.ts`）为了让 Voice Runtime 接受 `OfflineAudioContext`，用 Proxy 把 `state`
  伪装成 `running`，并另建了一份 master 与输出校准。

下一步：把三个工具模块连同测试移到 `scripts/`，`fflate` 改为 devDependency，删掉抄写的辅助函数。开发页的
去留由维护者决定；建议删除 audition 和已收口阶段的报告页（git 历史保留），只留一个离线渲染测试工具，
让它直接使用生产的输出与 Voice 代码。

### 3.6 Sustain 尾音切换写了三遍

- Voice 有三种结束方式：调度时排好的释放、`rescheduleRelease` 改期、`cancel` / 互斥 / 偷 Voice 引起的强制
  释放。每种各写一遍“停掉循环 Source，在释放点起一个不循环的尾音 Source”：`#scheduleVoiceNodes`
  （833–847 行）、`#rescheduleSourceRelease`（762–781 行）、`#releaseVoice`（1032–1057 行）。
- “gated 却没有 release”已被 Manifest 校验拒绝（`manifest-validator.ts:244`），Voice Runtime 又查两次
  （701、821 行）。`voice-create-failed` 的 try / catch 包装有 5 处；AudioContext 是否 running 查了 4 次
  （构造、`schedule`、`rescheduleRelease`、`#releaseVoice`），离线渲染的 Proxy 就是为了绕过它。

下一步：抽出一个 `#endAt(voice, time, segment)`：在 `time` 处保持当前增益、按 `segment` 斜坡到 0，并按
Zone 决定停掉 Source 还是切换到尾音 Source；三种结束都调用它。running 检查集中到 output 的一个方法，
离线渲染只替换这一处。验证靠 21 个 Voice Runtime 用例，以及浏览器里的离线 PCM 报告与人工听测。

### 3.7 资产位置的身份层守着不存在的调用方

- `expectedOrigin` 从 Studio 组合根穿过适配器传进缓存，缓存用 7 个条件确认 base URL 同源、是目录、
  没有 query 和 hash。生产中所有 base URL 都由目录生成：
  `new URL('/soundbanks/generated/<id>/', location.origin)`（`built-in-instrument-catalogue.ts:487`、
  `browser-runtime.ts:221`）；`expectedOrigin` 就是同一个 `location.origin`（`studio-application.ts:112`）。
- 每次 prepare，每个 Soundbank 都要经过：locator → `requireLocation`（核对返回的 Soundbank 与请求一致）→
  `loadManifest`（规范化一次 URL）→ `prepare`（再规范化一次，再调一次 `loadManifest`）→ 用
  `JSON.stringify` 拼缓存键。
- 缓存、Voice Runtime 和 Context Runtime 各有一个 `statistics`，缓存还有 `clearDecodedResources`；它们
  没有生产调用者，只服务开发报告与测试。

下一步：缓存按 URL 作键，调用方传入 `assetBaseUrl(soundbankId)`；删除 `expectedOrigin`、locator、URL
规范化和 `clearDecodedResources`。共享请求与 LRU 预算保留：播放中的每次编辑都会重新 prepare 整个 Plan，
有了它们这件事才便宜。适合与 3.1 一起做。

### 3.8 其他

`scripts/` 中手写了 86 个乐器条目（`built-in-score-core-local-instruments.ts` 659 行、
`built-in-general-midi-local-instruments.ts` 1,028 行），其中的 Soundbank ID、来源名称、GM Program 和
源文件 SHA-256，生成的 289 项指纹 JSON 里都有；抽查 84 个条目的哈希，全部一致，加载时两者还要互相核对。
手写条目独有的只是产品名、音域、压缩包预算、family 和路由，可以缩成一张以 Soundbank ID 为键的覆盖表。

## 4. 目标形状

```text
packages/audio-web/src
├─ index.ts             createWebAudioPlaybackRuntime(options): PlaybackRuntimePort
├─ playback-runtime.ts  prepare → PreparedPlaybackRuntime；从 Studio 移入
├─ output.ts            激活 AudioContext；master 与输出校准；running 检查只在这里
├─ sample-cache.ts      按 URL 缓存 Manifest 与解码结果；共享请求；LRU 预算
├─ prepare.ts           Plan → 每个 Soundbank 的资源键与未覆盖音符，用 playback 的类型
├─ voices.ts            schedule(plan) → SampleVoice，即 PlaybackVoiceHandle；一个 #endAt
├─ envelope.ts、polyphony.ts、render-policy.ts         不变
└─ manifest/            Manifest V1 类型、校验、Zone 查找、resource key
packages/audio-web/scripts   资产准备：mapping adapter、受限 ZIP、测量、WAV 头解析
```

Studio 侧只剩：

```ts
createWebAudioPlaybackRuntime({
  assetBaseUrl: (soundbankId) => builtInAssetBaseUrl(soundbankId, location.origin),
  limits: DEFAULT_BUILT_IN_SAMPLE_RESOURCE_LIMITS,
})
```

建议的顺序与发现的排序不同，先做没有行为变化的：

1. 3.3 文档、3.5 移动工具模块：纯移动。
2. 3.4 删除重复校验，错误改为普通 `Error`：净删。
3. 3.1 与 3.7：适配器移入 audio-web，缓存按 URL 作键。之后 3.2 只改一个包。
4. 3.2：先改 audio-web 内部，再单独改 playback 端口。
5. 3.6：合并释放。会影响声音，最后做。

粗估做完后，运行路径从 3,394 行降到 2,700 行左右（已计入从 Studio 移入的适配器），Studio 适配器从 230 行
降到二三十行，另有约 1,250 行工具代码离开 `src/`。

## 5. 保留不动的部分

- Manifest V1 契约与校验器：构建与运行时共用同一份。
- `envelope.ts` 的分段斜坡：之后取消自动化时可以精确接上。
- `polyphony-policy.ts` 的确定性偷 Voice 排序。
- 缓存的共享请求、按调用方取消，以及解码 LRU 预算。
- 在用户手势的同步调用栈里激活 AudioContext。
- 把 playback 的取消信号转成 DOM `AbortSignal`：playback 没有 DOM 类型，这段胶水必须有，随适配器移入
  audio-web。
- Voice Runtime 的 21 个行为用例。

## 6. 未验证与待决

- 播放中每次编辑都会重新 prepare 整个 Plan：逐个音符线性查找 Zone，并新建一个 Voice Runtime。大项目下的
  代价没有测过。
- 3.6 会影响声音，需要浏览器里的离线 PCM 报告与人工听测。本机没有生成的 Soundbank
  （`apps/studio/public/soundbanks/` 不存在），本次没有运行这些报告。
- 开发报告页的去留由维护者决定（3.5）。
- 删除 `advanceGeneration` 会改 playback 的公开端口，应等 3.2 的第一步稳定后单独做。
- 第 4 节的行数是估算，每步完成后按附录复测。

## 7. 实施结果（2026-10-24）

| 节  | 状态                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | 完成。audio-web 的 `createWebAudioPlaybackRuntime` 直接实现端口，使用 playback 的类型与常量；Studio 的 `browser-runtime.ts` 删除，只留 26 行的 `built-in-sample-assets.ts`。公开入口只剩这个函数。                                      |
| 3.2 | 完成，范围比提案大，见下。                                                                                                                                                                                                              |
| 3.3 | 完成：README 改成一页；阶段报告、审计、术语表与本地资产记录移入 `docs/archive/audio-web/`。`docs/` 只留 SFZ Profile 与 Manifest 契约、来源控制文件逆向分析和 GM 打击乐兼容政策，脚本仍按它们实现。                                      |
| 3.4 | 运行路径完成：Voice Plan、Plan 路由、音高、力度、主音量和每个音符的 Zone 时长都不再复查；运行时不再读 WAV 头；缓存、Context、Voice Runtime 与资源准备抛普通 `Error`，中止是 `AbortError`。Manifest 校验器与资源键的错误类留给脚本共用。 |
| 3.5 | 部分完成：Mapping Adapter 与受限 ZIP 移进 `scripts/`，`fflate` 改为 devDependency；测量移到 `development/`；抄写的读取函数与 Zone 匹配删除。开发报告页与离线渲染的 Proxy 仍在，去留待决。                                               |
| 3.6 | 完成：三种结束都经过一个 `#endSourcesAt`；running 检查集中到 output 的 `isRunning()`，离线渲染的 Proxy 删除。AQ0 合成 PCM 报告与改动前逐项一致（38 项检查通过）；真实音源的人工试听仍是 not-run。                                       |
| 3.7 | 完成：缓存按 URL 作键，调用方传入 `assetBaseUrl(soundbankId)`；`expectedOrigin`、URL 规范化、配置复查与 `clearDecodedResources` 删除。                                                                                                  |

与提案的偏差：

- 3.2 没有停在“Voice 本身就是句柄”。按 revision 分代的运行时整个删除：一个应用只有一个输出和一个
  Voice 池，`prepare` 只加载乐器，准备结果没有生命周期（ADR-006）。token、generation、
  `advanceGeneration`、`VoiceLedger` 与结果枚举一并删除，playback 的端口在同一次提交里改完，没有分两步。
- 主音量没有放在 prepare 时设置，而是在 Voice Plan 带来不同的值时设置一次：输出不必读 Plan。

第 6 节待决事项：

- 播放中每次编辑仍会重新 prepare 整个 Plan，但不再新建 Voice Runtime。16 轨 × 5,000 音符、乐器已缓存时
  原来约 17 ms；Zone 改为每个 Manifest 一张按音高的表、只排序要报告的音符之后约 6.5 ms，见
  `packages/audio-web/src/__tests__/prepare-plan-resources.bench.ts`。
- 删除 `advanceGeneration`：已与 3.2 一起完成。
- 3.6 与开发报告页的去留：仍待决。

## 附录：度量方法

在仓库根目录用 Git Bash 执行：

```sh
# 运行路径：index.ts 的导入闭包（15 个文件）
(cd packages/audio-web/src && wc -l index.ts audio-quality/render-policy.ts \
  context/audio-context-runtime.ts \
  sample-instrument/contract/{manifest,manifest-validator,resource-key,sfz-profile-v1,structured-data,wav-file}.ts \
  sample-instrument/loading/{prepare-plan-resources,resource-cache,zone-selection}.ts \
  sample-instrument/voice/{envelope,polyphony-policy,voice-runtime}.ts | tail -1)

# 只被脚本与开发页导入的模块
grep -rln "built-in-mapping-adapter\|restricted-zip\|loading/measurement" packages apps \
  --include=*.ts | grep -v node_modules | grep -v __tests__

# 公开导出在 apps 中的使用文件数（0 表示包外没有使用者）
grep -v "^/\*\*" packages/audio-web/src/index.ts | grep -oE "\b([A-Z][A-Za-z_]+|prepare[A-Za-z]+)\b" \
  | sort -u | while read s; do
    echo "$(grep -rlw "$s" apps --include=*.ts --include=*.vue | grep -v node_modules | wc -l) $s"
  done | sort -n

# 运行路径的错误类在包外的引用（结果为空）
grep -rnw "WebAudioContextRuntimeError\|SampleInstrumentManifestError\|SampleResourceKeyError\|StructuredDataError\|SupportedWavFileError\|AudibleMidiSamplePreparationError\|SampleInstrumentResourceCacheError\|SampleInstrumentZoneSelectionError\|SampleInstrumentVoiceRuntimeError" \
  apps packages/playback --include=*.ts --include=*.vue

# 引擎同步 generation 的调用点；调用 cancel / rescheduleRelease 的位置（都不读返回值）
grep -c "advanceGeneration(" packages/playback/src/engine/playback-engine.ts
grep -n "handle\.cancel(\|handle\.rescheduleRelease(" packages/playback/src/engine/playback-engine.ts

# 音高换算公式的副本
grep -rn "2 \*\* (" packages/audio-web/src --include=*.ts | grep -v __tests__

# 开发页行数与文档字节数
find packages/audio-web/src/development -name "*.ts" -print0 | xargs -0 cat | wc -l
find apps/studio/src/development -name "*.ts" -not -path "*/__tests__/*" -print0 | xargs -0 cat | wc -l
cat packages/audio-web/README.md packages/audio-web/docs/*.md | wc -c
```
