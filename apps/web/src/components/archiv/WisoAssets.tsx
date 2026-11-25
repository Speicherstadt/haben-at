import { formatEuro } from "@haben/core";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { saveBase64File } from "../../lib/download.ts";
import { previewWisoAssetsFn } from "../../server/functions/wiso-pdf.ts";
import { ScrollBox } from "../ScrollTable.tsx";
import { WisoPdfPreview, WisoWarnings } from "./WisoPdfPreview.tsx";

type Preview = Awaited<ReturnType<typeof previewWisoAssetsFn>>;

export function WisoAssets() {
  const read = useServerFn(previewWisoAssetsFn);
  return (
    <WisoPdfPreview
      id="wiso-assets"
      title="WISO-Anlagenverzeichnis als PDF prüfen"
      label="WISO-Anlagenverzeichnis"
      missing="Bitte ein WISO-Anlagenverzeichnis auswählen."
      submitLabel="Anlagen prüfen"
      read={read}
    >
      {(preview) => <WisoAssetResult preview={preview} />}
    </WisoPdfPreview>
  );
}

function WisoAssetResult({ preview }: { preview: Preview }) {
  return (
    <div className="stack">
      <p role="status">
        {preview.assets.length} {preview.assets.length === 1 ? "Anlage" : "Anlagen"} für {preview.year} erkannt. Übernahmestichtag für diese Werte: 01.01.
        {preview.year + 1}.
      </p>
      <WisoWarnings warnings={preview.warnings} />
      <ScrollBox label="Erkannte WISO-Anlagen">
        <table className="data-table" aria-label="Erkannte WISO-Anlagen">
          <thead>
            <tr>
              <th scope="col">Nr.</th>
              <th scope="col">Bezeichnung</th>
              <th scope="col">Konto</th>
              <th scope="col">Anschaffungskosten</th>
              <th scope="col">Restbuchwert am 31.12.</th>
            </tr>
          </thead>
          <tbody>
            {preview.assets.map((asset) => (
              <tr key={asset.inventoryNumber}>
                <th scope="row">{asset.inventoryNumber}</th>
                <td>{asset.name}</td>
                <td>{asset.account}</td>
                <td className="num">{formatEuro(asset.cost)}</td>
                <td className="num">{formatEuro(asset.closingBookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
      <p className="small muted">
        Prüfe die Werte und ergänze im CSV-Entwurf Art und Abschreibung anhand der Anlagendetails. Lade die bearbeitete Datei im Anlagenimport hoch.
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => saveBase64File(preview.draft, "text/csv;charset=utf-8")}>
          CSV-Entwurf laden
        </button>
        <Link className="btn" to="/csv-import" search={{ art: "anlagen", stichtag: `${preview.year + 1}-01-01` }}>
          Zum Anlagenimport
        </Link>
      </div>
    </div>
  );
}
