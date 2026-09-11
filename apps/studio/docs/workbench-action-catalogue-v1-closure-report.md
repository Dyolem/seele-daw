# Workbench Action Catalogue V1 收口报告

> 状态：WA1–WA4 已实现并通过用户审核；WA4 随本收口提交
>
> 更新日期：2026-09-11；最终代码门禁与浏览器验证：2026-09-09

本报告汇总 WA1–WA4 的实现边界、阶段回归与浏览器证据。架构契约和中英术语见
[Studio Action 架构](./studio-action-architecture.md)，批次范围见
[阶段计划](./workbench-action-catalogue-v1-phase-plan.md)。用户于 2026-09-11 通过 WA4 审核，
授权本地提交并规划下一阶段；人工 smoke 未单独报告，验证证据按实际来源保留。

## 1. 提交与本批范围

| 批次 | 已交付内容                                                          | 提交／状态           |
| ---- | ------------------------------------------------------------------- | -------------------- |
| WA1  | 静态 Catalogue、动态目标、调用与完成结果、独立输入路由、Save 三入口 | `a18a005`，已审核    |
| WA2  | Workbench 既有菜单与按钮统一 Action、Presentation 和快捷键提示      | `316df17`，已审核    |
| WA3  | Note／CC64 Context Menu、目标失效、焦点恢复与 Studio 自有菜单内容   | `b372145`，已审核    |
| WA4  | 阶段回归、释放与失败检查、菜单到导航确认框的焦点交接、收口报告      | 已审核，随本收口提交 |

WA4 在 WA3 的基础上新增 10 项回归：迟到成功结果 3 项、其余可编辑输入种类 3 项、
Cancel 失败不穿透 1 项、应用先于视图释放 1 项，以及导航确认框通过 Cancel／Escape
关闭后恢复焦点 2 项。

阶段浏览器检查发现，Project Menu 发起导航时，菜单卸载与确认框打开相互交叠，确认框缺少
稳定的焦点返回目标，取消后焦点落到 Body。现在 Projects 在菜单的 `close-auto-focus` 阶段先聚焦稳定的
菜单按钮，再调用原 Action；这段交接只属于 Workbench UI。`UiIconButton` 提供聚焦自身
原生按钮的能力，Action 和导航业务接口不携带 DOM。两种 MIDI Import 继续在原始用户输入
调用栈中打开文件选择器，保留 user activation。

另一个修正针对已有测试：Reka 的菜单关闭与按钮焦点恢复分属不同浏览器任务，单次
`flushPromises()` 不能保证两者都结束。断言改为等待实际焦点恢复，不增加固定延时。
Contenteditable 回归为嵌套目标补足 JSDOM 缺失的继承式 `isContentEditable` 属性；这是
测试环境适配，生产 Adapter 继续使用真实浏览器提供的属性。

## 2. 不变量与回归证据

| 不变量                                                                                                        | 证据                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalogue 不依赖视图挂载；无 Binding 的 Action 仍可从菜单调用；同步／异步失败不重复通知                       | [Action Coordinator 回归](../src/workbench/actions/__tests__/studio-action-coordinator.spec.ts)                                                                                            |
| 替换、释放目标或应用后，等待立即 cancelled；迟到成功或拒绝不改写完成结果，旧 disposer 不释放新目标            | [Action 生命周期回归](../src/workbench/actions/__tests__/studio-action-coordinator.spec.ts)                                                                                                |
| Save、History、Playback 共用入口；导航失败／取消可重试，原生 chooser 保持同步调用，导入结果按 Session 失效    | [Workspace 集成回归](../src/features/project-workspace/__tests__/ProjectWorkspacePage.spec.ts)                                                                                             |
| 应用先于视图关闭、重复 dispose、菜单暂停能力晚释放，都只卸载物理 Listener 一次；迟到 Save 失败不改项目或反馈  | [Workspace 释放回归](../src/features/project-workspace/__tests__/ProjectWorkspacePage.spec.ts)                                                                                             |
| 每个物理键只注册一次；冲突和部分注册失败原子回滚；IME 和已处理输入被过滤；Cancel 失败不继续 Clear             | [Input Router 回归](../src/workbench/keyboard/__tests__/studio-keyboard-input-router.spec.ts)                                                                                              |
| macOS／Windows／Linux 的 Mod 匹配，以及 Input、Textarea、Select、Contenteditable 的 Mod／Escape 过滤          | [Browser Adapter 回归](../src/workbench/keyboard/__tests__/browser-tanstack-hotkey-registry.spec.ts)                                                                                       |
| Reka Menu 拥有 Escape；菜单与导航确认框关闭后恢复正确焦点，下一次编辑输入可以继续                             | [Project Menu 回归](../src/features/project-workspace/__tests__/ProjectWorkbenchGlobalBar.spec.ts)、[Context Menu 回归](../src/features/piano-roll/__tests__/PianoRollContextMenu.spec.ts) |
| 右键替换单选／保留多选、空菜单抑制、集合删除只有一个 History step、Clear 不写 Project；失效菜单不能操作新目标 | [Clip Focus 回归](../src/features/piano-roll/__tests__/ProjectPianoRollSurface.spec.ts)、[Track Scope 回归](../src/features/piano-roll/__tests__/ProjectPianoRollTrackSurface.spec.ts)     |

## 3. 最终自动化门禁

包含导航焦点修正的最终根目录 `pnpm check` 于 2026-09-09 通过：

| 检查                               | 结果                     |
| ---------------------------------- | ------------------------ |
| Architecture 与 Workspace Quality  | 通过                     |
| Format、Oxlint、ESLint             | 通过                     |
| 全工作区 Type Check                | 通过                     |
| 全工作区测试                       | 162 个文件／1,476 项通过 |
| Studio 测试子集                    | 67 个文件／510 项通过    |
| Studio Production Build            | 通过                     |
| Distributable local-audio boundary | 通过                     |

测试分布为 Type Utils 1／2、MIDI File 5／28、Project Core 32／465、Platform Browser 3／23、
Editor 16／140、Playback 9／107、Project MIDI 4／37、Audio Web 25／164、Studio 67／510
（文件数／测试数）。构建保留既有的单个 chunk 超过 500 kB 提示。

2026-09-11 仅补齐报告与状态文档，检查本地链接、根目录格式和 `git diff --check`，不为
文档变更重复运行完整测试与构建。

## 4. 内置浏览器验证

2026-09-09 使用 Codex 内置浏览器，在独立的 `127.0.0.1:5174` 开发 origin 建立临时项目。
该 origin 的 IndexedDB 与日常开发端口分离。本轮完成以下交互检查：

| 场景              | 观察结果                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Save              | Toolbar、Project Menu、⌘S 都使本次修改进入 Saved 状态                                                            |
| History           | Menu Undo、Toolbar Redo、⌘Z／⌘⇧Z 对同一 Note 编辑得到一致结果                                                    |
| Playback          | Space 和 Toolbar 可启动，Menu 可暂停，时间显示推进，Return 返回起点                                              |
| Tempo 输入        | 聚焦 Tempo 按既有政策暂停播放；Space 留在输入框，⌘Z 不撤销 Note，Escape 恢复原数值                               |
| Note 菜单         | 右键先选中；打开时 Backspace 不穿透删除；Escape 关闭并保留选择、恢复 Note 区域焦点，第二次 Escape 才清空选择     |
| Note／CC64 删除   | 各自菜单删除成功，均可用一次 Undo 恢复                                                                           |
| CC64 焦点与 Clear | Escape 返回 Lane；Track Scope 的 Active Clip 菜单 Clear 保留事件，仅清空选择                                     |
| Scope 替换        | 连续四轮 Track → Clip Focus 后，Note 与 CC64 内容仍对应当前 Clip，未出现重复 Action 错误                         |
| 未保存导航        | Projects 打开 Save／Discard／Cancel；Modal 中 ⌘Z 不撤销后台 CC64；修正后鼠标 Cancel 与键盘 Escape 均回到菜单按钮 |
| 浏览器诊断        | 本轮检查结束时无 error 日志                                                                                      |

浮层不透明背景、视口滚动与边界的既有验证见阶段计划中的 WA3 记录，覆盖 1280 × 720、
960 × 420 和 600 × 420。菜单和音色选择器的样式由 Studio 自有 DOM 承接，尺寸约束不
引用 Reka available-size CSS 变量；Reka 继续处理定位、碰撞、导航和无障碍交互。

临时 CC64 修改已通过 Undo 回到临时项目的 Saved checkpoint；本轮标签页和专用开发服务
均已关闭。上述浏览器操作不代表人工听测，也不替代下一节的用户人工 smoke。

## 5. 人工 smoke 与审核状态

| 门禁                                        | 状态                              |
| ------------------------------------------- | --------------------------------- |
| WA1–WA3 用户审核                            | 已通过；相应提交已记录            |
| 用户在 macOS 上执行菜单、焦点与快捷键 smoke | 未单独报告，不记为 passed         |
| WA4 用户审核与本地提交                      | 2026-09-11 审核通过并授权本地提交 |

人工 smoke 的原计划范围是 Project Menu／Note／CC64 菜单、⌘S／⌘Z／⌘⇧Z、Space，以及
Escape 关闭菜单或导航确认框后的焦点恢复。用户已经通过本批审核并授权提交，但没有单独
报告上述人工实测结果，因此不把审核结论或 Codex 浏览器验证改写为人工 smoke 已执行。

## 6. 保留的范围边界

- ActiveProjectService、ProjectSession、History、Playback 和 Editor Selection 保持各自权威。
  本批没有 Project schema、Core、MIDI 导入语义或声音政策变化。
- Track Scope 的完整 Note 选择与编辑仍未实现；其 Context Menu 只处理 Active Clip 的 CC64。
- 参数化 Add Track、音色选择和 Tempo 编辑沿用各自业务入口，没有建立通用参数化 Action bus。
- 用户 Keymap 持久化、Settings、Recorder、Sequence 与 Command Palette 留给实际 V1B 切片。
  未新增 E2E、应用级错误恢复平台或新的音频验证框架。

本阶段已通过用户审核，后续顺序仍为 Minimal Gesture / Semantic Layer、Velocity Editing、
WAV Offline Export。用户已授权规划下一阶段；它们仍需要各自可审核的方案，本批没有开始实施。
