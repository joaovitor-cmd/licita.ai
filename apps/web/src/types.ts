export interface Session {
  user: { id: string; name: string; email: string };
  organization: {
    id: string;
    name: string;
    taxId: string | null;
    isDemo: boolean;
  };
  role: "ADMIN" | "MEMBER";
  isPlatformAdmin?: boolean;
}
export interface Opportunity {
  matchedSearchProfiles?: {id:string;name:string;revision:number}[];
  id: string;
  publicCode: string | null;
  canonicalKey: string;
  editalNumber: string | null;
  uasg: string | null;
  capag: string | null;
  title: string;
  description: string | null;
  agency: string;
  state: string | null;
  city: string | null;
  modality: string | null;
  sphere: string | null;
  value: number | null;
  publishedAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
  status: string | null;
  url: string | null;
  sourceCode: string;
  sourceName: string;
  syncedAt: string;
  isDemo: boolean;
  documents: { name: string; url: string }[];
  attachmentWarning?: string;
  match: { score: number; reasons: string[]; excluded: boolean };
  trackingId: string | null;
}
export interface Task {
  id: string;
  title: string;
  done: boolean;
  deadline: string | null;
  ownerId: string | null;
}
export interface Event {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
}
export type Stage =
  | "IDENTIFIED"
  | "IN_ANALYSIS"
  | "WILL_PARTICIPATE"
  | "PROPOSAL_SENT"
  | "WON"
  | "LOST"
  | "DISCARDED";
export interface Tracking {
  boardPosition?: string;
  id: string;
  pendingChanges?: number;
  opportunityId: string;
  opportunity: Opportunity;
  stage: Stage;
  ownerId: string | null;
  deadline: string | null;
  expectedValue: number | null;
  outcomeReason: string;
  outcomeCategory?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  events: Event[];
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
}
export interface Offering {
  id: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  description: string;
  category: string;
  keywords: string[];
  active: boolean;
  updatedAt: string;
  unit?: string | null;
  unitCost?: number | null;
  salePrice?: number | null;
  priceBasis?: 'PER_UNIT' | 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | null;
}
export interface Profile {
  companyRevision?:number;
  organizationName: string;
  taxId: string;
  segments: string[];
  states: string[];
  cities: string[];
  keywords: string[];
  excludedKeywords: string[];
  modalities: string[];
  minValue: number | null;
  maxValue: number | null;
}
export interface DocumentItem {
  id: string;
  name: string;
  category: string;
  expiresAt: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
export interface Notification {
  id: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  url: string;
}
export interface SourceData {
  sources: {
    code: string;
    name: string;
    description: string;
    url: string;
    status: "ready" | "unavailable" | "planned";
    lastRun: string | null;
    records: number;
  }[];
  runs: {
    id: string;
    sourceCode: string;
    status: string;
    created: number;
    updated: number;
    read: number;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    emailConfigured: boolean;
  };
}
export interface DashboardData {
  recommendationMinScore: number;
  stats: {
    opportunities: number;
    recommended: number;
    tracked: number;
    urgent: number;
    overdue: number;
    potentialValue: number;
  };
  recommended: Opportunity[];
  deadlines: Tracking[];
  byState: { label: string; count: number }[];
  byModality: { label: string; count: number }[];
  activity: {
    id: string;
    title: string;
    description: string;
    createdAt: string;
  }[];
  lastSync: string | null;
}
export const STAGES: {
  value: Stage;
  label: string;
  short: string;
  color: string;
}[] = [
  { value: "IDENTIFIED", label: "No radar", short: "No radar", color: "slate" },
  {
    value: "IN_ANALYSIS",
    label: "Em análise",
    short: "Em análise",
    color: "blue",
  },
  {
    value: "WILL_PARTICIPATE",
    label: "Preparando proposta",
    short: "Preparação",
    color: "purple",
  },
  {
    value: "PROPOSAL_SENT",
    label: "Proposta enviada",
    short: "Enviadas",
    color: "amber",
  },
  { value: "WON", label: "Ganhas", short: "Ganhas", color: "green" },
  { value: "LOST", label: "Perdidas", short: "Perdidas", color: "red" },
  {
    value: "DISCARDED",
    label: "Descartadas",
    short: "Descartadas",
    color: "slate",
  },
];
export const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
