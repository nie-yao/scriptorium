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
\begin{definition}[State space]\label{def:state}A named definition.\end{definition}
\begin{definition}An unnamed definition.\end{definition}
\begin{definition*}[Starred definition]A starred definition.\end{definition*}
\begin{assumption}[Regularity]\label{ass:regularity}A regularity assumption.\end{assumption}
\begin{assumption}An unnamed assumption.\end{assumption}
\begin{assumption*}[Starred assumption]A starred assumption.\end{assumption*}
\begin{equation}
\label{eq:objective}
\end{equation}`;

assert.deepEqual(
  scanLatexNavigation(source).map(({ kind, title, line, level }) => ({ kind, title, line, level })),
  [
    { kind: "chapter", title: "Methods", line: 1, level: 0 },
    { kind: "section", title: "Model % Setup", line: 2, level: 0 },
    { kind: "subsection", title: "Objective", line: 3, level: 1 },
    { kind: "figure", title: "Figure 1: System overview", line: 4, level: 2 },
    { kind: "table", title: "Table 1: Results", line: 7, level: 2 },
    { kind: "algorithm", title: "Algorithm 1: Training", line: 8, level: 2 },
    { kind: "label", title: "Label 1: appendix:extra", line: 9, level: 2 },
    { kind: "theorem", title: "Theorem 1: Compactness", line: 10, level: 2 },
    { kind: "lemma", title: "Lemma 1", line: 11, level: 2 },
    { kind: "proposition", title: "Proposition 1", line: 12, level: 2 },
    { kind: "corollary", title: "Corollary 1", line: 13, level: 2 },
    { kind: "remark", title: "Remark 1", line: 14, level: 2 },
    { kind: "theorem", title: "Theorem 2: Starred result", line: 15, level: 2 },
    { kind: "definition", title: "Definition 1: State space", line: 16, level: 2 },
    { kind: "definition", title: "Definition 2", line: 17, level: 2 },
    { kind: "definition", title: "Definition 3: Starred definition", line: 18, level: 2 },
    { kind: "assumption", title: "Assumption 1: Regularity", line: 19, level: 2 },
    { kind: "assumption", title: "Assumption 2", line: 20, level: 2 },
    { kind: "assumption", title: "Assumption 3: Starred assumption", line: 21, level: 2 }
  ]
);

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "theorem")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "Theorem 1: Compactness", label: "thm:compact" },
    { title: "Theorem 2: Starred result", label: "thm:starred" }
  ]
);

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "definition")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "Definition 1: State space", label: "def:state" },
    { title: "Definition 2", label: undefined },
    { title: "Definition 3: Starred definition", label: undefined }
  ]
);

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "assumption")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "Assumption 1: Regularity", label: "ass:regularity" },
    { title: "Assumption 2", label: undefined },
    { title: "Assumption 3: Starred assumption", label: undefined }
  ]
);

const decoratedTitles = String.raw`\section{Overview \label{sec:overview} [\cite{overview}]}
\begin{figure}\caption{Architecture \label{fig:architecture} [\cite{architecture}]}\end{figure}
\begin{theorem}[Convergence \label{thm:convergence} [\cite{convergence}]]\end{theorem}`;

assert.deepEqual(
  scanLatexNavigation(decoratedTitles)
    .filter(({ kind }) => kind !== "label")
    .map(({ kind, title }) => ({ kind, title })),
  [
    { kind: "section", title: "Overview" },
    { kind: "figure", title: "Figure 1: Architecture" },
    { kind: "theorem", title: "Theorem 1: Convergence" }
  ]
);

const nestedContent = String.raw`\section{Overview}
\begin{figure}\caption{Architecture}\end{figure}
\subsection{Method}
\begin{theorem}[Convergence]\end{theorem}`;

assert.deepEqual(
  scanLatexNavigation(nestedContent).map(({ kind, level }) => ({ kind, level })),
  [
    { kind: "section", level: 0 },
    { kind: "figure", level: 1 },
    { kind: "subsection", level: 1 },
    { kind: "theorem", level: 2 }
  ]
);

const starredFigure = String.raw`\section{Overview}
\begin{figure*}
\caption{Wide architecture}
\label{fig:wide-left}
\label{fig:wide-right}
\end{figure*}`;

assert.deepEqual(
  scanLatexNavigation(starredFigure).map(({ kind, title, label }) => ({ kind, title, label })),
  [{ kind: "section", title: "Overview", label: undefined }, { kind: "figure", title: "Figure 1: Wide architecture", label: "fig:wide-right" }]
);

console.log("LaTex navigation tests passed");
