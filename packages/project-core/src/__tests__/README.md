# Project Core 测试目录约定

`__tests__` 使用以下固定结构：

```text
__tests__/
├── *.spec.ts       按被测领域命名的测试套件，保持平级
├── fixtures/       不由当前生产代码动态生成的静态协议 / 兼容样本
└── support/        只服务测试的 factory、driver、builder 和断言助手
```

规则：

- spec 可以直接导入 package root，或导入确实需要白盒覆盖的包内生产模块；
- 被两个及以上 spec 复用的测试数据和快捷函数放入 `support/`；
- 需要防止当前 writer / runtime 重构静默改写的历史格式样本放入 `fixtures/`，测试期间不从当前 projector 重新生成；
- 只服务测试的导出、工厂、伪实现或故障注入能力不得放入 `model/`、`mutation/`、`commands/`、`commit/` 等生产目录；
- 生产模块不能为了测试暴露额外入口。若行为无法从真实生产入口观察，应先判断该行为是否已经属于当前产品边界；
- `support/` 可以依赖生产代码，生产代码和 package root 不得反向依赖 `support/`。

最后一项由 workspace 架构检查强制执行：任何生产源码通过别名或相对路径导入 `src/__tests__` 都会失败。
