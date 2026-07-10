import type { BibliographyFormatResult, BibliographyOptions } from "@scriptorium/core";

export interface ReferenceFormatPanelProps {
  bibPaths: string[];
  activeBibPath: string;
  targetPath: string;
  options: BibliographyOptions;
  result: BibliographyFormatResult | null;
  loading: boolean;
  onBibPathChange(path: string): void;
  onTargetPathChange(path: string): void;
  onOptionsChange(options: BibliographyOptions): void;
  onGenerate(): void;
  onStage(): void;
}

export function ReferenceFormatPanel({
  bibPaths,
  activeBibPath,
  targetPath,
  options,
  result,
  loading,
  onBibPathChange,
  onTargetPathChange,
  onOptionsChange,
  onGenerate,
  onStage
}: ReferenceFormatPanelProps) {
  const targetIsTex = targetPath.trim().toLowerCase().endsWith(".tex");
  const canGenerate = Boolean(activeBibPath && targetIsTex && !loading);
  const canStage = Boolean(result?.ok && result.outputText && !loading);
  const errors = result?.diagnostics.filter((diagnostic) => diagnostic.level === "error") ?? [];
  const warnings = result?.diagnostics.filter((diagnostic) => diagnostic.level === "warning") ?? [];

  return (
    <section className="referencePanel" aria-label="Reference formatter">
      <header className="referencePanelHeader">
        <div>
          <h2>References</h2>
          <p>Format project BibTeX into a reviewable LaTeX bibliography block.</p>
        </div>
      </header>

      <div className="referenceFields">
        <label>
          BibTeX source
          <select value={activeBibPath} disabled={bibPaths.length === 0 || loading} onChange={(event) => onBibPathChange(event.target.value)}>
            {bibPaths.length === 0 ? <option value="">No .bib files in this project</option> : null}
            {bibPaths.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </label>

        <label>
          Review target
          <input
            aria-describedby="referenceTargetHint"
            disabled={loading}
            onChange={(event) => onTargetPathChange(event.target.value)}
            placeholder="references.generated.tex"
            spellCheck={false}
            type="text"
            value={targetPath}
          />
        </label>
        <p id="referenceTargetHint">No files are changed until you review and save the result.</p>
      </div>

      <fieldset className="referenceOptions" disabled={loading}>
        <legend>Formatting options</legend>
        <label>
          <input
            checked={options.deduplicate}
            onChange={(event) => onOptionsChange({ ...options, deduplicate: event.target.checked })}
            type="checkbox"
          />
          Deduplicate entries
        </label>
        <label>
          <input checked={options.sort} onChange={(event) => onOptionsChange({ ...options, sort: event.target.checked })} type="checkbox" />
          Sort by first author and year
        </label>
        <label>
          <input
            checked={options.removeUncited}
            onChange={(event) => onOptionsChange({ ...options, removeUncited: event.target.checked })}
            type="checkbox"
          />
          Remove uncited entries
        </label>
      </fieldset>

      <div className="referenceActions">
        <button disabled={!canGenerate} onClick={onGenerate} type="button">
          {loading ? "Generating…" : "Generate"}
        </button>
        <button disabled={!canStage} onClick={onStage} type="button">
          Review output
        </button>
      </div>

      {result ? <ReferenceStats result={result} /> : null}

      {errors.length > 0 ? (
        <div aria-live="assertive" className="referenceDiagnostics">
          {errors.map((diagnostic, index) => (
            <p className="referenceDiagnostic error" key={`${diagnostic.code}:${diagnostic.entryKey ?? diagnostic.entryIndex ?? index}`}>
              <strong>{diagnostic.blocking ? "Blocked:" : "Skipped:"}</strong> {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div aria-live="polite" className="referenceDiagnostics">
          {warnings.map((diagnostic, index) => (
            <p className="referenceDiagnostic warning" key={`${diagnostic.code}:${diagnostic.entryKey ?? diagnostic.entryIndex ?? index}`}>
              <strong>Notice:</strong> {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}

      {result?.ok && result.outputText ? (
        <pre className="referenceOutput" aria-label="Generated bibliography output">
          {result.outputText}
        </pre>
      ) : (
        <div className="referenceEmpty">
          {result ? "Resolve the reported issues before staging bibliography output." : "Choose a BibTeX source and generate the bibliography preview."}
        </div>
      )}
    </section>
  );
}

function ReferenceStats({ result }: { result: BibliographyFormatResult }) {
  const stats = result.stats;
  const values = [
    ["Loaded", stats.loadedEntries],
    ["Formatted", stats.formattedEntries],
    ["Duplicates", stats.removedDuplicates],
    ["Uncited", stats.removedUncited],
    ["Remaining", stats.finalEntries],
    ["Issues", stats.errorCount + stats.warningCount]
  ] as const;

  return (
    <dl className="referenceStats">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
