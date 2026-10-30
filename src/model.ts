export type LinkStatus = "pile" | "queued" | "done" | "tossed";

export interface SalvageLink {
  id: string;
  url: string;
  title: string;
  folder: string;
  domain: string;
  dedupeKey: string;
  addDate: number | null;
  importedAt: number;
  status: LinkStatus;
  kept: boolean;
  note: string;
  openCount: number;
  lastOpenedAt: number | null;
  deckCount: number;
  lastDeckAt: number | null;
  snoozedUntil: number | null;
  tags: string[];
}

export interface SalvageEvent {
  id: string;
  ts: number;
  type:
    | "import"
    | "open"
    | "keep"
    | "snooze"
    | "toss"
    | "undo"
    | "queue-done"
    | "deck-shown"
    | "trial-start"
    | "export";
  linkId?: string;
  count?: number;
  detail?: string;
}

export interface DeckRecord {
  date: string;
  linkIds: string[];
  reasons: Record<string, string>;
}

export interface Settings {
  firstRunAt: number | null;
  trialLengthDays: number;
  deckSize: number;
  snoozeDays: number;
  lastSeenDate: string | null;
  streakDays: number;
  libraryId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  firstRunAt: null,
  trialLengthDays: 40,
  deckSize: 5,
  snoozeDays: 7,
  lastSeenDate: null,
  streakDays: 0,
  libraryId: "default",
};
