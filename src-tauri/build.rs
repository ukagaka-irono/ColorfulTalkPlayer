// 全エンジンと ColorfulYomi の C ソースを静的に組み込む（Web 版の WebAssembly と同じ組み合わせ）
// SPDX-License-Identifier: MIT
use std::path::{Path, PathBuf};

fn c_files(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("{}: {e}（git submodule update --init を実行してください）", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "c"))
        .collect();
    v.sort();
    v
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let e = root.join("engines");
    let v1 = e.join("ColorfulTalk-V1");
    let v2 = e.join("ColorfulTalk-V2");
    let v3 = e.join("ColorfulTalk-V3");
    let nano = e.join("ColorfulTalk-nano");
    let yomi = e.join("ColorfulYomi");

    let mut files = vec![
        root.join("core/pl_core.c"),
        v1.join("common/src/ct_koe.c"),
        v1.join("common/src/ct_wav.c"),
        v1.join("src/ct1_api.c"),
        v1.join("src/ct1_voices.c"),
        v2.join("src/ct2_api.c"),
        v2.join("src/ct2_voice.c"),
        v2.join("src/ct2_builtin_voices.c"),
        nano.join("src/ctn.c"),
        nano.join("src/ctn_tables.c"),
    ];
    files.extend(c_files(&v1.join("fx/src")));
    files.extend(c_files(&v3.join("src")));
    files.extend(c_files(&yomi.join("src")));

    let mut b = cc::Build::new();
    b.files(&files)
        .include(root.join("core"))
        .include(v1.join("include"))
        .include(v1.join("common/include"))
        .include(v1.join("fx/include"))
        .include(v1.join("src"))
        .include(v2.join("include"))
        .include(v2.join("src"))
        .include(v3.join("include"))
        .include(v3.join("src"))
        .include(nano.join("include"))
        .include(yomi.join("include"))
        .include(yomi.join("src"))
        .define("CT1_VOICE_ALL", "1")
        .define("CT1_VOICE_ID", "0")
        .define("_CRT_SECURE_NO_WARNINGS", None)
        .warnings(false)
        .opt_level(2);
    if b.get_compiler().is_like_msvc() {
        b.flag("/utf-8");
    } else {
        b.flag("-std=c99");
    }
    b.compile("player_core");
    for f in &files {
        println!("cargo:rerun-if-changed={}", f.display());
    }
    println!("cargo:rerun-if-changed={}", root.join("core/pl_core.h").display());

    tauri_build::build();
}
