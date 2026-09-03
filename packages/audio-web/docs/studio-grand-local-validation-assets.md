# Studio Grand 本地验证资产记录

> Status: Batch 4A.1b reviewed and committed as `07f4218`
>
> Last verified: 2026-09-02 by the MI1B shared Score Core definition; implementation pending review
>
> Asset classification: developer-local validation fixture; not a Seele distributable asset
>
> Recorded: 2026-08-12

本文记录 Audible MIDI Playback V1 当前用于发声验证的资产来源链、技术身份与产品边界。
它不是授权结论，也不把本机快照转化为 Seele 可以再分发的产品资源。

## 使用范围

当前快照只允许作为开发者本机的、可替换的发声验证输入：

- 原始 Catalog、Indexes、Mapping、Archive、解压采样和由它们生成的 Manifest 只位于被忽略的
  `apps/studio/public/soundbanks`，不提交到仓库；
- 可以由本机 Vite dev server 提供给浏览器验证，但不进入生产 `dist`、安装包、在线演示或其他
  交付物；
- 仓库不提供自动下载器，也不在应用启动时访问上游静态资源；
- 缺少本地快照时，Runtime 必须报告资源不可用，不能静默替换 Project 中的 Instrument；
- 未来若需要随产品提供 Studio Grand，必须换用明确允许该分发方式的资源，或补齐针对该用途的
  授权证据。

上述边界不阻止浏览器音频 Runtime 使用开发者已经提供的本地文件进行验证。它只阻止这些文件
被误认为 Seele 产品的一部分。

## 本地布局与构建边界

快照根目录固定为 Studio public 内、由 `.gitignore` 排除的：

```text
apps/studio/public/soundbanks/
├── catalog/
├── indexes/
└── soundbanks/
```

Vite dev server 直接提供 public 文件，适合浏览器通过同源 URL 验证采样。生产构建则显式设置
`build.copyPublicDir = false`，不会复制 public 中的任何内容；favicon 已移入正常的 Vite 模块
资产管线。标准 build 完成后及 preview 启动前还会拒绝
`apps/studio/dist/soundbanks`，作为配置漂移的第二道检查。

因此这里的 public 只表示“本地开发服务器可访问”，不表示 Seele 将该快照作为公开产品资源。
若未来 public 中出现其他需要随产品交付的静态文件，应进入正常资产管线或建立显式白名单，
不能重新开启整目录复制。

## 来源链

本机快照由项目所有者从独立的 Soundbank 采集工作目录提供，并于 2026-08-11 迁入 Seele 开发
工作区。快照内的 Catalog、Indexes、Mapping 和静态资源字段标识了同一上游数据集合；Seele
没有把采集工具、远程 URL 或上游 JSON schema 作为产品依赖。具体来源只在对应逆向分析中记录，
产品与代码统一将规范化结果视为默认内置音源。

只读盘点得到 439 个 Soundbank：

- 289 个 `MIDISampleSynth`；
- 11 个 `FMSynth`；
- 139 个 `VASynth`。

Project 的稳定身份 `studio-grand` 当前仅在本地规范化过程中映射到上游 slug
`studio-grand-v2-v4`。这条映射不是 Project File 路径，也不保证未来替代资源沿用上游文件名。

Studio Grand 的本地证据链为：

```text
catalog/selected-soundbanks.json
-> indexes/by-general-midi-program.json (General MIDI Program 0)
-> indexes/soundbank-map.json
-> soundbanks/MIDISampleSynth/studio-grand-v2-v4/*.catalog.json
-> soundbanks/MIDISampleSynth/studio-grand-v2-v4/*.mapping.json
-> soundbanks/MIDISampleSynth/studio-grand-v2-v4/*-wav.zip
```

Studio Grand 与其余 288 个 MIDISampleSynth 的 Mapping / Archive 全量字段盘点与兼容性推断见
[默认内置 MIDISampleSynth 控制文件逆向分析](./default-built-in-midi-sample-synth-reverse-analysis.md)。

## 已核验指纹

以下 SHA-256 只标识当前本机输入，供生成结果复现和以后替换时比较；它们不表达授权状态。

| 文件                                   | 字节       | SHA-256                                                            |
| -------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `catalog/selected-soundbanks.json`     | 434,872    | `a1925bfec6e389fd37a901e21d571bdfd0ccfec162f3809c8fae95eaf268a924` |
| `indexes/by-general-midi-program.json` | 81,737     | `12e42ec8d9131973317ae805c5d120426b95ec8abdda87f596e355dd39a0df66` |
| `indexes/soundbank-map.json`           | 1,498,666  | `58e800e66415f24665926a945f732f93ac4abb99923d0d078f96e94aa140138d` |
| `studio-grand-v2-v4.catalog.json`      | 954        | `95ac74b53e1f96831f50f7a79c441672c0cd23dfedc371e71769b66d76d244ea` |
| `studio-grand-v2-v4.mapping.json`      | 12,817     | `8627c855c32d85eba4899b0b29deaa76e84b9f7ff11f49c5e2b3256b950d913b` |
| `studio-grand-v2-v4-wav.zip`           | 22,249,268 | `55f5c6b2aec430f245f83b485d4f6df9a06f4ca3167aaa779b81eb0c0134a1a9` |

当前 Mapping 声明 `MIDISampleSynth`、30 个 Sample Zone、`release = 0.133`，WAV archive
包含 30 个 WAV 与一份 JSON。首个 Zone 从 MIDI `21` 开始，最后一个上游 Zone 延伸至 `119`；
这些只是规范化输入，产品的 `21...108` 范围、字段单位和 release 行为仍须由后续 Manifest
contract 与听觉审阅明确决定。

## 本地规范化产物

Batch 4A.1b 提供显式开发工具，不让 Studio 启动流程扫描原始 Catalog、Indexes 或 ZIP。MI1B 将
同一配置迁入共享 Score Core Definition，但保持这个单音源命令与生成结果：

```sh
pnpm --filter @seele-daw/audio-web prepare:studio-grand-local
```

工具只接受上文已记录指纹的固定输入，通过 Catalog、General MIDI Index 与 Soundbank Map
交叉确认目标身份，再验证单 Bank Catalog、外部 Mapping 以及 Archive 内嵌 Mapping。外部与内嵌
Mapping 必须结构相同；稳定产品身份 `studio-grand` 只在该边界映射到当前本地 source slug。

受限 ZIP Adapter 使用 `fflate` 解码，但只返回调用方预先声明的精确 entry 集合。它拒绝绝对路径、
反斜杠、空段、`.` / `..`、编码后的 traversal、大小写或 Unicode normalization 冲突、未声明或
缺失 entry，以及 Stored / Deflate 之外的压缩方法；解压可以通过 `AbortSignal` 取消。Studio Grand
当前使用的预算为：

| 预算                    | 上限   |
| ----------------------- | ------ |
| 压缩 Archive            | 32 MiB |
| entry 数量              | 64     |
| 单个 entry 解压后大小   | 8 MiB  |
| 全部 entry 解压后总大小 | 64 MiB |
| 单个 entry 解压比       | 64:1   |

通用 Adapter 不猜测媒体类型或可信 checksum；调用方必须在返回字节进入产品资源前继续验证。本地
Studio Grand 工具会先核对已记录的整包 SHA-256，再要求内外 Mapping 相同，严格解析每个 WAV 的
RIFF / format / data metadata，并确认 Manifest 的 offset 与 loop 没有越过 WAV 时长。每个生成文件
的 SHA-256 和 WAV metadata 写入校验报告。未来后端 Bundle 仍须提供其自身可信的期望摘要，不能把
本机记录的指纹泛化为任意 Archive 的信任来源。

生成目录仍位于被忽略且不会进入生产构建的 public 子树：

```text
apps/studio/public/soundbanks/generated/studio-grand/
├── manifest.json
├── preparation-report.json
└── samples/
    └── 30 WAV files
```

当前真实输入的生成结果为：

- Archive 共 31 个 entry，压缩大小 `22,249,268` 字节，解压后总大小 `33,119,642` 字节；
- 输出共 32 个文件：30 个 WAV、一个 Manifest 与一个 preparation report；
- Manifest 保留 30 个 Zone，并把可播放范围显式裁剪为 MIDI `21...108`；
- `manifest.json` SHA-256 为
  `f0566a4573a63d252221a9cc53ca9fee194c187bbe4ccf44405a604b5eb45e98`。

首次执行通过同目录 staging 后原子发布。若目标目录已存在，工具只接受目录集合、文件集合与
全部内容哈希完全一致的结果；缺失、额外或漂移文件都会失败，不自动覆盖。相同输入重复执行已经
核验为幂等。生成目录继续受 `.gitignore` 与 Vite `dist` guard 约束，因此这些本地产物不改变
“不可作为 Seele 可分发资产”的分类。

基于这些规范化产物得到的内存预算、Chromium decode smoke 与试听清单见
[Studio Grand 加载测量与听觉 Gate](./studio-grand-loading-and-listening-gate.md)。

## 授权状态

快照目录中没有发现随资产保存的 LICENSE、NOTICE 或明确允许将原始采样随第三方 DAW 再分发的
证明。因此 Seele 当前不声称拥有该项再分发权，也不把“非商业”解释为可以打包原始 Soundbank。

若以后替换资产，本记录需要同步更新：来源名称、版本、获取日期、许可证或授权证据、允许的
产品使用方式、输入指纹、规范化工具版本以及最终 Manifest / 音频文件指纹。
