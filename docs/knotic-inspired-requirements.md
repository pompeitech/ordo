# Requisiti: Ordo come runtime di contesto per team

> Documento derivato dall’intervista [AI e sviluppo software: più codice, meno controllo?](https://www.youtube.com/watch?v=MYP9uGh6oss), pubblicata da Pionieri del Tech. La trascrizione è stata usata come input di analisi; questo documento non riproduce il testo del video.

## 1. Obiettivo prodotto

Ordo deve evolvere da catalogo deterministico di agent, rule, skill e workflow a **layer condiviso di contesto e governo del lavoro AI**. L’obiettivo non è far generare più codice a un singolo sviluppatore, ma aumentare la velocity sostenibile del team:

- stessa conoscenza di base per tutti gli agenti e gli sviluppatori;
- requisiti, decisioni, piani e verifiche espliciti e versionabili;
- libertà nella fase implementativa, entro vincoli condivisi;
- controllo umano nei punti che cambiano comportamento, architettura o rischio;
- meno cicli di review, rilavorazioni e perdita di conoscenza.

Ordo non deve diventare un “prompt runner” autonomo. Deve rendere il lavoro dell’agente più deterministico, osservabile e ripetibile.

## 2. Principi di prodotto

1. **Contesto prima del codice.** Un agente deve conoscere regole di business, architettura, vincoli, decisioni e stato corrente prima di modificare file.
2. **Artefatti prima della chat infinita.** Ogni fase produce un output strutturato, leggibile e versionabile nel repository.
3. **Determinismo nell’indeterminismo.** Due agenti che ricevono lo stesso artefatto devono partire dallo stesso perimetro e dagli stessi vincoli.
4. **Human-in-the-loop.** L’agente può proporre, analizzare e implementare; la responsabilità sulle decisioni e sulle verifiche resta umana.
5. **Conoscenza evolutiva.** La memoria del progetto deve aggiornarsi insieme al codice e mantenere la provenienza delle modifiche.
6. **Modello indipendente.** Ordo deve funzionare con Claude Code, Codex e futuri adapter senza legarsi a un provider o a un modello specifico.
7. **Token e costi come metrica.** Il contesto deve essere selettivo, misurabile e comprimibile; l’utente deve poter capire quale modello e quale costo vengono usati.

## 3. Problemi da risolvere

- La velocità di scrittura cresce, ma review, chiarimenti e integrazione diventano colli di bottiglia.
- Le assunzioni dell’agente emergono solo alla fine, quando la pull request è già difficile da correggere.
- Le conversazioni personali non trasferiscono conoscenza al resto del team.
- Ogni sviluppatore usa skill, tool e procedure diverse senza una superficie comune.
- I piani scritti in Markdown non esprimono dipendenze, blocchi o stato di esecuzione.
- Nei progetti legacy manca una ricostruzione consultabile dei flussi e della loro evoluzione.
- Un agente può verificare che il codice funzioni senza verificare che sia conforme alle specifiche.

## 4. Modello di dominio proposto

Tutti gli artefatti devono essere file testuali, diffabili e validabili. Il formato iniziale consigliato è Markdown con frontmatter YAML; JSON è ammesso per stato macchina e indici.

```text
.ordo/
  brain.md                  # memoria curata del progetto
  context/                  # snapshot e indici generati
  decisions/                # decision record e motivazioni
  specs/                    # requisiti e criteri di accettazione
  plans/                    # piani atomici con dipendenze
  sessions/                 # sessioni e riferimenti agli artefatti
  observations/             # analisi del repository con provenienza
  config.json               # configurazione Ordo
```

### 4.1 Project brain

`brain.md` deve contenere almeno: scopo del progetto, glossario, regole di business, confini dei domini, invarianti, architettura ad alto livello, comandi verificati, rischi noti e link agli artefatti. Non deve essere un dump automatico dell’intero repository.

### 4.2 Spec

Una spec deve avere identificativo, obiettivo, non-obiettivi, attori, requisiti funzionali, vincoli, criteri di accettazione verificabili, rischi e stato (`draft`, `ready`, `implemented`, `verified`, `superseded`).

### 4.3 Piano

Un piano deve descrivere step atomici con `id`, descrizione, input, output atteso, file/area interessata, dipendenze, blocchi, verifica e stato (`pending`, `active`, `blocked`, `done`, `skipped`). Uno step bloccato non può essere eseguito silenziosamente.

### 4.4 Decisione

Una decisione deve registrare contesto, alternative considerate, scelta, conseguenze, autore, data, stato e riferimenti a spec/commit. Le decisioni superate restano consultabili.

### 4.5 Sessione

Una sessione deve registrare agente/provider, modello, branch o commit di partenza, spec e piano usati, strumenti invocati, approvazioni, file modificati, verifiche eseguite, consumo token/costo quando disponibile e risultato finale.

## 5. Workflow funzionale

Il percorso principale deve essere esplicito e componibile:

```text
brainstorm → spec → architect → plan → implement → verify → review → record
```

- **Brainstorm:** raccoglie problema, domande aperte, ipotesi e alternative senza modificare il codice.
- **Spec:** trasforma il problema in requisiti e criteri di accettazione.
- **Architect:** propone impatto, componenti, contratti e decisioni; richiede conferma umana.
- **Plan:** suddivide il lavoro in step atomici ordinati e dipendenti.
- **Implement:** delega uno o più step a Claude Code/Codex usando solo il contesto pertinente.
- **Verify:** esegue test, lint, typecheck e controlli di conformità alla spec.
- **Review:** presenta diff, rischi, assunzioni e risultati; non chiude il lavoro senza decisione umana.
- **Record:** aggiorna memoria, decisioni, stato del piano e riferimenti al commit/PR.

Ogni comando deve poter essere usato singolarmente, ma deve produrre artefatti compatibili con il comando successivo.

## 6. Requisiti CLI prioritari

La CLI deve mantenere l’attuale comportamento di catalogo e aggiungere gradualmente:

```text
ordo context [directory]             # mostra contesto effettivo e provenienza
ordo context refresh [directory]     # aggiorna indice/memoria con diff e conferma
ordo brainstorm [directory]          # crea una sessione di brainstorming
ordo spec create|show|validate       # gestisce specifiche
ordo architect [spec]                # genera proposta architetturale
ordo plan create|show|validate       # gestisce piani e dipendenze
ordo plan run [id]                   # avanza solo step pronti e autorizzati
ordo session show|list|export        # audit e trasferimento di lavoro
ordo verify [spec|plan]              # verifica tecnica e conformità
```

Requisiti trasversali:

- output umano colorato coerente con l’interfaccia attuale e output `--json` stabile;
- modalità interattiva e non-interattiva per CI;
- `--dry-run` per ogni operazione che può scrivere file;
- diff prima di aggiornare brain, spec, piano o indice;
- exit code distinti per errore, blocco, verifica fallita e approvazione richiesta;
- nessuna scrittura del codice senza un perimetro esplicito e una sessione tracciabile.

## 7. Context Lens / analisi repository

L’analisi deve partire da `ordo detect` e produrre osservazioni con provenienza:

- mappa di stack, entrypoint, moduli, dipendenze e flussi rilevati;
- collegamento tra simboli/file e concetti di business quando documentati;
- snapshot legati a commit o branch;
- confronto tra snapshot per mostrare cosa è cambiato nella conoscenza;
- possibilità di correggere o arricchire manualmente le osservazioni;
- distinzione visibile tra fatto rilevato, inferenza dell’agente e informazione curata dall’utente.

Per il legacy, il sistema deve poter costruire la memoria incrementualmente senza richiedere una riscrittura iniziale del progetto.

## 8. Governance, sicurezza e team

- Policy condivise su provider, modelli, dati inviabili, strumenti e directory modificabili.
- Ruoli configurabili: contributor, reviewer, tech lead, admin.
- Approvazioni richieste per decisioni architetturali, modifiche distruttive, aggiornamento della memoria condivisa e merge.
- Audit locale esportabile con sessioni, prompt di sistema, tool call, diff e verifiche; segreti esclusi o redatti.
- Lock/version check sugli artefatti per evitare sovrascritture concorrenti.
- Compatibilità con Git: branch, commit, PR e review devono poter referenziare spec e piano.

## 9. Costi e osservabilità

Ordo deve mostrare, quando l’adapter lo espone:

- provider e modello;
- token di input/output e contesto utilizzato;
- latenza e numero di tool call;
- stima o costo effettivo;
- rapporto tra lavoro umano, lavoro agente e cicli di review.

Il sistema deve supportare profili di contesto (`minimal`, `standard`, `full`) e spiegare perché un file è stato incluso.

## 10. Criteri di accettazione della prima release runtime

La prima release che implementa questo indirizzo è accettata quando:

1. un team può creare una spec e un piano versionati senza usare una chat;
2. il piano espone dipendenze e impedisce l’esecuzione di step bloccati;
3. Codex e Claude ricevono lo stesso contesto selezionato da Ordo;
4. una sessione produce audit, diff e verifiche riproducibili;
5. una modifica non conforme alla spec viene segnalata prima del completamento;
6. un nuovo sviluppatore può ricostruire scopo, regole e stato dal repository;
7. il flusso funziona sia su un progetto greenfield sia su un repository legacy;
8. tutto è disponibile in CLI, con JSON per CI e documentazione completa.

## 11. Fuori scope iniziale

- Download o gestione di modelli locali/open source.
- Esecuzione autonoma senza approvazioni nei passaggi ad alto rischio.
- Sostituzione della code review umana.
- Dashboard SaaS o storage remoto obbligatorio.
- Generazione automatica di una verità di business non verificata da una persona.

## 12. Sequenza consigliata

1. Stabilizzare il formato degli artefatti e il comando `ordo context`.
2. Implementare spec e piano con validazione e dipendenze.
3. Collegare gli adapter Claude/Codex a un contesto selettivo e tracciabile.
4. Aggiungere verify/review e audit delle sessioni.
5. Aggiungere analisi evolutiva del repository e metriche di costo.
6. Solo dopo valutare interfaccia grafica, plugin e automazioni avanzate.

