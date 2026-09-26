# Spike tecnico: adapter locali Claude Code e Codex

**Stato:** contratto runtime comune e vertical slice Claude verificati; `ordo agent codex` è fixture-tested e ha superato uno smoke test end-to-end reale non-mutante con `codex-cli 0.157.0` sull'installazione/login locale. La matrice completa versioni/OS e capability non è ancora validata.
**Data verifica:** 25 settembre 2026.
**Decisione proposta:** Claude Code tramite CLI locale in modalità headless/streaming; Codex tramite app-server locale su stdio, dietro due adapter distinti e un contratto Ordo comune. Nessuna chiamata diretta alle API dei modelli.

## Obiettivo e limiti

Verificare quali interfacce ufficiali permettono all’app Electron/VS Code-based di avviare e controllare agenti già installati e autenticati sulla macchina dello sviluppatore. Il requisito è lasciare login, credenziali, accesso al modello e relativo billing ai rispettivi prodotti/harness; Ordo orchestra il workflow condiviso, trasmette il contesto approvato e registra l’esecuzione.

Il vertical slice `ordo agent claude` è ora stato verificato anche contro Claude Code NVM v2.1.282 con login Pro, senza `ANTHROPIC_API_KEY`: su un repository scratch ha restituito una risposta, session ID nativo e usage, senza creare file fuori da `.ordo/`. La prova non certifica la matrice OS/versioni, approvazioni interattive, sandbox, resume, errori/timeout o uso Codex. Le credenziali sono rimaste gestite da Claude Code; Ordo non le legge né le persiste.

## Evidenze ufficiali

### Claude Code

La documentazione corrente presenta l’Agent SDK come libreria che esegue il binario Claude Code e offre agent loop, strumenti, permessi, sessioni, hooks, MCP e streaming. La stessa documentazione distingue il CLI per sviluppo interattivo/task da terminale dall’SDK per incorporare l’agente in un’applicazione. Indica inoltre che un prodotto terzo non deve offrire il login claude.ai o i relativi rate limits senza approvazione preventiva; il quickstart dell’SDK usa autenticazione via API key. Perciò l’SDK non è il percorso predefinito per Ordo, che vuole riutilizzare l’installazione/login Claude Code dell’utente e non gestire chiavi API.

Il CLI supporta modalità headless (`-p`), output `json` e `stream-json`, input streaming, limiti di turni, selezione di permission mode e tool consentiti/vietati, nonché continuazione/ripresa sessione. La modalità `--dangerously-skip-permissions` non va usata come impostazione standard. Il flusso esatto d’approvazione interattiva dentro l’interfaccia Ordo va provato: headless e `--permission-prompt-tool` non equivalgono automaticamente a un dialogo di approvazione nativo controllabile da Ordo.

Fonti: [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage).

### Codex

Il repository ufficiale definisce `codex app-server` come interfaccia per esperienze ricche, inclusa l’estensione Codex per VS Code. Il protocollo usa JSON-RPC bidirezionale su JSONL/stdio (trasporto stdio predefinito) e contempla lifecycle di thread/turn, notifiche di eventi e richieste server→client, incluse approvazioni. Le linee guida correnti del repository dichiarano che il nuovo sviluppo API avviene su app-server v2, non v1. L’interfaccia è quindi più adatta del solo `codex exec` a una UI desktop che deve mantenere sessioni, mostrare eventi e rispondere alle richieste di approvazione.

`codex exec` resta una possibile opzione ridotta per automazioni headless/CI e per un primissimo smoke test; non va assunto equivalente al controllo interattivo persistente richiesto dall’editor. Ordo deve avviare il binario locale e lasciargli usare la sua configurazione/account; non deve integrare l’Agents API ospitata né implementare un loop OpenAI diretto.

Fonti: [Codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [Codex command approval request](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/CommandExecutionRequestApprovalParams.ts), [command approval decisions](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/CommandExecutionApprovalDecision.ts), [file-change approval request](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/FileChangeRequestApprovalParams.ts), [permission approval request](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/PermissionsRequestApprovalParams.ts), [permission grant response](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/PermissionsRequestApprovalResponse.ts), [Codex protocol development guidance](https://github.com/openai/codex/blob/main/AGENTS.md).

## Confronto sintetico

| Aspetto | Claude Code | Codex | Conseguenza per Ordo |
|---|---|---|---|
| Entry point consigliato | CLI locale headless/streaming | app-server locale stdio, protocollo v2 | Due adapter concreti, una UX Ordo |
| SDK/harness | Agent SDK riusa binario e funzioni Claude Code, ma documenta autenticazione API per embedding di terze parti | app-server è già interfaccia client per esperienze ricche | Evitare di imporre una nuova API key o login Ordo |
| Streaming | Output strutturato e `stream-json` disponibili | Notifiche JSON-RPC / eventi di thread e turn | Normalizzare testo, lifecycle, errori, richieste di approvazione |
| Sessioni | Continue/resume via sessione CLI; confermare gestione persistente concreta | Thread persistenti con start/resume e turn separati | Mappare ID nativi senza confonderli con session ID/task ID Ordo |
| Permessi | Permission mode e allow/deny; integrazione UI delle richieste da verificare | Approval request/response nel protocollo | Nessun bypass; UI comune con adattamento per capability |
| Uso/token/costo | SDK espone tracking cost/usage, copertura CLI da misurare | campi/eventi disponibili secondo metodo/versione | Usage è capability opzionale e può mancare/non essere confrontabile |
| Contesto condiviso Ordo | Prompt/context e configurazione/MCP Claude; limite dimensione/format da provare | instructions e tool/MCP tramite app-server | Manifest immutabile con hash; non dichiarare controllato ciò che l’harness aggiunge |
| Cancellazione/crash | Abort del processo/sessione da verificare in spike runtime | Interrupt RPC e lifecycle disponibili | Cancel comune best-effort, stato terminale esplicito |

## Decisione proposta

1. **Non riutilizzare `ModelProvider` / `runSessionTurn()` come adapter agent.** Nel repository questi tipi rappresentano un loop Ordo che invia direttamente richieste a provider API e invoca i propri tools. È concettualmente diverso dal delegare un task a Claude Code o Codex, che possiedono già agent loop, strumenti, policy, sessioni e autenticazione. I package `ordo-provider-*` sono transitori e non sono la base dell’integrazione richiesta.
2. **Aggiungere un’interfaccia `AgentAdapter` distinta dal catalog/content `OrdoAdapter`.** Gli adapter correnti `packages/adapter-claude` e `packages/adapter-codex` rilevano/installano/mappano contenuti per i layout degli harness; non eseguono sessioni. Rinominare o documentare i concetti per evitare collisioni semantiche.
3. **Prima implementazione: Claude CLI locale.** Avvio senza shell injection, cwd esplicita, input/output strutturati e streaming quando supportato dalla versione rilevata; preservare le credenziali locali. Non passare `--dangerously-skip-permissions`; tradurre le capability mancanti in “non disponibile”. Non basare l’autenticazione su chiavi copiate in `.ordo/`.
4. **Prima implementazione Codex UI: app-server v2 locale su stdio.** Negoziare/validare la versione protocollo, mantenere una sola sessione del processo per connessione, correlare richieste JSON-RPC e richieste di approvazione, propagare interrupt e riconciliare stato dopo disconnessione. L’interfaccia WebSocket è descritta come sperimentale/non supportata, quindi non usarla come default.
5. **Contract comune conservativo.** Normalizzare `started`, `text-delta`, `activity/tool`, `approval-requested`, `usage` (facoltativo), `completed`, `failed`, `cancelled`; conservare un envelope nativo redatto per diagnostica e l’ID nativo. Capability esplicite: streaming, resume, interrupt, approvals, structured output, usage, MCP, worktree/sandbox. Ogni evento/evento nativo deve essere attribuito e versionato.
6. **Il contesto comune è un manifest Ordo leggibile e hashato**, non una promessa che i due harness usino identico system prompt o strumenti. Registrare commit/branch, task/spec/plan step approvato, agent/skill/regole selezionati, scope file, policy, istruzioni inviate, versione CLI/protocollo e capability effettive. Segnalare differenze e contesto aggiuntivo non osservabile.
7. **Isolamento e approvazioni restano gate di prodotto.** L’adapter non può indebolire le policy dell’harness. Ordo applica in proprio scope/diff checks e verifiche; una capability assente non può essere simulata. La prima prova non autorizza esecuzione autonoma senza approvazione.

## Contratto runtime iniziale implementato

```ts
interface AgentAdapter {
  readonly id: 'claude-code' | 'codex'
  detect(options: { command?: string; cwd: string }): Promise<AgentInstallation>
  run(options: {
    command?: string
    cwd: string
    prompt: string
    signal?: AbortSignal
    onEvent?: (event: AgentEvent) => void | Promise<void>
  }): Promise<{ text: string; nativeSessionId?: string; exitCode: number }>
}

interface AgentInstallation {
  readonly id: 'claude-code' | 'codex'
  readonly command: string
  readonly version: string
  readonly capabilities: {
    streaming: boolean
    usage: boolean
    cancellation: boolean
    resume: boolean
    'approval-requests': boolean
  }
}
```

Il contratto e `AgentAdapterRegistry` sono in `packages/runtime/src/agent-adapter.ts`. Claude normalizza testo, ID sessione, usage e risultato. Codex avvia `codex app-server`, negozia JSON-RPC, crea un thread/turno, normalizza testo e thread ID, e invia `turn/interrupt` all'annullamento. Il 25 settembre 2026, con `codex-cli 0.157.0`, `ordo agent codex` ha completato uno step reale in un repository scratch: profilo condiviso, spec pronta, piano, snapshot di business context, prompt che vietava strumenti e modifiche, risposta attesa ricevuta in streaming, thread/capability registrati nell'audit Ordo, sessione `completed` e step `paused` per revisione umana. Il test ha operato fuori dal repository di Ordo e lo scratch è stato eliminato; il thread nativo resta nella cronologia locale Codex. Il runtime inoltra richieste di approvazione per comando, modifica file e permessi sandbox a un handler asincrono e invia risposte protocol-native. `ordo agent codex` mostra una conferma CLI per singola operazione, default deny senza TTY/handler e audit JSONL; i comandi sono rappresentati tramite hash, non salvati in chiaro. Sono esposti solo allow una tantum e deny; le escalation permessi accettate valgono per il turno corrente, mai per tutta la sessione. Usage affidabile e resume restano esplicitamente non supportati; altri metodi server→client (es. elicitation) vengono rifiutati fail-closed. Il pannello approval Electron e la validazione reale di operazioni approvabili restano da completare.

## Piano di validazione successivo

Le prove reali coprono Claude Code autenticato con account Pro e `ordo agent codex` end-to-end su uno scratch con Codex locale. Non certificano la matrice capability/versioni/OS seguente:

- documentare versioni minime e OS supportati; rilevare binario, versione e stato login senza leggere/esportare token;
- [x] avviare un task innocuo che non modifica file, verificare output, session ID, usage ed exit code contro il binario Claude NVM installato;
- [x] interrompere via SIGINT in fixture, verificando chiusura del processo figlio e stato Ordo paused con exit code 130;
- [x] smoke test non-mutante Codex end-to-end sull'installazione locale `codex-cli 0.157.0`: setup scratch di profilo/spec/piano/context, esecuzione `ordo agent codex`, risultato/streaming, thread e capability nell'audit, sessione completata e step in review-paused; scratch eliminato dopo le verifiche;
- [ ] misurare resume nativo, timeout, errori di rete e crash contro installazioni reali;
- provare una richiesta di approvazione e dimostrare allow, deny, timeout e comportamento senza UI;
- verificare come passare manifest, agenti, skill, regole e server MCP senza modificare configurazioni globali;
- misurare se token/costo sono disponibili e distinguere `unknown` da zero;
- aggiungere contract fixtures registrate e redatte, test di compatibilità/version negotiation e una matrice Linux/macOS/Windows;
- soltanto dopo il superamento del test, selezionare il vertical slice e rimuovere gradualmente il runtime direct-provider transitorio.
