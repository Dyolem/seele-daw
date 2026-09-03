# Built-in Score Core Soundbank Audit

> Status: MI1B reviewed and committed as `7c36a17`; MI1C committed as `fddeb3e`; refreshed for
> MI5 URL-safe asset names
>
> Date: 2026-09-03
>
> Asset classification: developer-local validation fixtures; not Seele distributable assets

本文记录 Built-in Multi-Instrument Score Playback V1 首批 22 个 Soundbank 的来源身份、产品身份、
控制文件语义与资源预算。术语见
[多乐器总谱发声 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)，阶段顺序与失败
政策见
[Built-in Multi-Instrument Score Playback V1 阶段计划](./built-in-multi-instrument-score-playback-v1-phase-plan.md)。

本文件只证明本地资产可以被确定性规范化，不单独证明 Studio 选择、Program 导入路由或产品分发。
MI2 / MI3A 已分别接入 Studio 手动选择与导入路由；本批生成的 Manifest/WAV 和库存 JSON 全部位于
被 Git 忽略、被 production build 排除的 `apps/studio/public/soundbanks`。

## 1. 冻结身份与路由意图

机器可执行配置位于
`scripts/built-in-score-core-local-instruments.ts`。每个条目冻结：

- 来源无关的 Seele `soundbankId`、产品显示名与乐器族；
- MI3A 使用的 Program 或 Channel 10 路由意图；
- 当前本地来源 slug、来源索引 Program 与 canonical/candidate 角色；
- 产品可寻址 Pitch 范围、逐来源 ZIP 安全预算；
- 公共 Catalog、GM Index、Soundbank Map，以及独立 Catalog、Mapping、WAV Archive 共六个输入的
  SHA-256。

产品路由与来源索引身份不能混用。`muted-trumpet` 的未来产品路由是 GM Program `59`，但当前本地
来源把所选 Straight Mute 记录为 Program `56` 下的非 canonical candidate。解析器同时验证来源
Index 与 Soundbank Map 中的这两项事实；代码没有伪造一个不存在的来源 Program 59 条目。

Studio Grand 延续既有 `studio-grand` ID、`21...108` 产品范围与安全预算。General MIDI
Percussion 只覆盖 Mapping 中连续存在的精确 Pitch `35...81`。其余 20 个 melodic Soundbank
采用各自 Mapping 明确声明的 `21...119` 可寻址范围，而不是复制钢琴 `21...108`。这个范围表示
“来源允许 Runtime 选择 Sample”，不等于真实乐器的自然演奏音域；MI5 fixture 已验证代表 Pitch，
极端移调是否需要收窄仍须人工听测，Runtime 不会把范围外 Note 悄悄 clamp 到边界。

## 2. 实际规范化结果

执行：

```sh
pnpm --filter @seele-daw/audio-web prepare:score-core-local
```

首次 MI1B 执行中，Studio Grand 为 `current`，其余 21 个 Soundbank 为 `created`。每次重新审核后
的第二次执行必须让全部 22 个目录和库存报告保持 `current`；任一现有文件缺失、多出或内容变化
都会失败，工具不会覆盖冲突目录。

MI5 真实浏览器门禁发现来源中 34 枚 WAV 名称含 `#`，直接用作 public URL 会被浏览器解释为
fragment。规范化工具现为全部资源生成 `sample-<四位序号>-<内容哈希>.wav`，并在单音源
`preparation-report.json` schema version 2 中保留 `sourceArchiveKey`。重建前后的 362 枚 WAV
内容哈希集合完全一致；变化只发生在 Manifest 资源键与审计报告，不改变 PCM 或控制语义。

下表的 Route / Source 均为零基 Program；`Ch 10` 对应内部 Channel `9`。Zones / Loops 统计最终
Manifest，Release 是当前 Mapping 提供并由既有 Adapter 转换的秒数。Archive / Entries 是压缩包
MiB 与 Entry 数；Encoded / Float32 是完整 Soundbank 的 WAV 编码 MiB 与浏览器解码 Float32 估算
MiB；Manifest 使用 KiB。

| Soundbank ID                | 产品显示                | Route / Source       |  Pitch | Zones / Loops | Release | Archive / Entries | Encoded / Float32 | Manifest |
| --------------------------- | ----------------------- | -------------------- | -----: | ------------: | ------: | ----------------: | ----------------: | -------: |
| `studio-grand`              | Studio Grand            | P0 / 0 canonical     | 21…108 |        30 / 0 |   0.133 |        21.22 / 31 |     31.57 / 63.14 |     20.3 |
| `acoustic-bass`             | Acoustic Bass           | P32 / 32 canonical   | 21…119 |         8 / 0 |   0.133 |          3.34 / 9 |      6.00 / 12.00 |      5.6 |
| `solo-violin`               | Violin                  | P40 / 40 canonical   | 21…119 |       15 / 15 |   0.133 |         5.55 / 16 |      5.89 / 11.78 |     11.2 |
| `viola-section`             | Viola                   | P41 / 41 canonical   | 21…119 |       14 / 14 |   0.133 |        11.02 / 15 |     11.53 / 23.07 |     10.5 |
| `cello-section`             | Cello                   | P42 / 42 canonical   | 21…119 |       14 / 14 |   0.133 |        14.35 / 15 |     14.76 / 29.51 |     10.5 |
| `double-bass-section`       | Contrabass              | P43 / 43 canonical   | 21…119 |       14 / 14 |   0.133 |         8.06 / 15 |      8.35 / 16.70 |     10.6 |
| `string-ensemble-tremolo`   | Tremolo Strings         | P44 / 44 canonical   | 21…119 |       21 / 21 |    0.09 |        35.37 / 22 |     37.35 / 74.70 |     16.1 |
| `string-ensemble-pizzicato` | Pizzicato Strings       | P45 / 45 canonical   | 21…119 |        21 / 0 |    0.09 |         4.12 / 22 |      6.00 / 11.99 |     14.3 |
| `orchestral-harp`           | Harp                    | P46 / 46 canonical   | 21…119 |        21 / 0 |   0.133 |         4.84 / 22 |      6.15 / 12.30 |     14.1 |
| `timpani`                   | Timpani                 | P47 / 47 canonical   | 21…119 |         8 / 0 |   0.133 |          2.25 / 9 |       3.07 / 6.13 |      5.5 |
| `string-ensemble`           | String Ensemble         | P48 / 48 canonical   | 21…119 |       27 / 27 |   0.133 |        17.85 / 28 |     18.99 / 37.98 |     21.1 |
| `trumpet`                   | Trumpet                 | P56 / 56 canonical   | 21…119 |         9 / 9 |    0.02 |         3.43 / 10 |       3.87 / 7.73 |      7.0 |
| `muted-trumpet`             | Muted Trumpet           | P59 / 56 candidate   | 21…119 |        10 / 0 |    0.04 |         0.23 / 11 |       0.31 / 0.61 |      6.9 |
| `trombone`                  | Trombone                | P57 / 57 canonical   | 21…119 |         8 / 8 |    0.02 |          2.95 / 9 |       3.38 / 6.76 |      6.2 |
| `tuba`                      | Tuba                    | P58 / 58 canonical   | 21…119 |       12 / 12 |    0.08 |         6.70 / 13 |      7.02 / 14.03 |      9.0 |
| `french-horn`               | French Horn             | P60 / 60 canonical   | 21…119 |       14 / 14 |    0.08 |         5.66 / 15 |      6.08 / 12.17 |     10.5 |
| `brass-ensemble`            | Brass Ensemble          | P61 / 61 canonical   | 21…119 |       12 / 12 |    0.08 |         3.86 / 13 |       4.08 / 8.16 |      9.2 |
| `oboe`                      | Oboe                    | P68 / 68 canonical   | 21…119 |       11 / 11 |    0.08 |         6.69 / 12 |      7.15 / 14.29 |      8.2 |
| `bassoon`                   | Bassoon                 | P70 / 70 canonical   | 21…119 |       14 / 14 |    0.02 |         5.02 / 15 |      5.29 / 10.57 |     10.7 |
| `clarinet`                  | Clarinet                | P71 / 71 canonical   | 21…119 |       16 / 16 |    0.08 |        10.78 / 17 |     11.50 / 22.99 |     12.0 |
| `flute`                     | Flute                   | P73 / 73 canonical   | 21…119 |       16 / 16 |    0.08 |         7.78 / 17 |      8.35 / 16.69 |     11.9 |
| `general-midi-percussion`   | General MIDI Percussion | Ch 10 / -1 canonical |  35…81 |        47 / 0 |   0.133 |         4.26 / 48 |      6.67 / 13.33 |     30.7 |

## 3. 集合预算与现有限制

本地库存报告：

- 路径：`measurements/score-core/preparation-inventory.json`；
- Schema：`seele.local-score-core-preparation-inventory` version 2；MI1C 新增每个条目的命名
  `manifestPolicy`；
- SHA-256：`6faff68a9c7adf521195a809d405f6b7b849047fbb19397247eedc8fb071b82b`。

集合实测为：

| 指标                  |                               结果 |
| --------------------- | ---------------------------------: |
| Soundbank             |                                 22 |
| Zone / WAV Resource   |                          362 / 362 |
| Loop Zone             |                                217 |
| One-shot / Group Zone |                             47 / 3 |
| 生成文件              |                                406 |
| Archive 压缩总字节    |                        194,322,921 |
| Archive 解压总字节    |                        223,880,912 |
| WAV 编码总字节        |                        223,705,752 |
| 完整集合 Float32 估算 | 447,379,648 bytes（约 426.65 MiB） |
| Manifest 总字节       |                            268,280 |

当前 Studio 加载上限无需因 MI1B 立即放宽：

- 最大 Manifest 是 General MIDI Percussion 的 `31,459` bytes，低于当前 `64 KiB`；
- 最大单 WAV 编码资源是 Tremolo Strings 的 `2,272,752` bytes，低于当前 `4 MiB`；
- 最大单 WAV 解码 Float32 是 `4,545,416` bytes；最大完整 Soundbank 是 Tremolo Strings 的
  `78,330,376` bytes；
- Runtime 仍只准备 Playback Plan 实际 Pitch 需要的资源，不应在打开项目时解码完整 426.65 MiB
  集合；MI4 已基于 22 音源参考集合增加 Studio 默认 `192 MiB` decoded Float32 LRU 保留预算，
  证据见
  [Multi-Soundbank Runtime Resource Gate V1](./multi-soundbank-runtime-resource-gate-v1.md)。

每个 Definition 的 Archive、Entry 数、单 Entry、总解压大小均使用独立的向上取整 MiB 档位，
而不是给所有来源共享最大的 64 MiB 预算。完整输入 SHA-256 与精确限制保存在机器可执行配置中；
任何来源内容变化都会先触发指纹失败，不能仅因仍低于大小上限而自动接受。

## 4. 控制语义与保留风险

- 15 个持续弦乐、铜管或木管 Soundbank 共保留 217 个来源 Loop Zone；Studio Grand、Bass、
  Pizzicato、Harp、Timpani、Muted Trumpet 与 GM Percussion 当前没有有效 Loop。Muted Trumpet 的
  `loopStart = loopEnd = 0` 被正确解释为 no-loop，不伪造循环。
- MI1B 没有增加力度层、Round Robin、Release Sample、CC1、CC11、动态 CC7/10 或 Articulation；
  Velocity 仍只改变单层 Sample 的增益。
- General MIDI Percussion 的来源 Mapping 仍被标记为普通 instrument；MI1C 的命名政策已经在严格
  来源身份与 47 个 exact-key 前置条件后，将全部 Zone 转为 one-shot，并只给 MIDI `42 / 44 / 46`
  增加对称 fast Hi-hat Choke。政策与证据见
  [General MIDI Percussion Compatibility Policy V1](./general-midi-percussion-compatibility-policy-v1.md)。
  该资产转换本身不等于 Studio Catalogue 或 Channel 10 产品路由；两者分别由 MI2 与 MI3A 接入。
- MI5 已对七个代表 Soundbank 的真实多声部混合执行 PCM 峰值、尾窗、路由、Loop / Choke 选择和
  生命周期自动门禁；22 音色人工听测仍为 `not-run`。音色审美、极端移调、可闻 Loop 接缝和声部
  平衡不能由指纹或自动数值替代。
- 当前来源许可证据仍不足以支持随产品分发；所有输出继续只是开发者本地验证资产。

## 5. MI1B 验收结论

MI1B 可以批准的历史结论仅为：22 个来源已经通过固定身份、六输入指纹、独立安全预算、
Manifest/WAV 规范化、资源统计和幂等发布门禁；当时 Studio Grand 输出逐字节不变。MI5 随后只为
浏览器兼容重命名所有生成 WAV 资源键并升级审计报告；Studio Grand 与其余音源的 WAV 内容仍
逐字节不变，Manifest / report 因可追溯的新寻址方式而有预期变化。

它本身不代表 MIDI Program 或 Channel 10 已经自动接通。MI1C 已在本地资产边界完成 General MIDI
Percussion 的 one-shot / choke 兼容转换；MI2 / MI3A 随后用 Studio Catalogue、可见 Instrument
选择器与导入路由消费这些已审核身份。MI4 已提交多 Soundbank Runtime 资源门禁；MI5 自动总谱
PCM 已通过，人工听测仍记录为 `not-run`。完整证据见
[Built-in Multi-Instrument Score Playback V1 收口报告](./built-in-multi-instrument-score-playback-v1-closure-report.md)。
