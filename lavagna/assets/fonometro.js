/* fonometro.js: il motore del Casinometro v6 (pagina /fonometro/ di casinometro.it).
   Nessuna dipendenza. Tre strati (note/v6/PROGETTO-v6.md, sezione 7.2):
   1. misura: funzioni pure del contratto v4, invariato (strumenti/test_fonometro.js, 137 prove);
      pesatura A in cascata, media Slow 1 s sulla potenza, livello = 20 log10(rms) + 94, intero
      fra 25 e 100. Le funzioni dell'offset restano per contratto ma la pagina non le usa.
   2. macchina degli stati e storia: funzioni pure, tempo e sorteggio arrivano da fuori
      (strumenti/test_casinometro_v6.js);
   3. pagina: microfono, disegno, schermo intero, wake lock, orologio (solo nel browser).
   In node espone con module.exports costanti e funzioni pure e si ferma; nel browser espone
   window.Casinometro (e window.Fonometro) e, se in pagina c'è #fonometro, si aggancia.
   Tutto l'audio resta nel browser: niente registrazione, niente rete, nessun suono in uscita
   (il ramo verso l'uscita passa da un guadagno 0). Il numero è una stima.
*/
(function (radice) {
  "use strict";

  /* ---------- testi che lo script scrive in pagina (note/v6/TESTI-NUOVI-v6.txt) ---------- */
  var TESTI = {
    fase: {
      PRONTO: "",
      SENZA_LINEA: "Manca la linea",
      ASCOLTO_LINEA: "Ascolto",
      LAVORO: "Lavoro",
      SOPRA: "Siamo sopra la linea",
      RESET: "Reset",
      MISSIONE: "",
      ESITO_OK: "Rientrati. Grazie a chi ha dato il segnale.",
      ESITO_NO: "Non ancora. Si riparte.",
      PAUSA: "In pausa: il microfono ascolta ancora, ma non parte niente."
    },
    fissata: "Linea fissata.",
    istruzione: "Quando il rumore di lavoro ti va bene, premi Fissa la linea: ascolto 10 secondi e la metto poco sopra.",
    mediaTitolo: "Media dell'ultimo minuto",
    media: "media",
    linea: "linea",
    irregolare: "Troppo irregolare: riprova",
    missione: {
      M1: "Riusciamo a tornare sotto la linea?",
      M2: "Il conto avanza solo sotto la linea.",
      M3: "Respiriamo insieme, o continuiamo in quiete."
    },
    inspira: "Inspira",
    espira: "Espira",
    pausa: "Pausa",
    riprendi: "Riprendi",
    schermo: "Schermo intero",
    esciSchermo: "Esci da schermo intero",
    permesso: "Consenti l'uso del microfono quando il browser te lo chiede.",
    fermo: "Ascolto fermo.",
    nascosta: "Ascolto fermato perché la pagina è passata in secondo piano. Premi Avvia per ripartire.",
    nonSicuro: "Il microfono qui non è disponibile: apri la pagina con un browser aggiornato e un indirizzo che inizia con https.",
    negato: "Non hai dato il permesso di usare il microfono. Puoi darlo dalle impostazioni del browser e poi premere di nuovo Avvia.",
    nonTrovato: "Non trovo un microfono su questo dispositivo.",
    nonSupportato: "Questo browser non ha gli strumenti audio che servono al Casinometro. Prova con un browser aggiornato.",
    perso: "Il microfono si è interrotto. Premi Avvia per ripartire.",
    altro: "Il microfono non è partito. Chiudi le altre app che lo usano e riprova.",
    corregge: "Il microfono corregge il suono da solo: la linea è meno affidabile.",
    schermoSpento: "Lo schermo può spegnersi: allunga il blocco schermo.",
    appena: "Appena partiti",
    riepilogo: {
      quasi: "Ultimi 5 minuti: quasi sempre sotto la linea",
      piuSotto: "Ultimi 5 minuti: più sotto che sopra",
      piuSopra: "Ultimi 5 minuti: più sopra che sotto"
    },
    fineOra: {
      titolo: "Fine ora",
      nonServita: "Oggi la X non è servita.",
      bastata: "Oggi la X è bastata {n}.",
      nonBastata: "I dieci secondi non sono bastati {m}.",
      sfide: "La sfida è partita {m}.",
      spesso: "Se la sfida parte spesso, rifissa la linea in un momento in cui il lavoro va bene.",
      serve: "Il secondo livello serve nelle ore in cui i dieci secondi non bastano.",
      offerta: "Nel secondo livello, quando i dieci secondi non bastano, parte da sola una sfida breve per tutta la classe: tu non devi dire niente. Quindici giorni di prova, senza carta di credito. Poi restano misura, linea e X, come oggi.",
      prova: "Prova il secondo livello",
      resta: "Resta così",
      chiudi: "Chiudi",
      voto: "Non è un voto. Questi numeri restano su questo computer e spariscono quando chiudi la pagina."
    },
    andamento: {
      calmo: "Nell'ultimo minuto: più calmo",
      rumoroso: "Nell'ultimo minuto: più rumoroso",
      uguale: "Nell'ultimo minuto: come prima"
    }
  };

  /* ---------- costanti ---------- */
  var BASE = 94;
  var SOGLIE = { verde: 55, rosso: 75 };
  var RISPOSTA = { fast: 0.125, slow: 1 };
  var CHIAVE = "cm_offset";
  var MIN_DB = 25, MAX_DB = 100;          // intervallo del numero mostrato
  var MIN_OFFSET = -20, MAX_OFFSET = 20;  // come /casinometro
  var AGGIORNA_MS = 250;                  // al massimo 4 aggiornamenti al secondo
  var ZONA_STABILE_MS = 2000;             // una zona nuova si mostra e si annuncia se resta per 2 s
  var SILENZIO_MS = 1000;                 // audio muto o sospeso per più di 1 s: errore

  /* frequenze delle curve IEC 61672-1 */
  var F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217;

  /* ---------- funzioni pure ---------- */
  function pesatura(tipo, hz) {
    var f2 = hz * hz;
    if (tipo === "A") {
      var ra = (Math.pow(F4, 2) * f2 * f2) /
        ((f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4));
      return 20 * Math.log10(ra) + 2.0;
    }
    if (tipo === "C") {
      var rc = (Math.pow(F4, 2) * f2) / ((f2 + F1 * F1) * (f2 + F4 * F4));
      return 20 * Math.log10(rc) + 0.06;
    }
    return 0;
  }

  /* Trasformata bilineare di una sezione analogica (n2 s^2 + n1 s + n0) / (d2 s^2 + d1 s + d0). */
  function bilineare(n, d, fs) {
    var c = 2 * fs, c2 = c * c;
    var b = [n[0] * c2 + n[1] * c + n[2], 2 * (n[2] - n[0] * c2), n[0] * c2 - n[1] * c + n[2]];
    var a = [d[0] * c2 + d[1] * c + d[2], 2 * (d[2] - d[0] * c2), d[0] * c2 - d[1] * c + d[2]];
    var a0 = a[0];
    return { b: [b[0] / a0, b[1] / a0, b[2] / a0], a: [1, a[1] / a0, a[2] / a0] };
  }

  /* Modulo della risposta della cascata alla frequenza hz. */
  function guadagno(sez, hz, fs) {
    var w = 2 * Math.PI * hz / fs, tot = 1;
    for (var i = 0; i < sez.length; i++) {
      var s = sez[i];
      tot *= modulo(s.b, w) / modulo(s.a, w);
    }
    return tot;
  }
  function modulo(c, w) {
    var re = 0, im = 0;
    for (var k = 0; k < c.length; k++) { re += c[k] * Math.cos(k * w); im -= c[k] * Math.sin(k * w); }
    return Math.sqrt(re * re + im * im);
  }

  function sezioni(tipo, fs) {
    var w1 = 2 * Math.PI * F1, w2 = 2 * Math.PI * F2, w3 = 2 * Math.PI * F3, w4 = 2 * Math.PI * F4;
    var sez;
    if (tipo === "A") {
      sez = [
        bilineare([1, 0, 0], [1, 2 * w1, w1 * w1], fs),        // s^2 / (s + w1)^2: toglie la continua
        bilineare([1, 0, 0], [1, w2 + w3, w2 * w3], fs),       // s^2 / ((s + w2)(s + w3))
        bilineare([0, 0, 1], [1, 2 * w4, w4 * w4], fs)         // 1 / (s + w4)^2
      ];
    } else if (tipo === "C") {
      sez = [
        bilineare([1, 0, 0], [1, 2 * w1, w1 * w1], fs),
        bilineare([0, 0, 1], [1, 2 * w4, w4 * w4], fs)
      ];
    } else {
      /* "Z": solo un passa alto del primo ordine a 5 Hz, per togliere la componente continua */
      var c = 2 * fs, w0 = 2 * Math.PI * 5;
      return [{ b: [c / (c + w0), -c / (c + w0)], a: [1, (w0 - c) / (c + w0)] }];
    }
    /* guadagno riportato alla curva a 1 kHz */
    var k = Math.pow(10, pesatura(tipo, 1000) / 20) / guadagno(sez, 1000, fs);
    sez[0].b = sez[0].b.map(function (v) { return v * k; });
    return sez;
  }

  function livello(rms, offset) {
    var r = typeof rms === "number" && isFinite(rms) ? Math.max(rms, 1e-10) : 1e-10;
    var o = typeof offset === "number" && isFinite(offset) ? offset : 0;
    return 20 * Math.log10(r) + BASE + o;
  }

  /* media esponenziale sulla potenza (rms al quadrato): prec e nuovo sono potenze */
  function media(prec, nuovo, dt, tau) {
    if (typeof prec !== "number" || !isFinite(prec)) return nuovo;
    if (!(tau > 0)) return nuovo;
    var alfa = 1 - Math.exp(-Math.max(dt, 0) / tau);
    return prec + alfa * (nuovo - prec);
  }

  function zona(db, soglie) {
    var s = soglie || SOGLIE;
    if (db < s.verde) return "verde";
    if (db >= s.rosso) return "rosso";
    return "giallo";
  }

  function offsetDaRiferimento(lettura, misurato) {
    return Math.round(Number(lettura) - Number(misurato));
  }

  function leggiOffset(deposito) {
    try {
      var v = deposito.getItem(CHIAVE);
      if (v === null || v === undefined || String(v).trim() === "") return 0;
      var n = Number(v);
      if (!isFinite(n)) return 0;
      n = Math.round(n);
      if (n < MIN_OFFSET || n > MAX_OFFSET) return 0;
      return n;
    } catch (e) {
      return 0;
    }
  }

  function scriviOffset(deposito, n) {
    var v = Math.round(Number(n));
    if (!isFinite(v) || v < MIN_OFFSET || v > MAX_OFFSET) return false;
    try {
      deposito.setItem(CHIAVE, String(v));
      return true;
    } catch (e) {
      return false;
    }
  }


  /* ---------- v6: macchina degli stati (sezioni 7.2, 12.1-12.4, 13) ---------- */
  var SOPRA_MS = 5000, SOPRA_N = 5;          // 5 valori al secondo consecutivi sopra la linea
  var RESET_MS = 10000;
  var RIENTRO_MS = 3000, RIENTRO_N = 3;      // 3 valori al secondo di fila sotto la linea
  var ESITO_OK_MS = 2000, ESITO_NO_MS = 3000;
  var RIPOSO_MS = 180000;
  var MARGINE_DB = 6;
  var ASCOLTO_LINEA_MS = 10000, ASCOLTO_LINEA_N = 10;
  var SATURO_DB = 94, IRREGOLARE_DB = 15;
  var BUCO_MS = 2500;
  var M1_MS = 15000, M2_CONTO = 10, M2_TETTO_MS = 30000, M3_MS = 20000, M3_CODA_MS = 3000;
  var STORIA_MS = 300000, STORIA_MIN_N = 30, ANDAMENTO_MIN_MS = 120000, ANDAMENTO_DB = 3;
  var MISSIONI = ["M1", "M2", "M3"];
  var ASCOLTO = { SENZA_LINEA: 1, ASCOLTO_LINEA: 1, LAVORO: 1, SOPRA: 1, RESET: 1, MISSIONE: 1, ESITO_OK: 1, ESITO_NO: 1, PAUSA: 1 };

  function copia(s) {
    var n = {}, k;
    for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) n[k] = s[k];
    if (s.missione) {
      n.missione = {};
      for (k in s.missione) if (Object.prototype.hasOwnProperty.call(s.missione, k)) n.missione[k] = s.missione[k];
      if (s.missione.coda) n.missione.coda = s.missione.coda.slice();
    }
    if (s.campioni) n.campioni = s.campioni.slice();
    return n;
  }

  /* livello 1 (gratuito): il reset fallito chiude con «Non ancora» e torna allo stato reale, niente
     missioni; livello 2 (secondo livello): M1, M2, M3 e riposo, come la v6 (DECISIONI-fable.md, 2a-2b).
     I conteggi n* valgono per la sola sessione (schermata «Fine ora», 2c): restano in memoria. */
  function nuovaMacchina(livello) {
    return {
      livello: livello === 2 ? 2 : 1, nBastata: 0, nNonBastata: 0, nSfide: 0,
      fase: "PRONTO", L: null, ultimoT: null, sopraN: 0, sottoN: 0, resetDa: null, missione: null,
      ultimaMissione: null, fineMissione: null, esitoDa: null, esitoMissione: null,
      campioni: [], lineaDa: null, messaggio: null, cambioDa: null
    };
  }

  function lavoroOSenza(s) { return s.L === null ? "SENZA_LINEA" : "LAVORO"; }

  function vai(s, fase, t) {
    s.messaggio = null;                         // «Linea fissata» o «Troppo irregolare» valgono solo all'uscita dall'ascolto
    s.fase = fase;
    s.cambioDa = t;
    s.sopraN = 0;
    s.sottoN = 0;
    return s;
  }

  function mediana(v) {
    if (!v.length) return null;
    var o = v.slice().sort(function (a, b) { return a - b; }), m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  }

  function evento(s0, nome, t) {
    var s = copia(s0);
    if (nome === "avvia") {
      if (s.fase !== "PRONTO") return s;
      s = nuovaMacchina(s.livello);
      return vai(s, "SENZA_LINEA", t);
    }
    if (nome === "ferma") {
      s.missione = null; s.resetDa = null; s.campioni = [];
      return vai(s, "PRONTO", t);
    }
    if (!ASCOLTO[s.fase]) return s;
    if (nome === "pausa") {
      if (s.fase === "PAUSA") return s;
      s.missione = null; s.resetDa = null; s.campioni = []; s.lineaDa = null; s.messaggio = null;
      return vai(s, "PAUSA", t);
    }
    if (nome === "riprendi") {
      if (s.fase !== "PAUSA") return s;
      return vai(s, lavoroOSenza(s), t);
    }
    if (nome === "fissaLinea") {
      s.missione = null; s.resetDa = null; s.campioni = []; s.lineaDa = t; s.messaggio = null;
      return vai(s, "ASCOLTO_LINEA", t);
    }
    if (nome === "avviaReset") {
      if (s.fase !== "SOPRA") return s;
      vai(s, "RESET", t);
      s.resetDa = t;
      return s;
    }
    return s;
  }

  function inRiposo(s, t) { return s.fineMissione !== null && t - s.fineMissione < RIPOSO_MS; }

  function sorteggiaMissione(s, sorteggio) {
    var c = MISSIONI.filter(function (m) { return m !== s.ultimaMissione; });
    var i = Math.floor(Number(sorteggio(c.length)));
    if (!(i >= 0 && i < c.length)) i = 0;
    return c[i];
  }

  function chiudiMissione(s, t, riuscita) {
    s.ultimaMissione = s.missione.id;
    s.fineMissione = t;
    s.esitoMissione = riuscita ? s.missione.id : null;
    s.missione = null;
    s.resetDa = null;
    vai(s, riuscita ? "ESITO_OK" : "ESITO_NO", t);
    s.esitoDa = t;
    return s;
  }

  /* «Fine ora» (DECISIONI-fable.md, 2c): che cosa dire dopo Ferma, dai conteggi della sola sessione.
     null se la linea non è mai stata fissata. offerta: "nessuna" | "link" (sotto, piccolo) | "pulsanti". */
  function volte(n) { return n === 1 ? "1 volta" : n + " volte"; }
  function fineOra(s) {
    if (!s || s.L === null || s.L === undefined) return null;
    var T = TESTI.fineOra, f = { titolo: T.titolo, righe: [], nota: "", offerta: "nessuna", voto: T.voto };
    var due = s.livello === 2, usata = s.nBastata + s.nNonBastata > 0;
    if (!usata) f.righe.push(T.nonServita);
    else {
      var riga = T.bastata.replace("{n}", volte(s.nBastata));
      if (due) riga += " " + T.sfide.replace("{m}", volte(s.nSfide));
      else if (s.nNonBastata > 0) riga += " " + T.nonBastata.replace("{m}", volte(s.nNonBastata));
      f.righe.push(riga);
    }
    if (due) { if (s.nSfide >= 3) f.nota = T.spesso; }
    else if (s.nNonBastata > 0) { f.nota = T.offerta; f.offerta = "pulsanti"; }
    else if (usata) { f.nota = T.serve; f.offerta = "link"; }
    return f;
  }

  /* un valore al secondo (db) al tempo monotono t (ms); sorteggio(n) dà un intero fra 0 e n-1 */
  function passo(s0, t, db, sorteggio) {
    var s = copia(s0);
    var sorteggia = typeof sorteggio === "function" ? sorteggio : function () { return 0; };
    var buco = s.ultimoT !== null && t - s.ultimoT > BUCO_MS;
    var dt = s.ultimoT === null || buco ? 0 : Math.max(0, t - s.ultimoT);
    s.ultimoT = t;
    if (buco) { s.sopraN = 0; s.sottoN = 0; if (s.missione) { s.missione.sottoN = 0; s.missione.coda = []; } }
    var sotto = s.L !== null && db <= s.L;
    switch (s.fase) {
      case "ASCOLTO_LINEA":
        if (buco) s.campioni = [];
        s.campioni.push(db);
        if (s.campioni.length >= ASCOLTO_LINEA_N) {
          var o = s.campioni.slice().sort(function (a, b) { return a - b; });
          var m = mediana(o);
          s.campioni = [];
          s.lineaDa = null;
          var esito = "irregolare";
          if (!(o[8] - o[1] > IRREGOLARE_DB || m >= SATURO_DB)) {
            s.L = Math.round(m) + MARGINE_DB;
            esito = "fissata";
          }
          vai(s, lavoroOSenza(s), t);
          s.messaggio = esito;
        }
        return s;
      case "LAVORO":
        s.sopraN = sotto ? 0 : s.sopraN + 1;
        if (s.sopraN >= SOPRA_N) vai(s, "SOPRA", t);
        return s;
      case "RESET":
        s.sottoN = sotto ? s.sottoN + 1 : 0;
        if (s.sottoN >= RIENTRO_N) {             // a parità di istante vince il rientro
          s.resetDa = null;
          s.esitoMissione = null;
          s.nBastata++;
          vai(s, "ESITO_OK", t);
          s.esitoDa = t;
          return s;
        }
        if (t - s.resetDa >= RESET_MS && s.sottoN === 0) {
          s.resetDa = null;
          s.nNonBastata++;
          if (s.livello !== 2) {                   // livello 1: nessuna missione, nessun riposo
            s.esitoMissione = null;
            vai(s, "ESITO_NO", t);
            s.esitoDa = t;
            return s;
          }
          if (inRiposo(s, t)) return vai(s, "SOPRA", t);   // riposo: si resta in B, decide l'insegnante
          s.nSfide++;
          var id = sorteggiaMissione(s, sorteggia);
          vai(s, "MISSIONE", t);
          s.missione = { id: id, da: t, sottoN: 0, accumulo: 0, conto: M2_CONTO, coda: [] };
        }
        return s;
      case "MISSIONE":
        var mi = s.missione, trascorso = t - mi.da;
        if (mi.id === "M1") {
          mi.sottoN = sotto ? mi.sottoN + 1 : 0;
          if (mi.sottoN >= RIENTRO_N) return chiudiMissione(s, t, true);
          if (trascorso >= M1_MS) return chiudiMissione(s, t, false);
        } else if (mi.id === "M2") {
          if (sotto) mi.accumulo += dt;
          mi.conto = Math.max(0, M2_CONTO - Math.floor(mi.accumulo / 1000 + 1e-9));
          if (mi.conto === 0) return chiudiMissione(s, t, true);
          if (trascorso >= M2_TETTO_MS) return chiudiMissione(s, t, false);
        } else {
          if (trascorso > M3_MS - M3_CODA_MS) mi.coda.push(sotto);
          if (trascorso >= M3_MS) {
            var tutti = mi.coda.length > 0 && mi.coda.every(function (x) { return x; });
            return chiudiMissione(s, t, tutti);
          }
        }
        return s;
      case "ESITO_OK":
        if (t - s.esitoDa >= ESITO_OK_MS) { s.esitoDa = null; vai(s, "LAVORO", t); }
        return s;
      case "ESITO_NO":
        /* livello 1: dopo i 3 s lo stato reale (SOPRA se il valore di adesso è sopra la linea);
           livello 2: come la v6, LAVORO */
        if (t - s.esitoDa >= ESITO_NO_MS) { s.esitoDa = null; vai(s, s.livello !== 2 && !sotto ? "SOPRA" : "LAVORO", t); }
        return s;
      case "SOPRA":
        /* rientro spontaneo (rifai 1 della regia): 3 s di fila sotto la linea riportano a LAVORO in
           silenzio: nessun esito verde, la X non si muove, nessun riposo. Il reset lo apre solo la X. */
        s.sottoN = sotto ? s.sottoN + 1 : 0;
        if (s.sottoN >= RIENTRO_N) vai(s, "LAVORO", t);
        return s;
      default:                                   // PRONTO, SENZA_LINEA, PAUSA
        return s;
    }
  }

  /* livelli rapidi (ogni 125 ms) -> un valore al secondo: la mediana dei livelli di quel secondo */
  function nuovoAggregatore() { return { secondo: null, valori: [] }; }
  function aggrega(ag, t, dbRapido) {
    var sec = Math.ceil(t / 1000), valore = null;
    var n = { secondo: ag.secondo, valori: ag.valori.slice() };
    if (n.secondo !== null && sec !== n.secondo) {
      if (n.valori.length) valore = { t: n.secondo * 1000, db: mediana(n.valori) };
      n.valori = [];
    }
    n.secondo = sec;
    n.valori.push(dbRapido);
    return { ag: n, valore: valore };
  }

  /* ---------- v6: storia (t, db, L), riepilogo, andamento ---------- */
  function storiaAggiungi(storia, t, db, L) { return storia.concat([{ t: t, db: db, L: L }]); }
  function storiaFinestra(storia, ora) {
    return storia.filter(function (p) { return p.t > ora - STORIA_MS && p.t <= ora; });
  }
  function tratti(punti) {
    var out = [], cur = [];
    for (var i = 0; i < punti.length; i++) {
      if (cur.length && punti[i].t - cur[cur.length - 1].t > BUCO_MS) { out.push(cur); cur = []; }
      cur.push(punti[i]);
    }
    if (cur.length) out.push(cur);
    return out;
  }
  function riepilogo(punti) {
    var conL = punti.filter(function (p) { return p.L !== null && p.L !== undefined; });
    if (conL.length < STORIA_MIN_N) return TESTI.appena;
    var sotto = conL.filter(function (p) { return p.db <= p.L; }).length / conL.length;
    if (sotto >= 0.9) return TESTI.riepilogo.quasi;
    if (sotto >= 0.5) return TESTI.riepilogo.piuSotto;
    return TESTI.riepilogo.piuSopra;
  }
  /* media come in Youlean: sulla POTENZA dei valori al secondo degli ultimi ms (finestra sui tempi);
     meno di 5 valori: nessuna media (null) */
  var MEDIA_MS = 60000, MEDIA_MIN_N = 5;
  function mediaFinestra(storia, t, ms) {
    var w = typeof ms === "number" ? ms : MEDIA_MS, somma = 0, n = 0;
    for (var i = 0; i < storia.length; i++) {
      var p = storia[i];
      if (p.t > t - w && p.t <= t) { somma += Math.pow(10, p.db / 10); n++; }
    }
    if (n < MEDIA_MIN_N) return null;
    return 10 * Math.log10(somma / n);
  }

  function andamento(punti, ora) {
    if (!punti.length || ora - punti[0].t < ANDAMENTO_MIN_MS) return null;
    var ultimo = [], prima = [];
    punti.forEach(function (p) { (p.t > ora - 60000 ? ultimo : prima).push(p.db); });
    if (!ultimo.length || !prima.length) return null;
    var d = mediana(ultimo) - mediana(prima);
    if (d <= -ANDAMENTO_DB) return TESTI.andamento.calmo;
    if (d >= ANDAMENTO_DB) return TESTI.andamento.rumoroso;
    return TESTI.andamento.uguale;
  }

  /* ---------- v6: ora di Roma (orologio del dispositivo portato al fuso di Roma, niente rete) ---------- */
  var formatoRoma = null;
  function oraRoma(data) {
    if (!formatoRoma) {
      formatoRoma = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
    var p = formatoRoma.formatToParts(data), h = "", m = "";
    for (var i = 0; i < p.length; i++) {
      if (p[i].type === "hour") h = p[i].value;
      if (p[i].type === "minute") m = p[i].value;
    }
    if (h === "24") h = "00";
    return h + ":" + m;
  }

  var api = {
    TESTI: TESTI, BASE: BASE, SOGLIE: SOGLIE, RISPOSTA: RISPOSTA, CHIAVE: CHIAVE,
    MIN_DB: MIN_DB, MAX_DB: MAX_DB, MIN_OFFSET: MIN_OFFSET, MAX_OFFSET: MAX_OFFSET,
    pesatura: pesatura, sezioni: sezioni, livello: livello, media: media, zona: zona,
    offsetDaRiferimento: offsetDaRiferimento, leggiOffset: leggiOffset, scriviOffset: scriviOffset,
    fineOra: fineOra, volte: volte,
    SOPRA_MS: SOPRA_MS, RESET_MS: RESET_MS, RIENTRO_MS: RIENTRO_MS, ESITO_OK_MS: ESITO_OK_MS,
    ESITO_NO_MS: ESITO_NO_MS, RIPOSO_MS: RIPOSO_MS, MARGINE_DB: MARGINE_DB, ASCOLTO_LINEA_MS: ASCOLTO_LINEA_MS,
    BUCO_MS: BUCO_MS, STORIA_MS: STORIA_MS, MISSIONI: MISSIONI, M1_MS: M1_MS, M2_TETTO_MS: M2_TETTO_MS, M3_MS: M3_MS,
    nuovaMacchina: nuovaMacchina, evento: evento, passo: passo, mediana: mediana,
    nuovoAggregatore: nuovoAggregatore, aggrega: aggrega,
    storiaAggiungi: storiaAggiungi, storiaFinestra: storiaFinestra, tratti: tratti,
    riepilogo: riepilogo, andamento: andamento, oraRoma: oraRoma, mediaFinestra: mediaFinestra, MEDIA_MS: MEDIA_MS
  };

  if (typeof module !== "undefined" && module.exports) {
    /* Solo in node. Con node 25.8 il test v4, dopo l'ultima riga, a volte non usciva: col compilatore
       Maglev spento non si è più appeso (causa dentro V8 non accertata). Nel browser non gira. */
    try { require("v8").setFlagsFromString("--no-maglev"); } catch (e) { /* niente */ }
    module.exports = api;
    return;
  }

  /* ---------- pagina ---------- */
  var win = radice, doc = win.document;
  var locale = /^(localhost|127\.0\.0\.1)$/.test(win.location && win.location.hostname || "");
  /* livello dall'indirizzo: ?livello=2 accende il secondo livello; niente si scrive nel browser */
  var LIVELLO = /(^|[?&])livello=2(&|$)/.test(win.location && win.location.search || "") ? 2 : 1;
  api.inietta = function () { return false; };
  win.Casinometro = api;
  win.Fonometro = api;
  if (!doc) return;

  function avvio() {
    var sezione = doc.getElementById("fonometro");
    if (!sezione) return;
    var $ = function (id) { return doc.getElementById(id); };
    var el = {
      avvia: $("fono-avvia"), ferma: $("fono-ferma"), fissa: $("fono-fissa"), pausa: $("fono-pausa"),
      schermo: $("fono-schermo"), x: $("fono-x"), stato: $("fono-stato-classe"), avviso: $("fono-avviso"),
      spento: $("fono-spento"), numero: $("fono-numero"), lineaValore: $("fono-linea-valore"), ora: $("fono-ora"),
      livello: $("fono-livello"), linea: $("fono-linea"), missione: $("fono-missione"), titolo: $("fono-missione-titolo"),
      conto: $("fono-conto"), respiro: $("fono-respiro"), respiroTesto: $("fono-respiro-testo"),
      anello: $("fono-anello"), anelloArco: $("fono-anello-arco"), anelloNumero: $("fono-anello-numero"),
      tela: $("fono-storia"), riepilogo: $("fono-riepilogo"), andamento: $("fono-andamento"),
      sopra: $("fono-livello-sopra"), istruzione: $("fono-istruzione"), colonna: sezione.querySelector(".fono-colonna"),
      etLivello: $("fono-etichetta-livello"), etLinea: $("fono-etichetta-linea"), etMedia: $("fono-etichetta-media"),
      mediaTacca: $("fono-media-tacca"), mediaTaccaValore: $("fono-media-tacca-valore"),
      media: $("fono-media"), mediaRiquadro: $("fono-media-riquadro")
    };
    var mediaCorrente = null;

    var stato = nuovaMacchina(LIVELLO), storia = [], giro = 0, inAscolto = false, avviando = false, iniettato = false;
    var ctx = null, flusso = null, nodi = [], analizzatore = null, campioni = null, byte = null, idFotogramma = 0;
    var potSlow = null, potFast = null, ultimoT = 0, ultimoRapido = 0, ultimoMostrato = 0, ag = nuovoAggregatore();
    var dbMostrato = null, tMacchina = 0, attesaAudio = 0, blocco = null, ultimoBlocco = -1e9, riepilogoDa = -1e9;
    var resti = [], faseMostrata = "";

    var COLORE_SOTTO = "#0E8A3E", COLORE_SOPRA = "#E2480F";
    function testo(n, v) { if (n && n.textContent !== v) n.textContent = v; }
    function adesso() { return iniettato ? tMacchina : win.performance.now(); }
    function sorteggio(n) { return Math.floor(Math.random() * n); }
    function avviso(v) { testo(el.avviso, v || ""); }

    /* ---- disegno ---- */
    function quota(db) { return Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB))); }

    function disegnaStoria() {
      var c = el.tela;
      if (!c || !c.getContext) return;
      var w = c.clientWidth, h = c.clientHeight, r = win.devicePixelRatio || 1;
      if (!w || !h) return;
      if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
      var g = c.getContext("2d");
      g.setTransform(r, 0, 0, r, 0, 0);
      g.clearRect(0, 0, w, h);
      var ora = tMacchina, punti = storiaFinestra(storia, ora);
      var colore = "#231A35";                    // la striscia ha il fondo bianco: inchiostro per linea e numero
      var x = function (t) { return w - (ora - t) / STORIA_MS * w; };
      var y = function (db) { return h - quota(db) * h; };
      /* il numero della linea valida adesso, a sinistra sopra la linea tratteggiata */
      var Lora = punti.length ? punti[punti.length - 1].L : stato.L;
      if (Lora !== null && Lora !== undefined) {
        g.fillStyle = colore;
        g.font = "600 " + Math.max(12, Math.round(h * 0.2)) + "px system-ui, sans-serif";
        g.textBaseline = "bottom";
        g.fillText(String(Lora), 4, Math.max(Math.round(h * 0.2) + 2, y(Lora) - 3));
      }
      tratti(punti).forEach(function (tr) {
        /* traccia colorata come la colonna: verde sotto la linea, arancio sopra */
        g.lineWidth = 2.5; g.globalAlpha = 1; g.setLineDash([]);
        for (var i = 1; i < tr.length; i++) {
          var p = tr[i], sopraL = p.L !== null && p.L !== undefined && p.db > p.L;
          g.strokeStyle = sopraL ? COLORE_SOPRA : COLORE_SOTTO;
          g.beginPath(); g.moveTo(x(tr[i - 1].t), y(tr[i - 1].db)); g.lineTo(x(p.t), y(p.db)); g.stroke();
        }
        if (tr.length === 1) { g.fillStyle = COLORE_SOTTO; g.fillRect(x(tr[0].t) - 1, y(tr[0].db) - 1, 3, 3); }
        g.strokeStyle = colore; g.lineWidth = 1.5; g.globalAlpha = 0.8; g.setLineDash([6, 4]);
        g.beginPath();
        var aperta = false;
        tr.forEach(function (p) {
          if (p.L === null) { aperta = false; return; }
          if (aperta) g.lineTo(x(p.t), y(p.L)); else { g.moveTo(x(p.t), y(p.L)); aperta = true; }
        });
        g.stroke();
      });
      g.globalAlpha = 1; g.setLineDash([]);
    }

    function aggiornaRiepilogo(forza) {
      if (!forza && tMacchina - riepilogoDa < 10000) return;
      riepilogoDa = tMacchina;
      var punti = storiaFinestra(storia, tMacchina);
      testo(el.riepilogo, riepilogo(punti));
      testo(el.andamento, andamento(punti, tMacchina) || "");
    }

    function mostra() {
      var t = adesso(), s = stato;
      var fase = s.fase.toLowerCase().replace("_", "-");
      if (sezione.getAttribute("data-fase") !== fase) sezione.setAttribute("data-fase", fase);
      var parola = TESTI.fase[s.fase] || "";
      if (s.fase === "MISSIONE" && s.missione) parola = TESTI.missione[s.missione.id];
      if ((s.fase === "LAVORO" || s.fase === "SENZA_LINEA") && s.messaggio && t - s.cambioDa < 3000) {
        parola = s.messaggio === "fissata" ? TESTI.fissata : TESTI.irregolare;
      }
      if (!inAscolto) parola = TESTI.fermo;
      if (parola !== faseMostrata) { faseMostrata = parola; testo(el.stato, parola); }
      testo(el.lineaValore, s.L === null ? "--" : String(s.L));
      if (el.linea) {
        el.linea.hidden = s.L === null;
        if (s.L !== null) el.linea.style.bottom = (quota(s.L) * 100).toFixed(2) + "%";
      }
      var qL = s.L === null ? 1 : quota(s.L), qDb = dbMostrato === null || !inAscolto ? 0 : quota(dbMostrato);
      if (el.livello) el.livello.style.height = (Math.min(qDb, qL) * 100).toFixed(2) + "%";
      if (el.sopra) {
        el.sopra.style.bottom = (qL * 100).toFixed(2) + "%";
        el.sopra.style.height = (Math.max(0, qDb - qL) * 100).toFixed(2) + "%";
      }
      testo(el.numero, dbMostrato === null || !inAscolto ? "--" : String(dbMostrato));
      if (el.istruzione) { el.istruzione.hidden = !(inAscolto && s.fase === "SENZA_LINEA"); testo(el.istruzione, TESTI.istruzione); }
      el.stato.setAttribute("data-lunga", parola.length > 24 ? "si" : "no");
      /* media dell'ultimo minuto: grande accanto alla parola, e una tacca sulla colonna */
      var mm = mediaCorrente === null ? null : Math.round(mediaCorrente);
      if (el.mediaRiquadro) {
        el.mediaRiquadro.hidden = sezione.getAttribute("data-usato") !== "si";
        el.mediaRiquadro.setAttribute("data-sopra", mm !== null && s.L !== null && mm > s.L ? "si" : "no");
      }
      testo(el.media, mm === null ? "--" : String(mm));
      testo(el.mediaTaccaValore, mm === null ? "--" : String(mm));
      if (el.mediaTacca) { el.mediaTacca.hidden = mm === null; if (mm !== null) el.mediaTacca.style.bottom = (quota(mm) * 100).toFixed(2) + "%"; }
      if (el.etMedia) el.etMedia.hidden = mm === null;
      if (el.etLinea) el.etLinea.hidden = s.L === null;
      etichette(qDb, s.L === null ? null : qL, mm === null ? null : quota(mm));
      var suReset = s.fase === "RESET" || s.fase === "MISSIONE";
      if (el.x) {
        el.x.setAttribute("data-su", suReset ? "reset" : "lavoro");
        el.x.setAttribute("aria-disabled", s.fase === "SOPRA" && inAscolto ? "false" : "true");
      }
      if (el.anello) {
        el.anello.hidden = s.fase !== "RESET" && s.fase !== "ASCOLTO_LINEA";
        if (s.fase === "RESET") {
          var resto = Math.max(0, RESET_MS - (t - s.resetDa));
          if (el.anelloArco) el.anelloArco.style.strokeDashoffset = String((1 - resto / RESET_MS) * 100);
          testo(el.anelloNumero, String(Math.ceil(resto / 1000)));
        } else if (s.fase === "ASCOLTO_LINEA") {         // il conto dei 10 secondi dell'ascolto della linea
          var fatti = s.campioni.length;
          if (el.anelloArco) el.anelloArco.style.strokeDashoffset = String(fatti / 10 * 100);
          testo(el.anelloNumero, String(10 - fatti));
        }
      }
      if (el.missione) {
        el.missione.hidden = s.fase !== "MISSIONE";
        if (s.fase === "MISSIONE" && s.missione) {
          var m = s.missione, tr = t - m.da;
          el.missione.setAttribute("data-missione", m.id);
          testo(el.titolo, TESTI.missione[m.id]);
          if (m.id === "M1") testo(el.conto, String(Math.max(0, Math.ceil((M1_MS - tr) / 1000))));
          else if (m.id === "M2") testo(el.conto, String(m.conto));
          else testo(el.conto, "");
          if (el.respiro) {
            el.respiro.hidden = m.id !== "M3";
            if (m.id === "M3") {
              var ciclo = tr % 10000, dentro = ciclo < 4000;
              var q = dentro ? ciclo / 4000 : 1 - (ciclo - 4000) / 6000;
              el.respiro.style.setProperty("--respiro", (0.35 + 0.65 * Math.max(0, Math.min(1, q))).toFixed(3));
              testo(el.respiroTesto, dentro ? TESTI.inspira : TESTI.espira);
            }
          }
        }
      }
      if (el.pausa) testo(el.pausa, s.fase === "PAUSA" ? TESTI.riprendi : TESTI.pausa);
      [el.fissa, el.pausa, el.x].forEach(function (b) { if (b) b.disabled = !inAscolto; });
      if (el.ferma) el.ferma.disabled = !inAscolto && !avviando;
    }

    /* etichette accanto alla colonna (livello, linea, media): seguono la loro quota; se due sono
       troppo vicine si spingono l'una via dall'altra, dentro l'altezza della colonna */
    function etichette(qDb, qL, qM) {
      if (!el.colonna) return;
      var H = el.colonna.clientHeight;
      if (!H) return;
      var lista = [];
      if (el.etLivello) lista.push({ n: el.etLivello, q: qDb });
      if (el.etLinea && qL !== null) lista.push({ n: el.etLinea, q: qL });
      if (el.etMedia && qM !== null) lista.push({ n: el.etMedia, q: qM });
      lista.forEach(function (e) { e.h = e.n.offsetHeight || 20; e.y = H - e.q * H; });   // centro, dall'alto
      lista.sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < lista.length; i++) {
        var min = (lista[i - 1].h + lista[i].h) / 2 + 2;
        if (lista[i].y - lista[i - 1].y < min) lista[i].y = lista[i - 1].y + min;
      }
      for (var k = lista.length - 1; k >= 0; k--) {                // dentro la colonna, dal basso
        var max = H - lista[k].h / 2;
        if (lista[k].y > max) lista[k].y = max;
        if (k < lista.length - 1) {
          var m2 = (lista[k].h + lista[k + 1].h) / 2 + 2;
          if (lista[k + 1].y - lista[k].y < m2) lista[k].y = lista[k + 1].y - m2;
        }
      }
      lista.forEach(function (e) { e.n.style.top = Math.max(0, e.y - e.h / 2).toFixed(1) + "px"; });
    }

    function orologio() { if (el.ora) testo(el.ora, oraRoma(new Date())); }
    function programmaMinuto() {
      orologio();
      var d = new Date(), resto = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      win.setTimeout(programmaMinuto, resto + 50);
    }
    programmaMinuto();
    win.setInterval(orologio, 10000);

    /* ---- macchina ---- */
    function valore(t, db) {
      tMacchina = t;
      var precedente = stato.fase;
      stato = passo(stato, t, db, sorteggio);
      if (stato.fase !== "PAUSA" && stato.fase !== "PRONTO" && precedente !== "PAUSA") {
        storia = storiaAggiungi(storia, t, Math.round(db), stato.L);
        if (storia.length > 400) storia = storiaFinestra(storia, t);
      }
      if (stato.fase !== "PAUSA" && stato.fase !== "PRONTO") mediaCorrente = mediaFinestra(storia, t, MEDIA_MS);
      aggiornaRiepilogo(false);
      mostra();                                  // prima lo stato (e il suo colore), poi la striscia
      disegnaStoria();
    }

    function ev(nome) {
      var t = adesso();
      var prima = stato.L;
      stato = evento(stato, nome, t);
      if (nome === "fissaLinea" && stato.fase === "ASCOLTO_LINEA") { storia = []; aggiornaRiepilogo(true); disegnaStoria(); }
      if (prima !== stato.L) { storia = []; mediaCorrente = null; aggiornaRiepilogo(true); }
      mostra();
    }

    /* ---- audio ---- */
    function potenzaMedia() {
      var i, s = 0, n;
      if (campioni) {
        analizzatore.getFloatTimeDomainData(campioni);
        n = campioni.length;
        for (i = 0; i < n; i++) s += campioni[i] * campioni[i];
      } else {
        analizzatore.getByteTimeDomainData(byte);
        n = byte.length;
        for (i = 0; i < n; i++) { var v = (byte[i] - 128) / 128; s += v * v; }
      }
      return n ? s / n : 0;
    }

    function fotogramma(t) {
      if (!inAscolto || !analizzatore) return;
      var dt = ultimoT ? Math.min(Math.max((t - ultimoT) / 1000, 0), 0.5) : 0;
      ultimoT = t;
      var p = potenzaMedia();
      potSlow = media(potSlow, p, dt, RISPOSTA.slow);
      potFast = media(potFast, p, dt, RISPOSTA.fast);
      if (!iniettato) {
        if (t - ultimoRapido >= 125) {
          ultimoRapido = t;
          var r = aggrega(ag, t, livello(Math.sqrt(potFast), 0));
          ag = r.ag;
          if (r.valore) valore(r.valore.t, r.valore.db);
        }
        if (t - ultimoMostrato >= AGGIORNA_MS) {
          ultimoMostrato = t;
          dbMostrato = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(livello(Math.sqrt(potSlow), 0))));
          tMacchina = Math.max(tMacchina, t);
          mostra();
        }
      }
      idFotogramma = win.requestAnimationFrame(fotogramma);
    }

    function annullaAttesa() { if (attesaAudio) { win.clearTimeout(attesaAudio); attesaAudio = 0; } }
    function attendiAudio(mio, ancora) {
      if (attesaAudio) return;
      attesaAudio = win.setTimeout(function () {
        attesaAudio = 0;
        if (mio === giro && ancora()) rilascia(TESTI.perso);
      }, SILENZIO_MS);
    }

    function messaggioErrore(e) {
      var nome = e && e.name ? e.name : "";
      if (nome === "NotAllowedError" || nome === "PermissionDeniedError" || nome === "SecurityError") return TESTI.negato;
      if (nome === "NotFoundError" || nome === "DevicesNotFoundError" || nome === "OverconstrainedError") return TESTI.nonTrovato;
      return TESTI.altro;
    }

    /* ---- schermo intero, wake lock, inert ---- */
    var fsOk = !!(doc.fullscreenEnabled && doc.documentElement.requestFullscreen);
    if (el.schermo) el.schermo.hidden = !fsOk;
    function inSchermo() { return !!doc.fullscreenElement; }
    function esciSchermo() { if (inSchermo() && doc.exitFullscreen) { try { var p = doc.exitFullscreen(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* niente */ } } }
    function chiediSchermo(mio) {
      if (!fsOk || inSchermo()) return;
      try {
        var p = doc.documentElement.requestFullscreen();
        if (p && p.then) p.then(function () { if (mio !== giro) esciSchermo(); }, function () { /* resta a tutta finestra */ });
      } catch (e) { /* resta a tutta finestra */ }
    }
    doc.addEventListener("fullscreenchange", function () { if (el.schermo) testo(el.schermo, inSchermo() ? TESTI.esciSchermo : TESTI.schermo); });

    function tieniAcceso(mio) {
      var wl = win.navigator && win.navigator.wakeLock;
      if (!wl || !wl.request) { if (el.spento) { el.spento.hidden = false; testo(el.spento, TESTI.schermoSpento); } return; }
      if (mio !== giro || !inAscolto || doc.visibilityState !== "visible") return;
      var t = win.performance.now();
      if (t - ultimoBlocco < 5000) return;
      ultimoBlocco = t;
      var p;
      try { p = wl.request("screen"); } catch (e) { if (el.spento) { el.spento.hidden = false; testo(el.spento, TESTI.schermoSpento); } return; }
      p.then(function (b) {
        if (mio !== giro || !inAscolto) { try { b.release(); } catch (e) { /* niente */ } return; }
        blocco = b;
        if (el.spento) el.spento.hidden = true;
        b.addEventListener("release", function () {
          if (blocco === b) blocco = null;
          if (mio === giro && inAscolto && doc.visibilityState === "visible") win.setTimeout(function () { tieniAcceso(mio); }, Math.max(0, 5000 - (win.performance.now() - ultimoBlocco)));
        });
      }, function () { if (mio === giro && el.spento) { el.spento.hidden = false; testo(el.spento, TESTI.schermoSpento); } });
    }

    function rendiInerte(si) {
      if (si) {
        resti = [];
        var n = sezione;
        while (n && n !== doc.body) {
          var p = n.parentNode;
          for (var c = p.firstElementChild; c; c = c.nextElementSibling) {
            if (c !== n && c.tagName !== "SCRIPT" && !c.inert) { c.inert = true; resti.push(c); }
          }
          n = p;
        }
      } else {
        resti.forEach(function (c) { c.inert = false; });
        resti = [];
      }
    }

    function attiva() {
      inAscolto = true;
      sezione.classList.add("fono-attivo");
      sezione.setAttribute("data-usato", "si");
      rendiInerte(true);
      doc.documentElement.classList.add("fono-fisso");
      storia = [];
      mediaCorrente = null;
      riepilogoDa = -1e9;
      chiudiFine(false);
      stato = evento(nuovaMacchina(LIVELLO), "avvia", adesso());
      faseMostrata = "";
      aggiornaRiepilogo(true);
      mostra();
      if (el.ferma) el.ferma.focus();
    }

    /* una sola procedura di arresto: Ferma, errore, pagina nascosta, traccia finita o muta, contesto sospeso */
    function rilascia(messaggio) {
      giro++;
      avviando = false;
      annullaAttesa();
      if (idFotogramma) { win.cancelAnimationFrame(idFotogramma); idFotogramma = 0; }
      if (flusso) { flusso.getTracks().forEach(function (t) { t.onended = null; t.onmute = null; t.onunmute = null; try { t.stop(); } catch (e) { /* niente */ } }); }
      flusso = null;
      nodi.forEach(function (n) { try { n.disconnect(); } catch (e) { /* niente */ } });
      nodi = []; analizzatore = null; campioni = null; byte = null;
      if (ctx) { ctx.onstatechange = null; try { var c = ctx.close(); if (c && c.catch) c.catch(function () {}); } catch (e) { /* niente */ } }
      ctx = null;
      if (blocco) { var b = blocco; blocco = null; try { b.release(); } catch (e) { /* niente */ } }
      inAscolto = false;
      iniettato = false;
      dbMostrato = null;
      stato = evento(stato, "ferma", adesso());
      sezione.classList.remove("fono-attivo");
      doc.documentElement.classList.remove("fono-fisso");
      rendiInerte(false);
      esciSchermo();
      if (el.spento) el.spento.hidden = true;
      faseMostrata = "";
      mostra();
      avviso(messaggio || TESTI.fermo);
      if (el.avvia) el.avvia.focus();
    }

    function avvia() {
      if (inAscolto || avviando) return;
      avviso("");
      var nav = win.navigator;
      if (win.isSecureContext === false || !nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia) { avviso(TESTI.nonSicuro); return; }
      var Contesto = win.AudioContext || win.webkitAudioContext;
      if (!Contesto || !win.requestAnimationFrame) { avviso(TESTI.nonSupportato); return; }
      try { ctx = new Contesto(); } catch (e) { avviso(TESTI.nonSupportato); return; }
      if (typeof ctx.createIIRFilter !== "function") { var c0 = ctx; ctx = null; try { c0.close(); } catch (e) { /* niente */ } avviso(TESTI.nonSupportato); return; }
      if (ctx.state === "suspended" && ctx.resume) { try { var r = ctx.resume(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* niente */ } }
      avviando = true;
      var mio = ++giro;
      chiediSchermo(mio);
      avviso(TESTI.permesso);
      mostra();
      var promessa;
      try {
        promessa = nav.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      } catch (e) { rilascia(messaggioErrore(e)); return; }
      promessa.then(function (f) {
        if (mio !== giro || !ctx) { f.getTracks().forEach(function (t) { t.stop(); }); return; }
        flusso = f;
        try {
          var sorgente = ctx.createMediaStreamSource(f), ultimo = sorgente;
          nodi.push(sorgente);
          var sez = sezioni("A", ctx.sampleRate);
          for (var i = 0; i < sez.length; i++) {
            var filtro = ctx.createIIRFilter(sez[i].b, sez[i].a);
            ultimo.connect(filtro); nodi.push(filtro); ultimo = filtro;
          }
          analizzatore = ctx.createAnalyser();
          analizzatore.fftSize = 2048;
          analizzatore.smoothingTimeConstant = 0;
          ultimo.connect(analizzatore); nodi.push(analizzatore);
          var muto = ctx.createGain();            // tiene viva la catena: verso l'uscita, guadagno 0
          muto.gain.value = 0;
          analizzatore.connect(muto); muto.connect(ctx.destination); nodi.push(muto);
          if (typeof analizzatore.getFloatTimeDomainData === "function") campioni = new Float32Array(analizzatore.fftSize);
          else byte = new Uint8Array(analizzatore.fftSize);
        } catch (e) { rilascia(TESTI.altro); return; }
        f.getTracks().forEach(function (t) {
          t.onended = function () { if (mio === giro) rilascia(TESTI.perso); };
          t.onmute = function () { attendiAudio(mio, function () { return t.muted; }); };
          t.onunmute = annullaAttesa;
        });
        ctx.onstatechange = function () {
          if (mio !== giro || !ctx) return;
          if (ctx.state === "running") annullaAttesa();
          else if (ctx.state === "closed") rilascia(TESTI.perso);
          else attendiAudio(mio, function () { return !!ctx && ctx.state !== "running"; });
        };
        avviando = false;
        potSlow = null; potFast = null; ultimoT = 0; ultimoRapido = 0; ultimoMostrato = 0; ag = nuovoAggregatore();
        attiva();
        avviso("");
        var tr = f.getAudioTracks()[0], imp = tr && tr.getSettings ? tr.getSettings() : {};
        if (imp.echoCancellation || imp.noiseSuppression || imp.autoGainControl) avviso(TESTI.corregge);
        tieniAcceso(mio);
        idFotogramma = win.requestAnimationFrame(fotogramma);
      }, function (e) {
        if (mio !== giro) return;
        rilascia(messaggioErrore(e));
      });
    }

    /* ---- «Fine ora» dopo Ferma: conteggi della sola sessione, in memoria (DECISIONI-fable.md, 2c) ---- */
    var fine = { box: $("fono-fine"), titolo: $("fono-fine-titolo"), righe: $("fono-fine-righe"), nota: $("fono-fine-nota"),
      prova: $("fono-fine-prova"), resta: $("fono-fine-resta"), chiudi: $("fono-fine-chiudi") };
    function chiudiFine(fuoco) {
      if (!fine.box || fine.box.hidden) return;
      fine.box.hidden = true;
      sezione.classList.remove("fono-finito");
      if (fuoco && el.avvia) el.avvia.focus();
    }
    function apriFine() {
      var f = fineOra(stato);
      if (!f || !fine.box) return;
      fine.righe.textContent = "";
      f.righe.forEach(function (r) { var p = doc.createElement("p"); p.textContent = r; fine.righe.appendChild(p); });
      testo(fine.nota, f.nota);
      fine.nota.hidden = !f.nota;
      fine.nota.classList.toggle("fono-fine-piccola", f.offerta === "link");
      fine.prova.hidden = f.offerta === "nessuna";
      fine.prova.classList.toggle("fono-fine-link", f.offerta === "link");
      fine.resta.hidden = f.offerta !== "pulsanti";
      fine.chiudi.hidden = f.offerta === "pulsanti";
      fine.box.hidden = false;
      sezione.classList.add("fono-finito");
      if (fine.titolo) fine.titolo.focus();
    }
    win.addEventListener("pageshow", function () { chiudiFine(false); });

    /* ---- comandi ---- */
    function su(b, f) { if (b) b.addEventListener("click", f); }
    su(el.avvia, avvia);
    su(el.ferma, function () { rilascia(TESTI.fermo); apriFine(); });
    su(fine.resta, function () { chiudiFine(true); });
    su(fine.chiudi, function () { chiudiFine(true); });
    su(el.fissa, function () { if (inAscolto) ev("fissaLinea"); });
    su(el.pausa, function () { if (inAscolto) ev(stato.fase === "PAUSA" ? "riprendi" : "pausa"); });
    su(el.x, function () { if (inAscolto) ev("avviaReset"); });
    su(el.schermo, function () { if (inSchermo()) esciSchermo(); else chiediSchermo(giro); });
    doc.addEventListener("keydown", function (e) {
      if (!inAscolto || e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      /* lo spazio è sempre Pausa, anche col fuoco su un tasto (la X appena toccata): Invio attiva i tasti */
      if (e.key === " ") { e.preventDefault(); if (!e.repeat) ev(stato.fase === "PAUSA" ? "riprendi" : "pausa"); }
      else if (e.key === "l" || e.key === "L") ev("fissaLinea");
      else if (e.key === "r" || e.key === "R") ev("avviaReset");
    });
    doc.addEventListener("keyup", function (e) { if (inAscolto && e.key === " ") e.preventDefault(); });
    doc.addEventListener("visibilitychange", function () {
      orologio();
      if (doc.visibilityState === "hidden" && (inAscolto || avviando) && !iniettato) rilascia(TESTI.nascosta);
    });
    win.setInterval(function () { if (inAscolto) { mostra(); disegnaStoria(); } }, 250);

    /* ---- solo in locale: livelli e tempo iniettati per le prove (sezione 12.5) ---- */
    if (locale) {
      api.inietta = function (t, db) {
        if (!inAscolto) {
          if (avviando) return false;
          giro++;
          iniettato = true;
          tMacchina = t;
          attiva();
        }
        iniettato = true;
        tMacchina = t;
        dbMostrato = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(db)));
        valore(t, db);
        return true;
      };
      api.statoPagina = function () {
        return {
          fase: stato.fase, L: stato.L, media: mediaCorrente, livello: stato.livello,
          conti: { bastata: stato.nBastata, nonBastata: stato.nNonBastata, sfide: stato.nSfide }, missione: stato.missione && stato.missione.id, inAscolto: inAscolto, storia: storia.length,
          tracce: flusso ? flusso.getTracks().map(function (t) { return t.readyState; }) : [], contesto: ctx ? ctx.state : "nessuno"
        };
      };
    }
    mostra();
    testo(el.stato, "");
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", avvio);
  else avvio();
})(typeof window !== "undefined" ? window : this);
