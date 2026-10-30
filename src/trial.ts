import { type Settings } from "./model.ts";

export const FREE_LINK_LIMIT = 300;
export const FREE_DECK_SIZE = 5;
export const PRO_DECK_SIZE = 20;
export const DEFAULT_TRIAL_DAYS = 40;
export const DAY_MS = 86_400_000;

export type Capability =
  | "deck"
  | "search"
  | "import"
  | "export-json"
  | "export-html"
  | "unlimited-library"
  | "dedupe"
  | "bulk-cleanup"
  | "notes"
  | "deck-size-choice"
  | "export-csv"
  | "ics-reminder";

export const PRO_CAPABILITIES: Capability[] = [
  "unlimited-library",
  "deck-size-choice",
  "dedupe",
  "bulk-cleanup",
  "notes",
  "export-csv",
  "ics-reminder",
];

export const ALWAYS_FREE: Capability[] = ["deck", "search", "import", "export-json", "export-html"];

export interface Entitlement {
  plan: "free" | "pro-trial" | "pro-expired";
  proActive: boolean;
  trialStart: number | null;
  trialEnds: number | null;
  daysLeft: number | null;
  hoursLeft: number | null;
  linkLimit: number | null;
  deckSize: number;
  /** Why this verdict, in the words we show the user. */
  reason: string;
}

export function has(cap: Capability, e: Entitlement): boolean {
  return PRO_CAPABILITIES.includes(cap) ? e.proActive : ALWAYS_FREE.includes(cap);
}

/**
 * THE BILLING SEAM — the only function that decides what a user may do.
 *
 * v1 reads local state only, so the trial is soft by construction: clearing site data resets
 * the clock and there is no server to argue with. To sell Pro, keep this as the single read
 * point: accept an optional signed licence (from a provider webhook the user pastes or a
 * hosted checkout returns) on `Settings`, prefer it over the `firstRunAt` maths below, and
 * leave every call site untouched. There is deliberately no licence verification in v1
 * because there is nothing to verify yet.
 */
export function getEntitlement(settings: Settings, now: number): Entitlement {
  const start = settings.firstRunAt;
  const days = settings.trialLengthDays > 0 ? settings.trialLengthDays : DEFAULT_TRIAL_DAYS;
  if (!start) {
    return {
      plan: "free",
      proActive: true,
      trialStart: null,
      trialEnds: null,
      daysLeft: null,
      hoursLeft: null,
      linkLimit: null,
      deckSize: PRO_DECK_SIZE,
      reason: "The trial has not started yet — it starts the moment you import your first link.",
    };
  }
  const ends = start + days * DAY_MS;
  const remaining = ends - now;
  if (remaining > 0) {
    return {
      plan: "pro-trial",
      proActive: true,
      trialStart: start,
      trialEnds: ends,
      daysLeft: Math.ceil(remaining / DAY_MS),
      hoursLeft: Math.ceil(remaining / 3_600_000),
      linkLimit: null,
      deckSize: PRO_DECK_SIZE,
      reason: `Pro trial — ${Math.ceil(remaining / DAY_MS)} of ${days} days left.`,
    };
  }
  return {
    plan: "pro-expired",
    proActive: false,
    trialStart: start,
    trialEnds: ends,
    daysLeft: 0,
    hoursLeft: 0,
    linkLimit: FREE_LINK_LIMIT,
    deckSize: FREE_DECK_SIZE,
    reason: `Trial ended. The daily deck, search, browsing your whole library and every export stay free. What locks is the Pro toolset, and new links past the first ${FREE_LINK_LIMIT} stop importing — nothing you already saved is trimmed, hidden or deleted.`,
  };
}

/**
 * Single source of truth for "how many cards may I deal?". The free plan is capped at
 * FREE_DECK_SIZE no matter what settings say; Pro may choose up to PRO_DECK_SIZE.
 */
export function allowedDeckFor(e: Entitlement, wanted: number): number {
  const w = Number.isFinite(wanted) ? Math.min(PRO_DECK_SIZE, Math.max(1, Math.round(wanted))) : 1;
  return e.proActive ? w : Math.min(FREE_DECK_SIZE, w);
}

export function ensureTrialStarted(settings: Settings, now: number): { settings: Settings; started: boolean } {
  if (settings.firstRunAt !== null) return { settings, started: false };
  return { settings: { ...settings, firstRunAt: now }, started: true };
}



