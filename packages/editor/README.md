# @seele-daw/editor

`editor` 负责把指针、键盘和 MIDI 输入解释为可预览、可取消、最终只提交一次的项目编辑。它拥有编辑会话状态，但不拥有 Track、Clip、Note 等项目事实。

> 当前状态：仅完成 `common`、`browser` 和公开入口骨架。

## 包定位

当前仓库采用架构总纲的初期五包结构：长期文档中的 `editor-core` 和尚未稳定的 `editor-renderer` 暂时合并在本包内。

```text
DOM / Pointer / Keyboard / MIDI
-> EditorInput
-> EditorIntent
-> Tool Interaction State Machine
-> Preview
-> ProjectCommand
-> project-core atomic commit
```

`common` 保存框架无关的编辑语义；`browser` 保存 DOM/Canvas 适配和当前阶段的 Renderer。Renderer 边界稳定且满足独立拆包条件后，再评估 `editor-renderer` package。

## 主要职责

| 领域          | 规划职责                                                              |
| ------------- | --------------------------------------------------------------------- |
| EditorSession | Selection、focused surface、active tool、内部 Clipboard               |
| 输入          | DOM/MIDI 事件归一化为框架无关的 EditorInput                           |
| Surface       | 坐标转换、Hit Test、Snap candidates、Read Model                       |
| Tool          | Idle/Pressed/Dragging/Committing/Cancelled 显式状态机                 |
| Preview       | Drag ghost、box selection、snap result，不写 ProjectModel             |
| 命令解析      | 根据上下文把 EditorIntent 转成完整 ProjectCommand                     |
| Read Model    | 面向可见范围的稳定查询结果，不复制完整项目                            |
| Renderer      | Canvas 2D 分层、Display List、空间索引、dirty region、frame scheduler |

## 状态所有权

本包可以拥有：

- Selection、focus、active tool 和 clipboard；
- zoom、scroll、viewport 等视图状态；
- pointer capture、drag origin、preview geometry 等交互状态；
- Renderer 的可重建缓存。

本包不能拥有或复制一份可写 ProjectModel。删除实体、Undo/Redo 和项目切换后，Selection 必须按稳定 ID 清理或恢复；Preview 不进入 History、Autosave 或 Playback compiler。

## 建议的内部模块

```text
src/
├── common/
│   ├── input/        EditorInput 与 EditorIntent
│   ├── session/      Selection、focus、clipboard
│   ├── surfaces/     Surface 契约与领域坐标
│   ├── tools/        交互状态机、约束与取消语义
│   ├── snap/         吸附候选和策略
│   └── read-models/  面向编辑器的查询适配
├── browser/
│   ├── input/        DOM 事件与 pointer capture
│   └── renderer/     Canvas、viewport、hit test 与图层缓存
└── index.ts          唯一公开入口
```

目录按真实功能逐步建立，不能把 `common` 变成无归属工具集合。

## 关键交互规则

- 所有鼠标容差和 handle 尺寸以 CSS pixel 定义，再转换到领域坐标。
- `pointermove` 只更新 Preview，`pointerup` 才生成唯一 ProjectCommand。
- 每次手势必须定义 Escape、`pointercancel`、失焦和实体失效时的取消行为。
- V1 中，若依赖实体在手势期间被修改或删除，优先取消并提示，不做隐式 rebase。
- Clipboard payload 不复用原项目 ID；Paste 生成新 ID 并通过一次事务提交。
- Canvas 只能发出 intent/command，不能直接修改 ProjectModel。

## 依赖边界

- 只依赖 [`@seele-daw/project-core`](../project-core/README.md) 的公开 API。
- `common` 禁止 Vue、Pinia、DOM、Canvas 和 Web Audio。
- `browser` 可以使用 DOM/Canvas，但禁止依赖 Vue 和 `audio-web`。
- 不导入 `apps/studio` 或具体 Feature 内部文件。
- 不解释 Audio Runtime、Transport 或设备状态机。

Vue 组件、Workbench command/context key 和 Feature Contribution 的装配属于 `apps/studio`；本包只提供可复用编辑机制和浏览器适配。

## 分阶段计划

1. 建立 EditorSession、Selection 和统一 EditorInput。
2. 实现 Piano Roll Surface、坐标链、Hit Test 与可见范围 Read Model。
3. 实现 Draw/Move/Resize/Delete Note 工具及单次提交手势。
4. 增加 Canvas 分层 Renderer、空间索引和局部重绘。
5. 扩展 Arrangement、Audio Clip、Automation 等 Surface。
6. profiling 证明有必要后，再评估 OffscreenCanvas、Worker Renderer 或独立渲染包。

## 测试与验收

- 输入归一化、坐标 round trip、Hit Test 与 Snap 边界测试；
- Tool 状态机的 down/move/up/cancel 全路径测试；
- 拖拽过程中模型不变，pointerup 仅产生一次命令；
- 实体删除、Undo/Redo、项目切换后的 Selection 清理；
- 10k 可见图元下的裁剪、命中与绘制性能；
- Canvas 键盘入口、焦点和语义摘要的可访问性测试。

## 架构依据

- [Web DAW 简洁架构总纲](../../docs/architecture/web-daw-architecture-brief.md)
- [Web DAW 长期路线与架构设计 v3](../../docs/architecture/web-daw-long-term-architecture-v3.md)
