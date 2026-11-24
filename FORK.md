# Haben AT: was hier anders gilt

Haben AT ist die österreichische Fassung von [Haben](https://github.com/Speicherstadt/haben). Es gelten alle Regeln von Haben (`CLAUDE.md`, `docs/entwicklung.md`, `docs/mitwirken.md`, `DESIGN.md`). Wo diese Datei etwas anderes sagt, geht sie vor.

## Grundsatz: nur eigene Pakete

Haben AT unterscheidet sich von Haben nur durch eigene österreichische Pakete und eigene neue Dateien. Alles andere ist der Stand von Haben und kommt per Merge aus `Speicherstadt/haben`. So läuft jeder Merge von Haben ohne Konflikte, und Verbesserungen fließen in beide Richtungen.

Erlaubt sind nur diese Abweichungen von Haben:

- Pakete `packages/at` und `packages/at-*`, etwa für FinanzOnline, den EKR oder ebInterface
- eigene Skills `.claude/skills/at-*` und eigene Workflows `.github/workflows/at-*`
- diese Datei und die Warnung oben in `README.md`

Muss eine Änderung eine andere Datei anfassen (Code, Doku, Skill, Migration oder Konfiguration von Haben), fehlt in Haben eine Nahtstelle: eine Stelle, an der Haben das Deutsche hinter eine Schnittstelle legt, die ein österreichisches Paket ebenso erfüllen kann. Die Nahtstelle kommt nach Haben, nicht in diesen Fork; erst danach baut Haben AT dagegen. Typisch sind das Einbinden eines Länderpakets, Steuerland, Kontenrahmen, Übermittlung, ein weiteres Rechnungsformat, zusätzliche Felder an Kontakt oder Beleg sowie Tabellen und Migrationen eines Pakets. Ein Fehler im gemeinsamen Teil wird ebenfalls in Haben behoben.

## Issues und Pull Requests

- Österreichisches (UVA, EKR, ebInterface, GISA, Kleinunternehmer nach österreichischem UStG …): Issue und Pull Request in `Speicherstadt/haben-at`.
- Nahtstelle oder Fehler im gemeinsamen Teil: Issue mit kurzer Skizze, dann Pull Request in `Speicherstadt/haben`, nach den Regeln von Haben. Für deutsche Nutzer ändert sich nichts, die bestehenden Tests bleiben unverändert grün.
- Updates von Haben holt der Maintainer von Haben AT mit einem Merge (`git fetch upstream && git merge upstream/main`), nie mit Rebase.
- Keine Releases und keine Container-Images, bis Haben AT für die echte Buchhaltung taugt.

## Skills

Die Skills von Haben gelten hier mit `Speicherstadt/haben-at` als Repository, außer:

- `release`: nicht verwenden, siehe oben.
- `board-pflegen`: pflegt das Board von Haben, nicht hier.
- `jahreswerte`: die deutschen Werte kommen mit dem Merge von Haben; österreichische Jahreswerte gehören in die AT-Pakete.
- `beitrag-pruefen` und `tdd-review`: zusätzlich prüfen, dass der Pull Request nur erlaubte Dateien ändert (Skill `at-nahtstelle`, Schritt 1).

Eigene Skills von Haben AT:

- `at-nahtstelle`: vor jeder Änderung und in jedem Review prüfen, ob sie nur AT-Pakete berührt, und sonst die fehlende Nahtstelle in Haben bauen.
