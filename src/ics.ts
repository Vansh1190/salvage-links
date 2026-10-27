function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 74) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > 74) {
      out.push(current);
      current = " " + ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n");
}

function escapeText(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function stamp(ts: number): string {
  return new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export interface ReminderOptions {
  now: number;
  hour?: number;
  minute?: number;
  weekday?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  description?: string;
  url?: string;
  uid?: string;
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * Static hosting means no push notifications with the tab closed (Push needs a server;
 * Periodic Background Sync is Chromium-only and engagement-gated). A calendar file the
 * user owns is the honest equivalent.
 */
export function buildWeeklyReminderIcs(opts: ReminderOptions): string {
  const hour = opts.hour ?? 20;
  const minute = opts.minute ?? 0;
  const weekday = opts.weekday ?? 1;
  const start = new Date(opts.now);
  start.setHours(hour, minute, 0, 0);
  while (start.getDay() !== weekday) start.setDate(start.getDate() + 1);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//salvage//daily-deck//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Salvage daily deck",
    "BEGIN:VEVENT",
    `UID:${opts.uid ?? "salvage-daily-deck@salvage.local"}`,
    `DTSTAMP:${stamp(opts.now)}`,
    `DTSTART:${icsDate(start.getTime())}`,
    "RRULE:FREQ=WEEKLY;BYDAY=" + BYDAY[weekday],
    fold(`SUMMARY:${escapeText("Salvage: triage today's deck of saved links")}`),
    fold(`DESCRIPTION:${escapeText(opts.description ?? "Open Salvage and clear today's deck. 60 seconds.")}`),
    ...(opts.url ? [fold(`URL:${opts.url}`)] : []),
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${escapeText("Salvage daily deck")}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function parseIcsForTest(ics: string): Record<string, string> {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
