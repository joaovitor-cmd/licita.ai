import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Stage, Tracking } from "./types";
import {sortRadarCards} from './radar-order';
export type RadarStageTotal = {
  stage: Stage;
  count: number;
  potential: number | null;
  unknownValues: number;
  pendingTasks: number;
  hasMore: boolean;
};
export type RadarPageResult = {
  items: Tracking[];
  orderRevision: string;
  page: number;
  pageSize: number;
  view: "board" | "list";
  stages: RadarStageTotal[];
  total: number;
  pageTotal: number;
  hasMore: boolean;
  summary: {
    active: number;
    potential: number | null;
    unknownValues: number;
    pendingTasks: number;
  };
};
type State = {
  key: string;
  query: string;
  data: RadarPageResult | null;
  loading: boolean;
  error: string;
  pages: Partial<Record<Stage, number>>;
  busy: Partial<Record<Stage, boolean>>;
  errors: Partial<Record<Stage, string>>;
};
export function useRadarPagination(query: string) {
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<State>({
      key: "",
      query: "",
      data: null,
      loading: true,
      error: "",
      pages: {},
      busy: {},
      errors: {},
    });
  const key = `${query}:${revision}`,
    current = useRef(key),
    requests = useRef(new Map<Stage, AbortController>());
  current.current = key;
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      key,
      query,
      data: previous.query === query ? previous.data : null,
      loading: true,
      error: "",
      pages: {},
      busy: {},
      errors: {},
    }));
    api<RadarPageResult>(`/trackings/page?${query}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted && current.current === key)
          setState({
            key,
            query,
            data,
            loading: false,
            error: "",
            pages: {},
            busy: {},
            errors: {},
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted && current.current === key)
          setState((previous) => ({
            ...previous,
            key,
            loading: false,
            error: error.message,
          }));
      });
    return () => {
      controller.abort();
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    };
  }, [key, query]);
  async function more(stage: Stage) {
    if (
      state.key !== key ||
      state.loading ||
      !state.data ||
      requests.current.has(stage)
    )
      return;
    const page = (state.pages[stage] || 1) + 1,
      controller = new AbortController(),
      captured = key;
    requests.current.set(stage, controller);
    setState((previous) => ({
      ...previous,
      busy: { ...previous.busy, [stage]: true },
      errors: { ...previous.errors, [stage]: "" },
    }));
    const params = new URLSearchParams(query);
    params.set("stage", stage);
    params.set("page", String(page));
    try {
      const result = await api<RadarPageResult>(`/trackings/page?${params}`, {
        signal: controller.signal,
      });
      if (
        !controller.signal.aborted &&
        current.current === captured &&
        result.orderRevision !== state.data.orderRevision
      ) {
        setRevision((value) => value + 1);
        return;
      }
      if (controller.signal.aborted || current.current !== captured) return;
      setState((previous) => {
        if (previous.key !== captured || !previous.data) return previous;
        const pages = { ...previous.pages, [stage]: page },
          cards = new Map(previous.data.items.map((card) => [card.id, card]));
        for (const card of result.items) cards.set(card.id, card);
        return {
          ...previous,
          pages,
          busy: { ...previous.busy, [stage]: false },
          data: {
            ...previous.data,
            items: sortRadarCards([...cards.values()]),
            stages: result.stages.map((row) => ({
              ...row,
              hasMore: row.count > (pages[row.stage] || 1) * result.pageSize,
            })),
            summary: result.summary,
            total: result.total,
          },
        };
      });
    } catch (error) {
      if (!controller.signal.aborted && current.current === captured)
        setState((previous) => ({
          ...previous,
          busy: { ...previous.busy, [stage]: false },
          errors: { ...previous.errors, [stage]: (error as Error).message },
        }));
    } finally {
      if (requests.current.get(stage) === controller)
        requests.current.delete(stage);
    }
  }
  const active = state.key === key,
    visible = state.query === query ? state.data : null;
  return {
    data: visible,
    loading: !visible && (!active || state.loading),
    refreshing: !!visible && (!active || state.loading),
    error: active ? state.error : "",
    busy: active ? state.busy : {},
    columnErrors: active ? state.errors : {},
    more,
    reload: () => setRevision((value) => value + 1),
  };
}
