import {
  createReviewSession,
  formatBibliography,
  refreshReviewSession,
  scanLatexNavigation,
  type BibliographyFormatResult,
  type BibliographyOptions,
  type LatexNavigationEntry,
  type ReviewSession
} from "@scriptorium/core";
import type { CompileResult, ProjectSummary, ProjectTreeNode, ScriptoriumPlatform, UserSummary } from "@scriptorium/platform";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HunkFocusRequest, NavigationFocusRequest, ReviewMarkMode } from "../components/LatexEditor";
import { getScriptoriumPlatform } from "../platform/runtimePlatform";
import {
  collectPaths,
  defaultReferenceTargetPath,
  fileToBase64,
  findNode,
  isPdfFile,
  isTextFile,
  joinProjectPath,
  makeDemoProposal,
  parentPath
} from "./projectFileHelpers";

export type RightTab = "pdf" | "review" | "references" | "logs";

export function useScriptoriumApp(platform: ScriptoriumPlatform = getScriptoriumPlatform()) {
  const auth = platform.auth;
  const projectManager = platform.projects;
  const fileSystem = platform.files;
  const latexCompiler = platform.latex;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [reviewMarkMode, setReviewMarkMode] = useState<ReviewMarkMode>("marks");
  const [hunkFocusRequest, setHunkFocusRequest] = useState<HunkFocusRequest | null>(null);
  const [selectedHunkId, setSelectedHunkId] = useState<string | null>(null);
  const [navigationFocusRequest, setNavigationFocusRequest] = useState<NavigationFocusRequest | null>(null);
  const [selectedNavigationEntryId, setSelectedNavigationEntryId] = useState<string | null>(null);
  const [referenceBibPath, setReferenceBibPathState] = useState("");
  const [referenceTargetPath, setReferenceTargetPathState] = useState("");
  const [referenceOptions, setReferenceOptionsState] = useState<BibliographyOptions>({
    deduplicate: true,
    sort: true,
    removeUncited: false
  });
  const [referenceResult, setReferenceResult] = useState<BibliographyFormatResult | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [notice, setNotice] = useState("Loading projects...");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    auth
      .currentUser()
      .then((user) => {
        if (!active) {
          return;
        }
        setCurrentUser(user);
        setNotice(user ? "Loading your projects..." : "Sign in to access your projects");
      })
      .catch((error) => {
        if (active) {
          setNotice(error instanceof Error ? error.message : "Failed to check sign-in status");
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [auth]);

  useEffect(() => {
    if (!currentUser) {
      setProjects([]);
      return;
    }
    projectManager
      .listProjects()
      .then((projectList) => {
        setProjects(projectList);
        setNotice(projectList.length > 0 ? "Select a project" : "Create your first project");
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Failed to load projects"));
  }, [currentUser, projectManager]);

  const reviewReady = useMemo(() => Boolean(editorPath && proposedText.trim().length > 0), [editorPath, proposedText]);
  const reviewSaveBlocked = useMemo(
    () => session?.hunks.some((hunk) => hunk.status === "pending" || hunk.status === "conflict") ?? false,
    [session]
  );
  const reviewReadyToFinalize = useMemo(
    () => Boolean(session && session.hunks.length > 0 && !reviewSaveBlocked),
    [reviewSaveBlocked, session]
  );
  const canSave = Boolean(editorPath && !reviewSaveBlocked && (dirty || reviewReadyToFinalize));
  const saveTitle = !editorPath
    ? "No editable file"
    : reviewSaveBlocked
      ? "Resolve all pending or conflict hunks before saving"
      : reviewReadyToFinalize
        ? "Save final Working text and finish review"
        : "Save file";
  const selectedDirectory = useMemo(() => {
    if (!selectedPath) {
      return "";
    }
    const node = findNode(tree, selectedPath);
    return node?.type === "directory" ? selectedPath : parentPath(selectedPath);
  }, [selectedPath, tree]);
  const navigationEntries = useMemo(
    () => (editorPath?.toLowerCase().endsWith(".tex") ? scanLatexNavigation(editorText) : []),
    [editorPath, editorText]
  );
  const referenceBibPaths = useMemo(
    () => collectPaths(tree, (path) => path.toLowerCase().endsWith(".bib")),
    [tree]
  );
  const referenceTexPaths = useMemo(
    () => collectPaths(tree, (path) => path.toLowerCase().endsWith(".tex")),
    [tree]
  );

  useEffect(() => {
    if (referenceBibPaths.includes(referenceBibPath)) {
      return;
    }
    const nextBibPath = referenceBibPaths[0] ?? "";
    setReferenceBibPathState(nextBibPath);
    setReferenceTargetPathState(nextBibPath ? defaultReferenceTargetPath(nextBibPath) : "");
    setReferenceResult(null);
  }, [referenceBibPath, referenceBibPaths]);

  async function openProject(projectId: string, checkDirty = true) {
    if (checkDirty && dirty && !window.confirm("Current file has unsaved changes. Switch project anyway?")) {
      return;
    }
    const workspace = await projectManager.openProject(projectId);
    setActiveProject(workspace.project);
    setTree(workspace.tree);
    resetWorkspaceState();
    selectReferenceBibPath(collectPaths(workspace.tree, (path) => path.toLowerCase().endsWith(".bib"))[0] ?? "");
    setNotice(`Opened project ${workspace.project.name}`);
  }

  async function reloadTree(projectId = activeProject?.projectId) {
    if (!projectId) {
      return;
    }
    setTree(await fileSystem.listProjectTree(projectId));
  }

  async function createProject() {
    const name = window.prompt("Project name", "New Paper");
    if (!name?.trim()) {
      return;
    }
    const project = await projectManager.createProject({ name: name.trim(), template: "basic-paper" });
    const projectList = await projectManager.listProjects();
    setProjects(projectList);
    await openProject(project.projectId, false);
  }

  async function signIn(email: string, password: string) {
    const user = await auth.signIn(email, password);
    resetWorkspaceState();
    setCurrentUser(user);
    setNotice(`Signed in as ${user.email}`);
  }

  async function register(email: string, password: string) {
    const user = await auth.register(email, password);
    resetWorkspaceState();
    setCurrentUser(user);
    setNotice(`Account created for ${user.email}`);
  }

  async function signOut() {
    await auth.signOut();
    setCurrentUser(null);
    setProjects([]);
    setActiveProject(null);
    setTree(null);
    resetWorkspaceState();
    setNotice("Signed out");
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
    setSelectedHunkId(null);
    setNavigationFocusRequest(null);
    setSelectedNavigationEntryId(null);
    setReferenceBibPathState("");
    setReferenceTargetPathState("");
    setReferenceOptionsState({ deduplicate: true, sort: true, removeUncited: false });
    setReferenceResult(null);
    setReferenceLoading(false);
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
    const content = await fileSystem.readTextFile(activeProject.projectId, path);
    setSelectedPath(path);
    setEditorPath(path);
    setOriginalText(content);
    setEditorText(content);
    setProposedText(makeDemoProposal(content));
    setSession(null);
    setSelectedHunkId(null);
    setNavigationFocusRequest(null);
    setSelectedNavigationEntryId(null);
    setDirty(false);
    if (path.toLowerCase().endsWith(".bib")) {
      selectReferenceBibPath(path);
    }
    setNotice(`Opened ${path}`);
  }

  async function saveFile() {
    if (!activeProject || !editorPath) {
      return;
    }
    if (reviewSaveBlocked) {
      setRightTab("review");
      setNotice("Resolve all pending or conflict hunks before saving.");
      return;
    }
    if (!dirty && !reviewReadyToFinalize) {
      return;
    }

    const finishedReview = Boolean(session);
    await fileSystem.writeTextFile(activeProject.projectId, editorPath, editorText);
    await reloadTree(activeProject.projectId);
    setOriginalText(editorText);
    setProposedText(makeDemoProposal(editorText));
    setSession(null);
    setSelectedHunkId(null);
    setDirty(false);
    setNotice(finishedReview ? `Saved ${editorPath} and finished review session` : `Saved ${editorPath}`);
  }

  async function compile() {
    if (!activeProject) {
      return;
    }
    const result = await latexCompiler.compile({ projectId: activeProject.projectId, entry: activeProject.compileEntry });
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
    await fileSystem.createDirectory({ projectId: activeProject.projectId, path: folderPath });
    await reloadTree();
    setNotice(`Created folder ${folderPath}`);
  }

  async function uploadFiles(files: FileList | File[], targetDirectory = selectedDirectory) {
    if (!activeProject) {
      return;
    }
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await fileSystem.uploadFile({
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
    await fileSystem.moveEntry({
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
    setSelectedHunkId(null);
    setEditorText(nextSession.workingText);
    setDirty(true);
    setRightTab("review");
    setNotice(`Review session created with ${nextSession.hunks.length} hunk(s)`);
  }

  function selectReferenceBibPath(path: string) {
    setReferenceBibPathState(path);
    setReferenceTargetPathState(path ? defaultReferenceTargetPath(path) : "");
    setReferenceResult(null);
  }

  function setReferenceTargetPath(path: string) {
    setReferenceTargetPathState(path);
    setReferenceResult(null);
  }

  function setReferenceOptions(options: BibliographyOptions) {
    setReferenceOptionsState(options);
    setReferenceResult(null);
  }

  async function generateReferences() {
    if (!activeProject || !referenceBibPath) {
      setNotice("Choose a BibTeX source before generating references.");
      return;
    }

    setReferenceLoading(true);
    try {
      const bibtex = editorPath === referenceBibPath ? editorText : await fileSystem.readTextFile(activeProject.projectId, referenceBibPath);
      const texSources = await Promise.all(
        referenceTexPaths.map(async (path) => ({
          path,
          content: editorPath === path ? editorText : await fileSystem.readTextFile(activeProject.projectId, path)
        }))
      );
      const nextResult = formatBibliography({ bibtex, texSources, options: referenceOptions });
      setReferenceResult(nextResult);
      setRightTab("references");
      if (!nextResult.ok) {
        setNotice("Reference formatting is blocked. Review the reported issues.");
      } else if (nextResult.stats.errorCount > 0 || nextResult.stats.warningCount > 0) {
        setNotice(`Generated ${nextResult.stats.finalEntries} reference(s) with reported issues.`);
      } else {
        setNotice(`Generated ${nextResult.stats.finalEntries} reference(s).`);
      }
    } catch (error) {
      setReferenceResult(null);
      setNotice(error instanceof Error ? error.message : "Failed to read project references");
    } finally {
      setReferenceLoading(false);
    }
  }

  async function stageReferenceOutput() {
    const targetPath = referenceTargetPath.trim();
    if (!activeProject || !referenceResult?.ok || !referenceResult.outputText) {
      setNotice("Generate a valid bibliography before staging it for review.");
      return;
    }
    if (!targetPath || !targetPath.toLowerCase().endsWith(".tex")) {
      setNotice("Reference review targets must be a .tex file.");
      return;
    }
    if (dirty && editorPath !== targetPath && !window.confirm("Current file has unsaved changes. Stage the bibliography anyway?")) {
      return;
    }

    try {
      const existingTarget = findNode(tree, targetPath);
      const targetText = existingTarget?.type === "file" ? await fileSystem.readTextFile(activeProject.projectId, targetPath) : "";
      const nextSession = createReviewSession({
        filePath: targetPath,
        originalText: targetText,
        proposedText: referenceResult.outputText
      });

      setSelectedPath(targetPath);
      setEditorPath(targetPath);
      setOriginalText(targetText);
      setEditorText(nextSession.workingText);
      setProposedText(referenceResult.outputText);
      setSession(nextSession);
      setDirty(true);
      setSelectedHunkId(null);
      setNavigationFocusRequest(null);
      setSelectedNavigationEntryId(null);
      setRightTab("review");
      setNotice(`Bibliography is ready for review with ${nextSession.hunks.length} hunk(s).`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to stage the bibliography for review");
    }
  }

  function updateEditorText(nextText: string) {
    setEditorText(nextText);
    setDirty(nextText !== originalText);
    setSession((current) => (current ? refreshReviewSession(current, nextText) : current));
    setSelectedNavigationEntryId((current) =>
      current && !scanLatexNavigation(nextText).some((entry) => entry.id === current) ? null : current
    );
  }

  function updateSession(nextSession: ReviewSession) {
    setSession(nextSession);
    setSelectedHunkId((current) => (current && nextSession.hunks.some((hunk) => hunk.id === current) ? current : null));
    setEditorText(nextSession.workingText);
    setDirty(nextSession.workingText !== originalText);
  }

  function focusHunk(hunkId: string) {
    setSelectedHunkId(hunkId);
    setHunkFocusRequest((current) => ({
      hunkId,
      requestId: (current?.requestId ?? 0) + 1
    }));
  }

  function focusNavigationEntry(entry: LatexNavigationEntry) {
    setSelectedNavigationEntryId(entry.id);
    setNavigationFocusRequest((current) => ({
      line: entry.line,
      requestId: (current?.requestId ?? 0) + 1
    }));
  }

  const getPdf = useCallback(
    (projectId: string, path: string) => latexCompiler.getPdf(projectId, path),
    [latexCompiler]
  );

  return {
    activeProject,
    authLoading,
    canSave,
    compile,
    compileResult,
    createFolder,
    createProject,
    createSession,
    currentUser,
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
    openProject,
    openProjectFile,
    pdfPath,
    pdfRevision,
    projects,
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
    setPdfRevision,
    setProposedText,
    setReferenceBibPath: selectReferenceBibPath,
    setReferenceOptions,
    setReferenceTargetPath,
    setReviewMarkMode,
    setRightTab,
    stageReferenceOutput,
    register,
    signIn,
    signOut,
    tree,
    updateEditorText,
    updateSession,
    uploadFiles,
    uploadInputRef
  };
}

export type ScriptoriumAppState = ReturnType<typeof useScriptoriumApp>;
