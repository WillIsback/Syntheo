# /// script
# requires-python = ">=3.11"
# dependencies = ["onnxruntime==1.32.0", "onnx==1.23.2"]
# ///
"""Reconstruit les modèles int8 de syntheo-speech à partir des sources figées.

Usage : uv run --no-project apps/speech/models/quantize.py <dossier de sortie>
(SYNTHEO_SPEECH_SOURCES : dossier des sources, réutilisées si leur empreinte
correspond ; sans liens symboliques, que onnx refuse.)

Télécharge chaque source à la révision de models.json, vérifie son empreinte,
applique la quantification décrite, puis vérifie l'empreinte de chaque fichier
produit. Échoue au premier écart : rien n'est livré sans correspondance exacte.
"""

import hashlib
import json
import os
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(spec: dict, name: str, expected: str, dest: Path) -> Path:
    if dest.exists() and sha256(dest) == expected:
        return dest
    url = f"{spec['repository']}/resolve/{spec['revision']}/{name}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, dest.open("wb") as out:
        shutil.copyfileobj(response, out, 1 << 20)
    actual = sha256(dest)
    if actual != expected:
        sys.exit(f"source {name} : empreinte {actual}, attendue {expected}")
    return dest


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    manifest = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    spec = manifest["source"]
    # Dossier des sources téléchargées (réutilisées si l'empreinte correspond).
    cache = Path(
        os.environ.get(
            "SYNTHEO_SPEECH_SOURCES",
            Path(tempfile.gettempdir()) / "syntheo-speech-sources",
        )
    )
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quant = manifest["quantization"]
    for entry in manifest["files"]:
        target = out / entry["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        transform = entry["transform"]
        if transform.startswith("output-of:"):
            pass
        else:
            source = fetch(
                spec, entry["source"], entry["source_sha256"], cache / entry["source"]
            )
            if "source_data" in entry:
                fetch(
                    spec,
                    entry["source_data"],
                    entry["source_data_sha256"],
                    cache / entry["source_data"],
                )
            if transform == "copy":
                shutil.copyfile(source, target)
            else:
                quantize_dynamic(
                    str(source),
                    str(target),
                    weight_type=getattr(QuantType, quant["weight_type"]),
                    op_types_to_quantize=quant["op_types"],
                    per_channel=transform.startswith("int8-per-channel"),
                    use_external_data_format=transform.endswith("external-data"),
                )
    failures = 0
    for entry in manifest["files"]:
        target = out / entry["path"]
        actual = sha256(target) if target.exists() else "absent"
        ok = actual == entry["sha256"]
        failures += not ok
        print(f"{'ok ' if ok else 'ÉCART'} {entry['path']} {actual}")
    if failures:
        sys.exit(f"{failures} fichier(s) différent(s) de models.json")


if __name__ == "__main__":
    main()
