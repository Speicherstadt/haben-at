---
name: "at-nahtstelle"
description: "In Haben AT vor jeder Änderung, in jedem Review und wenn eine Datei außerhalb von packages/at* geändert werden müsste: prüfen, ob nur AT-Pakete berührt sind, und sonst die fehlende Nahtstelle zuerst in Speicherstadt/haben bauen."
---

# Nahtstelle statt Umbau im Fork

Der Grundsatz steht in `FORK.md`: Haben AT weicht von Haben nur in eigenen Paketen und eigenen neuen Dateien ab. Was sonst geändert werden müsste, kommt als Nahtstelle nach Haben.

## 1. Abweichungen von Haben prüfen

Vor dem Bauen überlegen, welche Dateien die Änderung braucht; vor jedem Push und in jedem Review nachsehen:

```sh
git fetch -q https://github.com/Speicherstadt/haben main
git diff --name-only "$(git merge-base FETCH_HEAD HEAD)" HEAD \
  | grep -vE '^(packages/at(-[^/]+)?/|\.claude/skills/at-[^/]+/|\.github/workflows/at-[^/]+$|FORK\.md$|README\.md$)'
```

Keine Ausgabe: in Ordnung (bei `README.md` nur die Warnung oben). Jede Zeile ist eine Datei von Haben, die der Fork ändert. Im Review ist das ein Befund. Bei der eigenen Arbeit die Änderung dort zurücknehmen und weiter mit Schritt 2.

## 2. Nahtstelle in Haben vorschlagen

Nicht im Fork um die deutsche Stelle herumbauen und nichts „vorläufig“ hier ändern, bis Haben so weit ist.

1. Issue in `Speicherstadt/haben` nach dem Skill `issue-schreiben` von Haben. Darin: welches Issue in Haben AT es braucht (Link), die Skizze der Schnittstelle (TypeScript-Typ, in welchem Paket oder Modul sie liegt), wie die deutsche Umsetzung dahinter wandert und was ein österreichisches Paket liefert. Bedingung nennen: für deutsche Nutzer ändert sich nichts, bestehende Tests bleiben unverändert grün.
2. Auf die Rückmeldung des Maintainers von Haben warten, bevor gebaut wird. Issues nur anlegen, wenn die Person, für die du arbeitest, das will.

## 3. Nahtstelle in Haben bauen

1. In einem Clone von `Speicherstadt/haben`, nicht in Haben AT. In einer Cloud-Session das Repository mit `add_repo` hinzufügen.
2. Die deutsche Umsetzung hinter die Schnittstelle legen, als eigenes Modul oder Paket, ohne ihr Verhalten zu ändern. Je Nahtstelle ein kleiner Pull Request nach den Skills `beitrag` und `checks` von Haben.
3. Das Einbinden gehört zur Nahtstelle: Haben wählt die Umsetzung über eine Einstellung oder ein Register, sodass Haben AT nur sein Paket und einen Konfigurationswert ergänzt und keinen Import in Code von Haben.

## 4. Danach in Haben AT

Nach dem Merge in Haben holt der Maintainer von Haben AT den Stand (`git merge upstream/main`). Erst dann entsteht die österreichische Umsetzung im Paket unter `packages/at*` gegen die neue Schnittstelle, mit eigenen Tests für die österreichischen Regeln. Schritt 1 zeigt danach wieder keine Ausgabe.
