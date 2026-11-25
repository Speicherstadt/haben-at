import { amountError, formatDecimal, isKapitalgesellschaft, parseEuro, startwertFuerBuchungsart, type ZahlungMitKorrektur } from "@haben/core";
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef, useState } from "react";
import { isDialogOpen } from "../../components/ConfirmDialog.tsx";
import { type DarlehenOptionen, type DarlehenWahl, darlehenWahlFuer } from "../../components/DarlehenFelder.tsx";
import { type KategorieOptionen, type KategorieWahl, kategorieWahlFuer } from "../../components/KategorieFelder.tsx";
import { BEZUGSJAHR_FEHLER, type SteuerOptionen, type SteuerWahl, steuerangabe, steuerWahlFuer } from "../../components/SteuerFelder.tsx";
import type { AufzuhebendeZuordnung } from "../../components/ZuordnungAufheben.tsx";
import { useAction } from "../../lib/use-action.ts";
import { useSubmitCheck } from "../../lib/use-submit-check.ts";
import { gebuehrMoeglich, gebuehrPaar, useGebuehrWahl } from "../../components/BankGebuehr.tsx";
import {
  type Data,
  type Detail,
  type DirectChoice,
  direktKategorie,
  itemTarget,
  type Korrektur,
  passendeKorrektur,
  type RestArt,
  restAngebot,
} from "./-bank-daten.ts";
import { useZuordnungsAufrufe } from "./-bank-zuordnung-aufrufe.ts";
import { reassignmentError, reassignmentId } from "./-bank-wiederzuordnung.tsx";

/*
 * Zustand und Abläufe der Zuordnung eines Bankumsatzes (AllocationPanel in -bank-zuordnung.tsx): was gewählt ist, was
 * daraus gebucht würde, und die Aufrufe, die buchen. Die Teile der Oberfläche bekommen das als ein Objekt `Zuordnung`.
 */

const bankRoute = getRouteApi("/_app/bank");

export type Optionen = {
  directKinds: Data["directKinds"];
  steuerOptionen: SteuerOptionen;
  darlehenOptionen: DarlehenOptionen;
  kategorieOptionen: KategorieOptionen;
};

type Modus = "best" | "other" | "direct" | "split";

/** Ausführen mit Neuladen; ist der Umsatz danach ganz zugeordnet, weiter zum nächsten offenen, wie bei den Belegen */
function useAusfuehren(nextOpenId: string | undefined) {
  const router = useRouter();
  const navigate = useNavigate({ from: "/bank" });
  const action = useAction();
  const run = (work: () => Promise<unknown>) =>
    action.run(async () => {
      await work();
      await router.invalidate();
    });
  const runAndAdvance = (work: () => Promise<unknown>, completes: boolean) =>
    action.run(async () => {
      await work();
      if (completes && nextOpenId) await navigate({ search: (prev) => ({ ...prev, umsatz: nextOpenId }), replace: true });
      else await router.invalidate();
    });
  return { busy: action.busy, notice: action.notice, run, runAndAdvance };
}

/** Was gewählt ist: Art der Zuordnung, Rechnung oder Beleg, Buchungsart mit ihren Angaben und Betrag */
function useWahl(detail: Detail, { directKinds, steuerOptionen, darlehenOptionen, kategorieOptionen }: Optionen) {
  const { transaction: tx, suggestions, candidates, direct } = detail;
  const best = suggestions[0];
  // Ein Treffer mit Rechnung geht vor; sonst der Vorschlag aus dem Zweck der Konten (Geldtransit, Umsatzsteuer, Privat)
  const [mode, setMode] = useState<Modus>(best ? "best" : direct ? "direct" : candidates.length ? "other" : "direct");
  const [candidate, setCandidate] = useState(best ? `${best.item.type}:${best.item.id}` : "");
  // Startwert aus dem Angebot des Kontos (#873): Auf einem privaten Konto fehlen die gesperrten Arten, ein fester
  // Startwert würde dort vom Server abgelehnt. Eine gelernte Kategorie steht nicht im Angebot und bleibt stehen (#295)
  const angeboteneArten = directKinds.map((k) => k.value);
  const [directKind, setDirectKind] = useState<DirectChoice>(() => startwertFuerBuchungsart(direct?.kind, angeboteneArten) as DirectChoice);
  const [steuer, setSteuer] = useState<SteuerWahl>(() => steuerWahlFuer(steuerOptionen, tx.bookingDate));
  const [darlehen, setDarlehen] = useState<DarlehenWahl>(() => darlehenWahlFuer(darlehenOptionen, tx.amount));
  // Aus früheren Direktbuchungen derselben Gegenpartei gelernt (#295), sonst nach Richtung
  const [kategorie, setKategorie] = useState<KategorieWahl>(() => direct?.kategorie ?? kategorieWahlFuer(kategorieOptionen, tx.amount));
  const [amount, setAmount] = useState(formatDecimal(Math.abs(best?.amount ?? tx.open)));
  const parsedAmount = parseEuro(amount);
  const signedAmount = parsedAmount === null ? null : Math.sign(tx.amount) * Math.abs(parsedAmount);
  const selectedCandidate = candidates.find((c) => `${c.type}:${c.id}` === candidate);
  return {
    best,
    mode,
    setMode,
    candidate,
    setCandidate,
    directKind,
    setDirectKind,
    steuer,
    setSteuer,
    darlehen,
    setDarlehen,
    kategorie,
    setKategorie,
    amount,
    setAmount,
    parsedAmount,
    signedAmount,
    selectedCandidate,
  };
}

type Wahl = ReturnType<typeof useWahl>;

function fehler(wahl: Wahl, candidates: Detail["candidates"]) {
  const { parsedAmount, mode, selectedCandidate, directKind, steuer } = wahl;
  return {
    amount: parsedAmount === null ? amountError("den Betrag", 12_050) : parsedAmount === 0 ? "Der Betrag darf nicht 0 sein." : null,
    candidate:
      mode !== "other" || selectedCandidate
        ? null
        : candidates.length > 0
          ? "Wähle eine Rechnung, einen Beleg oder eine Voranmeldung."
          : "Hier gibt es nichts zuzuordnen; buche den Umsatz direkt oder teile ihn auf.",
    jahr: mode === "direct" && directKind === "steuer" && !steuerangabe(steuer) ? BEZUGSJAHR_FEHLER : null,
  };
}

type Aufrufe = ReturnType<typeof useZuordnungsAufrufe>;

/** Die Buchung für „Zuordnen“ bzw. „Buchen“; undefined, wenn eine Angabe fehlt */
function zuordnung(
  wahl: Wahl,
  tx: Detail["transaction"],
  amount: number,
  { allocateFn }: Aufrufe,
  reassignsId?: string | null,
): (() => Promise<unknown>) | undefined {
  const { mode, directKind, darlehen, kategorie, steuer, best, candidate } = wahl;
  const base = { transactionId: tx.id, amount, reassignsId };
  if (mode === "direct") {
    if (directKind === "darlehen") {
      return darlehen.loanId ? () => allocateFn({ data: { ...base, kind: "darlehen", darlehen } }) : undefined;
    }
    if (directKind === "kategorie" || directKind === "aufladung") {
      return () => allocateFn({ data: { ...direktKategorie(directKind, tx.id, amount, kategorie), reassignsId } });
    }
    if (directKind !== "steuer") return () => allocateFn({ data: { ...base, kind: directKind } });
    const angabe = steuerangabe(steuer);
    return angabe ? () => allocateFn({ data: { ...base, kind: "steuer", steuer: angabe } }) : undefined;
  }
  const choice = mode === "best" && best ? `${best.item.type}:${best.item.id}` : candidate;
  const [type, id] = choice.split(":");
  return id ? () => allocateFn({ data: { ...base, ...itemTarget(type, id, amount) } }) : undefined;
}

/** Enter ordnet zu, solange der Fokus nicht in einem Eingabefeld liegt */
function useEnterOrdnetZu(open: number, primaryButton: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || open === 0 || isDialogOpen()) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, button, a")) return;
      event.preventDefault();
      primaryButton.current?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, primaryButton]);
}

/** Zwei Zahlteile brauchen je ihren eigenen Bezug. Weder Betrag noch Auswahl aus dem Hauptknopf übernehmen. */
function useRestQuellen(detail: Detail, payment: number, rest: number) {
  const [paymentChoice, setPaymentChoice] = useState<string>();
  const [restChoice, setRestChoice] = useState<string>();
  const sources = detail.reassignment;
  const validation = useSubmitCheck({
    payment: reassignmentError(sources, payment, paymentChoice),
    rest: reassignmentError(sources, rest, restChoice),
  });
  function auswahl() {
    if (!validation.check()) return null;
    return {
      reassignsId: reassignmentId(paymentChoice, sources, payment),
      restReassignsId: reassignmentId(restChoice, sources, rest),
    };
  }
  return {
    form: validation.form,
    payment: { amount: payment, value: paymentChoice, error: validation.error("payment"), onChange: setPaymentChoice },
    rest: { amount: rest, value: restChoice, error: validation.error("rest"), onChange: setRestChoice },
    auswahl,
  };
}

/** Ausbuchen dessen, was nach der Zuordnung an den Posten übrig bliebe */
function useRestBuchungen(wahl: Wahl, detail: Detail, aufrufe: Aufrufe, run: (work: () => Promise<unknown>) => unknown, reassignsId?: string | null) {
  const tx = detail.transaction;
  // Posten, der gerade zugeordnet würde; ist er höher als der Umsatz, bietet sich „Rest als Gebühr“ an
  const target = wahl.mode === "best" && wahl.best ? wahl.best.item : wahl.mode === "other" ? wahl.selectedCandidate : undefined;
  const angebot = restAngebot(target, tx);
  const open = target?.open ?? 0;
  const splitFx = angebot.exchangeDifference !== 0 && Math.abs(tx.open) > Math.abs(open);
  const quellen = useRestQuellen(detail, open, splitFx ? angebot.exchangeDifference : angebot.feeRest);
  function bookRest(kind: RestArt | "kursdifferenz") {
    if (!target) return;
    const refs = kind === "kursdifferenz" && splitFx ? quellen.auswahl() : { reassignsId };
    if (!refs) return;
    const t = target.type === "invoice" ? { kind: "invoice" as const, invoiceId: target.id } : { kind: "document" as const, documentId: target.id };
    return run(() => aufrufe.restFn({ data: { transactionId: tx.id, target: t, rest: kind, ...refs } }));
  }
  function bookRestAsFee() {
    if (!target || angebot.feeRest === 0) return;
    const refs = quellen.auswahl();
    if (!refs) return;
    const first = itemTarget(target.type, target.id, target.open);
    return run(() =>
      aufrufe.splitFn({
        data: {
          transactionId: tx.id,
          parts: [
            { ...first, reassignsId: refs.reassignsId },
            { kind: "gebuehren", amount: angebot.feeRest, reassignsId: refs.restReassignsId },
          ],
        },
      }),
    );
  }
  // Rechnung mit Korrekturen und Skonto auf den geminderten Betrag (#1398), wenn nicht schon der Hauptknopf das bucht
  function bookKorrekturSkonto() {
    if (target?.type !== "invoice" || !angebot.korrektur) return;
    const work = korrekturBuchung(tx, target, angebot.korrektur, aufrufe, reassignsId);
    return run(work);
  }
  return { target, angebot, quellen, bookRest, bookRestAsFee, bookKorrekturSkonto };
}

/**
 * Buchung „Rechnung minus Korrektur“ (#1398): als Aufteilung Rechnung über ihren offenen Betrag und jede Korrektur über
 * ihren; bleibt ein Skonto auf den geminderten Betrag, bucht der Server Aufteilung und Skonto zusammen
 */
function korrekturBuchung(
  tx: Detail["transaction"],
  rechnung: { id: string; open: number },
  zahlung: ZahlungMitKorrektur,
  aufrufe: Aufrufe,
  reassignsId?: string | null,
) {
  if (zahlung.skonto !== 0) {
    const korrekturen = zahlung.corrections.map((k) => k.id);
    return () =>
      aufrufe.restFn({ data: { transactionId: tx.id, target: { kind: "invoice", invoiceId: rechnung.id }, rest: "skonto", korrekturen, reassignsId } });
  }
  const parts = [rechnung, ...zahlung.corrections].map((p) => ({ kind: "invoice" as const, invoiceId: p.id, amount: p.open }));
  return () => aufrufe.splitFn({ data: { transactionId: tx.id, parts } });
}

/** Gebühr derselben Bewegung, wenn der Umsatz eine Zahlung mit abgezogener Gebühr ist */
export type Gebuehr = Data["transactions"][number] | null;

export function useZuordnung(detail: Detail, optionen: Optionen, nextOpenId: string | undefined, gebuehr: Gebuehr) {
  const tx = detail.transaction;
  const aufrufe = useZuordnungsAufrufe();
  const ausfuehren = useAusfuehren(nextOpenId);
  // Eine GmbH oder UG hat kein Privat; dieselbe Zuordnung geht dort auf das Gesellschafter-Verrechnungskonto
  const gesellschaft = isKapitalgesellschaft(bankRoute.useRouteContext().rechtsform);
  // Monate mit abgegebener Voranmeldung: sie entscheiden über die Vorbelegung des Aufhebungstags (#782)
  const gemeldeteMonate = bankRoute.useLoaderData().gemeldeteMonate;
  const wahl = useWahl(detail, optionen);
  const [reassignment, setReassignment] = useState<string>();
  const [reversing, setReversing] = useState<AufzuhebendeZuordnung | null>(null);
  const primaryButton = useRef<HTMLButtonElement>(null);
  const { best, mode, signedAmount } = wahl;
  const {
    form: panel,
    error,
    check,
  } = useSubmitCheck({
    ...fehler(wahl, detail.candidates),
    reassignment: reassignmentError(detail.reassignment, signedAmount, reassignment),
  });
  const reassignsId = signedAmount === null ? undefined : reassignmentId(reassignment, detail.reassignment, signedAmount);
  // Bester Treffer „Rechnung minus Korrektur“ über den ganzen Umsatz (#1398): Zuordnen bucht die Aufteilung mit den Korrekturen
  const normaleZuordnung = detail.reassignment.length === 0;
  const korrekturTreffer =
    normaleZuordnung && mode === "best" && best?.item.type === "invoice" && signedAmount === tx.open ? passendeKorrektur(best.item, tx) : undefined;
  // Zahlung in der Skontofrist um genau das Skonto gekürzt: zuordnen und den Rest gleich als gewährtes Skonto ausbuchen.
  // Mit Korrekturen ist es nur das Skonto auf den geminderten Betrag, nie der Rest samt Korrektur (#1398)
  const skontoRest = korrekturTreffer
    ? korrekturTreffer.skonto
    : mode === "best" && best?.skonto && best.item.type === "invoice" && signedAmount === tx.open && !passendeKorrektur(best.item, tx)
      ? best.skonto
      : 0;
  useEnterOrdnetZu(tx.open, primaryButton);
  const rest = useRestBuchungen(wahl, detail, aufrufe, ausfuehren.run, reassignsId);
  // Zahlung mit der Gebühr ihrer Bewegung: ganze Zahlung auf eine Rechnung oder einen Beleg, die Gebühr gleich mit
  // Beim Treffer mit Korrektur bucht Zuordnen die Aufteilung; eine Gebühr der Bewegung käme dort nicht mit (#1398)
  const gebuehrWahl = useGebuehrWahl(
    normaleZuordnung && !korrekturTreffer && gebuehrMoeglich({ gebuehr, tx, skontoRest, posten: rest.target?.type, signedAmount }),
  );
  // Beim Wechsel zu „Aufteilen“ festgehalten: dort ist der Modus „split“ und target wäre leer
  const [splitInitial, setSplitInitial] = useState<typeof rest.target>(undefined);
  // Zahlung „Rechnung minus Korrektur“: die weiteren Zeilen der Aufteilung sind die Korrekturen (#1398)
  const [splitKorrekturen, setSplitKorrekturen] = useState<readonly Korrektur[]>([]);

  function submitAllocation() {
    if (!check() || signedAmount === null) return;
    if (korrekturTreffer && best) return ausfuehren.runAndAdvance(korrekturBuchung(tx, best.item, korrekturTreffer, aufrufe), true);
    if (skontoRest !== 0 && best) {
      const work = () => aufrufe.restFn({ data: { transactionId: tx.id, target: { kind: "invoice", invoiceId: best.item.id }, rest: "skonto", reassignsId } });
      return ausfuehren.runAndAdvance(work, true);
    }
    const paar = gebuehrWahl.mitbuchen && rest.target ? gebuehrPaar(rest.target.type, rest.target.id, signedAmount, gebuehrWahl.beleg) : null;
    if (paar) return ausfuehren.runAndAdvance(() => aufrufe.paymentFeeFn({ data: { transactionId: tx.id, ...paar } }), true);
    const work = zuordnung(wahl, tx, signedAmount, aufrufe, reassignsId);
    if (work) return ausfuehren.runAndAdvance(work, signedAmount === tx.open);
  }

  return {
    detail,
    tx,
    optionen,
    aufrufe,
    ...ausfuehren,
    gesellschaft,
    gemeldeteMonate,
    wahl,
    reassignment,
    setReassignment,
    reversing,
    setReversing,
    primaryButton,
    panel,
    error,
    skontoRest,
    korrekturTreffer,
    gebuehr,
    gebuehrWahl,
    rest,
    splitInitial,
    setSplitInitial,
    splitKorrekturen,
    setSplitKorrekturen,
    submitAllocation,
  };
}

export type Zuordnung = ReturnType<typeof useZuordnung>;
