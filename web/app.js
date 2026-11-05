// ColorfulTalkPlayer の画面  SPDX-License-Identifier: MIT
import { PlayerCore, ENGINES, ERRORS, makeWav, splitSentences } from "./core.js";
import createPlayerCore from "./engine/player-core.js";

const $ = (id) => document.getElementById(id);
const tauri = window.__TAURI__ || null;

// ---- 保存（localStorage が使えなくても動く） ----
const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  set(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* 保存できない環境では覚えないだけ */
    }
  },
};
const K_SETTINGS = "ctp.settings.v1", K_PRESETS = "ctp.presets.v1", K_USER = "ctp.userdic.v1";

// ---- スライダー ----
const SLIDERS = [
  { key: "speed", label: "話速", min: 0.5, max: 3, step: 0.05, def: 1, fmt: (v) => v.toFixed(2) + "×", all: true },
  { key: "volume", label: "音量", min: 0, max: 2, step: 0.05, def: 1, fmt: (v) => Math.round(v * 100) + "%", all: true },
  { key: "f0", label: "声の高さ", min: 60, max: 500, step: 1, fmt: (v) => Math.round(v) + "Hz" },
  { key: "range", label: "抑揚", min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: "formant", label: "声道の長さ", min: 0.7, max: 1.5, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "rd", label: "張り（Rd）", min: 0.3, max: 2.7, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: "breath", label: "息っぽさ", min: 0, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: "jitter", label: "ゆらぎ", min: 0, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
];
const V3_KEYS = ["f0", "range", "formant", "rd", "breath", "jitter"];
const ENGINE_NOTES = {
  0: "V3: 32bit 向け。クリアな声で、声の高さや声質を細かく変えられます。",
  1: "V2: 16bit 向け。14 種の声データを切り替えます（話速と音量だけ変えられます）。",
  2: "V1: 16bit 向けの小さなエンジン。10 種の声（話速と音量だけ変えられます）。",
  3: "nano: 8bit マイコン向けの極小エンジン。ローマ字記号列で動きます（話速 0.5〜2、音量）。",
};

let core = null;
let settings = null;
let audio = null; // { ctx, src }

function defaults() {
  return { engine: 0, voice: 0, speed: 1, volume: 1, rate: 16000, outRate: 0, mode: "text", v3: null };
}

function v3Values() {
  return settings.v3 || core.v3Preset(settings.voice);
}

// ---- 画面を作る ----
function buildSliders() {
  const box = $("sliders");
  box.textContent = "";
  for (const s of SLIDERS) {
    const row = document.createElement("label");
    row.className = "slider";
    row.dataset.key = s.key;
    row.innerHTML = `<span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><output></output>`;
    const input = row.querySelector("input");
    input.setAttribute("aria-label", s.label);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (s.all) settings[s.key] = v;
      else settings.v3 = { ...v3Values(), [s.key]: v };
      row.querySelector("output").textContent = s.fmt(v);
      saveSettings();
    });
    box.appendChild(row);
  }
}

function refreshSliders() {
  const v3 = settings.engine === 0;
  const vals = v3 ? v3Values() : null;
  for (const s of SLIDERS) {
    const row = document.querySelector(`.slider[data-key="${s.key}"]`);
    const input = row.querySelector("input");
    let v = s.all ? settings[s.key] : vals ? vals[s.key] : null;
    if (s.key === "speed") input.max = settings.engine === 3 ? 2 : 3;
    if (s.key === "speed" && settings.engine === 3 && v > 2) v = settings.speed = 2;
    const on = s.all || v3;
    input.disabled = !on;
    row.classList.toggle("off", !on);
    row.title = on ? "" : "V3 だけで変えられます";
    if (v !== null && v !== undefined) {
      input.value = v;
      row.querySelector("output").textContent = s.fmt(v);
    } else {
      row.querySelector("output").textContent = "―";
    }
  }
  $("rate-field").hidden = !v3;
  $("rate").value = String(settings.rate);
  $("out-rate").value = String(settings.outRate);
}

function fillEngines() {
  $("engine").innerHTML = ENGINES.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

function fillVoices() {
  const list = core.voices(settings.engine);
  if (settings.voice >= list.length) settings.voice = 0;
  $("voice").innerHTML = list.map((v) => `<option value="${v.index}">${v.label}（${v.key}）</option>`).join("");
  $("voice").value = String(settings.voice);
  $("engine").value = String(settings.engine);
  $("engine-note").textContent = ENGINE_NOTES[settings.engine];
}

function saveSettings() {
  store.set(K_SETTINGS, settings);
}

function applySettings(s) {
  settings = { ...defaults(), ...s };
  fillVoices();
  refreshSliders();
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === settings.mode;
  updateModeHint();
}

function updateModeHint() {
  const nano = settings.engine === 3;
  $("text-hint").textContent =
    settings.mode === "text"
      ? "漢字かな交じり文を入力してください。長い文章は文ごとに区切って、間を入れて読みます。"
      : nano
        ? "ローマ字記号列を入力してください（例: konnichiwa,seka'i.）。"
        : "カナ記号列を入力してください（例: こんにちわ、せか'い。）。";
}

// ---- メッセージ ----
function showMessage(text, info = false) {
  const m = $("message");
  m.hidden = !text;
  m.textContent = text || "";
  m.classList.toggle("info", info);
}

function errorText(err, koe, errpos) {
  let s = ERRORS[err] || `エラー ${err}`;
  if (koe !== undefined && errpos >= 0) {
    const chars = settings.engine === 3 ? [...new TextDecoder().decode(new TextEncoder().encode(koe).slice(0, errpos))].length : errpos;
    const arr = [...koe];
    s += `\n${arr.slice(0, chars).join("")}▶${arr[chars] || ""}◀${arr.slice(chars + 1).join("")}`;
  }
  return s;
}

// ---- 合成 ----
function koeOf(text) {
  const r = core.yomi(text, settings.engine === 3 ? 1 : 0);
  if (r.err) throw new Error(ERRORS[r.err] || `読みの変換でエラー ${r.err}`);
  return r.text;
}

// 記号列を文ごとに分ける（長すぎる記号列を避ける）
function splitKoe(koe) {
  const re = settings.engine === 3 ? /[^.!?]+[.!?]*|[.!?]+/g : /[^。．.！!？?]+[。．.！!？?]*|[。．.！!？?]+/g;
  return koe
    .split(/\n+/)
    .flatMap((line) => line.match(re) || [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i, a) => ({ koe: t, pause: i < a.length - 1 ? 0.35 : 0 }));
}

function synthParams() {
  const p = { speed: settings.speed };
  if (settings.engine === 0) Object.assign(p, v3Values(), { rate: settings.rate });
  return p;
}

// 入力全体を合成して { pcm, rate, koeText } を返す。失敗なら例外
function synthesize(input, mode) {
  let items;
  if (mode === "text") {
    if (!core.hasDic()) throw new Error("辞書を読み込んでいないため、文章を読めません。記号列で入力するか、辞書を読み込んでください。");
    items = splitSentences(input).map((s) => ({ ...s, koe: koeOf(s.text) }));
  } else {
    items = splitKoe(input);
  }
  items = items.filter((x) => x.koe && x.koe.trim());
  if (!items.length) throw new Error("読み上げる文字がありません。");
  const p = synthParams();
  const chunks = [];
  let rate = 8000;
  for (const it of items) {
    const r = core.synth(settings.engine, settings.voice, it.koe, p);
    if (r.err) {
      if (r.err === 7) continue; // 記号だけの文は飛ばす
      const e = new Error(errorText(r.err, it.koe, r.errpos));
      e.koe = items.map((x) => x.koe).join("\n");
      throw e;
    }
    rate = r.rate;
    chunks.push(r.pcm, new Int16Array(Math.round(it.pause * rate)));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const pcm = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    pcm.set(c, o);
    o += c.length;
  }
  return { pcm, rate, koeText: items.map((x) => x.koe).join("\n") };
}

function withVolume(pcm) {
  const g = settings.volume;
  if (g === 1) return pcm;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * g)));
  return out;
}

function toFloat(pcm) {
  const f = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
  return f;
}

async function resample(pcm, rate, to) {
  if (!to || to === rate) return { pcm, rate };
  const len = Math.ceil((pcm.length * to) / rate);
  const ctx = new OfflineAudioContext(1, len, to);
  const buf = ctx.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(toFloat(pcm), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  const res = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) res[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] * 32767)));
  return { pcm: res, rate: to };
}

function stop() {
  if (audio) {
    try {
      audio.src.stop();
    } catch {
      /* 止まっている */
    }
    audio = null;
  }
  $("stop").disabled = true;
}

async function play(input, mode) {
  stop();
  showMessage("");
  let r;
  try {
    r = synthesize(input, mode);
  } catch (e) {
    showMessage(e.message);
    if (e.koe) showKoe(e.koe);
    return;
  }
  if (mode === "text") showKoe(r.koeText, false);
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, r.pcm.length, r.rate);
  buf.copyToChannel(toFloat(withVolume(r.pcm)), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.onended = () => {
    if (audio && audio.src === src) stop();
    ctx.close();
  };
  audio = { ctx, src };
  $("stop").disabled = false;
  src.start();
}

async function saveWav() {
  showMessage("");
  let r;
  try {
    r = synthesize($("text").value, settings.mode);
  } catch (e) {
    showMessage(e.message);
    return;
  }
  const out = await resample(withVolume(r.pcm), r.rate, settings.outRate);
  const wav = makeWav(out.pcm, out.rate);
  const name = `colorfultalk_${ENGINES[settings.engine].key}.wav`;
  if (tauri) {
    try {
      const path = await tauri.core.invoke("save_wav", { name, data: Array.from(wav) });
      if (path) showMessage(`保存しました: ${path}`, true);
    } catch (e) {
      showMessage(`保存できませんでした: ${e}`);
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function showKoe(text, open = true) {
  $("koe").value = text;
  if (open || !$("koe-box").hidden) $("koe-box").hidden = false;
}

function convert() {
  showMessage("");
  if (settings.mode === "koe") {
    showKoe($("text").value);
    return;
  }
  if (!core.hasDic()) {
    showMessage("辞書を読み込んでいないため、記号列に変換できません。");
    return;
  }
  try {
    showKoe(splitSentences($("text").value).map((s) => koeOf(s.text)).join("\n"));
  } catch (e) {
    showMessage(e.message);
  }
}

// ---- プリセット ----
function fillPresets() {
  const presets = store.get(K_PRESETS, {});
  const sel = $("preset");
  const cur = sel.value;
  sel.innerHTML = '<option value="">（保存したプリセット）</option>' +
    Object.keys(presets).sort().map((n) => `<option>${n.replace(/[<&>"]/g, "")}</option>`).join("");
  if (presets[cur]) sel.value = cur;
}

// ---- ユーザー辞書 ----
function userWords() {
  return store.get(K_USER, []);
}

function applyUserWords() {
  if (!core.hasDic()) return;
  core.reopenDic();
  for (const w of userWords()) core.addWord(w.surface, w.reading, w.accent, w.pos);
}

function renderUserWords() {
  const list = userWords();
  const tb = $("user-list");
  tb.textContent = "";
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">登録した言葉はありません。</td></tr>';
    return;
  }
  list.forEach((w, i) => {
    const tr = document.createElement("tr");
    for (const v of [w.surface, w.reading, w.accent, w.pos]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement("td");
    const tryBtn = document.createElement("button");
    tryBtn.type = "button";
    tryBtn.textContent = "試す";
    tryBtn.addEventListener("click", () => play(w.surface + "。", "text"));
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => {
      const l = userWords();
      l.splice(i, 1);
      store.set(K_USER, l);
      applyUserWords();
      renderUserWords();
    });
    td.append(tryBtn, " ", del);
    tr.appendChild(td);
    tb.appendChild(tr);
  });
}

function addUserWord(ev) {
  ev.preventDefault();
  showMessage("");
  if (!core.hasDic()) {
    showMessage("辞書を読み込んでから登録してください。");
    return;
  }
  const w = {
    surface: $("u-surface").value.trim(),
    reading: $("u-reading").value.trim(),
    accent: parseInt($("u-accent").value, 10) || 0,
    pos: $("u-pos").value,
  };
  const r = core.addWord(w.surface, w.reading, w.accent, w.pos);
  if (r) {
    showMessage(r === 3 ? "読みはカタカナかひらがなで書いてください。" : r === 8 ? "アクセントが読みの長さを超えています。" : `登録できませんでした（エラー ${r}）。`);
    return;
  }
  const list = userWords().filter((x) => x.surface !== w.surface);
  list.push(w);
  store.set(K_USER, list);
  renderUserWords();
  $("user-form").reset();
}

// ---- 辞書 ----
async function loadDicFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = +res.headers.get("content-length") || 26297880;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    $("dic-status").textContent = `辞書を読み込み中… ${Math.min(100, Math.round((got / total) * 100))}%`;
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

function useDic(bytes) {
  const r = core.loadDic(bytes);
  if (r) throw new Error(ERRORS[r] || `エラー ${r}`);
  applyUserWords();
  $("dic-status").textContent = "辞書: 読み込み済み（約 48 万語）";
  $("dic-pick").hidden = true;
}

async function initDic() {
  try {
    useDic(await loadDicFromUrl("dic/colorful_talk.dic"));
  } catch {
    $("dic-status").textContent = "辞書なし（記号列の入力だけ使えます）";
    $("dic-pick").hidden = false;
  }
}

// ---- 起動 ----
async function main() {
  core = await PlayerCore.create(createPlayerCore);
  $("version").textContent = `ColorfulTalkPlayer ${core.version()}${tauri ? "（デスクトップ版）" : ""}`;
  fillEngines();
  buildSliders();
  applySettings(store.get(K_SETTINGS, defaults()));
  fillPresets();
  renderUserWords();

  $("engine").addEventListener("change", () => {
    settings.engine = +$("engine").value;
    settings.voice = 0;
    settings.v3 = null;
    fillVoices();
    refreshSliders();
    updateModeHint();
    saveSettings();
  });
  $("voice").addEventListener("change", () => {
    settings.voice = +$("voice").value;
    settings.v3 = null; // V3 は声のプリセット値に戻す
    refreshSliders();
    saveSettings();
  });
  $("rate").addEventListener("change", () => {
    settings.rate = +$("rate").value;
    saveSettings();
  });
  $("out-rate").addEventListener("change", () => {
    settings.outRate = +$("out-rate").value;
    saveSettings();
  });
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.addEventListener("change", () => {
      settings.mode = r.value;
      updateModeHint();
      saveSettings();
    });
  }
  $("play").addEventListener("click", () => play($("text").value, settings.mode));
  $("stop").addEventListener("click", stop);
  $("save").addEventListener("click", saveWav);
  $("convert").addEventListener("click", convert);
  $("play-koe").addEventListener("click", () => play($("koe").value, "koe"));
  $("use-koe").addEventListener("click", () => {
    $("text").value = $("koe").value;
    settings.mode = "koe";
    applySettings(settings);
    saveSettings();
  });
  $("preset-save").addEventListener("click", () => {
    const name = (prompt("プリセットの名前", $("preset").value || "") || "").trim();
    if (!name) return;
    const presets = store.get(K_PRESETS, {});
    presets[name] = { ...settings, v3: settings.engine === 0 ? v3Values() : null };
    store.set(K_PRESETS, presets);
    fillPresets();
    $("preset").value = name;
  });
  $("preset").addEventListener("change", () => {
    const p = store.get(K_PRESETS, {})[$("preset").value];
    if (p) {
      applySettings({ ...p, mode: settings.mode });
      saveSettings();
    }
  });
  $("preset-delete").addEventListener("click", () => {
    const name = $("preset").value;
    if (!name) return;
    const presets = store.get(K_PRESETS, {});
    delete presets[name];
    store.set(K_PRESETS, presets);
    fillPresets();
  });
  $("reset").addEventListener("click", () => {
    applySettings({ ...defaults(), engine: settings.engine, voice: settings.voice, mode: settings.mode });
    saveSettings();
  });
  $("user-form").addEventListener("submit", addUserWord);
  $("dic-file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      useDic(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {
      showMessage(`辞書を読み込めませんでした: ${e.message}`);
    }
  });
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      ev.preventDefault();
      play($("text").value, settings.mode);
    }
  });
  $("dic-status").textContent = "辞書を読み込み中…";
  await initDic();
}

main().catch((e) => {
  $("dic-status").textContent = "起動できませんでした";
  showMessage(`起動できませんでした: ${e.message}`);
});
