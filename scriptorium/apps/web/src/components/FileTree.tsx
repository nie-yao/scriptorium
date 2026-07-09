import type { ProjectTreeNode } from "@scriptorium/platform";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { useState } from "react";

interface FileTreeProps {
  tree: ProjectTreeNode | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onMoveEntry: (sourcePath: string, targetDirectory: string) => void;
  onUploadFiles: (files: FileList, targetDirectory: string) => void;
}

export function FileTree({ tree, selectedPath, onSelectFile, onMoveEntry, onUploadFiles }: FileTreeProps) {
  if (!tree) {
    return <div className="emptyState">Loading project...</div>;
  }

  return (
    <div
      className="fileTree"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length > 0) {
          onUploadFiles(event.dataTransfer.files, "");
        }
      }}
    >
      {tree.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onMoveEntry={onMoveEntry}
          onUploadFiles={onUploadFiles}
          depth={0}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selectedPath,
  onSelectFile,
  onMoveEntry,
  onUploadFiles,
  depth
}: {
  node: ProjectTreeNode;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onMoveEntry: (sourcePath: string, targetDirectory: string) => void;
  onUploadFiles: (files: FileList, targetDirectory: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const [dropTarget, setDropTarget] = useState(false);
  const isFile = node.type === "file";
  const selected = selectedPath === node.path;
  const targetDirectory = isFile ? parentPath(node.path) : node.path;

  return (
    <div>
      <button
        className={`treeRow ${selected ? "selected" : ""} ${dropTarget ? "dropTarget" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("application/x-scriptorium-path", node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropTarget(true);
          event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move";
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropTarget(false);
          if (event.dataTransfer.files.length > 0) {
            onUploadFiles(event.dataTransfer.files, targetDirectory);
            return;
          }
          const sourcePath = event.dataTransfer.getData("application/x-scriptorium-path");
          if (sourcePath) {
            onMoveEntry(sourcePath, targetDirectory);
          }
        }}
        onClick={() => {
          if (isFile) {
            onSelectFile(node.path);
          } else {
            setOpen((current) => !current);
          }
        }}
      >
        {isFile ? (
          <FileText size={15} />
        ) : (
          <>
            <ChevronRight className={open ? "chevron open" : "chevron"} size={14} />
            <Folder size={15} />
          </>
        )}
        <span>{node.name}</span>
      </button>
      {!isFile && open
        ? node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onMoveEntry={onMoveEntry}
              onUploadFiles={onUploadFiles}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}
