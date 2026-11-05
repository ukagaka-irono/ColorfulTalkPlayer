#!/usr/bin/env bash
# 辞書（Colorful-dictionary 版 1）を web/dic/colorful_talk.dic に置く。SHA-256 を確かめる。
#   scripts/fetch-dic.sh            # GitHub のリリースから取得（約 26MB）
#   scripts/fetch-dic.sh FILE       # 手元の colorful_talk.dic を使う
# SPDX-License-Identifier: MIT
set -euo pipefail
cd "$(dirname "$0")/.."

URL=https://github.com/ukagaka-irono/Colorful-dictionary/releases/download/v1/colorful_talk.dic
SHA=9926d6cbfba5d3efb0208853033ccc05d5b9c87fb8ef9b11e43c93e972ee724d
OUT=web/dic/colorful_talk.dic

sum() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

mkdir -p web/dic
if [ -f "$OUT" ] && [ "$(sum "$OUT")" = "$SHA" ]; then echo "$OUT は最新です"; exit 0; fi
if [ $# -ge 1 ]; then cp "$1" "$OUT.tmp"; else curl -fL -o "$OUT.tmp" "$URL"; fi
if [ "$(sum "$OUT.tmp")" != "$SHA" ]; then rm -f "$OUT.tmp"; echo "SHA-256 が一致しません" >&2; exit 1; fi
mv "$OUT.tmp" "$OUT"
curl -fsL -o web/dic/NOTICE https://github.com/ukagaka-irono/Colorful-dictionary/releases/download/v1/NOTICE || true
echo "$OUT を置きました"
