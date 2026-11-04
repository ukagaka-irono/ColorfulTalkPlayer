# ColorfulTalkPlayer 仕様書

> 状態: 案（設計中）。シリーズ全体の仕様書: [ColorfulTalk](https://github.com/ukagaka-irono/ColorfulTalk)（`docs/spec/player.md` と同じ内容）

ColorfulTalk の音声合成エンジンを使った公式アプリです。テキストを読み上げたり、WAV ファイルに書き出したりできます。

## 種類

| 種類 | 作り方 | 特長 |
|---|---|---|
| ColorfulTalkPlayer Web | エンジンと ColorfulYomi を WebAssembly にして、ブラウザだけで動かす | インストール不要。音声はブラウザの中で作り、外部に送らない |
| Windows / Mac 版 | Web 版と同じ画面を Tauri で包む | コマンドラインからの利用、ユーザー辞書、出力形式の設定 |

## 機能

| 機能 | Web | Windows / Mac |
|---|---|---|
| 漢字かな交じり文の読み上げ（ColorfulYomi） | ✓ | ✓ |
| 記号列を直接入力して読み上げ | ✓ | ✓ |
| 変換した記号列の表示・修正 | ✓ | ✓ |
| エンジンと声の選択（V3 のプリセット、V2 の 14 種、V1 の 10 種） | ✓ | ✓ |
| パラメータのスライダー（話速・声の高さ・抑揚・音量、V3 は声質も） | ✓ | ✓ |
| 設定のプリセット保存と切り替え | ✓（ブラウザに保存） | ✓ |
| WAV に書き出し | ✓（ダウンロード） | ✓ |
| ユーザー辞書（読みの登録と試し再生） | ― | ✓ |
| 出力のサンプリング周波数を 44.1kHz / 48kHz に固定 | ― | ✓ |
| 長い文章に自動で間を入れる | ✓ | ✓ |
| コマンドラインから読み上げ・WAV 出力（画面を出さない） | ― | ✓ |

## コマンドライン（Windows / Mac 版、案）

```bash
ColorfulTalkPlayer -t "今日はいい天気です。" -o out.wav -v v3:f1 -s 1.2
```

| オプション | 意味 |
|---|---|
| `-t TEXT` / `-f FILE` | 読み上げる文章（`-f` は UTF-8 のテキストファイル） |
| `-k` | 文章を記号列として扱う（ColorfulYomi を通さない） |
| `-o FILE` | WAV の出力先。省略時は再生 |
| `-v ENGINE:VOICE` | エンジンと声（例 `v3:m1`, `v2:f3`, `v1:f1`） |
| `-s` `-p` `-a` `-g` | 話速・声の高さ・抑揚・音量 |
| `-r HZ` | 出力のサンプリング周波数 |

## 開発の順

1. Web 版: V3 と ColorfulYomi を WebAssembly 化し、読み上げと WAV 書き出し
2. Windows / Mac 版: Tauri で包み、コマンドラインとユーザー辞書を追加
3. V1・V2 ができたら声の選択に加える
