import { ArrowLeft, BookOpen, FileCheck2, FolderPlus, PanelRight, Play, Save, SplitSquareHorizontal, Upload } from "lucide-react";
import type { ScriptoriumAppState } from "../app/useScriptoriumApp";
import { DocumentNavigation } from "../components/DocumentNavigation";
import { FileTree } from "../components/FileTree";
import { LatexEditor } from "../components/LatexEditor";
import { PdfPreview } from "../components/PdfPreview";
import { ReferenceFormatPanel } from "../components/ReferenceFormatPanel";
import { ReviewPanel } from "../components/ReviewPanel";

type ProjectWorkspaceProps = Pick<
  ScriptoriumAppState,
  | "activeProject"
  | "canSave"
  | "compile"
  | "compileResult"
  | "createFolder"
  | "createSession"
  | "dirty"
  | "editorPath"
  | "editorText"
  | "focusHunk"
  | "focusNavigationEntry"
  | "generateReferences"
  | "getPdf"
  | "hunkFocusRequest"
  | "moveEntry"
  | "navigationEntries"
  | "navigationFocusRequest"
  | "notice"
  | "openProjectFile"
  | "pdfPath"
  | "pdfRevision"
  | "proposedText"
  | "referenceBibPath"
  | "referenceBibPaths"
  | "referenceLoading"
  | "referenceOptions"
  | "referenceResult"
  | "referenceTargetPath"
  | "returnToProjects"
  | "reviewMarkMode"
  | "reviewReady"
  | "rightTab"
  | "saveFile"
  | "saveTitle"
  | "selectedHunkId"
  | "selectedNavigationEntryId"
  | "selectedPath"
  | "session"
  | "setPdfRevision"
  | "setProposedText"
  | "setReferenceBibPath"
  | "setReferenceOptions"
  | "setReferenceTargetPath"
  | "setReviewMarkMode"
  | "setRightTab"
  | "stageReferenceOutput"
  | "tree"
  | "updateEditorText"
  | "updateSession"
  | "uploadFiles"
  | "uploadInputRef"
>;

export function ProjectWorkspace({
  activeProject,
  canSave,
  compile,
  compileResult,
  createFolder,
  createSession,
  dirty,
  editorPath,
  editorText,
  focusHunk,
  focusNavigationEntry,
  generateReferences,
  getPdf,
  hunkFocusRequest,
  moveEntry,
  navigationEntries,
  navigationFocusRequest,
  notice,
  openProjectFile,
  pdfPath,
  pdfRevision,
  proposedText,
  referenceBibPath,
  referenceBibPaths,
  referenceLoading,
  referenceOptions,
  referenceResult,
  referenceTargetPath,
  returnToProjects,
  reviewMarkMode,
  reviewReady,
  rightTab,
  saveFile,
  saveTitle,
  selectedHunkId,
  selectedNavigationEntryId,
  selectedPath,
  session,
  stageReferenceOutput,
  setPdfRevision,
  setProposedText,
  setReferenceBibPath,
  setReferenceOptions,
  setReferenceTargetPath,
  setReviewMarkMode,
  setRightTab,
  tree,
  updateEditorText,
  updateSession,
  uploadFiles,
  uploadInputRef
}: ProjectWorkspaceProps) {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <FileCheck2 size={22} />
          <div>
            <strong>Scriptorium</strong>
            <span>{activeProject ? activeProject.name : "Project manager"}</span>
          </div>
        </div>
        <button className="sidebarBack" type="button" onClick={returnToProjects}>
          <ArrowLeft size={15} />
          Projects
        </button>
        <div className="fileActions">
          <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={!activeProject}>
            <Upload size={15} />
            Upload
          </button>
          <button type="button" onClick={createFolder} disabled={!activeProject}>
            <FolderPlus size={15} />
            Folder
          </button>
          <input
            ref={uploadInputRef}
            className="hiddenInput"
            type="file"
            multiple
            accept=".tex,.bib,.cls,.sty,.bst,.png,.jpg,.jpeg,.pdf"
            onChange={(event) => {
              if (event.target.files) {
                void uploadFiles(event.target.files);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
        <FileTree
          tree={tree}
          selectedPath={selectedPath}
          onSelectFile={openProjectFile}
          onMoveEntry={moveEntry}
          onUploadFiles={uploadFiles}
        />
        <DocumentNavigation
          entries={navigationEntries}
          selectedEntryId={selectedNavigationEntryId}
          onSelectEntry={focusNavigationEntry}
        />
      </aside>

      <section className="workspace">
        <header className="topBar">
          <div className="fileMeta">
            <span>{editorPath ? `Editing ${editorPath}` : selectedPath ? `Selected ${selectedPath}` : "No file selected"}</span>
            <strong>{editorPath ? (dirty ? "Unsaved changes" : "Saved") : "No editable file"}</strong>
          </div>
          <div className="toolbar">
            <button type="button" onClick={saveFile} disabled={!canSave} title={saveTitle}>
              <Save size={16} />
              Save
            </button>
            <button type="button" onClick={compile} disabled={!activeProject}>
              <Play size={16} />
              Compile
            </button>
            <button type="button" onClick={createSession} disabled={!reviewReady}>
              <SplitSquareHorizontal size={16} />
              Create Review
            </button>
            <button type="button" onClick={() => setRightTab("references")} disabled={referenceBibPaths.length === 0}>
              <BookOpen size={16} />
              References
            </button>
          </div>
        </header>

        <div className="mainGrid">
          <section className="editorColumn">
            <LatexEditor
              key={editorPath ?? "empty"}
              value={editorText}
              onChange={updateEditorText}
              disabled={!editorPath}
              reviewSession={session}
              reviewMarkMode={reviewMarkMode}
              onReviewMarkModeChange={setReviewMarkMode}
              focusHunkRequest={hunkFocusRequest}
              navigationFocusRequest={navigationFocusRequest}
            />
          </section>

          <aside className="rightPane">
            <div className="tabBar">
              <button className={rightTab === "pdf" ? "active" : ""} type="button" onClick={() => setRightTab("pdf")}>
                PDF
              </button>
              <button className={rightTab === "review" ? "active" : ""} type="button" onClick={() => setRightTab("review")}>
                Review
              </button>
              <button className={rightTab === "references" ? "active" : ""} type="button" onClick={() => setRightTab("references")}>
                References
              </button>
              <button className={rightTab === "logs" ? "active" : ""} type="button" onClick={() => setRightTab("logs")}>
                Logs
              </button>
            </div>

            {rightTab === "pdf" ? (
              <PdfPreview
                projectId={activeProject?.projectId ?? null}
                pdfPath={pdfPath}
                revision={pdfRevision}
                getPdf={getPdf}
                onRefresh={() => setPdfRevision((current) => current + 1)}
              />
            ) : null}

            {rightTab === "review" ? (
              <div className="reviewColumn">
                <div className="proposedBox">
                  <label htmlFor="proposedText">Proposed text</label>
                  <textarea
                    id="proposedText"
                    value={proposedText}
                    onChange={(event) => setProposedText(event.target.value)}
                    spellCheck={false}
                  />
                </div>
                <ReviewPanel
                  session={session}
                  selectedHunkId={selectedHunkId}
                  onSessionChange={updateSession}
                  onSelectHunk={focusHunk}
                />
              </div>
            ) : null}

            {rightTab === "references" ? (
              <ReferenceFormatPanel
                activeBibPath={referenceBibPath}
                bibPaths={referenceBibPaths}
                loading={referenceLoading}
                onBibPathChange={setReferenceBibPath}
                onGenerate={generateReferences}
                onOptionsChange={setReferenceOptions}
                onStage={stageReferenceOutput}
                onTargetPathChange={setReferenceTargetPath}
                options={referenceOptions}
                result={referenceResult}
                targetPath={referenceTargetPath}
              />
            ) : null}

            {rightTab === "logs" ? (
              <pre className="logPane">
                {compileResult ? `${compileResult.stdout}\n${compileResult.stderr}\n${compileResult.log}` : "No compile log yet."}
              </pre>
            ) : null}
          </aside>
        </div>

        <footer className="statusBar">
          <PanelRight size={14} />
          <span>{notice}</span>
        </footer>
      </section>
    </main>
  );
}
