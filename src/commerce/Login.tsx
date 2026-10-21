import { useState } from "react";
import { useOps } from "./ops-i18n";
import { api } from "./api";
export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const { t, errorText } = useOps();
  const [id, setId] = useState("liza"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="commerce ops-shell ops-auth">
      <form
        className="co-zone-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void api("login", { id, password })
            .then(() => onLogin())
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "No se pudo iniciar sesión",
              ),
            );
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
        <button className="primary">{t("Entrar al workspace")}</button>
      </form>
    </main>
  );
}
