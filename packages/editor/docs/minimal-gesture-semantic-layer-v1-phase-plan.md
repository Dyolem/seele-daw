# Minimal Gesture / Semantic Layer V1 草案替代说明

> 状态：已被修订提案替代；原 MG1–MG4 未实施
>
> 日期：2026-09-11

当前方案见 [Editor Input Foundation V1 阶段计划](../../../apps/studio/docs/editor-input-foundation-v1-phase-plan.md)。
用户将独立手势架构与统一、可查询、可自定义的快捷键系统提升为下一阶段优先事项。

原草案仅统一 Piano Roll 的 Note、CC64 与 Track Pencil，范围不足；新版使用 Tempo 和
Timeline Locate 验证跨编辑器边界，先交付 Shortcut Catalogue / User Keymap，再迁移
独立 Interaction Session 与语义操作。

原草案“必须删除 XState”及“任意 Viewport 变化都取消手势”两项决定撤回。状态机库属于
内部实现选择；现有 Edge Scroll 与未来 Clip 编辑需要显式的动态坐标映射。其他仍适用的
Begin 目标冻结、Preview 不写事实、一次原子 Command、失败关闭与提交回告已纳入新计划。
