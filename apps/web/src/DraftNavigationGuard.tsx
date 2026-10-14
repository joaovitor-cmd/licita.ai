import { useEffect, useId, useLayoutEffect } from "react";
import { useDeparture } from "./Departure";
import { useBlocker } from "react-router-dom";
import { Button, Modal } from "./ui";

/** No persistence or automatic submission: cancelling keeps the mounted editor. */
export function DraftNavigationGuard({
  dirty,
  busy = false,
}: {
  dirty: boolean;
  busy?: boolean;
}) {
  const { register, remove, committed, departing } = useDeparture(),
    scopeId = useId();
  useLayoutEffect(() => {
    register(scopeId, { dirty, busy });
  }, [scopeId, register, dirty, busy]);
  useLayoutEffect(() => () => remove(scopeId), [remove, scopeId]);
  const waiting = busy || departing;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !committed() &&
      (dirty || waiting) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!dirty && !waiting) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (committed()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, waiting, committed]);
  // A confirmed save never automatically takes the user to a previously blocked route.
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty && !waiting) blocker.reset();
  }, [blocker, dirty, waiting]);
  if (blocker.state !== "blocked") return null;
  return (
    <Modal
      title={waiting ? "Operação em andamento" : "Alterações não salvas"}
      onClose={() => blocker.reset()}
    >
      <div className="modal-form">
        <p>
          {waiting
            ? "Aguarde a operação terminar antes de sair. O resultado ainda não foi confirmado."
            : "Você tem alterações ainda não salvas nesta cotação. Sair descarta apenas essas alterações; as versões já salvas são preservadas."}
        </p>
        <div className="button-row">
          <Button type="button" onClick={() => blocker.reset()}>
            Continuar na cotação
          </Button>
          {!waiting && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => blocker.proceed()}
            >
              Sair sem salvar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
