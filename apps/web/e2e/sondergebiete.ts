import { expect, type Page } from "@playwright/test";
import { gehe, kundeWaehlen } from "./einrichtung.ts";

/** Die PLZ erklärt das Sondergebiet; die ausdrücklich gewählte Behandlung bleibt in beiden Editoren erhalten. */
export async function sondergebietePruefen(page: Page) {
  const name = `Inselhandel ${crypto.randomUUID().slice(0, 8)}`;
  const hint = page.getByText("Kanarische Inseln: umsatzsteuerlich Drittland. Anschrift und gewählte Umsatzsteuer-Behandlung prüfen.", { exact: true });
  await gehe(page, "/kontakte/neu");
  await page.getByLabel("Name oder Firma").fill(name);
  await page.getByLabel("Straße und Hausnummer").fill("Beispielweg 7");
  await page.getByLabel("PLZ", { exact: true }).fill("38001");
  await page.getByLabel("Ort", { exact: true }).fill("Santa Cruz de Tenerife");
  await page.getByLabel("Land (z. B. DE)").fill("ES");
  await expect(hint).toBeVisible();
  await expect(page.getByLabel("PLZ", { exact: true })).toHaveAccessibleDescription(/Kanarische Inseln: umsatzsteuerlich Drittland/);
  await expect(page.getByLabel("Land (z. B. DE)")).toHaveAccessibleDescription(/Kanarische Inseln: umsatzsteuerlich Drittland/);
  await page.getByRole("button", { name: "Kontakt anlegen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Versionen" })).toBeVisible();
  const contactUrl = new URL(page.url()).pathname;
  await expect(hint).toBeVisible();

  for (const route of ["/rechnungen/neu", "/angebote/neu"]) {
    await gehe(page, route);
    const treatment = page.getByLabel("Umsatzsteuer", { exact: true });
    await treatment.selectOption("ig_lieferung");
    await kundeWaehlen(page, `${name} · Santa Cruz de Tenerife`);
    await expect(hint).toBeVisible();
    await expect(treatment).toHaveAccessibleDescription(/Kanarische Inseln: umsatzsteuerlich Drittland/);
    await expect(treatment).toHaveValue("ig_lieferung");
    await page.getByLabel("Beschreibung Position 1", { exact: true }).fill("Beispielware");
    await page.getByLabel("Menge Position 1", { exact: true }).fill("1");
    await page.getByLabel(/Einzelpreis Position 1/).fill("100,00");
    await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
    await page.waitForURL(/\/[0-9a-f-]{36}$/);
    const draftUrl = new URL(page.url()).pathname;
    await gehe(page, contactUrl);
    await page.getByLabel("PLZ", { exact: true }).fill("28001");
    await expect(hint).toHaveCount(0);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText("Gespeichert. Die vorige Fassung bleibt als Version erhalten.")).toBeVisible();
    await gehe(page, draftUrl);
    await expect(treatment).toHaveValue("ig_lieferung");
    await expect(page.getByLabel(/Einzelpreis Position 1/)).toHaveValue("100,00");
    await expect(hint).toHaveCount(0);
    await gehe(page, contactUrl);
    await page.getByLabel("PLZ", { exact: true }).fill("38001");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText("Gespeichert. Die vorige Fassung bleibt als Version erhalten.")).toBeVisible();
    await gehe(page, draftUrl);
    await expect(hint).toBeVisible();
    await expect(treatment).toHaveValue("ig_lieferung");
  }
}

/** Tatsächlicher Ort bleibt eine eigene Angabe und eine Adressänderung bestätigt keine ausländische Steuerbehandlung. */
export async function sondergebietsLeistungsortPruefen(page: Page) {
  const name = `Berliner Kunde ${crypto.randomUUID().slice(0, 8)}`;
  await gehe(page, "/kontakte/neu");
  await page.getByLabel("Name oder Firma").fill(name);
  await page.getByLabel("Straße und Hausnummer").fill("Beispielweg 7");
  await page.getByLabel("PLZ", { exact: true }).fill("10115");
  await page.getByLabel("Ort", { exact: true }).fill("Berlin");
  await page.getByRole("button", { name: "Kontakt anlegen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Versionen" })).toBeVisible();
  for (const route of ["/rechnungen/neu", "/angebote/neu", "/rechnungen/wiederkehrend/neu"]) {
    const series = route.includes("wiederkehrend");
    await gehe(page, route);
    await kundeWaehlen(page, `${name} · Berlin`);
    await page.getByLabel("Umsatzsteuer", { exact: true }).selectOption("drittland");
    const country = page.getByLabel("Land des tatsächlichen Leistungsorts");
    const postalCode = page.getByLabel("PLZ des tatsächlichen Leistungsorts (optional)");
    const confirmation = page.getByLabel("Ausländische Umsatzsteuer", { exact: true });
    await expect(country).toHaveValue("");
    await country.fill("DE");
    await expect(postalCode).toHaveValue("");
    await postalCode.fill("27498");
    await expect(country).toHaveAccessibleDescription(/Helgoland: umsatzsteuerlich Drittland/);
    await expect(postalCode).toHaveAccessibleDescription(/Helgoland: umsatzsteuerlich Drittland/);
    await confirmation.selectOption("bestaetigt");
    await postalCode.fill("10115");
    await expect(confirmation).toHaveValue("");
    await postalCode.fill("27498");
    await confirmation.selectOption("bestaetigt");
    await country.fill("ES");
    await expect(confirmation).toHaveValue("");
    await expect(postalCode).toHaveValue("");
    await country.fill("DE");
    await postalCode.fill("27498");
    await confirmation.selectOption("bestaetigt");
    if (series) await page.getByLabel("Bezeichnung", { exact: true }).fill(`Helgoland ${name}`);
    await page.getByLabel("Beschreibung Position 1", { exact: true }).fill("Beispielleistung auf Helgoland");
    await page.getByLabel("Menge Position 1", { exact: true }).fill("1");
    await page.getByLabel(/Einzelpreis Position 1/).fill("100,00");
    await page.getByRole("button", { name: series ? "Vorlage anlegen" : "Entwurf speichern", exact: true }).click();
    await page.waitForURL(/\/[0-9a-f-]{36}$/);
    await page.reload({ waitUntil: "networkidle" });
    await expect(country).toHaveValue("DE");
    await expect(postalCode).toHaveValue("27498");
    await expect(confirmation).toHaveValue("bestaetigt");
    await expect(page.getByLabel("Umsatzsteuer", { exact: true })).toHaveValue("drittland");
  }
}
