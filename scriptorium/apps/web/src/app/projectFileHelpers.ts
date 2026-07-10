import type { ProjectTreeNode } from "@scriptorium/platform";

const textFileExtensions = [".tex", ".bib", ".cls", ".sty", ".bst"];

export function findNode(node: ProjectTreeNode | null, path: string): ProjectTreeNode | null {
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

export function collectPaths(node: ProjectTreeNode | null, predicate: (path: string) => boolean): string[] {
  if (!node) {
    return [];
  }

  const paths: string[] = [];
  function visit(current: ProjectTreeNode) {
    if (current.type === "file" && predicate(current.path)) {
      paths.push(current.path);
    }
    for (const child of current.children ?? []) {
      visit(child);
    }
  }

  visit(node);
  return paths.sort((left, right) => left.localeCompare(right));
}

export function isTextFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return textFileExtensions.some((extension) => lowerPath.endsWith(extension));
}

export function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function makeDemoProposal(text: string): string {
  if (!text) {
    return text;
  }

  return text
    .replace("A compact local demo", "A compact, reproducible local demo")
    .replace("review AI edits one hunk at a time", "review AI edits one deterministic hunk at a time")
    .replace("s_{\\mathrm{draft}} = \\alpha x + \\beta", "s_{\\mathrm{polished}} = \\alpha x + \\beta + \\gamma")
    .replace("\\section{Draft}", "\\section{Polished Draft}");
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function defaultReferenceTargetPath(bibPath: string): string {
  const safeParts = bibPath
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return [...safeParts.slice(0, -1), "references.generated.tex"].join("/");
}

export function joinProjectPath(directory: string, name: string): string {
  return [directory, name].filter(Boolean).join("/");
}

export function fileToBase64(file: File): Promise<string> {
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
