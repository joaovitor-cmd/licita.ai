import { useCallback, useEffect, useState } from "react";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let requestWorkspace: string | undefined;
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if(requestWorkspace && !path.startsWith('/auth/'))headers.set('X-Workspace-Id',requestWorkspace);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const body = await response.text();
  let data: unknown;
  try {
    data = body ? JSON.parse(body) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      (data as { error?: string })?.error ||
        `Não foi possível concluir a operação (${response.status}).`,
      response.status,
    );
  }
  if(path.startsWith('/auth/') && (data as any)?.organization?.id)requestWorkspace=(data as any).organization.id;
  return data as T;
}
export const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, loading, error, reload, setData };
}
export const currency = (value: number | null | undefined, compact = false) =>
  value == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: compact ? 0 : 2,
        ...(compact && value >= 1000000
          ? { notation: "compact" as const }
          : {}),
      }).format(value);
export const date = (value: string | null | undefined, time = false) =>
  !value
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(time
          ? { hour: "2-digit" as const, minute: "2-digit" as const }
          : {}),
      }).format(new Date(value));
export const dateInput = (value: string | null | undefined) =>
  !value
    ? ""
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
export const dateTimeInput = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T')
  : '';
export const splitTerms = (value: string) => [
  ...new Set(
    value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export const safeUrl = (value: string | null | undefined) => {
  try {
    const u = new URL(value || "");
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
