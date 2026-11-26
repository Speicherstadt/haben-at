# Haben AT: was hier anders gilt

Dieses Repository ist Haben AT, die österreichische Fassung von [Haben](https://github.com/Speicherstadt/haben). Es gelten alle Regeln von Haben (`CLAUDE.md`, `docs/entwicklung.md`, `docs/mitwirken.md`, `DESIGN.md`). Wo diese Datei etwas anderes sagt, geht sie vor.

## Grundsatz: nur eigene Pakete

Haben AT unterscheidet sich von Haben nur durch eigene österreichische Pakete und eigene neue Dateien. Alles andere ist der Stand von Haben und kommt per Merge aus `Speicherstadt/haben`. So läuft jeder Merge von Haben ohne Konflikte.

Erlaubt sind nur diese Abweichungen von Haben:

- Pakete `packages/at` und `packages/at-*`, etwa für FinanzOnline, den EKR oder ebInterface
- eigene Workflows `.github/workflows/at-*`
- diese Datei und die Warnung oben in `README.md`

Muss eine Änderung eine andere Datei anfassen (Code, Doku, Skill, `CLAUDE.md`, `AGENTS.md`, Migration oder Konfiguration von Haben), fehlt in Haben eine Nahtstelle: eine Stelle, an der Haben das Deutsche hinter eine Schnittstelle legt, die ein österreichisches Paket ebenso erfüllen kann. Typisch sind das Einbinden eines Länderpakets, Steuerland, Kontenrahmen, Übermittlung, ein weiteres Rechnungsformat, Felder an Kontakt oder Beleg sowie Tabellen und Migrationen eines Pakets. Nicht im Fork um die deutsche Stelle herumbauen und nichts „vorläufig“ hier ändern. Ein Fehler im gemeinsamen Teil wird ebenfalls in Haben behoben.

## Abweichungen prüfen

Vor dem Bauen überlegen, welche Dateien die Änderung braucht; vor jedem Push und in jedem Review (`beitrag-pruefen`, `tdd-review`) nachsehen:

```sh
git fetch -q https://github.com/Speicherstadt/haben main
git diff --name-only "$(git merge-base FETCH_HEAD HEAD)" HEAD \
  | grep -vE '^(packages/at(-[^/]+)?/|\.github/workflows/at-[^/]+$|\.claude/rules/haben-at\.md$|README\.md$)'
```

Keine Ausgabe: in Ordnung (bei `README.md` nur die Warnung oben). Dieselbe Prüfung läuft bei jedem Pull Request als Workflow `.github/workflows/at-abweichungen.yml`; ändert sich die Liste, beide zusammen ändern. Jede Zeile ist eine Datei von Haben, die der Fork ändert: im Review ein Befund, bei der eigenen Arbeit die Änderung zurücknehmen und die Nahtstelle in Haben bauen.

## Nahtstelle in Haben bauen

1. Issue in `Speicherstadt/haben` nach dem Skill `issue-schreiben`: welches Issue in Haben AT es braucht (Link), Skizze der Schnittstelle (TypeScript-Typ, Paket oder Modul), wie die deutsche Umsetzung dahinter wandert, was ein österreichisches Paket liefert. Bedingung: für deutsche Nutzer ändert sich nichts, bestehende Tests bleiben unverändert grün. Issues nur anlegen, wenn die Person, für die du arbeitest, das will; vor dem Bauen auf die Rückmeldung des Maintainers von Haben warten.
2. In einem Clone von `Speicherstadt/haben`, nicht hier (in einer Cloud-Session mit `add_repo`): die deutsche Umsetzung als eigenes Modul oder Paket hinter die Schnittstelle legen, ohne ihr Verhalten zu ändern. Je Nahtstelle ein kleiner Pull Request nach den Skills `beitrag` und `checks`. Das Einbinden gehört dazu: Haben wählt die Umsetzung über eine Einstellung oder ein Register, sodass Haben AT nur sein Paket und einen Konfigurationswert ergänzt.
3. Nach dem Merge in Haben holt der Maintainer von Haben AT den Stand mit einem Merge (`git fetch upstream && git merge upstream/main`), nie mit Rebase oder Squash. Erst dann entsteht die österreichische Umsetzung unter `packages/at*`, mit eigenen Tests für die österreichischen Regeln.

## Issues, Pull Requests, Skills

- Österreichisches (UVA, EKR, ebInterface, GISA, Kleinunternehmer nach österreichischem UStG …): Issue und Pull Request in `Speicherstadt/haben-at`. Nahtstelle oder Fehler im gemeinsamen Teil: in `Speicherstadt/haben`.
- Keine Releases und keine Container-Images, bis Haben AT für die echte Buchhaltung taugt.
- Die Skills von Haben gelten hier mit `Speicherstadt/haben-at` als Repository, außer `release` (siehe oben), `board-pflegen` (siehe nächster Punkt) und `jahreswerte` (deutsche Werte kommen mit dem Merge, österreichische gehören in die AT-Pakete).
- Das Board von Haben AT ist das [Project „Roadmap Haben AT“](https://github.com/orgs/Speicherstadt/projects/7), Nummer 7. Das Board von Haben (Nummer 3) nie von hier aus ändern. Wo Skills, Doku und Vorlagen aus Haben Project 3 oder „Roadmap“ nennen, gilt hier Nummer 7. Für `board-pflegen` heißt das:
    - in jedem Befehl 7 statt 3 und `Speicherstadt/haben-at` statt `Speicherstadt/haben`; jedes `gh issue` und `gh pr` mit `--repo Speicherstadt/haben-at` (mit dem Remote `upstream` nimmt `gh` sonst Haben), in GraphQL-Abfragen `haben-at` als Repository.
    - Nummern in `git log` sind meist die von Haben und kein Beleg für „Erledigt“.
    - Das Feld „Bereich“ leer lassen und keine Labels setzen oder vermissen, bis der Maintainer sie für Haben AT festgelegt und angelegt hat.
    - Solange `PROJECT_TOKEN` fehlt, reagiert `/übernehmen` nicht und keine Karte rückt durch den Workflow „Board“ nach: zuweisen sowie „In Arbeit“ und „Im nächsten Release“ nach OK des Maintainers von Hand setzen.
- Die Automatik von Haben (`scripts/board/projekt.ts`) nimmt die Nummer aus der Variable `BOARD_NUMMER` des Repositorys; hier steht sie auf `7`. Ohne die Variable bricht sie in Haben AT ab, statt auf Board 3 zu schreiben. Das Secret `PROJECT_TOKEN` erst setzen, wenn `BOARD_NUMMER` gesetzt ist.
