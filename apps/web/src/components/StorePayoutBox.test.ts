import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Die Verdrahtung der Komponente, nicht nur die Logik in store-payout-auswahl.ts (#1851, aus dem TDD-Review).
 * Ohne DOM: useState wird durch eine Zelle ersetzt, die Komponente als Funktion aufgerufen und der Elementbaum gelesen.
 */

const zelle = vi.hoisted(() => ({ gesetzt: false, wert: undefined as unknown }));
const gesendet = vi.hoisted(() => [] as { transactionId: string; monthIds: string[] }[]);

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (start: unknown) => {
    if (!zelle.gesetzt) {
      zelle.wert = typeof start === "function" ? (start as () => unknown)() : start;
      zelle.gesetzt = true;
    }
    const setzen = (neu: unknown) => {
      zelle.wert = typeof neu === "function" ? (neu as (alt: unknown) => unknown)(zelle.wert) : neu;
    };
    return [zelle.wert, setzen];
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../server/functions/stores.ts", () => ({
  takeOverStorePayoutFn: async ({ data }: { data: { transactionId: string; monthIds: string[] } }) => {
    gesendet.push(data);
  },
}));

const { StorePayoutBox } = await import("./StorePayoutBox.tsx");

type Monat = { id: string; bookingDate: string; amount: number; purpose: string; suggested: boolean };
const monat = (id: string, amount: number, suggested = false): Monat => ({ id, bookingDate: "2026-09-30", amount, purpose: `Monat ${id}`, suggested });
const angebot = (months: Monat[], store: "appstore" | "googleplay" = "appstore") => ({ store, label: "App Store", accountName: "App Store", months });

function elemente(knoten: ReactNode, typ: string, treffer: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(knoten)) for (const kind of knoten) elemente(kind, typ, treffer);
  else if (knoten && typeof knoten === "object" && "props" in knoten) {
    const element = knoten as ReactElement<Record<string, unknown>>;
    if (element.type === typ) treffer.push(element);
    elemente(element.props.children as ReactNode, typ, treffer);
  }
  return treffer;
}

function box(view: ReturnType<typeof angebot>, amount = 1000) {
  const baum = StorePayoutBox({ view, amount, transactionId: "tx", busy: false, run: (work) => void work() });
  const haken = elemente(baum, "input");
  const knopf = elemente(baum, "button")[0]!;
  return {
    gewaehlt: view.months.filter((_, i) => haken[i]!.props.checked).map((m) => m.id),
    umschalten: (id: string) => (haken[view.months.findIndex((m) => m.id === id)]!.props.onChange as () => void)(),
    gesperrt: knopf.props.disabled as boolean,
    buchen: () => (knopf.props.onClick as () => void)(),
  };
}

const veraltet = () => angebot([monat("a", 400, true), monat("b", 600, true), monat("c", 700), monat("d", 300)]);
const frisch = () => angebot([monat("c", 700, true), monat("d", 300)]);

describe("StorePayoutBox: Auswahl folgt dem Angebot (#1851)", () => {
  beforeEach(() => {
    zelle.gesetzt = false;
    zelle.wert = undefined;
    gesendet.length = 0;
  });

  it("vorgeladenes Detail, dann frisches: vorgewählt und gesendet wird der Vorschlag des frischen Angebots", () => {
    expect(box(veraltet()).gewaehlt).toEqual(["a", "b"]);
    const neu = box(frisch());
    expect(neu.gewaehlt).toEqual(["c"]);
    neu.buchen();
    expect(gesendet).toEqual([{ transactionId: "tx", monthIds: ["c"] }]);
  });

  it("im veralteten Angebot umgeschaltet, dann frisches: gesendet werden nur angezeigte Monate", () => {
    box(veraltet()).umschalten("d");
    expect(box(veraltet()).gewaehlt).toEqual(["a", "b", "d"]);
    const neu = box(frisch());
    expect(neu.gewaehlt).toEqual(["c"]);
    neu.umschalten("d");
    const danach = box(frisch());
    expect(danach.gewaehlt).toEqual(["c", "d"]);
    danach.buchen();
    expect(gesendet).toEqual([{ transactionId: "tx", monthIds: ["c", "d"] }]);
  });

  it("dasselbe Angebot neu geladen (neue Objekte): die eigene Auswahl bleibt, auch alles abgehakt", () => {
    box(frisch()).umschalten("d");
    box(frisch()).umschalten("c");
    expect(box(frisch()).gewaehlt).toEqual(["d"]);
    box(frisch()).umschalten("d");
    const leer = box(frisch());
    expect(leer.gewaehlt).toEqual([]);
    expect(leer.gesperrt).toBe(true);
  });

  it("zwei Klicks aus demselben Render gehen beide in die Auswahl", () => {
    const b = box(frisch());
    b.umschalten("d");
    b.umschalten("c");
    expect(box(frisch()).gewaehlt).toEqual(["d"]);
  });

  it("Klick im veralteten Render: nach dem frischen Angebot wird nichts Unsichtbares gesendet", () => {
    const alt = box(veraltet());
    alt.umschalten("d");
    const neu = box(frisch());
    neu.buchen();
    expect(gesendet[0]!.monthIds.every((id) => ["c", "d"].includes(id))).toBe(true);
  });

  it("Google Play: der Knopf rechnet mit der Auswahl des angezeigten Angebots", () => {
    const alt = angebot([monat("a", 1000, true), monat("c", 700), monat("d", 300)], "googleplay");
    const neu = angebot([monat("c", 700, true), monat("d", 300, true)], "googleplay");
    expect(box(alt).gesperrt).toBe(false);
    box(alt).umschalten("c");
    expect(box(alt).gesperrt).toBe(true);
    const b = box(neu);
    expect(b.gewaehlt).toEqual(["c", "d"]);
    expect(b.gesperrt).toBe(false);
  });

  it("Angebot ohne Monate und ohne Konto wirft nicht", () => {
    expect(() => StorePayoutBox({ view: angebot([]), amount: 1, transactionId: "tx", busy: false, run: () => undefined })).not.toThrow();
  });
});
