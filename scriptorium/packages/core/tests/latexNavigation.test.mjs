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
    { kind: "theorem", title: "Starred result", line: 15, level: 0 },
    { kind: "definition", title: "State space", line: 16, level: 0 },
    { kind: "definition", title: "Definition", line: 17, level: 0 },
    { kind: "definition", title: "Starred definition", line: 18, level: 0 },
    { kind: "assumption", title: "Regularity", line: 19, level: 0 },
    { kind: "assumption", title: "Assumption", line: 20, level: 0 },
    { kind: "assumption", title: "Starred assumption", line: 21, level: 0 }
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

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "definition")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "State space", label: "def:state" },
    { title: "Definition", label: undefined },
    { title: "Starred definition", label: undefined }
  ]
);

assert.deepEqual(
  scanLatexNavigation(source)
    .filter(({ kind }) => kind === "assumption")
    .map(({ title, label }) => ({ title, label })),
  [
    { title: "Regularity", label: "ass:regularity" },
    { title: "Assumption", label: undefined },
    { title: "Starred assumption", label: undefined }
  ]
);

console.log("LaTex navigation tests passed");
