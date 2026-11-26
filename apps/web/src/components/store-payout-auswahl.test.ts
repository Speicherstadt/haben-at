import { describe, expect, it } from "vitest";
import { auswahlFuer, umgeschaltet } from "./store-payout-auswahl.ts";

const monat = (id: string, suggested = false) => ({ id, suggested });

describe("Auszahlung eines Stores: Auswahl der Monate", () => {
  it("ohne eigene Auswahl gilt der Vorschlag", () => {
    expect([...auswahlFuer([monat("a", true), monat("b", true), monat("c")], null)]).toEqual(["a", "b"]);
  });

  it("an- und abhaken ändert die Auswahl", () => {
    const months = [monat("a", true), monat("b")];
    const mitB = umgeschaltet(months, null, "b");
    expect([...auswahlFuer(months, mitB)]).toEqual(["a", "b"]);
    expect([...auswahlFuer(months, umgeschaltet(months, mitB, "a"))]).toEqual(["b"]);
  });

  // Der Router zeigt beim Öffnen eines Umsatzes erst das vorgeladene Detail und lädt dann neu. Sind die dort
  // vorgeschlagenen Monate inzwischen ausgezahlt, dürfen sie nicht in der Auswahl bleiben: Zu sehen sind sie nicht mehr,
  // der Server lehnt sie ab
  it("ein neues Angebot verwirft die Auswahl zum alten und nimmt seinen eigenen Vorschlag", () => {
    const veraltet = [monat("a", true), monat("b", true), monat("c"), monat("d")];
    const frisch = [monat("c", true), monat("d")];
    expect([...auswahlFuer(frisch, null)]).toEqual(["c"]);
    expect([...auswahlFuer(frisch, umgeschaltet(veraltet, null, "d"))]).toEqual(["c"]);
  });

  it("dasselbe Angebot nach erneutem Laden behält die Auswahl", () => {
    const auswahl = umgeschaltet([monat("a", true), monat("b")], null, "b");
    expect([...auswahlFuer([monat("a", true), monat("b")], auswahl)]).toEqual(["a", "b"]);
  });
});
