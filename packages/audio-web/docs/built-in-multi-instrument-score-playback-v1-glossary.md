# Built-in Multi-Instrument Score Playback V1 术语表

> Status: Active reference for the approved V1 phase
>
> Date: 2026-09-03

本文用直白中文解释多乐器总谱接入中反复出现的 MIDI、采样音源、资源和兼容性术语。它不要求
读者预先了解音频行业。Velocity、dBFS、Envelope、Voice Stealing、CC64 和声音尾部等基础概念
另见 [Audio Quality Foundation V1A 术语表](./audio-quality-foundation-v1a-glossary.md)。

## 1. MIDI 文件与乐器路由

| 中文           | 英文                                 | 在本阶段中的准确含义                                                                                                                           |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 总谱 MIDI      | Score MIDI / Multi-track MIDI        | 含多个声部 Track 的 Standard MIDI File，例如钢琴、弦乐、铜管、木管和打击乐。MIDI 保存演奏指令，不自带可听 WAV 音色。                           |
| 标准 MIDI 文件 | Standard MIDI File / SMF             | `.mid` / `.midi` 文件格式。它可保存 Note、Program、Controller、Tempo 等事件，但不会规定播放器必须使用哪套采样素材。                            |
| MIDI Track     | MIDI Track                           | 文件中的事件轨。Decoder 可能把一个来源 Track 按 Channel 和 Program 拆成多个 normalized Track。它不等同于 Seele Project Track。                 |
| 规范化 Track   | Normalized Track                     | Decoder 保证只对应一个 MIDI Channel 和一个当前 Program 的中立 Track。它让创建 Project Instrument Track 时可以选择一个初始音源。                |
| MIDI Channel   | MIDI Channel                         | MIDI 逻辑通道，协议值为 `0...15`，用户通常看到 `1...16`。Note 与 Controller 是否互相影响，首先由 Channel 决定。                                |
| Channel 10     | MIDI Channel 10 / Percussion Channel | 用户看到的第 10 通道，代码值为 `9`。General MIDI 通常把它用于鼓组；不同 Pitch 代表不同鼓件，而不是同一乐器的不同音高。                         |
| 音色编号       | Program Change / Program Number      | `0...127` 的 MIDI 乐器编号。用户手册常写成 `1...128`，因此阅读日志和界面时必须注意是否零基。Program 只表达期望乐器类别，不包含声音数据。       |
| 来源索引身份   | Source-index Identity                | 本地资产目录把某个 Sample 来源记录在哪个 Program 下、是否为 canonical。它用于验证资产来源，不必等于 Seele 将来接收 MIDI 时采用的产品路由。     |
| 产品导入路由   | Product Import Route                 | Seele 对来源 MIDI Program 或 Channel 10 作出的产品映射。例如 Muted Trumpet 可以路由 Program 59，同时其审核资产仍是 Program 56 下的 candidate。 |
| 动态换音色     | Mid-track Program Change             | 播放途中改变 Program。当前 Decoder 会按 `[Program, Channel]` 拆分事件；V1 不把它保存为可编辑的时间线 Program Fact。                            |
| 通用 MIDI      | General MIDI / GM                    | 对 Program 名称、Channel 10 鼓件 Pitch 等作约定的兼容标准。支持部分 GM Program 不等于完整 GM、GS 或 XG 兼容。                                  |
| 音色库选择     | Bank Select / CC0 + CC32             | Program 之外选择 Bank 的两个 Controller。V1 不应用它们，仍以诊断报告，不能只看 Program 就声称支持来源 Bank。                                   |
| 主音量         | Channel Volume / CC7                 | MIDI Channel 的音量控制。V1 只把首个 Note 前最后生效的值转换成 Project Track 初始 Gain；后续动态变化尚不是 Automation。                        |
| 声像           | Pan / CC10                           | 声音在左右声道间的位置。值 `64` 是中心；V1 只转换初始值，播放中的连续变化延期。                                                                |
| 表情           | Expression / CC11                    | 常用于在 CC7 基础上塑造乐句动态。V1 尚未实现，因此总谱可能有正确音色但缺少渐强、渐弱和呼吸感。                                                 |
| 调制轮         | Modulation / CC1                     | 常用于弦乐或管乐的颤音、动态层或演奏法控制。V1 尚未实现，不能把来源 CC1 当作已经听见。                                                         |

## 2. Project、Catalogue 与 Soundbank

| 中文         | 英文                            | 在本阶段中的准确含义                                                                                                                |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 乐器设备     | Instrument Device               | Instrument Track 持有的可保存 Device Descriptor。它是 Project Fact，决定该 Track 请求哪个声音；不是 AudioNode。                     |
| 设备描述符   | Device Descriptor               | 保存 `typeId`、definition version、参数和 opaque state 的稳定项目记录。未知 Descriptor 必须原样 round-trip。                        |
| 采样乐器设备 | Sample Instrument Device        | `seele.sample-instrument` V1 Descriptor。它的 opaque state 只保存 `soundbankId`，不保存完整 Manifest、WAV 或浏览器对象。            |
| 音源身份     | Soundbank ID                    | Seele 保存并路由音源的稳定产品 ID，例如既有 `studio-grand`。它不是来源下载 slug、文件夹路径或 GM Program。                          |
| 音源         | Soundbank                       | 一套乐器控制定义及其采样素材。例如 Violin 与 Cello 是不同 Soundbank；一个 Soundbank 可用多枚 WAV 覆盖不同 Pitch。                   |
| 内置音源目录 | Built-in Instrument Catalogue   | Studio 拥有的冻结配置，记录可选 Soundbank、显示名、乐器族、GM 映射和本地 asset base。它不进入 Project Core 或 Pinia。               |
| 乐器族       | Instrument Family               | Piano、Strings、Brass、Woodwind、Bass、Percussion 等 UI 分组。它帮助浏览，不改变 Playback 语义。                                    |
| 精确映射     | Exact Program Mapping           | 来源 Program 与已审核 Soundbank 的乐器语义直接对应。它不表示采样品质或演奏法与来源设备完全相同。                                    |
| 近似映射     | Approximate Program Mapping     | V1 没有精确音源，但明确审核某个相近音色作为替代。导入必须告诉用户来源 Program 与实际选择，不能静默伪装。                            |
| 不可用占位   | Unavailable Program Placeholder | Project 保存来源 Program，但 Track 无声并显示可修复状态。它不是损坏资产，也不是隐藏的 Studio Grand fallback。                       |
| 缺失乐器     | Missing Instrument              | Project Descriptor 未知、不兼容，或已声明资源实际缺失。它与“产品明确不支持这个 Program”的占位原因不同。                             |
| 静默回退     | Silent Fallback                 | 系统不提示就换成另一个音色，例如把所有未知 Program 播成钢琴。这里的“silent”指没有告知，不是无声；V1 明确禁止这种行为。              |
| 音色替换     | Instrument Replace              | 用既有 Project Command 改变 Track 的 Instrument Device，同时保持 Device ID 和 Track topology。一次用户选择只形成一个 History 步骤。 |

## 3. 采样、控制文件与发声

| 中文         | 英文                            | 在本阶段中的准确含义                                                                                                                  |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 控制文件     | Mapping / Instrument Definition | 描述 Pitch 范围、根音高、Loop、Envelope、One-shot、Choke 等规则的数据。MIDI 文件不包含这些采样播放规则。                              |
| 兼容适配器   | Compatibility Adapter           | 把某一种已审计来源控制数据转换成 Seele Manifest。来源特有推断必须留在这里，不能污染 Project 或通用 Runtime。                          |
| 控制保留政策 | Preserve-source Controls Policy | 不修改 Adapter 已从来源控制文件得到的 Loop、Envelope、Trigger 或 Mutex。除 GM Percussion 外，本阶段的 Score Core 音源都走这一路径。   |
| 专用兼容政策 | Reviewed Compatibility Policy   | 只对固定来源身份和精确前置条件应用的显式 Manifest 修正。条件漂移时失败，不凭乐器名称或文件夹进行通用猜测。                            |
| 清单         | Sample Instrument Manifest      | Audio Web 接受的严格 Seele V1 运行时契约。它只保留经过支持和验证的 Zone / Resource 语义，不保留远程 URL。                             |
| 区域         | Zone                            | 一条“哪些 Pitch 选哪枚 Sample，并如何播放”的规则。一个 Soundbank 通常包含多个 Zone。                                                  |
| 选择范围     | Selector / Key Range            | Zone 覆盖的单个 MIDI Pitch 或连续 Pitch 范围。总谱出现未覆盖 Pitch 时应明确失败，不能选择随机 Sample。                                |
| 根音高       | Root MIDI Pitch                 | WAV 原始录音对应的 MIDI Pitch。目标音高与根音高差决定播放速率和移调。                                                                 |
| 采样素材     | Sample / WAV Resource           | 真正被浏览器解码和播放的音频文件。MIDI Velocity 或 Program 本身都不是 Sample。                                                        |
| 采样循环     | Sample Loop                     | 在一枚 WAV 的指定区间重复播放，让持续弦乐或管乐不因素材结束而断声。Studio Grand 没有 Loop，不代表其他 Soundbank 不能有。              |
| 持续循环     | Continuous Loop                 | Gate Release 后仍继续循环，再由 Envelope 淡出。它适合某些持续素材，但不等于 Sustain Pedal。                                           |
| 延音循环     | Sustain Loop                    | Gate 保持时循环，最终 Release 后离开循环并播放非循环尾部。它仍是 Sample 规则，不是 CC64 本身。                                        |
| 一次性触发   | One-shot                        | Note On 后让素材自然播完，普通 Note Off 和 CC64 不提前截断。鼓件常用，但不是所有短音都自动是 One-shot。                               |
| 门控发声     | Gated Voice                     | Note / Pedal 的最终 Gate Release 决定何时进入 Release Envelope。钢琴、持续弦乐和管乐候选通常走该路径。                                |
| 互斥组       | Exclusive Group / Mutex Group   | 一组 Voice 可互相关闭。例如 Closed Hi-hat 会截断正在响的 Open Hi-hat。它不是全局同 Pitch 重触发政策。                                 |
| 截音         | Choke                           | 新鼓件触发后快速结束互斥组中的旧 Voice。Hi-hat 是典型场景；Timpani 不应误套同一政策。                                                 |
| 演奏法       | Articulation                    | Long Bow、Staccato、Pizzicato、Muted 等发音方式。不同 Program 或 Soundbank 可以近似表达，但 V1 没有 Key Switch 或 Articulation Lane。 |
| 键位切换     | Key Switch                      | 用特定低音 Note 切换 Articulation 的控制方式。V1 不支持；不能把这些控制 Note 当成普通音乐 Note 播放后声称正确。                       |
| 力度层       | Velocity Layer                  | 同一 Pitch 随 Velocity 选择不同 Sample。当前核心 Soundbank 与 Manifest V1 仍没有这项能力；Velocity 只影响增益。                       |
| 同音轮换     | Round Robin                     | 同一 Pitch/力度连续触发时轮换多枚 Sample，减少“机关枪感”。它需要多素材和选择规则，V1 不支持。                                         |
| 松键采样     | Release Sample                  | Note Off / Gate Release 时额外触发的素材。普通 Release Envelope 只是降低当前 Voice 增益，两者不能混为一谈。                           |

## 4. 本地资产、安全与资源成本

| 中文             | 英文                        | 在本阶段中的准确含义                                                                                                                     |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 开发者本地资产   | Developer-local Assets      | 只在本机开发和试听使用、被 Git 与生产构建排除的 Catalog、Mapping、Archive 和生成 WAV。它们不是可发布产品资产。                           |
| 来源指纹         | Input Fingerprint / SHA-256 | 对每个审核输入文件记录的内容摘要。摘要变化表示来源发生漂移，必须重新审核，不能自动接受。                                                 |
| 规范化           | Normalization               | 把来源 Mapping/WAV 转换成严格、可寻址的 Seele Manifest/WAV 目录。它不是音频响度 normalization。                                          |
| 生成目录         | Generated Asset Directory   | `public/soundbanks/generated/<id>/` 下的开发输出。现有目录必须逐文件相同；工具不会覆盖冲突内容。                                         |
| 临时发布目录     | Staging Directory           | 新输出先完整写入的临时目录，全部成功后再原子 rename。失败只清理本次 staging。                                                            |
| ZIP 安全预算     | Restricted ZIP Budget       | 对压缩包大小、Entry 数、单 Entry 解压大小、总解压大小和压缩率的限制，用于防止异常或恶意归档耗尽资源。                                    |
| 资源字节预算     | Resource Byte Budget        | 浏览器 Fetch 单个 Manifest/WAV 允许的最大编码字节。它不是整套 ZIP 大小，也不是解码后内存。                                               |
| 编码大小         | Encoded Byte Length         | WAV 文件在磁盘/网络中的字节数。PCM WAV 通常压缩很少，但仍与解码后的 Float32 内存不同。                                                   |
| 解码内存         | Decoded Float32 Memory      | AudioBuffer 按声道和帧保存 Float32 所需的内存。总谱同时用多个 Soundbank 时，这是比 ZIP 总大小更关键的运行时成本。                        |
| 缓存保留预算     | Cache Retention Budget      | 允许资源缓存为了下次播放继续引用的解码内存上限。它不包含当前 Prepared Runtime 必须持有的 AudioBuffer，因此不是浏览器进程总内存上限。     |
| 最近最少使用淘汰 | Least Recently Used / LRU   | 缓存超出保留预算时先移除最长时间没有命中的 Resource 引用；命中会把该项提升为最近使用。淘汰不会销毁仍被活动 Voice 引用的 AudioBuffer。    |
| 按需音高准备     | Pitch-demand Preparation    | 只加载当前 Playback Plan 实际用到 Pitch 对应的 WAV，而不是打开项目就解码整套音源库。                                                     |
| 资源定位器       | Asset Locator               | Studio 根据 `soundbankId` 提供同源 asset base 的边界。Audio Web 不扫描 Catalogue，也不猜路径。                                           |
| URL 安全资源名   | URL-safe Resource Name      | 规范化输出只使用不会被浏览器解释为 fragment 或 query 的确定性文件名。来源名可含 `#` 等字符，但只保留在审计映射，不能直接充当 HTTP 路径。 |
| 分发边界         | Distribution Boundary       | Vite Production Build 必须继续排除本地 Soundbank、试听页和开发报告；通过本地播放不代表获得再分发权。                                     |

## 5. 常见误解

- **MIDI Program 不等于声音**：Program 只说明期望乐器；实际听感来自 Soundbank、Mapping、WAV、
  Velocity、Controller 和 Runtime。
- **总谱正确选了乐器，不等于完整复现总谱**：缺少 CC1、CC11、动态 CC7/10、Pitch Bend 或
  Articulation 时，音色类别可以正确，但乐句表现仍会明显不足。
- **Studio Grand 没有 Loop，不等于 Runtime 没有 Loop**：Runtime 已执行 Manifest 的 Loop；
  多乐器阶段必须用真实持续弦乐/管乐验证它。
- **Program 41 与界面“Program 41”可能差一位**：代码 `40` 是用户常见编号 `41` 的 Violin。
- **Channel 10 不是第十种普通乐器**：它通常是鼓件 Pitch Map，必须走独立路由和 One-shot/Choke
  政策。
- **One-shot 不等于永远不停止**：自然结束、显式 Stop、generation invalidation、Voice Stealing
  或安全取消仍可终止它；只是普通 Note Off 不控制其自然尾部。
- **近似映射不等于错误**：经过审核且明确告知时，它是有限音源集的产品选择；不告知才是静默
  兼容性问题。
- **本地可播放不等于可发布**：来源许可与生产分发是独立门禁。
- **资源改名不等于音频归一化**：URL 安全文件名只改变 Manifest 的寻址方式；WAV 内容哈希不变，也不
  改变响度、PCM、Loop 或 Envelope。
