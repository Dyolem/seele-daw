# Seele DAW

面向桌面浏览器的轻量 Web DAW，使用 Vue 3、TypeScript、Vite、Web Audio API 与 pnpm Workspace。

## 工程结构

```text
seele-daw/
├── apps/
│   └── studio/              Vue 应用与唯一 Composition Root
├── packages/
│   ├── project-core/        项目模型、命令、事务、历史与查询端口
│   ├── editor/              Tool、Interaction、Selection 与编辑器浏览器层
│   ├── playback/            Transport、Compiler、Scheduler 契约与播放计划
│   ├── audio-web/           Web Audio Backend 与 AudioWorklet
│   └── platform-browser/    存储、文件、权限、Worker 与浏览器服务实现
├── tooling/
│   ├── architecture-rules/  包依赖边界检查
│   ├── eslint-config/       ESLint 共享配置演进位置
│   └── tsconfig/            TypeScript 共享配置
└── docs/
    ├── architecture/        架构基线文档
    └── adr/                 Architecture Decision Records
```

当前遵循架构总纲的初期五包方案；`editor-renderer`、Asset 和 Persistence 等边界稳定后再拆包。

## 工具链

- Node.js 24 LTS；`.node-version` 与 `.nvmrc` 固定团队默认版本。
- pnpm 11.3.0；根 `package.json#packageManager` 固定精确版本。
- Corepack 可读取 `packageManager` 并提供对应 pnpm，但它不负责安装或切换 Node.js。

首次安装：

```sh
fnm install
fnm use
corepack enable pnpm
pnpm install
```

如果 pnpm 11.3.0 已由其他方式安装，可以跳过 `corepack enable pnpm`。

## 常用命令

```sh
pnpm dev
pnpm type-check
pnpm test:run
pnpm lint
pnpm build
pnpm check
```

## 架构基线

- [简洁架构总纲](docs/architecture/web-daw-architecture-brief.md)
- [长期路线与架构设计 v3](docs/architecture/web-daw-long-term-architecture-v3.md)
