# casinometro-lim

Una lavagna per la LIM della classe e uno strumento per fare schede CAA con i pittogrammi ARASAAC. Pagine statiche:
niente server, niente account, niente chiavi, niente raccolta di dati. Nate su https://casinometro.it per gli insegnanti
italiani; rilasciate perché ogni scuola possa copiarle sul proprio hosting.

## Che cosa c'è

- `lavagna/`: la lavagna per la LIM (orologio, Casinometro cioè il fonometro della classe con la linea e la X, timer,
  link e PDF nel riquadro, tasto «Schede CAA» che apre la pagina CAA nel riquadro). Il microfono si usa solo nel
  browser e l'audio non esce dal computer.
- `caa/`: CAA Facile. Fotografi la pagina del libro (o scrivi il testo), correggi il testo, e la scheda con i
  pittogrammi ARASAAC è pronta da stampare. La foto si legge NEL browser con Tesseract.js; le parole vengono cercate
  sull'API pubblica di ARASAAC solo quando si preme «Fai la scheda».

## Come si installa

1. Copia le cartelle `lavagna/` e `caa/` sul tuo hosting, una accanto all'altra (per esempio
   `https://scuola.example/strumenti/lavagna/` e `https://scuola.example/strumenti/caa/`). I percorsi sono relativi:
   funzionano anche in una sottocartella. Serve HTTPS (il microfono e la webcam lo richiedono).
2. I file di Tesseract.js (circa 14 MB) non stanno in questo repository: scaricali con
   `python3 strumenti/vendor_caa.py --dest caa/vendor` (Python 3, nessuna dipendenza). Lo script controlla le
   impronte SHA-256 fissate in `strumenti/vendor_caa.json`.
3. Apri `lavagna/` sul computer di classe. Fine.

## Dove si vede

- https://casinometro.it/lavagna/ (la lavagna) e https://casinometro.it/caa/ (CAA Facile): le stesse pagine, online.
- Problemi e proposte: le «Issues» di questo repository. Nessuna garanzia e nessuna assistenza.

## Che cosa NON c'è

- I pittogrammi ARASAAC non sono inclusi: la pagina li chiama a runtime da `api.arasaac.org` e `static.arasaac.org`,
  secondo la loro licenza (vedi `TERZI.md`). Ogni scheda stampata porta l'attribuzione richiesta.
- Nessun salvataggio delle schede: si stampano o si salvano in PDF dal browser.

## Licenza

Il codice di questo repository è sotto licenza MIT (`LICENSE`). I pittogrammi, i font e Tesseract.js hanno le loro
licenze, elencate in `TERZI.md`. Il progetto è senza scopo di lucro.
