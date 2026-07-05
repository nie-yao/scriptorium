import { createReviewSession, refreshReviewSession, type ReviewSession } from "@scriptorium/core";
import type { CompileResult, ProjectSummary, ProjectTreeNode } from "@scriptorium/platform";
import { ArrowLeft, FileCheck2, FolderOpen, FolderPlus, PanelRight, Play, Plus, Save, SplitSquareHorizontal, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileTree } from "./components/FileTree";
import { LatexEditor } from "./components/LatexEditor";
import { PdfPreview } from "./components/PdfPreview";
import { ReviewPanel } from "./components/ReviewPanel";
import { webFileSystemProvider, webLatexCompilerProvider, webProjectManagerProvider } from "./platform/webProviders";

type RightTab = "pdf" | "review" | "logs";

const textFileExtensions = [".tex", ".bib", ".cls", ".sty", ".bst"];

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [editorText, setEditorText] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("pdf");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfRevision, setPdfRevision] = useState(0);
  const [notice, setNotice] = useState("Loading projects...");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    webProjectManagerProvider
      .listProjects()
      .then((projectList) => {
        setProjects(projectList);
        setNotice(projectList.length > 0 ? "Select a project" : "Create or open a project");
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Failed to load projects"));
  }, []);

  const reviewReady = useMemo(() => editorPath && proposedText.trim().length > 0, [editorPath, proposedText]);
  const selectedDirectory = useMemo(() => {
    if (!selectedPath) {
      return "";
    }
    const node = findNode(tree, selectedPath);
    return node?.type === "directory" ? selectedPath : parentPath(selectedPath);
  }, [selectedPath, tree]);

  async function openProject(projectId: string, checkDirty = true) {
    if (checkDirty && dirty && !window.confirm("Current file has unsaved changes. Switch project anyway?")) {
      return;
    }
    const workspace = await webProjectManagerProvider.openProject(projectId);
    setActiveProject(workspace.project);
    setTree(workspace.tree);
    resetWorkspaceState();
    setNotice(`Opened project ${workspace.project.name}`);
  }

  async function reloadTree(projectId = activeProject?.projectId) {
    if (!projectId) {
      return;
    }
    setTree(await webFileSystemProvider.listProjectTree(projectId));
  }

  async function createProject() {
    const name = window.prompt("Project name", "New Paper");
    if (!name?.trim()) {
      return;
    }
    const project = await webProjectManagerProvider.createProject({ name: name.trim(), template: "basic-paper" });
    const projectList = await webProjectManagerProvider.listProjects();
    setProjects(projectList);
    await openProject(project.projectId, false);
  }

  async function openExistingProject() {
    const rootPath = window.prompt("Project folder path", "sample-project");
    if (!rootPath?.trim()) {
      return;
    }
    const project = await webProjectManagerProvider.openExistingProject({ rootPath: rootPath.trim() });
    const projectList = await webProjectManagerProvider.listProjects();
    setProjects(projectList);
    await openProject(project.projectId, false);
  }

  function returnToProjects() {
    if (dirty && !window.confirm("Current file has unsaved changes. Return to project list anyway?")) {
      return;
    }
    setActiveProject(null);
    setTree(null);
    resetWorkspaceState();
    setNotice("Select a project");
  }

  function resetWorkspaceState() {
    setSelectedPath(null);
    setEditorPath(null);
    setOriginalText("");
    setEditorText("");
    setProposedText("");
    setDirty(false);
    setSession(null);
    setCompileResult(null);
    setPdfPath(null);
    setPdfRevision(0);
    setRightTab("pdf");
  }

  async function openProjectFile(path: string) {
    if (!activeProject) {
      return;
    }
    setSelectedPath(path);

    if (isTextFile(path)) {
      await openTextFile(path);
      return;
    }

    if (isPdfFile(path)) {
      setPdfPath(path);
      setPdfRevision((current) => current + 1);
      setRightTab("pdf");
      setNotice(`Opened ${path}`);
      return;
    }

    setNotice(`No preview is available for ${path}`);
  }

  async function openTextFile(path: string) {
    if (!activeProject) {
      return;
    }
    if (dirty && editorPath !== path && !window.confirm("Current file has unsaved changes. Open another file anyway?")) {
      return;
    }
    const content = await webFileSystemProvider.readTextFile(activeProject.projectId, path);
    setSelectedPath(path);
    setEditorPath(path);
    setOriginalText(content);
    setEditorText(content);
    setProposedText(makeDemoProposal(content));
    setSession(null);
    setDirty(false);
    setNotice(`Opened ${path}`);
  }

  async function saveFile() {
    if (!activeProject || !editorPath) {
      return;
    }
    await webFileSystemProvider.writeTextFile(activeProject.projectId, editorPath, editorText);
    setOriginalText(editorText);
    setDirty(false);
    setNotice(`Saved ${editorPath}`);
  }

  async function compile() {
    if (!activeProject) {
      return;
    }
    const result = await webLatexCompilerProvider.compile({ projectId: activeProject.projectId, entry: activeProject.compileEntry });
    setCompileResult(result);
    setRightTab(result.ok ? "pdf" : "logs");
    if (result.pdfPath) {
      setPdfPath(result.pdfPath);
      setPdfRevision((current) => current + 1);
    }
    setNotice(result.ok ? "Compile succeeded" : "Compile failed");
  }

  async function createFolder() {
    if (!activeProject) {
      return;
    }
    const name = window.prompt("Folder name", "sections");
    if (!name?.trim()) {
      return;
    }
    const folderPath = joinProjectPath(selectedDirectory, name.trim());
    await webFileSystemProvider.createDirectory({ projectId: activeProject.projectId, path: folderPath });
    await reloadTree();
    setNotice(`Created folder ${folderPath}`);
  }

  async function uploadFiles(files: FileList | File[], targetDirectory = selectedDirectory) {
    if (!activeProject) {
      return;
    }
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await webFileSystemProvider.uploadFile({
        projectId: activeProject.projectId,
        targetDirectory,
        fileName: file.name,
        contentBase64: await fileToBase64(file),
        conflictPolicy: "keep-both"
      });
    }
    await reloadTree();
    setNotice(`Uploaded ${fileArray.length} file(s)`);
  }

  async function moveEntry(sourcePath: string, targetDirectory: string) {
    if (!activeProject || sourcePath === targetDirectory || parentPath(sourcePath) === targetDirectory) {
      return;
    }
    await webFileSystemProvider.moveEntry({
      projectId: activeProject.projectId,
      sourcePath,
      targetDirectory,
      conflictPolicy: "keep-both"
    });
    await reloadTree();
    if (selectedPath === sourcePath || editorPath === sourcePath) {
      resetWorkspaceState();
    }
    setNotice(`Moved ${sourcePath}`);
  }

  function createSession() {
    if (!editorPath || !reviewReady) {
      return;
    }

    const nextSession = createReviewSession({
      filePath: editorPath,
      originalText,
      proposedText
    });

    setSession(nextSession);
    setEditorText(nextSession.workingText);
    setDirty(true);
    setRightTab("review");
    setNotice(`Review session created with ${nextSession.hunks.length} hunk(s)`);
  }

  function updateEditorText(nextText: string) {
    setEditorText(nextText);
    setDirty(nextText !== originalText);
    setSession((current) => (current ? refreshReviewSession(current, nextText) : current));
  }

  function updateSession(nextSession: ReviewSession) {
    setSession(nextSession);
    setEditorText(nextSession.workingText);
    setDirty(nextSession.workingText !== originalText);
  }

  if (!activeProject) {
    return (
      <main className="projectHome">
        <header className="homeTopBar">
          <div className="homeBrand">
            <FileCheck2 size={24} />
            <div>
              <strong>Scriptorium</strong>
              <span>LaTeX projects</span>
            </div>
          </div>
          <div className="homeActions">
            <button type="button" onClick={openExistingProject}>
              <FolderOpen size={16} />
              Open Project
            </button>
            <button type="button" onClick={createProject}>
              <Plus size={16} />
              New Project
            </button>
          </div>
        </header>

        <section className="projectListShell">
          <div className="projectListHeader">
            <div>
              <h1>Projects</h1>
              <p>{projects.length} local project{projects.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="projectTable">
            <div className="projectTableHead">
              <span>Name</span>
              <span>Root</span>
              <span>Main file</span>
            </div>
            {projects.length > 0 ? (
              projects.map((project) => (
                <button className="projectRow" key={project.projectId} type="button" onClick={() => openProject(project.projectId, false)}>
                  <span className="projectName">{project.name}</span>
                  <span className="projectPath">{project.rootPath}</span>
                  <span>{project.compileEntry}</span>
                </button>
              ))
            ) : (
              <div className="projectEmpty">
                <strong>No projects yet</strong>
                <span>Create a project or open an existing LaTeX folder.</span>
              </div>
            )}
          </div>
        </section>

        <footer className="homeStatus">{notice}</footer>
      </main>
    );
  }

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
      </aside>

      <section className="workspace">
        <header className="topBar">
          <div className="fileMeta">
            <span>{editorPath ? `Editing ${editorPath}` : selectedPath ? `Selected ${selectedPath}` : "No file selected"}</span>
            <strong>{editorPath ? (dirty ? "Unsaved changes" : "Saved") : "No editable file"}</strong>
          </div>
          <div className="toolbar">
            <button type="button" onClick={saveFile} disabled={!editorPath || !dirty}>
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
              <button className={rightTab === "logs" ? "active" : ""} type="button" onClick={() => setRightTab("logs")}>
                Logs
              </button>
            </div>

            {rightTab === "pdf" ? (
              <PdfPreview
                projectId={activeProject?.projectId ?? null}
                pdfPath={pdfPath}
                revision={pdfRevision}
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
                <ReviewPanel session={session} onSessionChange={updateSession} />
              </div>
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

function findFirstTex(node: ProjectTreeNode): string | null {
  if (node.type === "file" && node.name.toLowerCase().endsWith(".tex")) {
    return node.path;
  }

  for (const child of node.children ?? []) {
    const found = findFirstTex(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function findNode(node: ProjectTreeNode | null, path: string): ProjectTreeNode | null {
  if (!node) {
    return null;
  }
  if (node.path === path) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, path);
    if (found) {
      return found;
    }
  }
  return null;
}

function isTextFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return textFileExtensions.some((extension) => lowerPath.endsWith(extension));
}

function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function makeDemoProposal(text: string): string {
  if (!text) {
    return text;
  }

  return text
    .replace("A compact local demo", "A compact, reproducible local demo")
    .replace("review AI edits one hunk at a time", "review AI edits one deterministic hunk at a time")
    .replace("\\section{Draft}", "\\section{Polished Draft}");
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinProjectPath(directory: string, name: string): string {
  return [directory, name].filter(Boolean).join("/");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}
