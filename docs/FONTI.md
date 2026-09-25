# Fonti di Segnale

Verifica del **25 settembre 2026**, fatta con richieste HTTP reali (User-Agent `SegnaleFeed/1.0`) da un container Linux. Le colonne *Ultimo run* vengono dal secondo run della pipeline dello stesso giorno. Lo stato aggiornato di ogni fonte lo trovi sempre nel pannello **Sources** dell'app.

Candidati testati: **92**. Con un feed utilizzabile: **58**. Feed funzionanti che mandano header CORS: **3** (per questo i feed li legge GitHub Actions e non il browser).

## Fonti automatiche

| Fonte | Metodo | Categoria | Peso | Ultimo run | Item in archivio | Ultimo item |
|---|---|---|---|---|---|---|
| [Google Fonts](https://fonts.google.com) | Google Fonts metadata | type | 0.8 | ok | 12 | 2026-08-25 |
| [Fonts In Use](https://fontsinuse.com) | Page watcher | type | 0.85 | ok | 24 | 2026-09-25 |
| [Typewolf](https://www.typewolf.com) | RSS/Atom | web | 0.75 | ok | 10 | 2026-09-25 |
| [I Love Typography](https://ilovetypography.com) | RSS/Atom | type | 0.7 | ok | 6 | 2026-09-09 |
| [Pangram Pangram](https://pangrampangram.com) | RSS/Atom | type | 0.7 | ok | 7 | 2026-09-23 |
| [Commercial Type](https://commercialtype.com) | RSS/Atom | type | 0.8 | ok | 4 | 2026-09-22 |
| [Velvetyne](https://velvetyne.fr) | RSS/Atom | type | 0.7 | ok | 0 |  |
| [Dezeen Typography](https://www.dezeen.com/tag/typography/) | RSS/Atom | type | 0.75 | ok | 3 | 2026-08-14 |
| [Brand New](https://www.underconsideration.com/brandnew/) | Page watcher | branding | 0.95 | ok | 24 | 2026-09-25 |
| [The Brand Identity](https://the-brandidentity.com) | Page watcher | branding | 0.95 | ok | 18 | 2026-09-24 |
| [BP&O](https://bpando.org) | RSS/Atom | branding | 0.85 | ok | 12 | 2026-09-25 |
| [Mindsparkle Mag](https://mindsparklemag.com) | RSS/Atom | branding | 0.7 | ok | 12 | 2026-09-23 |
| [Dezeen Branding](https://www.dezeen.com/tag/branding/) | RSS/Atom | branding | 0.75 | ok | 4 | 2026-09-08 |
| [The Dieline](https://thedieline.com) | RSS/Atom | packaging | 0.8 | ok | 10 | 2026-09-25 |
| [Packaging of the World](https://packagingoftheworld.com) | RSS/Atom | packaging | 0.65 | ok | 10 | 2026-09-25 |
| [Awwwards](https://www.awwwards.com/websites/sites_of_the_day/) | RSS/Atom | web | 0.85 | ok | 14 | 2026-09-25 |
| [FWA](https://thefwa.com) | RSS/Atom | web | 0.8 | ok | 10 | 2026-09-25 |
| [One Page Love](https://onepagelove.com) | RSS/Atom | web | 0.6 | ok | 9 | 2026-09-25 |
| [Land-book](https://land-book.com) | RSS/Atom | web | 0.55 | ok | 9 | 2026-09-25 |
| [Minimal Gallery](https://minimal.gallery) | RSS/Atom | web | 0.6 | ok | 8 | 2026-09-25 |
| [Nielsen Norman Group](https://www.nngroup.com) | RSS/Atom | uiux | 0.65 | ok | 8 | 2026-09-18 |
| [Smashing Magazine](https://www.smashingmagazine.com) | RSS/Atom | uiux | 0.5 | ok | 5 | 2026-09-11 |
| [Figma release notes](https://www.figma.com/release-notes/) | RSS/Atom | tools | 0.8 | ok | 10 | 2026-09-17 |
| [Figma Blog](https://www.figma.com/blog/) | RSS/Atom | tools | 0.6 | ok | 8 | 2026-09-24 |
| [Penpot releases](https://github.com/penpot/penpot/releases) | RSS/Atom | tools | 0.6 | ok | 1 | 2026-09-23 |
| [Blender](https://www.blender.org/news/) | RSS/Atom | 3d | 0.65 | ok | 1 | 2026-07-14 |
| [Webflow Updates](https://webflow.com/updates) | RSS/Atom | tools | 0.5 | ok | 6 | 2026-09-21 |
| [It's Nice That](https://www.itsnicethat.com) | RSS/Atom | editorial | 0.9 | ok | 19 | 2026-09-25 |
| [Creative Boom](https://www.creativeboom.com) | RSS/Atom | editorial | 0.7 | ok | 16 | 2026-09-25 |
| [Design Observer](https://designobserver.com) | RSS/Atom | editorial | 0.7 | ok | 8 | 2026-09-23 |
| [magCulture](https://magculture.com) | RSS/Atom | editorial | 0.8 | errore: HTTPError: 429 Client Error: Too Many Requests | 10 | 2026-09-21 |
| [Stack Magazines](https://www.stackmagazines.com) | RSS/Atom | editorial | 0.65 | ok | 6 | 2026-09-22 |
| [designboom](https://www.designboom.com) | RSS/Atom | editorial | 0.7 | ok | 0 |  |
| [Abduzeedo](https://abduzeedo.com) | RSS/Atom | branding | 0.65 | ok | 16 | 2026-09-25 |
| [PRINT](https://www.printmag.com) | RSS/Atom | editorial | 0.65 | ok | 11 | 2026-09-25 |
| [Slanted](https://www.slanted.de) | RSS/Atom | editorial | 0.65 | ok | 8 | 2026-09-23 |
| [Motionographer](https://motionographer.com) | RSS/Atom | motion | 0.85 | ok | 10 | 2026-09-25 |
| [Vimeo Staff Picks](https://vimeo.com/channels/staffpicks) | RSS/Atom | motion | 0.7 | ok | 0 |  |
| [80 Level](https://80.lv) | RSS/Atom | 3d | 0.7 | ok | 10 | 2026-09-25 |
| [Colossal](https://www.thisiscolossal.com) | RSS/Atom | illustration | 0.75 | ok | 10 | 2026-09-25 |
| [Booooooom](https://www.booooooom.com) | RSS/Atom | illustration | 0.7 | ok | 7 | 2026-09-24 |
| [Behance Featured](https://www.behance.net/featured) | RSS/Atom | branding | 0.65 | ok | 20 | 2026-09-25 |

*Page watcher*: il sito non ha un feed funzionante, quindi la pipeline legge la pagina indice (rispettando robots.txt e crawl-delay) e poi og:meta dei nuovi progetti. Se il sito cambia markup la fonte va in errore e lo vedi nel pannello.

## Disattivate

| Fonte | Motivo |
|---|---|
| CG Channel | Feed RSS fermo al 29 set 2024 (verificato il 25 set 2026): spostato tra le fonti manuali. |

## Da controllare a mano

Utili, ma bloccano la lettura automatica, non hanno feed, sono ferme o non danno immagini. Stanno nel pannello Sources con il link.

| Fonte | Categoria | Motivo |
|---|---|---|
| [Codrops](https://tympanus.net/codrops/) | web | Feed disattivato dal sito (HTTP 410 'No feed available'). |
| [Godly](https://godly.website) | web | Nessun feed pubblico; sito JS-only. |
| [Siteinspire](https://www.siteinspire.com) | web | Richieste automatiche respinte (HTTP 429). |
| [CSS Design Awards](https://www.cssdesignawards.com) | web | Challenge anti-bot (HTTP 202). |
| [Lapa Ninja](https://www.lapa.ninja) | web | Accesso automatico negato (HTTP 403). |
| [Dribbble Popular](https://dribbble.com/shots/popular) | uiux | Challenge anti-bot sui feed (HTTP 202). |
| [Design Week](https://www.designweek.co.uk) | branding | Feed bloccato (HTTP 403). |
| [Creative Review](https://www.creativereview.co.uk) | branding | Feed bloccato (HTTP 403). |
| [Collater.al](https://www.collater.al) | editorial | Challenge anti-bot (HTTP 202). |
| [AIGA Eye on Design](https://eyeondesign.aiga.org) | editorial | Feed non più disponibile (HTTP 404). |
| [Identity Designed](https://identitydesigned.com) | branding | Feed fermo (ultimo post dicembre 2024). |
| [Klim Type Foundry](https://klim.co.nz) | type | Nessun feed. |
| [Grilli Type](https://www.grillitype.com) | type | Nessun feed. |
| [Dinamo](https://abcdinamo.com) | type | Nessun feed. |
| [Future Fonts](https://www.futurefonts.xyz) | type | Nessun feed (le release in beta sono solo sul sito). |
| [Production Type](https://www.productiontype.com) | type | Nessun feed. |
| [Typotheque](https://www.typotheque.com) | type | Nessun feed. |
| [Sharp Type](https://sharptype.co) | type | Richieste automatiche respinte (HTTP 429). |
| [Fontshare](https://www.fontshare.com) | type | API pubblica funzionante ma catalogo fermo: il font più recente è stato inserito nel 2022. |
| [Typographica](https://typographica.org) | type | Feed attivo ma ultimo post giugno 2025. |
| [Adobe Color Trends](https://color.adobe.com/trends) | colour | Nessuna API pubblica. Le palette del feed sono estratte dalle immagini dei progetti. |
| [Color Hunt](https://colorhunt.co) | colour | Nessuna API pubblica. |
| [Product Hunt Design tools](https://www.producthunt.com/topics/design-tools) | tools | Feed funzionante ma senza immagini né voti, dominato da tool AI senza segnale di qualità: escluso dall'automatico. |
| [Sidebar](https://sidebar.io) | uiux | Feed funzionante ma sono link a saggi senza immagini: meglio lettura manuale. |
| [Are.na](https://www.are.na/explore) | artdirection | API v2 pubblica ma è curatela, non novità; la v3 richiede autenticazione. |
| [Instagram / TikTok](https://www.instagram.com) | artdirection | Instagram Basic Display API chiusa il 4 dicembre 2024; la ricerca per hashtag della Graph API richiede account Business/Creator e app review. Nessun accesso gratuito e automatizzabile verificato per TikTok. |
| [CG Channel](https://www.cgchannel.com) | 3d | Il feed RSS risponde ma è fermo al 29 settembre 2024 (verificato il 25/09/2026). News 3D/VFX da controllare a mano. |

## Audit completo dei candidati

| id | Categoria | Esito | URL provati (HTTP) | Item nel feed | Più recente | Con immagine |
|---|---|---|---|---|---|---|
| fontsinuse | type | nessun feed utilizzabile | `fontsinuse.com/rss` (500); `fontsinuse.com/feed` (500); `fontsinuse.com/uses.rss` (500); `fontsinuse.com/uses/rss` (404) |  |  |  |
| typewolf | type | feed ok | `www.typewolf.com/feed` (200) | 10 |  | 100% |
| ilovetypography | type | feed ok | `ilovetypography.com/feed/` (200) | 7 | 2026-09-09 | 0% |
| typographica | type | feed ok | `typographica.org/feed/` (200) | 100 | 2025-06-27 | 0% |
| pangrampangram | type | feed ok | `pangrampangram.com/blogs/journal.atom` (200) | 30 | 2026-09-23 | 100% |
| klim | type | nessun feed utilizzabile | `klim.co.nz/feed/` (404); `klim.co.nz/blog/rss` (404); `klim.co.nz/rss` (404) |  |  |  |
| commercialtype | type | feed ok | `commercialtype.com/news.rss` (500); `commercialtype.com/feed` (404); `commercialtype.com/news/rss` (200) | 25 | 2026-09-22 | 0% |
| ohnotype | type | feed ok | `ohnotype.co/blog/rss` (404); `ohnotype.co/feed.xml` (404); `ohnotype.co/blog.rss` (200) | 120 | 2025-11-11 | 0% |
| productiontype | type | nessun feed utilizzabile | `www.productiontype.com/news/feed` (404); `www.productiontype.com/feed` (404); `www.productiontype.com/rss` (404) |  |  |  |
| velvetyne | type | feed ok | `velvetyne.fr/feed/` (404); `velvetyne.fr/rss` (200) | 20 | 2026-02-16 | 40% |
| fontfabric | type | nessun feed utilizzabile | `www.fontfabric.com/feed/` (202) |  |  |  |
| futurefonts | type | nessun feed utilizzabile | `www.futurefonts.xyz/feed` (200); `www.futurefonts.xyz/rss` (200) |  |  |  |
| typotheque | type | nessun feed utilizzabile | `www.typotheque.com/feed` (404); `www.typotheque.com/articles/rss` (404) |  |  |  |
| dinamo | type | nessun feed utilizzabile | `abcdinamo.com/feed` (404); `abcdinamo.com/rss` (404) |  |  |  |
| grilli | type | nessun feed utilizzabile | `www.grillitype.com/feed` (200); `www.grillitype.com/rss` (200) |  |  |  |
| 205tf | type | nessun feed utilizzabile | `www.205.tf/feed` (404); `www.205.tf/rss` (404) |  |  |  |
| sharptype | type | nessun feed utilizzabile | `sharptype.co/feed` (429); `sharptype.co/blogs/news.atom` (429) |  |  |  |
| typeroom | type | nessun feed utilizzabile | `www.typeroom.eu/rss` (404); `www.typeroom.eu/feed` (404) |  |  |  |
| letterformarchive | type | feed ok | `letterformarchive.org/feed/` (200) | 10 | 2026-09-22 | 100% |
| gfonts_github | type | feed ok | `github.com/google/fonts/commits/main.atom` (200) | 20 | 2026-09-24 | 100% |
| brandnew | branding | feed ok | `www.underconsideration.com/brandnew/index.xml` (404); `feeds.feedburner.com/underconsideration/brandnew` (200) | 15 | 2013-06-28 | 100% |
| bpo | branding | feed ok | `bpando.org/feed/` (200) | 12 | 2026-09-25 | 100% |
| tbi | branding | nessun feed utilizzabile | `the-brandidentity.com/feed` (200); `the-brandidentity.com/rss.xml` (404); `the-brandidentity.com/feed.xml` (404); `the-brandidentity.com/rss` (404) |  |  |  |
| identitydesigned | branding | feed ok | `identitydesigned.com/feed/` (200) | 10 | 2024-12-16 | 100% |
| mindsparkle | branding | feed ok | `mindsparklemag.com/feed/` (200) | 15 | 2026-09-23 | 100% |
| designweek | branding | nessun feed utilizzabile | `www.designweek.co.uk/feed/` (403) |  |  |  |
| creativereview | branding | nessun feed utilizzabile | `www.creativereview.co.uk/feed/` (403) |  |  |  |
| logodesignlove | branding | feed ok | `www.logodesignlove.com/feed` (200) | 10 | 2026-06-26 | 100% |
| worldbranddesign | branding | nessun feed utilizzabile | `worldbranddesign.com/feed/` (200) |  |  |  |
| visuelle | branding | nessun feed utilizzabile | `visuelle.co.uk/feed/` (200) |  |  |  |
| brandingmag | branding | feed ok | `www.brandingmag.com/feed/` (200) | 20 | 2026-09-14 | 100% |
| dieline | packaging | feed ok | `thedieline.com/feed` (200) | 10 | 2026-09-24 | 100% |
| potw | packaging | feed ok | `packagingoftheworld.com/feed` (200) | 10 | 2026-09-25 | 100% |
| lovelypackage | packaging | nessun feed utilizzabile | `lovelypackage.com/feed/` (404) |  |  |  |
| awwwards | web | feed ok | `feeds.feedburner.com/awwwards-sites-of-the-day` (200) | 30 | 2026-09-25 | 100% |
| cssda | web | nessun feed utilizzabile | `www.cssdesignawards.com/rss` (202); `www.cssdesignawards.com/feeds/sites-of-the-day` (202); `www.cssdesignawards.com/feed` (202); `www.cssdesignawards.com/rss.xml` (202) |  |  |  |
| siteinspire | web | nessun feed utilizzabile | `www.siteinspire.com/websites.rss` (429); `www.siteinspire.com/rss` (429); `www.siteinspire.com/feed` (429) |  |  |  |
| onepagelove | web | feed ok | `onepagelove.com/feed` (200) | 10 | 2026-09-23 | 100% |
| landbook | web | feed ok | `land-book.com/rss` (404); `land-book.com/feed` (200) | 49 | 2026-09-24 | 100% |
| lapaninja | web | nessun feed utilizzabile | `www.lapa.ninja/feed/` (403); `www.lapa.ninja/rss` (403); `www.lapa.ninja/index.xml` (403) |  |  |  |
| minimalgallery | web | feed ok | `minimal.gallery/feed/` (200) | 10 | 2026-09-25 | 100% |
| httpster | web | nessun feed utilizzabile | `httpster.net/rss.xml` (404); `httpster.net/feed` (404); `httpster.net/rss` (404) |  |  |  |
| thefwa | web | feed ok | `thefwa.com/rss` (200) | 10 | 2026-09-25 | 100% |
| godly | web | nessun feed utilizzabile | `godly.website/feed` (200); `godly.website/rss` (200) |  |  |  |
| codrops | web | nessun feed utilizzabile | `tympanus.net/codrops/feed/` (410) |  |  |  |
| smashing | uiux | feed ok | `www.smashingmagazine.com/feed/` (200) | 40 | 2026-09-16 | 100% |
| muzli | uiux | feed ok | `medium.muz.li/feed` (200) | 10 | 2026-09-22 | 100% |
| sidebar | tools | feed ok | `sidebar.io/feed.xml` (200) | 20 | 2026-09-25 | 0% |
| designernews | uiux | nessun feed utilizzabile | `www.designernews.co/?format=rss` (402) |  |  |  |
| webdesignernews | web | feed ok | `webdesignernews.com/feed/` (200) | 10 | 2026-09-24 | 0% |
| hoverstates | web | nessun feed utilizzabile | `www.hoverstat.es/feed` (404); `www.hoverstat.es/rss` (404) |  |  |  |
| uxcollective | uiux | feed ok | `uxdesign.cc/feed` (200) | 10 | 2026-09-24 | 100% |
| nngroup | uiux | feed ok | `www.nngroup.com/feed/rss/` (200) | 20 | 2026-09-18 | 0% |
| figma_blog | tools | feed ok | `www.figma.com/blog/feed/` (404); `www.figma.com/blog/rss.xml` (404); `www.figma.com/blog/feed/atom.xml` (200) | 750 | 2026-09-24 | 0% |
| figma_release | tools | feed ok | `www.figma.com/release-notes/feed/atom.xml` (200) | 453 | 2026-09-17 | 0% |
| builtformars | uiux | nessun feed utilizzabile | `builtformars.com/feed` (200); `builtformars.com/rss.xml` (200) |  |  |  |
| itsnicethat | editorial | feed ok | `www.itsnicethat.com/rss` (404); `www.itsnicethat.com/feed` (404); `feeds.feedburner.com/itsnicethat/SlXC` (200) | 20 | 2026-09-24 | 85% |
| creativeboom | editorial | feed ok | `www.creativeboom.com/feed/` (200) | 20 | 2026-09-25 | 95% |
| eyeondesign | editorial | nessun feed utilizzabile | `eyeondesign.aiga.org/feed/` (404) |  |  |  |
| designobserver | editorial | feed ok | `designobserver.com/feed/` (200) | 12 | 2026-09-23 | 83% |
| magculture | editorial | feed ok | `magculture.com/blogs/journal.atom` (200) | 30 | 2026-09-21 | 97% |
| stack | editorial | feed ok | `www.stackmagazines.com/feed/` (200) | 10 | 2026-09-22 | 0% |
| grafik | editorial | feed ok | `www.grafik.net/rss` (200) | 15 | 2025-05-22 | 100% |
| designboom | editorial | feed ok | `www.designboom.com/feed/` (200) | 10 | 2026-09-25 | 100% |
| dezeen_graphic | editorial | feed ok | `www.dezeen.com/design/graphic-design/feed/` (403); `www.dezeen.com/tag/graphic-design/feed/` (404); `www.dezeen.com/feed/` (200) | 50 | 2026-09-25 | 100% |
| typographicposters | editorial | nessun feed utilizzabile | `www.typographicposters.com/feed` (404); `www.typographicposters.com/rss` (404) |  |  |  |
| inspirationgrid | editorial | nessun feed utilizzabile | `theinspirationgrid.com/feed/` (404) |  |  |  |
| abduzeedo | editorial | feed ok | `abduzeedo.com/rss.xml` (200) | 50 | 2026-09-24 | 100% |
| grainedit | editorial | feed ok | `grainedit.com/feed/` (200) | 10 | 2019-01-29 | 100% |
| commarts | editorial | nessun feed utilizzabile | `www.commarts.com/feed` (503); `www.commarts.com/rss` (503) |  |  |  |
| printmag | editorial | feed ok | `www.printmag.com/feed/` (200) | 40 | 2026-09-24 | 88% |
| slanted | editorial | feed ok | `www.slanted.de/feed/` (200) | 10 | 2026-09-23 | 10% |
| frizzifrizzi | editorial | feed ok | `www.frizzifrizzi.it/feed/` (200) | 10 | 2024-07-29 | 100% |
| collateral | editorial | nessun feed utilizzabile | `www.collater.al/feed/` (202) |  |  |  |
| designplayground | editorial | feed ok | `www.designplayground.it/feed/` (200) | 9 | 2020-10-04 | 0% |
| motionographer | motion | feed ok | `motionographer.com/feed/` (200) | 10 | 2026-09-25 | 100% |
| vimeo_staffpicks | motion | feed ok | `vimeo.com/channels/staffpicks/videos/rss` (200) | 10 | 2026-09-24 | 100% |
| vimeo_motion | motion | feed ok | `vimeo.com/channels/motiongraphics/videos/rss` (200) | 10 | 2022-11-22 | 100% |
| 80lv | 3d | feed ok | `80.lv/feed` (200) | 10 | 2026-09-25 | 100% |
| cgchannel | 3d | feed ok | `www.cgchannel.com/feed/` (200) | 10 | 2026-09-24 | 0% |
| blendernation | 3d | feed ok | `www.blendernation.com/feed/` (200) | 10 | 2026-09-24 | 0% |
| colossal | illustration | feed ok | `www.thisiscolossal.com/feed/` (200) | 10 | 2026-09-24 | 100% |
| booooooom | illustration | feed ok | `www.booooooom.com/feed/` (200) | 7 | 2026-09-24 | 86% |
| juxtapoz | illustration | feed ok | `www.juxtapoz.com/news/?format=feed&type=rss` (200) | 10 | 2026-05-13 | 100% |
| hifructose | illustration | feed ok | `hifructose.com/feed/` (200) | 100 | 2026-09-22 | 0% |
| producthunt_design | tools | feed ok | `www.producthunt.com/feed?category=design-tools` (200) | 50 | 2026-09-24 | 0% |
| penpot_releases | tools | feed ok | `github.com/penpot/penpot/releases.atom` (200) | 10 | 2026-09-25 | 100% |
| toools | tools | nessun feed utilizzabile | `www.toools.design/rss` (404); `www.toools.design/rss.xml` (404) |  |  |  |
| behance | inspiration | feed ok | `www.behance.net/feeds/projects` (200) | 36 | 2026-09-25 | 100% |
| dribbble | inspiration | nessun feed utilizzabile | `dribbble.com/shots/popular.rss` (202); `dribbble.com/shots/recent.rss` (202) |  |  |  |
| adsoftheworld | artdirection | nessun feed utilizzabile | `www.adsoftheworld.com/rss` (404); `www.adsoftheworld.com/feed` (404) |  |  |  |
| designyoutrust | artdirection | feed ok | `designyoutrust.com/feed/` (200) | 25 | 2026-09-22 | 100% |

Aggiunte dopo l'audit iniziale e verificate durante i run dello stesso giorno: googlefonts, dezeen_typography, dezeen_branding, penpot, blender, webflow_updates.

