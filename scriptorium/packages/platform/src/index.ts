export interface ProjectTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectTreeNode[];
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  rootPath: string;
  compileEntry: string;
  createdAt: string;
}

export interface UserSummary {
  userId: string;
  email: string;
}

export interface ProjectWorkspace {
  project: ProjectSummary;
  tree: ProjectTreeNode;
}

export interface CreateProjectRequest {
  name: string;
  parentPath?: string;
  template?: "blank" | "basic-paper";
}

export interface UploadFileRequest {
  projectId: string;
  targetDirectory: string;
  fileName: string;
  contentBase64: string;
  conflictPolicy: "error" | "replace" | "keep-both";
}

export interface MoveEntryRequest {
  projectId: string;
  sourcePath: string;
  targetDirectory: string;
  conflictPolicy: "error" | "replace" | "keep-both";
}

export interface CreateDirectoryRequest {
  projectId: string;
  path: string;
}

export interface ProjectManagerProvider {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectRequest): Promise<ProjectSummary>;
  openProject(projectId: string): Promise<ProjectWorkspace>;
}

export interface AuthProvider {
  currentUser(): Promise<UserSummary | null>;
  register(email: string, password: string): Promise<UserSummary>;
  signIn(email: string, password: string): Promise<UserSummary>;
  signOut(): Promise<void>;
}

export interface FileSystemProvider {
  readTextFile(projectId: string, path: string): Promise<string>;
  writeTextFile(projectId: string, path: string, content: string): Promise<void>;
  listProjectTree(projectId: string): Promise<ProjectTreeNode>;
  readBinaryFile(projectId: string, path: string): Promise<ArrayBuffer>;
  createDirectory(input: CreateDirectoryRequest): Promise<ProjectTreeNode>;
  uploadFile(input: UploadFileRequest): Promise<ProjectTreeNode>;
  moveEntry(input: MoveEntryRequest): Promise<ProjectTreeNode>;
}

export interface CompileRequest {
  projectId: string;
  entry: string;
}

export interface CompileResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  log: string;
  pdfPath?: string;
}

export interface LatexCompilerProvider {
  compile(input: CompileRequest): Promise<CompileResult>;
  getPdf(projectId: string, path: string): Promise<ArrayBuffer>;
  getLog(projectId: string, path: string): Promise<string>;
}

export interface ScriptoriumPlatform {
  auth: AuthProvider;
  projects: ProjectManagerProvider;
  files: FileSystemProvider;
  latex: LatexCompilerProvider;
}
