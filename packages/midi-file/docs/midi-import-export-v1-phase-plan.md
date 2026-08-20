# Standard MIDI File Import / Export V1 阶段计划

> Status: In progress
>
> Started: 2026-08-18
>
> Current checkpoint: MI3 accepted and committed; MI4 implemented, review pending
>
> Scope: SMF Codec、Project 映射、浏览器文件边界与 Studio 导入导出纵向切片

## 1. 产品结果

V1 允许用户从 Project Entry 选择 `.mid` / `.midi` 文件并创建一个新的本地项目，也允许从当前
项目菜单把全部已创作 MIDI 事实下载为 `.mid`。MIDI 文件是交换格式，不替代 Seele Project File
与 Checkpoint。

导入必须先完整解析和验证，再原子创建项目与首个 Checkpoint；失败不能留下 Project Catalog、
Checkpoint 或活动会话的部分状态。导出读取当前内存 Snapshot，不要求先保存，也不修改 dirty、
History 或 Playback Runtime。

## 2. 已确定边界

- V1 接受 SMF Type 0 / Type 1 与 PPQ time division；Type 2 和 SMPTE division 返回明确错误；
- 导入创建新项目，不在 V1 合并到当前项目；
- `@seele-daw/midi-file` 不依赖 Project Core，拥有中立 `MidiFileDocument` 与可替换 Codec Port；
- Decoder 采用封装后的 `@tonejs/midi`；其类型和对象不得穿过 package root；
- Encoder 与 Decoder 独立替换。V1 Writer 固定输出 Type 1，以确定性规则排列同 tick 事件；
- Project / MIDI bridge 负责 PPQ 960、Track / Clip / Note 与诊断，并持久化 Composition Root 提供
  的默认 Instrument Device；Studio Grand 选择本身不反向进入 bridge；
- Studio 是唯一 Composition Root；浏览器 File / Blob / Download 能力归 `platform-browser`；
- 导入不通过成千上万次 Project Command 模拟编辑；它是经过完整验证的文档加载边界；
- 不为该阶段编写 E2E；完成 UI 后由用户使用真实 MIDI 文件手动验证。

## 3. V1 交换语义

- Import 保留 Note、Channel、Program、Tempo、Time Signature 与 Track Name，并把来源 PPQ 换算到
  Project PPQ 960；
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

### MI4：Studio 导入体验（已实现，待审核）

- Project Entry 增加 Import MIDI；
- 展示阻断错误和非阻断诊断摘要；
- 成功后打开干净项目，并覆盖长歌曲自动扩展 Ruler / Arrangement 的集成测试。

实施边界：Project Entry 以次要操作选择单个 `.mid` / `.midi` 文件；Studio Coordinator 严格按
Browser 字节读取、SMF 解码、Project Import Draft 验证、`createFromSession` 持久化的顺序组合。
SMF 内嵌名称优先，缺失时使用文件名；导入 Track 持久化 Studio Grand。阻断失败留在 Project
Entry，非阻断诊断以导入摘要 Toast 呈现，成功后进入首个 Checkpoint 已保存的 clean Workbench。
本批次不增加拖放、批量导入、容量加固或 E2E。

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

- 合并导入当前项目、拖放导入与批量导入；
- SMF Type 2、SMPTE time division 与 Web MIDI 硬件 I/O；
- 完整 General MIDI 音源映射；
- MIDI CC / Pitch Bend / Aftertouch / MPE / SysEx Project Facts 与编辑 UI；
- 原始未知事件的无损 round-trip；
- Worker / WASM Parser、流式解析、后台导入服务与 E2E。
