/* Casinometro v7, F02 e G07: il motore legge «livello» dall'indirizzo appena viene valutato. Questo file si
   carica PRIMA di fonometro.js e toglie il parametro con replaceState (niente ricarica, «vista» resta): la v7
   resta al livello gratuito finché non si decide D7-1. È un file a parte e non uno script in linea, così
   regge anche con una Content-Security-Policy «script-src 'self'». */
(function () {
  "use strict";
  try {
    var u = new URL(window.location.href);
    if (u.searchParams.has("livello")) {
      u.searchParams.delete("livello");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  } catch (e) { /* indirizzo strano: la pagina parte com'è */ }
})();
