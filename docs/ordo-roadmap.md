# Ordo — specifica di prodotto e roadmap

> Documento di riferimento per l'opera completa: definisce che cosa deve diventare Ordo, quali invarianti deve rispettare, come deve integrarsi con Claude Code e Codex e in quale sequenza realizzarlo. I checkbox descrivono lo stato verificabile nel repository al 25 settembre 2026; `[x]` indica una capacità presente, non necessariamente una release pubblicata o una UX già completa. Le attività senza checkbox completato sono lavoro da fare.

## 1. Direzione e promessa

> **Aggiornamento 25 settembre 2026 — [ADR-0002](adr/0002-ordo-come-estensione-vs-code.md):** Ordo si distribuisce come **estensione VS Code** (`pompeitech.ordo`, Marketplace e Open VSX) insieme alla CLI. Ordo Desktop su Code OSS è uno spike congelato. Le parti di questo documento che parlano di "editor desktop dedicato" vanno lette alla luce di questa decisione.

Ordo è un **workspace di engineering governato per team**, con un editor desktop dedicato basato su **Code OSS e Electron**, un runtime condiviso e una CLI headless. Il team usa Ordo per mantenere requisiti di business, conoscenza del progetto, decisioni, piani e verifiche come artefatti versionabili; delega l'esecuzione esclusivamente a **Claude Code o Codex**, entro il perimetro concordato.

La promessa è: chiunque nel team, umano o agente, parte dalla stessa base approvata; ogni modifica è collegata al perché, al requisito, al piano, al contesto usato, alle verifiche e alla decisione di review.

Ordo non è solamente una chat, un prompt runner, un catalogo di prompt, una dashboard di metriche o un wrapper per un unico modello. È il **sistema di workflow e di record condiviso** nel quale gli agenti sono esecutori sostituibili.

### Obiettivi

- Condividere requisiti e regole di business tra persone, repository e agenti.
- Ridurre assunzioni nascoste, divergenze fra implementazione e richiesta, perdita di conoscenza e costo delle review.
- Rendere ogni passaggio comprensibile, ripetibile, auditabile e interrompibile.
- Consentire al team di scegliere Claude Code o Codex e le rispettive opzioni supportate, mantenendo invariati processo e artefatti.
- Rendere agenti e skill di `content/` selezionabili nell'editor, governati da un profilo iniziale condiviso nel repository e flessibile per sessione entro policy.
- Fare in modo che ogni persona e agente operi sul contesto business e sulla funzionalità specifica assegnata, non su una memoria vaga o privata.
- Collegare Jira in modo opzionale a spec e attività Ordo, preservando provenienza, tracciabilità e gestione esplicita dei conflitti.
- Permettere di lavorare sia su repository greenfield sia legacy, con onboarding progressivo.
- Offrire una UX desktop completa senza togliere la possibilità di lavorare da CLI e CI.

### Fuori obiettivo

- Generare una “verità” di business senza validazione da parte del team.
- Eseguire modifiche ad alto rischio senza consenso umano esplicito.
- Sostituire code review, responsabilità tecnica, test o approvazione del business.
- Obbligare il team a usare storage SaaS o telemetria remota.
- Scaricare o ospitare modelli locali come requisito del prodotto.
- Richiedere una licenza Artiforge, un'inferenza ospitata da Ordo o un abbonamento Ordo per leggere/curare artefatti locali e pianificare senza esecuzione AI.

## 2. Invarianti non negoziabili

1. **Il workflow è sempre quello di Ordo.** GUI, CLI, CI e agenti non saltano silenziosamente `brainstorm → spec → architect → plan → implement → verify → review → record`. *Modificato da [ADR-0003](adr/0003-flussi-disegnabili-e-replay.md): il lavoro segue sempre un flusso Ordo, quello predefinito (questa sequenza) o uno disegnato e validato dal team. Nessuna superficie ne salta nodi o cancelli, e valgono sempre le regole R1–R6: spec approvata prima degli agenti, review umana dopo ogni task agente, decisioni umane non delegabili.*
2. **Gli artefatti del progetto sono la fonte condivisa.** Le chat e le memorie private dei provider non sostituiscono `.ordo/` e Git.
3. **Contesto ispezionabile prima dell'azione.** L'utente può vedere fonti, provenienza, versione/snapshot, stima e contenuto effettivamente consegnato al modello.
4. **Stesso contratto per entrambi gli harness.** Dato uno stesso step approvato, Claude Code e Codex ricevono lo stesso spec, snapshot, limiti e verifiche, salvo differenze di serializzazione/capability dichiarate.
5. **Analisi non scrive codice.** Brainstorm, analisi del repository, proposta architetturale, planning e preview sono read-only rispetto al codice. Le modifiche agli artefatti Ordo sono mostrate come diff e confermate secondo policy.
6. **Scritture autorizzate e circoscritte.** Nessun agente amplia da solo path, strumenti, rete o livello di permesso. Scrittura e shell sono negate per default o governate da policy esplicita e approvazioni.
7. **Le transizioni sono persistenti e valide.** Nessun passaggio a implementazione senza spec e piano approvati; nessuno step bloccato viene eseguito; nessun lavoro è `verified` senza evidenza.
8. **Human-in-the-loop.** Architettura, eccezioni di policy, review finale, aggiornamento della conoscenza condivisa e merge rispettano approvazioni configurabili.
9. **Audit senza segreti.** Eventi, output, diff e uso sono registrati secondo retention locale/configurabile; credenziali e segreti non entrano nei file versionati.
10. **Git-first, team-aware.** Artefatti testuali sono diffabili, versionabili e risolvibili; conflitti concorrenti sono rilevati e mai sovrascritti in silenzio.
11. **Core deterministico, harness-neutral e supporto circoscritto.** Logica di dominio, policy e stati non dipendono dalla UI; l'esecuzione agentica supporta solo adapter Claude Code e Codex.
12. **CLI completa.** Ogni operazione sostanziale disponibile nella GUI ha API/CLI headless e output macchina stabile, salvo interazioni che richiedono una decisione umana.
13. **Profilo condiviso, selezione esplicita.** Agenti e skill abilitati/default sono definiti nel repository; selezione e override di sessione sono visibili, limitati e auditati.
14. **Contesto business sempre collegato.** Un run di implementazione indica progetto, issue (se presente), spec, criteri e snapshot business che sta servendo.
15. **Jira opzionale e senza sync distruttiva.** Jira integra il flusso aziendale; Ordo mantiene artefatti e audit propri. Divergenze richiedono una scelta esplicita.

## 3. Utenti e scenari principali

- **Business owner / product manager:** definisce problema, attori, regole, vincoli e criteri di accettazione; chiarisce domande e approva la specifica.
- **Tech lead / architect:** valuta impatto, alternative, contratti, rischi e decisioni; approva architettura e piano.
- **Contributor:** assegna uno step a un agente o lavora manualmente; controlla sessione, diff e verifiche.
- **Reviewer:** confronta diff e risultati con spec, piano, policy e criteri; approva, richiede modifiche o blocca.
- **Admin di workspace/team:** configura gli harness consentiti (Claude Code/Codex), policy, strumenti, ruoli e retention.
- **CI / automazioni:** valida artefatti e dipendenze, esegue controlli dichiarati e genera report JSON, senza aggirare approvazioni.

Scenari da supportare: nuova feature greenfield; modifica a un sistema legacy; passaggio di consegne; ripresa di una sessione interrotta; cambio agente a metà lavoro; esecuzione step indipendenti in worktree separati; review di conformità; audit di una modifica già rilasciata.

Ogni contributor deve poter vedere quali agenti e skill il team ha abilitato, quali sono default/obbligatori e perché; avviare una funzionalità dal suo contesto business condiviso; collegare un ticket Jira se il repository lo usa; passare a un altro agente senza perdere spec, policy, decisioni o cronologia.

## 4. Workflow end-to-end obbligatorio

> Con [ADR-0003](adr/0003-flussi-disegnabili-e-replay.md) questa tabella descrive il **flusso predefinito**. I team possono disegnarne uno proprio entro le regole R1–R6, e la review non è più solo una fase finale: diventa nodi di review umana distribuiti durante il lavoro, per esempio dopo ogni task agente.

| Fase | Scopo e input | Output persistente | Gate / regole |
| --- | --- | --- | --- |
| `brainstorm` | Chiarire problema, attori, ipotesi, domande, alternative e trade-off. | Esplorazione con fonti, domande e alternative. | Read-only sul codice; non trasformare inferenze in fatti. |
| `spec` | Convertire la soluzione selezionata in requisiti di business e software. | Spec con scope, non-scope, requisiti, regole, criteri e rischi. | Validazione schema; business owner/reviewer porta a `ready`. |
| `architect` | Analizzare repository e impatto; definire componenti, contratti, migrazioni e decisioni. | Proposta architetturale e decision records collegati. | Richiede evidenze/provenienza e approvazione umana. |
| `plan` | Scomporre lavoro in passi atomici, ordinati, verificabili e dipendenti. | Piano con step, aree/file, output, dipendenze e verifiche. | Nessun ciclo; step dipendente bloccato non eseguibile; piano approvato. |
| `implement` | Delegare un singolo step autorizzato a un agente o contributor. | Sessione, contesto congelato, eventi, patch/diff, stato step. | Scope file/tool esplicito; approvazioni per operazioni mutanti. |
| `verify` | Eseguire comandi tecnici e test di conformità ai criteri. | Evidenze, esiti, log redatti, collegamenti a criteri/step. | Distinguere test non eseguito, fallito, superato e non applicabile. |
| `review` | Valutare diff, requisiti, rischi, assunzioni e verifiche. | Decisione review: approvato, modifiche richieste o bloccato. | Review umana esplicita; il modello può assistere ma non auto-approvare. |
| `record` | Consolidare stato e conoscenza dopo una decisione valida. | Aggiornamenti a spec/piano/decisioni/brain, link Git/PR/commit. | Diff visibile; approvazione per memoria/team policy; audit append-only. |

Ogni fase è invocabile individualmente, ma valida prerequisiti e transizioni. Il workflow non richiede che tutto avvenga in una singola sessione o con un solo harness; i run usano esclusivamente Claude Code o Codex. Stati e pause sopravvivono a riavvii e cambi di harness quando supportato.

## 5. Specifiche degli artefatti condivisi

Formato iniziale: Markdown con frontmatter YAML per contenuti revisionabili; JSON/JSONL versionato per stato macchina ed eventi. Tutti i file hanno schema version, ID stabili, timestamp ISO-8601, autore/attore e collegamenti tipizzati. Migrazioni schema esplicite e non distruttive.

```text
.ordo/
  config.json                 # impostazioni repository non segrete e policy locale
  profile.json                # profilo condiviso: catalogo agenti/skill, default e vincoli
  brain.md                    # conoscenza curata e sintesi con link alle fonti
  context/index.json          # fonti, visibilità, checksum e stato indicizzazione
  context/snapshots/           # snapshot immutabili, identificati da hash/commit
  specs/<id>.md                # requisiti versionati
  explore/<id>.json            # esplorazioni e alternative
  architectures/<id>.md        # proposte e decisioni architetturali
  decisions/<id>.md            # decision records durevoli
  plans/<id>.json              # grafo di step e stato
  sessions/<id>.json            # intestazione/metadati sessione
  sessions/<id>.jsonl           # eventi append-only redatti
  runs/<id>/                    # patch/evidenze temporanee o referenziate secondo policy
  audit/<periodo>.jsonl         # audit locale esportabile, policy di retention
```

Le directory e il formato esatto sono una proposta da stabilizzare con schema e migrazioni prima di dichiararli API pubblica. File grandi, binari o sensibili possono essere referenziati con hash/percorso esterno; non devono essere committati automaticamente. Il team sceglie cosa versionare. File ignorati o nascosti non sono inclusi implicitamente nel contesto.

### Campi minimi

- **Brain:** scopo, glossario, regole di business confermate, invarianti, domini, architettura sintetica, comandi di verifica confermati, rischi e link; ogni affermazione deve avere fonte e stato.
- **Spec:** ID, titolo, autore, stato (`draft`, `ready`, `implemented`, `verified`, `superseded`), obiettivo, non-obiettivi, attori, requisiti funzionali/non funzionali, regole business, vincoli, assunzioni, domande aperte, criteri di accettazione identificati e verificabili, rischi, fonti e approvazioni.
- **Explore:** problema, opzioni, benefici/trade-off/rischi, domande, evidenze e scelta; nessuna opzione scelta diventa requisito fino a conferma.
- **Architecture / decision:** contesto, impatto, alternative, scelta, conseguenze, componenti, contratti, autore, data, stato, approvatori e link a spec, piano e commit.
- **Plan:** ID, spec e architettura referenziate, versione/snapshot di base, approvazioni, elenco step con ID, descrizione, input, output, file/path consentiti, dipendenze, blocchi, comandi di verifica, rischio e stato (`pending`, `ready`, `active`, `blocked`, `done`, `skipped`).
- **Sessione:** harness (Claude Code/Codex), modello/versione esposti dal harness, branch/commit iniziale e finale, spec/piano/step, snapshot context hash, prompt/template ID, strumenti, permessi, approvazioni, eventi, file modificati, diff hash, verifiche, usage/costo/latency se esposti.
- **Profilo team:** schema version, catalog source/version, agent IDs, skill IDs, regole applicabili, stato (`enabled`, `recommended`, `default`, `required`), policy compatibili, owner e revisione. Secret e preferenze macchina non sono ammessi.
- **Riferimento issue:** provider tracker, workspace/project, issue key e URL canonico, timestamp sync, hash dei campi importati, mapping campi e link a spec/piano/sessione; credenziali restano fuori dal repository.
- **Osservazione contesto:** tipo `fact | inference | curated`, evidenza puntuale (file/range/commit o dichiarazione/autore), confidenza quando applicabile, data e possibilità di conferma/smentita.
- **Audit event:** ID, sequenza, sessione/utente, azione, risorsa, decisione policy, esito, riferimenti/hash e timestamp; evitare di registrare segreti o contenuti non necessari.

### Integrità e concorrenza

- Scritture atomiche, validazione prima del commit e backup/recupero per aggiornamenti locali.
- Versione/hash atteso a ogni modifica; mismatch produce conflitto visibile, non last-write-wins.
- Lock brevi o optimistic concurrency per file, senza lock Git permanenti.
- ID stabili, link validabili e riferimenti a commit/branch/PR senza dipendere dalla piattaforma Git remota.
- Log eventi append-only; correzioni come nuovi eventi, senza riscrivere l'audit storico.

## 6. Contesto / Context Lens

Il context builder produce un payload deterministico e immutabile che può includere: brain approvato, documenti business/architettura tracciati, spec e step attivi, decisioni applicabili, regole/skill, evidenze del repository, allegati scelti e messaggi recenti necessari.

Requisiti:

- Mostrare blocchi inclusi/esclusi, fonte, motivo, checksum/commit e provenienza (`fact`, `inference`, `curated`).
- Profili `minimal`, `standard`, `full` e budget token configurabile; stima approssimata chiaramente distinta dai dati esposti dall'harness.
- Anteprima letterale del manifest Ordo consegnato all'harness; l'invio usa quello snapshot, non riassembla silenziosamente il contesto. Dichiarare che l'harness può aggiungere contesto/instructions non ispezionabili da Ordo.
- Escludere credenziali, file ignorati, segreti noti e percorsi vietati; redazione difensiva anche nei log.
- Permettere add/hide/show/remove, override motivati, aggiornamento incrementale e confronto fra snapshot.
- Legare snapshot a commit/branch e indicare differenze rispetto a quello approvato nel piano.
- Per repo legacy, analisi incrementale con evidenza per ogni osservazione e correzione umana.
- Rispettare dimensione massima, encoding, symlink e path traversal; non leggere fuori dal workspace consentito.

Il context builder e gli schemi appartengono al core; indicizzazione semantica/embedding, se introdotta, è opzionale, spiegabile e sostituibile. Un risultato recuperato non è “fatto” senza fonte.

## 7. Integrazione Claude Code e Codex

### Contratto comune degli adapter Claude Code/Codex

Ordo definisce un `AgentAdapter` indipendente dall'harness. Input minimo: session ID, task ID, spec ID e criteri pertinenti, plan step approvato, context snapshot immutabile/hash, branch/worktree, allowlist di path, policy strumenti, comandi di verifica e budget/timeout. Output normalizzato: eventi streaming, testo, richieste tool, usage, stato terminazione, patch/diff, errori e supporto resume/cancel quando disponibile. I capability non esposti dall'harness sono marcati non disponibili, mai simulati.

L'adapter deve rilevare presenza/versione/login/capabilities, passare il manifest Ordo in modo visibile, applicare policy e permessi nativi, catturare eventi senza segreti, gestire timeout/abort/crash e collegare sessioni riprese. Claude Code/Codex usano le proprie credenziali locali; Ordo non chiama direttamente API di modelli e non chiede di copiare API key in `.ordo/`. Se la CLI non è autenticata l'esecuzione non parte. L'utente può comunque autenticare la CLI con la propria API key: per Claude Code la chiave sta nel portachiavi del sistema e passa al solo processo `claude`; per Codex la conserva Codex dopo `codex login --with-api-key` ([ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md)).

**Vincolo di prodotto:** nessun adapter diretto Anthropic/OpenAI/Google/OpenRouter/GitHub, nessun provider generico compatibile OpenAI, nessun runtime locale di modelli e nessun servizio d'inferenza Artiforge/Ordo. Le API dei rispettivi harness restano dietro adapter separati. Login, abbonamenti e costi necessari per Claude Code/Codex restano a carico dell'utente secondo le condizioni dei fornitori. Il funzionamento locale/offline vale per gli artefatti e le operazioni deterministiche Ordo, non implica inferenza AI offline.

### Claude Code

- Integrare Claude Code tramite interfaccia ufficiale supportata (CLI/SDK, dopo verifica delle API e licenze/versioni correnti) e/o server MCP Ordo per accesso a contesto e operazioni Ordo.
- Supportare esecuzione interattiva e headless/CI dove appropriato, output strutturato/streaming, resume, timeout e permessi espliciti.
- Usare impostazioni permessi/tool allow/deny e approvazioni; non adottare modalità che bypassano le protezioni come percorso normale.
- Distribuire configurazione Claude MCP solo con consenso, scope dichiarato e comando di uninstall/rollback; evitare modifiche globali non richieste.
- Mappare gli eventi nativi all'audit Ordo conservando raw data solo secondo retention e redazione configurata.

### Codex

- Integrare Codex tramite interfacce ufficiali correnti: CLI per prima integrazione/headless; SDK o app server per gestione più profonda di sessioni, approval ed eventi, selezionati dopo spike tecnico.
- Rendere disponibile il server MCP Ordo per contesto e operazioni strutturate nel client Codex, rispettando la configurazione e il consenso dell'utente.
- Verificare sandbox, approval mode, worktree/branch, session resume, output e usage; non confondere l'adapter esistente che installa file canonici nel formato Codex con un adapter di esecuzione.
- Non fondare nuova integrazione sul vecchio Codex MCP server se documentazione ufficiale lo depreca.

### Server MCP Ordo

MCP è un trasporto comune per esporre risorse, prompt e tools; non sostituisce le regole del workflow né la UI Ordo. Prima versione locale via stdio, senza servizio remoto obbligatorio. Risorse read-only includono status progetto, spec approvata, decisioni, piano/step e snapshot selezionato. Tools mutanti sono pochi, tipizzati, version-checkati e passano sempre dal policy/approval core. Ogni tool identifica sessione e attore e produce audit event.

Tool iniziali candidati: `ordo_project_status`, `ordo_context_get`, `ordo_spec_get`, `ordo_plan_step_get`, `ordo_session_event_append`, `ordo_propose_artifact_update`, `ordo_request_approval`. Non esporre un generico tool di scrittura file come scorciatoia. Definire schema/versione, errori, idempotenza, limiti payload e test di compatibilità client.

### Neutralità ed equivalenza

Per una data sessione salvare manifest leggibile con hash di tutti gli input, capacità e policy effettive. Due harness possono avere UX diverse, ma non cambiano spec, snapshot o scope. Le differenze di tool-calling e sandbox devono essere dichiarate nel record; la conformità finale è verificata da Ordo e dal reviewer, non presunta dal nome del modello.

### Profilo di team: agenti e skill di `content/`

L’editor deve permettere di selezionare gli agenti e le skill disponibili nel catalogo `content/`. La configurazione non è una preferenza isolata per sviluppatore: la prima configurazione del progetto crea un profilo Ordo versionato in `.ordo/profile.json`, condiviso via Git. Il profilo referenzia gli ID e gli hash del catalogo, indica quali elementi sono abilitati, consigliati, predefiniti o obbligatori, e applica policy compatibili. Le regole `common-*` sono richieste di default; le altre vengono consigliate e il team può promuoverle a default/required o disabilitarle. Non duplica i contenuti canonici.

Ogni persona conserva una scelta operativa per sessione (ad esempio usare Codex anziché Claude Code o abilitare una skill consentita), ma la UI deve mostrare il profilo condiviso, le capacità effettive e le eventuali differenze; una scelta personale non può disattivare un requisito obbligatorio o aggirare il profilo. Override consentiti richiedono motivazione/approvazione secondo policy e vengono registrati nel manifest della sessione. Le preferenze personali vivono nella configurazione utente e non sono committate.

Le skill sono conoscenza/istruzioni applicabili, non agenti. Ordo deve poter applicare le skill marcate obbligatorie/default, raccomandare quelle pertinenti allo step e far scegliere le altre tra quelle consentite. Regole required/default si applicano a ogni sessione; regole enabled/recommended possono essere selezionate esplicitamente. Prima dell’esecuzione mostra esattamente agent, modello, skill e regole effettive e il loro contributo al context budget.

### Contesto di business e funzionalità

Il repository condiviso deve rendere espliciti scopo del prodotto, utenti/ruoli, glossario, processi, regole di business, vincoli, funzionalità esistenti e backlog di funzionalità. La spec è la definizione revisionabile della funzionalità da sviluppare; il piano, le sessioni e le verifiche ne mantengono il collegamento. Project Home deve mostrare “che prodotto è”, “che cosa stiamo sviluppando”, “per chi”, le decisioni aperte e da quali fonti derivano le informazioni. Gli agenti ricevono solo il contesto business pertinente e approvato, insieme ai relativi criteri, non un dump indistinto.

Contesto business importato da fonti esterne mantiene fonte, timestamp, campi/hash importati e stato di revisione. Informazioni proposte dall’agente sono marcate come inferenze e non diventano regole curate senza conferma umana. Un’attività non può entrare in implementazione se mancano il razionale business e il riferimento a spec/criteri, salvo eccezione motivata e registrata.

### Integrazione Jira (opzionale)

Jira è il primo tracker esterno da valutare per collegare ticket e workflow Ordo; non è requisito per usare Ordo e non sostituisce gli artefatti Ordo. Il ticket resta il riferimento allo stato di issue aziendale; Ordo conserva la spec approvata, contesto effettivamente passato agli agenti, piano, sessioni, diff, verifiche e audit.

- Importare ticket su richiesta con mapping configurabile (key/URL, titolo, descrizione, criteri, labels, issue type, stato, link e campi custom selezionati), anteprima e provenienza.
- Creare o collegare una spec Ordo e criteri di accettazione; non assumere che ogni descrizione o criterio Jira sia già approvato come spec.
- Collegare issue ↔ spec ↔ piano/step ↔ agent run/sessione ↔ diff/PR ↔ evidenze di verifica.
- Mostrare nell’editor il ticket attivo, stato ultimo sync, autore e cambiamenti intervenuti su Jira dall’import.
- Partire con sync esplicita/pull e azioni push selettive opt-in (ad esempio aggiunta link o transizione di stato consentita), non con sync bidirezionale implicita.
- Se ticket e spec cambiano entrambi, presentare un merge/review assistito con diff per campo; mai sovrascrivere in silenzio; preservare revisioni e decisione umana.
- Salvare credenziali nel secure storage del sistema, limitare scope, supportare revoca e redigere token dai log.
- Implementare un’interfaccia issue-tracker neutrale per rendere possibili futuri Linear/Azure DevOps/GitHub Issues senza dipendenza Jira nel core.

## 8. Editor desktop Ordo (Code OSS + Electron)

### Decisione di prodotto

> **Superata da [ADR-0002](adr/0002-ordo-come-estensione-vs-code.md):** il prodotto interattivo è l'estensione VS Code `pompeitech.ordo`. Il testo che segue descrive la direzione precedente, oggi congelata.

Il prodotto interattivo di destinazione è **Ordo Desktop**, un'applicazione desktop costruita e distribuita a partire da **Code OSS** (workbench VS Code open-source) e dal relativo runtime Electron. L'utente apre una cartella/repository e lavora nel codice e nelle superfici Ordo nella stessa applicazione. CLI resta interfaccia headless di automazione e recovery. L'editor non è semplicemente una pagina web Electron indipendente, né un'estensione isolata che presuppone l'installazione del VS Code originale.

### Principi dell'editor

- Riutilizzare editor, terminale, SCM/Git, debug, language services, keybindings, accessibilità, temi e marketplace compatibili dal codebase OSS secondo licenze e policy di distribuzione.
- Integrare una UI Ordo nativa nel workbench: Activity Bar, pannelli/views, editor custom per spec/piani/review, notifiche e palette comandi.
- Presentare almeno: Project Overview, Business Context, Specs, Explore, Architecture/Decisions, Plans, Sessions, Diff & Review, Verify, Agent Runs, Control Center e Audit.
- Mostrare il profilo di team e consentire selezione di agenti/skill per sessione solo entro i limiti condivisi; distinguere default e requisiti obbligatori.
- Rendere il contesto business e le funzionalità da sviluppare sempre raggiungibili e collegati alla spec attiva; Jira, se configurato, è un riferimento integrato e chiaramente attribuito.
- Aprire e modificare codice normalmente; ogni step agente può essere seguito in streaming, fermato, ripreso e confrontato nel diff editor.
- Evidenziare graficamente gate, stato, blocchi, approvazioni e legami codice↔requisito↔criterio↔test.
- Condividere gli stessi API/core/CLI; la UI non reimplementa validazione, policy, stati o persistenza.
- Accessibilità tastiera/screen reader, layout adattivo, light/dark/high-contrast, localizzazione almeno inglese/italiano.
- Funzionare offline per artefatti e operazioni deterministiche locali; i run AI richiedono Claude Code o Codex configurato e dichiarano i dati passati all'harness.

### Architettura applicativa

```text
Ordo Desktop (Code OSS workbench, Electron)
  ├─ Ordo workbench UX / extension host
  ├─ renderer: UI; IPC tipizzato e allowlistato
  ├─ main: lifecycle desktop, finestre, aggiornamenti, secure storage bridge
  ├─ Ordo application service (local process)
  │    ├─ core: schemi, workflow, contesto, policy, persistenza
  │    ├─ runtime: Claude Code/Codex adapters, policy, approvals, session events
  │    └─ CLI/MCP: automazione e interoperabilità
  └─ Claude Code/Codex harness process isolati quando richiesto
```

Da scegliere mediante spike: fork/build completo Code OSS con branding e aggiornamenti Ordo oppure distribuzione di una shell/workbench OSS con integrazione Ordo. Prima della scelta vanno verificati licenze, marchi, marketplace/extensions policy, signing/notarization, aggiornamenti, telemetry e costi di mantenere il fork. Non assumere accesso alle estensioni proprietarie di Microsoft; usare solo componenti legalmente redistribuibili o marketplace compatibili.

Sicurezza desktop: renderer isolato, `contextIsolation` e sandbox Electron, niente Node nel renderer, IPC minimo con validazione schema, CSP stretta, dependency scanning, storage credenziali del sistema operativo, aggiornamenti firmati, prompt chiaro per workspace trust, nessuna esecuzione codice da webview non fidata.

### UX principale

1. Welcome / Open Project: apri o inizializza `.ordo/`, mostra stato, branch e trust.
2. Onboarding: rileva stack e harness, raccoglie il contesto business, propone profilo condiviso di agenti/skill, chiede fonti, mostra anteprima di snapshot e artefatti che saranno versionati e offre collegamento opzionale al tracker.
3. Project Home: riepilogo di prodotto, utenti, regole business, funzionalità/spec attive, decisioni recenti, piani, sessioni e blocchi.
4. Business Context: brain, glossario, fonti, osservazioni fact/inference/curated, diff snapshot e budget contesto.
5. Spec Workspace: editor guidato e Markdown, validazione live, criteri identificati, commenti e approvazioni.
6. Explore/Architect: alternative, impatto con evidenze, decisioni e proposte editabili/revisionabili.
7. Plan Board: grafo/lista step, dipendenze, assegnazione agent/persona, scope, approvazione e avanzamento.
8. Run Workspace: selezione tra agenti/skill condivisi e consentiti, Claude Code/Codex, modello/capability esposti dall'harness, issue e spec, manifest Ordo, permessi, preview, start/pause/cancel/resume e stream eventi.
9. Verify & Review: comandi e risultati, matrice criterio→evidenza, diff, file fuori scope, rischi e decisione esplicita.
10. Record & Audit: aggiornamento documenti con diff, link commit/PR, esportazione e cronologia consultabile.
11. Control Center: catalogo e profilo team di agenti/skill, rilevamento/login/capability Claude Code e Codex, MCP, Jira/tracker, policy, ruoli, usage/costi esposti, retention e diagnostica.

## 9. CLI, API e CI

La CLI resta completa, scriptabile e compatibile con l'installazione catalogo esistente. Interfaccia obiettivo:

```text
ordo context init|add|hide|show|remove|preview|snapshot|diff
ordo brainstorm create|show|list|add|select|crystallize
ordo spec create|show|list|validate|status|approve
ordo architect create|show|list|approve
ordo plan create|show|list|validate|approve|run|finish
ordo agent detect|list|doctor|run|resume|cancel
ordo session create|show|list|export
ordo verify [spec|plan|step] [--json]
ordo review [session|plan] [--json]
ordo record [session|review] [--dry-run]
ordo audit list|show|export
```

Nomi/argomenti definitivi vanno allineati alla CLI esistente e non devono rompere compatibilità semantica senza migrazione. Ogni comando che scrive supporta `--dry-run` dove applicabile, anteprima/diff, `--json` con schema versionato, output/exit code documentati e funzionamento non-interattivo. Codici distinti per errore, prerequisito mancante, bloccato, approvazione richiesta, verifica fallita e conflitto concorrente. CI può validare spec/piani, policy e test senza credenziali e senza invocare modelli, salvo job esplicitamente configurati.

## 10. Governance, sicurezza e team

- Ruoli minimi configurabili: contributor, reviewer, tech lead, admin; repository locale single-user rimane possibile.
- Policy a livelli workspace/repository/utente: harness/modelli disponibili, dati inviabili, tool, shell, path, rete, limiti di costo quando esposti, approvazioni e retention.
- Risoluzione policy sempre verso la restrizione più forte; override registrato e autorizzato.
- Operazioni ad alto rischio (scritture fuori scope, migrazioni distruttive, segreti, deployment, merge) richiedono gate esplicito.
- Secret scanning/redaction prima di harness, log, export e MCP; non promettere redazione perfetta, documentare i limiti.
- Nessun token/API key negli artefatti committabili; credenziali nel keychain/credential store, passate al processo con scope minimo.
- Controllo workspace trust, symlink/path traversal, subprocess injection, prompt injection da file, tool output non attendibile e supply chain.
- Audit locale predefinito; export controllato; retention configurabile; telemetria remota opt-in e documentata.
- Dati business e log delle sessioni sono potenzialmente sensibili: classificazione, minimizzazione, cancellazione e backup documentati.
- Git integration: branch/worktree per isolamento opzionale, status, diff, commit/PR link; Ordo non fa commit/merge in autonomia senza policy/consenso.
- Conflitti multiutente risolti via Git e version check; locking cloud/team sync è una futura estensione, non prerequisito della collaborazione tramite repository comune.

## 11. Osservabilità e costi

Per ciascun run mostrare ciò che l'adapter Claude Code/Codex espone: harness/modello/versione, token, costo e valuta, latenza, tool call, approvazioni, retries, errori, input snapshot, output e tempo umano dichiarato. Campo non esposto = sconosciuto, mai zero implicito. Confronti per spec, task, agente e harness; nessun ranking ingannevole senza denominatori. Stima token pre-run chiaramente etichettata e distinta dai dati reali dell'harness.

## 12. Requisiti non funzionali e qualità

- **Affidabilità:** recovery dopo crash/interruzione; scritture atomiche; sessioni riprendibili quando capability lo consente; idempotenza dei comandi dove possibile.
- **Performance:** apertura workspace senza indicizzazione bloccante; refresh incrementale; rendering progressivo dei log; budget e limiti per file/repository configurabili.
- **Portabilità:** macOS, Windows, Linux per CLI e runtime; target supportati desktop definiti in una matrice release e verificati su CI.
- **Accessibilità:** navigazione da tastiera, focus visibile, semantica screen reader, contrasto e alternative ai soli colori.
- **Compatibilità:** versionamento semver degli schema e API; migrazioni testate da versioni precedenti; import/export documentato.
- **Qualità:** unit/integration/contract/e2e per stato, adapter, security e workflow; fixture greenfield e legacy; nessun rilascio sulla sola base di build riuscita.
- **Distribuzione:** pacchetti firmati/notarizzati per OS, aggiornamento verificato, SBOM/licenze, rollback e canale stable/preview.
- **Manutenibilità:** core piccoli e testabili, adapter contrattualizzati, dipendenze versionate, feature flags solo temporanei e con owner/scadenza.

## 13. Criteri di accettazione dell'opera

L'opera è pronta per una release pubblica quando un team reale può:

1. installare e avviare Ordo Desktop senza VS Code separato, aprire un progetto e capire lo stato del workspace;
2. inizializzare `.ordo/`, curare fonti business e ricostruire un progetto legacy gradualmente;
3. completare il workflow obbligatorio con gates e artefatti versionati;
4. approvare spec, architettura e piano, con dipendenze e step bloccati applicati dal sistema;
5. assegnare step sia a Claude Code sia a Codex, con identico contratto di contesto/scope/policy e sessione auditabile;
6. interrompere/riprendere, cambiare agent senza perdere la tracciabilità e ispezionare eventi e diff;
7. dimostrare quali criteri sono verificati e con quali evidenze; rilevare file fuori scope e incongruenze note;
8. impedire modifiche non autorizzate e proteggere segreti in file, harness input, log ed export secondo policy;
9. revisionare e registrare la decisione umana, aggiornare conoscenza con diff e riferire commit/PR;
10. eseguire lo stesso percorso da CLI/JSON/CI per automazione e recovery;
11. operare senza harness per tutte le capacità locali deterministiche e ricevere errori chiari quando Claude Code/Codex o una loro capability mancano;
12. configurare una volta agenti e skill condivisi nel repository, scegliere fra quelli permessi per ogni sessione e ricostruire dal suo audit la selezione effettiva;
13. vedere e fornire agli agenti il contesto business approvato, la funzionalità, i criteri e le fonti pertinenti;
14. collegare opzionalmente un issue Jira a spec e run, importare con provenienza e risolvere divergenze senza sovrascritture silenziose;
15. passare test su macOS, Windows e Linux per le superfici dichiarate supportate, oltre a test accessibilità, sicurezza, migrazione e packaging.

## 14. Roadmap passo dopo passo

Le fasi sono ordinate per dipendenza. Le attività sono completate solo quando esistono implementazione, test e documentazione adeguati; le attività `in progress` non soddisfano ancora i criteri di accettazione della fase.

### Fase 0 — Fondazioni esistenti e baseline

- [x] CLI 1.x per detect, doctor, init/install, ispezione catalogo, JSON e installazione sicura.
- [x] Core deterministico separato dalla CLI e dagli adapter; validazione/ownership/checksum e pianificazione installazioni.
- [x] Contratti iniziali per workflow, provider/decisioni e transizioni deterministiche.
- [x] Rilevamento repository, stack, package manager e harness.
- [x] Documentare direzione prodotto e requisiti di base (`product-vision.md`, `ordo-requirements.md`).
- [ ] Stabilire baseline di test/build/lint/typecheck per tutto il monorepo e registrare supporto/runtime effettivi.
- [ ] Definire governance delle decisioni tecniche: ADR, owner, stato e approvazione dei cambiamenti a questa specifica.

### Fase 1 — Modello condiviso e contesto affidabile

- [x] `.ordo/brain.md`, fonti tracciate, visibilità, preview, stima token e snapshot context nel core/CLI.
- [x] Distinguere payload preview e snapshot immutabile del contesto; API condivise nel core.
- [ ] Consolidare layout `.ordo/`, convenzioni ID, timestamp, autori, schema version e policy di commit; riconciliare directory divergenti documentate (`explore`/`architectures` contro i nomi storici).
- [ ] Formalizzare JSON Schema/Zod-equivalenti per config, index, spec, exploration, architecture, decision, plan, session, event e audit.
- [ ] Definire migrazioni di schema, validatore, messaggi diagnostici e compatibilità backward.
- [ ] Implementare provenienza `fact | inference | curated`, evidenza per osservazione, conferma/smentita e stato freshness.
- [ ] Aggiungere snapshot legati a commit/branch, diff snapshot e manifest esatto di contesto con hash per ogni run.
- [ ] Aggiungere profili di contesto, budget configurabili e spiegazione di inclusioni/esclusioni.
- [ ] Aggiungere redazione segreti e test per ignore, symlink, path traversal, file grandi/binary e workspace esterno.
- [ ] Garantire scrittura atomica, optimistic concurrency, recovery e conflitto esplicito fra modifiche concorrenti.
- [x] Definire il modello runtime di `.ordo/profile.json` con riferimenti a ID/hash di agenti, skill, regole e workflow, modalità enabled/recommended/default/required/disabled e validazione catalogo.
- [x] Implementare bootstrap, show, validate, set e dry-run del profilo condiviso via CLI; gli aggiornamenti locali serializzano le scritture con un lock.
- [x] Congelare nel record sessione hash del profilo e riferimenti/hash di agente, skill, regole e workflow selezionati; validare le scelte contro il profilo.
- [ ] Aggiungere JSON Schema condivisi e migrazioni di versione; completare merge/version check Git specifico del profilo.
- [ ] Implementare preferenze personali non committate e UI per confronto/approvazione delle modifiche al profilo.
- [ ] Definire selezione skill obbligatorie/raccomandate/opzionali per contesto e budget, mostrando il risultato preciso prima di ogni run.
- **Gate fase:** schema e CLI possono inizializzare/validare/preview un progetto; dato uno snapshot, il payload inviato è riproducibile byte-per-byte o tramite serializzazione canonica/hash verificato.

### Fase 2 — Specifiche, decisioni e piano governati

- [x] Persistenza iniziale di spec, esplorazioni, proposte architetturali, piani e sessioni nel core.
- [x] Comandi CLI iniziali per brainstorm, spec, architect, plan e session; test mirati presenti.
- [ ] Completare modello della spec: non-goals, attori, regole, requisiti non funzionali, assunzioni/domande, rischi, fonti, criteri ID e approvazioni.
- [ ] Rendere obbligatori per ogni spec: contesto business/obiettivo, stakeholder o utenti, problema, valore atteso, funzionalità, fonti, regole, criteri e stato di approvazione.
- [ ] Collegare brainstorm selezionato → spec; architettura approvata → decision records; spec → piano; step → criteri.
- [ ] Implementare validazione semantica criteri (univoci, verificabili, non vuoti), link dangling e riferimenti superseded.
- [ ] Implementare grafo dipendenze del piano, rilevamento cicli, readiness deterministica, blocchi e transizioni atomiche.
- [ ] Aggiungere diff e approvazioni per spec/decision/architecture/plan; impedire modifica silenziosa dopo approvazione, richiedendo nuova revisione.
- [ ] Rendere `--dry-run`, `--json`, exit code e non-interactive consistenti per tutte le operazioni mutanti.
- [ ] Prove CLI/API end-to-end da brainstorming fino a piano approvato senza provider AI.
- **Gate fase:** un team può concordare requisiti, prendere decisione e ottenere piano eseguibile/bloccabile soltanto tramite transizioni valide.

### Fase 3 — Session runtime e tool governati (transizione al runtime harness)

- [x] Runtime diretto su API provider con streaming/tool loop (prototipo transitorio, non percorso prodotto).
- [x] Tipi sessione persistente ed event log append-only; pacchetti provider OpenAI/Anthropic e repository tools presenti come prototipo da dismettere o riusare solo se compatibile con gli harness.
- [ ] Completare lifecycle sessione: start, stop, cancel, resume, crash recovery, turn boundaries, idempotency e correlazione trace/eventi.
- [ ] Applicare policy in modo centralizzato a tutte le chiamate tools e subprocess; classificare read/write/shell/network/destructive.
- [ ] Implementare sandbox/percorso di esecuzione per agenti e tools, allowlist path, timeout, output cap, symlink guard e cancellazione subprocess.
- [ ] Registrare approvazioni con attore, tool/input digest, ambito, scadenza e motivazione; “allow session” limitato e revocabile.
- [ ] Catturare diff pre/post, branch/commit, tool output redatto ed errori senza perdere output dopo crash.
- [ ] Non aggiungere provider diretti; spostare sessione/esecuzione verso AgentAdapter della Fase 4 e chiarire il ciclo di vita dei package `ordo-provider-*` esistenti.
- [ ] Salvare manifest immutabile di prompt template, contesto, strumenti, policy e versioni per ogni sessione.
- [ ] Registrare nel manifest profilo condiviso/versione, agente, skill e regole effettivamente selezionati, issue collegata e override autorizzati.
- **Gate fase:** un run può essere fermato, analizzato e ricostruito; tool mutanti non passano senza decisione; nessun segreto appare nei fixture/log.

### Fase 4 — Integrazione effettiva Claude Code e Codex

- [x] Adapter Claude e Codex attuali per rilevare/installare/configurare file canonici nei rispettivi layout di harness.
- [x] Completare desk research sulle interfacce ufficiali Claude Code CLI/Agent SDK e Codex app-server/CLI, con raccomandazione e confronto: [spike-agent-adapters.md](spike-agent-adapters.md).
- [x] Implementare primo adapter CLI headless Claude con detection versione, spawn senza shell, streaming/event parsing e test con processo finto (`ordo agent claude`); non equivale ancora a prova contro harness installato.
- [x] Smoke test reale Claude Code su macOS con login Claude Pro: il binario NVM v2.1.282, senza `ANTHROPIC_API_KEY`, completa `ordo agent claude`, restituisce risposta, sessione nativa e usage; test in directory scratch senza file del progetto modificati.
- [x] Introdurre il contratto runtime `AgentAdapter` neutrale, registry, eventi normalizzati e capability esplicite; mantenerlo distinto dagli adapter di installazione contenuti (`claude`/`codex`).
- [ ] Completare la matrice Claude installato: versioni minime/OS, approvals, sandbox, resume nativo, errori di rete, timeout e crash. La prova reale attuale copre solo un run headless su macOS.
- [x] Implementare vertical slice `ordo agent claude` per uno step pronto collegato a spec valida, plan, profilo condiviso e snapshot contesto immutabile; registrare manifest, eventi, session ID e stato review. Test coperti via harness finto.
- [x] Propagare SIGINT all'adapter Claude, terminare il processo figlio, salvare l'ID nativo ricevuto, mettere sessione e step in pausa e restituire exit code 130; coprire il lifecycle con test deterministici.
- [ ] Completare l'esecuzione Claude con richieste di approval nella UI, enforcement scope/path e resume; la capability dichiarata come non supportata non deve essere simulata.
- [x] Implementare vertical slice Codex via app-server v2 (initialize/thread/start/turn/start, streaming, thread ID, interrupt) e CLI `ordo agent codex`; testare con server JSON-RPC fittizio e completare smoke test end-to-end non-mutante in scratch con `codex-cli 0.157.0`, audit Ordo verificato e scratch eliminato.
- [x] Gestire richieste app-server Codex di approvazione comando/modifica/permessi sandbox con callback runtime asincrono, decisioni solo per singola richiesta, risposta protocol-native, grants permessi limitati al turno, default deny senza handler e audit JSONL; aggiungere conferma CLI interattiva con deny predefinito.
- [ ] Integrare la stessa presentazione/risoluzione approval nel pannello Electron e testare il lifecycle completo su richieste operative in sandbox scratch.
- [x] Prototipo transitorio: applicare al prompt diretto agente, skill e regole attive dal profilo condiviso con verifica hash.
- [x] Includere selezione profilo con hash e snapshot business context nel manifest e prompt dell'adapter Claude.
- [x] Applicare manifest/context/profile selezionati anche al prompt Codex e registrare versione e capability effettivamente dichiarate; resume e usage Codex restano non supportati e dichiarati tali.
- [ ] Aggiungere comando/setup MCP Ordo locale stdio, inizialmente read-only, con install/uninstall opt-in e rollback per ciascun client.
- [ ] Aggiungere MCP tools mutanti solo dopo policy/approval centralizzata, input schema, audit, rate/size limit e contract test.
- [ ] Garantire snapshot/scope/policy uguali per entrambi; loggare differenze di capability e non simulare funzioni mancanti.
- [x] Preflight di connessione prima di ogni `ordo agent`: rileva binario, versione e login tramite `claude auth status --json` / `codex login status`. Se il risultato non è "connesso" l'esecuzione si ferma con istruzioni, senza creare sessioni né avviare lo step; eventuali API key restano confinate alla CLI ([ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md); test in `packages/runtime/test/connection.test.mjs` e `packages/cli/test/agent.test.mjs`).
- [ ] Test matrix su versioni minime dichiarate, autenticazione non presente, errori rete, approvazione negata, timeout, resume e crash. (Autenticazione assente coperta dal preflight con harness finti; il resto è aperto.)
- **Gate fase:** medesimo step avviabile con entrambi gli agenti, output/eventi normalizzati e audit completo; rifiuti/approvazioni rispettati da entrambi.

### Fase 5 — Verify, review e record con tracciabilità

- [ ] Implementare registry di verifiche dichiarate dal progetto: test, lint, typecheck, build, comandi custom; allowlist/preview e timeout.
- [ ] Distinguere esito tecnico da conformità business; mappare ogni criterio ad evidenza, copertura e stato.
- [ ] Rilevare file modificati fuori scope, step non correlati, spec cambiata dopo snapshot e verifiche mancanti.
- [ ] Costruire report review deterministico con diff, criteri, piano, test, assunzioni, rischi e output agent.
- [ ] Richiedere decisione umana con autore, timestamp, motivazione e stato; eventuale review AI è consultiva.
- [ ] Implementare `record` con diff per brain/decision/spec/plan, link commit/PR e approvazione policy.
- [ ] Esportare sessione/audit in formato redatto, versionato e riproducibile; definire retention/cancellazione.
- [ ] CI: validate spec/piani/link/policy; verify headless con report JSON, codici di uscita stabili e nessun provider richiesto per i check locali.
- **Gate fase:** una PR/task si può seguire dal requisito al diff e alle prove; criteri falliti/non verificati bloccano la chiusura dichiarata.

### Fase 6 — Team workflow, Git e progetti legacy

- [ ] Definire ruoli e responsabilità (contributor, reviewer, tech lead, admin) e matrice approvazioni per fase/rischio.
- [ ] Integrare Git status/branch/commit/PR provider-neutrale; referenziare artefatti da branch/commit e supportare worktree isolati.
- [ ] Gestire conflitti `.ordo/` via optimistic concurrency, messaggi merge dedicati e validazione post-merge.
- [ ] Implementare Context Lens: mappa moduli/entrypoint/flussi con citazioni file/range e classificazione fatto/inferenza/curato.
- [ ] Aggiungere refresh incrementale, snapshot delta e workflow di onboarding legacy senza richiedere documentazione completa iniziale.
- [ ] Aggiungere handoff: nuovo membro/agent ricostruisce obiettivo, decisioni, status, blocchi, comandi e prossima azione da repository.
- [ ] Progettare interfaccia tracker neutrale e fare spike Jira su auth, API, mapping custom field, rate limit, permessi e compatibilità Cloud/Data Center se richiesta.
- [ ] Implementare collegamento ticket Jira ↔ spec Ordo con import esplicito, provenance, anteprima/diff campi, refresh e gestione stale state.
- [ ] Collegare issue a piano/step/sessione/diff/verifiche/PR e mostrare il contesto business attivo in Project Home e Run Workspace.
- [ ] Aggiungere push selettivo opt-in verso Jira per link/stato/campi approvati; conflitti e sync bidirezionale richiedono scelta umana e audit.
- [ ] Testare integrazione senza Jira (funzionalità core intatta), con token assente/revocato, rate limits, campi custom, dati sensibili e conflitti simultanei.
- [ ] Definire modalità lavoro condiviso locale via Git e policy per eventuale sync remoto multiutente; nessun account cloud obbligatorio.
- [ ] Validare con pilot greenfield e legacy e raccogliere metriche di review/rilavorazione con misurazione esplicita.
- **Gate fase:** due contributor su clone/branch differenti possono lavorare senza perdere artefatti o sovrascrivere decisioni; nuovo membro riprende il task senza chat privata.

### Fase 7 — MCP, CLI pubblica e automazione

- [ ] Stabilizzare CLI workflow completa, help, `--json` schema versionato, `--dry-run`, exit codes, stdin/stdout e compatibilità.
- [ ] Finalizzare server MCP stdio e documentare setup/update/uninstall per Codex e Claude Code.
- [ ] Aggiungere test di interoperabilità MCP, permission escalation, invalid inputs e compatibilità protocol/versione.
- [ ] Preparare action/template CI opzionale per validare artefatti e allegare report senza esporre segreti.
- [ ] Comandi di import/export, backup/restore e diagnosi per `.ordo/` danneggiato o schema vecchio.
- [ ] Documentare workflow tipici, policy team, dati inviati, troubleshooting e modalità offline.
- **Gate fase:** tutte le operazioni base sono utilizzabili headless in CI e dai due agenti con artefatti identici alla UI.

### Fase 8 — UX VS Code e prototipo Code OSS

- [x] Pacchetto sorgente iniziale `packages/vscode-ordo` con vista progetto, lettura artefatti `.ordo/` e creazione guidata di business requirement spec.
- [ ] Trattare l'estensione corrente come prototipo verticale: collegarla a workflow core senza logica duplicata e aggiungere test host/webview.
- [ ] Completare MVP UI: Project Home, context lens, editor spec, architect/decision, plan board, sessione, verify/review e audit.
- [x] Pagina Ordo a tutta larghezza nell'editor, con menu laterale a schede: Overview, Requirements, Plans, Decisions, Sessions, Team profile, AI connections. L'icona nella barra delle attività apre la pagina e chiude la sidebar; la scheda aperta viene ricordata.
- [x] Profilo di team nell'editor: agenti, skill, regole e workflow di `content/` con modalità required/default/recommended/enabled/disabled. Le modifiche restano in sospeso, con elenco "da → a", fino al salvataggio in `.ordo/profile.json`; le voci cambiate nel catalogo vanno accettate. Anteprima di ciò che riceve ogni sessione. Catalogo del repository o, in mancanza, quello incluso in Ordo. Test in `packages/vscode-ordo/test/profile.test.mjs`.
- [x] Proposte di skill e regole in base allo stack rilevato (`metadata.stack` nelle skill, cartella per le regole), sempre con la loro evidenza (es. `Fastify (package:fastify)`). Non ripropone voci già decise dal team e non si applicano senza salvataggio ([catalog-authoring](catalog-authoring.md); test in `packages/core/test/profile-suggestions.test.mjs`).
- [ ] Aggiungere selettore agente/skill per sessione con indicazione chiara di default, raccomandato, obbligatorio e disabilitato dal profilo team (il profilo di team esiste; manca la scelta per singola sessione nel Run Workspace).
- [x] Aggiungere AI Connections: rilevamento, versione e stato di autenticazione di Claude Code e Codex; path dell'eseguibile opzionale (assoluto, scope `machine`) e Recheck. Le credenziali restano ai rispettivi harness; l'API key opzionale dell'utente segue [ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md). Oggi è una sezione del pannello Ordo, non ancora una pagina Settings dedicata; la webview non ha test automatici.
- [x] Estensione pubblicabile `pompeitech.ordo`: `pnpm --filter ordo package` produce `ordo.vsix` con `@vscode/vsce`, catalogo incluso e nessun avviso. Installata e verificata in VS Code 1.138 con profilo isolato ([ADR-0002](adr/0002-ordo-come-estensione-vs-code.md)).
- [ ] Pubblicare su VS Code Marketplace e Open VSX: publisher `pompeitech`, icona PNG, verifica negli editor derivati da VS Code prima di dichiararne la compatibilità.
- Tema Lava rimosso da Ordo (ADR-0002): sarà un'estensione tema Pompei Tech separata, generata dalla palette di [theme.md](theme.md).
- [x] Creare un piano di implementazione da una spec condivisa nel pannello Ordo (`createPlan` del core, primo step con output e verifiche). Coperto da test di integrazione sulla stessa fixture dello smoke (`packages/vscode-ordo/test/plan-flow.test.mjs`); il percorso UI interattivo non è ancora stato pilotato end-to-end.
- [x] **Collegamento degli artefatti e audit nel core.** Una funzione unica (es. `workflowStatus`) che, per ogni requisito, calcola stato, gate e blocchi di ogni fase brainstorm → record, seguendo i collegamenti già presenti: esplorazione→spec, architettura/piano→spec, step→sessione. Ogni cambio di stato scrive un registro append-only (da → a, attore, quando, motivo). Per il passato si ricostruisce chi e quando dalla storia Git di `.ordo/`, indicando sempre la fonte di ogni dato. Esposta anche dalla CLI, così interfaccia e riga di comando coincidono. Fatto: `workflowStatus` e `workflowTrail` in `packages/core/src/lifecycle/`; audit append-only in `.ordo/audit/<tipo>/<id>.jsonl`, scritto da ogni creazione e cambio di stato di esplorazioni, spec, architetture, piani e step; `ordo status [--spec <id>]` ([riferimento CLI](cli-reference.md); test in `packages/core/test/lifecycle.test.mjs` e `packages/cli/test/status.test.mjs`). L'attore viene da `ORDO_ACTOR` o da `git config user.name`, senza verifica d'identità.
- [ ] **Pipeline del workflow** nell'estensione: una riga per requisito e una colonna per fase, con stato, motivo del blocco e azione successiva consentita. Dopo ADR-0003 le colonne sono i nodi del flusso attivo.
- [ ] **Decision trail**: per ogni decisione, la linea del tempo del percorso seguito (alternative scelte e scartate, spec, architettura e decisioni, piano, step, sessioni con agente e approvazioni, poi verify/review/record), con attore, data e fonte di ogni nodo.
- [ ] **Plan board**: gli step del piano come grafo delle dipendenze, con stato, agente, verifiche richieste ed esecuzione dallo step (dipende dal Run Workspace).
- [x] ADR-0003: flussi disegnabili, review durante il lavoro e replay ([ADR-0003](adr/0003-flussi-disegnabili-e-replay.md)). Libertà e livello decisi: disegno libero entro R1–R6 partendo da modelli; catalogo di flussi del team con un flusso scelto per requisito; versione del flusso vincolata al requisito e migrazione solo esplicita e umana.
- [x] **Replay del flusso predefinito**: tipo di attore (persona, agente, sistema) nell'audit; decisione di review esplicita (approvato, modifiche richieste, bloccato) con nota in core, CLI ed estensione; token per task agente con evidenza del più costoso ("non misurato" dove manca); percorso basato solo sui registri Ordo, senza le voci Git. Fatto:
  - `reviewPlanStep` nel core e `ordo plan review`;
  - tipo di attore nell'audit;
  - `ordo agent` registra la pausa per review come ⚙️ sistema;
  - scheda **Workflow** nell'estensione, con pipeline, azioni umane confermate (segna ready, approva architettura, review dello step), replay con barra temporale, filtro sulle decisioni umane e token per esecuzione;
  - test in `packages/core/test/lifecycle.test.mjs` e `packages/cli/test/status.test.mjs`.

  Resta da fare: la webview non ha test automatici, e i token di Codex non sono misurati.
- [x] **Code review di ogni task agente (prima della beta).** *Fatto:*
  - *foto prima e dopo in `ordo agent`;*
  - *`ordo plan changes` e `ordo plan review --reject/--reject-all`;*
  - *ripristino tutto-o-niente con rilevamento dei conflitti;*
  - *file accettati e rifiutati nell'audit e nel replay;*
  - *nell'estensione, "Review step" apre l'elenco dei file con spunte e diff editor di VS Code;*
  - *demo con un caso reale da annullare.*

  *Esempio d'uso nel [README dell'estensione](../packages/vscode-ordo/README.md) e nel [riferimento CLI](cli-reference.md). Test in `packages/core/test/changes.test.mjs`, `packages/cli/test/agent.test.mjs`, `packages/vscode-ordo/test/code-review.test.mjs` e `scripts/demo/test/scenario.test.mjs`.* Prima e dopo ogni task Ordo fotografa lo stato dei file con un tree Git temporaneo: niente commit, niente modifiche all'area di lavoro, file non tracciati inclusi. Il diff fra le due fotografie mostra solo le modifiche dell'agente, anche su un'area di lavoro già modificata. La review elenca i file cambiati con il diff editor di VS Code: accetta o rifiuta per file (il rifiuto ripristina la versione pre-task), più accetta/rifiuta tutto. Se l'utente ha modificato a mano un file nel frattempo, Ordo avvisa e non sovrascrive. L'esito diventa la decisione di review di [ADR-0003](adr/0003-flussi-disegnabili-e-replay.md) (approvato, modifiche richieste, bloccato; nota; file accettati e rifiutati) e compare nel replay come decisione umana. Stesso meccanismo per ogni harness supportato; parità CLI per la decisione. Assorbe "catturare diff pre/post" (Fase 3) e "approvazioni/diff UI" per la parte agenti.
- [ ] **Designer dei flussi**: canvas a nodi e frecce che parte da modelli (Standard, Fix veloce, Regolamentato); validazione R1–R6 nel core; salvataggio versionato in `.ordo/flows/<id>.json`; scelta del flusso predefinito nel profilo e del flusso per requisito alla creazione; `ordo flow validate|show`.
- [ ] **Esecuzione guidata dal flusso**: motore a grafo nel core; ogni requisito vincolato alla versione del flusso con cui è partito; azione umana "aggiorna al nuovo flusso", con recupero dei nodi obbligatori nuovi e registrazione nell'audit; `workflowStatus` e il replay leggono la versione vincolata.
- [ ] Aggiungere controlli run governati: turn/tool iteration cap, auto-continue e massimo passaggi, concurrency separata per pianificazione Architect/step DAG/background agent e timeout di startup, primo evento e run totale.
- [ ] Aggiungere Context Lens configurabile: budget input/output, sorgenti di conoscenza/wiki auto-rilevate o manuali, ricerca/add/remove/hide/show, policy all-approved/auto/manual/index-only e preview con conteggi/provenienza/inclusioni/esclusioni.
- [ ] Aggiungere proposta di apprendimento dal run (fine sessione o background) con diff approvabile; vietare aggiornamenti silenziosi di brain/profile condivisi.
- [x] Consumo del piano nella Overview e nelle AI connections: finestre di 5 ore e settimanali con percentuale e reset. Codex è letto dal vivo con `account/rateLimits/read` di app-server. Claude Code è l'ultimo valore visto nei `rate_limit_event` di un'esecuzione Ordo, perché l'API di utilizzo di Anthropic è ancora sperimentale. Con API key o cloud non ci sono finestre, e la pagina lo dice. I dati sono personali e restano sulla macchina (`$XDG_STATE_HOME/ordo/usage.json`), mai in `.ordo/` né nel log di sessione (test in `packages/runtime/test/usage.test.mjs` e `packages/cli/test/agent.test.mjs`).
- [ ] Aggiungere Skills manager e Monitoring con sessioni, agent, tool, usage/costo/latency solo se esposti in modo affidabile da Claude Code/Codex; valori mancanti restano ignoti.
- [ ] Aggiungere controllo MCP: elenco/stato/tool disponibili e modifica `.vscode/mcp.json` solo con preview, scope e audit.
- [ ] Escludere dalle impostazioni Ordo API key/endpoint di provider arbitrari, modello locale, endpoint/credenziali Artiforge e AI autocomplete che richieda un terzo runtime; proporre solo i modelli dichiarati disponibili dai due harness. Unica eccezione ammessa: l'API key Anthropic/OpenAI dell'utente, usata solo per autenticare Claude Code/Codex e mai per chiamate dirette di Ordo ([ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md)); nessun endpoint configurabile.
- [ ] Rendere Project Home una vista condivisa del prodotto: contesto business, utenti, regole, funzionalità/backlog, spec e fonti Jira opzionali.
- [ ] Aggiungere in Run Workspace issue Jira attiva e link contestuali spec/criteri; rendere visibili provenienza e stato di sync.
- [ ] Aggiungere approvazioni/diff UI, navigazione requisiti↔file↔test, accessibilità, localizzazione, stati vuoti/errore/offline.
- [ ] Usare i servizi runtime/CLI in modo consistente; IPC/webview tipizzato, nonce/CSP, validazione di ogni messaggio e trust UX.
- [ ] Completare lo spike Code OSS: la build desktop locale, l'overlay iniziale di branding, Open VSX come gallery e il caricamento dev di Ordo sono stati provati; restano licenze/SBOM, installazione estensioni, isolamento dati completo, packaging built-in e pipeline multi-OS/signing/update ([evidenze e limiti](spike-code-oss.md)). La prova ha richiesto una patch downstream per non registrare Copilot, mantenendo Claude Code e Codex.
- [x] Rendere riproducibile la patch downstream Code OSS con patch set fissato al commit upstream e script idempotente che rifiuta checkout non puliti/non riconosciuti; aggiungere test log per Claude/Codex e avvio con asserzione Ordo attivo e Copilot assente (smoke macOS superato: [istruzioni e limiti](spike-code-oss.md)).
- [x] Auditare sorgente e pipeline upstream Copilot: la task desktop include `compileCopilotExtensionBuildTask`, il packaging copia `.build/extensions/**`, l'SDK è dipendenza production e gli entry point importano staticamente `CopilotAgent`; il flag runtime da solo non elimina questi artifact ([evidenze](spike-code-oss.md#audit-packaging-copilot-25-settembre-2026)).
- [x] Estendere la patch downstream affinché packaging Ordo escluda estensione Copilot e runtime SDK nativi e i relativi manifest/versioni; rimuovere del tutto import e registrazione del provider Copilot dai due entry point Agent Host (l'import dinamico dietro flag veniva portato in cima al bundle da esbuild e faceva crashare l'Agent Host senza SDK). `@vscode/copilot-api` resta per ora, ma serve solo al trasporto proxy Copilot del provider Claude, da disattivare. Patch versionate e applicazione idempotente: [dettagli e limiti](spike-code-oss.md#audit-e-patch-packaging-copilot-25-settembre-2026).
- [x] Compilare e pacchettizzare la `.app` macOS di spike, verificare manifest/ASAR/estensioni con `pnpm ordo:code-oss:verify-package` e ripetere smoke desktop pacchettizzato: Ordo preinstallato attivo, snapshot della fixture caricato (log `Ordo`), provider Copilot escluso. Claude e Codex **non** si registrano nell'Agent Host dell'app pacchettizzata, perché `product.json` non ha `agentSdks` ([ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md)); lo smoke li verifica solo con `ORDO_AGENT_SDK_ROOT` (strumento di sviluppo).
- [ ] Patch downstream 0003: disattivare il trasporto proxy Copilot del provider Claude (token GitHub/`@vscode/copilot-api`) e rivalutare se `@vscode/copilot-api` può uscire dal bundle.
- [ ] Riapplicare il patch set corrente da un checkout pulito del commit fissato e ripetere build, verify e smoke pacchettizzato (finora verificato solo sul checkout di spike già modificato).
- [ ] Completare SBOM/licenze, audit di codice/risorse Copilot condivisi o residui nel bundle, e ripetere packaging/audit per ogni target previsto prima di affermare l'assenza completa di codice Copilot o autorizzare una release.
- [ ] Integrare e preinstallare Ordo nel workbench desktop, collegandolo ai servizi core/runtime attraverso IPC/webview tipizzati, e ripetere la prova end-to-end su un repository fixture.
- [ ] Produrre prototipo desktop Code OSS/Electron con bootstrap e installazione Ordo, mantenendo il repository `app/` importato fuori dal ruolo di source of truth finché non esiste una pipeline dichiarata.
- **Gate fase:** l'utente completa intero workflow dalla UI, ma può aprire lo stesso progetto con CLI o altro client senza differenze di stato.

### Fase 9 — Ordo Desktop prodotto (sospesa, [ADR-0002](adr/0002-ordo-come-estensione-vs-code.md))

- [ ] Scegliere e documentare strategia: fork/build Code OSS gestito da Ordo o shell workbench compatibile; completare review legale e supply chain.
- [ ] Costruire packaging multi-OS, branding, icone, first-run, workspace trust, updater firmato, crash recovery e rollback.
- [ ] Implementare tutte le superfici UX elencate (§8), integrazione terminale, SCM, diff editor, command palette e collegamenti requisiti-codice.
- [ ] Implementare Control Center per stato/capabilities Claude Code e Codex, MCP, policy, ruoli, usage/costi esposti dai rispettivi harness e retention senza esporre segreti.
- [ ] Definire marketplace/extensions consentite, fonti, allow/block policy e gestione licenze; nessuna dipendenza non redistribuibile implicita.
- [ ] Testare performance su repository grandi, multi-root, remote/SSH/devcontainer se supportati e scenari offline.
- [ ] Completare accessibilità, localizzazione, tutorial, help in-app e telemetria esclusivamente opt-in.
- [ ] Beta chiusa con team reali; raccogliere crash, task completion, review loops, onboarding e fiducia senza inviare contenuti repository.
- **Gate fase:** installabile e aggiornabile autonomamente, sicuro, accessibile e workflow parity CLI; criteri §13 soddisfatti.

### Fase 10 — Release, stabilità e crescita

- [ ] Release process end-to-end: versioni core/schema/CLI/app, changelog, SBOM, firme, notarizzazione, provenance, canali preview/stable e rollback.
- [ ] Contratti di compatibilità pubblici per `.ordo/`, MCP, AgentAdapter, CLI JSON e plugin API.
- [ ] Security review indipendente, threat model aggiornato, dependency/license scan e piano di incident response.
- [ ] Migrazioni supportate da almeno release precedenti secondo policy dichiarata; backup automatico pre-upgrade e test downgrade/restore.
- [ ] Misurare affidabilità, completezza audit, pass rate verifiche, rework e tempo review; costo solo con dati provider verificabili.
- [ ] Aprire SDK/plugin API solo dopo stabilità dei contratti interni e documentare versioning/supporto.
- [ ] Valutare sync/team service, policy management centralizzato e analytics solo come opt-in, con threat/privacy model e senza rimuovere la modalità locale.
- **Gate release:** acceptance §13, support matrix, documentazione utenti/admin, sicurezza e assistenza operativa approvate.

## 14.1 Idee da valutare dopo la beta 2

Idee raccolte durante lo sviluppo, non necessarie per le beta. Vanno riesaminate con priorità e criteri di accettazione quando le beta saranno definite (oggi la roadmap non fissa ancora il perimetro di "beta" e "beta 2").

- **Review per parti di file:** accettare o rifiutare singoli hunk del diff di un task, non solo file interi.
- **Commenti di review rimandati all'agente:** note sulle righe del diff inviate come "modifiche richieste" al task successivo, con lo stesso contesto.
- **Task in worktree separati:** esecuzione isolata e parallela di step indipendenti, con review e integrazione nel branch principale su consenso.
- **Altri harness oltre Claude Code e Codex:** il meccanismo di review sarebbe identico, ma serve un ADR che modifichi l'invariante 11 e il vincolo di prodotto del §7.

## 15. Stato corrente: distinzione importante

- La CLI/catalogo e il nucleo deterministico rappresentano la base già esistente del progetto.
- Sono presenti implementazioni iniziali di context, spec, explore/brainstorm, architettura, plan, sessioni e runtime; vanno ancora completate rispetto ai requisiti e ai gate sopra indicati.
- `packages/adapter-claude` e `packages/adapter-codex` gestiscono layout/installazione dei contenuti. Il runtime separato `packages/runtime` espone il contratto comune `AgentAdapter`, registry/capability e adapter esecutivi iniziali Claude Code/Codex; il client Codex app-server è fixture-tested e ha superato uno smoke test non mutante con `codex-cli 0.157.0` (Fase 4). Un preflight di connessione blocca l'esecuzione se l'harness non è installato o autenticato.
- L'adapter Claude ha superato uno smoke test locale reale su macOS con login Claude Pro, senza chiave API in ambiente; approvals UI, path enforcement, resume e matrice cross-platform/versione restano aperti.
- `packages/vscode-ordo` è l'estensione VS Code `pompeitech.ordo`, cioè il prodotto interattivo secondo ADR-0002. È una pagina a tutta larghezza con requisiti, piani, decisioni, sessioni, profilo di team con proposte, connessioni e consumi degli agenti. Non esegue ancora agenti dall'interfaccia né implementa l'intero workflow.
- La copia locale `app/` di output/risorse Code OSS è stata rimossa; non era una pipeline sorgente buildabile/versionabile di Ordo e non costituiva prova di un desktop integrato o distribuibile.
- La roadmap è un piano di prodotto: checkbox di implementazione sono da aggiornare con prove (codice, test, documentazione e, per release, artefatto pubblicato), non con intenzioni o prototipi parziali.

## 16. Decisioni aperte da chiudere prima delle rispettive fasi

- Quali versioni e interfacce ufficiali di Claude Code e Codex supportare e quali capability sono obbligatorie per una sessione.
- Come Ordo orchestra i rispettivi harness mantenendo workflow, policy e audit centrali, senza duplicarne inference/tool loop.
- Schema canonico e politica su quali eventi/prompt/diff siano registrati, esportati e versionati.
- Supporto worktree e assegnazione concorrente step/team senza backend remoto.
- Strategia definitiva Code OSS, marketplace, auto-update, licenze, branding e responsabilità di manutenzione del fork.
- Confini dell'MVP desktop e sistemi operativi della prima beta.
- Ruoli/approvazioni default per team piccoli rispetto a organizzazioni regolamentate.
- Retention, cifratura locale, backup e classificazione dati per le sessioni.
- Struttura precisa del profilo repository (`profile.json` o sezione di `config.json`), comportamento dei default/required e processo per proporre cambi di profilo via pull request.
- Direzione di sync Jira iniziale, scope OAuth/API token, campi autorizzati, supporto Jira Cloud/Data Center e semantica per commenti/stati/transizioni.
- Quali artefatti contengono business context committabile e quali dati ticket/sessione sono solo locali o referenziati per hash.

Le decisioni devono diventare ADR con alternative, motivazione, responsabile e revisione; non vanno risolte implicitamente dalla UI o da un provider. Decisioni già chiuse:

- [ADR-0001](adr/0001-connessioni-agenti-e-credenziali.md) — connessioni a Claude Code/Codex e credenziali: CLI installate dall'utente, nessun SDK ridistribuito, API key solo per autenticare le CLI.
- [ADR-0002](adr/0002-ordo-come-estensione-vs-code.md) — Ordo come estensione VS Code; Ordo Desktop su Code OSS congelato; tema come estensione separata.
- [ADR-0003](adr/0003-flussi-disegnabili-e-replay.md) — flussi disegnabili entro regole di sicurezza partendo da modelli, catalogo di flussi del team con scelta per requisito, versione vincolata e migrazione esplicita, review umana durante il lavoro, replay con decisioni umane e token.

## 17. Come mantenere questa roadmap

- Aggiornare checkbox e stato nello stesso PR che porta il comportamento, includendo link a test/docs/ADR quando utile.
- Non spuntare intere fasi quando è completata solo una parte: mantenere task atomici.
- Se scope o ordine cambiano, registrare decisione e motivo; aggiornare roadmap e specifiche correlate insieme.
- Riesaminare roadmap e rischi a ogni milestone; mantenere separate “implemented”, “verified” e “released”.
- Ogni nuovo requisito deve indicare owner/stakeholder, motivazione, criteri di accettazione, rischio e fase impattata.
