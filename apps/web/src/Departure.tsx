import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Scope = { dirty: boolean; busy: boolean };
type Departure = {
  departing: boolean;
  register: (id: string, scope: Scope) => void;
  remove: (id: string) => void;
  committed: () => boolean;
  run: (
    action: (commit: () => void) => Promise<void>,
    message: string,
    alwaysAsk?: boolean,
  ) => Promise<boolean>;
};
const Context = createContext<Departure | null>(null);
/** Only coordinates explicit context changes; never persists or submits a draft. */
export function DepartureProvider({ children }: { children: ReactNode }) {
  const scopes = useRef(new Map<string, Scope>()),
    pending = useRef(false),
    confirmed = useRef(false);
  const [departing, setDeparting] = useState(false);
  const register = useCallback((id: string, scope: Scope) => {
    if (!scopes.current.has(id) && !scopes.current.size)
      confirmed.current = false;
    scopes.current.set(id, scope);
  }, []);
  const remove = useCallback((id: string) => {
    scopes.current.delete(id);
  }, []);
  const committed = useCallback(() => confirmed.current, []);
  const run = useCallback(
    async (
      action: (commit: () => void) => Promise<void>,
      message: string,
      alwaysAsk = false,
    ) => {
      if (pending.current) return false;
      const values = [...scopes.current.values()];
      if (values.some((scope) => scope.busy)) {
        window.alert(
          "Aguarde a gravação terminar antes de sair ou trocar de empresa.",
        );
        return false;
      }
      const dirty = values.some((scope) => scope.dirty);
      if (
        (dirty || alwaysAsk) &&
        !window.confirm(
          message +
            (dirty
              ? "\n\nAs alterações ainda não salvas nesta cotação serão descartadas. As versões já salvas serão preservadas."
              : ""),
        )
      )
        return false;
      pending.current = true;
      confirmed.current = false;
      setDeparting(true);
      try {
        await action(() => {
          confirmed.current = true;
        });
        return true;
      } catch (error) {
        confirmed.current = false;
        throw error;
      } finally {
        pending.current = false;
        setDeparting(false);
      }
    },
    [],
  );
  const value = useMemo(
    () => ({ departing, register, remove, committed, run }),
    [departing, register, remove, committed, run],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDeparture() {
  const value = useContext(Context);
  if (!value) throw new Error("DepartureProvider ausente.");
  return value;
}
