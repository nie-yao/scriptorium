import assert from "node:assert/strict";
import { formatBibliography } from "../dist/index.js";

const bibtex = String.raw`@article{wang2025,
  author = {Wang, Wei and Li, Si},
  title = {A STUDY of {Kalman} FILTERS},
  journal = {IEEE transactions on CONTROL systems},
  volume = {12}, number = {2}, pages = {1 - 9}, year = {2025}
}
@inproceedings{chen2024,
  author = {Chen, Yu}, title = {Learning for IoT},
  booktitle = {ACM international conference on systems}, year = {2024}
}
@article{unused2023,
  author = {Zhang, San}, title = {Unused result}, journal = {Test journal}, year = {2023}
}
@article{duplicate2025,
  author = {Wang, Wei and Li, Si},
  title = {A STUDY of {Kalman} FILTERS}, journal = {IEEE transactions on CONTROL systems}, year = {2025}
}`;

const result = formatBibliography({
  bibtex,
  texSources: [{ path: "main.tex", content: "\\cite{wang2025, chen2024}\n" }],
  options: { deduplicate: true, sort: true, removeUncited: true }
});

assert.equal(result.ok, true);
assert.deepEqual(result.stats, {
  loadedEntries: 4,
  formattedEntries: 4,
  removedDuplicates: 1,
  removedUncited: 1,
  finalEntries: 2,
  errorCount: 0,
  warningCount: 0
});
assert.equal(result.outputText, String.raw`\begin{thebibliography}{99}

\bibitem{chen2024}
Y.~Chen, Learning for IoT, \textit{ACM International Conference on Systems}, 2024.

\bibitem{wang2025}
W.~Wang and S.~Li, A STUDY of Kalman FILTERS, \textit{IEEE Transactions on CONTROL Systems}, vol.~12, no.~2, pp.~1--9, 2025.

\end{thebibliography}`);

const preservationResult = formatBibliography({
  bibtex: String.raw`@article{preserve,
  author = {Olfati-Saber, Reza and Eddy-Dilek, Carol},
  title = {Over 6G Networks}, journal = {Test journal}, year = {2024}
}`,
  texSources: [],
  options: { deduplicate: false, sort: false, removeUncited: false }
});

assert.equal(preservationResult.ok, true);
assert.match(
  preservationResult.outputText,
  /R\.~Olfati-Saber and C\.~Eddy-Dilek, Over 6G networks, \\textit\{Test Journal\}, 2024\./
);
assert.doesNotMatch(preservationResult.outputText, /Olfati-saber|Eddy-dilek|6g/);

const sortingResult = formatBibliography({
  bibtex: String.raw`@article{wang-z,
  author = {Wang, Zi}, title = {Wang Z}, journal = {Test journal}, year = {2023}
}
@article{sahin,
  author = {Şahin, Alphan}, title = {Sahin}, journal = {Test journal}, year = {2020}
}
@article{wang-g,
  author = {Wang, Gao}, title = {Wang G}, journal = {Test journal}, year = {2025}
}
@article{bartels,
  author = {Bartels, Richard}, title = {Bartels}, journal = {Test journal}, year = {2024}
}
@article{wang-l,
  author = {Wang, Lei}, title = {Wang L}, journal = {Test journal}, year = {2024}
}`,
  texSources: [],
  options: { deduplicate: false, sort: true, removeUncited: false }
});

assert.deepEqual(
  [...sortingResult.outputText.matchAll(/\\bibitem\{([^}]+)\}/g)].map((match) => match[1]),
  ["bartels", "sahin", "wang-g", "wang-l", "wang-z"]
);

const citationScopeResult = formatBibliography({
  bibtex: String.raw`@article{kept,
  author = {Li, Si}, title = {Kept record}, journal = {Test journal}, year = {2024}
}
@article{commented,
  author = {Wang, Wei}, title = {Commented record}, journal = {Test journal}, year = {2024}
}
@article{unused,
  author = {Chen, Yu}, title = {Unused record}, journal = {Test journal}, year = {2024}
}`,
  texSources: [
    { path: "main.tex", content: "% \\cite{commented}\n\\input{section}\n" },
    { path: "section.tex", content: "\\citep[see][ch. 2]{kept}\n" }
  ],
  options: { deduplicate: false, sort: false, removeUncited: true }
});

assert.equal(citationScopeResult.ok, true);
assert.equal(citationScopeResult.stats.removedUncited, 2);
assert.match(citationScopeResult.outputText, /\\bibitem\{kept\}/);
assert.doesNotMatch(citationScopeResult.outputText, /\\bibitem\{commented\}/);
assert.doesNotMatch(citationScopeResult.outputText, /\\bibitem\{unused\}/);

const citedDuplicateResult = formatBibliography({
  bibtex: String.raw`@article{first,
  author = {Li, Si}, title = {The same title}, journal = {Test journal}, year = {2024}
}
@article{second,
  author = {Wang, Wei}, title = {The Same Title}, journal = {Test journal}, year = {2025}
}`,
  texSources: [{ path: "main.tex", content: "\\cite{first,second}\n" }],
  options: { deduplicate: true, sort: false, removeUncited: false }
});

assert.equal(citedDuplicateResult.ok, false);
assert.equal(citedDuplicateResult.outputText, "");
assert.ok(citedDuplicateResult.diagnostics.some((item) => item.code === "deduplicate-cited-key" && item.blocking));

const duplicateKeyResult = formatBibliography({
  bibtex: String.raw`@article{shared,
  author = {Li, Si}, title = {First record}, journal = {Test journal}, year = {2024}
}
@article{shared,
  author = {Wang, Wei}, title = {Second record}, journal = {Test journal}, year = {2025}
}`,
  texSources: [{ path: "main.tex", content: "\\cite{shared}\n" }],
  options: { deduplicate: false, sort: false, removeUncited: false }
});

assert.equal(duplicateKeyResult.ok, false);
assert.equal(duplicateKeyResult.outputText, "");
assert.ok(duplicateKeyResult.diagnostics.some((item) => item.code === "duplicate-citation-key" && item.blocking));

const recoveredParseResult = formatBibliography({
  bibtex: String.raw`@article{broken,
  author = {Li, Si}, title = {Missing closing brace}
@article{valid,
  author = {Wang, Wei}, title = {Valid record}, journal = {Test journal}, year = {2024}
}`,
  texSources: [],
  options: { deduplicate: false, sort: false, removeUncited: false }
});

assert.equal(recoveredParseResult.ok, true);
assert.equal(recoveredParseResult.stats.errorCount, 1);
assert.match(recoveredParseResult.outputText, /\\bibitem\{valid\}/);
assert.ok(recoveredParseResult.diagnostics.some((item) => item.code === "parse-error" && !item.blocking));

console.log("bibliography formatter tests passed");
