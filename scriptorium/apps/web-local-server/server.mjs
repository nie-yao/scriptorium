import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createReviewSession } from "../../packages/core/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const workspaceRoot = path.resolve(repoRoot, args.get("--workspace") ?? ".");
const defaultProjectRoot = path.resolve(repoRoot, args.get("--root") ?? "sample-project");
const port = Number(args.get("--port") ?? 4317);
const projectIndexPath = path.join(workspaceRoot, ".scriptorium", "projects.json");

const textExtensions = new Set([".tex", ".bib", ".cls", ".sty", ".bst", ".txt", ".md"]);
const visibleExtensions = new Set([".tex", ".bib", ".cls", ".sty", ".bst", ".png", ".jpg", ".jpeg", ".pdf"]);
const uploadExtensions = new Set([".tex", ".bib", ".cls", ".sty", ".bst", ".png", ".jpg", ".jpeg", ".pdf"]);
const ignoredNames = new Set([".latex-review", ".git", "node_modules", ".scriptorium"]);
const ignoredExtensions = new Set([".aux", ".log", ".out", ".toc", ".bbl", ".blg", ".fls", ".fdb_latexmk", ".synctex.gz"]);

let projects = [];
projects = await loadProjectIndex();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, { ok: true, workspaceRoot, projects });
    }

    if (request.method === "GET" && url.pathname === "/api/projects") {
      return json(response, projects);
    }

    if (request.method === "POST" && url.pathname === "/api/projects") {
      const body = await readJson(request);
      const project = await createProject({
        name: String(body.name ?? "Untitled Project"),
        parentPath: typeof body.parentPath === "string" ? body.parentPath : undefined,
        template: body.template === "blank" ? "blank" : "basic-paper"
      });
      return json(response, project);
    }

    if (request.method === "POST" && url.pathname === "/api/projects/open") {
      const body = await readJson(request);
      const rootPath = String(body.rootPath ?? "");
      if (!rootPath) {
        return fail(response, 400, "Expected JSON body with rootPath");
      }
      const project = await addExistingProject(rootPath);
      return json(response, project);
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
    if (!projectMatch) {
      return fail(response, 404, "Not found");
    }

    const projectId = decodeURIComponent(projectMatch[1]);
    const route = projectMatch[2] ?? "";
    const project = getProject(projectId);

    if (request.method === "GET" && route === "") {
      return json(response, { project, tree: await readProjectTree(project.rootPath, "") });
    }

    if (request.method === "GET" && route === "/tree") {
      return json(response, await readProjectTree(project.rootPath, ""));
    }

    if (request.method === "GET" && route === "/file") {
      const relativePath = requireQuery(url, "path");
      const filePath = resolveInsideProject(project.rootPath, relativePath);
      ensureTextFile(filePath);
      return json(response, { path: relativePath, content: await fs.readFile(filePath, "utf8") });
    }

    if (request.method === "PUT" && route === "/file") {
      const relativePath = requireQuery(url, "path");
      const filePath = resolveInsideProject(project.rootPath, relativePath);
      ensureTextFile(filePath);
      const body = await readJson(request);
      if (typeof body.content !== "string") {
        return fail(response, 400, "Expected JSON body with string content");
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(`${filePath}.bak`, await safeReadExisting(filePath), "utf8");
      await fs.writeFile(filePath, body.content, "utf8");
      return json(response, { ok: true });
    }

    if (request.method === "POST" && route === "/folders") {
      const body = await readJson(request);
      const folderPath = normalizeProjectPath(String(body.path ?? ""));
      ensureUserDirectoryPath(folderPath);
      await fs.mkdir(resolveInsideProject(project.rootPath, folderPath), { recursive: false });
      return json(response, await readProjectTree(project.rootPath, ""));
    }

    if (request.method === "POST" && route === "/uploads") {
      const body = await readJson(request);
      const uploaded = await uploadFile(project.rootPath, body);
      return json(response, uploaded);
    }

    if (request.method === "POST" && route === "/move") {
      const body = await readJson(request);
      const moved = await moveEntry(project.rootPath, body);
      return json(response, moved);
    }

    if (request.method === "POST" && route === "/review/session") {
      const body = await readJson(request);
      const session = createReviewSession({
        filePath: String(body.filePath ?? ""),
        originalText: String(body.originalText ?? ""),
        proposedText: String(body.proposedText ?? ""),
        workingText: typeof body.workingText === "string" ? body.workingText : undefined
      });
      await fs.mkdir(path.join(project.rootPath, ".latex-review", "sessions"), { recursive: true });
      await fs.writeFile(
        path.join(project.rootPath, ".latex-review", "sessions", `${session.sessionId}.json`),
        JSON.stringify(session, null, 2),
        "utf8"
      );
      return json(response, session);
    }

    const sessionMatch = route.match(/^\/review\/session\/([^/]+)$/);
    if (request.method === "GET" && sessionMatch) {
      const sessionId = sessionMatch[1].replace(/[^a-zA-Z0-9._-]/g, "");
      const sessionPath = path.join(project.rootPath, ".latex-review", "sessions", `${sessionId}.json`);
      return json(response, JSON.parse(await fs.readFile(sessionPath, "utf8")));
    }

    if (request.method === "POST" && route === "/compile") {
      const body = await readJson(request);
      const entry = String(body.entry ?? project.compileEntry ?? "main.tex");
      const entryPath = resolveInsideProject(project.rootPath, entry);
      if (path.extname(entryPath) !== ".tex") {
        return fail(response, 400, "Compile entry must be a .tex file");
      }
      const result = await compileLatex(project.rootPath, entry);
      return json(response, result);
    }

    if (request.method === "GET" && route === "/pdf") {
      const relativePath = requireQuery(url, "path");
      const filePath = resolveInsideProject(project.rootPath, relativePath);
      if (path.extname(filePath) !== ".pdf") {
        return fail(response, 400, "Only PDF files can be read through this endpoint");
      }
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store"
      });
      return createReadStream(filePath).pipe(response);
    }

    if (request.method === "GET" && route === "/log") {
      const relativePath = requireQuery(url, "path");
      const filePath = resolveInsideProject(project.rootPath, relativePath);
      if (path.extname(filePath) !== ".log") {
        return fail(response, 400, "Only .log files can be read through this endpoint");
      }
      return json(response, { log: await fs.readFile(filePath, "utf8") });
    }

    return fail(response, 404, "Not found");
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Internal server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Scriptorium local API listening on http://127.0.0.1:${port}`);
  console.log(`Workspace root: ${workspaceRoot}`);
});

async function loadProjectIndex() {
  await fs.mkdir(path.dirname(projectIndexPath), { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(projectIndexPath, "utf8"));
    if (Array.isArray(parsed.projects)) {
      return parsed.projects;
    }
  } catch {
    // Create an index below.
  }

  const initialProject = makeProjectSummary(defaultProjectRoot, path.basename(defaultProjectRoot));
  await fs.mkdir(path.join(defaultProjectRoot, ".latex-review", "sessions"), { recursive: true });
  await saveProjectIndex([initialProject]);
  return [initialProject];
}

async function saveProjectIndex(nextProjects = projects) {
  await fs.mkdir(path.dirname(projectIndexPath), { recursive: true });
  await fs.writeFile(projectIndexPath, JSON.stringify({ projects: nextProjects }, null, 2), "utf8");
  projects = nextProjects;
}

async function createProject({ name, parentPath, template }) {
  const safeName = sanitizeFileName(name);
  const parent = parentPath ? resolveInsideWorkspace(parentPath) : workspaceRoot;
  const rootPath = await uniquePath(path.join(parent, safeName));
  await fs.mkdir(rootPath, { recursive: false });
  await fs.mkdir(path.join(rootPath, "figures"), { recursive: true });

  if (template !== "blank") {
    await fs.writeFile(
      path.join(rootPath, "main.tex"),
      [
        "\\documentclass{article}",
        "\\usepackage{graphicx}",
        "",
        "\\title{" + safeName.replace(/_/g, " ") + "}",
        "\\author{}",
        "\\date{\\today}",
        "",
        "\\begin{document}",
        "\\maketitle",
        "",
        "\\section{Introduction}",
        "Start writing here.",
        "",
        "\\end{document}",
        ""
      ].join("\n"),
      "utf8"
    );
  }

  const project = makeProjectSummary(rootPath, name);
  await saveProjectIndex([...projects.filter((item) => item.projectId !== project.projectId), project]);
  return project;
}

async function addExistingProject(rootPath) {
  const absoluteRoot = resolveInsideWorkspace(rootPath);
  const stat = await fs.stat(absoluteRoot);
  if (!stat.isDirectory()) {
    throw new Error("Project root must be a directory");
  }
  const project = makeProjectSummary(absoluteRoot, path.basename(absoluteRoot));
  await saveProjectIndex([...projects.filter((item) => item.projectId !== project.projectId), project]);
  await fs.mkdir(path.join(absoluteRoot, ".latex-review", "sessions"), { recursive: true });
  return project;
}

function makeProjectSummary(rootPath, name) {
  return {
    projectId: createProjectId(rootPath),
    name: String(name || path.basename(rootPath)),
    rootPath,
    compileEntry: "main.tex",
    createdAt: new Date().toISOString()
  };
}

function createProjectId(rootPath) {
  return createHash("sha1").update(path.resolve(rootPath)).digest("hex").slice(0, 12);
}

function getProject(projectId) {
  const project = projects.find((item) => item.projectId === projectId);
  if (!project) {
    throw new Error("Unknown project");
  }
  return project;
}

async function readProjectTree(directory, relativePath) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (ignoredNames.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }

    const childRelativePath = path.posix.join(relativePath, entry.name);
    const childAbsolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      children.push(await readProjectTree(childAbsolutePath, childRelativePath));
      continue;
    }

    const extension = getExtension(entry.name);
    if (visibleExtensions.has(extension) && !ignoredExtensions.has(extension)) {
      children.push({
        name: entry.name,
        path: childRelativePath,
        type: "file"
      });
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    name: relativePath ? path.basename(relativePath) : path.basename(directory),
    path: relativePath,
    type: "directory",
    children
  };
}

async function uploadFile(projectRoot, body) {
  const targetDirectory = normalizeProjectPath(String(body.targetDirectory ?? ""));
  const fileName = sanitizeFileName(String(body.fileName ?? ""));
  const conflictPolicy = normalizeConflictPolicy(body.conflictPolicy);
  const extension = getExtension(fileName);

  if (!uploadExtensions.has(extension)) {
    throw new Error("Unsupported upload file type");
  }
  ensureUserDirectoryPath(targetDirectory);
  const targetRoot = resolveInsideProject(projectRoot, targetDirectory);
  const targetPath = await resolveConflictPath(path.join(targetRoot, fileName), conflictPolicy);
  await fs.writeFile(targetPath, Buffer.from(String(body.contentBase64 ?? ""), "base64"));
  return readProjectTree(projectRoot, "");
}

async function moveEntry(projectRoot, body) {
  const sourcePath = normalizeProjectPath(String(body.sourcePath ?? ""));
  const targetDirectory = normalizeProjectPath(String(body.targetDirectory ?? ""));
  const conflictPolicy = normalizeConflictPolicy(body.conflictPolicy);

  ensureUserEntryPath(sourcePath);
  ensureUserDirectoryPath(targetDirectory);

  const sourceAbsolutePath = resolveInsideProject(projectRoot, sourcePath);
  const targetRoot = resolveInsideProject(projectRoot, targetDirectory);
  const sourceStats = await fs.stat(sourceAbsolutePath);
  const destinationPath = await resolveConflictPath(path.join(targetRoot, path.basename(sourcePath)), conflictPolicy);

  if (sourceStats.isDirectory()) {
    const relative = path.relative(sourceAbsolutePath, destinationPath);
    if (!relative || relative.startsWith("..") === false) {
      throw new Error("Cannot move a folder into itself");
    }
  }

  await fs.rename(sourceAbsolutePath, destinationPath);
  return readProjectTree(projectRoot, "");
}

async function resolveConflictPath(candidate, conflictPolicy) {
  if (!(await exists(candidate))) {
    return candidate;
  }
  if (conflictPolicy === "replace") {
    return candidate;
  }
  if (conflictPolicy === "keep-both") {
    return uniquePath(candidate);
  }
  throw new Error("Target already exists");
}

async function uniquePath(candidate) {
  if (!(await exists(candidate))) {
    return candidate;
  }

  const parsed = path.parse(candidate);
  for (let index = 2; index < 1000; index += 1) {
    const nextPath = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!(await exists(nextPath))) {
      return nextPath;
    }
  }

  throw new Error("Could not find an available path");
}

function resolveInsideWorkspace(inputPath) {
  const absolutePath = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(workspaceRoot, inputPath);
  const relativeToRoot = path.relative(workspaceRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Path escapes the workspace root");
  }
  return absolutePath;
}

function resolveInsideProject(projectRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error("Path must be relative to the project root");
  }

  const normalized = normalizeProjectPath(relativePath);
  const absolutePath = path.resolve(projectRoot, normalized);
  const relativeToRoot = path.relative(projectRoot, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Path escapes the project root");
  }

  return absolutePath;
}

function normalizeProjectPath(relativePath) {
  const normalized = path
    .normalize(relativePath)
    .replaceAll(path.sep, "/")
    .replace(/^\/+/, "");
  if (normalized === ".") {
    return "";
  }
  return normalized;
}

function ensureUserDirectoryPath(relativePath) {
  if (relativePath) {
    ensureUserEntryPath(relativePath);
  }
}

function ensureUserEntryPath(relativePath) {
  const parts = normalizeProjectPath(relativePath).split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Path is required");
  }
  for (const part of parts) {
    if (part === "." || part === ".." || ignoredNames.has(part) || part.startsWith(".")) {
      throw new Error("Path contains a reserved name");
    }
  }
}

function sanitizeFileName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("Name is required");
  }
  if (/[/:\\]/.test(trimmed)) {
    throw new Error("Name cannot contain path separators");
  }
  return trimmed;
}

function normalizeConflictPolicy(value) {
  if (value === "replace" || value === "keep-both") {
    return value;
  }
  return "error";
}

function ensureTextFile(filePath) {
  if (!textExtensions.has(getExtension(filePath))) {
    throw new Error("Only LaTeX project text files can be edited");
  }
}

function getExtension(filePath) {
  if (filePath.endsWith(".synctex.gz")) {
    return ".synctex.gz";
  }
  return path.extname(filePath).toLowerCase();
}

function compileLatex(projectRoot, entry) {
  return new Promise((resolve) => {
    const child = spawn("latexmk", ["-pdf", "-interaction=nonstopmode", "-halt-on-error", entry], {
      cwd: projectRoot,
      shell: false
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}${error.message}`,
        log: "latexmk could not be started. Install a LaTeX distribution with latexmk to enable compilation."
      });
    });
    child.on("close", async (code) => {
      const pdfPath = entry.replace(/\.tex$/i, ".pdf");
      const logPath = entry.replace(/\.tex$/i, ".log");
      const log = await safeReadExisting(resolveInsideProject(projectRoot, logPath));
      const pdfExists = await exists(resolveInsideProject(projectRoot, pdfPath));
      resolve({
        ok: code === 0 && pdfExists,
        stdout,
        stderr,
        log,
        pdfPath: pdfExists ? pdfPath : undefined
      });
    });
  });
}

function requireQuery(url, key) {
  const value = url.searchParams.get(key);
  if (!value) {
    throw new Error(`Missing query parameter: ${key}`);
  }
  return value;
}

function json(response, value) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function fail(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function safeReadExisting(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
