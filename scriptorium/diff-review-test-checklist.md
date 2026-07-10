# 差异对比功能简易测试清单

本文档整理本轮对话中提出过的问题、bug 与对应的手动测试步骤，重点覆盖 LaTeX review 的 hunk 切分、行内差异高亮、状态按钮、Undo、Save 与跳转定位。

## 1. 历史问题与修复点归纳

### 1.1 hunk 与定位

- hunk 应以换行符/行级为边界切分，而不是把多行修改合并成一个大 hunk。
- hunk 装饰必须跟随当前 `Working` 文本重新定位，不能只依赖固定行号。
- 已完成处理的 hunk 不应因其它 hunk 的 Accept/Reject/Undo 导致锚点失效后误变为 `conflict`。
- 点击右侧 hunk 卡片，应跳转到左侧编辑器对应行，并标记当前 hunk。

### 1.2 行内差异高亮

- 红色旧文本和绿色 Working 文本中，应进一步高亮真正变化的词、短语或字符片段。
- 高亮必须由确定性 diff 算法完成，不使用 AI 判断差异。
- 深色高亮不应包含变化片段两侧的空格。
- 深色高亮边角应为直角。
- 旧文本用深红，不用深绿；新文本用深绿。
- 深红/深绿颜色应偏浅，文字保持黑色。
- 纯新增时，旧文本不应显示深红插入点。
- 默认显示模式为 `Strike / Wave`：旧文本删除线，新文本绿色波浪线。
- 公式内 LaTeX token 应按 `\command`、`{}`、普通词、运算符等拆分，避免把 `\mathrm{...}` 整段误高亮。

### 1.3 右侧 Review 面板

- 右侧 hunk 的绿色内容应与左侧编辑器当前 Working 内容同步，而不是固定显示 AI proposed。
- 状态标签需要区分颜色：pending、accepted、rejected、edited、conflict。
- rejected 标签和状态色应使用红色。
- 只有在手动修改后，才显示 `Keep Edit / Use AI / Reject`。
- 未手动修改时，只显示 `Accept / Reject`。
- `accepted`、`rejected`、`conflict` 已完成或异常状态不显示普通操作按钮，只在可撤回时显示 `Undo`。

### 1.4 状态语义

- 手动编辑 hunk 不应自动计入 `edited`；只有点击 `Keep Edit` 后才计入 `edited`。
- 手动编辑后又删回 AI proposed，按钮与状态应回到未编辑的 pending 语义。
- `Keep Edit` 后，左侧红/绿块消失，右侧计入 `edited`，显示 `Undo`。
- `Accept` 后，左侧红/绿块消失，右侧计入 `accepted`，显示 `Undo`。
- `Reject` 后，Working 中对应区域恢复 original，右侧计入 `rejected`，显示 `Undo`。
- `Undo` 撤回的是最近一次 hunk 审阅动作，不撤回用户手动输入。

### 1.5 Save 语义

- 有 active review session 时，只要存在 `pending` 或 `conflict` hunk，不允许 Save。
- 所有 hunk 都为 `accepted` / `rejected` / `edited` 后，允许 Save。
- Save 会写入当前 Working 文本，结束当前 review session，并清除 hunk-level Undo。
- Save 后不再允许本轮 review 的 hunk Undo。

## 2. 测试准备

1. 在项目根目录启动应用：

```bash
cd /Users/ynie/Documents/Work/项目/Scriptorium/scriptorium
npm run dev
```

2. 打开 Web UI。
3. 打开 `sample-project`。
4. 打开 `main.tex`。
5. 进入右侧 `Review` tab。
6. 点击 `Create Review`。

如果没有生成 hunk，说明 `main.tex` 可能已经被保存成 review 后的最终版本。可先恢复 sample 中包含以下原始片段的版本：

```tex
\section{Draft}

A compact local demo helps validate the editing surface before deeper product work.
The editor should review AI edits one hunk at a time while preserving manual changes.

\begin{equation}
s_{\mathrm{draft}} = \alpha x + \beta
\end{equation}
```

当前 demo proposal 会自动生成以下修改：

- `\section{Draft}` -> `\section{Polished Draft}`
- `A compact local demo` -> `A compact, reproducible local demo`
- `review AI edits one hunk at a time` -> `review AI edits one deterministic hunk at a time`
- `s_{\mathrm{draft}} = \alpha x + \beta` -> `s_{\mathrm{polished}} = \alpha x + \beta + \gamma`

## 3. 基础 hunk 切分测试

### TC-01 每个换行级修改生成独立 hunk

操作：

1. 使用准备步骤创建 review。
2. 查看右侧 hunk 列表。

预期：

- 至少能看到 section 行、第一段文本行、第二段文本行、公式行对应的独立 hunk。
- 相邻修改行不会被合并成一个跨多行 hunk。
- 左侧每个 hunk 的红/绿对比出现在对应文本附近。

## 4. 行内 diff 高亮测试

### TC-02 普通短语新增

操作：

1. 查看 `A compact local demo...` 对应 hunk。

预期：

- 新文本中 `, reproducible` 作为一个整体被高亮。
- 高亮不拆成字符级碎片。
- 高亮不包含片段两侧额外空格。

### TC-03 单词扩展仍允许字符级

操作：

1. 查看 `\section{Draft}` -> `\section{Polished Draft}` 或手动在 Proposed 中构造 `Intro` -> `Introduction` 后重新创建 review。

预期：

- 对 `Intro` -> `Introduction` 这类明显词内扩展，可只高亮新增部分，如 `duction`。
- 对完全不同词的替换，不应只高亮偶然共享字母。

### TC-04 公式内 LaTeX token 级高亮

操作：

1. 查看公式 hunk：

```tex
s_{\mathrm{draft}} = \alpha x + \beta
s_{\mathrm{polished}} = \alpha x + \beta + \gamma
```

预期：

- 旧文本只高亮 `draft`。
- 新文本高亮 `polished` 和 `+ \gamma`。
- 不应把 `\mathrm`、`{}`、`\alpha`、`\beta` 误高亮。
- 高亮仍是默认 `Strike / Wave` 模式。

### TC-05 纯新增不在旧文本显示深红

操作：

1. 在 Proposed text 中新增一处只增加文字、不删除旧文字的修改。
2. 重新创建 review。

预期：

- 旧文本红色块中没有深红插入点或占位。
- 新文本绿色块中只高亮新增内容。

### TC-06 文本选择可见性

操作：

1. 用鼠标选中浅绿色 hunk 中的文字。

预期：

- 选区阴影/背景可见。
- 不应被浅绿色 hunk 背景完全吞掉。

## 5. 按钮与状态测试

### TC-07 未手动编辑时只显示 Accept / Reject

操作：

1. 创建 review 后，不编辑任何 hunk。
2. 查看任意 pending hunk 的按钮。

预期：

- 只显示 `Accept` / `Reject`。
- 不显示 `Keep Edit` / `Use AI`。

### TC-08 手动编辑后显示 Keep Edit / Use AI / Reject

操作：

1. 在左侧编辑器中修改某个绿色 hunk 的内容。
2. 查看右侧对应 hunk。

预期：

- hunk 仍统计为 `pending`。
- 按钮变为 `Keep Edit` / `Use AI` / `Reject`。
- 右侧绿色内容与左侧编辑器中的当前文本同步。

### TC-09 手动编辑后删回 AI proposed

操作：

1. 在某个 hunk 中手动加几个字符。
2. 再删除这些字符，使文本回到 AI proposed。

预期：

- 按钮回到 `Accept` / `Reject`。
- 不计入 `edited`。

### TC-10 Keep Edit

操作：

1. 手动修改某个 hunk。
2. 点击 `Keep Edit`。

预期：

- 左侧该 hunk 的红/绿块消失。
- 右侧状态为 `edited`。
- Edited 计数 +1。
- 右侧显示 `Undo`。
- Accepted 计数不增加。

### TC-11 Accept

操作：

1. 对未手动编辑的 hunk 点击 `Accept`。

预期：

- 左侧该 hunk 红/绿块消失。
- 右侧状态为 `accepted`。
- Accepted 计数 +1。
- 右侧显示 `Undo`。

### TC-12 Reject

操作：

1. 对某个 hunk 点击 `Reject`。

预期：

- 左侧 Working 文本对应区域恢复为 original。
- 右侧状态为 `rejected`。
- Rejected 计数 +1。
- 右侧显示 `Undo`。

## 6. Undo 测试

### TC-13 Keep Edit 后 Undo

操作：

1. 手动编辑 hunk。
2. 点击 `Keep Edit`。
3. 点击 `Undo`。

预期：

- 文本仍保留手动编辑后的内容。
- 状态回到 `pending`。
- Edited 计数减少。
- 左侧红/绿块重新出现。
- 按钮恢复为 `Keep Edit` / `Use AI` / `Reject`。

### TC-14 手动编辑后 Reject，再 Undo

操作：

1. 手动编辑 hunk。
2. 点击 `Reject`。
3. 点击 `Undo`。

预期：

- 文本回到 reject 前的手动编辑版本。
- 状态回到 `pending`。
- 按钮为 `Keep Edit` / `Use AI` / `Reject`。
- 不应自动回到 AI proposed。

### TC-15 多 hunk Undo 不应导致其它已完成 edited 变 conflict

操作：

1. hunk1 点击 `Accept`。
2. hunk2 点击 `Reject`。
3. 手动编辑 hunk3。
4. hunk3 点击 `Keep Edit`。
5. 对 hunk1 点击 `Undo`。
6. 对 hunk2 点击 `Undo`。

预期：

- hunk3 仍为 `edited`。
- hunk3 不应变成 `conflict`。
- hunk3 文本保持手动编辑后的版本。

## 7. Save 测试

### TC-16 存在 pending 时不允许 Save

操作：

1. 创建 review。
2. 保持至少一个 hunk 为 `pending`。
3. 查看顶部 `Save` 按钮。

预期：

- Save 禁用。
- tooltip 或提示语说明需要先解决 pending/conflict hunk。

### TC-17 全部 resolved 后允许 Save

操作：

1. 将所有 hunk 都处理成 `accepted` / `rejected` / `edited`。
2. 点击 `Save`。

预期：

- 文件写入当前 Working 文本。
- review session 结束。
- 右侧 Review 面板不再显示本轮 hunk。
- hunk-level Undo 不再可用。
- 顶部 dirty 状态变为 Saved。

## 8. hunk 点击跳转与选中态测试

### TC-18 点击 hunk 跳转到编辑器对应行

操作：

1. 在右侧 Review 面板点击任意 hunk 卡片非按钮区域。

预期：

- 左侧编辑器滚动到该 hunk 当前文本所在行。
- 光标位于该行开头附近。
- 右侧被点击 hunk 保持选中态。
- 该 hunk 左侧长条变为灰蓝色或中性色，表示当前 hunk。

### TC-19 点击 hunk 内按钮不触发跳转

操作：

1. 点击某个 hunk 的 `Accept` / `Reject` / `Keep Edit` / `Undo` 按钮。

预期：

- 执行按钮对应动作。
- 不因为按钮点击额外触发 hunk 卡片跳转。

### TC-20 键盘选择 hunk

操作：

1. 用 Tab 聚焦右侧 hunk 卡片。
2. 按 Enter 或 Space。

预期：

- 与鼠标点击 hunk 卡片效果一致。
- 编辑器跳转到对应行。
- hunk 卡片显示当前选中态。

## 9. 快速回归建议

每次修改 diff/review 相关代码后，建议至少跑以下组合：

1. 创建 review，确认 hunk 数量与行级切分。
2. 检查普通文本高亮：`, reproducible`、`deterministic`。
3. 检查公式高亮：`draft` / `polished` / `+ \gamma`。
4. 手动编辑一个 hunk，确认按钮变为 `Keep Edit / Use AI / Reject`，但状态仍为 pending。
5. 分别测试 `Accept`、`Reject`、`Keep Edit` 和各自 `Undo`。
6. 跑一次多 hunk 操作序列：hunk1 accept、hunk2 reject、hunk3 keep edit、undo hunk1、undo hunk2。
7. 确认存在 pending 时 Save 禁用；全部 resolved 后 Save 可用并结束 session。
8. 点击右侧 hunk，确认左侧跳转和右侧选中态。

命令行回归：

```bash
npm run test
npm run build
```
