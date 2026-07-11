import { FileCheck2, LogIn, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";

interface AuthScreenProps {
  notice: string;
  onRegister(email: string, password: string): Promise<void>;
  onSignIn(email: string, password: string): Promise<void>;
}

export function AuthScreen({ notice, onRegister, onSignIn }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(action: (email: string, password: string) => Promise<void>) {
    setSubmitting(true);
    setError("");
    try {
      await action(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(onSignIn);
  }

  return (
    <main className="authScreen">
      <form className="authCard" onSubmit={handleSubmit}>
        <div className="authBrand">
          <FileCheck2 size={26} />
          <div>
            <strong>Scriptorium</strong>
            <span>Private LaTeX projects</span>
          </div>
        </div>
        <div className="authIntro">
          <h1>Welcome</h1>
          <p>Sign in to access your private projects and files.</p>
        </div>
        <label>
          Email
          <input
            autoComplete="email"
            disabled={submitting}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            disabled={submitting}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="authError">{error}</p> : <p className="authNotice">{notice}</p>}
        <div className="authActions">
          <button disabled={submitting} type="submit">
            <LogIn size={16} />
            Sign in
          </button>
          <button disabled={submitting} onClick={() => void submit(onRegister)} type="button">
            <UserPlus size={16} />
            Create account
          </button>
        </div>
      </form>
    </main>
  );
}
