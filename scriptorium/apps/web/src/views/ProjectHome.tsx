import { FileCheck2, FolderOpen, Plus } from "lucide-react";
import type { ScriptoriumAppState } from "../app/useScriptoriumApp";

type ProjectHomeProps = Pick<
  ScriptoriumAppState,
  "createProject" | "notice" | "openExistingProject" | "openProject" | "projects"
>;

export function ProjectHome({ createProject, notice, openExistingProject, openProject, projects }: ProjectHomeProps) {
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
