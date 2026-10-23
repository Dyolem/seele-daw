# Piano Roll 长 Clip 滚动排查

> 日期：2026-10-22
>
> 优化前基线：`c89972a`

## 场景与测量范围

使用 Codex 内置浏览器、开发服务器、1280×900 CSS px、DPR 1，导入独立测试 MIDI：
280 小节、4,480 个 Note，音高循环分布在 MIDI 48–72。导入后时间轴包含末端余量，总计
288 小节、23,040 CSS px。Track Scope、Standard keys、工作区全屏，Note 可视高度 538px，
时间滚动容器宽 936px。测试没有启用 CPU 降速。

可从仓库根目录生成同一 MIDI，通过项目入口的 Import MIDI file 导入：

```sh
node apps/studio/src/features/piano-roll/__tests__/fixtures/create-long-clip-midi.mjs /tmp/seele-perf-280.mid
```

在 `useTrackRendering` 的 `render()` 临时以 `performance.now()` 分段记录 Theme、Grid、
Scene 和 DOM 调用，交替向下 / 向上滚动，取 8 次高度与 Note 数一致的连续样本。
优化前后采用相同输入与显示条件。临时测量代码已移除；以下不是完整 Frame Time、FPS、
输入延迟或 6× CPU 降速结果，Canvas 的异步光栅化和浏览器合成不包含在函数耗时中。

| 指标             | 优化前      | 优化后    |
| ---------------- | ----------- | --------- |
| 参与渲染的 Note  | 4,480       | 375       |
| Grid bitmap      | 23,040×538  | 1,872×538 |
| Scene 阶段耗时   | 0.8–2.4ms   | 0.2–0.4ms |
| DOM 阶段耗时     | 26.0–34.2ms | 0.4–1.0ms |
| 整次渲染函数耗时 | 27.3–36.8ms | 0.7–1.3ms |

开头只有右侧缓冲，因此为两屏；时间轴中部最多三屏，当前尺寸下 Grid 宽不超过约 2,808px。
自动化使用 3,000 个短 Note 和一个跨窗口长 Note，验证数量与位图受窗口限制、页内节点保留、
跨页 / 末端 / Resize、长 Note 相交裁剪，以及绘制窗口偏移不改变落笔的全局时间坐标。

## 原因

打开编辑器是一次性创建。Note 没有对应的 Vue Component 或深层响应式对象，输入通过
Surface 事件委托，成本并不等于创建几千个组件与监听器。原来的横向滚动主要由浏览器移动
已有 DOM 和 Canvas，不要求每次滚动重新投影所有 Note，因此这两条路径可以比较流畅。

纵向滚动会改变可见 Pitch 几何。原来的 Track Layout 只过滤 Pitch，没有按水平可视区域
过滤时间；Grid 同时覆盖完整时间轴。DOM Renderer 虽按身份复用节点，但每次仍重写全部
样式 / 属性，将节点搬入 DocumentFragment，再用 `replaceChildren` 装回。对 4,480 个 Note
连续执行时，DOM 阶段已超过普通 60Hz 帧预算，不能把卡顿只归因于 Note 计算或机器性能。

## 调整与边界

- Track 按滚动容器宽度划分页，保留当前页和左右各一页缓冲；页内横向滚动复用绘制窗口，
  跨页或尺寸变化才移动窗口。Grid 与 Note 共享有界渲染 Viewport，只投影相交时间 / Pitch。
- 完整 Timeline Viewport 继续拥有 Pointer、Preview 与时间映射。绘制窗口仅改变显示层的
  原点和宽度，Header、Clip 区域、CC64、Playhead 与可保存事实的坐标不变。
- keyed DOM 先移除退出窗口的 Note，保留其余节点的连接；仅在层级改变时重排，仅为变化的
  视觉属性写 DOM。Clip Focus 同样获得此 Renderer 改进，仍按既有产品语义显示完整 Clip。
- 继续沿用现有 Read Model 与线性可见性筛选；不增加空间索引、Worker、GPU 或第二份 Note
  状态。窗口 Observer 在组合失败与卸载时释放，迟到回调不恢复渲染。

后续若高密度可见窗口、频繁 Commit 或 Clip Focus 大量可见 Note 再次暴露瓶颈，需要针对
该场景重新测量查询、Scene、DOM、光栅化和输入延迟，不能将本次结果外推为任意规模保证。
