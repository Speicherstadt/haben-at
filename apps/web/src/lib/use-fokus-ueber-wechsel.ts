import { useEffect, useRef } from "react";

/*
 * Jede Seite entsteht je Pfad-Parameter neu (`defaultRemountDeps` in router.tsx). Wechselt eine Auswahl der Seite selbst
 * den Parameter, etwa „Zeitraum“ der Voranmeldung, verschwände sie dabei samt Fokus, und `_app.tsx` setzte ihn an den
 * Anfang des Inhalts: Wer mit den Pfeiltasten durch die Zeiträume geht, verlöre nach dem ersten Schritt die Auswahl, der
 * nächste Druck rollte die Seite. `merken` hält vor dem Wechsel fest, dass die Auswahl den Fokus hatte; die gleichnamige
 * auf der neuen Seite nimmt ihn beim Einhängen.
 */
let gemerkt: string | null = null;

export function useFokusUeberWechsel<T extends HTMLElement>(name: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (gemerkt !== name) return;
    gemerkt = null;
    ref.current?.focus({ preventScroll: true });
  }, [name]);
  const merken = () => {
    gemerkt = ref.current !== null && ref.current === document.activeElement ? name : null;
  };
  return { ref, merken };
}
