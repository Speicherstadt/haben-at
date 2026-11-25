/**
 * Anschriftenhinweis, keine verbindliche Gebietsfeststellung: § 1 Abs. 2/2a UStG, Art. 6 MwStSystRL.
 * https://www.gesetze-im-internet.de/ustg_1980/__1.html
 * https://www.boe.es/buscar/doc.php?id=DOUE-L-2006-82505 (Art. 6, Original)
 * https://www.boe.es/buscar/doc.php?id=DOUE-L-2019-80467 (Campione/Luganer See ab 2020)
 * Der italienische Luganer See und weitere Helgoländer Postfach-PLZ sind damit nicht vollständig erkennbar.
 */
export function vatTerritory(country: string | null | undefined, postalCode: string | null | undefined): string | null {
  const code = country?.trim().toUpperCase();
  const postcode = postalCode?.replace(/\s/g, "");
  // Gemeinden: Straßenanschriften Helgoland 27498; Büsingen mit deutscher bzw. Schweizer Postanschrift.
  // https://www.helgoland.de/so-ist-helgoland/helgoland-von-a-bis-z/ (Post, 13 PLZ, keine vollständige Liste)
  // https://www.buesingen.de/de/Unser-Buesingen/Deutsche-Insel-in-der-Schweiz/FAQ-Fragen-und-Antworten
  if (code === "DE" && postcode === "27498") return "Helgoland";
  if ((code === "DE" && postcode === "78266") || (code === "CH" && postcode === "8238")) return "Büsingen";
  // Fünf Stellen, Provinz in den ersten zwei Ziffern; Kanaren: INE 35/38, Ceuta/Melilla: BOE 51/52.
  // https://www.boe.es/buscar/doc.php?id=BOE-A-1984-3487 (Art. 2)
  // https://ine.es/daco/daco42/codmun/cod_ccaa_provincia.htm
  // https://www.boe.es/buscar/doc.php?id=BOE-A-1995-21835 (Art. 1)
  if (code === "ES" && postcode && /^\d{5}$/.test(postcode)) {
    if (/^(35|38)/.test(postcode)) return "Kanarische Inseln";
    if (postcode.startsWith("51")) return "Ceuta";
    if (postcode.startsWith("52")) return "Melilla";
  }
  // Poste Italiane, CAP-Liste, S. 29–30; keine Ausweitung auf benachbarte Gemeinden oder Seegewässer.
  // https://business.poste.it/business/files/1476493455505/copertura-cap-servizi-rendicontazione.pdf
  if (code === "IT" && postcode === "23041") return "Livigno / Trepalle";
  if (code === "IT" && postcode === "22061") return "Campione d’Italia";
  // Griechisches Umweltministerium, Εξοικονομώ 2025, Anhang IX (Dezember 2024), S. 3–4:
  // 42 Athos-Siedlungen, 63086/63087 dort ohne andere Gebietszuordnung; ELTA bestätigt Karyes/Dafni.
  // https://exoikonomo2025.gov.gr/parartemata-odegou und https://postalcodes.elta.gr/
  if (code === "GR" && (postcode === "63086" || postcode === "63087")) return "Berg Athos";
  return null;
}
