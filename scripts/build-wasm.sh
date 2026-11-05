#!/usr/bin/env bash
# 全エンジンと ColorfulYomi を 1 つの WebAssembly（web/engine/player-core.{js,wasm}）にする。
#   EMSDK=/path/to/emsdk scripts/build-wasm.sh
#   scripts/build-wasm.sh --node OUT.mjs   # 試験用（Node.js で読み込む版）
# Emscripten（emsdk）が必要。SPDX-License-Identifier: MIT
set -euo pipefail
cd "$(dirname "$0")/.."

EMSDK="${EMSDK:-$HOME/emsdk}"
if command -v emcc >/dev/null 2>&1; then
    EMCC=(emcc)
elif [ -f "$EMSDK/upstream/emscripten/emcc.py" ]; then
    export EM_CONFIG="${EM_CONFIG:-$EMSDK/.emscripten}"
    PY="$(ls -d "$EMSDK"/python/*/python* 2>/dev/null | head -1 || true)"
    EMCC=("${PY:-python3}" "$EMSDK/upstream/emscripten/emcc.py")
else
    echo "emcc が見つかりません（EMSDK=$EMSDK）" >&2
    exit 1
fi

E=engines
V1=$E/ColorfulTalk-V1 V2=$E/ColorfulTalk-V2 V3=$E/ColorfulTalk-V3 NANO=$E/ColorfulTalk-nano YOMI=$E/ColorfulYomi
SRC=(
    core/pl_core.c
    $V1/common/src/ct_koe.c $V1/common/src/ct_wav.c $V1/fx/src/*.c
    $V1/src/ct1_api.c $V1/src/ct1_voices.c
    $V2/src/ct2_api.c $V2/src/ct2_voice.c $V2/src/ct2_builtin_voices.c
    $V3/src/*.c
    $NANO/src/ctn.c $NANO/src/ctn_tables.c
    $YOMI/src/*.c
)
INC=(-Icore -I$V1/include -I$V1/common/include -I$V1/fx/include -I$V1/src -I$V2/include -I$V2/src
     -I$V3/include -I$V3/src -I$NANO/include -I$YOMI/include -I$YOMI/src)
EXPORTS='["_pl_version","_pl_voice_count","_pl_voice_name","_pl_synth","_pl_free","_pl_v3_preset","_pl_yomi_open","_pl_yomi_close","_pl_yomi_loaded","_pl_yomi","_pl_yomi_add_word","_malloc","_free"]'

OUT=web/engine/player-core.js
ENVS=web,worker
if [ "${1:-}" = "--node" ]; then OUT="$2"; ENVS=node; fi
mkdir -p "$(dirname "$OUT")"
"${EMCC[@]}" -O2 -std=c99 "${INC[@]}" -DCT1_VOICE_ALL=1 -DCT1_VOICE_ID=0 "${SRC[@]}" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPlayerCore \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sFILESYSTEM=0 -sENVIRONMENT=$ENVS \
    -sEXPORTED_FUNCTIONS="$EXPORTS" \
    -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToNewUTF8","HEAPU8","HEAP16","HEAP32","HEAPF32"]' \
    -o "$OUT"
ls -l "$(dirname "$OUT")"
