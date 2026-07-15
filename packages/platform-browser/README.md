# @seele-daw/platform-browser

`platform-browser` 封装浏览器基础设施，为项目内核、编辑器和播放系统定义的服务端口提供 IndexedDB、OPFS、文件、权限、Worker、设备与运行能力实现。

> 当前状态：仅完成 package 骨架和公开入口。长期架构中的 `browser-infra` 对应当前包。

## 包定位

本包隔离“浏览器如何完成 I/O 和资源操作”，不定义项目、编辑或播放语义。所有实现由 `apps/studio` 的 Composition Root 创建并注入核心端口，核心包不能反向依赖本包。

```text
core service ports
-> apps/studio composition root
-> platform-browser implementations
-> IndexedDB / OPFS / File APIs / Worker / permissions
```

## 主要职责

| 领域              | 规划职责                                                     |
| ----------------- | ------------------------------------------------------------ |
| Capability Probe  | Web Audio、Worklet、OPFS、SAB、MIDI、File Picker 等能力画像  |
| Project Storage   | IndexedDB snapshot、journal、manifest、checkpoint 与恢复状态 |
| Asset Storage     | OPFS temp/completed blob、hash、manifest 引用与保守 GC       |
| File I/O          | 项目 bundle、音频导入、WAV/项目导出与 fallback               |
| Workers           | 通用任务、Storage Worker、协议、取消、超时和 backpressure    |
| Permissions       | persistent storage、media、MIDI 和文件选择授权               |
| Browser Lifecycle | visibility/pagehide、配额、设备变化、睡眠与恢复信号          |
| Diagnostics       | quota、pending I/O、checkpoint、worker crash 和降级原因      |

## 持久化边界

IndexedDB 与 OPFS 不能组成跨存储原子事务。新资产必须采用引用提交协议：

```text
write OPFS temp
-> flush / close / hash verify
-> mark completed blob
-> IndexedDB transaction commits AssetRecord + project reference
-> clean unreferenced temp later
```

Project journal 只能引用 completed blob。显式 Save 只有在待引用资产完成、journal flush、最新 snapshot/checkpoint 成功后才能报告 `saved`。

Snapshot 采用新记录加 checkpoint 指针切换，不能原地覆盖唯一有效副本；Asset GC 使用 snapshot、checkpoint、journal 和 pending recording 作为 roots 做保守 mark-and-sweep。

## 建议的内部模块

```text
src/
├── capabilities/   RuntimeCapabilities 与功能 profile
├── storage/
│   ├── indexed-db/ snapshot、journal、manifest
│   └── opfs/       blob、recording、cache 与 GC
├── assets/         import、hash、引用提交和 bundle
├── files/          picker、download 与 fallback
├── workers/        protocol、pool、storage worker
├── permissions/    storage/media/MIDI 权限
├── lifecycle/      page、quota、device 事件
└── index.ts        唯一公开入口
```

目录按纵向切片逐步建立；Persistence 和 Asset 边界在至少两个上层消费者出现且职责稳定前，不拆成新的 package。

## Worker 与能力原则

- Worker 协议必须包含 `protocol`、`version`、`requestId`，并定义取消、超时、progress、错误码和重启。
- 只有 CPU、I/O 或隔离收益明确的任务进入 Worker，不为“使用 Worker”而异步化。
- SharedArrayBuffer 依赖安全上下文和 cross-origin isolation，只是增强路径。
- 无 SAB 时使用 MessagePort fallback，不改变项目格式或正确性语义。
- Capability Probe 返回能力组合；业务代码不能按浏览器品牌分支。
- 能力不足时显式禁用并说明原因，不能静默改变录音、保存或播放语义。

## 依赖边界

- 本包实现端口，不拥有 ProjectModel、Selection、Transport 或 Audio Runtime。
- 核心包禁止 import `platform-browser`；实现由 Studio 组合根注入。
- 如需端口类型，只能从其所有者 package 的公开入口导入，并在 manifest 中声明显式 workspace dependency。
- 禁止绕过公开入口读取其他包内部文件。
- 缓存必须可删除重建；原始资产和项目引用必须保守处理。

## 分阶段计划

1. 实现 RuntimeCapabilities probe 和统一错误/降级状态。
2. 用 IndexedDB 保存和恢复 Project Snapshot，完成首条 MIDI 纵向切片。
3. 增加 journal queue、连续 sequence、checkpoint 和崩溃恢复。
4. 建立 Worker 协议、项目迁移和大任务执行通道。
5. 增加 OPFS asset store、导入 pipeline、引用提交与项目 bundle。
6. 后续实现 recording pending files、Storage Worker、配额处理和保守 GC。

## 测试与验收

- IndexedDB transaction abort、quota failure 和 crash injection；
- snapshot + 连续 journal 恢复到最后一致 `modelRevision`；
- journal gap、checksum 损坏和迁移失败停在最后一致状态；
- OPFS completed 前项目绝不引用 Asset；
- Worker 取消、超时、backpressure、崩溃重启和协议版本不兼容；
- 清空可重建缓存后项目仍能完整打开；
- 浏览器 E2E 覆盖权限拒绝、无 OPFS、无 SAB 和页面生命周期变化。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
