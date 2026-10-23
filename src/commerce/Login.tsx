import { useRef, useState } from "react";
import { useOps } from "./ops-i18n";
import { api } from "./api";
export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const { t, errorText } = useOps();
  const [id, setId] = useState("liza"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [signingIn, setSigningIn] = useState(false);
  const submitting = useRef(false);
  return (
    <main className="commerce ops-shell ops-auth">
      <form
        className="co-zone-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting.current) return;
          submitting.current = true;
          setSigningIn(true);
          setError("");
          void api("login", { id, password })
            .then(() => onLogin())
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "No se pudo iniciar sesión",
              ),
            )
            .finally(() => {
              submitting.current = false;
              setSigningIn(false);
            });
        }}
      >
        <h1>{t("Inicia sesión")}</h1>
        <label>
          {t("Agente")}
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          {t("Contraseña")}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{errorText(error)}</p>}
        <button className="primary" disabled={signingIn} aria-busy={signingIn}>
          {t("Entrar al workspace")}
        </button>
      </form>
    </main>
  );
}
