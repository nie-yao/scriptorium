# LaTeX 论文审改 Web App 需求说明

## 1. 项目定位

本项目是一个面向 LaTeX 论文写作的本地 Web 应用，目标是提供类似 Overleaf 的轻量编辑体验，并重点支持 AI 修改建议的逐项审阅。

系统应允许用户在浏览器中编辑 LaTeX 项目、查看编译结果、审阅 AI 对源码提出的修改，并对每一处修改执行 Accept、Reject 或手动调整，最终保存为真实项目文件。

除“AI 修改建议生成”本身外，其余功能均应通过确定性的代码算法实现，包括 diff、hunk 对齐、冲突检测、LaTeX 编译、PDF 预览、文件读写、状态管理等。

## 2. 核心目标

1. 支持本地 LaTeX 项目的浏览、编辑、保存。
2. 支持 AI 修改前后的版本快照管理。
3. 支持同一 `.tex` 文件内逐项接受或拒绝 AI 修改。
4. 支持用户在审阅过程中自由手动编辑文档。
5. 支持全部审阅完成后一次性保存最终文档。
6. 支持 LaTeX 编译和 PDF 预览。
7. 支持多个本地项目的创建、打开与切换。
8. 支持项目内上传 `.tex` 文件与图片资产、新建文件夹、拖动整理文件。
9. 保证所有非 AI 建议生成逻辑可追踪、可复现、可测试。

## 3. 非目标

初版暂不追求完整复刻 Overleaf。

暂不支持多人实时协作、云端同步、账户系统、评论线程、复杂权限管理、模板市场、在线投稿集成。

暂不依赖 AI 来判断 diff、冲突、接受或拒绝逻辑。AI 只负责生成修改建议或解释建议原因。

初版项目管理只管理本机项目，不承担 Git 分支管理、云盘同步、压缩包导入导出或多人项目权限控制。

## 4. 典型使用流程

### 4.1 项目管理流程

1. 用户进入应用后首先看到项目首页。
2. 项目首页展示本地项目列表，并提供创建新项目、打开已有本地 LaTeX 项目目录的入口。
3. 用户点击项目列表中的某个项目后，进入该项目的编辑工作区。
4. 系统为项目生成稳定的 `projectId`，记录项目名称、根目录和主编译入口。
5. 项目工作区显示该项目的文件树、编辑器、PDF / Review / Logs 面板。
6. 用户可在项目工作区的文件树中上传 `.tex` 文件和图片资产，或新建文件夹。
7. 用户可通过拖拽把外部文件上传到目标文件夹，也可拖动项目内文件/文件夹调整位置。
8. 用户可从项目工作区返回项目首页，再进入其他项目；如果当前文件有未保存内容，当前实现使用确认框让用户取消或继续切换。
9. 用户每次进入项目后明确选择要打开的文件或 review session。

### 4.2 论文审改流程

1. 用户从项目首页进入一个本地 LaTeX 项目。
2. 系统显示项目工作区，包括文件树、主编辑器、PDF 预览。
3. 用户选择一个 `.tex` 文件。
4. Codex、其他 AI 工具或用户手动粘贴的 proposed 文本对文件提出修改。
5. 系统记录三份文本状态：
   - `Original`：AI 修改前的原始文本。
   - `Proposed`：AI 修改后的建议文本。
   - `Working`：用户当前正在编辑的最终文本。
6. 系统基于 `Original` 和 `Proposed` 计算修改块。
7. 用户逐项执行：
   - `Accept`：接受该修改。
   - `Reject`：恢复该处原文。
   - 手动编辑：直接修改当前文本。
8. 如果用户手动编辑影响某个修改块，系统保持该 hunk 为 `pending`，但在 Review 面板中提供 `Keep Edit / Use AI / Reject` 操作；只有用户点击 `Keep Edit` 后才标记为 `edited`。
9. 用户完成全部 hunk 审阅后点击 `Save`；存在 `pending` 或 `conflict` hunk 时不能保存最终 review 结果。
10. 系统将 `Working` 写回真实 `.tex` 文件。
11. 用户可重新编译并查看 PDF。

## 5. 界面布局

应用采用两级界面结构：项目首页与项目工作区。

### 5.1 项目首页

项目首页是应用启动后的默认视图，类似 Overleaf 的项目列表页。

项目首页应包含：

- 顶部应用栏：显示应用名称，并提供 `New Project`、`Open Project` 等项目级操作。
- 项目列表：展示项目名称、项目根目录、主编译入口。
- 空状态：当没有项目时，引导用户创建新项目或打开已有项目。

项目首页不显示编辑器、PDF 预览或 review 控件。用户必须点击某个项目后才进入编辑工作区。

建议布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ Scriptorium                         Open Project  New Project │
├──────────────────────────────────────────────────────────────┤
│ Projects                                                     │
│                                                              │
│ ┌───────────────┬──────────────────────────┬──────────────┐  │
│ │ Name          │ Root                     │ Main file    │  │
│ ├───────────────┼──────────────────────────┼──────────────┤  │
│ │ sample-project│ /path/to/sample-project  │ main.tex     │  │
│ └───────────────┴──────────────────────────┴──────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 项目工作区

项目工作区在用户点击某个项目后显示。编辑工作区建议采用三栏布局：

```text
┌──────────────┬──────────────────────────┬──────────────────────┐
│ 文件树        │ LaTeX 编辑器              │ PDF / Review / Logs  │
│              │                          │                      │
│ main.tex     │ 带 Accept/Reject 标记     │ PDF 预览              │
│ refs.bib     │ 可直接手动编辑             │ 编译日志               │
│ sections/    │                          │ 修改列表               │
└──────────────┴──────────────────────────┴──────────────────────┘
```

工作区左侧应提供返回项目首页的入口。返回项目首页前，如果当前文件存在未保存内容，当前实现会提示用户取消或继续返回；“直接在提示中保存”可作为后续增强。

主编辑器应优先显示 `Working` 文本，而不是只读 diff。

修改块应优先在左侧文本编辑器中展示对比结果。对于每个可定位 hunk：

- 旧文字或被删除内容用红色阴影/背景显示。
- 新文字或 AI 建议内容用绿色阴影/背景显示。
- 红色旧内容与绿色新内容必须使用一致的字体、字号、行高、圆角、内边距和边线风格；二者只通过语义色区分。
- 对比样式应采用审核器式整行高亮：受影响的删除行使用整行浅红背景，新增/修改行使用整行浅绿背景。
- 在整行浅红/浅绿高亮基础上，系统应进一步对同一 hunk 内的红色旧段落与绿色新段落做细粒度文本对比，将真正发生变化的词、短语或字符片段叠加深色重点高亮，帮助用户快速识别实质差异。
- 深色重点高亮必须由确定性的 diff 算法或成熟文本 diff 包计算，不得通过 AI 判断哪些片段不同。
- 旧文本中被删除或被替换的旧字符使用深红色重点高亮；新文本中新增或替换后的新字符使用深绿色重点高亮。
- 对于纯新增修改，旧文本没有被删除或替换的字符，因此旧文本中不显示深红插入点或深红占位，只在新文本中高亮新增内容。
- 对于“替换”类型修改，应在修改位置同时展示红色旧内容与绿色新内容。
- 对于“纯新增”修改，可只显示绿色新内容。
- 对于“纯删除”修改，可在原位置附近显示红色旧内容占位。

右侧 Review 面板仍可保留 hunk 列表、状态统计和 Accept / Reject / Keep Edit / Use AI 操作，但不应成为用户查看 hunk 对比的唯一入口。

## 6. 技术路线与架构原则

项目采用 Web-first 路线开发第一阶段 MVP，并从一开始保留桌面化迁移边界。

推荐技术栈：

- 前端：React + TypeScript + Vite。
- 编辑器：CodeMirror 6。
- PDF 预览：PDF.js。
- 核心算法：独立 TypeScript package。
- Web MVP 后端：Rust 本地服务。
- 桌面端优先方案：Tauri。
- 桌面端备选方案：Electron。

整体架构应拆分为四层，当前仓库中的对应目录为：

```text
packages/core/
  diff, hunk, anchor, review session, LaTeX project logic

apps/web/
  React components, CodeMirror integration, review panel, PDF viewer

packages/platform/
  ProjectManagerProvider
  FileSystemProvider
  LatexCompilerProvider
  AiSuggestionProvider

apps/
  local-server-rs
  desktop-tauri (future)
```

`core` 层不得依赖浏览器 DOM、Node.js 文件系统或 Tauri API。它只处理纯数据和确定性算法，便于单元测试和跨平台复用。

`ui` 层负责展示和交互，不应直接读写本地文件、调用 LaTeX 编译命令或直接访问 AI API。所有外部能力都必须通过 `platform` 层接口获得。

`platform` 层定义应用能力边界。Web MVP 中由 Rust 本地服务实现；桌面化时由 Tauri commands、Tauri plugins 或 sidecar 实现；必要时可再增加 Electron 实现。

核心平台接口建议包括：

```ts
interface ProjectTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectTreeNode[];
}

interface ProjectSummary {
  projectId: string;
  name: string;
  rootPath: string;
  compileEntry: string;
  createdAt: string;
}

interface ProjectWorkspace {
  project: ProjectSummary;
  tree: ProjectTreeNode;
}

interface CreateProjectRequest {
  name: string;
  parentPath?: string;
  template?: "blank" | "basic-paper";
}

interface OpenProjectRequest {
  rootPath: string;
}

interface UploadFileRequest {
  projectId: string;
  targetDirectory: string;
  fileName: string;
  contentBase64: string;
  conflictPolicy: "error" | "replace" | "keep-both";
}

interface CreateDirectoryRequest {
  projectId: string;
  path: string;
}

interface MoveEntryRequest {
  projectId: string;
  sourcePath: string;
  targetDirectory: string;
  conflictPolicy: "error" | "replace" | "keep-both";
}

interface FileSystemProvider {
  readTextFile(projectId: string, path: string): Promise<string>;
  writeTextFile(projectId: string, path: string, content: string): Promise<void>;
  listProjectTree(projectId: string): Promise<ProjectTreeNode>;
  readBinaryFile(projectId: string, path: string): Promise<ArrayBuffer>;
  createDirectory(input: CreateDirectoryRequest): Promise<ProjectTreeNode>;
  uploadFile(input: UploadFileRequest): Promise<ProjectTreeNode>;
  moveEntry(input: MoveEntryRequest): Promise<ProjectTreeNode>;
}

interface ProjectManagerProvider {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectRequest): Promise<ProjectSummary>;
  openExistingProject(input: OpenProjectRequest): Promise<ProjectSummary>;
  openProject(projectId: string): Promise<ProjectWorkspace>;
}

interface CompileRequest {
  projectId: string;
  entry: string;
}

interface CompileResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  log: string;
  pdfPath?: string;
}

interface LatexCompilerProvider {
  compile(input: CompileRequest): Promise<CompileResult>;
  getPdf(projectId: string, path: string): Promise<ArrayBuffer>;
  getLog(projectId: string, path: string): Promise<string>;
}

interface AiEditRequest {
  projectId: string;
  filePath: string;
  instruction: string;
  currentText: string;
  contextFiles?: Array<{ path: string; text: string }>;
}

interface AiEditResult {
  proposedText: string;
  explanation?: string;
}

interface AiSuggestionProvider {
  proposeEdit(input: AiEditRequest): Promise<AiEditResult>;
}
```

该设计目标是：Web MVP 与未来 macOS、Windows 桌面端共享同一套 React UI 和核心算法。桌面化时优先新建 `desktop-tauri` 外壳，而不是重写编辑器与审阅逻辑。

## 7. 核心功能需求

### 7.1 项目与文件管理

项目管理应支持：

- 项目列表：展示项目名称、根目录和当前编译入口。
- 创建项目：当前 Web UI 输入项目名称，并在本地服务授权的 workspace 根目录下创建项目根目录；API / provider 可接收可选 `parentPath`。非空模板会生成基础 `main.tex` 和 `figures/` 文件夹。
- 打开已有项目：当前 Web UI 输入已有 LaTeX 项目目录路径，并要求该路径位于本地服务授权的 workspace 根目录内。
- 切换项目：切换前若当前文件存在未保存内容，当前实现会提示用户取消或继续切换。
- 项目入口：每个项目应有稳定 `projectId`，即使项目名称变更也不影响项目索引与 review session 归属。

文件树应支持显示常见论文项目文件：

- `.tex`
- `.bib`
- `.cls`
- `.sty`
- `.bst`
- `.png`
- `.jpg`
- `.jpeg`
- `.pdf`

支持读取、编辑、保存文本文件。

支持上传文件：

- 上传 `.tex`、`.bib`、`.cls`、`.sty`、`.bst` 等 LaTeX 文本文件。
- 上传 `.png`、`.jpg`、`.jpeg`、`.pdf` 等论文常用二进制资产，其中图片文件主要用于 `\includegraphics`。
- 上传按钮使用当前选中的文件夹作为目标，未选中时上传到项目根目录；从系统文件管理器拖入文件树时由拖拽落点确定目标文件夹。
- 当前 Web UI 对同名文件使用 `keep-both` 策略；本地 API 支持 `error`、`replace`、`keep-both` 三种冲突策略。
- 上传完成后刷新文件树。

支持新建文件夹：

- 用户可在项目根目录或任意子文件夹中新建文件夹。
- 文件夹名不得为空，不得包含路径分隔符，不得使用 `.`、`..` 或系统保留名称。
- 不允许在 `.latex-review`、构建产物目录或被忽略目录内新建用户文件夹。

支持拖拽整理：

- 从系统文件管理器拖入文件树：视为上传文件到拖拽目标文件夹。
- 在项目文件树内拖动文件：移动文件到目标文件夹。
- 在项目文件树内拖动文件夹：移动整个子树到目标文件夹。
- 不允许把文件夹移动到自身或自身子目录。
- 移动 `.tex`、图片或辅助文件后，系统不应静默修改 LaTeX 引用路径；可在后续增强中提供引用路径更新建议。
- 当前拖拽过程中提供目标文件夹高亮；非法移动由本地服务拒绝，前端友好的不可投放状态和失败提示仍属于后续增强。

支持忽略构建产物，例如：

- `.aux`
- `.log`
- `.out`
- `.toc`
- `.bbl`
- `.blg`
- `.fls`
- `.fdb_latexmk`
- `.synctex.gz`

项目文件操作必须通过 `FileSystemProvider` 暴露给 UI。UI 不直接访问浏览器 File System Access API、Node.js 文件系统、Tauri API 或 Electron IPC。

### 7.2 LaTeX 编辑器

编辑器应支持：

- LaTeX 语法高亮。
- 查找与替换。
- 基础撤销和重做。
- 行号。
- 当前文件脏状态提示。
- 工具栏保存。
- 在 review session 中将 hunk 对比直接显示在编辑器正文对应位置。
- 保存快捷键和自动保存可作为后续功能。

编辑器中的内容始终代表 `Working` 状态。

编辑器实现应优先采用 CodeMirror 6，以便深度定制 inline review widget、gutter marker、diagnostics、快捷键和 LaTeX 语法扩展。

编辑器内 hunk 对比展示要求：

- `Proposed` / `Working` 中的新内容应用绿色背景或绿色阴影标记。
- `Original` 中被删除或替换的旧内容应用红色背景或红色阴影标记，并作为只读装饰显示，不应直接写入 `Working` 文本。
- 红/绿 hunk 装饰应保持统一视觉规格：同一字体族、同一字号、同一行高、同一圆角和相同密度，避免红色旧内容看起来像另一个组件。
- 红/绿 hunk 装饰应优先覆盖整行背景，而不是只覆盖被修改的字符片段。
- 在红/绿整行装饰内部，应基于 `originalText` 与 `proposedText` 再计算段内或行内细粒度差异，并将真正不同的词、短语或字符片段叠加深色重点高亮。
- 旧文本段内的删除/替换旧字符使用深红色；新文本段内的新增/替换新字符使用深绿色。纯新增时旧文本段内不显示深色插入点。
- 段内深色重点高亮只用于视觉提示，不应改变 `Working` 文本内容，也不应影响 Accept、Reject、Keep Edit、Use AI 的语义。
- hunk 装饰必须跟随 `Working` 文本定位；如果无法可靠定位，核心状态应变为 `conflict`，避免在错误位置标记。
- 当前实现会在编辑器内显示可定位且尚未完成处理的 hunk。`accepted`、`rejected`、带有 undo 快照的已完成 `edited`、以及 `conflict` hunk 不再显示编辑器装饰，状态集中显示在右侧 Review 面板。
- 更明确的 editor-side `edited` / `conflict` 专用样式可作为后续增强。

### 7.3 AI 修改审阅

每次 AI 修改应生成一个 review session。

一个 review session 至少包含：

```json
{
  "sessionId": "string",
  "filePath": "main.tex",
  "createdAt": "timestamp",
  "originalText": "string",
  "proposedText": "string",
  "workingText": "string",
  "hunks": []
}
```

每个 hunk 至少包含：

```json
{
  "id": "string",
  "originalRange": [0, 0],
  "proposedRange": [0, 0],
  "workingAnchor": {},
  "status": "pending | accepted | rejected | edited | conflict",
  "originalText": "string",
  "proposedText": "string"
}
```

当前实现还会在 hunk 上维护以下可选字段：

```ts
interface ReviewHunkUndo {
  status: HunkStatus;
  workingAnchor: ReviewAnchor;
  text: string;
}

interface ReviewHunk {
  currentText?: string;
  undo?: ReviewHunkUndo;
}
```

`currentText` 记录当前定位到的 hunk 文本。`undo` 只在 `Accept`、`Reject`、`Keep Edit` 后出现，用于撤回最近一次 hunk 审阅动作。

review session 创建后，系统应把可定位 hunk 的对比渲染到左侧编辑器中。右侧 Review 面板用于集中查看状态和执行操作；左侧编辑器用于在上下文中直接阅读红/绿对比。

当前 Web UI 在浏览器内创建并维护 review session；本地服务已提供创建和读取 session JSON 的 API，但前端尚未把审阅流程持久化到该 API。

### 7.4 Accept / Reject 行为

`Accept`：

- 保留当前 `Working` 中对应修改。
- 将 hunk 状态标记为 `accepted`。
- 移除或淡化该 hunk 的审阅控件。

`Reject`：

- 将当前 `Working` 中该 hunk 对应区域恢复为 `Original` 文本。
- 将 hunk 状态标记为 `rejected`。
- 当前实现会通过 hunk 定位结果替换为 `Original`；如果无法可靠定位，则将 hunk 标记为 `conflict`，不会静默误改。

`Keep Edit`：

- 当用户已手动编辑某个 hunk 时，保留用户当前编辑。
- 将 hunk 状态标记为 `edited`。
- 该操作表示用户明确确认保留人工编辑；只有点击 `Keep Edit` 后，该 hunk 才计入 `edited` 状态。

`Use AI Version`：

- 将该 hunk 恢复为 `Proposed` 文本。
- 可用于用户手动编辑后反悔。

`Undo`：

- `Accept`、`Reject`、`Keep Edit` 会记录操作前的 hunk 文本、状态和定位锚点，并在右侧显示 `Undo`。
- `Undo` 撤回的是最近一次 hunk 审阅动作，而不是撤回用户手动输入的文本。
- 若用户手动编辑后点击 `Keep Edit`，再点击 `Undo`，系统应恢复到“手动编辑后的文本 + pending 状态 + 红/绿块与按钮重新出现”。
- 若用户手动编辑后点击 `Reject`，再点击 `Undo`，系统同样应恢复到 reject 前的手动编辑文本和 pending 状态，而不是恢复到 AI proposed 文本。
- `Use AI Version` 是显式恢复 AI 建议的动作，不应由 `Undo` 隐式触发。

### 7.5 手动编辑与冲突检测

用户在审阅过程中可以自由修改任意文本。

系统应通过算法检测用户编辑是否影响已有 hunk。

若用户编辑与某个 pending hunk 重叠，该 hunk 不应自动计入 `edited`。系统应保持其状态为 `pending`，但通过当前 `Working` 文本与 `Proposed` 文本的确定性对比，在右侧显示 `Keep Edit / Use AI / Reject` 操作。

只有当用户点击 `Keep Edit` 后，该 hunk 状态才变为 `edited`，并作为已完成处理的 hunk 隐藏左侧红/绿装饰。

若系统无法可靠定位 hunk，则状态变为 `conflict`。当前实现会在 Review 面板显示 conflict 状态，避免在错误位置标记或替换文本。

后续可增加专用冲突解决 UI，让用户手动选择：

- 保留当前编辑。
- 恢复原文。
- 使用 AI 建议。
- 手动解决后标记完成。

### 7.6 Save 与 review session 结束

`Save` 按钮用于将当前 `Working` 文本写入真实项目文件，并把该文本设为新的 clean baseline。

无 active review session 时：

- 若当前文件有未保存编辑，`Save` 可用。
- 点击 `Save` 后写入当前编辑器文本，更新 `originalText`，并将 `dirty` 置为 false。

有 active review session 时：

- 只要存在 `pending` 或 `conflict` hunk，`Save` 不可用；若通过代码路径触发保存，系统应阻止保存并提示用户先解决 pending/conflict hunk。
- 当全部 hunk 均为 `accepted`、`rejected` 或 `edited` 后，`Save` 可用。即使最终 `Working` 文本与原文件相同，也应允许点击 `Save` 以结束本轮 review session。
- 点击 `Save` 后，系统写入当前 `Working` 文本，更新 `originalText`，清空 active review session，并清除所有 hunk-level undo 快照。
- `Save` 是持久化边界。保存后不再允许本轮 review 的 hunk-level `Undo`；若用户需要恢复保存后的文件内容，应通过文件级历史、版本控制或未来的文件级撤回功能完成。

### 7.7 Diff 与锚点算法

系统不应只依赖行号定位 hunk。

建议使用组合策略：

1. 初始 diff：基于 `Original` 与 `Proposed` 生成 hunks。
2. 文本锚点：为每个 hunk 记录前后上下文。
3. 重新定位：当 `Working` 被编辑后，通过上下文匹配重新定位 hunk。
4. hunk 内细粒度 diff：对红色旧段落与绿色新段落进行词级或字符级对比，生成用于深红/深绿重点高亮的稳定 span range。
5. 冲突判断：若匹配失败或多处匹配，则标记为 conflict。

可选算法：

- Myers diff
- Patience diff
- diff-match-patch 风格文本匹配
- 基于上下文窗口的 anchor matching

hunk 内细粒度高亮必须使用成熟算法包或固定确定性代码实现，例如 `diff-match-patch`、`jsdiff`、Myers diff 的词级/字符级实现，或项目内经过单元测试的固定算法。系统不得把红/绿段落交给 AI 判断真实差异片段。纯新增修改不得在旧文本中生成深色插入点。

### 7.8 LaTeX 编译

支持用户点击 `Compile` 编译论文。

初版可调用本地命令，例如：

```bash
latexmk -pdf main.tex
```

系统应捕获：

- 编译成功或失败状态。
- stdout 和 stderr。
- `.log` 文件。
- PDF 输出路径。

当前实现会显示 stdout、stderr 和 `.log` 文本；跳转到错误行可作为后续增强。

编译能力必须通过 `LatexCompilerProvider` 暴露给 UI。Web MVP 中由 Rust 本地服务调用本地 `latexmk`；Tauri 桌面端中由 Tauri command 或 sidecar 调用同样的编译流程。

### 7.9 PDF 预览

支持显示编译后的 PDF。

基础功能：

- 刷新 PDF。
- 上一页 / 下一页翻页。
- 缩放。
- 编译后自动刷新。

后续可支持直接页码输入、适应宽度和 SyncTeX 正反向跳转。

## 8. 数据存储

系统需要保存应用级项目索引，并为 review session 持久化保留服务端能力。

应用级项目索引用于记录用户管理过的项目。Web MVP 可暂存于本地服务的 workspace 配置文件；桌面端可迁移到应用数据目录。索引至少包含：

```json
{
  "projectId": "string",
  "name": "Paper Draft",
  "rootPath": "/absolute/path/to/project",
  "createdAt": "timestamp",
  "compileEntry": "main.tex"
}
```

当前本地服务在创建或打开项目时会准备项目目录下的隐藏目录，并提供 session JSON 创建/读取 API：

```text
.project-root/
  .latex-review/
    sessions/
      session-id.json
```

保存内容包括：

- review session 元数据。
- original、proposed、working 文本。
- hunk 状态。

当前 Web UI 尚未调用 session 持久化 API，审阅状态主要保存在浏览器内存中；独立 snapshot 文件可作为后续增强。

不应自动覆盖用户真实文件，除非用户点击 `Save`。

真实论文源文件、上传文件、移动文件和新建文件夹属于显式文件操作，执行前后都应可被用户感知。

## 9. Web MVP 后端需求

Web MVP 后端当前采用 Rust 本地服务，负责：

- 维护项目索引。
- 创建新项目。
- 打开已有项目。
- 限制访问范围为用户指定项目目录。
- 读取文件。
- 写入文件。
- 上传文件。
- 新建文件夹。
- 移动文件或文件夹。
- 创建 review session。
- 执行 LaTeX 编译。
- 返回 PDF 文件。
- 创建和读取 session JSON。
- 通过 review session 创建接口复用 core diff/hunk 计算。

后端应实现 `ProjectManagerProvider`、`FileSystemProvider`、`LatexCompilerProvider` 和可选的 `AiSuggestionProvider` HTTP 适配层。

Web 前端不得绕过这些接口直接访问本地文件或编译命令。

推荐 API 示例：

```text
GET    /api/projects
POST   /api/projects
POST   /api/projects/open
GET    /api/projects/:projectId

GET    /api/projects/:projectId/tree
GET    /api/projects/:projectId/file?path=...
PUT    /api/projects/:projectId/file?path=...
POST   /api/projects/:projectId/folders
POST   /api/projects/:projectId/uploads
POST   /api/projects/:projectId/move

POST   /api/projects/:projectId/review/session
GET    /api/projects/:projectId/review/session/:id

POST   /api/projects/:projectId/compile
GET    /api/projects/:projectId/pdf?path=...
GET    /api/projects/:projectId/log?path=...
```

`/uploads` 当前使用 base64 JSON。每个文件都会经过路径归一化、扩展名校验和冲突处理；上传大小限制仍需补充。

## 10. 前端需求

前端负责：

- 启动后默认展示项目首页，而不是直接进入编辑器。
- 在项目首页展示项目列表、创建项目入口和打开已有项目入口。
- 点击项目后进入项目工作区。
- 在项目工作区提供返回项目首页的入口，并在返回前处理未保存文件。
- 展示文件树。
- 提供上传文件、新建文件夹和拖拽移动入口。
- 展示编辑器。
- 在编辑器内展示 hunk 红/绿对比装饰。
- 展示 hunk 控件。
- 展示 review 状态。
- 展示 PDF。
- 展示编译日志。
- 管理用户交互状态。

前端采用 React + TypeScript + Vite。

编辑器采用 CodeMirror 6。

PDF 预览采用 PDF.js。

前端应通过 platform adapter 访问外部能力：

- Web MVP：调用本地 Rust HTTP API。
- Tauri 桌面端：调用 Tauri commands 或插件。
- Electron 备选端：调用 Electron preload 暴露的安全 IPC。

当前 Web MVP 没有原生目录选择器，创建/打开项目限制在本地服务启动时授权的 workspace 根目录内；桌面端再通过系统目录选择器授权任意项目目录。

前端组件应尽量保持平台无关。除应用入口和 platform adapter 外，不应在业务组件中出现 Tauri、Electron 或 Node.js 专用 API。

## 11. 桌面化路线

桌面端优先采用 Tauri。

Tauri 版本应复用：

- React UI。
- CodeMirror 6 编辑器集成。
- PDF.js 预览组件。
- `core` 层 diff、hunk、review session 算法。
- `platform` 层接口定义。

Tauri 版本主要新增或替换：

- 文件读写 provider。
- LaTeX 编译 provider。
- PDF 文件读取 provider。
- 应用菜单、窗口管理、项目列表。
- 打包、签名和自动更新配置。

如果后续出现以下情况，可评估 Electron 作为备选桌面壳：

- 需要深度复用 Node.js 生态。
- 需要更接近 VS Code/Monaco 的运行环境。
- Tauri WebView 在目标平台出现不可接受的兼容性问题。

桌面化不应改变 review session 数据结构，也不应改变核心 Accept/Reject 算法。

## 12. 安全边界

由于应用会读写本地文件，必须限制访问范围。

要求：

- 后端只绑定 `localhost`。
- 用户启动时指定 workspace 根目录，或通过项目索引打开已授权的项目根目录。
- 所有文件路径必须经过 normalize 与 root-boundary 检查。
- 禁止通过 `../` 访问项目外文件。
- 禁止通过上传或移动操作写入 `.latex-review`、`.git`、`node_modules` 等内部或忽略目录。
- 上传文件当前限制扩展名；单文件大小和总上传大小限制仍需补充。
- 二进制图片/PDF 不应走文本编辑接口。
- 编译命令必须固定模板，不允许任意 shell 命令注入。
- 写入文件前应保留备份或 session 快照。

Web MVP 与 Tauri 桌面端都必须遵守同一套路径边界检查和编译命令白名单。

## 13. AI 集成边界

AI 仅负责生成建议修改。

AI 输入：

- 当前文件内容。
- 用户修改指令。
- 可选上下文文件。
- 可选编译错误日志。

AI 输出：

- 建议后的完整文件文本，或结构化 patch。

系统随后通过代码算法完成：

- diff 计算。
- hunk 切分。
- hunk 定位。
- hunk 内词级或字符级差异高亮。
- Accept / Reject。
- 冲突检测。
- 保存。
- 编译。

AI 调用必须通过 `AiSuggestionProvider`。当前代码已定义该接口，但 Web UI 尚未接入真实 AI 调用；现阶段通过 demo proposal 和手动编辑/粘贴 proposed 文本完成审阅流程。后续 Web、本地或桌面端 AI 能力都应替换为对应 platform adapter。

## 14. MVP 范围

加入项目管理后，第一阶段 MVP 需支持：

1. 使用 React + TypeScript + Vite 搭建 Web MVP。
2. 使用 CodeMirror 6 编辑 `.tex` 文件。
3. 使用 PDF.js 预览编译后的 PDF。
4. 创建新 LaTeX 项目并打开已有 LaTeX 项目目录。
5. 启动后展示项目首页。
6. 在项目首页展示项目列表，并支持从列表进入项目工作区。
7. 项目工作区支持返回项目首页。
8. 文件树浏览。
9. 上传 `.tex` 文件和图片资产。
10. 新建文件夹。
11. 通过拖拽上传外部文件，并通过拖拽移动项目内文件/文件夹。
12. 创建 review session。
13. 基于 `Original`、`Proposed`、`Working` 的 hunk 审阅。
14. Accept、Reject、Keep Edit、Use AI。
15. 在全部 hunk 处理完成后保存最终文件，并结束当前 review session。
16. 在左侧编辑器内显示 hunk 红/绿对比。
17. 在红/绿 hunk 段落内用确定性细粒度 diff 叠加深色重点高亮，旧文本删除/替换部分用深红色，新文本新增/替换部分用深绿色。
18. 通过 `ProjectManagerProvider` 管理项目。
19. 通过 `FileSystemProvider` 读写、上传、移动文件并创建文件夹。
20. 通过 `LatexCompilerProvider` 调用 `latexmk` 编译。
21. 显示编译日志。
22. 定义 `AiSuggestionProvider` 边界；当前通过 demo proposal 与手动导入 proposed 文本完成审阅，真实 AI provider 接入属于后续工作。

## 15. 后续增强

可逐步加入：

- Tauri 桌面端。
- 多文件 AI 修改审阅。
- 项目重命名、归档、删除与从列表移除。
- 文件/文件夹重命名与删除。
- 上传压缩包并解压为项目。
- 移动文件后自动更新 `\input`、`\include`、`\includegraphics`、BibTeX 等引用路径。
- BibTeX 支持增强。
- SyncTeX 正反向跳转。
- LaTeX outline。
- label/ref/cite 自动补全。
- 编译错误定位。
- Review session 历史记录。
- 每个 hunk 的 AI 修改理由。
- 一键生成 response letter 修改摘要。
- Git 集成。
- 对比任意两个历史版本。
- PDF 注释与源码定位联动。

## 16. 验收标准

MVP 可按以下标准验收：

1. 应用可通过 Web MVP 启动并创建或打开一个真实 LaTeX 项目。
2. 前端使用 React + TypeScript + Vite。
3. `.tex` 编辑器使用 CodeMirror 6。
4. PDF 预览使用 PDF.js。
5. 用户可以编辑并保存 `.tex` 文件。
6. 应用启动后默认显示项目首页，而不是自动进入某个项目。
7. 用户可以从项目首页的项目列表进入目标项目工作区。
8. 用户可以从项目工作区返回项目首页。
9. 用户可以上传 `.tex` 文件和图片资产，上传结果出现在文件树中。
10. 用户可以新建文件夹。
11. 用户可以通过拖拽上传外部文件到目标文件夹。
12. 用户可以通过拖拽移动项目内文件或文件夹，非法移动会被本地服务阻止；前端友好的失败提示仍需增强。
13. 系统可以记录 AI 修改前后的快照。
14. 系统可以把 AI 修改切成多个可审阅 hunk。
15. 用户可以在左侧编辑器中看到每个可定位 hunk 的红/绿对比。
16. 红色旧内容作为编辑器装饰显示，不会被写入 `Working` 文本。
17. 红/绿 hunk 段落内的真实差异片段会被深色重点高亮：旧文本删除/替换部分为深红色，新文本新增/替换部分为深绿色；纯新增时旧文本不显示深色插入点。该高亮结果由确定性细粒度 diff 算法产生，不依赖 AI 判断。
18. 用户可以逐项 Accept 或 Reject。
19. 用户可以在审阅过程中手动修改文本。
20. 手动修改不会破坏未处理 hunk 的基本定位。
21. 无法可靠定位时，系统会显示 conflict，而不是静默误改。
22. 若 active review session 仍存在 `pending` 或 `conflict` hunk，系统不允许保存最终 review 结果。
23. 当所有 hunk 都处于 `accepted`、`rejected` 或 `edited` 状态后，用户可以保存；保存后真实文件内容等于用户最终确认的 `Working` 文本，当前 review session 结束，hunk-level Undo 不再可用。
24. 系统可以通过 `LatexCompilerProvider` 调用 `latexmk` 编译 LaTeX，并在生成 PDF 后显示预览。
25. UI 层不直接依赖 Node.js 文件系统、Tauri API 或 Electron IPC。
26. 项目管理、文件读写、LaTeX 编译均通过平台接口完成；AI provider 接口已定义，真实 AI 调用尚未接入。
27. 所有非 AI 建议生成功能均由确定性代码实现。
