# Editor Interaction V1：中立生命周期与领域 Operation

> 状态：G1 已审核提交（`2b2d8c6`）；G2 已提交（`c83d906`）；G3 CC64、Track Pencil 与 Timeline Locate 已审核通过（2026-10-19）。
>
> 日期：2026-09-30
>
> 替代：[Piano Roll Pointer Interaction 状态机决策](./piano-roll-pointer-interaction-state-machine-decision.md)

## 决策与范围

将输入机械职责、交互生命周期、领域计算和实际提交分开。G1 用已有 Note Click、Pencil Add、
Move、Resize 完成纵向迁移；没有增加 Clip、Velocity、框选或插件发现 API。

`InteractionSession` 使用拥有私有状态的 class，表达 `idle → active → completing →
finished / cancelled`。领域 Operation 通过组合接入；事实编辑另行组合 `InteractionCommitHandoff`。
公共生命周期不包含 Note、Pitch、CC64、ProjectSession、History、DOM 或 Vue。

选择显式状态协议的依据是当前转换拓扑：Note、Tempo 和 Locate 都需要一次开始、连续更新、
一次结束；没有必须统一处理的并行状态或嵌套 Actor。原 XState machine 把 Note Move、Resize
和提交交接展开为公共状态，新增领域会继续扩大该枚举。保留这种拆分后再包一层通用门面不能
改善所有权，因此替换旧 Note machine，并移除唯一使用者消失后的 `xstate` 依赖。

这不是“不使用状态机”的决定：转换守卫、终态和一次完成仍是显式状态协议。未来若出现实际
需要的并行或层级状态，可以在相同边界内重新评估 Statechart，不把框架对象暴露给 Studio。

## 阅读顺序与职责

| 位置                                                              | 拥有的职责                                                                         | 不承担的职责                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| `browser/interaction/editor-pointer-input-adapter.ts`             | 单 primary Pointer、capture、4 CSS Pixel 阈值、物理 Modifier、取消、失焦、监听释放 | Note Hit、Project 查询和提交        |
| `common/interaction/editor-pointer-input.ts`                      | 不依赖 DOM 的输入事实、一次捕获身份                                                | 领域实体和浏览器事件对象            |
| `common/interaction/interaction-session.ts`                       | Operation、交互身份、Preview、完成领取和终止                                       | Hit Test、Snap、Selection、revision |
| `common/interaction/interaction-commit-handoff.ts`                | 可选的单次提交 revision 与权威投影交接                                             | Project 写入、History、视图操作     |
| `common/interaction/interaction-modifiers.ts`                     | `toggleSelection` 取 origin，`bypassSnap` 取 current                               | 用户 Keymap 或控件按键协议          |
| `common/piano-roll/interaction/piano-roll-note-operation.ts`      | 冻结领域快照，按 Tool / Hit 选择 Note 运算，产生语义结果                           | Command 执行和订阅生命周期          |
| `common/piano-roll/interaction/piano-roll-interaction-session.ts` | 组合公共协议，映射 Note 状态，订阅失效，选择 Note 的映射政策                       | 第二份可写 Note 数据                |
| Studio Surface / intent handler / MIDI Note Coordinator           | Surface 映射、当前能力验证、提交一次 Command、回告、Selection 与反馈               | 重新解释 Begin 的目标               |

Note / CC64 的既有 Browser 工厂现在委托同一中立 Adapter；没有保留两份事件监听实现。
G3 已将 CC64 的语义 Session、Track Pencil 和 Timeline Locate 接入相同 host，移除被替代的完成路径。

公共内核直接用 class 构造，不新增 Interface → Implementation → Factory 链。Note 保留既有
`createPianoRollInteractionSession` 公开门面以收敛 package root 的变更；它组合内部 host、
handoff 和订阅所有权。Browser 工厂创建并拥有监听资源。G2 通过 package root 显式公开已有
`InteractionSession`、`InteractionCommitHandoff` 和中立 Pointer Adapter 及其必要契约，
供 Studio Tempo 的真实生产消费者使用；Symbol 创建工厂仍留在内部。

Studio 的 Clip Focus Surface 已按 Model、Interaction、Rendering、Editing Actions 和 CC64
组合拆成 hooks；组件保留资源创建、目标失效和卸载顺序，详见
[Feature 阅读说明](../../../apps/studio/src/features/piano-roll/README.md)。这些 hooks 观察并
组合 Editor classes，不替代 Common 生命周期权威。

## 身份、冻结与一次执行

- Editor 的 Symbol 创建入口集中在 `common/interaction/interaction-symbols.ts`，工厂每次
  返回独立身份，不使用 `Symbol.for` 或保留 token 的全局注册表。入口不从 package root
  导出，Common / Browser 消费相同的内部身份政策。
- 浏览器 `pointerId` 可以复用；每次 Down 额外生成 `captureId`，贯穿 Begin / Update / End /
  Cancel。旧 capture 的输入不能操作新的手势。
- Session 为每次 Begin 生成独立 `InteractionId`。完成结果、领取、回告和清理均携带该身份；
  `claimCompletion` 只能成功一次。重复 End、取消后的 End、旧回告不能再次执行。
- Note Begin 冻结 Session 对象身份、Clip / Source context、base revision、Note Facts、
  Selection、Tool、Grid、Snap、Hit 和起始位置。当前坐标和 Modifier 可以动态更新。
- Selection 结果仅包含 `noteId` 与 `toggleSelection`；Move / Resize Resolver 接收
  `bypassSnap`。Studio 不读取原始 Pointer 来决定选择行为，领域 Resolver 不读取 Alt。
- Move / Resize 拖回原值时返回空结果，立即终止，不发 Command、不增加 History。
- Add、Move、Resize 均把捕获的 Session 和 revision 送到实际 Coordinator。即使替换后的
  Project、Clip ID 和 revision 数值相同，Session 身份不同也会拒绝；Pencil 不再读取 End
  时的最新 revision 来覆盖过期前置条件。

Preview 永远是可丢弃投影，不写 Project、Autosave、History 或 Playback。领域事实只在一次
成功 Command 中改变。已提交事实不因后续 Selection 或显示失败回滚，反馈区分提交失败和
“已提交但后续投影失败”。

## Note、Tempo、Locate 转换对照

| 阶段 / 事件            | Note（G1 已接入）                                      | Tempo（G2 已接入）                                                | Timeline Locate（G3 已接入）                                            |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Begin                  | 冻结 Clip、Note、选择、revision、Tool、Grid、映射      | 冻结 TempoEvent、Session、revision、原 Tick / BPM、整数 Tick 映射 | 保存 Playback Locate session、原播放 / Follow 状态和抓取锚点            |
| 阈值以内               | pressing，End 解释为 Selection / Add                   | 点击选择事件；尚未决定编辑轴                                      | 可立即定位预览，无需制造“拖动后才能定位”的限制                          |
| Update                 | Move / Resize 纯 Preview，Alt 更新 `bypassSnap`        | 冻结主导轴；Tick 或 BPM Operation；tick 0 水平移动继续受限        | 重新映射当前坐标，更新定位 Preview；Edge Scroll 可在 Pointer 不动时更新 |
| End                    | 无变化直接结束，否则领取一次语义结果                   | 仅变更的一轴产生一个 Command                                      | 完成已有 Playback Locate session，不写 Project                          |
| Commit / authority     | 接受先到或后到的权威 revision，交接最终 Preview        | 使用同一可选 handoff，不能用当前 revision 掩盖冲突                | 不需要 revision / Commit handoff                                        |
| Cancel / target change | 释放 capture、清除 Preview，未提交结果作废             | 清除轴状态和 Preview，迟到 End 无效                               | 停止 Edge Scroll，取消 Playback Locate 并按其规则恢复播放 / Follow      |
| Mapping change         | 当前 Note Surface 不支持连续滚动重映射，映射改变则取消 | 冻结 Lane 位置 / 尺寸与时间 / BPM Scale；映射变化取消             | 显式接受滚动偏移更新，保留原锚点；未知映射重建才取消                    |

对照依据为当前 Tempo Lane 的 `tick / bpm / blocked-tick` 轴解析与 Arrangement 的 Locate /
Edge Scroll 实现。G1 没有为了这些将来消费者加入无实际调用的 Mapping 接口或 Playback
回调；公共 host 的泛型 Input 已允许消费者交付重新映射后的输入，不预设更新来自 Pointer。

## 失效、异常与资源清理

Note、Tempo、CC64 与 Track Pencil 订阅 Project Commit，外部提交会取消活动或尚未领取的结果。Project 当前通过
microtask 发布通知，因此 Update / End 和提交领取还同步检查 `session.modelRevision`，不能只等通知。
领取自己的执行结果后允许提交的同步或异步通知到达，不把它误判为外部编辑。

权威投影先到时 handoff 记录已观察 revision；回告先到时保留最终 Preview，直到投影追上。
新 Begin 可以结束旧 handoff 后开始新手势，这只放弃旧 Preview，不撤销已提交事实。

Cancel、Pointer Cancel、lost capture、Window blur、目标 / Session 切换、释放和消费者失败
都关闭未提交结果。Browser Adapter 在消费者或坐标转换抛错时释放 capture，并尽力发布
Cancel；Note observer 失败时清除内部状态，也向健康 observer 发布空投影。错误反馈再次
失败不得留下仍可产生 End 的输入。

Note Surface 还处理 Selection 改变、Viewport 尺寸 /范围改变、Surface 位置改变和投影失败。
等值 Viewport 和不改变该 Surface 映射的滚动不会取消。映射政策由各自 Surface 决定，不能推广为
“所有 Editor 遇到 scroll / resize 都取消”；Locate 接受连续的滚动偏移变化，仍会取消尺寸 / 范围的映射重建。

## G2：Tempo 的实际跨域消费者

Studio 的 [Tempo Track](../../../apps/studio/src/features/project-workspace/tempo-track/README.md)
直接组合相同公共 host、handoff 和 Browser Adapter。`TempoTrackDragOperation` 只计算单轴
Preview / Result；`TempoTrackDragSession` 拥有冻结的 Project 目标和 Commit 订阅；Vue Hook
负责 DOM 映射、统一 Cancel 及 Page 能力调用。Editor 中立层没有加入 Tempo 专属分支。

- 保留原有 4 CSS px 主导轴容差（横纵相等时选择 BPM），首事件水平拖动锁为
  `blocked-tick`，不能拖到一半再切到 BPM；首事件纵向 BPM 编辑和禁止删除的约束不变。
- Tempo 现有产品不做音乐网格吸附，Begin 冻结的是整数 Tick 映射。BPM 拖回起点时保留
  导入的原始精度，不能因两位小数编辑精度制造一个无意的 Command。
- Studio Page 通过既有 Typed Context 增加窄的 `commitDrag` 能力，返回真实 Command 结果；
  已移除 Lane → Arrangement → Workspace → Shell 的无回告拖动 Emit 链。数值输入、
  新增和删除继续使用既有业务路径，不建通用参数化 Action Bus。
- Coordinator 的拖动输入同时携带 `expectedSession` 与 `baseRevision`，在播放准备之后
  再验证 Session 身份；Command 验证原 revision。即时数值操作仍可显式省略拖动目标。
- 共享 Preview 改为仅按 InteractionId 发布 / 清除的展示对象，移除没有真实消费者的
  `bpm-editor / position-editor` 模式及第二套 begin / finish 生命周期。
- Tempo Hook 在 Vue 的 post flush 确认对应事实已投影后交接 Preview。Scroll、Resize
  与每次 Update / End 都检查 Lane 映射；相等映射保留，实际映射变化取消。此政策不作用于
  G3 的 Locate Edge Scroll。

## G3：CC64、Track Pencil 与 Timeline Locate

- CC64 的契约、Operation 与 Session 分开。Operation 固定 Selection、Tool、Grid、Snap、Hit
  与 Viewport；Session 固定 Clip / Track、Channel、Session 身份和 revision，并组合公共 host /
  handoff。Selection 直接返回解析结果，Studio 不再在 End 查询当前选择。全部写入均经一次
  completion 领取，删除旧 `resolveTransformCommit / skipTransformCommit` 无身份回告。
- Track Pencil 的 [Session](../../../apps/studio/src/features/piano-roll/components/track-surface/interaction/track-placement-session.ts)
  固定 Begin Read Model 和放置配置；其 Operation 同时处理 Note Hit 对应 Clip 激活。
  Hover 使用实时设置，活动手势使用冻结候选。目标 / 映射变化取消，Tool / Grid / Snap 变化不会
  把已开始的点击重新解释成其他操作。新增、扩展 Clip 与 Note 仍由原子 Coordinator 用例提交。
- CC64 与 Track Hook 在 post flush 才确认投影 revision，避免 Command 回告早于 Vue 事实
  投影时提前清除 Preview。CC64 placement 不再通过无返回值 Emit 交给两种 Surface；统一
  Intent Handler 选择 Clip / Track 用例，并明确区分 Command 失败和已提交后的显示失败。
- [Timeline Locate](../../../apps/studio/src/features/project-workspace/workbench-shell/arrangement/README.md)
  使用公共 Pointer / Session，但不使用事实编辑的 Handoff。Playback Locate Session 继续拥有
  暂停、commit / cancel 与恢复播放的决定；Vue Hook 拥有 Follow、Edge Scroll 与浏览器资源。
- Browser Adapter 新增有实际消费者的 `positionSpace: 'client'`。Locate 的当前位置保持为
  Client CSS 坐标，Pointer、Modifier 更新和 Edge Scroll 使用同一值重算 Tick；Surface 滚动
  不会把静止 Pointer 当作移动。其他消费者默认保留相对 Surface 坐标。
- Edge Scroll 回调同时核验帧句柄和 InteractionId，释放后的 Follow 回调核验生命周期代次；
  旧回调不能推动新 Locate。滚动偏移允许更新，Project / 范围 / Viewport 尺寸变化取消。
- `INTERACTION_MODIFIER_RULES` 集中声明物理键、origin / current 时机及帮助文案；Note / CC64
  通过同一解释函数消费，Keyboard Settings 从同一规则生成只读帮助。Pencil 仍消费 Snap
  Preference，未新增 Alt 绕过或 Modifier 自定义能力。

## 验证边界

G2 另覆盖 Tempo 两种交接顺序、旧捕获 / 回告、映射失效、初始化失败、播放准备期间的
外部 Commit、Session 替换、碰撞拒绝、一次 Undo 及提交后的显示失败。

自动测试覆盖公共 host 的一次执行、空结果、失败关闭、重入和释放；Note 的冻结、动态
Modifier、旧 capture / 回告、两种 handoff 顺序、外部修改前后的通知窗口、映射失效和
observer 失败；Browser 的捕获、取消、失焦、坐标失败和释放；Studio 的原子 History、
目标替换、Pencil 版本校验与提交后的 Selection 失败。架构规则限制中立层只能依赖自身，
Browser 可单向依赖 Common，Common 禁止 DOM 对象与事件。

G3 新增 CC64 / Track 配置冻结、同 revision 的 Session 替换、提交通知前的同步校验、
旧 capture / 回告 / observer、Locate 连续重映射、取消后的动画回调、失焦、Scope / 映射改变
以及 Pointer / Playback 失败清理回归。

完整门禁与手工验证结果记录在阶段计划的
[G1](../../../apps/studio/docs/editor-input-foundation-v1-phase-plan.md#14-g1-中立协议与-note-迁移2026-09-29)
、[G2](../../../apps/studio/docs/editor-input-foundation-v1-phase-plan.md#17-g2tempo-跨域验证2026-09-30)
与 [G3](../../../apps/studio/docs/editor-input-foundation-v1-phase-plan.md#18-g3其余消费者迁移2026-09-30) 记录。
