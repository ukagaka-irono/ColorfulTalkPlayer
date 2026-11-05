# ColorfulTalkPlayer

[ColorfulTalk](https://github.com/ukagaka-irono/ColorfulTalk) の音声合成エンジンを使った公式の読み上げアプリです。
文章を読み上げたり、WAV ファイルに書き出したりできます。無料（MIT ライセンス）です。

- 漢字かな交じり文をそのまま読み上げる（言語処理エンジン [ColorfulYomi](https://github.com/ukagaka-irono/ColorfulYomi) で読みとアクセントを付ける）
- 変換した記号列を見て、直してから読み上げられる
- エンジン 4 種（V3・V2・V1・nano）、声 31 種。話速・音量、V3 は声の高さ・抑揚・声質もスライダーで変えられる
- 設定のプリセット、ユーザー辞書、WAV の保存（44.1kHz / 48kHz への変換も）
- 音声は端末の中で作り、外部に送らない

| 種類 | 内容 |
|---|---|
| Web 版 | ブラウザだけで動く。全エンジンと ColorfulYomi を 1 つの WebAssembly（約 140KB）にしたもの |
| Windows / Mac 版 | Web 版と同じ画面のデスクトップアプリ（Tauri）。保存先を選んで WAV を保存、コマンドラインからの読み上げ・WAV 出力 |

**Web 版はこちら: https://ukagaka-irono.github.io/ColorfulTalkPlayer/** （インストール不要。初回は辞書 26MB を読み込みます）

詳しくは [docs/spec.md](docs/spec.md) を参照してください。

## Web 版を動かす

`web/` を HTTP で配信すれば動きます（`file://` では WebAssembly を読めません）。辞書は別に置きます。

```bash
git clone --recursive https://github.com/ukagaka-irono/ColorfulTalkPlayer.git
```

```bash
cd ColorfulTalkPlayer && bash scripts/fetch-dic.sh
```

```bash
python -m http.server 8710 -d web
```

ブラウザで http://localhost:8710 を開きます。`fetch-dic.sh` は [Colorful-dictionary のリリース](https://github.com/ukagaka-irono/Colorful-dictionary/releases/tag/v1)から辞書（26MB）を取得し、SHA-256 を確かめて `web/dic/` に置きます。

## Windows / Mac 版をビルドする

Rust、Node.js、C コンパイラ（Windows は Visual Studio の C++ ツール、Mac は Xcode のコマンドラインツール）が必要です。

```bash
npm install
```

```bash
bash scripts/fetch-dic.sh
```

```bash
npx tauri build
```

インストーラーは `src-tauri/target/release/bundle/` にできます。辞書は実行ファイルに組み込まれます。

### コマンドライン

```bash
ColorfulTalkPlayer -t "今日はいい天気です。" -o out.wav -v v3:f1 -s 1.2
```

オプションは `ColorfulTalkPlayer -h` か [docs/spec.md](docs/spec.md) を参照してください。

## WebAssembly を作り直す

エンジンを更新したときは、[Emscripten](https://emscripten.org/) で作り直します（ビルド済みのものを `web/engine/` に同梱しています）。

```bash
git submodule update --remote
```

```bash
EMSDK=/path/to/emsdk bash scripts/build-wasm.sh
```

## 試験

WebAssembly の出力を、各エンジンのリポジトリでビルドした `ctalk` と比べます。

```bash
npm test -- --dic web/dic/colorful_talk.dic --v3 path/to/v3/ctalk --v2 path/to/v2/ctalk --v1 path/to/v1/ctalk --nano path/to/nano/ctalk --cyomi path/to/cyomi
```

## ライセンス

MIT License（[LICENSE](LICENSE)）。中の辞書（Colorful-dictionary）は元データのライセンス BSD 3-Clause に従います（`web/dic/NOTICE`）。
