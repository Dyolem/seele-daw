# Standard MIDI File Import / Export V1 阶段计划

> Status: In progress
>
> Started: 2026-08-18
>
> Current checkpoint: MI7 Batch 1 implemented, pending review
>
> Scope: SMF Codec、Project 映射、浏览器文件边界与 Studio 导入导出纵向切片

## 1. 产品结果

V1 允许用户从 Project Entry 或 Workbench 项目菜单选择 `.mid` / `.midi` 文件并创建一个新的
本地项目，也允许从 Workbench 项目菜单或 Arrangement 末尾把来源内容作为新的 Instrument Track
追加到当前项目。后续 Export 从当前项目菜单把全部已创作 MIDI 事实下载为 `.mid`。MIDI 文件是
交换格式，不替代 Seele Project File 与 Checkpoint。

导入必须先完整解析和验证：新项目模式再原子创建项目与首个 Checkpoint，当前项目模式则用一个
Project Command 原子追加全部新 Track。失败不能留下 Project Catalog、Checkpoint、活动会话或
Track 图的部分状态。导出读取当前内存 Snapshot，不要求先保存，也不修改 dirty、History 或
Playback Runtime。

## 2. 已确定边界

- V1 接受 SMF Type 0 / Type 1 与 PPQ time division；Type 2 和 SMPTE division 返回明确错误；
- V1 提供“创建新项目”和“作为新 Track 追加到当前项目”两个显式意图；后者不把内容合并进
  既有 Track / Clip，也不导入来源 Tempo 或拍号；
- Workbench 内的两种导入入口必须明确表达目标；“创建新项目”在文件完整读取、解码和映射后，
  以最新当前项目状态复用 Save / Discard / Cancel 导航确认，再开始新项目生命周期写入；
- `@seele-daw/midi-file` 不依赖 Project Core，拥有中立 `MidiFileDocument` 与可替换 Codec Port；
- Decoder 采用封装后的 `@tonejs/midi`；其类型和对象不得穿过 package root；
- Encoder 与 Decoder 独立替换。V1 Writer 固定输出 Type 1，以确定性规则排列同 tick 事件；
- Project / MIDI bridge 负责 PPQ 960、Track / Clip / Note 与诊断，并持久化 Composition Root 提供
  的默认 Instrument Device；Studio Grand 选择本身不反向进入 bridge；
- Studio 是唯一 Composition Root；浏览器 File / Blob / Download 能力归 `platform-browser`；
- 新项目导入不通过成千上万次 Project Command 模拟编辑，而是经过完整验证的文档加载边界；
  当前项目 Track 导入使用一个携带完整所有权图的原子 Project Command；
- 不为该阶段编写 E2E；完成 UI 后由用户使用真实 MIDI 文件手动验证。

## 3. V1 交换语义

- 新项目 Import 保留 Note、Channel、Program、Tempo、Time Signature 与 Track Name，并把来源 PPQ
  换算到 Project PPQ 960；当前项目 Track Import 保留 Track 内容子集；
- Project 保留 `5..999 BPM` 内 Tempo 的完整浮点精度；导入不静默 clamp、倍增或删除有效的密集
  Tempo Event，同一 Project tick 的碰撞仍保留来源时间上最后生效的一枚；
- “作为新 Track”导入只做 PPQ 与 Track 内容映射，来源 Tempo / Time Signature 不参与校验或写入，
  当前项目的时间轴事实继续生效；
- 一个来源 Track 包含多个 Channel / Program 时，允许 Codec 输出多个 normalized Track；
- Meta-only conductor Track 不创建空 Instrument Track；
- 导入 Track V1 持久化选择 Studio Grand；Program / Bank 先用于名称和诊断，不静默替换为未准备
  Runtime 的音源；
- CC、Pitch Bend、Aftertouch、SysEx 等尚无 Project Fact 的事件不得宣称完整往返；具体诊断与
  Sustain CC64 处理在 Project bridge 批次落地前复核；
- Export 输出全部创作事实，不受 Mute、Solo 或当前播放状态影响；
- Gain、Pan、Device Descriptor 与其他 Seele 私有事实不写入 MIDI；
- Loop Clip 在 V1 不静默丢弃，Project exporter 必须返回明确诊断或阻止导出。

## 4. 批次

### MI1：Codec 契约与第三方隔离（已完成）

- 新建 `@seele-daw/midi-file`；
- 定义中立 Document、Decoder / Encoder Port 与稳定错误；
- 封装 `@tonejs/midi` Decoder，并为当前 Export 子集提供独立 Type 1 Encoder；
- 用自有字节 fixture 固定 Type 0/1、PPQ、Running Status、velocity-zero Note Off、Meta、CC、
  Pitch Bend 和编码顺序契约；
- 纳入 workspace 类型、测试、质量与架构检查。

已由提交 `d944a60` 完成并通过审核。

### MI2：Project Import Bridge（已完成）

- 建立不依赖 Browser / Vue 的 MIDI → Project Import Draft 映射；
- 实现有理数 PPQ 换算、Note 范围与配对结果处理、Tempo / 拍号去重、Track / Clip 布局；
- 生成稳定诊断，并通过 Project File 加载边界验证完整项目不变量。
- 默认 Device 通过工厂注入；MI2 不依赖 Playback，也不创建 Catalog、Checkpoint 或 Active Project。

已由提交 `144fddc` 完成并通过审核。

### MI3：项目生命周期与浏览器读取（已完成）

- 为 `ActiveProjectService` 增加通用的 validated-session 创建路径；
- 在 `platform-browser` 增加本地文件读取 Adapter；
- 保证失败无 Project Catalog / Checkpoint 部分写入。

实施边界：`ActiveProjectService.createFromSession` 复用新项目的冲突检查、首个 Checkpoint 和 clean
save-point 语义；IndexedDB Store 继续在同一事务中提交 Checkpoint、Head 与 Catalog。本批次只增加
`Blob -> Uint8Array` 读取能力，不提前创建文件选择 UI、Decoder / Bridge Composition 或路由跳转。

已由提交 `88da6fc` 完成并通过审核。

### MI4：Studio Project Entry 导入体验（已完成）

- Project Entry 增加 Import MIDI；
- 展示阻断错误和非阻断诊断摘要；
- 成功后打开干净项目，并覆盖长歌曲自动扩展 Ruler / Arrangement 的集成测试。

实施边界：Project Entry 以次要操作选择单个 `.mid` / `.midi` 文件；Studio Coordinator 严格按
Browser 字节读取、SMF 解码、Project Import Draft 验证、`createFromSession` 持久化的顺序组合。
SMF 内嵌名称优先，缺失时使用文件名；导入 Track 持久化 Studio Grand。阻断失败留在 Project
Entry，非阻断诊断以导入摘要 Toast 呈现，成功后进入首个 Checkpoint 已保存的 clean Workbench。
本批次不增加拖放、批量导入、容量加固或 E2E。

已由提交 `fca1c49` 完成并通过审核。

### MI5：Studio Workbench 导入入口（已完成）

- Workbench 项目菜单增加 `Import MIDI as new project…`；
- Arrangement 在最后一个 Track Lane 下方增加同语义入口；空 Arrangement 也保留可发现入口；
- 两处入口共用 Project Workspace 拥有的单文件选择、Busy 状态、失败反馈与导入摘要；
- 文件完整验证后，以最新当前项目状态复用既有 Save / Discard / Cancel 确认。Cancel 或 Save
  失败不得创建 Project Catalog、Checkpoint 或活动 Session；
- 成功后打开独立的 clean 项目；不把 MIDI Track 合并到当前 Project，也不修改被替换项目的事实。

实施边界：MI5 只增加 Workbench 内现有“导入为独立项目”能力的入口，不增加拖放、批量导入、
导入到当前项目、Track Merge 或 E2E。Project Entry 与 Workbench 继续复用同一 Import
Coordinator 和结果摘要，浏览器文件选择仍由页面拥有。

实现验证：`pnpm lint`、Studio type-check、Studio 48 个测试文件 / 306 项测试与完整
`pnpm check` 均通过；按阶段约定未新增 E2E，也未由实现方执行浏览器人工测试。

已由提交 `2b95ee9` 完成并通过审核。MI6 随后替换了 Arrangement 入口语义，但保留项目菜单中的
该动作。

### MI6：导入为当前项目的新 Track（已完成）

- Project Core 增加通用的原子 Instrument Track 集合 Command，一次携带每条 Track 的 Device、
  Clip、MIDI Source 与 Note 所有权图；成功只形成一个 revision 和一个 History 步骤；
- `project-midi` 复用同一 Track 映射建立 Track Import Draft，不创建替代 Session，不读取或替换
  目标 Project 的 Project ID、名称、Tempo、拍号与既有内容；
- Workbench 项目菜单同时保留 `Import MIDI as new project…` 并新增
  `Import MIDI as new tracks…`；Arrangement 末尾和空态入口改为后者；
- 文件完成读取与解码后，对最新 READY Active Project 的 Session 追加新 Track。成功后停留在
  当前路由、项目变为 dirty，并选中第一条导入 Track；Undo 一次移除整个导入批次；
- 无 Note 的来源不产生空 Track，也不提交空 History；ID 冲突、所有权错误或 Project 范围错误在
  写入前整体失败；来源 Program 继续只产生诊断，默认 Device 仍由 Studio 注入为 Studio Grand；
- 两种导入共享文件选择 Busy 与错误反馈，但只有“新项目”流程需要 Save / Discard / Cancel 导航
  确认。“新 Track”流程不创建 Catalog 或首个 Checkpoint，也不自动保存。

实施边界：MI6 不增加拖放、批量文件导入、把来源内容合并进既有 Track / Clip、来源 Tempo / 拍号
合并策略或 E2E；真实浏览器功能测试仍由用户执行。

实现验证：根级 lint、workspace type-check、全部 workspace 测试、Studio production build 与
soundbank dist boundary 均通过；Project Core 为 29 个测试文件 / 415 项测试，`project-midi` 为
3 / 20，Studio 为 48 / 310。按约定未新增 E2E，也未执行浏览器人工测试。

已由提交 `4697c48` 完成并通过审核。

### MI7：当前项目 MIDI 导入语义加固（分批实施中）

#### Batch 1：Tempo 与拍号所有权（已实施，待审核）

- Tempo 是 Project 全局事实，不是 Track 属性；“导入为当前项目的新 Track”保留来源 Note 的音乐
  Tick 位置，并始终按目标 Project Tempo Map 播放；
- 来源 Tempo 与拍号不缩放 Note Tick、不覆盖或合并当前时间轴，并产生可机读的非阻断所有权诊断；
- Studio 的成功反馈明确说明保留当前 Tempo / 拍号，但不把这两项预期诊断升级成警告；来源
  Program、CC 等其他未支持事实仍按原规则产生 warning。

### ME1：Project Export Bridge

- Snapshot → `MidiFileDocument`；
- 写出 conductor Track、Track 顺序、全局 Note tick 与确定性事件顺序；
- 在进入 Studio 前确认并测试 UTF-8 / 单字节 SMF 文本互操作策略，禁止静默破坏项目或 Track 名称；
- 使用语义 reparse 测试，不要求二进制逐字节相等。

### ME2：浏览器下载与 Studio 导出体验

- `platform-browser` 增加 Blob 下载 Adapter；
- Project 菜单增加 Export MIDI 与成功 / 失败反馈；
- 导出不得改变 Project dirty、History、Selection 或 Playback。

### 收口

- 畸形文件、容量上限、失败恢复和真实文件 fixture 加固；
- 更新 PRODUCT、架构和 package 文档；
- 运行完整 `pnpm check`，由用户完成真实浏览器手动验证。

## 5. 明确延期

- 把来源内容合并进既有 Track / Clip、拖放导入与批量文件导入；
- SMF Type 2、SMPTE time division 与 Web MIDI 硬件 I/O；
- 完整 General MIDI 音源映射；
- MIDI CC / Pitch Bend / Aftertouch / MPE / SysEx Project Facts 与编辑 UI；
- 原始未知事件的无损 round-trip；
- Worker / WASM Parser、流式解析、后台导入服务与 E2E。
