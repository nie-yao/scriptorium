import type {
  CompileRequest,
  CompileResult,
  CreateProjectRequest,
  FileSystemProvider,
  LatexCompilerProvider,
  OpenProjectRequest,
  ProjectManagerProvider,
  ScriptoriumPlatform,
  ProjectSummary,
  ProjectTreeNode,
  ProjectWorkspace
} from "@scriptorium/platform";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers ?? {}) } : init?.headers,
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  return response.json() as Promise<T>;
}

export const webFileSystemProvider: FileSystemProvider = {
  async listProjectTree(projectId) {
    return request<ProjectTreeNode>(`/api/projects/${encodeURIComponent(projectId)}/tree`);
  },
  async readTextFile(projectId, path) {
    const result = await request<{ content: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`
    );
    return result.content;
  },
  async writeTextFile(projectId, path, content) {
    await request<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({ content })
    });
  },
  async readBinaryFile(projectId, path) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pdf?path=${encodeURIComponent(path)}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.arrayBuffer();
  },
  async createDirectory(input) {
    return request<ProjectTreeNode>(`/api/projects/${encodeURIComponent(input.projectId)}/folders`, {
      method: "POST",
      body: JSON.stringify({ path: input.path })
    });
  },
  async uploadFile(input) {
    return request<ProjectTreeNode>(`/api/projects/${encodeURIComponent(input.projectId)}/uploads`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async moveEntry(input) {
    return request<ProjectTreeNode>(`/api/projects/${encodeURIComponent(input.projectId)}/move`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
};

export const webProjectManagerProvider: ProjectManagerProvider = {
  async listProjects(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>("/api/projects");
  },
  async createProject(input: CreateProjectRequest): Promise<ProjectSummary> {
    return request<ProjectSummary>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async openExistingProject(input: OpenProjectRequest): Promise<ProjectSummary> {
    return request<ProjectSummary>("/api/projects/open", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async openProject(projectId: string): Promise<ProjectWorkspace> {
    return request<ProjectWorkspace>(`/api/projects/${encodeURIComponent(projectId)}`);
  }
};

export const webLatexCompilerProvider: LatexCompilerProvider = {
  async compile(input: CompileRequest): Promise<CompileResult> {
    return request<CompileResult>(`/api/projects/${encodeURIComponent(input.projectId)}/compile`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async getPdf(projectId: string, path: string): Promise<ArrayBuffer> {
    return webFileSystemProvider.readBinaryFile(projectId, path);
  },
  async getLog(projectId: string, path: string): Promise<string> {
    const result = await request<{ log: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/log?path=${encodeURIComponent(path)}`
    );
    return result.log;
  }
};

export const webScriptoriumPlatform: ScriptoriumPlatform = {
  projects: webProjectManagerProvider,
  files: webFileSystemProvider,
  latex: webLatexCompilerProvider
};
