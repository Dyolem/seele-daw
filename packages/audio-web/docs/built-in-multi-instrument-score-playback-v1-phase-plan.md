# Built-in Multi-Instrument Score Playback V1 阶段计划

> Status: MI0 / MI1A committed as `f7af1db`; MI1B committed as `7c36a17`; MI1C committed as
> `fddeb3e`; MI2 committed as `f13df2f`; MI3A implementation pending review
>
> Date: 2026-09-03
>
> Scope owner: Studio Composition Root、`@seele-daw/project-midi`、
> `@seele-daw/playback` 与 `@seele-daw/audio-web`

本文定义在统一 Workbench Action Catalogue、菜单与快捷键之前插入的多乐器阶段。目标是让用户
能够用总谱 Standard MIDI File 验证既有 Sample Voice 音质，而不是把所有 Track 都错误播放为
Studio Grand。

相关术语见
[多乐器总谱播放 V1 术语表](./built-in-multi-instrument-score-playback-v1-glossary.md)。既有
Velocity、Envelope、Loop、复音和 CC64 术语仍以
[Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)为准。

## 1. 阶段起点事实与问题

本节保留 MI0 规划时的起点。当前架构当时已经具备多乐器所需的大部分底层边界：

- Instrument Track 保存通用 `seele.sample-instrument` Device Descriptor，其中 V1 opaque state
  只含稳定 `soundbankId`；Project Core 不需要增加音源专用字段或升级 Project File。
- Playback Compiler 按 Track Device 解码 `soundbankId`，Audio Web 按 Soundbank 聚合计划所需
  Pitch，并可在一个 Runtime 中准备和执行多个 Manifest。
- Standard MIDI File Decoder 已保存每个 normalized Track 的 `channel` 与 `programNumber`；
  `@tonejs/midi` 会按 `[Program, Channel]` 拆分含多 Program 或多 Channel 的来源 Track。
- Project MIDI 的 Instrument Factory 已收到完整 `sourceTrack`，但 Studio 当前忽略 Program，
  始终创建 Studio Grand。

因此本阶段不先改 Project schema，而是补齐以下真实缺口：

1. 本地资产准备脚本只配置 Studio Grand，尚不能安全、确定性地规范化独立 Soundbank 集合。
2. Studio 没有内置 Instrument Catalogue，也不能把通用 Sample Instrument 投影为可选音色。
3. MIDI Program 和 Channel 10 尚未映射为 Project Device；不支持内容没有可见的静音占位语义。
4. 总谱常见的初始 CC7 Volume / CC10 Pan 尚未转成现有 Track Channel Facts。
5. 多 Soundbank 的加载内存、缺失资源、Loop / One-shot / Choke、混合 Peak 和清理尚未门禁。

## 2. V1 产品行为

阶段完成后，用户应能：

1. 创建 Instrument Track 时仍默认获得 Studio Grand。
2. 在 Track Inspector 从经过审核的内置总谱核心集中显式选择音色；一次选择形成一次既有
   Instrument Device Replace Command、一次 History 步骤，并支持 Undo / Redo、Save / Reload。
3. 导入总谱 MIDI 时，Studio 根据 normalized Track 的 Program 与 Channel 创建明确音源，而不是
   把所有 Track 静默替换成钢琴。
4. 对已支持 Program 使用对应音源；对审核过的近似映射显示非阻断诊断；对无法合理映射的 Program
   保存可见、无声且可手动修复的占位 Device。
5. MIDI Channel 10（内部零基 Channel `9`）使用 General MIDI Percussion，不服从普通旋律
   Program 的默认钢琴规则。
6. 在首个 Note 起点之前或同一 Tick 最后生效的 CC7 / CC10，分别初始化 Track Gain / Pan；其后
   动态变化仍明确诊断并延期。
7. 在本地开发资产存在时播放含多个乐器的总谱；某个项目已保存的未知或缺失 Device 始终原样
   round-trip，不被 Studio Grand 静默替换。

本阶段不提供远程安装、可分发音源包、搜索式 Instrument Browser、Preset 管理或 Preview
Audition。当前开发者本地资产继续被 `.gitignore` 和 Studio dist guard 排除在生产构建之外。

## 3. 已确认产品决策

### 3.1 首批范围是总谱核心集，不承诺完整 General MIDI

V1 以约 22 个本地 Sample Soundbank 覆盖常见管弦总谱验证。下表中的 Program 是 SMF / 代码使用
的零基 `0...127`；面向用户显示时使用 `1...128`。

| 乐器族     | V1 核心音色                                                         | 零基 GM Program / 路由             |
| ---------- | ------------------------------------------------------------------- | ---------------------------------- |
| Keyboard   | Studio Grand                                                        | `0`                                |
| Bass       | Acoustic Bass                                                       | `32`                               |
| Strings    | Violin、Viola、Cello、Contrabass                                    | `40...43`                          |
| Strings    | Tremolo Strings、Pizzicato Strings、Harp、String Ensemble           | `44`、`45`、`46`、`48`             |
| Brass      | Trumpet、Muted Trumpet、Trombone、Tuba、French Horn、Brass Ensemble | `56`、`59`、`57`、`58`、`60`、`61` |
| Woodwind   | Oboe、Bassoon、Clarinet、Flute                                      | `68`、`70`、`71`、`73`             |
| Percussion | Timpani                                                             | `47`                               |
| Drum kit   | General MIDI Percussion                                             | Channel `9` 专用路由               |

每个最终 Catalogue Entry 必须拥有来源无关的 Seele `soundbankId`、显示名称、乐器族、开发资产
相对位置、GM 映射、独立音域和审核记录。除既有 `studio-grand` 外，具体 ID 与来源选择在 MI1B
逐项审核后冻结；一旦进入 Project Fact，不能在相同 ID 下悄悄替换为听感不兼容的资源。

### 3.2 不支持的 Program 不回退为钢琴

映射结果只有三种：

| 结果        | 行为                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| Exact       | 创建已审核的对应 Sample Instrument Device，不产生 Program 丢失提示。           |
| Approximate | 创建明确记录的近似音源，并产生包含来源 Program 与实际音色的非阻断诊断。        |
| Unavailable | 创建可见、无声、可保存的 MIDI Program 占位 Device；其他可播放 Track 继续工作。 |

占位不是缺失资产错误。它表示产品知道来源 Program、但 V1 没有审核过合理音源。MI3 必须用独立
Descriptor 语义表达，不能伪造一个不存在的 Sample `soundbankId`，也不能让首次 Play 因预期的
不支持 Program 而阻断全部总谱。

相反，如果 Catalogue 声称某个 Soundbank 可用、但它的本地 Manifest/WAV 缺失或损坏，这是开发
安装或资源完整性失败：首次 Play 继续 fail-fast；播放中的选择性 Instrument Replace 只跳过目标
Soundbank，并保留不相关 Track。

### 3.3 初始 CC7 / CC10 随 Program 映射一起交付

- 初始状态取对应 normalized Track 首个 Note Tick 之前或同 Tick 最后生效的控制值。
- CC7 `0...127` 映射为 Track Linear Gain `value / 127`。
- CC10 以 `64` 为中心：`0 -> -1`、`64 -> 0`、`127 -> 1`，两侧分别按 `64` 和 `63`
  归一化，避免中心偏移。
- 缺失 CC7 / CC10 时保持当前默认 Gain `1`、Pan `0`。
- 初始值进入现有 Track Channel Project Facts；动态事件不进入隐式 Runtime 状态。
- 首个 Note 之后的 CC7 / CC10、CC11 Expression、Bank Select CC0 / CC32 和其他 Controller
  继续产生明确诊断。本阶段不把它们伪装成已支持 Automation。

## 4. 数据与依赖流

```text
Standard MIDI File
  -> @seele-daw/midi-file: normalized Track { channel, programNumber, CC, Notes }
  -> @seele-daw/project-midi: Project Track collection + diagnostics
  -> Studio-owned Catalogue / import policy: Device Descriptor + initial Gain / Pan
  -> Project Core: immutable Track / Device facts and one atomic import Command
  -> @seele-daw/playback: soundbank route and browser-independent Voice Plans
  -> Studio Composition Root: same Catalogue resolves same-origin asset base
  -> @seele-daw/audio-web: Manifest/WAV preparation and Sample Voice execution
```

Catalogue 属于 Studio Composition Root 的不可变产品配置，不属于 Project Core、Pinia、Audio Web
或 MIDI File Decoder。Project 只保存 Device Descriptor；Playback 只消费 Descriptor；Audio Web
只消费 Soundbank location 与计划，不扫描 Catalogue。

## 5. 分批实施计划

### MI0 — 阶段契约与术语

- 冻结本文件中的产品行为、三态 Program 映射、Channel 10、初始 CC7 / CC10 和分发边界。
- 增加面向非音频专业读者的中英术语表。
- 更新 PRODUCT 与 Audio Web README，但不把计划写成用户已经可用的能力。

### MI1A — 配置驱动的本地规范化核心

- 把 Studio Grand 专用 orchestration 提取为包内工具核心；真实消费者仍只有 Studio Grand。
- 每个 Definition 显式提供 `soundbankId`、来源 slug、预期显示名、来源 GM Program 与
  canonical/candidate 角色、产品音域、生成目录、ZIP 预算和全部六个输入文件的 SHA-256。
- 只允许写入 `generated/<single-safe-segment>`；来源路径必须保持在本地 Soundbank Root 内。
- 规范化前验证 Catalog / Index / Mapping / Archive 身份、外部与内嵌 Mapping 一致性、精确 Archive
  Entry 集合、WAV 格式/时长和音域覆盖。
- 已存在输出必须在文件集合和逐文件 SHA-256 上完全一致；工具不得覆盖、合并或清理冲突目录。
- 使用临时目录原子发布新输出；异常只清理本次 staging，不修改既有生成目录。
- 通过合成 WAV/ZIP 临时 fixture 自动测试；再运行真实 Studio Grand 命令证明现有 32 个输出文件
  全部保持 current。

MI1A 不增加第二个 Soundbank、不改变 Manifest schema、不修改声音算法或 Studio UI。

### MI1B — 总谱核心 Soundbank Definition 与资产报告

- 逐个审核核心音源的来源、Mapping 控制、独立音域、Loop / Release、Zone 数、Archive/WAV 预算和
  输入指纹；不得把钢琴 `21...108` 音域硬套给其他乐器。
- 每个音源独立生成 `manifest.json`、`preparation-report.json` 与所需 WAV。
- 建立汇总清单，但各音源 Definition 仍是各自完整的失败边界；一个来源漂移不批准其他条目。
- 实测浏览器单资源上限、Manifest 上限、编码字节和 decoded Float32 预算，再决定是否调整当前
  `64 KiB / 4 MiB` 限制，不能按 ZIP 总大小猜测。

MI1B 的冻结身份、来源角色、逐音源指标和本地库存证据见
[Built-in Score Core Soundbank Audit](./built-in-score-core-soundbank-audit.md)。本批只建立开发资产，
不会提前接入 Studio Catalogue；其中 GM Percussion 的原始 gated Manifest 必须等 MI1C 转换后
才能成为产品候选。

### MI1C — General MIDI Percussion 兼容政策

当前候选 General MIDI Percussion Mapping 被来源标为普通 instrument，不能直接依赖 kit 默认值。
本批建立一个专用、可审计的兼容转换：

- 鼓件按 `one-shot` 自然播放，不因短 Note Off 或 CC64 提前结束；
- Closed / Pedal / Open Hi-hat 的 MIDI `42 / 44 / 46` 使用明确 Choke Group；
- Timpani 仍是普通 melodic gated instrument，不继承 Drum Kit 政策；
- 转换只匹配已记录来源身份和精确 Pitch，不扩大通用 Mapping Adapter 的猜测能力。

实现与本地证据见
[General MIDI Percussion Compatibility Policy V1](./general-midi-percussion-compatibility-policy-v1.md)。
本批仍只生成开发者本地 Manifest；Studio Catalogue 与 Channel 10 产品路由分别留给 MI2 / MI3A。

### MI2 — Studio Catalogue 与 Instrument 选择

- 增加 Studio-owned、冻结且可测试的内置 Instrument Catalogue；同一条目同时提供 Inspector
  Presentation 与浏览器 asset location，避免两份映射漂移。
- Playback package root 只公开 Studio 真实需要的通用 Sample Device factory/decoder。
- Project Track Coordinator 增加按 Catalogue ID 选择音源的用例，复用既有 Replace Command，保持
  Device ID 和 Track topology。
- Inspector 提供按乐器族分组的最小选择器，可替换 Ready、Empty 或 Missing Instrument；失败时
  旧 Descriptor 不变并显示 Toast。
- 旧项目未知 Descriptor 保持 Missing 与 round-trip；新 Track 默认仍是 Studio Grand。
- 不在本批预建 Action Catalogue、Command Palette、用户 Keymap 或完整 Instrument Browser。

本批的 Studio 所有权、22 项目录、三态 Inspector、命令 / 资源失败分界与延期记录见
[Studio Built-in Instrument Catalogue V1](../../../apps/studio/docs/built-in-instrument-catalogue-v1.md)。

### MI3A — Program / Channel 10 导入映射

- Studio import factory 使用 `sourceTrack.programNumber` 与 `sourceTrack.channel` 查询映射政策。
- Project MIDI 只对未应用、近似或占位结果产生相符诊断，移除旧的无条件
  `PROGRAM_NOT_APPLIED` 语义。
- Channel 10 优先走 Percussion 路由；旋律 Track 使用 Program 路由。
- “导入为新项目”与“导入为当前项目的新 Track”共用同一 Factory 和诊断政策。
- 同一来源 Track 的中途 Program Change 继续沿用 Decoder 已有 `[Program, Channel]` 规范化拆分；
  `midi-file` 回归 fixture 固定前后 Note 的拆分行为，本阶段不新增动态 Program Change Project
  Fact 或跨拆分 Track 的 Controller State Chase。

本批的通用映射结果契约、21 个精确 Program、Channel 10 优先级、无声占位及兼容边界见
[Studio MIDI Program Import Routing V1](../../../apps/studio/docs/midi-program-import-routing-v1.md)。

### MI3B — 初始 CC7 / CC10

- Project MIDI 从 normalized Track 推导一次性的初始 Track Channel 值。
- 导入 Track Collection 原子保存 Device、Gain、Pan、Clip、Note 与 CC64。
- 对后续动态 CC7 / CC10 和其他未支持 CC 保留精确事件数量与 Controller 诊断。
- 既有无 Controller 导入结果必须保持 Gain `1`、Pan `0`。

### MI4 — 多 Soundbank Runtime、资源与失败门禁

- Studio 从 Catalogue 派生全部 asset locations，不维护平行 URL Map。
- 验证同一 Soundbank/Pitch 去重、多 Soundbank 并发准备、Abort、失败重试、项目切换和应用 dispose。
- 测量跨总谱重复 Play 后的 Manifest 数、decoded resource 数和 Float32 字节；若当前无界生命周期
  Cache 会保留过多历史音源，本批以测量驱动明确清理/预算政策。
- 验证首次 Play 的配置资源失败为 fail-fast，选择性 Replace 的局部失败不停止无关 Track。

### MI5 — 总谱音质、听测与阶段收口

- 使用可合法纳入测试的最小总谱 MIDI fixture，至少包含 Piano、Strings、Brass、Woodwind、Bass、
  Timpani 与 Channel 10 Percussion。
- 自动验证 Program / Channel 路由、音域覆盖、Loop / One-shot / Choke、CC64、初始 Gain/Pan、
  无 NaN / 满刻度帧、Voice/Node/Cache 清理和 Missing/Placeholder 兼容。
- 浏览器 PCM 测量多音源混合峰值和 Tail；只有证据要求时才调整 gain staging，不为通过测试加入
  隐藏 limiter 或 normalization。
- 人工听测记录音色对应、起音、持续 Loop 接缝、松键、鼓件尾部、Hi-hat choke、声像和声部平衡。
- 运行完整根级 `pnpm check`、Studio Production Build 与 soundbank dist boundary；更新 PRODUCT、
  README 和收口报告后等待审核。

## 6. 质量与失败矩阵

| 场景                           | 必须行为                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Definition 输入指纹变化        | 规范化前失败；不发布新目录。                                                 |
| 专用 Manifest 政策前置条件漂移 | 报 `manifest-policy-mismatch`；不猜测、不产生部分输出。                      |
| ZIP 多出、缺少、重复或大小超限 | 失败关闭；不信任未声明 Entry。                                               |
| 已生成目录与新结果不同         | 报 `output-conflict`；不覆盖用户或审核资产。                                 |
| 已支持音源资源缺失             | 首次 Play 失败并说明 Soundbank；不回退钢琴。                                 |
| 不支持 Program                 | 保存可见静音占位；其他 Track 可播放。                                        |
| 近似 Program                   | 播放审核音源并显示一次明确导入诊断。                                         |
| 未知旧 Device                  | 原样保存，显示 Missing，不静默替换。                                         |
| Channel 10                     | 使用 GM Percussion；短 Note Off/CC64 不截断 one-shot。                       |
| 持续管弦音色                   | 只执行 Manifest 声明的 Loop；不因 Studio Grand 无 Loop 而禁用其他音源 Loop。 |
| 总谱资源较大                   | 只准备计划实际 Pitch；测量并约束解码缓存，不能一次默认加载完整音源库。       |
| 播放失败                       | 不回滚合法 Project Commit、Import 或 Instrument Replace。                    |

## 7. 明确延期

- 完整 General MIDI 128 Program、GS/XG、Bank Select、远程或可分发音源安装。
- 动态 CC7 / CC10、CC11 Expression、CC1 Modulation、Pitch Bend、Aftertouch、MPE 与 Automation。
- Key Switch、Articulation Lane、Legato transition、Round Robin、Velocity Layer、Release Sample、
  Resonance、Pedal Noise 与物理乐器建模。
- 完整 Instrument Browser、Preset Library、Preview Audition、第三方插件与 Synth Runtime。
- Action Catalogue、菜单/快捷键统一、Velocity 编辑和 WAV Offline Export；它们继续排在本阶段之后。

这些延期意味着 V1 总谱可以验证“多音色路由、现有采样执行和混合基础”，但不能宣称完整复现专业
总谱播放器的演奏法、动态塑形或 General MIDI 兼容性。
