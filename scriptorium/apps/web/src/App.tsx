import { useScriptoriumApp } from "./app/useScriptoriumApp";
import { AuthScreen } from "./views/AuthScreen";
import { ProjectHome } from "./views/ProjectHome";
import { ProjectWorkspace } from "./views/ProjectWorkspace";

export function App() {
  const app = useScriptoriumApp();

  if (app.authLoading) {
    return <main className="appLoading">Loading Scriptorium…</main>;
  }

  if (!app.currentUser) {
    return <AuthScreen notice={app.notice} onRegister={app.register} onSignIn={app.signIn} />;
  }

  if (!app.activeProject) {
    return <ProjectHome {...app} />;
  }

  return <ProjectWorkspace {...app} />;
}
