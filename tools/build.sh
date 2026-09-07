#!/usr/bin/env bash
# Ultimate Hammer — сборка .mcaddon (BP + RP) без внешних зависимостей.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="Ultimate_Hammer_v1.2.0.mcaddon"
python3 - "$OUT" <<'PY'
import sys, zipfile, os
out = sys.argv[1]
root = os.getcwd()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for pack in ("behavior_packs/ultimate_hammer_bp", "resource_packs/ultimate_hammer_rp"):
        for dirpath, _, files in os.walk(pack):
            for f in sorted(files):
                full = os.path.join(dirpath, f)
                z.write(full, os.path.relpath(full, os.path.dirname(pack)))
print("built", out)
PY
ls -la "$OUT"
