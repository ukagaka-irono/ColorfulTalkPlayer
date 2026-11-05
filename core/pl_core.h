/*
 * ColorfulTalkPlayer の共通部分: 全エンジン（V1 / V2 / V3 / nano）と ColorfulYomi を 1 つにまとめた窓口。
 * Web 版（WebAssembly）とデスクトップ版（Rust から呼ぶ）の両方で使う。
 * SPDX-License-Identifier: MIT
 */
#ifndef PL_CORE_H
#define PL_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum { PL_ENGINE_V3 = 0, PL_ENGINE_V2 = 1, PL_ENGINE_V1 = 2, PL_ENGINE_NANO = 3 };

/* 声の数と名前（"f1\t女声（標準）" の形） */
int         pl_voice_count(int engine);
const char* pl_voice_name(int engine, int voice);

/*
 * 合成して PCM を返す。
 *   speed:   話速（1 = 標準）。V3 は 0.5〜3、V1/V2 は 0.5〜3、nano は 0.5〜2
 *   f0, range, formant, rd, breath, jitter: V3 だけ。0 以下ならプリセットの値
 *   rate:    V3 のサンプリング周波数（0 = 16000）。ほかのエンジンは 8000 固定
 * 成功なら CT_OK。*pcm は pl_free で解放する。失敗なら *errpos に原因の位置（文字単位、nano はバイト単位）
 */
int pl_synth(int engine, int voice, const char* koe, float speed, float f0, float range, float formant,
             float rd, float breath, float jitter, int rate,
             int16_t** pcm, int* n, int* out_rate, int* errpos);
void pl_free(void* p);

/* V3 のプリセットの値: out[0..5] = f0, range, formant, rd, breath, jitter */
int pl_v3_preset(int voice, float* out);

/* ColorfulYomi。辞書データは pl_yomi_close まで有効にしておくこと */
int   pl_yomi_open(const void* dic, int size);
void  pl_yomi_close(void);
int   pl_yomi_loaded(void);
/* mode: 0 = カナ記号列、1 = ローマ字記号列、2 = 形態素。戻り値は pl_free で解放（失敗なら NULL） */
char* pl_yomi(const char* text, int mode, int* err);
int   pl_yomi_add_word(const char* surface, const char* reading, int accent, const char* pos);

const char* pl_version(void);

#ifdef __cplusplus
}
#endif

#endif
