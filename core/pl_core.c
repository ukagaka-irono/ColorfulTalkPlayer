/* ColorfulTalkPlayer の共通部分  SPDX-License-Identifier: MIT */
#include <stdlib.h>
#include <string.h>
#include "pl_core.h"
#include "colorful_talk_v1.h"
#include "colorful_talk_v2.h"
#include "colorful_talk_v3.h"
#include "colorful_yomi.h"

/* nano のヘッダはエラーコードを自前で定義するので、ほかのヘッダと一緒に読まず関数だけ宣言する */
int8_t  ctn_start(const char* koe, uint8_t voice, uint8_t speed);
int16_t ctn_sample(void);
uint8_t ctn_busy(void);
int16_t ctn_error_pos(void);

#define PL_VERSION "1.0.0"

/* V1 の声の切り替え（CT1_VOICE_ALL=1 でビルドしたときにある） */
void ct1_test_select_voice(int id);

/* V2 に同梱の声データ（ct2_builtin_voices.c） */
#define V2(n) extern const unsigned char CT2_VOICE_##n[];
V2(f1) V2(f2) V2(f3) V2(f4) V2(f5) V2(m1) V2(m2) V2(m3) V2(m4) V2(c1) V2(c2) V2(e1) V2(w1) V2(r1)
#undef V2

static const unsigned char* const V2_DATA[14] = {
    CT2_VOICE_f1, CT2_VOICE_f2, CT2_VOICE_f3, CT2_VOICE_f4, CT2_VOICE_f5, CT2_VOICE_m1, CT2_VOICE_m2,
    CT2_VOICE_m3, CT2_VOICE_m4, CT2_VOICE_c1, CT2_VOICE_c2, CT2_VOICE_e1, CT2_VOICE_w1, CT2_VOICE_r1,
};

static const char* const V3_NAMES[] = { "f1\t女声", "m1\t男声", "child\t子ども" };
static const char* const V2_NAMES[] = {
    "f1\t女声（標準）", "f2\t高めの女声", "f3\t落ち着いた女声", "f4\t明るい女声", "f5\tかすれた女声",
    "m1\t男声", "m2\t低い男声", "m3\t若い男声", "m4\t張りのある男声", "c1\t子ども", "c2\t幼い子ども",
    "e1\t年配の声", "w1\tささやき声", "r1\tロボット",
};
static const char* const V1_NAMES[] = {
    "f1\t女声（標準）", "f2\t高めの女声", "f3\t落ち着いた女声", "m1\t男声", "m2\t低い男声",
    "c1\t子ども", "e1\t年配の声", "w1\tささやき声", "r1\tロボット", "k1\tキャラクター声",
};
static const char* const NANO_NAMES[] = { "f\t女声", "m\t男声", "c\t子ども", "r\tロボット" };

const char* pl_version(void) { return PL_VERSION; }

int pl_voice_count(int engine)
{
    switch (engine) {
    case PL_ENGINE_V3: return 3;
    case PL_ENGINE_V2: return 14;
    case PL_ENGINE_V1: return 10;
    case PL_ENGINE_NANO: return 4;
    default: return 0;
    }
}

const char* pl_voice_name(int engine, int voice)
{
    if (voice < 0 || voice >= pl_voice_count(engine)) return "";
    switch (engine) {
    case PL_ENGINE_V3: return V3_NAMES[voice];
    case PL_ENGINE_V2: return V2_NAMES[voice];
    case PL_ENGINE_V1: return V1_NAMES[voice];
    default: return NANO_NAMES[voice];
    }
}

void pl_free(void* p) { free(p); }

int pl_v3_preset(int voice, float* out)
{
    CT3Params p;
    int r = ct3_preset(voice, &p);
    if (r != CT_OK) return r;
    out[0] = p.f0; out[1] = p.pitch_range; out[2] = p.formant; out[3] = p.rd; out[4] = p.breath; out[5] = p.jitter;
    return CT_OK;
}

/* 読み出した PCM を伸びる配列にためる */
typedef struct { int16_t* p; int n, cap; } Pcm;

static int pcm_grow(Pcm* b, int add)
{
    if (b->n + add > b->cap) {
        int cap = b->cap ? b->cap * 2 : 16384;
        int16_t* q;
        while (cap < b->n + add) cap *= 2;
        q = (int16_t*)realloc(b->p, (size_t)cap * sizeof *q);
        if (!q) return 0;
        b->p = q; b->cap = cap;
    }
    return 1;
}

static int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

int pl_synth(int engine, int voice, const char* koe, float speed, float f0, float range, float formant,
             float rd, float breath, float jitter, int rate,
             int16_t** pcm, int* n, int* out_rate, int* errpos)
{
    Pcm b = { 0 };
    void* work = NULL;
    int r = CT_OK, k;
    *pcm = NULL; *n = 0; *out_rate = 8000; *errpos = -1;
    if (!koe) return CT_ERR_NULL;
    if (voice < 0 || voice >= pl_voice_count(engine)) return CT_ERR_PARAM;
    if (speed <= 0) speed = 1.0f;

    switch (engine) {
    case PL_ENGINE_V3: {
        CT3Params p;
        ct3_preset(voice, &p);
        p.speed = speed;
        if (f0 > 0) p.f0 = f0;
        if (range >= 0) p.pitch_range = range;
        if (formant > 0) p.formant = formant;
        if (rd > 0) p.rd = rd;
        if (breath >= 0) p.breath = breath;
        if (jitter >= 0) p.jitter = jitter;
        p.sample_rate = rate;
        work = malloc(ct3_work_size());
        if (!work) return CT_ERR_MEMORY;
        r = ct3_start(work, koe, &p);
        if (r != CT_OK) { *errpos = ct3_error_pos(work); break; }
        *out_rate = ct3_sample_rate(work);
        while (pcm_grow(&b, 1024) && (k = ct3_read(work, b.p + b.n, 1024)) > 0) b.n += k;
        break;
    }
    case PL_ENGINE_V2: {
        work = malloc(ct2_work_size());
        if (!work) return CT_ERR_MEMORY;
        r = ct2_start(work, koe, V2_DATA[voice], clampi((int)(speed * 100.0f + 0.5f), 50, 300));
        if (r != CT_OK) { *errpos = ct2_error_pos(work); break; }
        while (pcm_grow(&b, 1024) && (k = ct2_read(work, b.p + b.n, 1024)) > 0) b.n += k;
        break;
    }
    case PL_ENGINE_V1: {
        work = malloc(ct1_work_size());
        if (!work) return CT_ERR_MEMORY;
        ct1_test_select_voice(voice);
        r = ct1_start(work, koe, clampi((int)(speed * 100.0f + 0.5f), 50, 300));
        if (r != CT_OK) { *errpos = ct1_error_pos(work); break; }
        while (pcm_grow(&b, 1024) && (k = ct1_read(work, b.p + b.n, 1024)) > 0) b.n += k;
        break;
    }
    case PL_ENGINE_NANO: {
        /* nano は記号列を話し終わるまで参照するので写しを持つ */
        size_t len = strlen(koe);
        char* copy = (char*)malloc(len + 1);
        if (!copy) return CT_ERR_MEMORY;
        memcpy(copy, koe, len + 1);
        r = ctn_start(copy, (uint8_t)voice, (uint8_t)clampi((int)(speed * 100.0f + 0.5f), 50, 200));
        if (r != CT_OK) { *errpos = ctn_error_pos(); free(copy); break; }
        while (ctn_busy() && pcm_grow(&b, 1)) {
            int16_t s = ctn_sample();
            if (!ctn_busy()) break;      /* 話し終わりの 1 サンプルは捨てる（nano の ctalk と同じ） */
            b.p[b.n++] = s;
        }
        free(copy);
        break;
    }
    default:
        return CT_ERR_PARAM;
    }
    free(work);
    if (r != CT_OK) { free(b.p); return r; }
    *pcm = b.p; *n = b.n;
    return CT_OK;
}

/* ---- ColorfulYomi ---- */
static CyDic* g_dic;

int pl_yomi_open(const void* dic, int size)
{
    pl_yomi_close();
    return cy_open_memory(dic, (size_t)size, &g_dic);
}

void pl_yomi_close(void)
{
    cy_close(g_dic);
    g_dic = NULL;
}

int pl_yomi_loaded(void) { return g_dic != NULL; }

char* pl_yomi(const char* text, int mode, int* err)
{
    size_t need = 0;
    char* out;
    int r;
    *err = CT_OK;
    if (!g_dic) { *err = CT_ERR_DIC; return NULL; }
#define CALL(o, s, nd) (mode == 1 ? cy_text_to_roman(g_dic, text, o, s, nd) : \
                        mode == 2 ? cy_text_to_morphs(g_dic, text, o, s, nd) : cy_text_to_koe(g_dic, text, o, s, nd))
    r = CALL(NULL, 0, &need);
    if (r != CT_ERR_BUFFER) { *err = r; return NULL; }
    out = (char*)malloc(need);
    if (!out) { *err = CT_ERR_MEMORY; return NULL; }
    r = CALL(out, need, NULL);
#undef CALL
    if (r != CT_OK) { free(out); *err = r; return NULL; }
    return out;
}

int pl_yomi_add_word(const char* surface, const char* reading, int accent, const char* pos)
{
    if (!g_dic) return CT_ERR_DIC;
    return cy_add_user_word(g_dic, surface, reading, accent, pos);
}
