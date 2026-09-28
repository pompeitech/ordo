# Ordo — Guida completa

*Versione della guida: 26 settembre 2026 · Estensione VS Code `pompeitech.ordo` 0.1.0 · Lingua: italiano ([English version](ordo-guide.md))*

Questa guida spiega **tutto** quello che fa Ordo, **come** lo fa e **come usarlo ogni giorno**, da soli e in team. Ogni funzione è descritta nel dettaglio e seguita da esempi concreti. Se qualcosa non è scritto qui, Ordo non lo fa: i limiti attuali sono elencati nel capitolo 14.

---

## Indice

1. [Cos'è Ordo, in una pagina](#1-cosè-ordo-in-una-pagina)
2. [Concetti chiave](#2-concetti-chiave)
3. [Installazione e primo avvio](#3-installazione-e-primo-avvio)
4. [La pagina Ordo e la navigazione](#4-la-pagina-ordo-e-la-navigazione)
5. [Overview](#5-overview)
6. [Workflow: pipeline e replay](#6-workflow-pipeline-e-replay)
7. [Eseguire uno step con un agente (Run)](#7-eseguire-uno-step-con-un-agente-run)
8. [Code review del lavoro dell'agente](#8-code-review-del-lavoro-dellagente)
9. [Requirements, Plans, Decisions, Sessions, Chat](#9-requirements-plans-decisions-sessions-chat)
10. [Team profile](#10-team-profile)
11. [AI connections e consumo del piano](#11-ai-connections-e-consumo-del-piano)
12. [Lavorare in team](#12-lavorare-in-team)
13. [Giornate tipo: esempi quotidiani](#13-giornate-tipo-esempi-quotidiani)
14. [Limiti attuali](#14-limiti-attuali)
15. [Risoluzione dei problemi](#15-risoluzione-dei-problemi)
16. [Riferimenti: comandi, impostazioni, file, CLI](#16-riferimenti-comandi-impostazioni-file-cli)
17. [Glossario](#17-glossario)

---

## 1. Cos'è Ordo, in una pagina

Ordo è un'estensione di VS Code, con una CLI gemella, che mette **ordine nel lavoro fatto con gli agenti di codice** (Claude Code e Codex) quando si lavora in team.

Senza Ordo, ognuno chiede cose all'agente nella propria chat. Il perché di una modifica si perde, non si sa quale agente ha fatto cosa, chi l'ha approvata e quanto è costato, e le regole del team vivono nella testa delle persone.

Con Ordo:

- **I requisiti, le decisioni e i piani sono file** nella cartella `.ordo/` del repository, versionati con Git come il codice. Chiunque nel team, e ogni agente, parte dalla stessa base.
- **Il lavoro segue un flusso fisso e visibile:** esplorazione → specifica → architettura → piano → implementazione → (verifica, review, registrazione). Ordo mostra dove si trova ogni requisito e **cosa lo blocca**.
- **Gli agenti eseguono uno step alla volta** di un piano approvato, con il contesto e le regole del team. Ordo non ha un proprio modello: usa il Claude Code o il Codex che hai installato, con il tuo account.
- **Dopo ogni step dell'agente decide una persona:** vede i file cambiati nel diff editor, tiene o annulla ogni file, poi approva, chiede modifiche o blocca.
- **Puoi chattare con Claude Code o Codex** direttamente nella pagina Ordo, e passare dall'uno all'altro a ogni messaggio. La chat è in sola lettura e resta privata, sulla tua macchina.
- **Tutto resta registrato:** chi ha deciso cosa e quando, quale agente ha lavorato e quanti token ha speso. Il **replay** ripercorre la storia di ogni requisito.

> **In una frase:** Ordo è il "sistema di record" del lavoro con gli agenti. Gli agenti eseguono, le persone decidono, e tutto è tracciato in Git.

### Cosa Ordo *non* fa

- Non chiama modelli di intelligenza artificiale per conto suo e non ha un servizio online: tutto resta sulla tua macchina e nel tuo repository.
- Non conserva le credenziali di Claude o di ChatGPT. Il login resta alle loro CLI; per le API key vedi il capitolo 11.
- Non fa commit né push al posto tuo.
- Non fa lavorare gli agenti senza una specifica approvata e un piano.

---

## 2. Concetti chiave

Leggi questo capitolo una volta: tutto il resto ne dipende.

### 2.1 Requisito (specifica, "spec")

È la descrizione di **cosa** va fatto e **perché**, scritta per il business e per gli sviluppatori. È un file Markdown in `.ordo/specs/<id>.md` con queste sezioni:

- obiettivo, non-obiettivi e attori;
- requisiti e vincoli;
- **criteri di accettazione** e rischi.

Ha uno **stato**:

| Stato | Significato |
|---|---|
| `draft` | Bozza: si può ancora cambiare. Gli agenti **non** possono lavorarci. |
| `ready` | Approvata dal business: gli agenti possono eseguirne il piano. |
| `implemented` | Implementata. |
| `verified` | Verificata. |
| `superseded` | Sostituita da un'altra spec. |

L'`id` si ricava dal titolo: "Safe checkout" diventa `safe-checkout`.

### 2.2 Esplorazione (brainstorm)

Serve **prima** della spec, quando la soluzione non è ovvia. Contiene il problema, le ipotesi, le domande aperte e **più alternative**, ognuna con benefici, compromessi e rischi. Una persona **sceglie** un'alternativa e la **"cristallizza"** in una spec. File: `.ordo/explore/<id>.json`.

Esempio: il problema "i pagamenti non validi arrivano nel database" ha due alternative:

- "Validare prima del salvataggio" (compromesso: più latenza);
- "Riconciliare di notte" (compromesso: ordini sbagliati visibili per ore).

Si sceglie la prima, e nasce la spec "Safe checkout".

### 2.3 Proposta architetturale

Spiega **come** implementare una spec: aree toccate, componenti, contratti, decisioni e rischi. Nasce `proposed` e diventa `approved` solo con un'approvazione umana esplicita. File: `.ordo/architectures/<id>.json`.

### 2.4 Piano e step

Il **piano** scompone una spec in **step** piccoli e verificabili. Ogni step ha:

- una descrizione;
- l'output atteso;
- i comandi di verifica (per esempio `pnpm test`);
- facoltativamente, le **dipendenze** (uno step parte solo quando quelli da cui dipende sono completati o saltati).

File: `.ordo/plans/<id>.json`.

Stati di uno step:

| Stato | Significato |
|---|---|
| `pending` | In attesa. Se le dipendenze sono soddisfatte è **pronto** e compare **Run**. |
| `running` | Un agente ci sta lavorando. In un piano può esserci un solo step `running` alla volta. |
| `paused` | L'agente ha finito (o è stato fermato): **aspetta la review di una persona**. |
| `completed` | Approvato in review. |
| `blocked` | Bloccato in review. |
| `error` | L'esecuzione è fallita. |
| `skipped` / `cancelled` | Saltato o annullato. |

### 2.5 Sessione

Ogni esecuzione di un agente crea una **sessione** in `.ordo/sessions/`:

- `<uuid>.json` contiene titolo, stato, profilo usato e snapshot del contesto;
- `<uuid>.jsonl` è il **registro degli eventi**: la richiesta completa inviata all'agente, il testo di risposta, le richieste di permesso, i token, le foto dei file.

### 2.6 Contesto del progetto e memoria

È ciò che l'agente riceve oltre alla spec:

- **`.ordo/brain.md`**, la memoria del progetto: vocabolario, invarianti di dominio, decisioni durevoli;
- i **documenti di contesto** registrati in `.ordo/context/index.json`, per esempio `docs/business.md`. Ognuno può essere visibile (inviato agli agenti) o nascosto.

A ogni esecuzione Ordo fotografa il contesto in uno **snapshot immutabile** (`.ordo/context/snapshots/`), così si sa sempre esattamente cosa ha ricevuto l'agente.

### 2.7 Profilo di team

Il file `.ordo/profile.json` dice quali **agenti, skill, regole e workflow** del catalogo il team usa, e con quale "forza" (capitolo 10). È condiviso in Git: vale per tutti.

**Catalogo** è l'insieme dei contenuti disponibili: agenti come `tdd-guide` e `code-reviewer`, skill come `fastify-patterns` e `testing`, regole come `common-security`, workflow come `implement`. Arriva dalla cartella `content/` del repository o, se non c'è, da quella inclusa in Ordo.

### 2.8 Audit

Ogni creazione e ogni cambio di stato scrive una riga in `.ordo/audit/<tipo>/<id>.jsonl`, con:

- **cosa** è cambiato (da → a);
- **quando**;
- **chi**: il nome in `git config user.name`, oppure `ORDO_ACTOR`;
- **che tipo di attore**: 👤 persona, 🤖 agente o ⚙️ Ordo stesso.

È un registro *append-only*: si aggiunge, non si modifica.

### 2.9 Harness

Claude Code o Codex: il programma che fa davvero il lavoro sul codice. Ordo li chiama "harness".

---

## 3. Installazione e primo avvio

### 3.1 Requisiti

| Cosa | Perché | Come verificarlo |
|---|---|---|
| VS Code 1.104 o superiore | L'estensione lo richiede | *Code → About* |
| Git | Il diff della code review si basa su Git | `git --version` |
| Claude Code e/o Codex, installati **e con login fatto** | Sono loro a eseguire gli step | `claude --version` e poi `claude` → `/login`; `codex --version` e `codex login` |
| Un repository Git con il tuo progetto | `.ordo/` vive lì | `git status` |

Ordo funziona anche senza nessun agente installato: requisiti, piani, profilo e replay restano disponibili. Solo **Run** richiede un agente connesso.

### 3.2 Installare l'estensione

Ordo non è ancora sul Marketplace. Si installa dal pacchetto `.vsix`:

```sh
# nel repository di Ordo
pnpm install
pnpm --filter ordo package          # crea packages/vscode-ordo/ordo.vsix
code --install-extension packages/vscode-ordo/ordo.vsix
```

In alternativa, dalla vista Extensions di VS Code: menu `…` → **Install from VSIX…** → scegli `ordo.vsix`.

Apri poi il tuo progetto e, se VS Code lo chiede, **concedi la fiducia al workspace**: Ordo non funziona in modalità ristretta.

### 3.3 Installare la CLI (facoltativa ma utile)

Alcune operazioni oggi si fanno solo da terminale: esplorazioni, proposte architetturali, piani con più step. Nel repository di Ordo:

```sh
pnpm -r build
alias ordo="node $PWD/packages/cli/dist/bin.js"   # mettilo nel tuo ~/.zshrc
ordo --help
```

### 3.4 Preparare un progetto la prima volta

Esempio completo su un progetto esistente, `checkout-service`:

1. **Apri Ordo:** clic sull'icona **Ordo** nella barra delle attività di sinistra. Si apre la pagina Ordo.
2. **Contesto condiviso:** in **Overview**, se compare **Set up shared context**, cliccalo. Ordo crea `.ordo/brain.md` e `.ordo/context/index.json` e apre `brain.md` accanto. Scrivici le cose che ogni agente deve sapere, per esempio:
   ```markdown
   # Project memory
   - Un ordine non esiste finché il pagamento non è validato.
   - Le API rispondono 422 con un campo "reason" per gli errori di validazione.
   - Mai loggare numeri di carta o CVV.
   ```
3. **Documenti di contesto** (facoltativo): per far ricevere agli agenti un documento come `docs/business.md`, da terminale: `ordo context add docs/business.md`.
4. **Profilo di team:** **Team profile** → **Create with N suggestions** (vedi 10.2). Poi imposta **un agente come `Default`**, per esempio `tdd-guide`, e premi **Save profile**. Senza un agente predefinito, Run non parte (vedi 14).
5. **Connessioni:** **AI connections** → verifica che Claude Code e/o Codex risultino **Connected**.
6. **Committa `.ordo/`** con un messaggio chiaro, per esempio `chore: set up Ordo for the team`, e apri una pull request, così il team lo riceve.

### 3.5 Provare tutto con la demo

Dal repository di Ordo:

```sh
pnpm ordo:demo         # crea /tmp/ordo-demo e apre un VS Code separato con Ordo già installato
pnpm ordo:demo:clean   # chiude quel VS Code e cancella la demo
```

La demo contiene:

- un requisito ("Safe checkout") che ha già percorso quasi tutto il flusso, con una review che ha chiesto modifiche, una riesecuzione e uno step in attesa di review;
- un requisito in bozza ("Order audit trail");
- un'esplorazione aperta ("Faster product search").

Il comando stampa i passi da mostrare. Le esecuzioni degli agenti della demo sono **simulate**; tutto il resto passa dal core vero di Ordo.

---

## 4. La pagina Ordo e la navigazione

### 4.1 Aprire Ordo

- **Icona Ordo** nella barra delle attività: apre la pagina Ordo come scheda dell'editor e **chiude la barra laterale**, così la pagina prende tutta la larghezza. Se preferisci tenere la barra laterale aperta, disattiva l'impostazione `ordo.closeSidebarOnOpen`.
- **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
  - **Ordo: Open Ordo** apre la pagina;
  - **Ordo: Open Chat** apre la chat;
  - **Ordo: Open Workflow and Replay** apre la scheda Workflow;
  - **Ordo: Open Team Profile** apre la scheda Team profile;
  - **Ordo: Open AI Connections** apre la scheda AI connections.

### 4.2 Il menu laterale della pagina

| Gruppo | Scheda | A cosa serve |
|---|---|---|
| Project | **Overview** | Colpo d'occhio sul progetto |
| Project | **Chat** | Domande a Claude Code o Codex sul progetto, in sola lettura (9.5) |
| Project | **Workflow** | Dove si trova ogni requisito, azioni successive, Run, code review, replay |
| Project | **Requirements** | Le specifiche |
| Project | **Plans** | I piani di implementazione |
| Project | **Decisions** | Esplorazioni e proposte architetturali |
| Project | **Sessions** | Le esecuzioni degli agenti |
| Configuration | **Team profile** | Agenti, skill, regole e workflow del team |
| Configuration | **AI connections** | Claude Code e Codex: stato, credenziali, consumi |

Accanto alle voci compaiono:

- un **numero**: quanti elementi ci sono;
- un **pallino colorato** per lo stato: 🟢 tutto a posto, 🟡 qualcosa da fare, 🔴 problema.

In **Workflow** il pallino giallo significa "c'è qualcosa che aspetta una persona".

La pagina **ricorda l'ultima scheda aperta**. Sotto i 720 pixel di larghezza il menu si sposta in alto. I file che apri dalla pagina (spec, piani, diff) si aprono **accanto**, e la pagina resta visibile.

### 4.3 Aggiornamento automatico

La pagina si aggiorna da sola quando:

- salvi un file in `.ordo/`;
- lavori da terminale: `ordo agent`, `ordo plan review`, e un watcher osserva `.ordo/`;
- cambi le impostazioni di Ordo.

Il pulsante **Refresh** in alto a destra forza l'aggiornamento.

---

## 5. Overview

Cosa mostra, dall'alto:

1. **Nome del repository** e pulsante **Refresh**.
2. **Azioni rapide:**
   - **New business requirement** crea una spec (vedi 9.1);
   - **Create implementation plan** crea un piano (vedi 9.2);
   - **Set up shared context** compare solo se il contesto non esiste ancora.
3. **Quattro numeri cliccabili:** Requirements, Plans, Decisions (esplorazioni più proposte architetturali) e Sessions. Il clic apre la scheda relativa.
4. **Card "Team profile"**, con il riepilogo, per esempio *"10 agents · default tdd-guide · 4 skills · 5 required rules"*, e il pulsante per aprire il profilo. Se il profilo non esiste, invita a crearlo.
5. **Card "AI connections & plan usage"**: per ogni agente lo stato (Connected / Not logged in / Not found) e, se connesso, le barre di consumo del piano (vedi 11.4).
6. **Card "Project memory"**: quanti documenti di contesto sono visibili o nascosti, e il pulsante **Open brain.md**.

**Esempio quotidiano:** la mattina apri Ordo e in Overview vedi che Codex è al 97% della quota settimanale. Decidi di usare Claude Code per gli step di oggi.

---

## 6. Workflow: pipeline e replay

È la scheda più importante. Ha tre parti:

- il **pannello** in alto, per Run e code review (capitoli 7 e 8);
- la **pipeline**;
- il **replay**.

### 6.1 La pipeline

Una **riga per ogni requisito**, più una riga per ogni esplorazione non ancora cristallizzata. Le colonne sono le 8 fasi del flusso, sempre nello stesso ordine:

`brainstorm → spec → architect → plan → implement → verify → review → record`

Ogni cella ha un simbolo:

| Simbolo | Stato | Significato |
|---|---|---|
| ✓ | done | Fase completata |
| ◐ | in progress | In corso |
| ✕ | blocked | Bloccata: qualcosa impedisce di andare avanti |
| (vuoto) | not started | Non ancora iniziata |
| – | skipped | Fase facoltativa saltata (per esempio, spec scritta senza esplorazione) |
| · | not available yet | Fase non ancora implementata in Ordo |

Passando il mouse su una cella vedi il riepilogo e il motivo del blocco.

Sotto il titolo di ogni riga vedi i **token** usati dagli agenti per quel requisito, per esempio *"69,000 tokens + 1 not measured"*.

Sotto ogni riga c'è la **riga di dettaglio**: la fase attuale, cosa sta succedendo, **cosa la blocca** e un **pulsante con l'azione successiva**.

#### Come Ordo calcola ogni fase

Queste regole sono le stesse che applicano la CLI e il motore: interfaccia e terminale dicono sempre la stessa cosa.

| Fase | Regola |
|---|---|
| **brainstorm** | ✓ se il requisito nasce da un'esplorazione cristallizzata; – se la spec è stata scritta direttamente. Un'esplorazione non ancora cristallizzata ha una riga sua, con brainstorm ◐. |
| **spec** | ◐ se è `draft` (in attesa dell'approvazione del business); ✓ se è `ready`, `implemented` o `verified`; – se è `superseded`; ✕ se il file non è valido. |
| **architect** | ✓ se c'è una proposta `approved`; ◐ se c'è una proposta `proposed` in attesa di approvazione; – se il team ha pianificato senza proposta; ✕ se la spec non è ancora `ready`. |
| **plan** | ✓ se esiste un piano; ◐ se il piano è in bozza; vuoto se non c'è. |
| **implement** | ✕ senza piano, se la spec non è `ready`, se uno step è fallito o bloccato in review, o se nessuno step è pronto per via delle dipendenze. ◐ se uno step è in corso o in attesa di review, o se una parte degli step è completata. ✓ quando tutti gli step sono completati o saltati. |
| **verify** | ✓ solo se la spec è `verified`; altrimenti "non ancora disponibile". |
| **review**, **record** | Non ancora disponibili come fasi a sé. La review oggi avviene **durante** il lavoro, dopo ogni step (capitolo 8). |

#### Le azioni successive

| Pulsante | Cosa fa |
|---|---|
| **Mark ready** | Chiede conferma ("è l'approvazione di business, registrata con il tuo nome"), poi porta la spec a `ready`. |
| **Approve architecture** | Chiede conferma e approva la proposta. |
| **Create plan** | Avvia la creazione guidata del piano (9.2). |
| **Run "<step>"** | Apre il pannello Run (capitolo 7). |
| **Review step** | Apre il pannello di code review (capitolo 8). |
| **Propose architecture**, **Add an alternative**, **Select an alternative**, **Crystallize into a spec** | Oggi si fanno da terminale: Ordo mostra il comando esatto con **Copy command**. |

**Esempio:** la riga "Order audit trail" dice *"spec: Draft · Waiting for business approval to mark it ready"* con il pulsante **Mark ready**. La product manager legge la spec, clicca **Mark ready** e conferma. La spec passa a `ready`, e nella colonna architect il blocco sparisce.

### 6.2 Il replay

**Clicca una riga** (il requisito) e sotto la pipeline compare il **Replay**: la storia completa di come quel requisito è arrivato fin lì.

**In alto, i numeri:** quanti eventi, quante **👤 decisioni umane**, quante **🤖 esecuzioni di agenti**, quanti token in totale (più le esecuzioni non misurate).

**La striscia delle fasi:** le 8 fasi come riquadri collegati da frecce. Durante il replay si **accendono** man mano che la storia le raggiunge; la fase dell'evento corrente è evidenziata. In ogni riquadro vedi quante decisioni umane ci sono state (👤 2) e quanti token si sono spesi (60k tok).

**I comandi:**

- **⏮** torna all'inizio;
- **▶ / ⏸** avvia o mette in pausa, con un evento ogni 0,7 secondi;
- **⏭** va alla fine;
- la **barra da scorrere** porta a un punto preciso; l'etichetta mostra "evento 7 / 23 · 25 set 20:10".

**I filtri:** *All*, *👤 Human decisions* (solo le decisioni delle persone) e *🤖 Agent runs* (solo le esecuzioni).

**La linea del tempo:** ogni evento ha un'icona e una categoria.

| Icona | Categoria | Esempi |
|---|---|---|
| 👤 | Decisione umana | Alternativa scelta, spec `draft → ready`, architettura approvata, review di uno step |
| 🤖 | Agente | "claude-code 2.1.282 worked on "validate"" con i token e le approvazioni dei permessi |
| ⚙️ | Ordo | "validate" in attesa di review (pausa automatica a fine esecuzione) |
| • | Attività | Spec creata, piano creato, alternativa proposta, esecuzione avviata |

Dettagli che compaiono sotto gli eventi:

- **"not chosen: Reconcile afterwards (Invalid orders are visible for hours)":** le alternative scartate, con i loro compromessi.
- **"kept 2 file(s) · undone: README.md":** cosa la review ha tenuto e cosa ha annullato.
- **"42,000 tokens · most tokens":** l'esecuzione più costosa del requisito, evidenziata.
- **"tokens not measured":** l'agente non ha comunicato i token. Oggi succede con Codex.
- **"from the artifact, time approximate":** eventi di requisiti creati prima che esistesse il registro di audit. L'ora è quella dell'ultimo aggiornamento del file.

**Esempio quotidiano:** il tech lead chiede "perché abbiamo validato in modo sincrono?". Apri il replay di "Safe checkout", filtri *Human decisions* e vedi:

- l'alternativa scelta da Davide il 12 settembre, con l'alternativa scartata e il suo compromesso;
- l'architettura approvata da Marco il 14 settembre, con la decisione "Validate synchronously before persistence".

Nessuna ricerca nelle chat.

---

## 7. Eseguire uno step con un agente (Run)

### 7.1 Quando compare Run

Il pulsante **Run "<step>"** compare nella riga di dettaglio quando **tutte** queste condizioni sono vere:

- la spec è `ready`;
- il piano esiste e uno step è **pronto**: `pending`, con le dipendenze completate;
- nessun altro step dello stesso piano è `running`.

### 7.2 Il pannello Run, passo per passo

Clicca **Run "logging"**: il pannello **Run step "logging"** si apre in cima alla scheda Workflow.

1. **Agent:** un pulsante per ogni agente, **Claude Code** e **Codex**, con versione e modalità di login. Un agente non connesso è **grigio** e dice perché, per esempio *"Codex is installed but not logged in. Run `codex login`…"*. Il primo agente connesso è selezionato in automatico.
2. **Stima di ciò che Ordo invierà.** Appena scegli l'agente, Ordo prepara la richiesta **senza avviare nulla** e mostra:
   - *"Ordo will send ~6,000 tokens before the agent reads any code"*;
   - una **barra** divisa per parti, con la legenda: *Specification and plan step ~200 · Project context ~120 · Profile instructions ~5,650*;
   - la **selezione della sessione**: *Agent: tdd-guide · Skills: … · Rules: common-security, …*.

   La stima conta circa 4 caratteri per token, quindi è approssimata; i token reali li comunica l'agente e compaiono poi nel replay. Se qualcosa impedisce l'esecuzione (spec non `ready`, profilo da rivedere, nessun agente predefinito, contesto assente) vedi l'errore **qui**, prima di partire.
3. **Additional instruction (optional):** una nota per l'agente valida solo per questa esecuzione, per esempio *"Usa il logger esistente in src/logger.ts"*.
4. **Start:** avvia l'agente. Da qui:
   - il testo dell'agente **scorre nel pannello** in diretta;
   - se Codex chiede un permesso (per esempio eseguire `npm test`), compare nel pannello un riquadro *"Codex asks: …"* con il comando, la cartella e il motivo, e i pulsanti **Allow once** e **Decline**. Ogni permesso vale solo per quella richiesta. Se chiudi la pagina mentre c'è una richiesta aperta, Ordo la **rifiuta**;
   - **Stop** interrompe l'agente.
5. **Fine:** il pannello diventa automaticamente la **code review** di ciò che l'agente ha cambiato (capitolo 8).

### 7.3 Cosa fa Ordo dietro le quinte

Il comportamento è identico a `ordo agent`, perché il codice è lo stesso:

1. Controlla i cancelli: spec `ready` e valida, piano valido e collegato alla spec, step pronto, agente installato e con login, profilo valido, contesto presente.
2. Crea una **sessione** e mette lo step in `running`.
3. **Fotografa i file** del progetto (vedi 8.4).
4. Registra nel manifest della sessione cosa invia: spec, step, snapshot del contesto, agente, skill, regole, impronta della richiesta e **stima dei token**.
5. Avvia l'agente nella cartella del progetto, con i **tuoi** permessi e il **tuo** account.
6. Registra tutti gli eventi: testo, token, permessi chiesti e decisi.
7. A fine esecuzione **fotografa di nuovo** i file e mette lo step in **pausa per la review**. Per Ordo "l'agente ha finito" **non** significa "approvato".

Se interrompi con **Stop**, lo step va comunque in pausa e quanto l'agente ha cambiato fino a quel momento resta rivedibile. Se l'esecuzione fallisce, lo step passa a `error` (vedi 14).

### 7.4 Esempio quotidiano

Sono le 10:00. Nella pipeline, su "Safe checkout", compare **Run "logging"**.

1. Clicchi, scegli **Claude Code** e leggi la stima: ~6.000 token, di cui 5.650 di istruzioni del profilo.
2. Aggiungi l'istruzione *"Non loggare mai l'intero oggetto order"* e premi **Start**.
3. Segui l'output mentre continui a fare altro; dopo due minuti il pannello diventa la code review.

---

## 8. Code review del lavoro dell'agente

### 8.1 Quando e da dove

Dopo ogni esecuzione lo step è `paused`, e nella pipeline compare **Review step**. La review si apre:

- **automaticamente**, alla fine di un Run avviato dalla pagina;
- con **Review step** nella riga di dettaglio della pipeline.

### 8.2 Il pannello, passo per passo

1. **Elenco dei file cambiati dall'agente.** Per ognuno:
   - una **casella**: spuntata = **tengo** il file, tolta = **lo annullo**;
   - il tipo: **A** aggiunto, **M** modificato, **D** cancellato;
   - le righe: `+2 −1`, oppure "binary";
   - il pulsante **Diff**: apre il file nel **diff editor di VS Code**, accanto alla pagina. A sinistra c'è la versione **prima** dell'esecuzione, a destra il file **com'è ora**. Il pannello resta dov'è.
2. **Decisione:**
   - **Approve**: lo step è fatto (`completed`) e i file tenuti restano come li ha lasciati l'agente;
   - **Request changes**: lo step torna **eseguibile** (`pending`, compare di nuovo Run); scrivi cosa deve cambiare;
   - **Block**: lo step si ferma (`blocked`); scrivi perché.
3. **Nota:** facoltativa per Approve, **obbligatoria** per Request changes e Block. Se manca, il pannello lo dice senza inviare nulla.
4. **Pulsante di invio.** Dice esattamente cosa farà: *"Submit review"* se tieni tutto, *"Undo 1 file and submit review"* se ne annulli uno.

**Cosa succede all'invio:**

1. I file tolti tornano alla versione di **prima** dell'esecuzione: un file aggiunto dall'agente viene cancellato, uno modificato o cancellato viene ripristinato.
2. La decisione viene registrata nell'audit con il tuo nome, la nota e l'elenco dei file **tenuti** e **annullati**.
3. Il replay mostra la review come 👤 decisione umana, con "kept N file(s) · undone: …".

### 8.3 Protezioni

- **Il tuo lavoro non viene mai sovrascritto.** Se dopo la fine dell'esecuzione hai modificato a mano un file che vuoi annullare, Ordo **non annulla niente** e il pannello elenca il file in conflitto. È "tutto o niente": o tutti i file scelti vengono annullati, o nessuno.
- **Si annullano solo file cambiati dall'agente** in quell'esecuzione, non altri.
- **Fuori da Git** l'esecuzione e la review funzionano, ma senza diff: il pannello lo dice e puoi comunque registrare la decisione.

### 8.4 Come funzionano le "foto" dei file

Prima e dopo ogni esecuzione Ordo crea una **foto** dei file del progetto: un oggetto "tree" di Git, costruito con un indice temporaneo.

- **Nessun commit** e **nessuna modifica al tuo stage**: `git status` e `git diff --cached` restano uguali.
- I file **non tracciati** sono inclusi; quelli **ignorati** (`.gitignore`) e la cartella `.ordo/` sono esclusi.
- Ogni foto è protetta da un riferimento locale `refs/ordo/snapshots/<sessione>-before|after`, così Git non la cancella in pulizia. Questi riferimenti **non vengono inviati** con un normale `git push`.
- Il diff confronta le due foto: se avevi già modifiche tue non committate **prima** dell'esecuzione, **non** compaiono tra quelle dell'agente.

> **Conseguenza importante:** la code review con diff si fa **sulla macchina dove è girato l'agente**, perché le foto sono locali. Il replay (chi ha deciso cosa, quali file sono stati tenuti o annullati) è invece visibile a tutti tramite Git.

### 8.5 Esempio quotidiano

L'agente doveva scrivere i messaggi di errore, ma ha anche "migliorato" il `README.md` scrivendo *"Now with AI-powered payments!"*.

1. Nel pannello tieni `src/checkout.ts` e `src/errors.ts`, dopo averne aperto il **Diff** per controllarli.
2. Togli la spunta a `README.md` e lasci **Approve**.
3. Premi **Undo 1 file and submit review**.

Il README torna com'era, lo step è completato, e nel replay resta scritto "kept 2 file(s) · undone: README.md".

Se invece il codice fosse stato sbagliato: scegli **Request changes**, scrivi *"Manca il test sul CVV corto"* e invia. Lo step torna eseguibile, e il prossimo Run lo riprende.

---

## 9. Requirements, Plans, Decisions, Sessions, Chat

### 9.1 Requirements: creare un requisito

**New business requirement** (in Overview o in Requirements), oppure *Ordo: Create Business Requirement*. VS Code ti fa alcune domande in sequenza:

| # | Domanda | Obbligatoria | Consiglio |
|---|---|---|---|
| 1 | Requirement title | sì | Breve e con un verbo: "Allow operators to refund orders" |
| 2 | Business outcome | sì | Cosa migliora per il cliente o il business |
| 3 | Actors | no | Chi è coinvolto: "Customer; Payment provider" |
| 4 | Business rules | no | Separa le regole con `;` |
| 5 | Functional requirements | no | Separa con `;` |
| 6 | Acceptance criteria | sì | Risultati **osservabili**, separati con `;` |
| 7 | Open questions | no | Dubbi da chiarire con il team |
| 8 | Constraints | no | Limiti tecnici, legali, operativi |

Il punto e virgola diventa un elenco puntato. Ordo crea `.ordo/specs/<id>.md` in stato `draft` e lo apre accanto: puoi rifinirlo a mano come qualsiasi Markdown.

**Esempio:**

- *Title:* "Refund an order"
- *Outcome:* "Customers get their money back within a day when an order is cancelled"
- *Acceptance criteria:* "A cancelled paid order creates a refund; The customer receives a confirmation email; Refunds appear in the daily report"

La scheda **Requirements** elenca tutte le spec con stato e obiettivo; il clic apre il file.

### 9.2 Plans: creare un piano

**Create implementation plan**, oppure *Ordo: Create Implementation Plan*:

1. scegli la **spec** dall'elenco;
2. il **titolo** del piano (proposto: "<spec> implementation");
3. il **primo step**: cosa fare, in modo circoscritto;
4. l'**output atteso** di quello step;
5. le **verifiche**, separate con `;` (per esempio `pnpm test; pnpm lint`).

Ordo crea `.ordo/plans/<id>.json` con **uno step** (`step-1`), che ha come input la spec, e lo apre accanto. Un piano esistente non viene mai sovrascritto: con lo stesso titolo ottieni un errore.

**Piani con più step e dipendenze:** oggi si creano da terminale.

```sh
ordo plan create --title "Refund implementation" --spec refund-an-order \
  --step '{"id":"model","description":"Add the refund model","expectedOutput":"Migration and model","verification":["pnpm test"]}' \
  --step '{"id":"api","description":"Expose POST /refunds","expectedOutput":"Endpoint with tests","dependsOn":["model"],"verification":["pnpm test"]}'
```

La scheda **Plans** mostra ogni piano con la sua spec, il numero di step e lo stato.

### 9.3 Decisions

Elenca le **esplorazioni** (problema e stato) e le **proposte architetturali** (spec collegata e stato). Il clic apre il file. Si creano da terminale:

```sh
ordo brainstorm create --title "Payment safety" --problem "Invalid payments reach the order store"
ordo brainstorm add payment-safety --title "Validate before persistence" \
  --summary "Reject invalid payments before saving" --tradeoff "Adds latency"
ordo brainstorm select payment-safety --alternative validate-before-persistence
ordo brainstorm crystallize payment-safety --acceptance "- Invalid cards are rejected"

ordo architect create --spec safe-checkout --title "Synchronous payment validation" \
  --impact "checkout API" \
  --component '{"name":"checkout","responsibility":"Validate payments","changes":["add PaymentValidator"]}' \
  --contract "POST /orders returns 422 for invalid payments" \
  --decision "Validate synchronously before persistence"
```

L'approvazione di una proposta si fa dalla pipeline (**Approve architecture**) oppure con `ordo architect approve <id>`.

### 9.4 Sessions

Elenca le esecuzioni degli agenti: titolo ("<piano>: <step>"), stato e, se presente, provider e modello. Il clic apre il file della sessione. Il registro completo degli eventi è accanto, nel file `.jsonl`.

### 9.5 Chat

La scheda **Chat** (oppure *Ordo: Open Chat*) è una conversazione con gli agenti che hai già installato, dentro la pagina Ordo.

**Cosa può fare l'agente:** solo **leggere e cercare** nel progetto. Non modifica file e non esegue comandi:

- Claude Code riceve solo i suoi strumenti `Read`, `Grep` e `Glob`, e tutto il resto viene negato senza chiedere;
- Codex lavora nella sua sandbox di sola lettura.

Se serve una modifica, l'agente te la mostra come frammento o diff. Per applicarla usa uno step di un piano, con la sua code review (capitoli 7 e 8).

**Com'è fatta la pagina:**

- **a sinistra** l'elenco delle chat, dalla più recente, con **New chat**;
- **in alto** i pulsanti **Claude Code | Codex**, per scegliere chi risponde. Un agente non connesso è grigio;
- **al centro** i messaggi, con l'ora e, per le risposte di Claude, i token usati;
- **in basso** il campo del messaggio. **Invio** manda il messaggio, **Maiuscolo+Invio** va a capo. Durante la risposta il pulsante diventa **Stop**;
- **Delete** in alto a destra cancella la chat, dopo una conferma nella pagina stessa.

La chat occupa tutta l'altezza della finestra: i messaggi scorrono e il campo resta in basso, crescendo mentre scrivi. In una finestra stretta l'elenco delle chat diventa un menu a tendina sopra la conversazione. Le risposte mostrano il Markdown: blocchi di codice, codice in linea, grassetto ed elenchi.

**Come funziona la continuità.** Ogni agente continua la **propria** conversazione con i meccanismi della sua CLI (una sessione di Claude Code, un thread di Codex). Quando continui con lo stesso agente, Ordo invia solo il nuovo messaggio.

**Passare da un agente all'altro.** Puoi cambiare agente a ogni messaggio, ma non mentre sta rispondendo. Se il nuovo agente non ha visto una parte della conversazione, la pagina lo dice prima dell'invio, per esempio: *"Codex has not seen 4 earlier messages: Ordo hands them over with your next message (~180 tokens)"*. Con il messaggio successivo Ordo gli passa la trascrizione di quei messaggi, una volta sola; poi prosegue nel suo thread. Le risposte fallite o interrotte non vengono passate.

Il nuovo agente riceve **ciò che vi siete detti**, non i file letti o il ragionamento interno dell'altro: se gli serve, li rilegge.

**Dove finiscono le chat.** Sono **personali**:

- stanno in `~/.local/state/ordo/chats/` (o `$XDG_STATE_HOME/ordo/chats/`, o `$ORDO_STATE_DIR/chats/`), in una cartella per progetto;
- i file sono leggibili solo da te;
- non vanno **mai** in `.ordo/` né in Git, e non compaiono nel replay.

Ogni messaggio usa il **tuo** piano Claude o ChatGPT (o la tua API key), come un Run.

**Se l'agente ha "dimenticato" la conversazione**, per esempio perché la sua CLI ha cancellato le sessioni vecchie, Ordo ne apre una nuova e gli passa tutta la trascrizione. Non devi fare nulla.

**Esempio quotidiano:**

1. Apri **Chat**, scegli **Claude Code** e chiedi *"Dove vengono validate le carte di credito?"*. Claude cerca nel codice e risponde: *"In `validateCard`, `checkout.js:2`: controlla solo che siano 16 cifre."*
2. Chiedi *"E una carta American Express da 15 cifre passa?"*: Claude continua la stessa conversazione.
3. Vuoi un secondo parere: clicchi **Codex**. La pagina dice che Codex non ha visto 4 messaggi (~180 token). Chiedi *"Ha senso aggiungere il controllo di Luhn lì?"*: Codex riceve la trascrizione e risponde nel merito.
4. Deciso cosa fare, scrivi il requisito (9.1) e fai lavorare l'agente con un piano, con la code review.

---

## 10. Team profile

### 10.1 A cosa serve

Decide, **per tutto il team**, quali contenuti del catalogo usano gli agenti:

| Scheda | Cosa contiene | Esempi |
|---|---|---|
| **Agents** | Ruoli con istruzioni specifiche | `tdd-guide`, `code-reviewer`, `architect` |
| **Skills** | Conoscenze da applicare | `fastify-patterns`, `testing`, `security-review` |
| **Rules** | Regole di codice | `common-security`, `typescript-testing` |
| **Workflows** | Procedure | `implement`, `review`, `plan` |

Ogni voce ha una **modalità**:

| Modalità | Per agenti | Per skill e regole |
|---|---|---|
| **Required** | L'**unico** agente ammesso | Applicata **sempre** |
| **Default** | Usato quando la sessione non ne sceglie un altro | Applicata **automaticamente** |
| **Recommended** | Suggerito, selezionabile | Suggerita |
| **Available** (`enabled`) | Selezionabile | Disponibile su richiesta |
| **Disabled** | Vietato | Vietata |

Per i **workflow**, tutti quelli non `Disabled` sono disponibili. Il workflow **`implement`** deve essere abilitato, altrimenti Run non parte.

Vincoli sugli agenti: al massimo **un** `Default` e al massimo **un** `Required`. Se un agente è `Required`, è anche quello predefinito. Finché un agente è `Required` non puoi cambiare gli altri: prima togli il `Required`.

### 10.2 Creare il profilo

Senza profilo, la scheda mostra **No team profile yet** e due possibilità:

- **Create with N suggestions** crea il profilo **e** mette in sospeso le proposte adatte al tuo progetto (10.4);
- **Create without suggestions**.

Il profilo nuovo parte così:

- tutti gli agenti `Available`;
- regole `common-*` `Required`, le altre `Recommended`;
- tutti i workflow `Available`;
- nessuna skill.

**Poi imposta un agente `Default`**: senza di lui, Run si ferma.

### 10.3 Modificare il profilo (modifiche in sospeso)

1. Scegli la scheda (Agents, Skills, Rules o Workflows). Puoi **filtrare** per nome o descrizione.
2. Cambia la modalità dal menu a tendina accanto alla voce. Le voci che non fanno parte del profilo mostrano "Not in profile".
3. Ogni modifica **non è ancora salvata**: compare nella **barra in basso** con l'elenco "da → a", per esempio *"Skills · fastify-patterns: not in profile → Recommended"*.
4. **Save profile** scrive `.ordo/profile.json`, applicando le modifiche nell'ordine mostrato. **Discard** le annulla tutte.

Cliccando il **nome** di una voce ne apri il contenuto, in anteprima Markdown accanto.

**"Every session starts with"** mostra cosa riceverà ogni sessione: agente predefinito (o obbligatorio), skill e regole applicate automaticamente, numero di workflow disponibili.

### 10.4 Proposte in base al progetto

Ordo legge il `package.json` del progetto e rileva le tecnologie: Fastify, Express, React, Next.js, MongoDB, TypeScript, Node.js, JavaScript, Vitest, Jest, Playwright, Vite. Poi propone:

- le **skill** che dichiarano quella tecnologia, come **Recommended**;
- le **regole** della cartella di quella tecnologia (per esempio `rules/fastify/`), come **Default**.

Ogni proposta mostra il **motivo**, per esempio *"fastify-patterns — Fastify (package:fastify)"*.

- **Add as …** aggiunge una proposta alle modifiche in sospeso; **Add all** le aggiunge tutte.
- Nulla cambia finché non premi **Save profile**.
- Non vengono riproposte le voci che il team ha già deciso, comprese quelle `Disabled` di proposito.
- Le skill generiche, come `testing` o `security-review`, non vengono proposte: si scelgono a mano.

### 10.5 Voci cambiate nel catalogo

Se il contenuto di una voce del catalogo cambia dopo che il profilo l'aveva registrata:

- la voce mostra **"changed in catalog"**;
- in alto compare **Needs review**.

Leggi il nuovo contenuto (clic sul nome), poi **Accept catalog update** e **Save profile**. Finché il profilo non è rivisto, **Run non parte**: così nessun agente usa istruzioni che il team non ha visto.

### 10.6 Esempio quotidiano

Il team decide che su questo progetto ogni sessione deve seguire la sicurezza. Il tech lead:

1. mette `security-review` a **Required**;
2. salva;
3. apre una pull request con il nuovo `.ordo/profile.json`.

Dopo il merge, ogni Run di chiunque nel team include quella skill.

---

## 11. AI connections e consumo del piano

### 11.1 Stato degli agenti

Per **Claude Code** e **Codex**, una scheda con:

- lo **stato**:
  - **Connected**: installato e con login fatto;
  - **Not logged in**: installato ma senza login; Ordo dice come fare (`claude` → `/login`, oppure `codex login`);
  - **Not found**: la CLI non si trova;
- la **versione** e il **metodo di accesso**, per esempio "Signed in via claude.ai" oppure "Using your Anthropic API key from the system keychain";
- **Recheck** per ricontrollare.

Ordo verifica il login con i comandi ufficiali delle CLI (`claude auth status`, `codex login status`) e legge **solo** stato e metodo: mai email, organizzazione o token.

> Regola fondamentale: **un agente senza login non può eseguire nulla.** Ordo non ha un login proprio e non passa in silenzio da un metodo all'altro.

### 11.2 Path dell'eseguibile

**Set executable path** permette di indicare un path **assoluto**, se la CLI non è nel `PATH` di VS Code; se lasci vuoto, Ordo la cerca nel `PATH`. Le impostazioni sono `ordo.claudeCode.path` e `ordo.codex.path`. Valgono solo per la tua macchina: un repository non può cambiarle.

### 11.3 API key (facoltative)

- **Claude Code — "Use Anthropic API key":** la chiave va nel **portachiavi del sistema** (macOS Keychain, Windows Credential Manager, libsecret su Linux). Ordo la passa **solo** al processo `claude`, e **solo** se Claude Code non ha già un login. Il costo va a chi possiede la chiave. **Remove key** la toglie.
- **Codex — "Log in with OpenAI API key":** Ordo consegna la chiave **una volta** al comando ufficiale `codex login --with-api-key`. Da quel momento la conserva **Codex**, non Ordo. Per toglierla: `codex logout` da terminale.

Ordo non chiama mai le API dei modelli per conto suo: la chiave serve solo ad autenticare la CLI dell'agente.

### 11.4 Consumo del piano (5 ore e settimana)

Per gli agenti connessi con un **abbonamento** (claude.ai o ChatGPT) vedi due barre: la **finestra di 5 ore** e quella **settimanale**. Per ciascuna: percentuale usata e ora del reset. La barra diventa **gialla** dall'80% e **rossa** dal 95%.

- **Codex:** dati **dal vivo**, letti dal suo `app-server`. Si aggiornano all'apertura, con Recheck e ogni 5 minuti.
- **Claude Code:** l'**ultimo valore visto** durante un'esecuzione avviata da Ordo, per esempio "Last seen 2 h ago during a Claude Code run". Prima della prima esecuzione compare "Shown after the next Claude Code run started from Ordo".
- **Con API key o cloud** (Bedrock, Vertex…) non ci sono finestre: Ordo scrive "Pay-as-you-go on your API key".

Questi dati sono **personali**: stanno in `~/.local/state/ordo/usage.json` (o `$XDG_STATE_HOME/ordo/usage.json`) sulla tua macchina, **mai** in `.ordo/` o in Git.

**Esempio quotidiano:** prima di un refactoring grosso guardi le barre. Claude è al 13% nelle 5 ore e al 80% nella settimana (reset sabato alle 19:00). Codex è al 97% settimanale. Fai il refactoring con Claude e tieni Codex per step piccoli.

---

## 12. Lavorare in team

### 12.1 Il principio

**Tutto ciò che conta per il team sta in `.ordo/` e passa da Git**, con pull request e review come il codice:

- spec, esplorazioni, architetture, piani;
- il profilo di team;
- il registro di audit;
- le sessioni.

**Ciò che è personale resta sulla tua macchina:** login e API key degli agenti, consumo del piano, foto dei file per la code review, **chat**.

### 12.2 Chi fa cosa

| Ruolo | Cosa fa in Ordo | Dove |
|---|---|---|
| **Product manager / business owner** | Scrive i requisiti; chiarisce le domande aperte; approva le spec (**Mark ready**) | Requirements, Workflow |
| **Tech lead / architetto** | Esplora alternative; propone e approva l'architettura; cura il profilo di team | Decisions (CLI), Workflow, Team profile |
| **Sviluppatore** | Crea i piani; esegue gli step con Claude Code o Codex; fa la code review di ogni step; porta il codice in pull request | Plans, Workflow (Run, Review) |
| **Reviewer** | Rivede le pull request con il replay a disposizione: vede perché ogni scelta è stata fatta | Workflow → Replay |

### 12.3 Il flusso di una funzionalità, dall'inizio alla fine

1. **PM:** *New business requirement* → spec `draft` → commit su un branch → **pull request** "spec: refund an order". Il team commenta nella PR.
2. **PM:** dopo il merge, **Mark ready** → commit (cambia la spec e il suo file di audit).
3. **Tech lead:** se serve, `ordo brainstorm …` per le alternative, poi `ordo architect create …` → pull request → **Approve architecture**.
4. **Sviluppatore:** *Create implementation plan* (o `ordo plan create` con più step) → commit.
5. **Sviluppatore:** **Run** sul primo step → **code review** nel pannello → *Approve* o *Request changes*. Ripete per ogni step.
6. **Sviluppatore:** commit del codice **insieme** ai file `.ordo/` aggiornati (piano, audit, sessioni) → pull request del codice.
7. **Reviewer:** rivede la PR; per capire il perché apre il **replay** del requisito.

### 12.4 Regole pratiche con Git

- **Committa `.ordo/` insieme al codice** che quel lavoro ha prodotto: la storia resta coerente.
- **Il registro di audit ha un file per artefatto** (`.ordo/audit/spec/<id>.jsonl`, …): due persone su requisiti diversi non vanno in conflitto. Se lavorate sullo **stesso** piano, coordinatevi. Ordo impedisce due step `running` nello stesso piano sulla stessa copia, ma non tra macchine diverse finché non vi sincronizzate con Git.
- **Le modifiche al profilo di team passano da pull request:** decidono le regole per tutti.
- **Le sessioni (`.ordo/sessions/`)** contengono la richiesta completa inviata all'agente (spec, contesto, istruzioni) e il suo testo di risposta. Servono al replay e all'audit, e il consiglio è committarle. Se il vostro contesto contiene informazioni che non volete in Git, decidetelo come team **prima** di iniziare: per esempio non mettete dati sensibili in `brain.md` o nei documenti di contesto.
- **La code review con diff si fa sulla macchina dove è girato l'agente** (8.4). Fatela prima di fare push.
- **Usate tutti la stessa versione di Ordo:** il profilo registra l'impronta dei contenuti del catalogo, e versioni diverse del catalogo fanno comparire "changed in catalog".

### 12.5 Ogni persona usa il proprio agente

Ognuno fa login con il **proprio** account Claude o ChatGPT, o usa la **propria** API key. Ordo non condivide credenziali e non paga l'uso di nessuno. Nel replay si vede quale agente (e quale versione) ha lavorato su ogni step.

---

## 13. Giornate tipo: esempi quotidiani

### 13.1 Lunedì mattina: arriva una nuova funzionalità

La PM chiede: "i clienti devono poter chiedere un rimborso".

1. La PM, in VS Code: **New business requirement** → titolo "Refund an order", outcome, tre criteri di accettazione separati da `;`. La spec è `draft`.
2. Apre una PR con la spec; lo sviluppatore commenta "cosa succede con ordini già spediti?" e lei aggiunge un criterio.
3. Dopo il merge: **Workflow** → riga "Refund an order" → **Mark ready**.
4. Il tech lead crea la proposta con `ordo architect create …` e la approva dalla pipeline.
5. Lo sviluppatore crea il piano con tre step.

Alle 12 la pipeline mostra "Refund an order" con spec ✓, architect ✓, plan ✓ e implement pronto con **Run "model"**.

### 13.2 Un fix veloce

Un bug piccolo: il 422 non contiene il motivo.

1. **New business requirement** con un solo criterio → **Mark ready**, se sei tu il responsabile.
2. **Create implementation plan** con un solo step e verifica `pnpm test`.
3. **Run** con Claude Code → review → **Approve** → commit.

In pipeline: brainstorm "–" e architect "–" (saltate, va bene per un fix), plan ✓, implement ✓.

### 13.3 L'agente ha fatto più del dovuto

Nel pannello di review vedi 5 file; uno è `package.json`, con una dipendenza nuova che nessuno aveva chiesto.

1. Apri **Diff** di `package.json` per conferma.
2. Togli la spunta a `package.json`, scegli **Request changes** e scrivi: *"Non aggiungere dipendenze: usa la libreria di validazione già presente"*.
3. Premi **Undo 1 file and submit review**.

Il file torna com'era. Lo step torna eseguibile; nel prossimo Run puoi ripetere l'indicazione in *Additional instruction*.

### 13.4 Uno step costa troppo

Nel replay vedi "42,000 tokens · most tokens" sul primo step, e la stima del Run diceva che ~94% della richiesta erano istruzioni del profilo.

1. In **Team profile** controlla quali regole e skill sono `Required` o `Default`: ognuna viene inviata a **ogni** sessione.
2. Sposta a `Recommended` quelle che non servono sempre.
3. Spezza lo step in step più piccoli.

Al prossimo Run la stima scende, e nel replay confronti i token.

### 13.5 Un collega nuovo nel team

1. Installa Ordo, fa login a Claude Code (`claude` → `/login`), apre il progetto.
2. In **AI connections** vede Claude Code **Connected**.
3. In **Workflow** vede subito cosa è in corso e cosa aspetta una persona.
4. Con il **replay** dei requisiti principali capisce le decisioni prese e perché, senza chiedere a nessuno.

Il profilo di team, già nel repository, gli dà le stesse regole di tutti fin dal primo Run.

### 13.6 "Perché questo requisito è fermo?"

In **Workflow**, la riga di dettaglio lo dice, per esempio:

- *"implement: 1/3 steps · Step "persist" is paused for human review"* → qualcuno deve fare la **Review step**;
- *"architect: … Waiting for human approval"* → il tech lead deve approvare;
- *"The specification must be ready before agents can run"* → la PM deve fare **Mark ready**.

### 13.7 Capire il codice prima di scrivere un requisito

La PM chiede se "i rimborsi parziali sono difficili". Prima di rispondere:

1. **Chat** → **Claude Code**: *"Come sono gestiti oggi i rimborsi? Quali file toccherebbe un rimborso parziale?"*.
2. Claude elenca i file e i punti delicati, con i riferimenti al codice.
3. Passi a **Codex** per un secondo parere: *"Vedi rischi che mancano?"*.

Con le risposte scrivi un requisito preciso (9.1). La chat resta tua; quello che conta per il team va nella spec.

### 13.8 Una demo ai clienti o al management

```sh
pnpm ordo:demo
```

Segui i 6 passi stampati: Overview → Workflow → replay con ▶ → review dal vivo (annulli il README) → Run (facoltativo, usa il tuo piano) → Team profile. Alla fine: `pnpm ordo:demo:clean`.

---

## 14. Limiti attuali

Ordo è in sviluppo (branch `develop/v2`). Oggi:

- **Uno step in errore (`error`) o bloccato in review (`blocked`) non si rimette in moto dall'interfaccia.** L'unica via oggi è saltarlo da terminale: `ordo plan finish <piano> --step-id <step> --status skipped`. Questo lo considera concluso e sblocca gli step che dipendono da lui. Una funzione per rilanciarlo è da fare.
- **Run usa sempre l'agente `Default` del profilo** con le skill e le regole `Required` e `Default`. La scelta di agente e skill per la singola sessione arriverà nel prossimo passo. Se il profilo non ha un agente `Default`, Run si ferma con l'errore "Choose an agent with --agent or set a project default".
- **Le fasi verify, review e record** non esistono ancora come fasi a sé. La review avviene durante il lavoro, dopo ogni step.
- **Esplorazioni, proposte architetturali e piani con più step** si creano da terminale.
- **La chat è solo in sola lettura.** La modalità "Modifica", in cui l'agente cambia i file e poi fai la code review come nel Run, è il prossimo passo. Una chat non si può ancora collegare a un requisito.
- **I token di Codex** non sono misurati ("tokens not measured"). Il consumo del piano di Claude è l'ultimo valore visto durante un'esecuzione, non un dato dal vivo.
- **Il flusso di lavoro non è ancora disegnabile.** Il designer grafico è previsto (ADR-0003).
- **Ordo non è ancora sul Marketplace:** si installa da `.vsix`. Non è ancora stato provato su Cursor e Windsurf.

---

## 15. Risoluzione dei problemi

| Messaggio o sintomo | Causa | Cosa fare |
|---|---|---|
| *Open a project folder to use Ordo.* | Nessuna cartella aperta | *File → Open Folder* sul progetto |
| L'agente risulta **Not found** | La CLI non è nel `PATH` di VS Code | AI connections → **Set executable path** con il path assoluto (per esempio l'output di `which claude`) |
| **Not logged in** | Nessun login | Da terminale: `claude`, poi `/login`; oppure `codex login`. Poi **Recheck** |
| *Spec must be ready before agent execution* | La spec è `draft` | **Mark ready**, dopo l'approvazione |
| *Initialize the shared project profile before running a plan step* | Manca `.ordo/profile.json` | Team profile → **Create …** |
| *Choose an agent with --agent or set a project default* | Nessun agente `Default` | Team profile → Agents → un agente a **Default** → **Save profile** |
| *Project profile needs review: Changed … catalog entry …* | Il catalogo è cambiato | Team profile → leggi le voci "changed in catalog" → **Accept catalog update** → **Save profile** |
| *The shared project profile must enable the implement workflow* | Workflow `implement` disattivato | Team profile → Workflows → `implement` ≠ Disabled |
| *No shared project context is available…* | `brain.md` vuoto e nessun documento di contesto | Scrivi in `.ordo/brain.md`, oppure `ordo context add <file>` |
| *Plan step is blocked or not pending* | Lo step non è pronto (dipendenze, già fatto, in review) | Controlla la pipeline: forse serve una review |
| *Another plan step is already running* | Un altro step dello stesso piano è `running` | Aspetta che finisca, o fermalo |
| Review: *Edited after the agent finished, nothing was undone: …* | Hai modificato a mano quel file dopo l'esecuzione | Tieni il file, oppure riporta tu stesso il file com'era e riprova |
| Review: *No diff for this run…* | L'esecuzione è avvenuta fuori da Git o prima delle foto | Registra comunque la decisione; controlla i file a mano |
| Consumo Claude vuoto | Nessuna esecuzione Claude avviata da Ordo su questa macchina | Compare dopo il primo Run con Claude |
| "Pay-as-you-go on your API key" | Accesso con API key o cloud | Normale: non ci sono finestre di piano |
| La pagina non si aggiorna | Evento perso | **Refresh** in alto a destra, oppure *Ordo: Refresh Shared Project Data* |

---

## 16. Riferimenti: comandi, impostazioni, file, CLI

### 16.1 Comandi dell'estensione (Command Palette)

| Comando | Cosa fa |
|---|---|
| Ordo: Open Ordo | Apre la pagina Ordo (Overview) |
| Ordo: Open Chat | Apre la chat |
| Ordo: Open Workflow and Replay | Apre la scheda Workflow |
| Ordo: Open Team Profile | Apre il profilo di team |
| Ordo: Open AI Connections | Apre le connessioni |
| Ordo: Refresh Shared Project Data | Ricarica tutto |
| Ordo: Create Business Requirement | Nuova spec guidata |
| Ordo: Create Implementation Plan | Nuovo piano guidato |
| Ordo: Initialize Shared Project Context | Crea `brain.md` e l'indice del contesto |
| Ordo: Set Agent Executable Path | Path di Claude Code o Codex |
| Ordo: Recheck AI Connections | Ricontrolla installazione e login |
| Ordo: Use an API Key for an Agent | API key per Claude Code o login Codex con chiave |
| Ordo: Remove Claude Code API Key | Toglie la chiave dal portachiavi |

### 16.2 Impostazioni

| Impostazione | Predefinito | Significato |
|---|---|---|
| `ordo.closeSidebarOnOpen` | `true` | Chiude la barra laterale quando apri Ordo dall'icona |
| `ordo.claudeCode.path` | vuoto | Path assoluto di `claude`; vuoto = cerca nel `PATH` |
| `ordo.codex.path` | vuoto | Path assoluto di `codex`; vuoto = cerca nel `PATH` |

Le ultime due valgono solo per la tua macchina: un repository non può cambiarle.

### 16.3 File e cartelle

| Percorso | Contenuto | In Git? |
|---|---|---|
| `.ordo/specs/<id>.md` | Specifiche | Sì |
| `.ordo/explore/<id>.json` | Esplorazioni | Sì |
| `.ordo/architectures/<id>.json` | Proposte architetturali | Sì |
| `.ordo/plans/<id>.json` | Piani e step | Sì |
| `.ordo/profile.json` | Profilo di team | Sì (con pull request) |
| `.ordo/brain.md` | Memoria del progetto | Sì |
| `.ordo/context/index.json` | Documenti di contesto registrati | Sì |
| `.ordo/context/snapshots/` | Snapshot del contesto inviato agli agenti | Sì (consigliato, per l'audit) |
| `.ordo/audit/<tipo>/<id>.jsonl` | Registro delle decisioni e dei cambi di stato | Sì |
| `.ordo/sessions/<uuid>.json` / `.jsonl` | Sessioni ed eventi degli agenti | Sì (consigliato; vedi 12.4) |
| `refs/ordo/snapshots/*` (nel repository Git locale) | Foto dei file per la code review | No, restano locali |
| `~/.local/state/ordo/usage.json` | Consumo del piano | No: personale |
| `~/.local/state/ordo/chats/` | Chat con gli agenti | No: personale |
| Portachiavi del sistema | API key di Claude Code | No: personale |

### 16.4 La CLI in breve

```sh
ordo status                                   # pipeline di tutti i requisiti
ordo status --spec <id>                       # percorso delle decisioni di un requisito
ordo spec create --title … --objective … --acceptance …
ordo spec status <id> --status ready          # approvazione (stesso effetto di Mark ready)
ordo brainstorm create|add|select|crystallize …
ordo architect create|approve …
ordo plan create --title … --spec … --step '<json>' [--step '<json>' …]
ordo agent claude|codex --spec <id> --plan <id> [--step <id>] [--prompt "…"]
ordo plan changes <plan> --step-id <step> [--diff]
ordo plan review <plan> --step-id <step> --decision approved|changes-requested|blocked \
     [--note "…"] [--reject <file>]… [--reject-all]
ordo profile init|show|validate|set …
ordo context init|add|hide|show|remove|preview|snapshot …
```

Aggiungi `--json` per un output leggibile da script. `ordo <comando> --help` mostra tutte le opzioni.

---

## 17. Glossario

- **Agente / harness:** Claude Code o Codex, il programma che modifica il codice.
- **Audit:** il registro append-only di chi ha fatto cosa e quando (`.ordo/audit/`).
- **Catalogo:** agenti, skill, regole e workflow disponibili (`content/`).
- **Chat:** conversazione personale e in sola lettura con Claude Code o Codex, fuori da Git.
- **Code review:** la decisione di una persona sul lavoro di un agente, file per file.
- **Contesto:** ciò che l'agente riceve oltre alla spec: `brain.md` e i documenti registrati.
- **Cristallizzare:** trasformare l'alternativa scelta di un'esplorazione in una spec.
- **Foto (snapshot) dei file:** lo stato dei file prima e dopo un'esecuzione, per il diff.
- **Pipeline:** la tabella requisiti × fasi della scheda Workflow.
- **Profilo di team:** le scelte del team sul catalogo (`.ordo/profile.json`).
- **Replay:** la storia di un requisito, evento per evento.
- **Sessione:** una esecuzione di un agente, con tutti i suoi eventi.
- **Spec:** il requisito scritto, con i criteri di accettazione.
- **Step:** un'unità di lavoro piccola e verificabile di un piano.
