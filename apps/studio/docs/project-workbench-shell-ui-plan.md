# Project Workbench Shell UI 实施计划

## 目标

本切片把 Project Workspace 的 “Project ready” 占位页替换为 Piano Black Workbench Shell，
建立编辑器长期使用的稳定区域骨架：

```text
Project Workspace Route
└── Workbench Shell
    ├── Global Bar
    ├── Transport chrome
    └── Workspace
        ├── Track column
        ├── Arrangement host
        └── Context Editor Dock
```

本切片必须让现有 Project lifecycle 能力可见且可操作，同时为后续 Arrangement 和 Piano
Roll 提供明确挂载区域。

## 本阶段包含

- Global Bar：
  - Project menu；
  - Seele 品牌与 Project name；
  - Saved / Unsaved / Saving / Failed 状态；
  - Save / Retry Save；
  - 返回 Project Entry，并继续经过全局 dirty navigation guard。
- Transport chrome：
  - Undo / Redo 接入现有 `ProjectSession` History；
  - Tempo、Time Signature 与初始 Project Snapshot 对齐；
  - Playback、Record、Loop 与 Master 输出以 Disabled chrome 呈现，直到真实 runtime 接入；
  - Context Editor Dock 重新打开入口。
- Track column：
  - Track toolbar 与空状态；
  - Add Track 保持 Disabled，直到 Track Command 与产品模板切片完成。
- Arrangement host：
  - 时间标尺、区域边界和空的编辑表面挂载点；
  - 不渲染 Track、Clip、播放头、选择、Zoom 或 Drag Preview。
- Context Editor Dock：
  - Docked、Minimized、Closed 与 Workspace Fullscreen；
  - Pointer 与 Keyboard Splitter resize；
  - Maximize 与退出全屏时恢复之前高度；
  - Inspector / Editor Tools 与 Piano Roll host 的空间关系；
  - 没有当前 MIDI Clip 时显示稳定空状态。
- 小于 900 px 的明确 Desktop Workspace 提示。

## 明确不包含

- Arrangement Canvas / DOM renderer；
- Track、Clip、Device 或颜色编辑；
- Piano Roll、Note、Velocity 与 Selection；
- Playback、Audio graph、录音和电平；
- Command Registry、Keybinding、Context Menu 与完整 Project menu；
- Workbench Preference 持久化；
- 自动保存、beforeunload 或多标签页协调。

不支持的操作必须 Disabled，不创建看似可用但没有结果的按钮。

## 状态所有权

| 状态                        | 权威与生命周期                                     |
| --------------------------- | -------------------------------------------------- |
| Project、dirty、save status | `ActiveProjectService`                             |
| Project name、tempo、meter  | Project 切换时从稳定 `ProjectSnapshot` 读取一次    |
| Undo / Redo availability    | 当前 raw `ProjectSession`，不进入 Pinia 或深层代理 |
| Dock mode / height          | Workbench Shell 本地浅状态，可重建且本阶段不持久化 |
| Playback / Record / level   | 尚无权威 runtime，因此只显示 Disabled chrome       |
| Arrangement / Piano Roll    | 后续 Editor 模块拥有，Shell 只提供 host            |

Project 切换时 Shell 必须销毁本地交互状态；Splitter 的 Pointer Capture 不能越过组件生命周期。

## 交互与可访问性

- Icon-only Button 使用 `UiIconButton`，必须提供 `aria-label` 与 Tooltip；
- Project menu 使用 Reka UI Dropdown Menu 管理键盘导航、焦点和关闭行为；
- Splitter 命中高度至少 12 px，使用 `role="separator"`、数值 ARIA 和方向键；
- Fullscreen 指 Workbench workspace，不调用浏览器 Fullscreen API；
- Unsupported controls 同时使用 `disabled` 和解释性 Tooltip；
- 状态不能只依靠颜色；Save 文案和图标必须同步表达；
- 所有功能图标使用 Fluent UI System Icons，并在构建期本地打包。

## 验收

- deep-link Open、missing Project、open failure 与 generation 竞态行为不回归；
- Save 成功 / 失败 / Retry 与 dirty 显示来自 Active Project 权威状态；
- 返回 Project Entry 继续经过已安装的 navigation guard；
- Undo / Redo 只调用当前 Project Session；
- Dock minimize、restore、close、reopen、maximize、fullscreen 与 resize 可测试；
- Unsupported editor / playback 操作不可触发虚假状态；
- ProjectSession 不进入 Pinia 或 Vue 深代理；
- Production UI 不使用 Raw Hex、Emoji、任意阴影或任意 `z-index`；
- lint、architecture、workspace type-check、全部测试和 Studio production build 通过；
- 完成本独立 Shell 切片后停止，等待 UI 审查后再规划 Arrangement。

## 实施结果

- `ProjectWorkspacePage` 已在 Project ready 后组合唯一的 `ProjectWorkbenchShell`；
- Global Bar 已接入真实 Project name、dirty、save status、Save / Retry Save 和返回 Project
  Entry；
- Transport 已接入当前 `ProjectSession` 的 Undo / Redo；尚无 runtime 的播放、录音、循环和
  Master 输出保持 Disabled；
- Track column 和 Arrangement host 已建立稳定区域边界，未实现 Track、Clip 或编辑行为；
- Context Editor Dock 已实现 Docked、Minimized、Closed、Maximized、Workspace Fullscreen 和
  Pointer / Keyboard resize；
- 通用 `UiIconButton` 和 `UiButton` leading icon slot 已纳入同一 Piano Black 交互语义；
- 所有功能图标继续使用构建期按需引入的 Fluent UI System Icons；
- architecture、workspace type-check、全部测试和 Studio production build 已通过；
- Studio 当前为 20 个测试文件、108 项测试；
- 按本轮约定未执行浏览器视觉验证，界面外观由项目负责人直接审查。
