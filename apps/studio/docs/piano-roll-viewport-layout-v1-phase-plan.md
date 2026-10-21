# Piano Roll 视口与布局 V1 阶段计划

> 状态：V1 已审核提交 `86fcbf6`；V2 已完成验证，待审核；V3–V4 尚未实施
>
> 创建日期：2026-10-20
>
> 代码基线：`5c73a35`（G4）

本阶段在 Velocity Editing 之前，解决固定 C3–C5 音域、过小的 Note 行高、辅助 Lane 占用
主要编辑空间、Clip 分组表达和长下拉列表不可达的问题。每个独立批次完成后交付审核；未获
明确指示不提交、推送或连续实施后续批次。

## 已确认的产品方向

- Track / Clip Focus 共用同一套 Pitch Viewport。标准键高模式固定半音行高，面板高度只改变
  可见行数；音域缩放模式保持目标音域，随可用高度调整行高。完整 MIDI 0–127 音高可滚动访问。
- V2 确定标准键高为 20 CSS px，音域模式行高限制为 16–48 CSS px。行高触及上下限时
  保证可操作性，允许滚动或显示周边音域，不能继续压缩 Note。
- 音域由用户显式选择或适配，不随 Note 增删自动跳变；面板调整保持中心音高。Pitch 显示
  模式与 Track / Clip Focus 编辑 Scope 相互独立。
- CC64 保留底部同时间轴，独立边界、内部安全间距和高度控制，支持收起与恢复。未来 Velocity
  优先复用底部区域切换，而非默认叠加更多 Lane。
- Tempo 提供紧凑摘要与展开编辑；上下主区域按实际可用空间约束，保证 Track / Note 内容区。
  极小窗口优先保留当前编辑区，另一块保留恢复入口，不覆盖用户常规布局偏好。
- Track 中每个 Clip 显示贯穿音符视口的区域，并在 CC64 延续时间边界。Header 独立于 Pitch
  行；Note 投影保留 Clip 归属。实际 Clip Move / Copy 另行设计，不在本阶段伪装为已支持。

## 批次

| 批次 | 范围                                                | 退出条件                                                                            |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| V1   | `UiSelect` 展开高度、单一滚动 owner、滚动条与可达性 | Channel 1–16 在短窗口及上下边缘可通过滚动和键盘访问；焦点恢复与资源清理正确         |
| V2   | Pitch Viewport、标准键高与音域缩放两种策略          | 完整音域可达；键盘、网格、Note、Preview 与 Hit 使用一致映射；面板变化保持约定的锚点 |
| V3   | CC64 / Tempo 与 Workspace 高度分配                  | 分区明确、可收起和恢复；辅助区不挤掉主要编辑内容；时间轴保持对齐                    |
| V4   | Clip 区域、Header 与实例展示身份                    | 重叠 Clip 可明确激活；共享 Source 的多个 Clip 投影互不覆盖；Note 输入不被背景截获   |

## V1 实现边界与验证

- `UiSelect.vue` 继续提供单一公共组件入口；局部 `use-select-content-size.ts` 只适配打开期间
  的 Trigger / VisualViewport 测量、ResizeObserver 与事件清理，不新增应用服务或 Store。
- 最大展开高度同时受 8 项设计上限与 Trigger 上下较大可用空间约束；Reka 继续拥有定位与
  碰撞处理。自有 CSS 只使用 Studio 令牌、标准视口单位和组件尺寸，不读取 `--reka-*`。
- `UiMenuSurface` 保留其他命令菜单的滚动政策；Select 只在自己的内部 Viewport 滚动。
  Built-in Instrument Picker 已有类别与选项列表的独立高度约束，保留其专用内容结构。
- 10 项组件测试覆盖 16 项键盘导航和选择、Escape、外部点击收拢时文字稳定、动态选项与
  Placeholder、短窗口尺寸变化、VisualViewport、关闭 / 卸载清理、重开测量和禁用状态。
  使用 `as-child` 提供自有 Viewport 节点，使 scoped 样式稳定作用于唯一滚动元素；显式
  开启 Reka 的边缘避让与上下翻转。
- 2026-10-20 浏览器检查通过：标准位置、上下边缘、280px 高短窗口、360px 宽窄窗口，均
  保持列表有界、唯一内部滚动、选中项可见、鼠标滚轮和 Home / End 可达、Escape 焦点恢复；
  打开期间缩小窗口和两倍 VisualViewport 缩放也通过。
- 当前会话未提供 Codex 内置浏览器控制工具；测试 Chromium 下载失败后，使用 Chrome
  155 的独立无界面进程与全新临时用户目录验证，未连接现有浏览器会话。浏览器检查使用真实
  Vue 组件和设计样式的临时宿主，不新增仓库 E2E 基础设施。极矮场景通过 CDP 模拟可视窗口，
  保持原生输入区域高于浏览器的最小尺寸，避免测试输入坐标失效。
- V1 初次完整 `pnpm check` 通过：Architecture、Workspace Quality、Format、Oxlint、ESLint、全仓
  Type Check、172 个测试文件 / 1,678 项测试、Studio Production Build 与 soundbank dist
  boundary。构建仍提示主包超过 500kB，该体积优化不属于本批。V1 已按授权提交为 `86fcbf6`。
- 收拢闪烁修复：Reka 默认文字依赖列表项注册，开合重建期间可能短暂清空；现在通过
  `SelectValue` 的公开 Slot 渲染由 `modelValue / options` 派生的文字。真实浏览器修复前
  捕获按钮从约 116px 收缩到 58px；修复后外部点击与 Escape 均保持原宽度，切换短选项
  正常调整至约 63px。10 项组件测试与浏览器文字、宽度采样通过。

## V2 实现边界与验证

- 标准模式固定 20px，音域模式保持目标跨度并在 16–48px 内适配；初始中心 MIDI 60、目标
  25 键，缩放按 1.25 倍调整至 3–128 键。`Fit notes` 根据当前 Scope 的全部音符计算两侧各
  2 半音余量，显式进入音域模式。显示 `Target N keys` 及提示，说明短面板仍需滚动。
- 两种 Scope 共用 feature 层 Pitch policy / hook 和三个视图组件；`PianoRollPreferences`
  只保存模式、中心和跨度。局部 Read Model / Renderer / Input 仍由各 Surface 拥有。
- Editor 公共 Pitch Viewport 增加行高与顶部部分行偏移，键盘、Grid、Note、Move、Preview
  与 Hit 共用坐标。Canvas 仅分配可见高度，完整音域由独立原生滚动条表达。
- Pitch 映射改变同步取消捕获，迟到 End 不提交；Project / History / dirty 不因视图操作改变。
  Clip 目标重建与几何观察分开，避免一次切换触发重复订阅。
- 自动化覆盖完整音域、部分行正反映射、Grid / Note 对齐、两种行高策略、中心锚点、滚动后
  落笔和手势取消、偏好与资源释放。完整 `pnpm check` 通过：Architecture、Workspace Quality、
  Format、Oxlint、ESLint、全仓 Type Check、173 个测试文件 / 1,694 项测试、Studio Production
  Build 与 soundbank dist boundary。仍有既有主包超过 500kB 的构建提示。
- 2026-10-21 使用 Codex 内置浏览器及独立测试 Project：MIDI 0 / 127、滚轮与 Home / End、
  模式与 Scope 切换、Fit / Zoom、最大化和还原、低音区落笔 / Move / Undo 均通过；CC64 与
  横向时间映射不随 Pitch 滚动。900px 窗口中工具栏可滚动，键盘聚焦自动带入屏外控件。
- 小窗口中 Workspace 主区域最小高度与 Dock 总高度仍会竞争，CC64 / Tempo 边界和高度政策
  继续按 V3 解决。本批只完成 Pitch Viewport，不提前实施辅助 Lane 或 Clip 全高区域。

## 不变量

- Zoom、Scroll、布局与显示模式属于 Editor / UI，不进入 Project Facts、History、dirty 或
  Checkpoint。当前 ProjectSession 与 Selection 权威保持不变。
- 普通滚动、缩放与布局变化遵循 G4 的映射失效与取消规则；事实编辑的 Edge Scroll 需要
  独立的连续重映射政策，不在布局修改时隐式加入。
- 两种 Scope 的时间坐标各自保持现有语义；同一 Surface 的 Ruler、Clip、Note、CC64 和
  Playhead 保持横向对齐，Pitch 滚动不移动 CC64。
- 遵循 [工程代码准则](../../../CODE_GUIDELINES.md)、[设计规范](../../../DESIGN.md) 与
  [Piano Roll 模块说明](../src/features/piano-roll/README.md)。
