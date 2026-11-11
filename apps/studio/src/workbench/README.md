# Workbench

Studio 的应用层：写项目的用例、用户动作与键盘、项目生命周期与播放适配。组件通过
`useStudio()`（[studio-services.ts](./studio-services.ts)）取得这里的服务；服务由
[组合根](../bootstrap/studio-application.ts)创建和释放。

| 目录          | 内容                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| `edits/`      | 写项目的无状态用例：clips、notes、sustainPedal、tempo、tracks，汇总为 `ProjectEdits` |
| `actions/`    | Action 与焦点上下文的契约、注册表、Coordinator，以及工作台通用的编辑与界面 Action    |
| `keyboard/`   | 键位、输入分派、用户 Keymap 与录制，见 [Keyboard](./keyboard/README.md)              |
| `project/`    | `ActiveProjectService`、项目入口、导航确认、MIDI 导入、播放适配                      |
| `instrument/` | 内置音色目录与 MIDI 导入时的音色路由                                                 |
| `timeline/`   | Arrangement 与 Piano Roll 共用的时间轴刻度、滚动换算与小节位置                       |

`track-palette.ts` 是新建与导入 Track 共用的调色板。本层不导入 `features/`、`router/` 和
`bootstrap/`；多个 feature 共用的状态与几何放在这里，例如 `project/` 下的工作台选择 Store 与
路由位置。

## Edits

每个用例做三件事：用 `requireEditSession` 检查项目已就绪、手势捕获的 Session 与 revision
没有过期；把界面坐标换成命令参数（例如 Clip 内 Tick 换成 Source Tick）；执行一条 Project
Command 并返回 Commit。业务不变量交给 project-core 判断；这里的 `ProjectEditError` 只表达应用
层前置条件。

## Action

一个 Action 是一个用户意图。菜单、按钮、右键菜单和快捷键调用同一个 Action。

```text
Menu / Toolbar / Context Menu ─┐
Keyboard → Input Router ───────┴→ StudioActionCoordinator → 当前上下文的目标 → edits / 服务
```

- 声明：所属 feature 用 `defineStudioAction` 一次写出 ID、文案、类别、检索词、上下文、默认
  键位、是否重复触发，以及 `resolve(target)`。声明所在的文件用一段声明合并把自己的 ID 并进
  `StudioActionIds`，`StudioActionId` 就是它的键，所以本层不必导入任何 feature；组合根的
  [studio-actions.ts](../bootstrap/studio-actions.ts) 按目录顺序汇总全部声明。
- 上下文：`defineStudioContext` 声明 `id`、`label`、`priority`，以及可选的 `overlaps` 与
  `ownsEnter`。视图挂载或聚焦时调用 `contexts.bind(context, target)`，返回的函数用于释放。
  重新绑定会让旧目标失效，旧视图延迟执行的释放不会解绑新目标。
- 调用结果：`unavailable`（没有目标或已禁用，键盘可以回退到更低优先级的上下文）、`failed`
  （解析目标时出错）、`accepted`。被接受的调用随后以 `completed`、`not-applied`、`failed` 或
  `cancelled` 结束。目标失效或应用释放时，等待中的调用以 `cancelled` 结束；取消不会撤销已经
  提交的 Commit。
- 非预期错误只报告一次（控制台加 Toast），反复读取 Presentation 不会重复弹出。

## Project

- `ActiveProjectService`：当前项目的状态机，负责加载、新建、保存与 dirty。
- `ProjectEntryCoordinator`、`ProjectNavigationConfirmationCoordinator`、`ProjectMidiImportCoordinator`：
  分别处理入口决议、离开未保存项目时的确认，以及“解码 → 映射 → 激活”的 MIDI 导入。
- `ProjectPlaybackCoordinator`：把 Active Project 的 Snapshot 与 Commit 交给
  `@seele-daw/playback` 的 PlaybackEngine，再把引擎状态投影成 Vue 可读的状态。浏览器时钟与
  音频运行时由同目录的 `browser-*.ts` 适配。首次播放的用户手势才会创建 AudioContext 并准备
  音源资源。

内置音色目录与 MIDI 程序路由的产品规则见
[Built-in Instrument Catalogue V1](../../docs/built-in-instrument-catalogue-v1.md)、
[General MIDI Built-in Routing V1](../../docs/general-midi-built-in-routing-v1.md) 与
[MIDI Program Import Routing V1](../../docs/midi-program-import-routing-v1.md)。
