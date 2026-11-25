import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { markPostfachDocument } from "../../server/functions/finanzamt.ts";

/**
 * Hakt einen Bescheid aus dem ELSTER-Postfach als geprüft ab und lädt die Übersicht neu (#1819). Eigener Hook, damit die
 * Seite die Server Function nur hereinreicht und `OverviewPage` nicht über die Grenze von 80 Zeilen wächst.
 */
export function useBescheidAbhaken() {
  const router = useRouter();
  const mark = useServerFn(markPostfachDocument);
  return async (id: string) => {
    await mark({ data: { id, art: "geprueft" } });
    await router.invalidate();
  };
}
