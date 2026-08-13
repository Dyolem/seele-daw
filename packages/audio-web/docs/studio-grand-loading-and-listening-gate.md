# Studio Grand 加载测量与听觉 Gate

> Status: Batch 4A.2 reviewed; browser loading and human listening smoke passed
>
> Recorded: 2026-08-12
>
> Reviewed: 2026-08-13

本文记录开发期 Studio Grand 规范化资源的静态加载成本、真实浏览器解码 smoke、Note / Sample
长度关系，以及进入正式 Sample Runtime 前需要确认的听觉选择。它不把试听代码升级为生产
Runtime，也不改变当前采样不可随 Seele 分发的产品边界。

## 1. 可重复入口

先准备并测量本地资源：

```sh
pnpm --filter @seele-daw/audio-web prepare:studio-grand-local
pnpm --filter @seele-daw/audio-web measure:studio-grand-local
pnpm --filter @seele-daw/studio dev
```

然后打开：

```text
http://127.0.0.1:5173/sample-instrument-audition.html
```

Studio 的开发 HTML 显式注入两个同源 URL：规范化资源根与确定性加载估算报告。试听控制器位于
`@seele-daw/audio-web/development/sample-instrument-audition` 独立开发入口；创建 Session 或读取
Manifest 都不创建 `AudioContext`，只有按钮产生的用户手势才激活音频。

该 HTML 不是 Studio production build entry。Vite 继续设置 `copyPublicDir = false`，生产构建
还要通过 Soundbank dist guard；因此试听页、原始输入、生成 WAV 和测量报告都不能进入交付物。

## 2. 确定性静态测量

测量脚本重新严格验证 Manifest 和每个 WAV，而不是相信生成报告中的汇总数字。它按浏览器
`AudioBuffer` 的 Float32 channel 数据估算解码内存：

```text
decoded bytes = frame count × channel count × 4
```

当前 30 个 WAV 全部为 stereo / 44.1 kHz / 16-bit PCM。结果为：

| 集合                              | WAV | Encoded WAV | Decoded Float32 | 源 Sample 时长 |
| --------------------------------- | --: | ----------: | --------------: | -------------: |
| 完整 Studio Grand                 |  30 |   31.57 MiB |       63.14 MiB |    1.75–7.93 s |
| 参考初始窗口 `48, 60, 64, 67, 72` |   5 |    6.49 MiB |       12.98 MiB |    7.67–7.78 s |

参考窗口只是稳定测量向量，不是 Project 默认内容或 Scheduler 固定窗口。它说明按实际计划选择唯一
Zone 可以把该场景的首次解码集合降到完整音源约五分之一；真实项目仍可能引用 1 到 30 个资源。

确定性报告写入被忽略的：

```text
apps/studio/public/soundbanks/measurements/studio-grand/loading-estimate.json
```

报告绑定 Manifest SHA-256
`f0566a4573a63d252221a9cc53ca9fee194c187bbe4ccf44405a604b5eb45e98`。相同输入重复执行为
幂等；若已有报告内容漂移，工具失败而不自动覆盖。

## 3. 浏览器 Fetch / decode smoke

2026-08-12 在 Codex 内置 Chromium、本机同源 Vite dev server、`cache: no-store` 条件下运行一次
冷 decoded-cache 测量：

| 集合        | Cache hit | Wall time | Summed fetch | Summed decode |
| ----------- | --------: | --------: | -----------: | ------------: |
| 参考 5 WAV  |         0 |   28.8 ms |     105.1 ms |       34.3 ms |
| 完整 30 WAV |         0 |   96.0 ms |   2,026.1 ms |      143.8 ms |

各资源并发读取，因此 summed time 可以大于 wall time。文件来自同一台机器，操作系统文件缓存、
硬件和并发方式都会影响结果；这些数字只证明真实 `fetch`、`decodeAudioData` 与内存计数路径工作，
不能作为远程下载预算、浏览器矩阵结论或发布 SLO。

自动测试还固定了以下失败恢复性质：

- 同一资源的进行中 / 成功请求在开发 Session 内复用；
- HTTP / decode 失败会从开发缓存移除；
- 下一次对同一 Zone 的操作会重新 Fetch / decode，不被永久失败 Promise 污染；
- 失败只影响试听或测量，不接触 Project Fact、History 或 dirty。

这只是验证正式 Loader 所需的行为，不意味着 4B 可以直接把开发 Session 当生产缓存使用。

## 4. Note 与 Sample 长度证据

Studio Grand 当前 30 个 Zone 全部为 gated、无 loop，attack 为 `0`，Mapping release 为
`0.133 s`。按 pitch transposition 计算每个 MIDI `21...108` 的有效自然播放时长后：

| Note duration | 会在 Note Off 前自然结束的 Pitch |
| ------------: | -------------------------------: |
|        0.08 s |                                0 |
|        0.25 s |                                0 |
|           1 s |                                0 |
|           4 s |                               22 |
|          10 s |                       88（全部） |

例如当前 C4 / MIDI `60` 使用 root `61` 的 Sample，向下转调后的自然时长约 `8.19 s`；C8 /
MIDI `108` 的自然时长约 `1.89 s`。因此：

- Sample 长于 Note 时，忽略 Note Off 会让短音继续完整尾音，不能表达 staccato；
- Sample 短于 Note 时，没有来源 loop 证据可以延长声音，V1 只能接受它自然耗尽，或更换 / 重制
  具有 sustain loop 或更长采样的音源；
- 不能从相邻 Zone、重复帧或自动 loop finder 猜一个“物理钢琴”循环点。

## 5. 人工试听结论与保留项

试听页刻意把候选暴露为参数，而不是提前写死生产规则：

1. 对短 Note 比较 `natural-end` 与 `linear-release`；后者默认使用 Mapping 的 `0.133 s`，也可
   调整以检查 click、截断感和拖尾；
2. 对 4 秒与 10 秒 Note 检查高音自然耗尽是否能作为 V1 已知限制；
3. 用 velocity `32 / 64 / 96 / 127` 比较 constant、linear amplitude 和 squared amplitude；
4. 记录“只有单采样层、velocity 只能改音量”是否足以称为 V1 基础采样钢琴，而不是完整物理
   钢琴模拟。

2026-08-13 的人工试听在用户自己的浏览器和 Codex 内置 Chromium 中均成功发声。使用当前
`0.133 s linear release` 没有感知到明显的电平突变或 click；该结果足以关闭 Batch 4A.2 的
“资源能否真实加载、解码并平滑结束单音”验证，但不是专业监听环境下的音质认证。

本次结果确认：

- `0.133 s linear release` 可以作为进入生产 Runtime 实现与后续 A/B 比较的无明显 click 基线；
- Sample 短于长 Note 时自然结束是当前无 loop 资产的已知 V1 限制，Runtime 不猜测循环点；
- 单采样层只能用 gain 表达 velocity，不能据此宣称完整物理钢琴真实性；
- 踏板、半踏板、弦共鸣、制音器建模、release sample、踏板噪声和多力度音色层继续明确延期。

以下内容没有被这次“可听且无明显 click”结论自动批准为最终生产规则：

- Manifest `curve: null` 的正式 fallback，以及 linear amplitude 与 exponential / linear-dB
  release 哪一种更自然；
- velocity 使用 linear 还是其他曲线；
- 长 Note 自然耗尽的产品提示与可接受范围；
- Chrome-first 是否足够，或首次可听闭环必须同时通过 Safari / Firefox；
- “Studio Grand”在 V1 中可承诺的钢琴真实性描述。

## 6. Batch 4B 加载策略建议

根据静态内存差异，建议提交审阅的 V1 策略是：

1. 先读取并验证 Manifest；
2. 从当前稳定 Playback Plan 收集整次计划实际引用的唯一 Sample resource key；
3. Transport 进入 Playing 前 Fetch 并 decode **全部计划所需资源**；不默认解码完整 30-WAV
   Instrument，也不只准备首个 Scheduler horizon；
4. 任一计划必需资源失败则本次 Play 保持失败 / 未开始，明确报告并允许重试；未被计划引用的
   缺失资源不阻断本次 Play；
5. 成功 AudioBuffer 可进入应用级可丢弃缓存；失败 Promise 必须移除；加载仍受 request identity
   与 `AbortSignal` 控制；
6. 若后端只交付单个 ZIP，网络层可能仍需取得完整 Bundle，但解码集合仍按计划裁剪；若后端同时
   提供可寻址 WAV，则只 Fetch 计划所需资源。两种交付形状共用同一 Manifest，不进入 Playback
   契约。

该策略比“首个 horizon 后台补载”更容易保证 V1 不在曲目中途漏音，同时避免单音项目固定承担
63.14 MiB 解码缓存。人工试听已经通过，但加载建议仍须在 Batch 4B 生产代码开始前连同 release
fallback、velocity 映射和浏览器范围一起确认。

## 7. 本批明确不做

- 不接 Project Snapshot、Compiler、Transport 或 Scheduler；
- 不建立正式 Sample Loader、AudioBuffer cache、Voice Token 或 `allNotesOff`；
- 不实现 loop、envelope 曲线解释、mutex、Pan、Track / Master Gain 或多 Voice 调度；
- 不把浏览器测量时间当作跨设备性能门槛；
- 不在本批顺带进入 Batch 4B；生产策略先随下一批计划单独确认。
