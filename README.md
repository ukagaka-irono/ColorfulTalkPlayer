# ColorfulTalkPlayer

[ColorfulTalk](https://github.com/ukagaka-irono/ColorfulTalk) の音声合成エンジンを使った公式アプリです。
文章を読み上げたり、WAV ファイルに書き出したりできます。無料（MIT ライセンス）です。

> **状態: 設計中。** 仕様は [docs/spec.md](docs/spec.md) で検討しています。

## 種類（予定）

| 種類 | 内容 |
|---|---|
| ColorfulTalkPlayer Web | インストール不要。ブラウザを開くだけで使える。音声はブラウザの中で作り、外部に送らない |
| Windows / Mac 版 | Web 版と同じ画面のデスクトップアプリ。コマンドラインからの読み上げ・WAV 出力、ユーザー辞書 |

## できること（予定）

- 漢字かな交じり文の読み上げ（言語処理エンジン ColorfulYomi で読みとアクセントを付ける）
- 記号列を直接入力しての読み上げ、変換した記号列の確認と修正
- エンジン（V3 / V2 / V1）と声の選択、話速・声の高さ・抑揚・音量・声質のスライダー
- 設定をプリセットとして保存
- WAV に書き出し

## 文書

| 文書 | 内容 |
|---|---|
| [docs/spec.md](docs/spec.md) | 仕様書（案） |

## ライセンス

MIT License。詳細は [LICENSE](LICENSE)。
