# Seele Project File Format V2

## 协议状态

本文档定义 Seele DAW `formatVersion: 2` 项目文件相对 V1 的规范性变化。未在本文修改的顶层、
Track、Clip、Note、Timeline、Device、Master 和 JSON 安全规则继续沿用
[Project File Format V1](./project-file-format-v1.md)。

V2 的唯一领域扩展是持久化 Source-owned MIDI Sustain Pedal CC64 Event。V2 不加入通用 MIDI
CC、Automation、Pitch Bend、Aftertouch、MPE、half-pedal 发声模型或音源控制参数。

## 版本路由

- 当前 writer 只写 `formatVersion: 2`；
- reader 先只读取 `formatVersion`，再选择严格 V1 或严格 V2 decoder；
- V1 decoder 成功后执行确定性的 V1 → V2 migration；
- V2 decoder 直接返回当前 DTO；
- 其他数字版本失败关闭，不按 V1 或 V2 字段猜测；
- V1 不能包含 V2 字段，V2 也不能缺少 V2 必填字段。

## MidiSourceDTO V2

V2 的每个 `MidiSourceDTO` 只允许以下必填 property：

| Property             | JSON 类型                        | 语义                            |
| -------------------- | -------------------------------- | ------------------------------- |
| `id`                 | string                           | MidiSource opaque ID            |
| `lengthTick`         | positive safe integer            | Source 长度                     |
| `notes`              | MidiNote entity table            | V1 已有 Note 内容               |
| `sustainPedalEvents` | Sustain Pedal Event entity table | Source-owned MIDI CC64 原始事件 |

Entity table key 必须与 Event 内部 `id` 完全相同；object property 枚举顺序不是领域时间顺序。

## MidiSustainPedalEventDTO

每个 Event 只允许：

| Property  | JSON 类型               | 范围 / 语义                           |
| --------- | ----------------------- | ------------------------------------- |
| `id`      | non-empty opaque string | Project 内唯一的 Event ID             |
| `tick`    | safe integer            | `0..source.lengthTick`，相对于 Source |
| `value`   | safe integer            | 原始 MIDI CC64 值 `0..127`            |
| `channel` | safe integer            | MIDI Channel `0..15`                  |

控制器编号 64 由实体类型固定，不重复存储 `controller: 64`。当前解释 `value >= 64` 为 Pedal Down，
`value < 64` 为 Pedal Up，但文件保留原值，不提前量化为布尔值。

同一 Source、Tick 和 Channel 最多存在一个 Event；不同 Channel 可以共享 Tick。Event ID 在全部
Source 分区中全局唯一。CC64 不修改或替代 Note 的 `durationTick`。

## V1 到 V2 迁移

已经通过严格 V1 decoder 的 DTO 按以下纯函数迁移：

```text
formatVersion: 1 -> 2
每个 MidiSource:
  sustainPedalEvents = {}
其余已校验字段保持值不变
```

迁移不会：

- 根据长 Note 猜测踏板；
- 创建显式 Pedal Up Event；
- 延长或截短 Note；
- 读取音源、Sample Loop 或 Envelope；
- 修改 Project ID、实体 ID、Track 顺序或 Device opaque state。

迁移结果与全部嵌套容器必须保持深度只读，并安全保留 `__proto__` 等合法 opaque key。

## 校准与兼容样本

V2 由以下层共同保护：

1. 本规范文档；
2. `project-file-v2-protocol.ts` 的编译期字段校准；
3. `decodeProjectFileDTO` 的版本路由与严格结构校验；
4. 当前领域 normalizer 与 InvariantValidator；
5. 静态 V2 golden JSON 与当前 writer 的等价测试；
6. 静态 V1 golden JSON 的严格读取和 V1 → V2 空事件表迁移测试。

参考实现：

- DTO：`src/persistence/project-file-dto.ts`
- V1 协议：`src/persistence/project-file-v1-protocol.ts`
- V2 协议：`src/persistence/project-file-v2-protocol.ts`
- Decoder / router：`src/persistence/project-file-decoder.ts`
- V1 → V2 migration：`src/persistence/project-file-v1-to-v2-migration.ts`
- 当前领域 normalizer：`src/persistence/project-file-normalizer.ts`
- 当前 writer：`src/persistence/project-file-projector.ts`
- V1 golden：`src/__tests__/fixtures/project-files/v1/complete-project.json`
- V2 golden：`src/__tests__/fixtures/project-files/v2/complete-project.json`

## 非目标

Project File V2 只证明 CC64 项目事实能够无损保存和恢复。它不证明 Standard MIDI File 已导入或
导出 CC64，不证明 Playback / Audio Runtime 已执行踏板，也不证明任何音源支持 Sample Loop、
release sample、共鸣、pedal noise 或 half-pedal。
