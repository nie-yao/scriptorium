import assert from "node:assert/strict";
import { scanLatexNavigation } from "../dist/index.js";

const source = String.raw`% \section{Ignored}
\chapter{Methods}
\section[Setup]{Model \% Setup}\label{sec:model}
\subsection*{Objective}
\begin{figure}
\caption{System overview}
\label{fig:system}\end{figure}
\begin{table}\caption{Results}\label{tab:results}\end{table}
\begin{algorithm}\caption{Training}\end{algorithm}
\label{appendix:extra}
\begin{theorem}[Compactness]\label{thm:compact}Every finite cover has a subcover.\end{theorem}
\begin{lemma}A helper result.\end{lemma}
\begin{proposition}A stated claim.\end{proposition}
\begin{corollary}An immediate consequence.\end{corollary}
\begin{remark}A useful observation.\end{remark}
\begin{theorem*}[Starred result]\label{thm:starred}An unnumbered theorem.\end{theorem*}
\begin{equation}
\label{eq:objective}
\end{equation}`;

assert.deepEqual(
  scanLatexNavigation(source).map(({ kind, title, line, level }) => ({ kind, title, line, level })),
  [
    { kind: "chapter", title: "Methods", line: 1, level: 0 },
    { kind: "section", title: "Model % Setup", line: 2, level: 1 },
    { kind: "subsection", title: "Objective", line: 3, level: 2 },
    { kind: "figure", title: "System overview", line: 4, level: 0 },
    { kind: "table", title: "Results", line: 7, level: 0 },
    { kind: "algorithm", title: "Training", line: 8, level: 0 },
    { kind: "label", title: "appendix:extra", line: 9, level: 0 },
    { kind: "theorem", title: "Compactness", line: 10, level: 0 },
    { kind: "lemma", title: "Lemma", line: 11, level: 0 },
    { kind: "proposition", title: "Proposition", line: 12, level: 0 },
    { kind: "corollary", title: "Corollary", line: 13, level: 0 },
    { kind: "remark", title: "Remark", line: 14, level: 0 },
    { kind: "theorem", title: "Starred result", line: 15, level: 0 }
  ]
);

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "theorem")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "Compactness", label: "thm:compact" },
    { title: "Starred result", label: "thm:starred" }
  ]
);

console.log("LaTex navigation tests passed");
