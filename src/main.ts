import "./styles.css";
import { render } from "./views.ts";
import { boot, setRoute, state, subscribe, triage, undo, currentCard } from "./state.ts";
import { announce } from "./dom.ts";
import type { Route } from "./state.ts";

const ROUTES: Route[] = ["deck", "queue", "library", "pulse", "import", "settings", "limits"];

function routeFromHash(): Route {
  const raw = (location.hash.replace(/^#\//, "") || "deck").split("?")[0];
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : "deck";
}

function syncHash(): void {
  const want = `#/${state.route}`;
  if (location.hash !== want) location.replace(want);
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape" && state.route !== "deck") {
    setRoute("deck");
    syncHash();
    return;
  }
  if (e.key === "/" && !isTypingTarget(e.target)) {
    e.preventDefault();
    if (state.route !== "library") setRoute("library");
    syncHash();
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#search-box")?.focus(), 0);
    return;
  }
  if (isTypingTarget(e.target)) return;
  const k = e.key.toLowerCase();
  const digit = ROUTES[Number(k) - 1];
  if (digit && state.route !== digit) {
    setRoute(digit);
    syncHash();
    return;
  }
  if (state.route !== "deck" || !currentCard()) return;
  const map: Record<string, "open" | "keep" | "snooze" | "toss"> = { o: "open", k: "keep", s: "snooze", x: "toss" };
  if (map[k]) {
    e.preventDefault();
    void triage(map[k]).then(() => {
      const next = currentCard();
      announce(next ? `Card ${state.deckIndex + 1}: ${next.title}` : "Deck cleared for today");
    });
    return;
  }
  if (k === "u") {
    e.preventDefault();
    void undo().then(announce);
  } else if (k === "arrowright") {
    state.deckIndex = Math.min((state.deck?.linkIds.length ?? 1) - 1, state.deckIndex + 1);
    render(document.querySelector("#app") as HTMLElement);
  } else if (k === "arrowleft") {
    state.deckIndex = Math.max(0, state.deckIndex - 1);
    render(document.querySelector("#app") as HTMLElement);
  }
});

window.addEventListener("hashchange", () => {
  const r = routeFromHash();
  if (r !== state.route) setRoute(r);
});

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
  const url = new URL("sw.js", document.baseURI).href;
  window.setTimeout(() => {
    navigator.serviceWorker
      .register(url)
      .then(() => {
        navigator.serviceWorker.addEventListener("controllerchange", () => announce("Saved copy ready — this app now works offline"));
      })
      .catch(() => {
        const note = document.querySelector<HTMLElement>("#sw-note");
        if (note) note.hidden = false;
      });
  }, 1500);
}

function bootApp(): void {
  const app = document.getElementById("app");
  if (!app) return;
  state.route = routeFromHash();
  subscribe(() => render(app));
  render(app);
  void boot();
  syncHash();
  registerServiceWorker();
}

bootApp();
