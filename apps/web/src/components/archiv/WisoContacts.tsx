import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { saveBase64File } from "../../lib/download.ts";
import { previewWisoContactsFn } from "../../server/functions/wiso-pdf.ts";
import { ScrollBox } from "../ScrollTable.tsx";
import { WisoPdfPreview, WisoWarnings } from "./WisoPdfPreview.tsx";

type Preview = Awaited<ReturnType<typeof previewWisoContactsFn>>;

export function WisoContacts() {
  const read = useServerFn(previewWisoContactsFn);
  return (
    <WisoPdfPreview
      id="wiso-contacts"
      title="WISO-Kontaktliste als PDF prüfen"
      label="WISO-Kontaktliste"
      missing="Bitte eine WISO-Kontaktliste auswählen."
      submitLabel="Kontakte prüfen"
      read={read}
    >
      {(preview) => <WisoContactResult preview={preview} />}
    </WisoPdfPreview>
  );
}

function WisoContactResult({ preview }: { preview: Preview }) {
  return (
    <div className="stack">
      <p role="status">
        {preview.contacts.length} {preview.contacts.length === 1 ? "Kontakt" : "Kontakte"} erkannt.
      </p>
      <WisoWarnings warnings={preview.warnings} />
      <ScrollBox label="Erkannte WISO-Kontakte">
        <table className="data-table" aria-label="Erkannte WISO-Kontakte">
          <thead>
            <tr>
              <th scope="col">Nr.</th>
              <th scope="col">Name</th>
              <th scope="col">Anschrift</th>
              <th scope="col">Land</th>
            </tr>
          </thead>
          <tbody>
            {preview.contacts.map((contact) => (
              <tr key={contact.number}>
                <th scope="row">{contact.number}</th>
                <td>{contact.name}</td>
                <td>
                  {contact.street}, {contact.postalCode} {contact.city}
                </td>
                <td>{contact.country ?? "Land prüfen"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
      <p className="small muted">
        Prüfe Namen und Adressen. Ergänze im CSV-Entwurf die Rollen und fehlenden Länder. Entferne Interessenten, die du nicht als Kunden übernehmen möchtest.
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => saveBase64File(preview.draft, "text/csv;charset=utf-8")}>
          CSV-Entwurf laden
        </button>
        <Link className="btn" to="/csv-import" search={{ art: "kontakte" }}>
          Zum Kontaktimport
        </Link>
      </div>
    </div>
  );
}
