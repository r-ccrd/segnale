# DSGNBRD

Cosa sta succedendo **ora** nel design: caratteri, identità, web, UI/UX, editoria, motion, 3D, colore, packaging, illustrazione, tool. Dashboard personale tipo Pinterest + rivista + radar dei trend, pensata per il tablet, a costo zero. (Fino al 27/09/2026 si chiamava Segnale: il repo e l'indirizzo restano quelli.)

- 42 fonti automatiche + 27 da controllare a mano, ognuna con il motivo: [docs/FONTI.md](docs/FONTI.md)
- Aggiornamento automatico 3 volte al giorno con GitHub Actions, sito statico su GitHub Pages, installabile come app (PWA)
- Nessuna immagine copiata: le card mostrano l'immagine dal server della fonte; la scheda di ogni card riporta sempre fonte e link (Source → Nome)

## Aggiornare il sito che hai già online

Carica **solo il codice**. La cartella `data/` sul tuo repo la scrive il bot tre volte al giorno ed è più recente di quella nello zip: non sovrascriverla.

**Dal sito di GitHub (computer):**
1. Estrai lo zip.
2. Nel tuo repo: **Add file → Upload files**, poi trascina dalla cartella estratta: `index.html`, `manifest.webmanifest`, `sw.js`, `README.md` e le cartelle `assets`, `pipeline`, `docs`. **Non** trascinare `data`.
3. In basso **Commit changes** (lascia "Commit directly to the main branch").
4. Il commit fa partire da solo "Aggiorna DSGNBRD" (tab Actions): in 4-6 minuti il sito è aggiornato e la pipeline aggiunge i riassunti brevi a tutte le card. Fino a quel giro le card mostrano il titolo intero.
5. Facoltativo: `assets/icons/icon.svg` non serve più, puoi cancellarlo. Il file `.github/workflows/update.yml` è cambiato solo nel nome del workflow: puoi lasciare quello vecchio.

**Con git:**
```bash
git pull                      # prima prendi i dati nuovi del bot
# copia sopra i file nuovi, tutto tranne data/
git add -A && git commit -m "DSGNBRD: redesign" && git push
```

Sul tablet la prima apertura dopo l'aggiornamento può mostrare ancora la versione vecchia (il service worker la tiene per l'offline); alla seconda apertura arriva la nuova, oppure compare l'avviso "DSGNBRD was updated → Refresh". Nome e icona dell'app già installata di solito si aggiornano entro qualche giorno (Chrome ricontrolla il manifest quando apri l'app e può chiederti di confermare il cambio); se restano quelli vecchi, disinstalla e reinstalla dal browser.

## Metterlo online da zero (3 passi)

1. **Carica tutto in un repo pubblico** (pubblico = Actions gratis). Con l'upload dal sito: `.github/` e `.nojekyll` sono file nascosti, senza `.github/workflows/update.yml` non parte niente.
   ```bash
   cd segnale
   git init -b main && git add . && git commit -m "DSGNBRD"
   git remote add origin https://github.com/TUO-UTENTE/segnale.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → "Aggiorna DSGNBRD" → Run workflow.** In 4-6 minuti il sito è su `https://TUO-UTENTE.github.io/segnale/`.

Giri automatici alle 05:23, 12:23 e 19:23 UTC (07:23, 14:23, 21:23 in Italia con l'ora legale). GitHub dichiara che i job programmati possono partire in ritardo nei momenti di carico.

## Come si usa

- **Categorie**: la linguetta **›** sul bordo sinistro. *Tieni premuto*, la ruota si apre sotto il dito; scorri verso la voce e **rilascia**: si apre quella categoria. Vicino ai bordi dell'arco la ruota gira da sola e mostra le voci nascoste. Rilasciare al centro annulla. *Tocco breve*: la ruota resta aperta, la giri trascinando e tocchi la voce. Da tastiera: Invio sulla linguetta, frecce, Invio. La categoria attiva compare sulla linguetta e in alto a sinistra (tocca la × per tornare a tutto).
- **Card**: foto + riassunto (soggetto e tipo, per esempio "Granola, Identity by Ragged Edge"). Tocca per aprire la scheda con titolo intero, data, perché è qui, palette HEX/RGB/HSL, fonte e link all'originale.
- **Salvare**: *pressione lunga* su una card (la card si stringe, rilascia quando fa "pop"), oppure Save nella scheda. Le card salvate hanno un segnalibro pieno. Undo nel messaggio in basso.
- **Notte e giorno**: icona luna/sole in alto a sinistra. Notte: fondo charcoal `#232220`, testo crema `#E9E0D2`; giorno: gli stessi due colori scambiati. Nel pannello (icona cursori) c'è anche *Auto*, che segue il tema del sistema. Tutti i colori sono all'inizio di `assets/app.css`.
- **Trending**: sezioni separate con titoli grandi (Patterns, Colour, Typefaces, New on Google Fonts, Covered everywhere, In the conversation, Consolidated) e una fila di scorciatoie in alto per saltare alla sezione.
- **Altro**: ricerca con la lente (o `/`), periodo 24h / 7 days / 30 days / All, Focus (una card per volta), tastiera nella scheda: `←` `→` scorrono, `s` salva, `o` apre l'originale, `Esc` chiude. Swipe sull'immagine per passare alla card dopo.

Animazioni: tutte brevi e legate a un gesto (pressione, comparsa delle card allo scroll, header che si nasconde scendendo e il nome che si stringe, apertura della ruota e delle schede, scambio notte/giorno). Con "riduci animazioni" attivo nel sistema si spengono tutte.

## Sul tablet Android

**Via consigliata: gratis, niente file da gestire.** Apri il sito in Chrome e tocca l'icona di installazione in alto oppure menu ⋮ → *Installa app* (Samsung Internet: menu → *Aggiungi pagina a* → *Schermata Home*). Chrome crea un'app vera (WebAPK): icona nel drawer, finestra sua, si apre offline con l'ultimo feed scaricato. Tenendo premuta l'icona hai le scorciatoie per Trending e Saved.

**Se vuoi proprio il file `.apk`** (Trusted Web Activity, stesso motore di Chrome): su [pwabuilder.com](https://www.pwabuilder.com) incolli l'indirizzo del sito → *Package for stores* → *Android*; pubblichi il file `assetlinks.json` in `https://TUO-UTENTE.github.io/.well-known/assetlinks.json` (repo speciale `TUO-UTENTE.github.io`) per togliere la barra dell'indirizzo; copi l'APK sul tablet e lo installi. Conserva la chiave di firma. Verifica sviluppatori Android (controllato il 25/09/2026): dal 30 settembre 2026 in Brasile, Indonesia, Singapore e Thailandia, nel resto del mondo dal 2027; un APK non registrato resta installabile con adb o con il flusso avanzato (attesa obbligatoria di 24 ore). Il Play Store chiede 25 $ una tantum, quindi esce dal costo zero.

## Provarlo sul computer

```bash
cd segnale
python3 -m http.server 8000        # poi apri http://localhost:8000
```
Il doppio clic su `index.html` non funziona: i browser bloccano i JSON letti dal disco (l'app te lo dice).

Rigenerare i dati in locale (3-4 minuti: Fonts In Use chiede 10 secondi tra una pagina e l'altra nel robots.txt):
```bash
pip install -r pipeline/requirements.txt
python3 pipeline/build_feed.py
python3 pipeline/build_feed.py --only brandnew,tbi --dry-run   # solo due fonti, non scrive niente
```

## Come funziona

FONTI → NORMALIZZAZIONE → QUALITY GATE → DEDUP → ARRICCHIMENTO → CLASSIFICAZIONE → CLUSTER → RANKING → TREND → RIASSUNTI → JSON → APP

| Fase | Cosa fa |
|---|---|
| Fonti | `pipeline/sources.json`: feed RSS/Atom, 3 page watcher (Brand New, The Brand Identity e Fonts In Use hanno il feed rotto o assente) e i metadati pubblici di Google Fonts. |
| Perché non nel browser | Dei feed funzionanti nessuno manda header CORS: il browser non può leggerli. Li legge GitHub Actions e scrive JSON statici. |
| Date | Mai inventate. Priorità: rilascio ufficiale > progetto > articolo > prima rilevazione. La scheda dice quale data sta usando. |
| Quality gate | Fuori annunci, sponsor, contest, offerte di lavoro, gift guide, roundup e simili. |
| Dedup | Stesso URL canonico = stesso item. Stesso progetto su fonti diverse (titolo simile o stessa immagine entro 21 giorni) = una card sola con "Also covered by". |
| Arricchimento | Se il feed non ha immagine o testo si legge og:meta dalla pagina. L'immagine viene analizzata in memoria (dimensioni + palette) e buttata: niente viene salvato o ripubblicato. |
| Classificazione | Regole testuali per categoria + categoria di default della fonte. Font riconosciuti sul catalogo Google Fonts e sui crediti di Fonts In Use e Typewolf. |
| Riassunti | `pipeline/describe.py`: regole fisse, niente AI e niente costi. Dal titolo estrae soggetto e tipo ("Ragged Edge creates refreshingly wholesome identity for AI notepad Granola" → "Granola", "Identity by Ragged Edge"). Ricalcolati a ogni giro su tutto l'archivio, quindi le regole migliorate valgono anche per le card vecchie. |
| Output | `data/archive/AAAA-MM.json` (un item per riga, diff git leggibili), `data/index.json` (fonti, stato, trend, segnali), `data/state.json` (cache ETag, URL già visti, prima rilevazione dei trend). Retention 120 giorni. |

### Rilevanza (0-100, niente like né follower)

Calcolata in `pipeline/rank.py` solo da fatti verificabili; la scheda di ogni card mostra il perché ("Why it is here"):

- base 18 + 42 × peso della fonte (0-1, qualità della curatela)
- +10 riconoscimento esplicito (Awwwards Site of the Day, FWA of the Day, Typewolf Site of the Day…)
- +8 per ogni altra fonte che copre lo stesso progetto (max +20)
- Google Fonts: +8 uscita ufficiale; +15 / +10 / +5 se nel trending rank di Google entro 100 / 300 / oltre
- immagine: fino a +11 per immagine, dimensioni e palette; −10 senza immagine
- +4 se cita caratteri, +4 nuova uscita, +6 se è prova di un pattern, −6 pezzi di opinione
- moltiplicatore di penalità per contenuti deboli (es. tutorial generici)

### Trend (`pipeline/trends.py`)

Finestra recente: ultimi 14 giorni. Confronto: i 76 giorni prima (15-90). Materia prima: 43 descrittori visivi e tematici, famiglie di colore (tinta × tono) e coppie di colori, caratteri citati, frasi ricorrenti nei titoli.

| Etichetta | Quando |
|---|---|
| **Emerging pattern** | Senza baseline: almeno 4 item da 3 fonti indipendenti (ricorrenza, non crescita). Con baseline: almeno 3 item da 2 fonti e frequenza ≥ 1,4× rispetto alle settimane prima. |
| **Detected trend** | Serve la baseline: almeno 4 item da 3 fonti e frequenza ≥ 2×. Eccezione: un carattere uscito di recente su Google Fonts che compare in 3+ progetti di 2+ fonti. |
| **Consolidated** | Presente in modo stabile in entrambe le finestre: c'è, ma non è nuovo. |

La baseline vale solo con almeno 21 giorni di osservazione propria (più 40 giorni di storico e 60 item): i feed espongono solo gli ultimi N articoli, quindi confrontare oggi con l'arretrato dei feed gonfierebbe qualsiasi "crescita". Nelle prime tre settimane niente "Detected trend" da pattern, e i colori restano conteggi nel Trending.

### Personalizzazione (solo su questo dispositivo, `localStorage`)

- Salva (+1), apri l'originale (+0,5), apri una card (+0,2), nascondi (−1): pesi per categoria e, ridotti, per fonte, limitati a ±6.
- In All ogni card vale: rilevanza + 4 × peso categoria + 3 × peso fonte + preferenza (More +12, Less −15, Off = sparisce). Sotto 26 non compare. Scegliendo una categoria dalla ruota vedi sempre tutto.
- L'intestazione di ogni giorno dice quante card sono arrivate dopo la tua ultima visita.
- Pannello (icona cursori): tema, preferenze per categoria, pesi imparati (con reset), fonti on/off, elementi nascosti.
- Tab Saved: Export / Import in JSON per spostare salvati e preferenze tra dispositivi. I salvati fatti con il vecchio nome restano.

## Struttura

```
segnale/
├── index.html · manifest.webmanifest · sw.js · .nojekyll
├── assets/        app.css · app.js · icons/
├── data/          index.json · state.json · archive/AAAA-MM.json
├── pipeline/      build_feed.py (orchestratore) · net.py · ingest.py · enrich.py · classify.py
│                  rank.py · trends.py · describe.py · sources.json · requirements.txt
├── docs/FONTI.md  audit delle fonti del 25/09/2026
└── .github/workflows/update.yml
```

## Aggiungere una fonte

In `pipeline/sources.json`, dentro `sources`:
```json
{"id": "miafonte", "name": "Nome", "home": "https://…", "type": "rss", "url": "https://…/feed",
 "category": "branding", "weight": 0.7, "maxItems": 10}
```
`category` è quella di default quando il testo non basta a decidere; `weight` (0-1) è quanto ti fidi della curatela. Prova prima: `python3 pipeline/build_feed.py --only miafonte --dry-run`.

## Limiti, detti chiari

- **Gesto Indietro di Android**: la linguetta sta sul bordo sinistro, dove Android ascolta lo swipe "Indietro". Tieni premuto un attimo prima di trascinare (la ruota si apre dopo circa un quarto di secondo): se trascini subito dal bordo, il sistema può prendere il gesto come Indietro. In alternativa usa il tocco breve.
- **Riassunti**: sui dati del 25/09, 267 card su 394 (68%) hanno un soggetto estratto da una regola; le altre 127 (32%, soprattutto interviste, saggi e articoli senza un progetto preciso) tengono il titolo, accorciato a un confine naturale della frase. Una regola può sbagliare soggetto: il titolo intero è sempre nella scheda.
- **Fonti che bloccano**: al run del 25/09 The Dieline ha risposto 403 e magCulture 429; CG Channel ha il feed fermo dal 2024 ed è tra le manuali. Il pannello mostra sempre l'errore dell'ultimo giro.
- **Immagini in hotlink**: se una fonte blocca l'immagine, la card mostra un campo del colore dominante con la palette. Test con tutte le immagini esterne bloccate: zero immagini rotte a schermo.
- **Page watcher**: dipendono dall'HTML di tre siti; se cambiano markup, quella fonte va in errore finché non si aggiorna il selettore in `ingest.py`.
- **Google Fonts**: `fonts.google.com/metadata/fonts` è pubblico e lo usa il sito di Google, ma non è un'API documentata.
- **Dati personali**: salvati e preferenze vivono nel browser. Il browser e l'app installata possono avere memorie separate: usa sempre l'app e fai un Export ogni tanto.
- **Crescita del repo**: `data/` pesa ~0,6 MB (retention 120 giorni). GitHub consiglia repo sotto 1 GB.
- **Regola dei 60 giorni**: GitHub sospende i workflow programmati dopo 60 giorni senza attività nel repo. I commit automatici dei dati contano come attività; se lo trovi sospeso, riattivalo dal tab Actions.
- **Versioni delle action** (checkout@v4, setup-python@v5, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4): se GitHub mostra un avviso di deprecazione, alza il numero di versione.
- **Costi**: Actions gratis sui repo pubblici con runner standard; un giro dura 3-4 minuti.

## Ottimizzazioni backend e bug fix (28/09/2026)

Nessuna modifica visiva: verificato pixel per pixel (Playwright, 5 viewport × 2 temi, font e immagini bloccati su asset deterministici) prima e dopo. Gli unici pixel diversi trovati appartengono al fix della ruota qui sotto (voluto) o rientrano nel rumore di rendering già presente prima (gradient su Trending, sotto i 40px su ~1,5M).

**Pipeline (`pipeline/`)**
- `sources.json`: il pattern del link di The Brand Identity tagliava a metà gli URL con `%XX` maiuscolo (es. `%C3%A9`) → 404 e progetti persi a ogni giro. Ora accetta anche le maiuscole.
- `ingest.py`: i page watcher ora riusano la pagina già scaricata per immagine/riassunto/data invece di riscaricarla in `enrich.py` (una richiesta HTTP in meno per item). Il taglio "troppo vecchio" che interrompeva la scansione della lista non appena trovava 2 item vecchi di fila è stato sostituito con un contatore persistente per URL (3 volte 404/410 di fila = link morto, mai più ritentato): un singolo "progetto correlato" vecchio in mezzo a link nuovi non blocca più la scansione.
- `net.py`: retry/backoff su tutte le richieste, download con limite di byte e di tempo, pool di connessioni più grande.
- `build_feed.py`: un item scoperto ora ma con data reale (rivelata solo dopo aver letto og:meta) fuori dai 120 giorni di retention viene scartato subito invece di essere salvato e poi ributtato fuori al giro dopo (evitava un loop salva→elimina→riscarica).
- Bug preesistente corretto: l'ETag RSS veniva salvato prima di controllare che `feedparser` avesse davvero letto degli articoli — una risposta 200 ma corrotta poteva bloccare la fonte su cache 304 per sempre.
- `trends.py`: rimossa `colour_bar()`, morta e mai chiamata da nessuna parte.
- Risultato misurato: stesso identico output item-per-item su due run registrate (0 differenze su 531 e 530 item), tempi uguali o migliori nella realtà di rete (The Brand Identity 29,5s → 18s non dovendo più ricontrollare i link morti).

**Frontend (`assets/app.js`, `assets/app.css`, `sw.js`)**
- Bug trovato: la classe che apre la ruota delle categorie si chiamava `open`, la stessa classe già usata dal bottone trasparente che copre ogni card. Nel CSS la regola del bottone (`z-index: 1`) veniva dopo quella della ruota (`z-index: 60`) e vinceva lei: la ruota si apriva **sotto** l'header invece che sopra, senza oscurarlo. Rinominata la classe della ruota in `on`: ora si apre correttamente sopra tutto, come previsto dal CSS.
- Bug trovato: ridimensionare la finestra mentre si è su Trending o Saved corrompeva il masonry del Feed (le altezze delle colonne si leggevano a 0 perché il contenitore era `display:none`), visibile solo tornando al Feed. Corretto con un controllo che rimanda il ricalcolo a quando il Feed torna visibile.
- Masonry: da misura-e-posiziona per ogni card a misura-tutte-poi-posiziona-tutte (una sola reflow forzata invece di una per card).
- `data/index.json` e i due file mensili più recenti ora partono in parallelo invece che in sequenza.
- Il primo render aspetta il caricamento del font (con timeout di 800ms) per evitare lo scatto quando il font arriva dopo.
- `sw.js`: la strategia network-first ora ha un timeout di 5s e torna alla cache se la rete è lenta, non solo se fallisce del tutto.

**Pubblicazione**
- Il workflow (`Aggiorna Segnale` → `Aggiorna DSGNBRD`) ora pubblica su GitHub Pages solo una cartella `_site/` minima (pagina, asset, dati) invece di tutto il repo: niente `pipeline/`, cache o stato nel sito pubblico.
- Rimosso `assets/icons/icon.svg`, non più referenziato da nessuna parte.

## Test eseguiti (27/09/2026, Chromium con Playwright)

Viewport: desktop 1440×900, tablet grande 1730×1080, iPad orizzontale 1194×834, iPad verticale 834×1194, telefono 390×844. Su tutti: nome centrato al pixel, nessuna sovrapposizione nell'header, nessuno scroll orizzontale, nessun errore JavaScript, nessuna card con fonte/ora/segnalibro vuoto nella didascalia, barra colori e barra categorie assenti.

38/38 test funzionali: ruota con gesto reale tieni-trascina-rilascia, ruota che scorre da sola fino a una voce nascosta ("Trend alerts"), rilascio al centro che annulla, tocco breve con rotazione trascinando, tastiera, Esc, gesto touch simulato, tocco su telefono, filtro rimosso dalla ×, niente duplicati, infinite scroll, comparsa allo scroll, header che si nasconde e ritorna, periodo 24h, ricerca e chiusura, scheda con navigazione e attribuzione, link all'originale, salvataggio con `s` e con pressione lunga (senza aprire la scheda), persistenza dopo il reload, linguetta nascosta fuori dal feed, Trending con sezioni piene e titoli grandi, scorciatoie di sezione, tema notte/giorno che resta dopo il reload, tema chiaro di sistema, mute di una fonte, nascondi + apprendimento, focus visibile, offline dopo la prima visita, skeleton con dati lenti, copertine con immagini bloccate, riduci animazioni.

Revisione dopo il primo giro: in modalità tastiera il focus non arrivava sulle voci della ruota (erano nascoste durante l'animazione di apertura); la copertina di riserva ripeteva il titolo già presente nella didascalia; i nomi lunghi dei font si spezzavano a metà parola nel Trending; su iPad in verticale la linguetta copriva il bordo delle card.
