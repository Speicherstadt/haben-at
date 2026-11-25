import { createRouter } from "@tanstack/react-router";
import { NichtGefunden, SeitenFehler } from "./components/Fehlerseiten.tsx";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: NichtGefunden,
    defaultErrorComponent: SeitenFehler,
    // Jede Seite entsteht je Pfad-Parameter neu: Beim Wechsel zu einem anderen Eintrag (etwa über die Schnellsuche) gehören
    // Formular, Meldungen und Rückfragen sonst weiter zum vorigen (#1839, #1843). Suchparameter wie ?jahr= lassen die Seite stehen
    defaultRemountDeps: ({ params }) => params,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
