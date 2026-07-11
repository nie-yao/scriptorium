import type {
  CompileRequest,
  CompileResult,
  CreateProjectRequest,
  FileSystemProvider,
  LatexCompilerProvider,
  ProjectManagerProvider,
  ScriptoriumPlatform,
  ProjectSummary,
  ProjectTreeNode,
  ProjectWorkspace,
  UserSummary
} from "@scriptorium/platform";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
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
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pdf?path=${encodeURIComponent(path)}`, {
      credentials: "same-origin"
    });
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
  async openProject(projectId: string): Promise<ProjectWorkspace> {
    return request<ProjectWorkspace>(`/api/projects/${encodeURIComponent(projectId)}`);
  }
};

export const webAuthProvider = {
  async currentUser(): Promise<UserSummary | null> {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<UserSummary>;
  },
  async register(email: string, password: string): Promise<UserSummary> {
    return request<UserSummary>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  async signIn(email: string, password: string): Promise<UserSummary> {
    return request<UserSummary>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  async signOut(): Promise<void> {
    await request<{ ok: true }>("/api/auth/logout", { method: "POST" });
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
  auth: webAuthProvider,
  projects: webProjectManagerProvider,
  files: webFileSystemProvider,
  latex: webLatexCompilerProvider
};
