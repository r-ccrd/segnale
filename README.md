# Segnale

Cosa sta succedendo **ora** nel design: caratteri, identità, web, UI/UX, editoria, motion, 3D, colore, packaging, illustrazione, tool. Dashboard personale tipo Pinterest + rivista + radar dei trend, pensata per il tablet, a costo zero.

- 42 fonti automatiche + 27 da controllare a mano, ognuna con il motivo: [docs/FONTI.md](docs/FONTI.md)
- Aggiornamento automatico 3 volte al giorno con GitHub Actions, sito statico su GitHub Pages, installabile come app (PWA)
- Nessuna immagine copiata: le card mostrano l'immagine dal server della fonte, sempre con link e attribuzione (Source → Nome)

Stato al test del 25 settembre 2026 (due run della pipeline): 396 card reali + 39 card palette, 5 pattern rilevati, 41 fonti su 42 ok all'ultimo giro.

## Mettilo online in 3 passi

1. **Carica tutto in un repo pubblico** (pubblico = Actions gratis):
   ```bash
   cd segnale
   git init -b main && git add . && git commit -m "Segnale"
   git remote add origin https://github.com/TUO-UTENTE/segnale.git
   git push -u origin main
   ```
   Se usi l'upload dal sito di GitHub: `.github/` e `.nojekyll` sono nascosti nel Finder. Senza `.github/workflows/update.yml` non parte niente.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → "Aggiorna Segnale" → Run workflow.** In 4-6 minuti il sito è su `https://TUO-UTENTE.github.io/segnale/`.

Sul tablet: apri il link in Safari (iPad) o Chrome (Android) → Condividi → **Aggiungi alla schermata Home**. Si apre a tutto schermo e offline mostra l'ultimo feed scaricato.

Poi va da solo: giri alle 05:23, 12:23 e 19:23 UTC (07:23, 14:23, 21:23 in Italia con l'ora legale, un'ora prima d'inverno). GitHub dichiara che i job programmati possono partire in ritardo nei momenti di carico.

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

FONTI → NORMALIZZAZIONE → QUALITY GATE → DEDUP → ARRICCHIMENTO → CLASSIFICAZIONE → CLUSTER → RANKING → TREND → JSON → APP

| Fase | Cosa fa |
|---|---|
| Fonti | `pipeline/sources.json`: feed RSS/Atom, 3 page watcher (Brand New, The Brand Identity e Fonts In Use hanno il feed rotto o assente) e i metadati pubblici di Google Fonts (1.946 famiglie). |
| Perché non nel browser | Dei feed funzionanti nessuno manda header CORS: il browser non può leggerli. Li legge GitHub Actions e scrive JSON statici. |
| Normalizzazione | URL canonico (via utm e simili), titolo e testo puliti, data con il suo tipo. |
| Date | Mai inventate. Priorità: rilascio ufficiale (es. Google Fonts) > progetto > articolo > prima rilevazione. Ogni scheda dice quale data sta usando. Typewolf non dà date: le sue card dicono "First seen by Segnale". |
| Quality gate | Fuori annunci, sponsor, contest, offerte di lavoro, gift guide, roundup e simili (32 scarti al primo run). |
| Dedup | Stesso URL canonico = stesso item. Stesso progetto su fonti diverse (titolo simile o stessa immagine entro 21 giorni) = una card sola con "Also covered by". |
| Arricchimento | Se il feed non ha immagine o testo si legge og:meta dalla pagina. L'immagine viene analizzata in memoria (dimensioni + palette) e buttata: niente viene salvato o ripubblicato. |
| Classificazione | Regole testuali per categoria + categoria di default della fonte. Font riconosciuti sul catalogo Google Fonts e sui crediti di Fonts In Use e Typewolf. |
| Output | `data/archive/AAAA-MM.json` (un item per riga, diff git leggibili), `data/index.json` (fonti, stato, trend, segnali, barra colore), `data/state.json` (cache ETag, URL già visti, prima rilevazione dei trend). Retention 120 giorni. |

### Rilevanza (0-100, niente like né follower)

Calcolata in `pipeline/rank.py` solo da fatti verificabili, e ogni card mostra il perché ("Why it is here"):

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
| **Detected trend** | Serve la baseline: almeno 4 item da 3 fonti e frequenza ≥ 2×. Eccezione: un carattere uscito di recente su Google Fonts che compare in 3+ progetti di 2+ fonti (prima non esisteva, quindi la crescita è misurabile). |
| **Consolidated** | Presente in modo stabile in entrambe le finestre: c'è, ma non è nuovo. |

La baseline vale solo con almeno 21 giorni di osservazione propria (più 40 giorni di storico e 60 item). Motivo: i feed espongono solo gli ultimi N articoli, quindi confrontare oggi con l'arretrato dei feed gonfierebbe qualsiasi "crescita". Nelle prime tre settimane quindi niente "Detected trend" da pattern, e i colori restano conteggi nel tab Trending: un arancio smorzato frequente è pelle, legno, cartone (tasso di base), non una moda.

### Personalizzazione (solo su questo dispositivo, `localStorage`)

- Salva (+1), apri l'originale (+0,5), apri una card (+0,2), nascondi (−1): pesi per categoria e, ridotti, per fonte, limitati a ±6.
- In All ogni card vale: rilevanza + 4 × peso categoria + 3 × peso fonte + preferenza (More +12, Less −15, Off = sparisce). Sotto 26 non compare. Scegliendo una categoria dalla barra vedi sempre tutto.
- Pallino ciano = arrivato dopo la tua ultima visita.
- Pannello Sources: preferenze per categoria, pesi imparati (con reset), fonti on/off, elementi nascosti.
- Tab Saved: Export / Import in JSON per spostare salvati e preferenze tra dispositivi.

Viste: Feed (giorni con card principale, una fascia trend e masonry), Trending, Saved, Focus (icona con gli angoli: una card per volta). Tastiera: `/` cerca, `←` `→` scorrono, `s` salva, `o` apre l'originale, `Esc` chiude. Su touch: swipe sull'immagine.

## Struttura

```
segnale/
├── index.html · manifest.webmanifest · sw.js · .nojekyll
├── assets/        app.css · app.js · icons/
├── data/          index.json · state.json · archive/AAAA-MM.json
├── pipeline/      build_feed.py (orchestratore) · net.py · ingest.py · enrich.py
│                  classify.py · rank.py · trends.py · sources.json · requirements.txt
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

- **Fonti che bloccano**: al run delle 13:11 UTC The Dieline ha risposto 403 (al mattino funzionava), al run delle 14:10 magCulture ha risposto 429. CG Channel ha il feed fermo al 29/09/2024: disattivato e spostato tra le manuali. Dribbble, CSSDA, Collater.al, Siteinspire, Sharp Type, Design Week, Creative Review, Codrops e altri stanno tra le manuali con il motivo. Il pannello Sources mostra sempre l'errore dell'ultimo giro.
- **Immagini in hotlink**: se una fonte cambia URL o blocca l'hotlink, la card passa a una copertina generata (palette + titolo). Test con tutte le immagini esterne bloccate: zero immagini rotte a schermo.
- **Page watcher**: dipendono dall'HTML di tre siti; se cambiano markup, quella fonte va in errore finché non si aggiorna il selettore in `ingest.py`.
- **Google Fonts**: `fonts.google.com/metadata/fonts` è pubblico e lo usa il sito di Google, ma non è un'API documentata. L'alternativa documentata (Developer API) chiede una API key gratuita.
- **Dati personali**: salvati e preferenze vivono nel browser. Safari e l'app in Home possono avere memorie separate: usa sempre l'icona in Home e fai un Export ogni tanto.
- **Crescita del repo**: `data/` pesa ~0,6 MB (retention 120 giorni). Ogni giro riscrive index.json, state.json e il mese corrente: ~110 KB compressi a commit, quindi al massimo ~120 MB l'anno prima della compressione delta di git (in pratica molto meno). GitHub consiglia repo sotto 1 GB.
- **Regola dei 60 giorni**: GitHub sospende i workflow programmati dopo 60 giorni senza attività nel repo. I commit automatici dei dati contano come attività; se un giorno lo trovi sospeso, riattivalo dal tab Actions.
- **Versioni delle action** (checkout@v4, setup-python@v5, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4): non ricontrollate oggi. Se GitHub mostra un avviso di deprecazione, alza il numero di versione.
- **Costi**: Actions gratis sui repo pubblici con runner standard; un giro dura 3-4 minuti. Pages ha limiti pubblicati (sito fino a 1 GB, banda "soft" 100 GB al mese) lontanissimi da questi numeri.

## Test eseguiti (25/09/2026, Chromium con Playwright)

Viewport: desktop 1440×900, iPad verticale 834×1194, iPad orizzontale 1194×834, mobile 390×844. Nessun errore JavaScript, nessuno scroll orizzontale, prima card in 0,3-0,5 s in locale.

19/19 test funzionali: niente card duplicate, niente duplicati da cluster, infinite scroll, filtri (Typography, Colour, Trend alerts), periodo 24h, ricerca + stato vuoto, dettaglio con navigazione da tastiera, link all'originale, salvataggio che sopravvive al reload, vista Trending, mute di una fonte, nascondi + apprendimento, focus visibile, funzionamento offline dopo la prima visita, skeleton con dati lenti, copertine con immagini bloccate, reduced motion.

Revisione dopo il primo giro di test: le fasce trend occupavano tutta la prima schermata (ora una al giorno, le altre come card nel masonry); testo "null" nella scheda; scorciatoie da tastiera che smettevano di funzionare dopo "Next"; colori comuni etichettati come trend senza baseline (tolti); feed di CG Channel fermo dal 2024 (disattivato); un giorno pieno di Site of the Day tutti di fila (ora il feed mescola fonti e categorie dentro ogni giorno).
