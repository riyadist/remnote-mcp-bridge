"""Kopruyle mnemonic_gate.py arasindaki surekli calisan yardimci.

Kurallar burada degil, ContextTranslator/mnemonic_gate.py icindedir. Sozluk ~7 sn'de
yuklendigi icin surec acik kalir. stdin kapaninca (kopru kapaninca) kendiliginden biter.

Giris satiri : {"word": "...", "texts": ["..."]}
Ilk cikis    : {"ready": true|false, "error": "..."}
Sonraki cikis: {"results": [{"ok": true|false, "reasons": [...]}]}
"""
import contextlib
import json
import os
import sys

DEFAULT_GATE_DIR = os.path.join(os.path.expanduser("~"), "Applications", "Lenovo-Tools", "ContextTranslator")


def load_gate():
    sys.path.insert(0, os.environ.get("REMNOTE_MNEMONIC_GATE_DIR") or DEFAULT_GATE_DIR)
    # Sozluk kutuphanesinin ciktisi protokol satirlarina karismasin.
    with contextlib.redirect_stdout(sys.stderr):
        import mnemonic_gate

        ready = mnemonic_gate.lexicon_available()
    return mnemonic_gate, ready


def answer(gate, request):
    results = []
    for text in request.get("texts") or []:
        ok, reasons = gate.check_mnemonic(request.get("word") or "", text)
        results.append({"ok": bool(ok), "reasons": list(reasons)})
    return {"results": results}


def emit(stream, payload):
    stream.write(json.dumps(payload, ensure_ascii=False) + "\n")
    stream.flush()


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        gate, ready = load_gate()
        error = "" if ready else str(gate.lexicon_error() or "sozluk_yok")
    except Exception as exc:
        gate, ready, error = None, False, repr(exc)
    emit(sys.stdout, {"ready": bool(ready), "error": error})
    if not ready:
        return 1
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            emit(sys.stdout, answer(gate, json.loads(line)))
        except Exception as exc:
            emit(sys.stdout, {"error": repr(exc)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
