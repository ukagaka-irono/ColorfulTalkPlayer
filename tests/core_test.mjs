// player-core（WebAssembly）の試験: 各エンジンの出力が、エンジンのリポジトリでビルドした ctalk と同じかを確かめる。
//   scripts/build-wasm.sh --node tests/build/player-core-node.mjs
//   node tests/core_test.mjs --dic colorful_talk.dic [--v1 ctalk.exe --v2 ... --v3 ... --nano ... --cyomi cyomi.exe]
// ctalk / cyomi を指定しなければ、その比較は省いて動作だけ確かめる。SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlayerCore, splitSentences } from "../web/core.js";
import factory from "./build/player-core-node.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
let fails = 0;
const ng = (msg) => { console.log("NG " + msg); fails++; };
const ok = (msg) => console.log("OK " + msg);

function readWav(path) {
  const b = readFileSync(path);
  let o = 12;
  while (o < b.length) {
    const id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "data") return { pcm: new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + size)), rate: b.readUInt32LE(24) };
    o += 8 + size;
  }
  throw new Error("no data chunk: " + path);
}

// tol: 許す差。V3 は浮動小数点の数学関数（sinf・expf など）の実装の違いで ±数 LSB ずれる
function same(a, b, tol = 0) {
  if (a.length !== b.length) return `長さ ${a.length} と ${b.length}`;
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst > tol ? `最大の差 ${worst}` : "";
}

const core = await PlayerCore.create(factory);
console.log("player-core " + core.version());
const tmp = mkdtempSync(join(tmpdir(), "ctplayer-"));

const KANA = "こんにちわ、せか'い。きょ'ーわ/い'い/て'んきです。";
const ROMAN = "konnichiwa,seka'i.kyo'-wa/i'i/te'Nkidesu.";
const CASES = [
  { engine: 0, voice: 0, koe: KANA, exe: args.v3, opt: ["-v", "f1"] },
  { engine: 0, voice: 1, koe: KANA, exe: args.v3, opt: ["-v", "m1"], p: { speed: 1.3 } , popt: ["-s", "1.3"] },
  { engine: 1, voice: 0, koe: KANA, exe: args.v2, opt: ["-v", "f1"] },
  { engine: 1, voice: 12, koe: KANA, exe: args.v2, opt: ["-v", "w1"], p: { speed: 0.8 }, popt: ["-s", "80"] },
  { engine: 2, voice: 0, koe: KANA, exe: args.v1, opt: ["-v", "F1"] },
  { engine: 2, voice: 9, koe: KANA, exe: args.v1, opt: ["-v", "K1"] },
  { engine: 3, voice: 0, koe: ROMAN, exe: args.nano, opt: ["-v", "F"] },
  { engine: 3, voice: 3, koe: ROMAN, exe: args.nano, opt: ["-v", "R"] },
];
for (const c of CASES) {
  const label = `engine ${c.engine} voice ${c.voice}`;
  const r = core.synth(c.engine, c.voice, c.koe, c.p || {});
  if (r.err) { ng(`${label}: error ${r.err}`); continue; }
  if (r.pcm.length < 4000) { ng(`${label}: 短すぎる ${r.pcm.length}`); continue; }
  if (!c.exe) { ok(`${label}: ${r.pcm.length} サンプル（${r.rate}Hz）`); continue; }
  const wav = join(tmp, "ref.wav");
  execFileSync(c.exe, [...c.opt, ...(c.popt || []), "-o", wav, c.koe]);
  const ref = readWav(wav);
  const tol = c.engine === 0 ? 4 : 0;
  const d = same(r.pcm, ref.pcm, tol);
  if (d || ref.rate !== r.rate) ng(`${label}: ctalk と違う（${d || "周波数"}）`);
  else ok(`${label}: ctalk と一致（${r.pcm.length} サンプル${tol ? `、差 ±${tol} 以内` : "、ビット単位"}）`);
}

// 記号列の誤り
const bad = core.synth(0, 0, "あ漢字");
if (bad.err === 3 && bad.errpos === 1) ok("誤りの位置"); else ng(`誤りの位置: ${JSON.stringify(bad)}`);

// 文の区切り
const parts = splitSentences("おはよう。今日は晴れ！\n\n明日は？");
if (parts.length === 3 && parts[1].pause === 0.7) ok("文の区切り"); else ng("文の区切り: " + JSON.stringify(parts));

// ColorfulYomi
if (args.dic) {
  const r = core.loadDic(readFileSync(args.dic));
  if (r) ng("辞書: " + r);
  const texts = ["今日はいい天気ですね。", "2026年11月5日です。", "コンピューターで音声を合成します。"];
  for (const t of texts) {
    const k = core.yomi(t, 0), ro = core.yomi(t, 1);
    if (k.err || ro.err) { ng(`yomi ${t}`); continue; }
    if (args.cyomi) {
      const ref = execFileSync(args.cyomi, ["-d", args.dic, t]).toString("utf8").trim();
      const refR = execFileSync(args.cyomi, ["-r", "-d", args.dic, t]).toString("utf8").trim();
      if (ref !== k.text || refR !== ro.text) ng(`yomi ${t}: ${k.text} / ${ref}`);
      else ok(`yomi ${t} → ${k.text}`);
    } else ok(`yomi ${t} → ${k.text}`);
  }
  if (core.addWord("ColorfulTalk", "カラフルトーク", 5, "固有名詞") === 0 && core.yomi("ColorfulTalk", 0).text === "からふると'ーく")
    ok("ユーザー辞書");
  else ng("ユーザー辞書");
  core.reopenDic();
  if (core.yomi("ColorfulTalk", 0).text !== "からふると'ーく") ok("ユーザー辞書を消す"); else ng("ユーザー辞書を消す");
}
console.log(fails ? `${fails} 件の失敗` : "すべて合格");
process.exit(fails ? 1 : 0);
