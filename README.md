# Seele DAW

面向桌面浏览器的轻量 Web DAW，使用 Vue 3、TypeScript、Vite、Web Audio API 与 pnpm Workspace。

## 文档

- [架构](ARCHITECTURE.md)：分层、一次编辑的流向、新代码放在哪里、常见改动配方。先读这一篇。
- [长期架构与路线](docs/architecture/long-term-architecture.md)：现状评估、目标架构、阶段路线与
  待决定的产品问题
- [工程代码准则](CODE_GUIDELINES.md)
- [产品功能手册](PRODUCT.md)与 [Piano Black 设计语言](DESIGN.md)
- [ADR](docs/adr/README.md)：长期决定及其理由
- 各包 README：包内的模型、契约与阅读顺序
- [归档](docs/archive/README.md)：已完成阶段的计划与收口报告，不再维护

## 工程结构

```text
seele-daw/
├── apps/
│   └── studio/              Vue 应用与唯一 Composition Root
├── packages/
│   ├── type-utils/          纯编译期、跨领域的共享 TypeScript 类型工具
│   ├── midi-file/           标准 MIDI 文件中立契约与可替换 Codec Adapter
│   ├── project-core/        项目模型、命令、事务、历史、查询、Snapshot 与持久化格式
│   ├── project-midi/        MIDI Document 与 Project Model 的可替换映射桥接层
│   ├── editor/              输入归一化、手势，以及 Piano Roll 的几何与渲染
│   ├── playback/            编译、调和、调度、Transport 与播放引擎
│   ├── audio-web/           Web Audio 输出与采样音源
│   └── platform-browser/    IndexedDB 项目存储与本地文件读取
├── tooling/
│   ├── architecture-rules/  依赖方向与平台隔离检查
│   ├── eslint-config/       ESLint 共享配置演进位置
│   ├── quality-rules/       Workspace 质量命令一致性检查
│   └── tsconfig/            TypeScript 共享配置
└── docs/
    ├── architecture/        长期架构与路线
    ├── adr/                 Architecture Decision Records
    └── archive/             历史计划与收口报告
```

当前采用七个业务硬边界包，并增加一个无运行时代码的 `type-utils` 基础叶子包。新建一个包的条件见[长期架构与路线](docs/architecture/long-term-architecture.md)的 3.1 节。

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
pnpm lint:fix
pnpm format
pnpm format:check
pnpm build
pnpm check
```

`pnpm lint`、`pnpm format:check` 与 `pnpm check` 不重写源码；`pnpm format` 和
`pnpm lint:fix` 是显式写入命令。质量配置只由仓库根目录维护，在任一 workspace package 或其
功能目录执行同名命令时，会委托根目录并检查整个 workspace，避免子包形成不同格式基线。

## 导入路径

源码形式被其他 workspace 消费的 package 使用 package-private `#internal/*`，并由各自 `package.json#imports` 映射到自身 `src/*.ts`。该映射按 importer 最近的 package 生效，因此多个 package 可以安全复用同一个内部别名。Studio 等最终应用继续使用自身 tsconfig 中的 `@/*`、`~/*`。

跨 package 依赖必须使用 `@seele-daw/<package>` 的公开 `exports` 入口，并在消费者 `package.json` 声明显式 workspace dependency；禁止通过 `#internal/*`、相对路径或公开 subpath 绕过 package root。位于同一目录或紧邻局部模块的 `./` 引用可以保持相对，以保留局部依赖关系。
