import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { send, useResource } from "../api";
import { Button, ErrorNotice, Field, Loading, useToast } from "../ui";

type Preferences = {
  homePage: "overview" | "radar";
  effectiveHomePage: "overview" | "radar";
  radarAvailable: boolean;
};

export function PreferredHome() {
  const resource = useResource<Preferences>("/user-preferences");
  if (resource.loading) return <Loading label="Abrindo sua página inicial…" />;
  if (resource.error)
    return <ErrorNotice message={resource.error} onRetry={resource.reload} />;
  return (
    <Navigate
      to={
        resource.data?.effectiveHomePage === "radar"
          ? "/app/radar"
          : "/app/visao-geral"
      }
      replace
    />
  );
}

export function HomePreference() {
  const resource = useResource<Preferences>("/user-preferences");
  const [homePage, setHomePage] = useState("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (resource.data) setHomePage(resource.data.homePage);
  }, [resource.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send("/user-preferences", "PUT", { homePage });
      toast("Sua página inicial foi atualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="home-preference">
      <h3>Sua página inicial</h3>
      <p className="muted small">
        Escolha onde começar ao entrar no Licitaro. Esta preferência vale apenas
        para você.
      </p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorNotice message={resource.error} onRetry={resource.reload} />
      ) : (
        <>
          {error && <ErrorNotice message={error} />}
          <Field label="Começar em">
            <select
              aria-label="Começar em"
              value={homePage}
              disabled={busy}
              onChange={(e) => setHomePage(e.target.value)}
            >
              <option value="overview">Visão geral</option>
              <option value="radar" disabled={!resource.data?.radarAvailable}>
                Meu radar
              </option>
            </select>
          </Field>
          <Button
            type="submit"
            variant="secondary"
            busy={busy}
            disabled={homePage === "radar" && !resource.data?.radarAvailable}
          >
            Salvar página inicial
          </Button>
        </>
      )}
    </form>
  );
}
