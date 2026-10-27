import "./styles.css";
import { boot, announceForDeck, currentCard, setRoute, state, stepDeck, subscribe, triage, undo } from "./state.ts";
import { announce } from "./dom.ts";
import { render } from "./views.ts";
import type { Route } from "./state.ts";

const ROUTES: Route[] = ["deck", "queue", "library", "pulse", "import", "settings", "limits"];

function routeFromHash(): Route {
  const raw = (location.hash.replace(/^#\//, "") || "deck").split("?")[0];
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : "deck";
}

function go(route: Route): void {
  setRoute(route);
  const want = `#/${route}`;
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
    go("deck");
    return;
  }
  if (e.key === "/" && !isTypingTarget(e.target)) {
    e.preventDefault();
    if (state.route !== "library") go("library");
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#search-box")?.focus(), 0);
    return;
  }
  if (isTypingTarget(e.target)) return;
  const k = e.key.toLowerCase();
  const digit = ROUTES[Number(k) - 1];
  if (digit) {
    go(digit);
    return;
  }
  if (state.route !== "deck") return;
  const map: Record<string, "open" | "keep" | "snooze" | "toss"> = { o: "open", k: "keep", s: "snooze", x: "toss" };
  if (map[k]) {
    if (!currentCard()) return;
    e.preventDefault();
    void triage(map[k]).then(() => announce(announceForDeck()));
    return;
  }
  if (k === "u") {
    e.preventDefault();
    void undo().then(announce);
    return;
  }
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    stepDeck(e.key === "ArrowRight" ? 1 : -1);
    announce(announceForDeck());
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
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "activated") announce("Offline copy updated.");
          });
        });
      })
      .catch(() => {
        const note = document.querySelector<HTMLElement>("#sw-note");
        if (note) note.hidden = false;
      });
  }, 1200);
}

function bootApp(): void {
  const app = document.getElementById("app");
  if (!app) return;
  state.route = routeFromHash();
  subscribe(() => render(app));
  render(app);
  void boot();
  registerServiceWorker();
}

bootApp();
