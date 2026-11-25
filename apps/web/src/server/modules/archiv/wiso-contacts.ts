import { readWisoContactList } from "@haben/import";
import { csv } from "./csv.ts";
import { csvDraft, readWisoPdf } from "./wiso-pdf.ts";

export async function previewWisoContacts(bytes: Uint8Array) {
  const preview = await readWisoPdf(bytes, "Bitte die WISO-Kontaktliste als PDF auswählen.", readWisoContactList);
  const draft = csv(
    ["Kundennummer", "Name", "Straße", "PLZ", "Ort", "Land", "Rolle"],
    preview.contacts.map((c) => [c.number, c.name, c.street, c.postalCode, c.city, c.country ?? "Bitte prüfen", "Bitte prüfen"]),
  );
  return { ...preview, draft: csvDraft("WISO-Kontakte-Entwurf.csv", draft) };
}
