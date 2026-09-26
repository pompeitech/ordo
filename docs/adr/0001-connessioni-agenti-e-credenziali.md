# ADR-0001 — Connessioni agli agenti e credenziali

- **Stato:** accettata, 25 settembre 2026
- **Responsabile:** Davide D'Antonio
- **Revisione:** prima della beta chiusa (Fase 9), insieme alla review legale dei termini dei fornitori
- **Ambito:** Ordo Desktop, estensione `packages/vscode-ordo`, runtime `packages/runtime`, CLI `ordo agent`

## Contesto

Ordo delega l'esecuzione esclusivamente a Claude Code e Codex (§2 invariante 11 e §7 della [roadmap](../ordo-roadmap.md)). Per farlo dal desktop bisogna decidere come arrivano gli harness sulla macchina e con quali credenziali girano.

Fatti verificati il 25 settembre 2026:

- Nel Code OSS compilato, i provider Claude e Codex dell'Agent Host si registrano solo se lo SDK è raggiungibile: override via env var oppure `product.agentSdks`. Upstream popola `agentSdks` con URL della CDN Microsoft (`main.vscode-cdn.net`), cioè un servizio pensato per i prodotti Microsoft. Il `product.json` di Ordo non ha `agentSdks`, quindi l'app pacchettizzata non registra nessuno dei due.
- `@anthropic-ai/claude-agent-sdk` è software proprietario ("All rights reserved"). Secondo i [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) di Anthropic, preinstallare o eseguire Claude Code in un prodotto richiede i Commercial Terms. Il binario non va modificato, ogni utente si autentica con credenziali proprie, e le terze parti non possono offrire il login claude.ai né raccogliere o intermediare credenziali claude.ai. Chi sviluppa con l'Agent SDK deve usare API key.
- `@openai/codex` è Apache-2.0.
- Il runtime di Ordo (`claude-code.ts`, `codex-app-server.ts`) avvia già direttamente i binari `claude` e `codex`, senza SDK.
- `claude auth status --json` espone `loggedIn`, `authMethod` e `apiProvider`. Con `ANTHROPIC_API_KEY` nell'ambiente riporta `authMethod: api_key`.
- `codex login status` scrive lo stato su stderr. `codex app-server` (0.157.0) **ignora** `CODEX_API_KEY`/`OPENAI_API_KEY` nell'ambiente (`account/read` → `requiresOpenaiAuth`). Dopo `codex login --with-api-key` riporta invece `account: apiKey`.
- Il riferimento UX è Knotic: "AI Connections" con path dell'eseguibile opzionale, stato e Recheck. Le credenziali restano alla CLI.

## Decisione

1. **Harness installati dall'utente.** Ordo esegue solo i `claude` e `codex` installati sulla macchina. Il path assoluto è opzionale; se manca, si cerca nel PATH. Ordo non include né scarica SDK, il `product.json` resta senza `agentSdks` e non si usa la CDN Microsoft.
2. **Non autenticato = non funziona.** Prima di ogni esecuzione Ordo verifica la connessione, che può risultare non trovato, non autenticato o connesso. Se non è "connesso" si ferma con l'istruzione da seguire. Non ci sono fallback silenziosi tra metodi né login costruiti da Ordo.
3. **API key solo per autenticare le CLI** (opzione B). Ordo **non** chiama le API dei modelli: il vincolo di prodotto del §7 resta invariato.
   - **Claude Code:** la chiave Anthropic dell'utente sta nel portachiavi del sistema (`SecretStorage`). Viene passata come `ANTHROPIC_API_KEY` al solo processo `claude`, e solo se la CLI non è loggata e `claude auth status` conferma che la accetta. Il login della CLI vince sempre.
   - **Codex:** la chiave OpenAI viene consegnata una sola volta, via stdin, al comando ufficiale `codex login --with-api-key`. Codex la conserva e Ordo non ne tiene copia. Per uscire si usa `codex logout`.
4. **Impostazioni con scope `machine`** (`ordo.claudeCode.path`, `ordo.codex.path`): un repository non può cambiarle con `.vscode/settings.json`. Nessun endpoint configurabile.
5. **Mai:** login claude.ai dentro Ordo; lettura o copia di token e file di credenziali delle CLI; credenziali in `.ordo/`, nei log o in Git; pagamento o rivendita dell'uso. I marchi compaiono solo come testo ("esegue Claude Code").
6. Il trasporto proxy Copilot del provider Claude di Code OSS (token GitHub e `@vscode/copilot-api`) va disattivato con una patch downstream dedicata.

## Alternative considerate

- **A — API dirette Anthropic/OpenAI per le funzioni Ordo:** scartata perché contraddice il §7 e la Fase 3 ("non aggiungere provider diretti"). I pacchetti `ordo-provider-*` restano il prototipo transitorio da dismettere.
- **`agentSdks` verso la CDN Microsoft:** scartata; è un servizio destinato ai prodotti Microsoft e ridistribuirebbe copie dello SDK secondo accordi che non sono i nostri.
- **SDK Claude incluso o su una CDN Ordo:** rimandata. Richiede l'accettazione formale dei Commercial Terms e non serve, visto che il runtime avvia il binario dell'utente.
- **Solo eseguibili, nessuna API key in Ordo:** valida e più semplice, ma non copre chi usa Claude Code solo con API key senza configurarla a mano.

## Conseguenze

- Il flusso esecutivo passa dagli adapter del runtime Ordo e non dai provider dell'Agent Host di Code OSS. Nello smoke, `ORDO_AGENT_SDK_ROOT` resta uno strumento di sviluppo.
- L'uso di un abbonamento Pro/Max tramite il login di Claude Code funziona senza che Ordo tocchi credenziali. Resta però una zona grigia rispetto alla regola sull'Agent SDK: non va promosso come opzione supportata senza una conferma scritta di Anthropic.
- Il comportamento dipende dai comandi di stato delle CLI (formato JSON di Claude, testo su stderr di Codex). Le versioni minime vanno fissate nella matrice della Fase 4.

## Evidenze

- `packages/runtime/src/connection.ts` e `test/connection.test.mjs`: stati, fallback della chiave, login Codex via stdin, nessuna credenziale nei risultati.
- `packages/cli/test/agent.test.mjs`: harness non loggato → nessuna sessione creata, step `pending`.
- `packages/vscode-ordo/src/connections.ts` e `test/connections.test.mjs`.
- Verifiche manuali con Claude Code 2.1.282 e codex-cli 0.157.0 in directory di configurazione temporanee, con chiavi finte e senza toccare credenziali reali.
