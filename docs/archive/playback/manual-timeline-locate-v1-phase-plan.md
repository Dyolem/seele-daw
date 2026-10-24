# Manual Timeline Locate V1 阶段记录

> Status: Accepted and closed on 2026-08-18; user-owned browser validation passed;
> checkpoint `checkpoint/manual-timeline-locate-2026-08-18`
>
> Date: 2026-08-18
>
> Prerequisite baseline: Audible MIDI Playback V1 accepted at `f1d0298`

本切片在已经收口的 Audible MIDI Playback V1 之后，补齐用户主动控制播放位置的最小产品能力。
它是独立的 **Manual Timeline Locate V1**，不重新打开 Audible MIDI Playback V1，也不把完整
Seek、Scrub、Locator、Loop 或 MIDI Import / Export 提前并入播放阶段。

## 1. 用户功能

- 用户在 Arrangement Ruler 单击时，播放位置跳到点击位置；Track Lane、Clip 和 Piano Roll
  当前不响应直接定位。
- 用户在 Ruler 拖动时只看见静默 Locate Preview；松开时才进行一次权威定位，不产生连续可听
  Scrub，也不产生 Project Command、History 或 dirty。
- 拖动到 Arrangement 左右边缘时，时间视口按靠近边缘的程度连续自动滚动；滚动只覆盖既有
  `[0, timelineEndTick]`，不扩展时间轴。
- 指针位置取最近的整数 Project Tick，独立于 Piano Roll Snap。
- Ruler 可通过键盘定位：左右方向键移动一拍，Page Up / Page Down 移动一小节，Home / End
  到时间轴首尾。

Ruler 使用水平 Slider 可访问性语义，并公开当前 Tick、最小 Tick 和派生 Timeline End。

## 2. Transport 产品语义

每次成功的手动定位都把目标 Tick 设为新的 `returnAnchorTick`。Return 控件因此表示
**Return to last start position**，而不是固定返回 Tick `0`：

- 初始 Anchor 为 Tick `0`；没有 Anchor stack。
- 连续定位两次后，Return 只回到最后一次目标。
- Pause / Resume 和自然播放进度不改变 Anchor。
- 新项目、项目切换或重新加载重置 Anchor 为 Tick `0`。
- 新 Plan 缩短时间轴时，Transport 把 Position 与 Anchor 夹取到新的 Timeline End。
- Anchor 是运行时状态，不写入 Project File、Checkpoint、History、dirty 或 Pinia。

状态行为如下：

| 定位前状态      | 定位结果                                                                     |
| --------------- | ---------------------------------------------------------------------------- |
| Stopped         | 保持 Stopped，位置和 Anchor 更新到目标。                                     |
| Paused          | 保持 Paused，位置和 Anchor 更新到目标。                                      |
| Playing         | 旧 generation、旧调度和旧 Voice 失效，从目标继续 Playing；目标为末端时停止。 |
| Loading         | 更新 pending start；资源完成后从目标开始，目标为末端时保持 Stopped。         |
| Empty / Blocked | 可以移动位置和 Anchor，但 Play 仍不可用。                                    |

当前不实现 Note Chase，因此定位到一枚已经开始、尚未结束的 Note 中间不会补触发该 Note。

## 3. Locate Preview、取消与 Follow

- Playing 下开始拖动时，Coordinator 暂停 Transport、推进 generation、停止 Scheduler 并执行
  `allNotesOff`，但保留已准备的 Audio Runtime 和资源。
- 松开时先用保留的 Runtime 恢复 Transport，再定位到目标并只安排目标之后的新窗口。
- `pointercancel`、Escape、Capture 丢失或组件卸载会取消手势；Playing 恢复到手势开始时冻结的
  位置和状态，Return Anchor 不变。
- 成功的 Playing 定位恢复 Arrangement Follow；取消恢复手势开始前的 Arrangement Follow
  开关状态。
- Track Piano Roll Follow 继续拥有独立的瞬时状态，不被 Arrangement Locate 改写。
- Arrangement Playhead 与静默 Preview 的横向位置继续由 transform-only 图层承担；纵向线段
  以 CSS 粘附当前 Arrangement 视口，纵向滚动时三角柄保持可见，二者共用相同线宽。

边缘滚动由 `requestAnimationFrame` 驱动，只改变 Arrangement 的既有横向滚动权威。帧间隔被
限制以避免后台恢复产生大跳跃；Transport Position 仍由 Playback Clock 决定，视觉帧不是第二套
播放时钟。

## 4. 架构边界

- `@seele-daw/playback` 拥有浏览器无关的 Tick 定位、Return Anchor、TempoMap 映射与 generation
  转换；它不知道 DOM、Pointer、Vue、AudioContext 或 Follow。
- Studio Playback Coordinator 组合 Transport、Scheduler 与 Audio Runtime，负责失效旧调度、
  熄灭 Voice、保留准备资源和管理事务化 Locate Session。
- Arrangement View 只拥有命中、Pointer Capture、静默 Preview、边缘滚动、Follow 和 ARIA；
  不读取或写入 Project Model。
- `@seele-daw/audio-web` 继续只执行 generation 与 Voice 计划，不读取 Ruler 或完整 Project。

## 5. 实施批次

| 批次 | 内容                                                     | 提交      |
| ---- | -------------------------------------------------------- | --------- |
| TL1  | Playback Transport Locate、Return Anchor 与 Plan clamp   | `2b89595` |
| TL2  | Studio Coordinator、Loading / Empty、Runtime 保留与取消  | `228a832` |
| TL3  | Arrangement Ruler 点击 / 拖动、静默 Preview 与单次提交   | `74b286b` |
| TL4  | 连续边缘滚动、Follow、键盘 / ARIA、Return 命名与文档收口 | `3883ca4` |
| UX   | Playhead / Preview 纵向视口粘附与一致线宽                | `f4cb601` |

四个主批次按约定连续实施并分别提交，统一审核后另完成一个纵向可见性 UX 修正。本切片没有新增
E2E，也没有由实现方执行浏览器人工手测；用户已完成代码审核和浏览器功能验证，确认点击 / 拖动
定位、左右边缘滚动、播放中继续、取消恢复、Return Anchor、Timeline End 停止与 Playhead 纵向
可见性符合当前产品范围。

## 6. 明确延期

- 可听 Scrub、拖动期间连续发声与 Preview Audition；
- Note Chase；
- Locator / Marker、Loop、Punch、Range Selection；
- Arrangement Lane、Clip 或 Piano Roll 直接定位；
- 数字时间输入和持久化起始位置；
- 动态扩展 Timeline；
- MIDI Import / Export 本身。
