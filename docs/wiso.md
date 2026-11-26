---
title: "Umzug aus WISO EÜR & Kasse zum 1. Januar"
description: >-
  WISO EÜR & Kasse zum Jahreswechsel verlassen: Originalexporte sichern, Kontakte, Artikel
  und Anlagen per CSV übernehmen und offene Posten vor dem Start klären.
---

# Umzug aus WISO EÜR & Kasse

Für ein Einzelunternehmen mit EÜR bietet sich der Wechsel zum **1. Januar** an. Das letzte Jahr bleibt in WISO, das neue beginnt in Haben. Für Kontakte und Anlagen kann Haben einen CSV-Entwurf aus dem WISO-PDF erstellen. Die CSV für Artikel bereitest du selbst vor.

> [!IMPORTANT]
> Haben bietet als Rechtsform nur Einzelunternehmen, GmbH und UG an. Eine Partnerschaft ist damit derzeit nicht abgedeckt; richte sie nicht ersatzweise als Einzelunternehmen ein. GmbH und UG bilanzieren in Haben, dieser EÜR-Ablauf gilt für sie nicht. Bei einem Wechsel der Gewinnermittlung klärst du zuerst die Eignung mit der Steuerberatung; siehe [Einrichtung](einrichtung.md#rechtsform-einzelunternehmen-gmbh-oder-ug).

## Was heute geht

| Bestand aus WISO | Weg nach Haben |
| --- | --- |
| Kontakte | WISO-Kontaktliste auslesen oder CSV selbst erstellen, [Spalten zuordnen und Vorschau prüfen](csv-import.md#kontakte) |
| Artikel | Aus der Liste eine CSV erstellen und [im Artikelimport prüfen](csv-import.md#artikel) |
| Anlagen | WISO-Anlagenverzeichnis auslesen, CSV-Entwurf ergänzen und im [Anlagenimport](csv-import.md#anlagen) prüfen |
| Originalexporte und PDF-Listen | Unverändert aufbewahren; optional als Originaldateien im Archiv ablegen |
| Buchungs-CSV (WISO EÜR & Kasse und WISO Steuer, Modul EÜR) | Unter **Archiv › Umzug › Umzug aus WISO** prüfen und unveränderlich als durchsuchbare Archivbelege samt Original-CSV übernehmen; Journalbuchungen entstehen daraus nicht |
| GoBD-Buchungsliste und SuSa | Unter **Archiv › Umzug › Umzug aus WISO** die beiden CSV-Dateien aus demselben Export abgleichen. Haben zeigt Abweichungen je Konto. |
| Offene Rechnungen und Eingangsbelege | Kein automatischer WISO-Umzug; vor dem Start einzeln klären |

Der CSV-Export der Buchungen (`Daten Export › Buchungen als CSV-Datei`) hat in WISO Steuer (Modul EÜR) dieselben 18 Spalten wie in WISO EÜR & Kasse und nutzt denselben Import. Für die übrigen Exporte von WISO Steuer sind gleiche Formate nicht bestätigt.

Der Testlauf zeigt die Summen der CSV-Spalten **Soll** und **Haben**. Sie enthalten Teilbuchungen, neutrale Zeilen wie Saldovorträge und negative Zeilen mit ihrem Vorzeichen.

Bei Fehlern zeigt der Testlauf die ersten 20 betroffenen CSV-Datensätze und zählt weitere Fehler. Die Nummer zählt die Kopfzeile und leere Zeilen mit. Ein Feld mit Zeilenumbruch gehört weiterhin zu einem Datensatz. Solange der Testlauf Fehler meldet, ist keine Übernahme möglich. Korrigiere den Export und starte den Testlauf erneut.

Der **GoBD-Abgleich** vergleicht Anfangssalden, Soll- und Haben-Buchungssummen und Endsalden. In der geprüften SuSa aus WISO EÜR & Kasse ist der Soll-Überhang in `SaldoHaben` angegeben und der Haben-Überhang in `SaldoSoll`. Haben berücksichtigt diese Spaltenbelegung. [Anonymisierter WISO-Beispielexport](https://github.com/Speicherstadt/haben/issues/565#issuecomment-6770106423)

Der Vergleich bezieht sich auf die beiden gewählten GoBD-Dateien. Der getrennte Import der Buchungs-CSV bleibt für die Archivübernahme zuständig.

Die Buchungs-CSV enthält kein Rechnungs- oder Leistungsdatum. Das Archivdatum bleibt das Zahlungsdatum; Buchungs- und Wertstellungsdatum bleiben in den Quelldaten erhalten. Leistungsangaben bleiben unbekannt, auch bei bereits archivierten WISO-Buchungen. Ihre gespeicherten Daten und die Original-CSV bleiben unverändert.

## 1. Das letzte WISO-Jahr abschließen und sichern

1. Erfasse die letzten Buchungen des Jahres und **buche die Jahres-AfA in WISO**, bevor du das endgültige Anlagenverzeichnis ausgibst. In der geprüften WISO-Liste waren die Werte laufender GWG vor der AfA-Buchung noch vorläufig.
2. Gib danach das Anlagenverzeichnis einschließlich der Anlagendetails und Abschreibungspläne neu aus. Beim Wechsel zum 01.01.2027 brauchst du den Restbuchwert **zum 31.12.2026**.
3. Sichere je Jahr den CSV-Export der Buchungen und den vollständigen Export für den Datenzugriff der Finanzverwaltung: `index.xml`, Firmenstammblatt, Kontenplan, Buchungsliste, Sachkonten, Summen- und Saldenliste sowie Umsatzsteuerjahresaufstellung.
4. Sichere die Kontakt- und gegebenenfalls Artikellisten, Originalrechnungen und Belege, Kontoauszüge, EÜR und die Übermittlungsprotokolle deiner Steueranmeldungen und Erklärungen.

Bewahre diese Originale unverändert mit eindeutiger Jahreszuordnung und einer getrennten Sicherung auf. Erstelle die CSV für Haben in einer Arbeitskopie; überschreibe weder Exportdateien noch Belege.

Optional legst du die übrigen WISO-Dateien zusätzlich unter **Archiv › Originaldateien › Datei ablegen** mit Art **Sonstiges** und dem zugehörigen Geschäftsjahr ab. Die Buchungs-CSV übernimmst du stattdessen unter **Archiv › Umzug › Umzug aus WISO**, damit sowohl die Originaldatei als auch die einzelnen Buchungen durchsuchbar im Archiv landen. Wähle für keine der Dateien **DATEV-Buchungsstapel**: Die WISO-Rohdateien sind kein DATEV-Stapel.

Ein unterjähriger Umstieg ist mit den geprüften Listen nicht geklärt: Sie zeigen den Restbuchwert zum 31.12. Für einen anderen Stichtag bräuchtest du einen verlässlichen Buchwert am Vortag und die passende bereits gebuchte AfA. Verwende dafür keinen Jahresendwert.

## 2. Haben für das neue Jahr einrichten

Trage vor der ersten Buchung die [Firmendaten](einrichtung.md#firmendaten) ein. Prüfe Kontenrahmen, Ist- oder Soll-Versteuerung und Kleinunternehmerstatus gegen den bisherigen Stand. Setze die nächste Rechnungsnummer so, dass keine bereits vergebene Nummer erneut verwendet wird.

Lege den ersten Tag der Buchhaltung in Haben fest und plane den [Bankimport](bank.md) ab diesem Tag. Bei einem Wechsel der Bankquelle beachtest du die dort beschriebenen [Dubletten](bank.md#dubletten).

## 3. Listen in CSV übertragen und prüfen

Bereite für Kontakte, Anlagen und gegebenenfalls Artikel je eine eigene CSV mit Spaltennamen in der ersten Zeile vor. Überträgst du Listenwerte von Hand, lasse Seitenköpfe, Fußzeilen und Summenzeilen weg. Bei umbrochenen Namen und Bezeichnungen kontrollierst du den vollständigen Eintrag am Original.

Öffne **CSV importieren** unter **Kontakte**, **Anlagen** oder **Artikel**. Prüfe die erkannten Spaltenzuordnungen sowie Fehler und Dubletten vor **Übernehmen**. Die genauen Dateiformate und Feldregeln stehen im [CSV-Import](csv-import.md#so-gehst-du-vor).

### Kontakte

Unter **Archiv › Umzug › Umzug aus WISO** kannst du die Liste **Kunden / Interessenten** als PDF mit Textebene prüfen (höchstens 20 MB und 100 Seiten). Haben liest Nummer, Name und erste Anschrift lokal auf dem Server aus und speichert dabei keine Kontakte. Ein unbekanntes Layout oder eine nicht eindeutig lesbare Anschrift lehnt Haben ab; dann erstellst du die CSV von Hand.

Vergleiche Namen und Anschriften im CSV-Entwurf mit dem PDF. In der Spalte **Rolle** steht **Bitte prüfen**, weil die WISO-Liste Kunden und Interessenten nicht je Zeile unterscheidet: Trage die Rolle ein und entferne die Zeilen, die du nicht übernimmst. Bei fünfstelliger PLZ schlägt Haben `DE` als **Land** vor, sonst steht dort **Bitte prüfen**, und die Vorschau zeigt **Land prüfen**.

- Übernimm die WISO-Kundennummer als **Kundennummer**, nicht ungeprüft als DATEV-Debitor. Bewahre führende Nullen bei der Vorbereitung als Text.
- Führe umgebrochene Namen zusammen. Trenne Firma, Vor- und Nachname nur, wenn die Zuordnung eindeutig ist. Ein Ansprechpartner unter der Anschrift ist kein weiterer Kunde.
- Lasse fehlende Angaben wie „k.A.“ leer. Prüfe die Rolle **Kunde**, **Lieferant** oder beide; Haben kennt keine eigene Interessentenrolle.
- Ergänze **Land** ausdrücklich, etwa `DE`, `LU`, `BE` oder `LV`. Die geprüfte PDF-Liste gibt das WISO-Länderfeld nicht aus. Ohne Land setzt der CSV-Import Deutschland.
- Präfixe wie `L - 1821` in der PLZ waren eigene Eingaben der WISO-Nutzer, keine verlässliche Länderkennzeichnung des Exports. Prüfe das tatsächliche Land und trenne es von der PLZ; bei Luxemburg etwa `Land = LU`, `PLZ = 1821`. Haben leitet das Land daraus nicht automatisch ab.

Umsatz, Saldo, Kreditlimit und Zahlungsdauer aus der Kontaktliste sind keine einzelnen Rechnungen oder Zahlungen. Daraus entstehen beim Kontaktimport keine offenen Posten.

### Anlagen

Unter **Archiv › Umzug › Umzug aus WISO** kannst du ein WISO-Anlagenverzeichnis als PDF mit Textebene prüfen (höchstens 20 MB und 100 Seiten). Haben liest die Liste auf dem eigenen Server aus und zeigt die gefundenen Anlagen sowie Hinweise zu abweichenden Summen und Änderungen. Wenn sich das PDF nicht lesen lässt, bereite die CSV von Hand vor. Die Vorschau speichert keine Anlage.

Lade den **CSV-Entwurf** herunter und ergänze die Felder nach der folgenden Tabelle. Entferne aus dem Entwurf die Anlagen, die du nicht übernehmen willst. **Zum Anlagenimport** öffnet den Import mit dem 01.01. nach dem PDF-Abschlussjahr. Wähle dort die bearbeitete CSV-Datei und starte die **Vorschau**.

Wähle für die gesamte Datei den **Übernahmestichtag 01.01.** des ersten Haben-Jahres. Der Restbuchwert gehört zum **31.12. des Vorjahres nach gebuchter Jahres-AfA**.

| WISO-Liste oder Anlagendetails | CSV für Haben |
| --- | --- |
| Nr. | Als **Inventarnummer** in die CSV schreiben oder im Import **Notiz** zuordnen. Führende Nullen als Text erhalten. |
| Bezeichnung | **Bezeichnung** wie in WISO |
| Anschaffungsdatum | **Anschaffungsdatum**, nicht der Umzugstag |
| Anschaffungskosten | **Anschaffungskosten** wie in WISO geführt; [Vorsteueranteil beachten](csv-import.md#anlagen), nicht nach heutigem Kleinunternehmerstatus umrechnen; Veränderungen gesondert prüfen |
| ND | **Nutzungsdauer (Jahre)** bzw. Monate passend zum bisherigen Plan |
| Abschreibungsplan | **Art** und **Abschreibung** nach den WISO-Anlagendetails wählen. Bei degressiver AfA zusätzlich den bisherigen **degressiven Satz** eintragen. |
| RBW 31.12. des letzten WISO-Jahres | **Restbuchwert** |

**Baugleiche Anlagen:** Haben vergleicht Bezeichnung, Anschaffungsdatum und Anschaffungskosten. Ist eine Inventarnummer oder Notiz eingetragen, zählt sie ebenfalls. Acht gleiche Stühle vom selben Tag kannst du mit ihrer jeweiligen WISO-Nummer einzeln übernehmen. Prüfe vor dem Speichern, ob alle acht Zeilen in der Vorschau als neu erscheinen. [Dubletten beim Anlagenimport](csv-import.md#anlagen)

**Zugänge und Teilabgänge:** Übernimm die Spalte „Zugänge/Teilabgänge“ nicht pauschal als Zuschlag zu den Anschaffungskosten. Prüfe je Anlage Art und Zeitpunkt der Veränderung, die fortgeführten Kosten und den Buchwert anhand der Details. Unklare Fälle klärst du mit der Steuerberatung, statt den Plan passend zu rechnen.

**GWG und vollständig abgeschriebene Anlagen:** Wähle die Methode nach dem tatsächlichen Abschreibungsplan, nicht allein nach dem WISO-Konto. Vollständig abgeschriebene Anlagen musst du nicht übernehmen; die alten Nachweise bleiben in der Sicherung. Ein GWG aus dem Vorjahr mit positivem Restbuchwert wird vom CSV-Import abgelehnt. Prüfe zuerst, ob die letzte WISO-AfA wirklich gebucht und die Liste danach neu ausgegeben wurde.

**Erinnerungswert 1 €:** Der CSV-Import hat dafür keine Spalte. Bei abgelaufener linearer Nutzungsdauer lehnt er einen positiven Restbuchwert ab. Setze den Wert nicht künstlich auf 0. Prüfe eine [manuelle Übernahme mit Erinnerungswert](anlagen.md#erinnerungswert); Haben unterstützt ihn bei linearer, degressiver und Elektro-AfA, nicht bei GWG, Sammelposten oder Computern mit einjähriger Nutzungsdauer. Passt der bisherige Plan dazu nicht eindeutig, kläre die Übernahme mit der Steuerberatung.

Vergleiche nach der Übernahme Anzahl, Anschaffungskosten und Restbuchwerte mit dem endgültigen Verzeichnis je Anlagengruppe. Prüfe anschließend die einzelnen Abschreibungspläne in Haben. [Private Kfz-Nutzung](anlagen.md#private-nutzung-von-firmenwagen) und [Abgänge](anlagen.md#abgang) kommen nicht per CSV mit. Der Anlagenimport selbst bucht nichts; die Eröffnung entsteht erst mit der ersten AfA-Buchung ([CSV-Import](csv-import.md#was-der-import-bucht-nichts)).

### Artikel, falls benötigt

Übertrage Artikelnummer, Bezeichnung, Einheit, Preis und Steuersatz in die [Artikelfelder](csv-import.md#artikel). Ordne den Preis bewusst als netto oder brutto zu; der Steuersatz ist Pflicht. Prüfe nach der Übernahme einen häufig verwendeten Artikel in einer neuen Rechnung, bevor du sie festschreibst.

## 4. Offene Posten und erste Zahlungen klären

Erstelle zum 31.12. eine Liste der noch offenen Ausgangsrechnungen und Eingangsbelege mit Originalnummer, Datum, Kontakt, Steuerangaben, Gesamtbetrag, bisherigen Zahlungen und offenem Rest. Beziehe auch Dezemberrechnungen ein, die erst im Januar bezahlt werden. Halte Teilzahlungen mit ihrem tatsächlichen Datum fest.

Die WISO-Kontaktliste und die Buchungsdateien liefern derzeit keinen importierbaren offenen Posten. Die Übernahme unter **Archiv › Umzug › Offene Posten übernehmen** setzt bereits eingelesene Belegdatensätze voraus.

Kläre vor der ersten Zahlung mit der Steuerberatung, wie diese Posten in Haben erfasst und ausgeglichen werden, besonders bei Teilzahlungen und schon berücksichtigter Vorsteuer. Lege keine alte Rechnung als neue Leistung an und erfinde keine Zahlung für den bereits in WISO bezahlten Teil. Die [Grenzen freier Buchungen](buchhaltung.md#manuelle-und-freie-buchungen) gelten auch beim Umzug: Eine Journalbuchung ersetzt keinen offenen Posten im Nebenbuch.

Die laufenden Werte entstehen aus der Buchhaltung in Haben; [EÜR](auswertungen.md#eür-nach-zufluss-und-abfluss) und [Voranmeldung](umsatzsteuer.md#wie-die-kennzahlen-entstehen) rechnen aus dem Journal.

## Vor dem endgültigen Wechsel

- [ ] Rechtsform und Gewinnermittlung passen zu Haben; offene Einschränkungen sind geklärt.
- [ ] WISO-Jahres-AfA gebucht, endgültiges Anlagenverzeichnis ausgegeben und Originale getrennt gesichert.
- [ ] Kontakte einschließlich Land, Anlagen einschließlich Dubletten und Erinnerungswert sowie benötigte Artikel geprüft.
- [ ] Offene Posten und deren Behandlung bei den ersten Zahlungen geklärt.
- [ ] Erste Bankumsätze, Rechnungsnummern, AfA-Pläne und Auswertungen kontrolliert.
- [ ] Zugriff auf die alten Daten und Originalbelege bleibt für Nachfragen und Prüfungen erhalten.

Grundlage der WISO-Hinweise: [anonymisierte Exportbeispiele](https://github.com/user-attachments/files/34634518/01_WISO_Beispieldateien_anonymisiert_2026-11-10.zip), [Rückmeldung zu AfA und Länderfeld](https://github.com/Speicherstadt/haben/issues/565#issuecomment-6802857673) und [Klärung zum Jahreswechsel](https://github.com/Speicherstadt/haben/issues/565#issuecomment-6808458708).
