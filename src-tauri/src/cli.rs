// コマンドラインからの読み上げ・WAV 出力（画面を出さない）  SPDX-License-Identifier: MIT
use crate::core;
use std::io::Write;

const HELP: &str = "\
ColorfulTalkPlayer — コマンドラインからの読み上げ・WAV 出力

使い方:
  ColorfulTalkPlayer -t \"今日はいい天気です。\" -o out.wav -v v3:f1 -s 1.2

  -t TEXT          読み上げる文章
  -f FILE          文章のファイル（UTF-8）
  -k               文章を記号列として扱う（ColorfulYomi を通さない）
  -o FILE          WAV の出力先（省略すると再生）
  -v ENGINE:VOICE  エンジンと声（例 v3:f1, v3:m1, v2:f3, v1:k1, nano:r）。--voices で一覧
  -s X             話速（1 = 標準）
  -p HZ            声の高さ（V3）
  -a X             抑揚（V3、1 = 標準）
  -g X             音量（1 = 標準）
  -r HZ            出力のサンプリング周波数（例 44100, 48000）
  -u CSV           ユーザー辞書（表層形,読み,アクセント,品詞）
  --voices         声の一覧
  --version        版
";

/// 引数が「-」で始まればコマンドラインとして動く
pub fn is_cli(args: &[String]) -> bool {
    args.first().is_some_and(|a| a.starts_with('-'))
}

struct Opts {
    text: Option<String>,
    koe: bool,
    out: Option<String>,
    engine: i32,
    voice: i32,
    speed: f32,
    f0: f32,
    range: f32,
    gain: f32,
    rate: i32,
    user: Vec<String>,
}

fn parse(args: &[String]) -> Result<Option<Opts>, String> {
    let mut o = Opts { text: None, koe: false, out: None, engine: 0, voice: 0, speed: 1.0, f0: 0.0, range: -1.0, gain: 1.0, rate: 0, user: vec![] };
    let mut i = 0;
    let num = |v: Option<&String>, name: &str| -> Result<f32, String> {
        v.and_then(|s| s.parse::<f32>().ok()).ok_or(format!("{name} には数を指定してください"))
    };
    while i < args.len() {
        let a = args[i].as_str();
        let v = args.get(i + 1);
        match a {
            "-h" | "--help" => {
                print!("{HELP}");
                return Ok(None);
            }
            "--version" => {
                println!("ColorfulTalkPlayer {}", core::version());
                return Ok(None);
            }
            "--voices" => {
                for (e, name) in core::ENGINES.iter().enumerate() {
                    for (k, l) in core::voices(e as i32) {
                        println!("{name}:{k}\t{l}");
                    }
                }
                return Ok(None);
            }
            "-k" => {
                o.koe = true;
                i += 1;
                continue;
            }
            "-t" => o.text = Some(v.ok_or("-t の後に文章を指定してください")?.clone()),
            "-f" => {
                let p = v.ok_or("-f の後にファイルを指定してください")?;
                let s = std::fs::read_to_string(p).map_err(|e| format!("{p} を読めません: {e}"))?;
                o.text = Some(s.trim_start_matches('\u{feff}').to_string());
            }
            "-o" => o.out = Some(v.ok_or("-o の後に出力先を指定してください")?.clone()),
            "-v" => {
                let s = v.ok_or("-v の後にエンジンと声を指定してください")?.to_lowercase();
                let (e, vk) = s.split_once(':').unwrap_or((&s, ""));
                let ei = core::ENGINES.iter().position(|x| *x == e).ok_or(format!("エンジン {e} はありません（v3 v2 v1 nano）"))?;
                o.engine = ei as i32;
                o.voice = if vk.is_empty() {
                    0
                } else {
                    core::voices(o.engine).iter().position(|(k, _)| k == vk).ok_or(format!("声 {vk} はありません（--voices で一覧）"))? as i32
                };
            }
            "-s" => o.speed = num(v, "-s")?,
            "-p" => o.f0 = num(v, "-p")?,
            "-a" => o.range = num(v, "-a")?,
            "-g" => o.gain = num(v, "-g")?,
            "-r" => o.rate = num(v, "-r")? as i32,
            "-u" => o.user.push(v.ok_or("-u の後にファイルを指定してください")?.clone()),
            _ => return Err(format!("知らないオプション {a}（-h で使い方）")),
        }
        i += 2;
    }
    Ok(Some(o))
}

/// 文章を文に分ける。(文, 後ろの間の秒)
fn split_sentences(text: &str) -> Vec<(String, f32)> {
    let mut out = vec![];
    let text = text.replace("\r\n", "\n");
    let paras: Vec<&str> = text.split("\n\n").collect();
    for (pi, para) in paras.iter().enumerate() {
        let lines: Vec<&str> = para.lines().collect();
        for (li, line) in lines.iter().enumerate() {
            let mut parts = vec![];
            let mut cur = String::new();
            let chars: Vec<char> = line.chars().collect();
            for (ci, &c) in chars.iter().enumerate() {
                cur.push(c);
                let end = matches!(c, '。' | '！' | '？' | '!' | '?' | '．');
                let next_is_end = chars.get(ci + 1).is_some_and(|n| matches!(n, '。' | '！' | '？' | '!' | '?' | '．' | '」' | '』' | '）' | ')'));
                if end && !next_is_end {
                    parts.push(std::mem::take(&mut cur));
                }
            }
            parts.push(cur);
            let parts: Vec<String> = parts.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            let n = parts.len();
            for (si, s) in parts.into_iter().enumerate() {
                let last_line = si + 1 == n;
                let last_para = last_line && li + 1 == lines.len();
                let pause = if last_para && pi + 1 < paras.len() { 0.7 } else if last_line { 0.45 } else { 0.3 };
                out.push((s, pause));
            }
        }
    }
    out
}

fn split_koe(koe: &str, roman: bool) -> Vec<(String, f32)> {
    let ends: &[char] = if roman { &['.', '!', '?'] } else { &['。', '．', '.', '！', '!', '？', '?'] };
    let mut out = vec![];
    for line in koe.lines() {
        let mut cur = String::new();
        let chars: Vec<char> = line.chars().collect();
        for (i, &c) in chars.iter().enumerate() {
            cur.push(c);
            if ends.contains(&c) && !chars.get(i + 1).is_some_and(|n| ends.contains(n)) {
                out.push((std::mem::take(&mut cur), 0.35));
            }
        }
        out.push((cur, 0.35));
    }
    out.into_iter().map(|(s, p)| (s.trim().to_string(), p)).filter(|(s, _)| !s.is_empty()).collect()
}

fn resample(pcm: &[i16], from: i32, to: i32) -> Vec<i16> {
    if to <= 0 || to == from || pcm.is_empty() {
        return pcm.to_vec();
    }
    let n = (pcm.len() as f64 * to as f64 / from as f64).ceil() as usize;
    (0..n)
        .map(|i| {
            let x = i as f64 * from as f64 / to as f64;
            let k = x.floor() as usize;
            let f = x - k as f64;
            let a = pcm[k.min(pcm.len() - 1)] as f64;
            let b = pcm[(k + 1).min(pcm.len() - 1)] as f64;
            (a + (b - a) * f).round() as i16
        })
        .collect()
}

pub fn wav_bytes(pcm: &[i16], rate: i32) -> Vec<u8> {
    let mut b = Vec::with_capacity(44 + pcm.len() * 2);
    let data = (pcm.len() * 2) as u32;
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&(rate as u32).to_le_bytes());
    b.extend_from_slice(&(rate as u32 * 2).to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data.to_le_bytes());
    for s in pcm {
        b.extend_from_slice(&s.to_le_bytes());
    }
    b
}

fn load_user_dic(path: &str) -> Result<(), String> {
    let s = std::fs::read_to_string(path).map_err(|e| format!("{path} を読めません: {e}"))?;
    for (n, line) in s.trim_start_matches('\u{feff}').lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || (n == 0 && line.starts_with("表層形")) {
            continue;
        }
        let c: Vec<&str> = line.split(',').map(|x| x.trim()).collect();
        if c.len() < 3 {
            return Err(format!("{path} の {} 行目: 列が足りません", n + 1));
        }
        let acc = c[2].parse::<i32>().map_err(|_| format!("{path} の {} 行目: アクセントが数ではありません", n + 1))?;
        let r = core::add_word(c[0], c[1], acc, c.get(3).copied().filter(|x| !x.is_empty()).unwrap_or("名詞"));
        if r != 0 {
            return Err(format!("{path} の {} 行目: {}", n + 1, core::error_text(r)));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn play(path: &std::path::Path) {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "winmm")]
    extern "system" {
        fn PlaySoundW(sound: *const u16, module: *mut std::ffi::c_void, flags: u32) -> i32;
    }
    let w: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    unsafe { PlaySoundW(w.as_ptr(), std::ptr::null_mut(), 0x0002_0000 /* SND_FILENAME */) };
}

#[cfg(not(windows))]
fn play(path: &std::path::Path) {
    let cmd = if cfg!(target_os = "macos") { "afplay" } else { "aplay" };
    let _ = std::process::Command::new(cmd).arg(path).status();
}

/// コマンドラインとして実行し、終了コードを返す
pub fn run(args: &[String], dic: Option<&'static [u8]>) -> i32 {
    match run_inner(args, dic) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("ColorfulTalkPlayer: {e}");
            1
        }
    }
}

fn run_inner(args: &[String], dic: Option<&'static [u8]>) -> Result<(), String> {
    let Some(o) = parse(args)? else { return Ok(()) };
    let text = o.text.clone().ok_or("-t か -f で文章を指定してください（-h で使い方）")?;
    let roman = o.engine == 3;
    let items: Vec<(String, f32)> = if o.koe {
        split_koe(&text, roman)
    } else {
        let d = dic.ok_or("辞書が組み込まれていません")?;
        let r = core::open_dic(d);
        if r != 0 {
            return Err(format!("辞書: {}", core::error_text(r)));
        }
        for u in &o.user {
            load_user_dic(u)?;
        }
        let mut v = vec![];
        for (s, p) in split_sentences(&text) {
            let k = core::yomi(&s, if roman { 1 } else { 0 }).map_err(|e| format!("「{s}」を変換できません: {}", core::error_text(e)))?;
            v.push((k, p));
        }
        v
    };
    let params = core::Params { speed: o.speed, f0: o.f0, range: o.range, rate: if o.engine == 0 { o.rate } else { 0 } };
    let mut pcm: Vec<i16> = vec![];
    let mut rate = 8000;
    for (k, pause) in &items {
        if k.trim().is_empty() {
            continue;
        }
        match core::synth(o.engine, o.voice, k, params) {
            Ok(a) => {
                rate = a.rate;
                pcm.extend_from_slice(&a.pcm);
                pcm.extend(std::iter::repeat_n(0i16, (pause * a.rate as f32) as usize));
            }
            Err((7, _)) => continue,
            Err((e, pos)) => {
                let chars: Vec<char> = k.chars().collect();
                let at = if roman { k.get(..pos.max(0) as usize).map(|s| s.chars().count()).unwrap_or(0) } else { pos.max(0) as usize };
                let mark: String = chars.iter().take(at).collect::<String>() + "▶" + &chars.iter().skip(at).collect::<String>();
                return Err(format!("{}: {mark}", core::error_text(e)));
            }
        }
    }
    if pcm.is_empty() {
        return Err("読み上げる文字がありません".into());
    }
    if o.gain != 1.0 {
        for s in pcm.iter_mut() {
            *s = (*s as f32 * o.gain).round().clamp(-32768.0, 32767.0) as i16;
        }
    }
    let pcm = resample(&pcm, rate, o.rate);
    let rate = if o.rate > 0 { o.rate } else { rate };
    let wav = wav_bytes(&pcm, rate);
    match &o.out {
        Some(p) => {
            std::fs::write(p, &wav).map_err(|e| format!("{p} に書けません: {e}"))?;
            println!("{p} に書き出しました（{:.1} 秒、{rate}Hz）", pcm.len() as f32 / rate as f32);
        }
        None => {
            let tmp = std::env::temp_dir().join(format!("colorfultalkplayer_{}.wav", std::process::id()));
            std::fs::write(&tmp, &wav).map_err(|e| e.to_string())?;
            play(&tmp);
            let _ = std::fs::remove_file(&tmp);
        }
    }
    let _ = std::io::stdout().flush();
    Ok(())
}
