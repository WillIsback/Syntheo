"""Chaîne d'approvisionnement d'ONNX Runtime du module (issue 683).

ort-sys télécharge pendant la construction une bibliothèque ONNX Runtime
précompilée et vérifie son SHA-256 contre `build/download/dist.tsv`, fichier de
la crate elle-même, dont l'empreinte est figée par Cargo.lock. Ce script ajoute
deux contrôles, avec notre propre épinglage (ort.tsv) :

  before <cible>  la crate ort-sys de Cargo.lock, une fois récupérée par
                  `cargo fetch --locked`, épingle exactement l'archive et
                  l'empreinte attendues pour la cible ;
  after <cible>   le cache d'ort-sys (ORT_CACHE_DIR, vide au départ) ne contient
                  que l'archive épinglée : aucune autre n'a été utilisée.

Usage : python3 -I check_ort.py before|after <cible>
"""

import csv
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEECH = HERE.parent


def pinned(target: str) -> dict:
    with (HERE / "ort.tsv").open(encoding="utf-8") as handle:
        rows = [
            r for r in csv.DictReader(handle, delimiter="\t") if r["target"] == target
        ]
    if len(rows) != 1:
        sys.exit(f"aucun épinglage ONNX Runtime pour {target}")
    return rows[0]


def ort_sys_version() -> str:
    lock = (SPEECH / "Cargo.lock").read_text(encoding="utf-8")
    blocks = [b for b in lock.split("[[package]]") if 'name = "ort-sys"' in b]
    if len(blocks) != 1:
        sys.exit("ort-sys absent ou en plusieurs versions dans Cargo.lock")
    for line in blocks[0].splitlines():
        if line.startswith("version = "):
            return line.split('"')[1]
    sys.exit("version d'ort-sys introuvable")


def before(target: str) -> None:
    pin = pinned(target)
    cargo_home = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo"))
    version = ort_sys_version()
    candidates = list(
        (cargo_home / "registry" / "src").glob(
            f"*/ort-sys-{version}/build/download/dist.tsv"
        )
    )
    if len(candidates) != 1:
        sys.exit(
            f"dist.tsv d'ort-sys {version} introuvable (cargo fetch --locked d'abord)"
        )
    with candidates[0].open(encoding="utf-8") as handle:
        rows = [
            r
            for r in csv.DictReader(handle, delimiter="\t")
            if r["target"] == target and r["feature_set"] == pin["feature_set"]
        ]
    if (
        len(rows) != 1
        or rows[0]["url"] != pin["url"]
        or rows[0]["sha256_hash"] != pin["sha256"]
    ):
        sys.exit(f"ort-sys {version} n'épingle pas l'archive attendue pour {target}")
    print(f"ort-sys {version} : {pin['url']} {pin['sha256']}")


def after(target: str) -> None:
    pin = pinned(target)
    cache = os.environ.get("ORT_CACHE_DIR")
    if not cache:
        sys.exit("ORT_CACHE_DIR non défini")
    extracted = Path(cache) / "dfbin" / target
    found = sorted(p.name for p in extracted.iterdir()) if extracted.is_dir() else []
    if found != [pin["sha256"]]:
        sys.exit(
            f"archives ONNX Runtime utilisées : {found}, attendue : {pin['sha256']}"
        )
    print(f"ONNX Runtime utilisé : {pin['sha256']}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("before", "after"):
        sys.exit(__doc__)
    {"before": before, "after": after}[sys.argv[1]](sys.argv[2])
