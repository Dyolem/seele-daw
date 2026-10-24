# Multi-Soundbank Runtime Resource Gate V1

> Status: MI4 reviewed and committed as `8072aca`; local report refreshed by the MI5 URL-safe
> asset normalization without changing decoded audio totals
>
> Date: 2026-09-03

本文记录多乐器总谱在浏览器中的资源准备、解码缓存、失败隔离与生命周期门禁。相关 MIDI、采样
术语见
[多乐器总谱发声 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)。本批只约束
加载与资源所有权，不替代 MI5 的混合 Peak、声音尾部和人工听测。

## 1. 审计结论

- Studio 已从同一 `BUILT_IN_INSTRUMENT_CATALOGUE` 派生全部 22 个 `assetBaseUrl`，没有第二份
  Soundbank URL 表。
- Audio Web 已按 Soundbank 并发准备整份稳定 Plan；同一 Soundbank 的重复 Pitch 会归并为唯一
  Resource Key，不同 Soundbank 即使文件内 Key 同名也不会错误共享。
- 失败 Fetch / Decode 不进入成功缓存，之后可以重试；一个等待者取消不会误伤共享请求，所有等待者
  离开后才 Abort 底层请求。
- 旧缓存只有 Manifest/WAV 单文件上限，成功解码结果会在应用生命周期一直累积。完整 22 项本地
  Catalogue 的 Float32 估算为 `447,379,648` bytes（约 `426.65 MiB`），因此单文件上限不能防止
  用户跨项目或反复换音色后保留整套历史资源。

MI4 为解码缓存增加按 Resource 计算的 LRU 总量预算。Studio 默认保留上限为
`201,326,592` bytes（`192 MiB`）；MI5 URL 安全资源名刷新后的 Manifest 总量只有
`268,280` bytes，继续在应用生命周期保留。

## 2. 本地参考总谱测量

可复核命令：

```sh
pnpm --filter @seele-daw/audio-web measure:score-core-runtime-cache-local
```

命令读取 developer-local `generated/<soundbankId>/manifest.json` 与实际 WAV Header，只测量脚本中
冻结的 Pitch 集合，不读取 ZIP 大小来猜测 AudioBuffer。输出位于被 Git 忽略的
`apps/studio/public/soundbanks/measurements/score-core/runtime-cache-estimate.json`；本轮报告
SHA-256 为 `fd43fc796d4d01d88523d942e90466cd41fe385645e5d7b3c0e4ec4d8a553978`。该哈希在
MI5 中因 Manifest 改用 URL 安全资源名而刷新；参考 WAV 内容哈希集合、资源数和 decoded bytes
均未变化。

参考集合故意同时覆盖 22 个 Soundbank：Piano 使用五音窗口，20 个旋律 / 定音打击音色各使用三枚
代表 Pitch，Drum Kit 使用 Kick、Snare、Closed / Open Hi-hat 与 Crash。多个 Pitch 选择到同一 Zone
时只计一枚资源，因此 Timpani 的三个 Pitch 在当前 Manifest 中只需一枚 WAV。

| 指标                   |                               结果 |
| ---------------------- | ---------------------------------: |
| Soundbank / Manifest   |                                 22 |
| 唯一解码 WAV           |                                 68 |
| WAV 编码总字节         |   42,307,512 bytes（约 40.35 MiB） |
| 解码 Float32 总字节    |   84,609,040 bytes（约 80.69 MiB） |
| Studio 默认缓存预算    |       201,326,592 bytes（192 MiB） |
| 完整 22 项集合 Float32 | 447,379,648 bytes（约 426.65 MiB） |

`192 MiB` 可以同时保留约 `2.38` 份该参考集合的不同资源，同时把历史缓存限制在完整 Catalogue 的约
`45%`。这不是“所有项目最多使用 192 MiB”的承诺：当前正在播放的 Plan 仍必须持有它实际需要的
AudioBuffer；预算约束的是为以后复用而保留的缓存引用。

## 3. 缓存与所有权政策

1. Resource Identity 是 `[soundbankId, assetBaseUrl, resourceKey]`。不同 Soundbank 或不同资产根
   不会因为相同文件名而共用 AudioBuffer。
2. 命中缓存时把 Resource 提升为最近使用；新资源会先逐个移除最久未使用项，直到保留总量不超过
   注入预算。
3. 单枚解码资源若大于整个缓存预算，仍可交给本次 Prepared Runtime 播放，但不进入复用缓存；缓存
   不用隐藏的“资源过大”错误阻断合法 Plan。
4. Prepared Runtime 持有自己的 AudioBuffer 引用。缓存淘汰只删除复用引用，不会破坏正在播放或
   正常退场的 Voice。
5. Pending Fetch / Decode 和当前 Plan 的活动引用不计入“已保留缓存”统计，因此并发准备和 Plan
   handoff 期间可能暂时高于 192 MiB；现阶段不能把该数值冒充浏览器进程总内存硬上限。
6. `clearDecodedResources()` 中止未完成的 Resource 请求并清空已解码引用，但保留已验证 Manifest；
   Application `dispose()` 同时 Abort Manifest / Resource、清空全部引用并关闭 AudioContext。
7. 在预算内重复准备同一稳定总谱时，Manifest 数、decoded Resource 数和 Float32 字节保持不变，
   不发生第二轮 Fetch / Decode。

## 4. 失败与生命周期矩阵

| 场景                                 | 门禁行为                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| 首次 Play 某个已声明资源缺失 / 损坏  | `fail-plan`；整次启动失败，不回退 Studio Grand，也不修改 Project Facts。 |
| 播放中选择性 Instrument Replace 失败 | 跳过失败 Soundbank，返回结构化 failure；无关 Track 和旧退场 Voice 保留。 |
| 同一失败资源再次准备                 | 重新 Fetch / Decode；失败 Promise 不污染缓存。                           |
| 多 Soundbank 准备时调用方 Abort      | 所有该调用的等待立即失败；无其他等待者的底层请求被 Abort。               |
| Active Project 切换                  | Coordinator Abort pending handoff，并 dispose Project Runtime / Voice。  |
| 应用 dispose                         | dispose 共享缓存和 AudioContext；迟到结果不能重新进入缓存。              |

Studio 的初始与选择性策略继续由 `ProjectPlaybackCoordinator` 决定；Audio Web 只执行调用方明确传入的
`fail-fast` 或 `skip-unavailable-instruments`，不知道 Track UI、Commit 或项目生命周期。

## 5. 自动化证据与剩余边界

- `resource-cache.spec.ts` 固定并发去重、失败重试、共享等待者取消、LRU 提升 / 淘汰、统计清零和
  dispose。
- `prepare-plan-resources.spec.ts` 固定两个 Soundbank 在 Manifest 阶段并发开始、稳定总谱二次准备
  不重复 Fetch / Decode，以及多 Soundbank Abort 不保留部分 WAV。
- Studio `browser-runtime.spec.ts` 固定一个应用级缓存跨 Prepared Runtime 复用、首次失败、选择性
  局部失败、第三次重试成功，以及 dispose 时 Abort pending Manifest 并关闭 AudioContext。
- 既有 `project-playback-coordinator.spec.ts` 固定 Active Project 切换取消 handoff，以及选择性
  Replace 失败不停止无关 Track。

MI4 提交前验证通过 Audio Web 23 个测试文件 / 158 项、Studio 64 / 415、两个包的 Type Check、根级
`pnpm lint`、Studio Production Build 与 soundbank dist boundary。本地测量第二次执行保持
`current`；按分批门禁约定未运行完整 `pnpm check`。

MI4 本身不证明 22 个真实音色同时混合时不削波，也不证明 Loop 接缝、Envelope、CC64、鼓件 Choke
或音色对应在真实浏览器中听感正确。MI5 随后用合法最小总谱与 Chromium PCM 补齐代表场景的自动
门禁，人工听测仍为 `not-run`。若未来遥测表明固定 `192 MiB` 不适合不同设备，应新增可解释的
内存压力 / 设备策略，不能把浏览器 GC 观察或任意超时当成声音事实。
