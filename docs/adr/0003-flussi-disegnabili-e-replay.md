# ADR-0003 — Flussi di lavoro disegnabili, review durante il lavoro e replay

- **Stato:** accettata, 25 settembre 2026 (punti su libertà e livello chiusi lo stesso giorno)
- **Responsabile:** Davide D'Antonio
- **Revisione:** dopo i primi team che usano flussi propri
- **Modifica:** l'invariante 1 della [roadmap](../ordo-roadmap.md) ("il workflow è sempre quello di Ordo") e la tabella del §4

## Contesto

La roadmap fissa un solo workflow (brainstorm → spec → architect → plan → implement → verify → review → record) e vieta a qualsiasi interfaccia di cambiarlo. I team hanno però processi diversi: dove serve un'approvazione, chi la dà, quanti giri di review, quali controlli prima di chiudere.

Il responsabile di prodotto chiede tre cose:
1. **disegnare** graficamente il flusso;
2. **rivivere** come è andato davvero ogni requisito, distinguendo le **decisioni umane** dalle azioni degli agenti e mostrando quale task ha consumato più token;
3. una **review fatta durante il lavoro**, non come fase unica alla fine.

Stato attuale utile:
- `workflowStatus`, `workflowTrail` e il registro di audit append-only (`.ordo/audit/`) calcolano e registrano già fasi e transizioni del workflow fisso.
- `ordo agent` registra per ogni sessione eventi, approvazioni e (per Claude Code) i token usati.
- La macchina a stati di `packages/core/src/workflows/` esegue in sequenza gli step dei workflow Markdown del catalogo. Non gestisce rami né cicli, quindi non basta come motore.

## Decisione

1. **Il flusso è disegnabile.** Un flusso è un grafo versionato in `.ordo/flows/<id>.json`, condiviso in Git come il profilo di team. Si chiama "flusso" (`flow`) per non confonderlo con i workflow del catalogo `content/workflows/`, che sono istruzioni per gli agenti.
   - **Nodi:** esplorazione, spec, architettura, piano, 🤖 task agente, 👤 review umana, 👤 approvazione umana, ✅ verifica (comandi e test), 📝 registrazione.
   - **Frecce:** percorso normale ed esiti condizionati dei nodi umani (`approvato`, `modifiche richieste`, `bloccato`).
   - **Proprietà dei nodi:** chi può approvare, harness (Claude Code o Codex), skill e regole (entro il profilo di team), verifiche obbligatorie.
2. **Regole di sicurezza che nessun disegno può violare**, verificate dal core al salvataggio e all'esecuzione:
   - R1: un task agente ha a monte una spec approvata e un piano.
   - R2: ogni task agente è seguito da una review umana prima di un altro task agente o della registrazione finale. È la **review durante il lavoro**.
   - R3: i cicli sono ammessi solo come ritorni "modifiche richieste" da un nodo umano verso un nodo precedente.
   - R4: un nodo umano può essere completato solo da una persona, mai da un agente.
   - R5: il flusso ha un inizio e una fine, e ogni nodo è raggiungibile.
   - R6: i task agente usano solo Claude Code o Codex ([ADR-0001](0001-connessioni-agenti-e-credenziali.md)).
3. **Il flusso predefinito è il workflow attuale** espresso come grafo. Finché un team non lo modifica, il comportamento non cambia.
4. **L'invariante 1 diventa:** *il lavoro segue sempre un flusso Ordo, quello predefinito o quello disegnato e validato dal team; nessuna interfaccia, CLI o agente ne salta i nodi o i cancelli, e le regole R1–R6 valgono sempre.*
5. **Registrazione di ciò che serve al replay:**
   - l'audit indica il **tipo di attore** (`human`, `agent` o `system`) oltre al nome;
   - la **decisione di review** diventa un evento esplicito: `approvato`, `modifiche richieste` o `bloccato`, con nota, revisore e step o nodo a cui si riferisce;
   - i **token** di ogni task agente vengono dagli eventi `usage` delle sessioni. Dove l'harness non li espone, compare "non misurato".
6. **Il replay usa solo i registri di Ordo** (audit, artefatti, sessioni). Le voci ricavate dalla storia Git escono dal percorso delle decisioni.

**Ordine di realizzazione:**
1. questo ADR;
2. replay sul flusso predefinito, con tipo di attore, decisioni di review e token;
3. designer grafico con validazione R1–R6 e salvataggio in `.ordo/flows/`;
4. esecuzione di Ordo guidata dal flusso disegnato.

Ogni passo ha la sua parità in CLI (per esempio `ordo flow validate|show`, e il replay in `ordo status --spec --json`).

## Alternative considerate

- **Workflow fisso** (roadmap attuale): semplice da garantire, ma non segue i processi reali dei team e non permette di disegnarli.
- **Disegno completamente libero:** massima flessibilità, ma perde le garanzie che danno valore a Ordo (spec prima dell'esecuzione, review umana degli agenti, decisioni umane non delegabili). Scartata.
- **Solo modelli predefiniti non modificabili:** più facili da validare, ma non rispondono alla richiesta di disegnare. Rimane possibile come punto di partenza (vedi punti aperti).

## Conseguenze

- Serve un motore a grafo nuovo nel core; la macchina a stati lineare esistente resta per i workflow del catalogo.
- Il designer richiede una libreria di grafi nella webview (per esempio React Flow, MIT), inclusa nel bundle senza risorse esterne. Licenza e dimensione vanno verificate prima di adottarla.
- `workflowStatus` e il replay devono leggere il flusso attivo invece della sequenza fissa.
- I requisiti già in corso restano sul flusso predefinito; cambiare flusso a lavoro iniziato va regolato (vedi punti aperti).
- La fase `review` del §4 non è più un passo unico finale: diventa l'insieme dei nodi di review umana distribuiti nel flusso.

## Libertà e livello (decisi il 25 settembre 2026)

1. **Libertà: disegno libero entro R1–R6, partendo sempre da un modello.** Il designer non parte da una tela vuota ma da modelli forniti da Ordo, per esempio:
   - "Standard", il flusso predefinito;
   - "Fix veloce", cioè spec → task agente → review → fine;
   - "Regolamentato", con approvazioni aggiuntive.

   Il modello si modifica liberamente, e il core rifiuta il salvataggio di un disegno che viola una regola, indicando quale. I flussi stanno in `.ordo/flows/` e si modificano con la normale review del codice (pull request): nessuno cambia il processo del team in silenzio.
2. **Livello: catalogo di flussi del team, uno scelto per requisito.** Il team mantiene pochi flussi approvati e il profilo indica quello predefinito. Ogni requisito, alla creazione, sceglie uno dei flussi del team. Non esistono flussi disegnati per un singolo requisito.
3. **Cambio di flusso a lavoro in corso: versione vincolata e migrazione esplicita.**
   - Un requisito si aggancia alla versione esatta del flusso con cui è partito (id più impronta del contenuto).
   - Modificare un flusso crea una nuova versione: i requisiti in corso continuano con la loro, e il replay mostra sempre la versione seguita davvero.
   - Il passaggio alla nuova versione è un'azione esplicita di una persona ("aggiorna al nuovo flusso"). I nodi già completati e presenti anche nella nuova versione restano completati. I nodi obbligatori nuovi che cadono prima del punto attuale diventano "da recuperare" e vanno completati prima di proseguire.
   - La migrazione è registrata nell'audit come decisione umana. Nessuna migrazione è automatica o silenziosa.
