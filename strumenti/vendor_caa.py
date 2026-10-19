#!/usr/bin/env python3
"""vendor_caa.py: scarica i file di Tesseract.js che la /caa/ usa per leggere la foto NEL BROWSER (0 token, solo stdlib).

Piano ws caa-lavagna del 18/10/2026 (note/caa-lavagna-20261018/PIANO.md, deliverable A, passo P1): la lettura della foto
avviene nel browser del docente con Tesseract.js servito dalla STESSA origine (niente CDN a runtime: nessun indirizzo IP
del docente verso terzi, nessun blocco delle reti scolastiche sui CDN). I file pesano insieme circa 9 MB e NON stanno
in git (budget del repo): vivono in output/caa-lim/caa/vendor/ (in .gitignore) e si rigenerano con questo script.

Versione e impronta SHA-256 di ogni file sono fissate in strumenti/vendor_caa.json: lo script rifiuta un file diverso
(un CDN che cambia un file sotto lo stesso nome non entra nel sito). La prima volta (--fissa) scrive le impronte
dei file appena scaricati: va lanciato UNA volta, con gli occhi sul risultato, e poi mai più.

Uso (dalla cartella del progetto):
  python3 strumenti/vendor_caa.py                 scarica ciò che manca o è diverso, verifica le impronte
  python3 strumenti/vendor_caa.py --controlla     non scarica: esce 1 se un file manca o ha un'impronta diversa
  python3 strumenti/vendor_caa.py --fissa         scarica e SCRIVE le impronte nel json (solo la prima volta)
  python3 strumenti/vendor_caa.py --dest DIR      scarica in un'altra cartella (il pacchetto open source: caa/vendor)
"""
import argparse
import gzip
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

QUI = Path(__file__).resolve().parent.parent
JSON = Path(__file__).resolve().parent / "vendor_caa.json"
VENDOR = QUI / "output" / "caa-lim" / "caa" / "vendor"

# nome locale -> indirizzo di origine. Versioni fissate il 18/10/2026 (tesseract.js 7.0.0 era l'ultima su npm quel giorno).
# Il core *.wasm.js porta il binario dentro (un file solo); corePath è la CARTELLA e getCore.js sceglie fra
# relaxedsimd, simd e nessuno (i Chrome vecchi delle LIM): servono tutti e tre i core LSTM.
TESSERACT = "7.0.0"
CORE = "7.0.0"
ORIGINI = {
    "tesseract.min.js": f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT}/dist/tesseract.min.js",
    "worker.min.js": f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT}/dist/worker.min.js",
    "tesseract-core-simd-lstm.wasm.js": f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{CORE}/tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-lstm.wasm.js": f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{CORE}/tesseract-core-lstm.wasm.js",
    # getCore.js di tesseract.js 7.0.0 sceglie fra relaxedsimd, simd e nessuno (rilievo R01 di Codex, 18/10): i tre LSTM
    "tesseract-core-relaxedsimd-lstm.wasm.js": f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{CORE}/tesseract-core-relaxedsimd-lstm.wasm.js",
    # la lingua si tiene DECOMPRESSA (2,7 MB) e il worker gira con gzip:false: un file .gz servito da LiteSpeed può
    # arrivare con Content-Encoding già applicato e far fallire la decompressione interna (rilievo R04 di Gemini, 18/10)
    "ita.traineddata": "https://tessdata.projectnaptha.com/4.0.0_fast/ita.traineddata.gz",
    # licenze Apache-2.0 consegnate INSIEME ai file (Apache §4; rilievo R19 di Codex)
    "LICENSE-tesseract.js.txt": f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT}/LICENSE.md",
    "LICENSE-tesseract.js-core.txt": f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{CORE}/LICENSE",
}
DA_DECOMPRIMERE = {"ita.traineddata"}
TETTO = 5 * 1024 * 1024  # nessun file del sito sopra i 5 MB (regola del banco)


def sha256(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for blocco in iter(lambda: f.read(1 << 20), b""):
            h.update(blocco)
    return h.hexdigest()


def scarica(url, dest, decomprimi=False):
    req = urllib.request.Request(url, headers={"User-Agent": "casinometro-vendor-caa/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        dati = r.read()
    if decomprimi:
        dati = gzip.decompress(dati)
    dest.write_bytes(dati)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--controlla", action="store_true")
    ap.add_argument("--fissa", action="store_true")
    ap.add_argument("--dest", default=None, help="cartella di destinazione (default output/caa-lim/caa/vendor)")
    a = ap.parse_args()
    global VENDOR
    if a.dest:
        VENDOR = Path(a.dest).resolve()
    attese = json.loads(JSON.read_text(encoding="utf-8")) if JSON.is_file() else {}
    if a.controlla and not attese:
        sys.exit(f"ROSSO: manca {JSON.relative_to(QUI)}: lanciare prima --fissa")
    VENDOR.mkdir(parents=True, exist_ok=True)
    errori, nuove = [], {}
    for nome, url in ORIGINI.items():
        p = VENDOR / nome
        if not a.controlla and (not p.is_file() or (attese and attese.get(nome, {}).get("sha256") != sha256(p))):
            print(f"scarico {nome} da {url}", flush=True)
            scarica(url, p, nome in DA_DECOMPRIMERE)
        if not p.is_file():
            errori.append(f"{nome}: manca")
            continue
        byte, imp = p.stat().st_size, sha256(p)
        if byte > TETTO:
            errori.append(f"{nome}: {byte} byte, oltre il tetto di 5 MB")
        nuove[nome] = {"url": url, "byte": byte, "sha256": imp}
        if attese and not a.fissa:
            att = attese.get(nome)
            if not att:
                errori.append(f"{nome}: non previsto in vendor_caa.json")
            elif att["sha256"] != imp or att["url"] != url:
                errori.append(f"{nome}: impronta o origine DIVERSA da vendor_caa.json (atteso {att['sha256'][:12]}, trovato {imp[:12]})")
        print(f"  {nome:38} {byte:>9} byte  {imp[:16]}", flush=True)
    if a.fissa:
        JSON.write_text(json.dumps(nuove, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"impronte scritte in {JSON.relative_to(QUI)}")
    if errori:
        print("ROSSO:\n  " + "\n  ".join(errori))
        sys.exit(1)
    print(f"VERDE: {len(nuove)} file in {VENDOR.relative_to(QUI) if VENDOR.is_relative_to(QUI) else VENDOR}")


if __name__ == "__main__":
    main()
