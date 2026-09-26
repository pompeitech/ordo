# ADR-0002 — Ordo come estensione VS Code, prima di un'app desktop

- **Stato:** accettata, 25 settembre 2026
- **Responsabile:** Davide D'Antonio
- **Revisione:** quando un cliente o un requisito chiede qualcosa che un'estensione non può fare
- **Sostituisce in parte:** la "Decisione di prodotto" del §8 della [roadmap](../ordo-roadmap.md) (Ordo Desktop su Code OSS come destinazione)

## Contesto

La roadmap prevedeva Ordo Desktop come distribuzione autonoma di Code OSS con Ordo integrato. Lo spike ([spike-code-oss.md](../spike-code-oss.md)) ha prodotto una `.app` macOS con patch downstream (esclusione di Copilot), l'estensione preinstallata e un tema predefinito.

Nel frattempo tutte le funzioni Ordo sono state costruite dentro `packages/vscode-ordo`, un'estensione VS Code standard:
- pagina a tutta larghezza con menu a schede;
- requisiti e piani;
- profilo di team con proposte in base allo stack;
- connessioni a Claude Code e Codex, con i consumi del piano.

Nessuna di queste funzioni dipende dalle patch del fork, perché l'esecuzione passa dalle CLI installate dall'utente ([ADR-0001](0001-connessioni-agenti-e-credenziali.md)) e non dall'Agent Host di Code OSS.

Il mercato conferma entrambe le strade: Kiro (AWS) è un fork di Code OSS, Traycer è un'estensione VS Code, e GitHub Spec Kit è CLI più template. Il valore distintivo di Ordo sta nel governo di team (profilo condiviso, contesto business, audit) e nella neutralità fra Claude Code e Codex, non nell'editor.

## Decisione

1. **Ordo si distribuisce come estensione VS Code** con identità `pompeitech.ordo`, su VS Code Marketplace e Open VSX, accanto alla CLI `ordo`. L'estensione impacchettata (`pnpm --filter ordo package` → `ordo.vsix`) contiene il catalogo `content/` di Ordo.
2. **Lo spike Ordo Desktop (Code OSS) è congelato:** patch, script e documentazione restano nel repository come evidenza, ma non si investe in packaging, firma, updater o pipeline multi-OS.
3. **Il tema non fa parte di Ordo:** il tema Lava sarà un'estensione separata Pompei Tech. La palette resta in [theme.md](../theme.md).
4. L'estensione usa solo API stabili di VS Code, così funziona anche negli editor basati su VS Code che installano da Open VSX. La compatibilità con ciascun editor va verificata prima di dichiararla.

## Alternative considerate

- **Continuare con Ordo Desktop:** controllo totale del workbench e un prodotto a marchio proprio, ma con costi alti e continui: riallineamento a upstream e patch di sicurezza, firma e notarizzazione, updater, build per ogni sistema operativo, nessun marketplace Microsoft. In cambio non abilita funzioni che oggi servono.
- **Solo CLI più template** (come Spec Kit): più leggero, ma perde l'interfaccia per profilo, revisione delle modifiche e stato degli agenti, che sono parte del valore per i team.

## Conseguenze

- Tutto ciò che Ordo fa oggi resta com'è. Si perdono solo le cose legate al prodotto desktop: app con marchio proprio, esclusione di Copilot dal build (in VS Code Copilot resta una scelta dell'utente), controllo del primo avvio e del layout, e tema predefinito.
- L'apertura a tutta pagina chiude la sidebar anche nel VS Code dell'utente: è un comportamento da rivalutare con feedback reale.
- Pubblicare richiede un publisher `pompeitech` registrato su Marketplace e Open VSX, e un'icona PNG del marketplace. Sono azioni del responsabile, non automatiche.
- Se in futuro serve un ambiente chiuso per clienti enterprise, lo spike è il punto di ripartenza e va rivalidato da un checkout pulito.

## Evidenze

- `ordo.vsix` creato con `@vscode/vsce` 3.9.2 senza avvisi: 78 file, 349 KB.
- Installato in VS Code 1.138 con profilo isolato come `pompeitech.ordo@0.1.0`. Sul progetto demo ha caricato requisiti e piani (log `Ordo`: `Project snapshot loaded: … specs=2 … plans=1`).
- Suite di test del workspace verde; test dell'estensione in `packages/vscode-ordo/test/`.
