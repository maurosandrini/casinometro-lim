/* Casinometro v9 per la LIM (la v7 con la lavagna d'ardesia al centro, 8/10/2026): timer, area grande, barra orizzontale del fonometro, cambio di vista.
   15/10/2026 (piano caa-lavagna): via il pannello della chat e il tasto AI; al suo posto il tasto CAA, che apre nel riquadro la /caa/ del sito.
   18/10/2026 (piano caa-lavagna-20261018, versione 0.3): il tasto si chiama «Schede CAA», l'indirizzo è relativo («../caa/»), la webcam è
   concessa alla sola /caa/ e il riquadro della CAA si NASCONDE (non si distrugge) quando si apre un PDF, un sito o un video (rilievo C06).
   19/10/2026 (versione 0.5, richiesta di Mauro): con un video nel riquadro il fonometro va in pausa da solo e riparte quando il video se ne va.
   Il fonometro è il motore della v6 (fonometro.js), NON toccato: questa pagina gli dà gli elementi fono-*
   e legge soltanto ciò che lui scrive (percentuali, hidden, testi). Nessun dato si salva nel browser,
   nessuna richiesta di rete parte da qui.

   Due parti, come il motore:
   1. funzioni pure (analisi dei link, MM:SS, macchina del timer): in node con module.exports
      (strumenti/test_v7.js), nel browser in window.CasinometroLim;
   2. pagina (solo nel browser). */
(function (radice) {
  "use strict";

  /* ---------- testi: SOLO quelli di TESTI-NUOVI-v7.txt (ID accanto) ---------- */
  var TESTI = {
    avvia: "Avvia",                       // T10
    pausa: "Pausa",                       // T11
    riprendi: "Riprendi",                 // T12
    grande: "Timer grande",               // T14 (decisione 12 del 5/10): l'UNICO punto da cambiare per il nome
    scaduto: "Tempo scaduto",             // T15
    piccolo: "Rimpicciolisci",            // T16
    avviaTimer: "Avvia il timer",         // T25
    pausaTimer: "Metti in pausa il timer",// T26
    notaSito: "Se qui resta vuoto, usa Apri in una scheda: tocca il tasto qui sopra e il sito si apre in una scheda nuova. Per tornare qui, chiudi quella scheda.", // T36 (PROPOSTO): l'UNICO punto da cambiare
    nonLink: "Questo non sembra un link. Copia l'indirizzo dalla barra del browser e incollalo qui.", // T37
    http: "Questo sito non è protetto (http) e il browser non lo mostra qui dentro: usa Apri in una scheda.", // T38
    nonPdf: "Si aprono solo i PDF. Un PowerPoint si salva prima in PDF, poi si apre qui.", // T39
    titoloSito: "Sito mostrato in classe",// T41
    titoloVideo: "Video di YouTube",      // T42
    titoloPdf: "PDF di questo computer",  // T43
    bloccata: "Il browser non ha aperto la scheda. Permetti le finestre per questa pagina e riprova.", // T44
    caa: "Schede CAA",                    // D64 (15/10/2026, nome nuovo il 18/10/2026): il tasto e il titolo del riquadro della /caa/
    pausaVideo: "Fonometro in pausa: il microfono sentirebbe il video. Chiudi il video e riparte da solo.",   // D75 (19/10/2026)
    riprendeVideo: "Video chiuso: il fonometro è ripartito."   // D76 (19/10/2026)
  };

  /* ---------- 15/10/2026 (piano caa-lavagna, S2 e R10): la /caa/ del sito, stessa origine della lavagna. Nel riquadro va la
     modalità compatta (?lim=1); «Apri in una scheda» porta alla pagina completa, senza lim. Nessun host scritto qui (la pagina gira
     anche in locale). Non passano da analizzaLink, che la stessa origine la rifiuta (F13).
     18/10/2026 (piano caa-lavagna-20261018): percorsi RELATIVI alla pagina («../caa/»): la lavagna sta in /lavagna/ accanto a /caa/, e il
     pacchetto open source può essere servito anche da una sottocartella. Un indirizzo relativo non è un https: il cancello non lo conta. */
  var CAA = { riquadro: "../caa/?lim=1", scheda: "../caa/" };

  /* v9: la data scritta col gesso nell'angolo della lavagna, come a scuola (testi L09-L10 di TESTI-NUOVI-v9.txt) */
  var NOMI_GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var NOMI_MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
    "ottobre", "novembre", "dicembre"];

  /* ---------- 1 · funzioni pure ---------- */
  var DURATA_INIZIALE = 5 * 60000;
  var DURATA_MAX = 99 * 60000 + 59000;
  /* F22: host ESATTI di YouTube. music.youtube.com NON c'è: resta un sito */
  var HOST_YOUTUBE = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"];
  var ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

  /* t= o start= di YouTube: «90», «90s», «1m30s», «1h2m3s». Interi >= 0; altrimenti null (ignorato) */
  function secondiDa(v) {
    if (typeof v !== "string" || !v) return null;
    var m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(v);
    if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
    var n = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    return isFinite(n) && n >= 0 ? n : null;
  }

  /* un parametro che compare una volta sola; se manca o è doppio, null */
  function unico(cerca, nome) {
    var tutti = cerca.getAll(nome);
    return tutti.length === 1 ? tutti[0] : null;
  }

  function videoDa(u) {
    var host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (HOST_YOUTUBE.indexOf(host) < 0) return null;
    var id = null, pezzi = u.pathname.split("/").filter(Boolean);
    if (host === "youtu.be") { if (pezzi.length === 1) id = pezzi[0]; }
    else if (pezzi.length === 1 && pezzi[0] === "watch") id = unico(u.searchParams, "v");
    else if (pezzi.length === 2 && (pezzi[0] === "shorts" || pezzi[0] === "live" || pezzi[0] === "embed")) id = pezzi[1];
    if (!id || !ID_VIDEO.test(id)) return null;
    var t = unico(u.searchParams, "t"), s = unico(u.searchParams, "start");
    if (t === null && s === null && u.hash.length > 1) {                     // G35: anche «#t=90» dopo l'indirizzo
      try { t = unico(new URLSearchParams(u.hash.slice(1)), "t"); } catch (e) { t = null; }
    }
    var inizio = secondiDa(t !== null ? t : s);
    if (t !== null && inizio === null) inizio = secondiDa(s);
    var riquadro = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&playsinline=1" + (inizio ? "&start=" + inizio : "");
    var scheda = "https://www.youtube.com/watch?v=" + id + (inizio ? "&t=" + inizio + "s" : "");
    return { tipo: "video", id: id, inizio: inizio || 0, riquadro: riquadro, scheda: scheda };
  }

  function hostValido(h) {
    if (!h) return false;
    if (h === "localhost") return true;
    if (/^\[[0-9a-f:.]+\]$/i.test(h)) return true;                         // IPv6
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h.split(".").every(function (o) { return +o <= 255; }); // IPv4 (G29)
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z0-9-]{2,}\.?$/i.test(h) && h.indexOf("..") < 0;
  }

  /* analizzaLink(testo, origine) -> { tipo: "video" | "sito" | "http" | "errore", riquadro?, scheda? }
     origine = l'origine della pagina della LIM: un link alla stessa origine è rifiutato (F13) */
  function analizzaLink(testo, origine) {
    var errore = { tipo: "errore" };
    if (typeof testo !== "string") return errore;
    var x = testo.trim();
    if (!x || /\s/.test(x) || x.length > 2048) return errore;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(x)) {
      if (!/^https?:\/\//i.test(x)) return errore;
    } else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(x)) {
      return errore;                                                       // javascript:, data:, file:, blob:, ...
    } else if (/^\/\//.test(x)) {
      x = "https:" + x;
    } else {
      x = "https://" + x;
    }
    var u;
    try { u = new URL(x); } catch (e) { return errore; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return errore;
    if (u.username || u.password || /@/.test(x.split(/[/?#]/, 3).join("").replace(/^https?:/i, ""))) return errore;
    if (!hostValido(u.hostname)) return errore;
    if (origine && u.origin === origine) return errore;
    var v = videoDa(u);                                                    // YouTube PRIMA della regola http (F22)
    if (v) return v;
    if (u.protocol === "http:") return { tipo: "http", scheda: u.href };
    return { tipo: "sito", riquadro: u.href, scheda: u.href };
  }

  function mmss(ms) {
    var s = Math.ceil(Math.max(0, ms || 0) / 1000);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* minuti e secondi del pannello «Altro» -> ms, oppure null (zero e valori fuori campo rifiutati) */
  function durataDaCampi(min, sec) {
    var m = String(min).trim(), s = String(sec).trim();
    if (!/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(s)) return null;
    var mi = +m, se = +s;
    if (mi > 99 || se > 59) return null;
    var d = (mi * 60 + se) * 1000;
    return d > 0 ? d : null;
  }

  /* ---- macchina del timer (tabella 6.2 con F07 e F11) ----
     stato: { stato: "PRONTO" | "CORRE" | "PAUSA" | "SCADUTO", durata, resto, fine }
     Il tempo arriva sempre da fuori (Date.now() nella pagina): nessun conteggio di tick. */
  function nuovoTimer(durata) {
    var d = durata > 0 ? durata : DURATA_INIZIALE;
    return { stato: "PRONTO", durata: d, resto: d, fine: null };
  }
  function copia(s, cambi) {
    var n = { stato: s.stato, durata: s.durata, resto: s.resto, fine: s.fine };
    for (var k in cambi) if (Object.prototype.hasOwnProperty.call(cambi, k)) n[k] = cambi[k];
    return n;
  }
  /* G04: se l'orologio di sistema torna indietro, il resto non supera mai la durata (né scende sotto zero) */
  function limita(resto, durata) { return Math.max(0, Math.min(durata, resto)); }
  /* F07: prima di ogni evento si riconcilia con l'ora; la scadenza ha la precedenza */
  function riconcilia(s, ora) {
    if (s.stato === "CORRE" && s.fine - ora <= 0) return copia(s, { stato: "SCADUTO", resto: 0, fine: null });
    return s;
  }
  function timerEvento(s, nome, ora, arg) {
    var mostrato = s.stato;                                                // G01: lo stato che il tasto mostrava
    s = riconcilia(s, ora);
    switch (nome) {
      case "durata":
        if (!(typeof arg === "number" && isFinite(arg) && arg > 0 && arg <= DURATA_MAX && arg % 1000 === 0)) return s;
        if (s.stato === "PRONTO" || s.stato === "SCADUTO") return { stato: "PRONTO", durata: arg, resto: arg, fine: null };
        return s;                                                          // CORRE e PAUSA: tasti disattivi
      case "avvia":
        if (s.stato === "PRONTO") return copia(s, { stato: "CORRE", fine: ora + s.resto });
        if (s.stato === "SCADUTO") return copia(s, { stato: "CORRE", resto: s.durata, fine: ora + s.durata }); // F11
        return s;
      case "pausa":
        if (s.stato === "CORRE") return copia(s, { stato: "PAUSA", resto: limita(s.fine - ora, s.durata), fine: null });
        return s;
      case "riprendi":
        if (s.stato === "PAUSA") return copia(s, { stato: "CORRE", fine: ora + s.resto });
        return s;
      case "azzera":
        return { stato: "PRONTO", durata: s.durata, resto: s.durata, fine: null };
      case "tasto":                                                       // il tasto unico (e T da tastiera)
        /* G01: l'azione si decide su ciò che il tasto mostrava PRIMA della riconciliazione: «Pausa» premuto
           mentre il tempo finisce lascia SCADUTO, non riparte (F11 vale solo per «Avvia» mostrato in SCADUTO) */
        if (mostrato === "CORRE") return timerEvento(s, "pausa", ora);
        if (mostrato === "PAUSA") return timerEvento(s, "riprendi", ora);
        return timerEvento(s, "avvia", ora);
      default:                                                             // "tick" e ogni altro nome: solo riconcilia
        return s;
    }
  }
  function restoAttuale(s, ora) {
    if (s.stato === "CORRE") return limita(s.fine - ora, s.durata);
    return s.stato === "SCADUTO" ? 0 : s.resto;
  }

  /* i primi byte di un PDF: «%PDF-» (F12) */
  function sembraPdf(byte) {
    if (!byte || byte.length < 5) return false;
    return byte[0] === 0x25 && byte[1] === 0x50 && byte[2] === 0x44 && byte[3] === 0x46 && byte[4] === 0x2D;
  }

  /* settore del disco: frazione 0..1 del tempo che resta, in senso orario dalle 12 */
  function settore(f) {
    f = Math.max(0, Math.min(1, f));
    if (f <= 0) return "";
    if (f >= 0.9999) return "M50 2 A48 48 0 1 1 49.99 2 Z";
    var a = f * 2 * Math.PI, x = 50 + 48 * Math.sin(a), y = 50 - 48 * Math.cos(a);
    return "M50 50 L50 2 A48 48 0 " + (f > 0.5 ? 1 : 0) + " 1 " + x.toFixed(2) + " " + y.toFixed(2) + " Z";
  }

  /* «mercoledì 8 ottobre 2026»; null se la data non è valida */
  function dataLavagna(d) {
    if (!(d instanceof Date) || !isFinite(d.getTime())) return null;
    return NOMI_GIORNI[d.getDay()] + " " + d.getDate() + " " + NOMI_MESI[d.getMonth()] + " " + d.getFullYear();
  }

  /* la data di calendario a Roma, lo stesso fuso dell'orologio del motore (fonometro.js), come Date a mezzanotte locale:
     getDay/getDate/getMonth danno il giorno di Roma anche su un PC lasciato su un altro fuso. Se Intl non ha i fusi, la data del PC */
  function dataRoma(d) {
    if (!(d instanceof Date) || !isFinite(d.getTime())) return null;
    try {
      var parti = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
      var m = {};
      for (var i = 0; i < parti.length; i++) m[parti[i].type] = parti[i].value;
      var r = new Date(+m.year, +m.month - 1, +m.day);
      if (isFinite(r.getTime())) return r;
    } catch (e) { /* Intl senza fusi: resta la data del PC */ }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /* «2026-10-08» per l'attributo datetime del <time> */
  function dataIso(d) {
    function due(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + due(d.getMonth() + 1) + "-" + due(d.getDate());
  }

  var api = {
    TESTI: TESTI, DURATA_INIZIALE: DURATA_INIZIALE, HOST_YOUTUBE: HOST_YOUTUBE,
    analizzaLink: analizzaLink, secondiDa: secondiDa, mmss: mmss, durataDaCampi: durataDaCampi,
    nuovoTimer: nuovoTimer, riconcilia: riconcilia, timerEvento: timerEvento, restoAttuale: restoAttuale,
    sembraPdf: sembraPdf, settore: settore, dataLavagna: dataLavagna, dataRoma: dataRoma, dataIso: dataIso,
    CAA: CAA
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  /* ---------- 2 · pagina ---------- */
  var win = radice, doc = win.document;
  win.CasinometroLim = api;
  if (!doc) return;
  var locale = /^(localhost|127\.0\.0\.1)$/.test(win.location.hostname || "");

  function avvio() {
    var sezione = doc.getElementById("fonometro");
    if (!sezione) return;
    var $ = function (id) { return doc.getElementById(id); };
    function testo(n, v) { if (n && n.textContent !== v) n.textContent = v; }

    /* ---- vista A / B: solo griglia CSS, il DOM non si sposta (il riquadro non si ricarica) ---- */
    var tastoA = $("lim-vista-a"), tastoB = $("lim-vista-b");
    function vista(v, scrivi) {
      sezione.setAttribute("data-vista", v);
      tastoA.setAttribute("aria-pressed", v === "a" ? "true" : "false");
      tastoB.setAttribute("aria-pressed", v === "b" ? "true" : "false");
      if (scrivi) {
        try {
          var u = new URL(win.location.href);
          if (v === "b") u.searchParams.set("vista", "b"); else u.searchParams.delete("vista");
          win.history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e) { /* niente */ }
      }
      copiaBarra();
    }
    tastoA.addEventListener("click", function () { vista("a", true); });
    tastoB.addEventListener("click", function () { vista("b", true); });

    /* ---- barra orizzontale della vista A: copia ciò che il motore scrive (F04) ---- */
    var m = {
      livello: $("fono-livello"), sopra: $("fono-livello-sopra"), linea: $("fono-linea"), tacca: $("fono-media-tacca"),
      numero: $("fono-numero"), lineaValore: $("fono-linea-valore"), mediaValore: $("fono-media-tacca-valore"),
      etLinea: $("fono-etichetta-linea"), etMedia: $("fono-etichetta-media")
    };
    var o = {
      sotto: sezione.querySelector(".lim-o-sotto"), sopra: sezione.querySelector(".lim-o-sopra"),
      linea: sezione.querySelector(".lim-o-linea"), media: sezione.querySelector(".lim-o-media"),
      etLinea: sezione.querySelector(".lim-o-et-linea"), etMedia: sezione.querySelector(".lim-o-et-media"),
      vLinea: sezione.querySelector(".lim-o-v-linea"), vMedia: sezione.querySelector(".lim-o-v-media"),
      numero: sezione.querySelector(".lim-numero-valore")
    };
    /* G09: il contratto col motore: se manca un nodo fono-* che la barra A legge, un avviso in console e la
       barra A resta ferma (la pagina e il motore vanno avanti) */
    var mancano = Object.keys(m).filter(function (k) { return !m[k]; });
    if (mancano.length && win.console) win.console.warn("Casinometro v7: mancano nodi del motore per la barra A: " + mancano.join(", "));
    function pc(v) { var n = parseFloat(v); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
    /* l'etichetta sta sopra (linea) o sotto (media) il suo segno; ai bordi non esce dalla barra */
    function stile(n, k, v) { if (n.style[k] !== v) n.style[k] = v; }
    function nascosto(n, v) { if (n.hidden !== v) n.hidden = v; }
    function etichetta(et, left) {
      var p = pc(left || "0");
      stile(et, "left", p + "%");
      stile(et, "transform", p < 8 ? "translateX(0px)" : p > 92 ? "translateX(-100%)" : "translateX(-50%)");
    }
    function copiaBarra() {
      if (mancano.length) return;
      stile(o.sotto, "width", pc(m.livello.style.height) + "%");
      stile(o.sopra, "left", (m.sopra.style.bottom ? pc(m.sopra.style.bottom) : 100) + "%");
      stile(o.sopra, "width", pc(m.sopra.style.height) + "%");
      nascosto(o.linea, m.linea.hidden);
      if (!m.linea.hidden) stile(o.linea, "left", pc(m.linea.style.bottom) + "%");
      nascosto(o.media, m.tacca.hidden);
      if (!m.tacca.hidden) stile(o.media, "left", pc(m.tacca.style.bottom) + "%");
      nascosto(o.etLinea, m.etLinea.hidden || m.linea.hidden);
      etichetta(o.etLinea, o.linea.style.left);
      testo(o.vLinea, m.lineaValore.textContent);
      nascosto(o.etMedia, m.etMedia.hidden || m.tacca.hidden);
      etichetta(o.etMedia, o.media.style.left);
      testo(o.vMedia, m.mediaValore.textContent);
      testo(o.numero, m.numero.textContent);
    }
    /* si osservano solo i cambi del motore: le scritture della barra A non riaccendono l'osservatore */
    var mie = [sezione.querySelector(".lim-orizzontale"), sezione.querySelector(".lim-numero")];
    function delMotore(r) {
      var n = r.target.nodeType === 1 ? r.target : r.target.parentNode;
      return !mie.some(function (x) { return x && x.contains(n); });
    }
    if (win.MutationObserver) {
      new win.MutationObserver(function (rr) { if (rr.some(delMotore)) copiaBarra(); }).observe(sezione.querySelector(".fono-pannello"),
        { subtree: true, attributes: true, attributeFilter: ["style", "hidden"], childList: true, characterData: true });
    }
    win.setInterval(copiaBarra, 250);

    /* ---- timer ---- */
    var tIniettato = null;
    function ora() { return tIniettato === null ? Date.now() : tIniettato; }
    var timer = nuovoTimer(DURATA_INIZIALE), grande = false;
    var t = {
      cifre: $("lim-cifre"), scaduto: $("lim-scaduto"), avvia: $("lim-avvia"), azzera: $("lim-azzera"),
      tempo: $("lim-tempo"), grande: $("lim-grande"), settore: $("lim-settore"), barra: $("lim-barra-pieno"),
      box: $("lim-timer"), pannello: $("lim-pannello"), altro: $("lim-altro"), campi: $("lim-altro-campi"),
      minuti: $("lim-minuti"), secondi: $("lim-secondi"), usa: $("lim-usa"), chiudiPannello: $("lim-pannello-chiudi")
    };
    var durate = Array.prototype.slice.call(sezione.querySelectorAll(".lim-durata"));
    var ultimoStato = "";

    function disegnaTimer() {
      var adesso = ora(), resto = restoAttuale(timer, adesso), st = timer.stato.toLowerCase();
      if (sezione.getAttribute("data-timer") !== st) sezione.setAttribute("data-timer", st);
      testo(t.cifre, mmss(resto));
      var f = timer.durata ? resto / timer.durata : 0;
      var d = settore(f);
      if (t.settore.getAttribute("d") !== d) t.settore.setAttribute("d", d);
      t.barra.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(2) + "%";
      if (st !== ultimoStato) {
        ultimoStato = st;
        testo(t.scaduto, timer.stato === "SCADUTO" ? TESTI.scaduto : "");      // annunciato una volta (role=status)
        var etichetta = timer.stato === "CORRE" ? TESTI.pausa : timer.stato === "PAUSA" ? TESTI.riprendi : TESTI.avvia;
        testo(t.avvia, etichetta);
        if (timer.stato === "CORRE") t.avvia.setAttribute("aria-label", TESTI.pausaTimer);
        else if (timer.stato === "PAUSA") t.avvia.removeAttribute("aria-label");
        else t.avvia.setAttribute("aria-label", TESTI.avviaTimer);
        var ferme = timer.stato === "CORRE" || timer.stato === "PAUSA";
        durate.forEach(function (b) { b.disabled = ferme; });
        t.altro.disabled = ferme;
        controllaCampi();
        blocco();
      }
    }
    function ev(nome, arg) { timer = timerEvento(timer, nome, ora(), arg); disegnaTimer(); }
    t.avvia.addEventListener("click", function () { ev("tasto"); });
    t.azzera.addEventListener("click", function () { ev("azzera"); });
    win.setInterval(function () { timer = timerEvento(timer, "tick", ora()); disegnaTimer(); }, 100);

    /* timer grande: T14 / T16, un tocco fuori dai tasti, Esc */
    function ingrandisci(si) {
      grande = si;
      if (si) chiudiPannello(false);                                       // F09: aperto + ingrandisci = si chiude
      sezione.setAttribute("data-grande", si ? "si" : "no");
      t.grande.setAttribute("aria-pressed", si ? "true" : "false");
      testo(t.grande, si ? TESTI.piccolo : TESTI.grande);
      if (si) controllaVideo();
    }
    /* G22: col video il timer grande prende metà area e il player si restringe (F16). Se la finestra è così
       piccola che il player scenderebbe sotto 200 x 200 o finirebbe sotto il timer, il timer resta piccolo */
    function videoCoperto() {
      if (sezione.getAttribute("data-area") !== "video") return false;
      var f = doc.querySelector("#lim-riquadro iframe:not([hidden])");   // 18/10/2026: l'iframe della CAA può essere nascosto qui accanto
      if (!f) return false;
      var r = f.getBoundingClientRect(), q = t.box.getBoundingClientRect();
      var sopra = Math.min(r.right, q.right) - Math.max(r.left, q.left) > 0.5 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 0.5;
      return r.width < 199.5 || r.height < 199.5 || sopra;
    }
    function controllaVideo() { if (grande && videoCoperto()) ingrandisci(false); }
    win.addEventListener("resize", controllaVideo);
    t.grande.addEventListener("click", function () { ingrandisci(!grande); });
    t.box.addEventListener("click", function (e) {
      if (!grande) return;
      if (e.target.closest && e.target.closest("button:not(#lim-cifre)")) return;
      ingrandisci(false);
    });

    /* pannello delle durate: NON modale (niente showModal), sopra l'area (F09) */
    function apriPannello() {
      if (grande) return;
      t.pannello.hidden = false;
      sezione.setAttribute("data-pannello", "si");
      t.tempo.setAttribute("aria-expanded", "true");
      /* G27: il fuoco va nel pannello, sul primo tasto che si può premere */
      var primo = durate.concat([t.altro, t.chiudiPannello]).filter(function (b) { return !b.disabled; })[0];
      if (primo) primo.focus();
    }
    function chiudiPannello(fuoco) {
      if (t.pannello.hidden) return;
      t.pannello.hidden = true;
      t.campi.hidden = true;
      t.altro.setAttribute("aria-expanded", "false");
      sezione.setAttribute("data-pannello", "no");
      t.tempo.setAttribute("aria-expanded", "false");
      if (fuoco) t.tempo.focus();
    }
    t.tempo.addEventListener("click", function () { if (t.pannello.hidden) apriPannello(); else chiudiPannello(true); });
    t.cifre.addEventListener("click", function () {
      if (grande) return;                                                  // ingrandito: il tocco rimpicciolisce (sopra)
      if (t.pannello.hidden) apriPannello(); else chiudiPannello(true);
    });
    t.chiudiPannello.addEventListener("click", function () { chiudiPannello(true); });
    durate.forEach(function (b) {
      b.addEventListener("click", function () { ev("durata", (+b.getAttribute("data-minuti")) * 60000); chiudiPannello(true); });
    });
    t.altro.addEventListener("click", function () {
      t.campi.hidden = !t.campi.hidden;
      t.altro.setAttribute("aria-expanded", t.campi.hidden ? "false" : "true");
      controllaCampi();
    });
    function controllaCampi() {
      var d = durataDaCampi(t.minuti.value, t.secondi.value);
      t.usa.disabled = d === null || timer.stato === "CORRE" || timer.stato === "PAUSA";
    }
    t.minuti.addEventListener("input", controllaCampi);
    t.secondi.addEventListener("input", controllaCampi);
    t.usa.addEventListener("click", function () {
      var d = durataDaCampi(t.minuti.value, t.secondi.value);
      if (d === null) return;
      ev("durata", d);
      chiudiPannello(true);
    });

    /* tastiera: T per il timer, Esc per rimpicciolire o chiudere il pannello. Lo spazio NON si cattura (F05):
       con l'ascolto attivo è la Pausa del motore anche col fuoco su un tasto della v7; Invio preme i tasti. */
    doc.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target && e.target.tagName;
      if (e.key === "Escape") {
        if (aiutoAperto()) { chiudiAiuto(true); return; }                  // passo 3: l'aiuto si chiude per primo
        if (grande) ingrandisci(false);
        else if (!t.pannello.hidden) chiudiPannello(true);
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "t" || e.key === "T") && !e.repeat) ev("tasto");
    });

    /* Wake Lock del timer (F08): richiesta pendente, risposta tardiva rilasciata, evento release, nuova
       richiesta quando la pagina torna visibile. Nessun avviso nuovo se il browser non lo dà. */
    var tenuto = null, inRichiesta = false;
    function vuoleBlocco() { return timer.stato === "CORRE" && doc.visibilityState === "visible"; }
    function blocco() {
      var wl = win.navigator && win.navigator.wakeLock;
      if (!wl || !wl.request) return;
      if (vuoleBlocco()) {
        if (tenuto || inRichiesta) return;
        inRichiesta = true;
        var p;
        try { p = wl.request("screen"); } catch (e) { inRichiesta = false; return; }
        Promise.resolve(p).then(function (b) {
          inRichiesta = false;
          if (!b) return;
          if (!vuoleBlocco()) {                                            // arrivata tardi
            try { var r0 = b.release(); if (r0 && r0.catch) r0.catch(function () {}); } catch (e) { /* niente */ }   // G45
            return;
          }
          tenuto = b;
          /* G25: se il browser scioglie il blocco da sé (pagina ancora visibile, timer che corre), si richiede */
          if (b.addEventListener) b.addEventListener("release", function () {
            if (tenuto !== b) return;                                       // rilascio nostro: niente
            tenuto = null;
            blocco();
          });
        }, function () { inRichiesta = false; });
      } else if (tenuto) {
        var b0 = tenuto; tenuto = null;
        try { var r = b0.release(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* niente */ }
      }
    }
    doc.addEventListener("visibilitychange", function () {
      timer = timerEvento(timer, "tick", ora());                           // al rientro il resto si ricalcola
      disegnaTimer();
      blocco();
    });

    /* ---- area grande ---- */
    var a = {
      form: $("lim-form"), campo: $("lim-link"), pdf: $("lim-pdf"), file: $("lim-file"), scheda: $("lim-scheda"),
      chiudi: $("lim-chiudi"), riquadro: $("lim-riquadro"), nota: $("lim-nota-sito"), msg: $("lim-messaggio")
    };
    testo(a.nota, TESTI.notaSito);
    var destinazione = null;            // F18: l'ultimo link valido (anche http) o il PDF, il più recente
    var pdfUrl = null, rinvio = {};      // G08: rinvio della revoca per SINGOLO blob (url -> ora di scadenza)
    var videoScheda = null;              // G23: la scheda del video mostrato adesso (null se non c'è video)
    var giroArea = 0;                    // G03: ogni scelta (link, PDF, Chiudi) avanza il giro; le letture vecchie si ignorano

    function messaggio(v) { testo(a.msg, v || ""); }
    function tipoArea(v) {
      var era = sezione.getAttribute("data-area");
      sezione.setAttribute("data-area", v); a.nota.hidden = v !== "sito";
      if (v === "video") videoEntra(); else if (era === "video") videoEsce();   // 19/10/2026: pausa automatica del fonometro
    }

    /* ---- 19/10/2026 (richiesta di Mauro): col video di YouTube nel riquadro il microfono sente le casse e il motore
       tratterebbe l'audio del video come rumore della classe (sopra la linea, X, sfida). Quindi all'apertura di un video, se il
       fonometro è in ascolto e non già in pausa, questa pagina preme la sua Pausa (lo stesso tasto del docente: il motore non
       si tocca) e lo dice nel messaggio; quando il video lascia il riquadro (Chiudi, un altro contenuto, «Apri in una scheda»)
       preme Riprendi, ma solo se la pausa è ancora la sua: se nel frattempo il docente ha ripreso o l'ascolto si è fermato
       (la fase è cambiata), la pagina non fa niente. Una pausa messa dal docente PRIMA del video resta sua: non si riprende.
       La pagina non sa se il video suona davvero (player di un'altra origine): la pausa dura finché il video è aperto. ---- */
    var tastoPausa = $("fono-pausa"), pausaDaVideo = false;
    function faseFono() { return sezione.getAttribute("data-fase") || ""; }
    function videoEntra() {
      if (pausaDaVideo) { messaggio(TESTI.pausaVideo); return; }                                 // un video sopra l'altro: la pausa resta, il messaggio torna
      if (!tastoPausa || tastoPausa.disabled || faseFono() === "pausa") return;                  // non in ascolto, o pausa del docente
      tastoPausa.click();
      if (faseFono() !== "pausa") return;
      pausaDaVideo = true;
      messaggio(TESTI.pausaVideo);
    }
    function videoEsce() {
      if (!pausaDaVideo) return;
      pausaDaVideo = false;
      if (!tastoPausa || tastoPausa.disabled || faseFono() !== "pausa") return;
      tastoPausa.click();
      messaggio(TESTI.riprendeVideo);
    }
    if (win.MutationObserver) new win.MutationObserver(function () {
      if (pausaDaVideo && faseFono() !== "pausa") pausaDaVideo = false;    // il docente ha ripreso (o l'ascolto si è fermato): la pausa non è più nostra
    }).observe(sezione, { attributes: true, attributeFilter: ["data-fase"] });
    function aggiornaScheda() { a.scheda.disabled = !destinazione; }

    /* ---- 15/10/2026 (piano caa-lavagna: S1, S2, S4; R2, R6, R10 della regia) · il tasto «Schede CAA» apre nel
       riquadro la /caa/ del sito in modalità compatta. Apertura DEDICATA con indirizzo fisso: analizzaLink continua a
       rifiutare la stessa origine (F13), qui il campo del link non c'entra. Come ogni scelta (G03) avanza il giro, così una
       lettura PDF pendente non sostituisce la CAA dopo il clic (R2); «Apri in una scheda» porta a /caa/ senza lim (R10);
       Chiudi come per ogni sito. Il riquadro riceve clipboard-write SOLO per la CAA (S4, dentro riquadro()).
       18/10/2026 (rilievo C06): aprendo un PDF, un sito o un video la CAA non si distrugge, si NASCONDE (riquadro() tiene caaFrame);
       al tocco su «Schede CAA» torna visibile con lo stesso iframe, e il lavoro dentro (foto, scheda) non si perde. ---- */
    var tastoCaa = $("lim-caa");
    function apriCaa() {
      if (grande) ingrandisci(false);                                      // come faceva il tasto AI: il timer torna piccolo, il conto va avanti
      if (sezione.getAttribute("data-area") === "caa") return;             // già visibile nel riquadro: un secondo tocco non ricarica (il lavoro resta)
      giroArea++;                                                          // G03, R2
      lasciaPdf();
      videoScheda = null;
      riquadro("caa", CAA.riquadro);                                       // 18/10/2026: se la CAA è nascosta torna visibile, stesso elemento
      destinazione = CAA.scheda;                                           // «Apri in una scheda» punta a ../caa/ quando la CAA è visibile
      aggiornaScheda();
      messaggio("");
      tipoArea("caa");
    }
    if (tastoCaa) tastoCaa.addEventListener("click", apriCaa);
    /* ponte per la cache (R4, revisione cloud rilievo 7): un index.html vecchio rimasto nel browser con questo lim.js nuovo
       ha ancora il tasto AI; quel tocco apre la CAA invece di restare inerte */
    var tastoAiVecchio = $("lim-ai");
    if (tastoAiVecchio) tastoAiVecchio.addEventListener("click", apriCaa);

    /* F19: si revoca al cambio di PDF e a Chiudi, mai nei 60 secondi dopo un «Apri in una scheda» */
    function revoca(url) {
      if (!url) return;
      var resta = (rinvio[url] || 0) - Date.now();
      delete rinvio[url];
      if (resta > 0) win.setTimeout(function () { win.URL.revokeObjectURL(url); }, resta);
      else win.URL.revokeObjectURL(url);
    }
    function lasciaPdf() { if (pdfUrl) { var u = pdfUrl; pdfUrl = null; revoca(u); } }

    /* il riquadro si ricrea a ogni contenuto: nessun attributo resta dal precedente (F13).
       18/10/2026 (rilievo C06, piano caa-lavagna-20261018): unica eccezione l'iframe della CAA (caaFrame). Non si distrugge quando si
       apre un altro contenuto: si nasconde (hidden + aria-hidden; il documento dentro resta vivo) e al prossimo riquadro("caa") torna
       visibile, lo STESSO elemento (spostarlo nel DOM lo ricaricherebbe, quindi qui non si sposta mai). Lo distrugge solo
       riquadro(null) senza tieniCaa, cioè «Chiudi». tieniCaa = true: lo svuotamento di «Apri in una scheda» su un video lascia la CAA. */
    var caaFrame = null;
    function nascondiCaa(si) {
      if (!caaFrame) return;
      caaFrame.hidden = si;
      if (si) caaFrame.setAttribute("aria-hidden", "true"); else caaFrame.removeAttribute("aria-hidden");
    }
    function riquadro(tipo, src, tieniCaa) {
      Array.prototype.slice.call(a.riquadro.children).forEach(function (n) { if (n !== caaFrame) a.riquadro.removeChild(n); });
      if (caaFrame && caaFrame.parentNode !== a.riquadro) caaFrame = null;   // difesa: se non è più nel riquadro non è più nostro
      if (tipo === "caa" && caaFrame) { nascondiCaa(false); return caaFrame; }
      if (caaFrame && (tipo || tieniCaa)) nascondiCaa(true);              // un altro contenuto (o lo svuotamento "tieni"): la CAA resta, nascosta
      else if (caaFrame) { a.riquadro.removeChild(caaFrame); caaFrame = null; }   // Chiudi: la distrugge
      if (!tipo) return null;
      var f = doc.createElement("iframe");
      if (tipo === "sito" || tipo === "caa") {
        /* la /caa/ è una pagina nostra, della stessa origine: una sandbox con allow-same-origin non la conterrebbe (Chromium lo
           avverte in console) e senza allow-same-origin il «Copia» e la modalità compatta non funzionerebbero. Quindi per la CAA
           niente sandbox, come per il PDF; i siti incollati restano in sandbox come prima (F13-F15) */
        if (tipo === "sito") f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation");
        /* S4: clipboard-write SOLO per la /caa/ della stessa origine (il «Copia» del prompt); mai per un sito incollato.
           18/10/2026: la /caa/ nuova può usare la webcam del PC per fotografare la pagina del libro, quindi `camera` (solo a lei,
           stessa origine); microfono e posizione restano negati. Per i siti incollati resta tutto negato come prima. */
        f.setAttribute("allow", tipo === "caa" ? "clipboard-write; camera; microphone 'none'; geolocation 'none'"
                                               : "microphone 'none'; camera 'none'; geolocation 'none'");
        f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        f.title = tipo === "caa" ? TESTI.caa : TESTI.titoloSito;
      } else if (tipo === "video") {
        /* decisione 10 del 5/10: lo schermo intero del video RESTA (allowfullscreen); a video pieno la Pausa
           della pagina non si vede: scelta del docente. Il player non si copre mai: si restringe (F16) */
        f.setAttribute("allow", "fullscreen; picture-in-picture; encrypted-media");
        f.setAttribute("allowfullscreen", "");
        f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        f.title = TESTI.titoloVideo;
      } else {
        f.title = TESTI.titoloPdf;                                         // PDF: senza sandbox (il lettore del browser)
      }
      f.src = src;
      a.riquadro.appendChild(f);
      if (tipo === "caa") caaFrame = f;
      return f;
    }

    a.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var r = analizzaLink(a.campo.value, win.location.origin);
      if (r.tipo === "errore") { messaggio(TESTI.nonLink); return; }       // la destinazione non cambia (F18)
      giroArea++;                                                          // G03
      destinazione = r.scheda;
      aggiornaScheda();
      if (r.tipo === "http") { messaggio(TESTI.http); return; }            // il contenuto resta com'è
      messaggio("");
      lasciaPdf();
      riquadro(r.tipo, r.riquadro);
      videoScheda = r.tipo === "video" ? r.scheda : null;
      tipoArea(r.tipo);
      if (grande) controllaVideo();                                        // G22
    });

    /* v9: data sulla lavagna (fuso di Roma, come l'orologio). Si rinfrescano allo scoccare di ogni minuto,
       al rientro nella scheda e al ritorno dalla cache del browser: la pagina può restare aperta da un giorno all'altro.
       Gli attributi si scrivono solo se cambiano */
    var dataEl = $("lim-data"), attesaLavagna = null;
    function lavagnaDelGiorno() {
      var adesso = dataRoma(new Date()), iso = dataIso(adesso);
      testo(dataEl, dataLavagna(adesso) || "");
      if (dataEl && dataEl.getAttribute("datetime") !== iso) dataEl.setAttribute("datetime", iso);
    }
    function aggiornaLavagna() {
      win.clearTimeout(attesaLavagna);
      lavagnaDelGiorno();
      if (!doc.hidden) attesaLavagna = win.setTimeout(aggiornaLavagna, 60000 - (Date.now() % 60000) + 25);
    }
    doc.addEventListener("visibilitychange", aggiornaLavagna);
    win.addEventListener("pageshow", aggiornaLavagna);
    aggiornaLavagna();

    a.pdf.addEventListener("click", function () { a.file.click(); });
    a.file.addEventListener("change", function () {
      var file = a.file.files && a.file.files[0];
      a.file.value = "";
      if (!file) return;
      var mio = ++giroArea;                                                // G03
      var leggi = file.slice(0, 5);
      var promessa = leggi.arrayBuffer ? leggi.arrayBuffer() : new Promise(function (ok, ko) {
        var fr = new win.FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = ko; fr.readAsArrayBuffer(leggi);
      });
      promessa.then(function (buf) {
        if (mio !== giroArea) return;                                      // G03: nel frattempo è cambiato il contenuto
        if (!sembraPdf(new Uint8Array(buf))) { messaggio(TESTI.nonPdf); return; }
        var blob = new win.Blob([file], { type: "application/pdf" });     // F12: mai il File originale
        lasciaPdf();
        pdfUrl = win.URL.createObjectURL(blob);
        destinazione = pdfUrl;
        aggiornaScheda();
        messaggio("");
        riquadro("pdf", pdfUrl);
        videoScheda = null;
        tipoArea("pdf");
      }, function () { if (mio === giroArea) messaggio(TESTI.nonPdf); });
    });

    a.scheda.addEventListener("click", function () {
      if (!destinazione) return;
      var w = null;
      try { w = win.open(destinazione, "_blank"); } catch (e) { w = null; }
      if (!w) { messaggio(TESTI.bloccata); return; }                       // F20
      try { w.opener = null; } catch (e) { /* niente */ }
      messaggio("");
      if (destinazione === pdfUrl) rinvio[pdfUrl] = Date.now() + 60000;     // G08: solo questo blob
      /* F17 con G02/G23/G41: il player si svuota solo se la scheda aperta È il video mostrato (niente audio
         doppio); poi la stessa pulizia di Chiudi. Un link http aperto mentre c'è un video lascia il video */
      if (sezione.getAttribute("data-area") === "video" && videoScheda && destinazione === videoScheda) {
        giroArea++;
        riquadro(null, null, true);                                        // 18/10/2026: il video si svuota, la CAA nascosta resta
        videoScheda = null;
        destinazione = null;
        aggiornaScheda();
        tipoArea("vuota");
      }
    });

    a.chiudi.addEventListener("click", function () {
      giroArea++;                                                          // G03
      videoScheda = null;
      riquadro(null);
      lasciaPdf();
      destinazione = null;
      aggiornaScheda();
      messaggio("");
      tipoArea("vuota");
    });

    /* ---- passo 3 · aiuto «?»: istruzioni, informativa, versione. Solo testo scritto nella pagina (lim.html):
       nessuna richiesta, nessuna memoria. Si apre sopra l'area (timer grande e pannello delle durate si chiudono),
       si chiude con «Chiudi l'aiuto», con «?» o con Esc; il fuoco torna al tasto «?» ---- */
    var aiuto = { tasto: $("lim-aiuto-apri"), box: $("lim-aiuto"), chiudi: $("lim-aiuto-chiudi"), scorre: $("lim-aiuto-scorre") };
    var conAiuto = !!(aiuto.tasto && aiuto.box && aiuto.chiudi && aiuto.scorre);
    function aiutoAperto() { return conAiuto && !aiuto.box.hidden; }
    function apriAiuto() {
      if (!conAiuto || aiutoAperto()) return;
      if (grande) ingrandisci(false);
      if (!t.pannello.hidden) chiudiPannello(false);
      aiuto.box.hidden = false;
      aiuto.scorre.scrollTop = 0;
      aiuto.tasto.setAttribute("aria-expanded", "true");
      sezione.setAttribute("data-aiuto", "si");
      aiuto.chiudi.focus();
    }
    function chiudiAiuto(rifuoco) {
      if (!aiutoAperto()) return;
      aiuto.box.hidden = true;
      aiuto.tasto.setAttribute("aria-expanded", "false");
      sezione.setAttribute("data-aiuto", "no");
      if (rifuoco) aiuto.tasto.focus();
    }
    if (conAiuto) {
      aiuto.tasto.addEventListener("click", function () { if (aiutoAperto()) chiudiAiuto(true); else apriAiuto(); });
      aiuto.chiudi.addEventListener("click", function () { chiudiAiuto(true); });
    }

    /* ---- avvio ---- */
    var v = "a";
    try { v = new URL(win.location.href).searchParams.get("vista") === "b" ? "b" : "a"; } catch (e) { /* niente */ }
    vista(v, false);
    ingrandisci(false);
    aggiornaScheda();
    disegnaTimer();
    copiaBarra();

    /* ---- solo in locale: tempo del timer iniettato per le prove ---- */
    if (locale) {
      api.inietta = function (tt) {
        if (!(tt === null || (typeof tt === "number" && isFinite(tt)))) return false;   // G34
        tIniettato = tt; timer = timerEvento(timer, "tick", ora()); disegnaTimer(); return true; };
      api.statoArea = function () {
        return { area: sezione.getAttribute("data-area"), destinazione: destinazione, giro: giroArea, pdf: !!pdfUrl };
      };
      api.statoTimer = function () { return { stato: timer.stato, durata: timer.durata, resto: restoAttuale(timer, ora()), grande: grande, blocco: !!tenuto }; };
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", avvio);
  else avvio();
})(typeof window !== "undefined" ? window : this);
