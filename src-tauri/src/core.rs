// C の共通部分（core/pl_core.h）を Rust から呼ぶ  SPDX-License-Identifier: MIT
use std::ffi::{c_char, c_int, c_void, CStr, CString};

extern "C" {
    fn pl_voice_count(engine: c_int) -> c_int;
    fn pl_voice_name(engine: c_int, voice: c_int) -> *const c_char;
    #[allow(clippy::too_many_arguments)]
    fn pl_synth(
        engine: c_int, voice: c_int, koe: *const c_char, speed: f32, f0: f32, range: f32, formant: f32,
        rd: f32, breath: f32, jitter: f32, rate: c_int, pcm: *mut *mut i16, n: *mut c_int,
        out_rate: *mut c_int, errpos: *mut c_int,
    ) -> c_int;
    fn pl_free(p: *mut c_void);
    fn pl_yomi_open(dic: *const c_void, size: c_int) -> c_int;
    fn pl_yomi(text: *const c_char, mode: c_int, err: *mut c_int) -> *mut c_char;
    fn pl_yomi_add_word(surface: *const c_char, reading: *const c_char, accent: c_int, pos: *const c_char) -> c_int;
    pub fn pl_version() -> *const c_char;
}

pub const ENGINES: [&str; 4] = ["v3", "v2", "v1", "nano"];

pub fn version() -> String {
    unsafe { CStr::from_ptr(pl_version()).to_string_lossy().into_owned() }
}

/// 声の一覧（キー, 説明）
pub fn voices(engine: i32) -> Vec<(String, String)> {
    unsafe {
        (0..pl_voice_count(engine))
            .map(|i| {
                let s = CStr::from_ptr(pl_voice_name(engine, i)).to_string_lossy().into_owned();
                let (k, l) = s.split_once('\t').unwrap_or((&s, ""));
                (k.to_string(), l.to_string())
            })
            .collect()
    }
}

#[derive(Clone, Copy)]
pub struct Params {
    pub speed: f32,
    pub f0: f32,
    pub range: f32,
    pub rate: i32,
}

pub struct Audio {
    pub pcm: Vec<i16>,
    pub rate: i32,
}

/// 記号列を合成する。失敗なら (エラーコード, 位置)
pub fn synth(engine: i32, voice: i32, koe: &str, p: Params) -> Result<Audio, (i32, i32)> {
    let c = CString::new(koe).map_err(|_| (3, 0))?;
    let (mut pcm, mut n, mut rate, mut errpos) = (std::ptr::null_mut(), 0, 0, -1);
    let r = unsafe {
        pl_synth(engine, voice, c.as_ptr(), p.speed, p.f0, p.range, 0.0, 0.0, -1.0, -1.0, p.rate,
                 &mut pcm, &mut n, &mut rate, &mut errpos)
    };
    if r != 0 {
        return Err((r, errpos));
    }
    let v = unsafe { std::slice::from_raw_parts(pcm, n as usize).to_vec() };
    unsafe { pl_free(pcm as *mut c_void) };
    Ok(Audio { pcm: v, rate })
}

/// 辞書を開く。データはプログラムの終わりまで保持する
pub fn open_dic(data: &'static [u8]) -> i32 {
    unsafe { pl_yomi_open(data.as_ptr() as *const c_void, data.len() as c_int) }
}

/// 0 = カナ記号列、1 = ローマ字記号列
pub fn yomi(text: &str, mode: i32) -> Result<String, i32> {
    let c = CString::new(text).map_err(|_| 2)?;
    let mut err = 0;
    let p = unsafe { pl_yomi(c.as_ptr(), mode, &mut err) };
    if p.is_null() {
        return Err(err);
    }
    let s = unsafe { CStr::from_ptr(p).to_string_lossy().into_owned() };
    unsafe { pl_free(p as *mut c_void) };
    Ok(s)
}

pub fn add_word(surface: &str, reading: &str, accent: i32, pos: &str) -> i32 {
    let (a, b, c) = match (CString::new(surface), CString::new(reading), CString::new(pos)) {
        (Ok(a), Ok(b), Ok(c)) => (a, b, c),
        _ => return 8,
    };
    unsafe { pl_yomi_add_word(a.as_ptr(), b.as_ptr(), accent, c.as_ptr()) }
}

pub fn error_text(code: i32) -> &'static str {
    match code {
        2 => "文字コード（UTF-8）が正しくありません",
        3 => "記号列に使えない文字があります",
        4 => "アクセント記号の位置が正しくありません",
        5 => "長音記号の位置が正しくありません",
        6 => "無声化記号の位置が正しくありません",
        7 => "発音する文字がありません",
        8 => "設定が範囲外です",
        9 => "記号列が長すぎます",
        10 => "メモリが足りません",
        12 => "辞書を読めません",
        13 => "辞書の形式が違います",
        _ => "エラー",
    }
}
