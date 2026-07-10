import { useScriptoriumApp } from "./app/useScriptoriumApp";
import { ProjectHome } from "./views/ProjectHome";
import { ProjectWorkspace } from "./views/ProjectWorkspace";

export function App() {
  const app = useScriptoriumApp();

  if (!app.activeProject) {
    return <ProjectHome {...app} />;
  }

  return <ProjectWorkspace {...app} />;
}
