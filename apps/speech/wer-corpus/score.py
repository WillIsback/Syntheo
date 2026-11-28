"""WER du corpus français (apps/speech/wer-corpus, issues 680 et 788), avec
intervalles par bootstrap.

Usage : python3 score.py <refs.tsv> <variante>=<dossier d'hypothèses> [...]
  [--base <variante>] [--only <fichier d'identifiants>]
Chaque dossier contient <identifiant>.txt. Normalisation (wer-680) : NFC,
minuscules, apostrophes typographiques → ', apostrophe interne gardée, autre
ponctuation → espace, espaces normalisées ; nombres non normalisés.
Bootstrap : random.Random(12345), 1 000 tirages d'énoncés avec remise ;
écart apparié avec --base (défaut : la première variante).
Sortie : une ligne par variante et par corpus (fleurs, mls, total), puis les
écarts appariés.
"""

import random
import re
import sys
import unicodedata
from pathlib import Path


def normalize(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text).lower()
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    text = re.sub(r"[^\w\s']", " ", text)
    text = re.sub(r"(?<!\w)'|'(?!\w)", " ", text)
    return text.split()


def edits(ref: list[str], hyp: list[str]) -> int:
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        current = [i]
        for j, h in enumerate(hyp, 1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (r != h))
            )
        previous = current
    return previous[-1]


def main() -> None:
    args = sys.argv[1:]
    base = None
    only = None
    if "--base" in args:
        i = args.index("--base")
        base = args[i + 1]
        del args[i : i + 2]
    if "--only" in args:
        i = args.index("--only")
        only = set(Path(args[i + 1]).read_text().split())
        del args[i : i + 2]
    refs = {}
    for line in Path(args[0]).read_text(encoding="utf-8").splitlines():
        ident, corpus, ref = line.split("\t", 2)
        if only is None or ident in only:
            refs[ident] = (corpus, normalize(ref))
    variants = {}
    for spec in args[1:]:
        name, folder = spec.split("=", 1)
        per = {}
        for ident, (corpus, ref) in refs.items():
            path = Path(folder) / f"{ident}.txt"
            hyp = normalize(path.read_text(encoding="utf-8")) if path.exists() else []
            per[ident] = (corpus, edits(ref, hyp), len(ref), len(hyp))
        variants[name] = per
    base = base or next(iter(variants))
    idents = sorted(refs)
    rng = random.Random(12345)
    draws = [[rng.choice(idents) for _ in idents] for _ in range(1000)]

    def wer(per, ids):
        e = sum(per[i][1] for i in ids)
        n = sum(per[i][2] for i in ids)
        return 100 * e / n if n else 0.0

    def interval(values):
        values = sorted(values)
        return values[24], values[974]

    for corpus in ("fleurs", "mls", "total"):
        ids = [i for i in idents if corpus == "total" or refs[i][0] == corpus]
        if not ids:
            continue
        sub = [
            [i for i in d if corpus == "total" or refs[i][0] == corpus] for d in draws
        ]
        for name, per in variants.items():
            point = wer(per, ids)
            low, high = interval([wer(per, d) for d in sub])
            empty = sum(1 for i in ids if per[i][3] == 0)
            print(
                f"{name}\t{corpus}\t{len(ids)} énoncés\tWER {point:.2f} % [{low:.2f} ; {high:.2f}]\tsorties vides {empty}"
            )
        for name, per in variants.items():
            if name == base:
                continue
            diff = wer(per, ids) - wer(variants[base], ids)
            low, high = interval([wer(per, d) - wer(variants[base], d) for d in sub])
            print(
                f"écart {name} − {base}\t{corpus}\t{diff:+.2f} [{low:+.2f} ; {high:+.2f}]"
            )


if __name__ == "__main__":
    main()
