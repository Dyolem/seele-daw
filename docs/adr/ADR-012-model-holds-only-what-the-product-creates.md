# ADR-012：模型只保留产品会创建的概念

- 状态：Accepted
- 日期：2026-11-10
- 实施：与本文同一提交

## Context

项目模型里有三组概念，没有任何东西创建它们：

- Audio Track：记录、工厂、判别字段、文件解码与不变量都有，但没有命令能创建；
- 效果链：Track 的 `midiEffectIds`、`audioEffectIds` 与 Master 的 `audioEffectIds` 永远是空数组；
- Clip Loop：`AddMidiClipCommand` 能写入，但没有界面使用，Piano Roll 把它显示为不可编辑，播放
  计划把它报告为不支持。

代价落在真实功能上。Track 与 Clip 都带一个只有一种取值的 `kind`，读它们的地方都要先收窄；不变量
要检查效果设备的归属和 Loop 区间；播放计划为永远不会出现的 Master 效果保留了 `blocked` 状态与
`blocking` 级别；编辑器为 looped Clip 维护“不支持”的投影和放置拒绝原因；命令要拒绝 Audio Track
上的 Clip、带效果链的导入和 looped Clip 的扩展。没有用户数据需要兼容。

## Decision

1. 删除 Audio Track、Track 与 Master 的效果链、Clip Loop。三种记录变成：
   - `InstrumentTrackRecord`：`{ id, name, color, channel, instrumentDeviceId }`；
   - `MidiClipRecord`：`{ id, trackId, name, color, muted, startTick, spanTick, sourceId, sourceOffsetTick }`；
   - `MasterChannelRecord`：`{ gain, muted }`。
2. 只有一种取值的判别字段一起删除，Track 与 Clip 不带 `kind`。`TrackRecord` 与 `ClipRecord` 是
   各自唯一记录的别名；第二种分支出现时再变成联合，并加回判别字段。
3. 播放计划只有 `playable`、`partial`、`empty` 三种状态，诊断只有 `info` 与 `warning`；Solo 仍是
   全局的。编辑器的 Clip 投影只有一种。命令错误码 `instrument-device-track-kind-mismatch`、
   `instrument-track-device-chain-unsupported` 与 `looped-midi-clip-unsupported` 删除；导入的 Clip
   指向别的 Track 时报 `midi-clip-track-id-mismatch`。
4. 项目文件升到 `formatVersion: 4`。按 ADR-005，旧文件直接拒绝，不迁移。
5. 以后一个概念进入模型，要同时有命令创建它、有消费者解释它（长期架构第 2 节第 7 条）。

## Consequences

- 读 Track 与 Clip 的代码不再收窄；不变量、解码器、诊断、错误码与测试夹具都变小。
- 浏览器里保存的格式 3 项目打不开，要重新创建或重新导入 MIDI。
- 这些概念回来时要带着当时确定的语义重新设计，不是把旧字段加回去：效果链要说清串联顺序、旁通
  与缺失设备（阶段 3）；Audio Track 与 Audio Clip 一起加入（阶段 5）；Clip Loop 要先定循环边界上
  的事件顺序（长期架构第 5 节第 5 条）。

## Validation

- project-core 的记录、解码与不变量测试按新字段改写；黄金文件 `project-file.json` 重新生成。
- `audible-midi-compiler.spec`：一个 Solo 的 Track 即使自己的乐器不能发声，也让其他 Track 静音。
- `pnpm check` 全部通过。

## Revisit Trigger

- 阶段 3 加第一个效果器、阶段 5 加 Audio Track，或者产品决定做 Clip Loop：按当时的语义加回，
  并升级文件格式。
