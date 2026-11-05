// ColorfulTalkPlayer: WebAssembly（player-core）を使いやすく包む。ブラウザと Node.js の両方で使う。
// SPDX-License-Identifier: MIT

export const ENGINES = [
  { id: 0, key: "v3", name: "ColorfulTalk V3", kana: true },
  { id: 1, key: "v2", name: "ColorfulTalk V2", kana: true },
  { id: 2, key: "v1", name: "ColorfulTalk V1", kana: true },
  { id: 3, key: "nano", name: "ColorfulTalk nano", kana: false },
];

export const ERRORS = {
  1: "引数がありません",
  2: "文字コード（UTF-8）が正しくありません",
  3: "記号列に使えない文字があります",
  4: "アクセント記号（'）の位置が正しくありません",
  5: "長音記号（ー）の位置が正しくありません",
  6: "無声化記号（_）の位置が正しくありません",
  7: "発音する文字がありません",
  8: "設定が範囲外です",
  9: "記号列が長すぎます",
  10: "メモリが足りません",
  12: "辞書を読めません",
  13: "辞書の形式が違います",
  14: "出力先が足りません",
};

export class PlayerCore {
  constructor(m) {
    this.m = m;
    this.dicPtr = 0;
    this.dicSize = 0;
  }

  static async create(factory, options = {}) {
    return new PlayerCore(await factory(options));
  }

  version() {
    return this.m.UTF8ToString(this.m._pl_version());
  }

  voices(engine) {
    const n = this.m._pl_voice_count(engine);
    const list = [];
    for (let i = 0; i < n; i++) {
      const [key, label] = this.m.UTF8ToString(this.m._pl_voice_name(engine, i)).split("\t");
      list.push({ index: i, key, label });
    }
    return list;
  }

  // V3 のプリセットの値
  v3Preset(voice) {
    const m = this.m;
    const p = m._malloc(24);
    try {
      m._pl_v3_preset(voice, p);
      const f = m.HEAPF32.subarray(p >> 2, (p >> 2) + 6);
      return { f0: f[0], range: f[1], formant: f[2], rd: f[3], breath: f[4], jitter: f[5] };
    } finally {
      m._free(p);
    }
  }

  // 記号列を合成する。成功なら { pcm: Int16Array, rate }、失敗なら { err, errpos }
  synth(engine, voice, koe, p = {}) {
    const m = this.m;
    const s = m.stringToNewUTF8(koe);
    const out = m._malloc(16);
    try {
      const v = (x, d) => (x === undefined || x === null ? d : x);
      const err = m._pl_synth(engine, voice, s, v(p.speed, 1), v(p.f0, 0), v(p.range, -1), v(p.formant, 0),
        v(p.rd, 0), v(p.breath, -1), v(p.jitter, -1), v(p.rate, 0), out, out + 4, out + 8, out + 12);
      const i32 = out >> 2;
      const ptr = m.HEAP32[i32], n = m.HEAP32[i32 + 1], rate = m.HEAP32[i32 + 2], errpos = m.HEAP32[i32 + 3];
      if (err !== 0) return { err, errpos };
      const pcm = new Int16Array(n);
      pcm.set(m.HEAP16.subarray(ptr >> 1, (ptr >> 1) + n));
      m._pl_free(ptr);
      return { err: 0, pcm, rate };
    } finally {
      m._free(s);
      m._free(out);
    }
  }

  // 辞書（colorful_talk.dic の中身）を読み込む
  loadDic(bytes) {
    const m = this.m;
    this.closeDic();
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const ptr = m._malloc(u8.length);
    if (!ptr) return 10;
    m.HEAPU8.set(u8, ptr);
    const r = m._pl_yomi_open(ptr, u8.length);
    if (r !== 0) {
      m._free(ptr);
      return r;
    }
    this.dicPtr = ptr;
    this.dicSize = u8.length;
    return 0;
  }

  // ユーザー辞書を入れ直すときは、辞書を開き直してから語を足す
  reopenDic() {
    if (!this.dicPtr) return 13;
    return this.m._pl_yomi_open(this.dicPtr, this.dicSize);
  }

  closeDic() {
    if (this.dicPtr) {
      this.m._pl_yomi_close();
      this.m._free(this.dicPtr);
      this.dicPtr = 0;
    }
  }

  hasDic() {
    return this.m._pl_yomi_loaded() !== 0;
  }

  // mode: 0 = カナ記号列、1 = ローマ字記号列、2 = 形態素
  yomi(text, mode = 0) {
    const m = this.m;
    const s = m.stringToNewUTF8(text);
    const e = m._malloc(4);
    try {
      const r = m._pl_yomi(s, mode, e);
      if (!r) return { err: m.HEAP32[e >> 2] };
      const out = m.UTF8ToString(r);
      m._pl_free(r);
      return { err: 0, text: out };
    } finally {
      m._free(s);
      m._free(e);
    }
  }

  addWord(surface, reading, accent, pos) {
    const m = this.m;
    const a = m.stringToNewUTF8(surface), b = m.stringToNewUTF8(reading), c = m.stringToNewUTF8(pos || "名詞");
    try {
      return m._pl_yomi_add_word(a, b, accent | 0, c);
    } finally {
      m._free(a);
      m._free(b);
      m._free(c);
    }
  }
}

// 16bit PCM から WAV（RIFF）のバイト列を作る
export function makeWav(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

// 長い文章を文ごとに分ける。区切りの後の間（秒）を付ける
export function splitSentences(text) {
  const out = [];
  const paras = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  paras.forEach((para, pi) => {
    const lines = para.split("\n");
    lines.forEach((line, li) => {
      const parts = line.match(/[^。！？!?．]+[。！？!?．」』）)]*|[。！？!?．]+/g) || [];
      parts.forEach((s, si) => {
        const t = s.trim();
        if (!t) return;
        const lastInLine = si === parts.length - 1;
        const lastInPara = lastInLine && li === lines.length - 1;
        out.push({ text: t, pause: lastInPara && pi < paras.length - 1 ? 0.7 : lastInLine ? 0.45 : 0.3 });
      });
    });
  });
  return out;
}
