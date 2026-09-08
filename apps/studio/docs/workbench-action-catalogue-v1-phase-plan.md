# Workbench Action Catalogue V1 phase plan

> Updated: 2026-09-08
>
> WA1: implemented and approved
>
> WA2: implemented and approved
>
> WA3: implemented and approved
>
> WA4: authorized

## Design decision

The reviewed direction replaces the old combined Keyboard Coordinator. Existing infrastructure is
retained only where its ownership and semantics remain sound: Project commands and business owners,
the typed keymap, and the isolated TanStack browser adapter. Component-owned Action identities,
boolean-only execution results and combined Clear/Cancel intent are replaced in WA1.

## Batches

| Batch | Scope                                                                                                                                                                                      | State                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| WA1   | Immutable definitions, dynamic target lifetimes, explicit invocation/completion, input routing, bilingual terms, Save menu/button/shortcut slice, migration of existing keyboard consumers | Implemented; approved |
| WA2   | Remaining Workbench menus/buttons: Undo/Redo, Play/Pause, Return, Projects, both MIDI imports and opening the MIDI editor; shared presentation and shortcut text                           | Implemented; approved |
| WA3   | Focused-editor menu consumers and Reka Context Menu; explicit Note/CC64 target and one-command deletion                                                                                    | Implemented; approved |
| WA4   | Phase-wide regression, failure/release checks, menu and focus review, macOS manual smoke, closure report                                                                                   | Authorized            |

Each batch stops for review. WA3 was approved on 2026-09-08, with authorization to commit it locally
and complete the remaining WA4 batch.
Implementation and ownership are documented in [Studio Action Architecture](./studio-action-architecture.md).

## WA1 verification

The regression cases cover static catalogue availability, actions without key bindings, common Save
presentation and retry across three sources, asynchronous failures and invalidation, current-target
checks, Track/Clip replacement before old teardown, CC64 focus routing, Escape cancellation versus
selection clearing, IME filtering, platform Mod matching, canonical key conflicts, atomic browser
registration, Reka menu Escape and trigger-focus restoration. A failing editor focus query is also
verified not to disable Workbench Save.

Targeted Studio tests and type/architecture checks passed. Because WA1 replaces application
composition and injection used by existing consumers, the complete `pnpm check` gate was run and
passed on 2026-09-08:

| Gate                               | Result                         |
| ---------------------------------- | ------------------------------ |
| Architecture and workspace quality | Passed                         |
| Format, Oxlint and ESLint          | Passed                         |
| Workspace Type Check               | Passed                         |
| Workspace tests                    | 161 files / 1,419 tests passed |
| Studio subset                      | 66 files / 453 tests passed    |
| Studio Production Build            | Passed                         |
| Distributable local-audio boundary | Passed                         |

`git diff --check` passed. The verified implementation was based on
`db609533125e02d3ca2bd35e33ac450149505040`. WA1 was approved on 2026-09-08, with the architecture
narrative to be written in Chinese and the batch committed locally. Documentation-only updates are
checked for formatting and whitespace; they do not require rerunning the full test/build gate.

The phase-end macOS manual smoke remains in WA4; automated DOM tests do not claim to replace it.

## WA2 implementation and verification

Workbench menus, Transport controls, compact-layout navigation and Arrangement MIDI import buttons
now invoke the same application Actions. History and Playback groups expose the existing operations
in the Project menu. All consumers read the same presentation and platform-formatted shortcut hints;
the five new Actions have no default binding.

The page owns the native MIDI chooser and its pending completion. Chooser cancellation and rejected
navigation settle without claiming a business change. Session replacement retires a pending track
import's UI result; successful new-project import still completes its own route transition after
activating the new Session. Dock presentation reads the Workspace owner directly instead of keeping
a second open-state mirror in the Shell.

Validation passed on 2026-09-08 against changes based on WA1 commit `a18a005`:

| Gate                               | Result                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| Root `pnpm lint`                   | Architecture, workspace quality, format, Oxlint and ESLint passed |
| Studio Type Check                  | Passed                                                            |
| Complete Studio test suite         | 66 files / 481 tests passed                                       |
| Studio Production Build            | Passed                                                            |
| Distributable local-audio boundary | Passed                                                            |
| `git diff --check`                 | Passed                                                            |

The new regression cases verify History and playback across menu, toolbar and keyboard, Return
during loading, guarded navigation cancellation/failure and retry, synchronous native chooser
activation, shared MIDI busy state, late-result suppression, new-project navigation, and Dock
opening/restoration without a Project fact change. Existing Save and Reka keyboard/focus regressions
also pass. The build retains the existing large-chunk warning.

WA2 was approved and committed locally as `316df17` on 2026-09-08. WA3 was authorized with the
approved policy: select an unselected Note or CC64 event first, retain multi-selection when clicking one of
its members, and show no menu when there is no executable action. Full-workspace `pnpm check` and
macOS manual smoke remain phase-end gates in WA4.

## WA3 实现与验证

右键菜单已接入统一 Action。Clip Focus 支持 Note／CC64，Track Scope 支持 Active Clip 的
CC64。按已批准规则处理右键单选和保留多选；背景无选择、手势进行中、非 Active Clip 的
CC64 occurrence 或未实现的 Track Note 编辑区域不显示菜单。删除继续使用既有集合
Command，清空选择不改 Project。

菜单从发起视图取得当前 Binding 和明确的焦点恢复区域。菜单打开期间暂停后台快捷键；
Escape 关闭菜单并保留选择。当前目标失效后立即关闭，调用前再次检查身份，因此 Track／
Clip 新旧视图短暂共存也不会误用新目标。Workbench 与 Context Menu 共用平台化提示投影。

2026-09-08，基于 WA2 提交 `316df17` 的本批改动通过以下检查：

| 检查                               | 结果                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| 根目录 `pnpm lint`                 | Architecture、Workspace Quality、Format、Oxlint、ESLint 均通过 |
| Studio Type Check                  | 通过                                                           |
| 完整 Studio 测试                   | 67 个文件／500 项测试通过，新增 19 项回归                      |
| Studio Production Build            | 通过                                                           |
| Distributable local-audio boundary | 通过                                                           |
| `git diff --check`                 | 通过                                                           |

新增回归覆盖右键替换单选、保留多选、Note／CC64 集合删除与 Undo／Redo、Clear 不写事实、
空菜单抑制、非 Active Clip 与重复 Source event ID 的 occurrence 校验、Channel／Session／
Clip／编辑种类替换、旧 Track 晚于新 Clip 卸载、连续右键的焦点恢复、进行中手势、未绑定
Action 的菜单调用、失败后的重试，以及真实浏览器键盘 Adapter 下 Reka 的 Escape 所有权。
构建仅保留既有 large-chunk warning。

审核中的菜单样式修正：此前 Context Menu 的 Reka 内容节点未继承组件的 scoped
attribute，导致浮层背景、层级等样式未命中。现由 Studio 自有 `UiMenuSurface` 和
`UiMenuItem` 提供原生内容节点，通过 `as-child` 接入 Reka 的交互、定位与无障碍能力，
不再用全局选择器补救浮层根节点的样式。背景沿用不透明的
`--sd-color-surface-overlay`（`#1d2228`）。

Project Menu 与 Add Track 共用该浮层；音色选择器也改为向 Reka 提供自有内容节点。
这几处的尺寸约束均使用标准 CSS 视口单位与 Studio 令牌，移除了 Reka available-size
CSS 变量引用。Reka 负责碰撞处理与位置调整，内容自行滚动。

上述组合调整后，重新通过完整 Studio 67 个文件／500 项测试、根目录 `pnpm lint`、
Studio Type Check、Production Build 与 dist boundary。既有页面回归的菜单定位器改为
明确查找文案节点，避免假定首个 `span` 就是文字。

浏览器交互验证使用 Codex 内置浏览器，后续也优先使用该浏览器，避免个人 Chrome 标签页
干扰。已在 1280 × 720 正常视口与 960 × 420 短视口检查不透明背景、长菜单滚动和音色
选择器两列滚动，并检查 600 × 420 窄视口的选择器尺寸边界。Project Menu 方向键导航、
末项可达与 Escape 焦点恢复，以及 Note／CC64 右键菜单的高亮、底边避让、Escape 保留
选择和 Clear Selection 均已核对。临时验证数据已通过 Undo 全部撤销，项目恢复 Saved；
临时视口设置已恢复。

WA3 于 2026-09-08 通过审核并获准本地提交，用户同时授权完成剩余 WA4。全工作区
`pnpm check` 和 macOS 人工 smoke 在 WA4 执行，本批自动化 DOM 测试和针对性浏览器验证
不替代阶段人工 smoke。

## Deferred decisions and limits

- Keymap persistence, Settings, Recorder, sequences and Command Palette remain a possible V1B.
- Parameterized Add Track, instrument choice and Tempo editing do not justify a generic Action bus.
- ActiveProjectService, ProjectSession, History, Playback and editor selection retain ownership.
- No Core, audio, MIDI import semantics, existing MI6B–MI6D commits or soundbank routing is rebuilt.

After this phase, the remaining agreed sequence is Minimal Gesture / Semantic Layer, Velocity Editing,
then WAV Offline Export. CC64 and Expression Quality Integration are already complete.
