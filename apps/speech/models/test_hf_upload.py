"""Tests de la comparaison de hf_upload.py, sans réseau ni huggingface_hub.

Lancement : python3 -I -m unittest discover -s apps/speech/models -p 'test_*.py'
"""

import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hf_upload  # noqa: E402
from hf_upload import differences, local_files, model_problems  # noqa: E402


def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


class Differences(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "nemotron").mkdir()
        (root / "nemotron" / "encoder.onnx").write_bytes(b"poids")
        (root / "README.md").write_bytes(b"fiche")
        self.local = local_files(root)

    def tearDown(self):
        self.tmp.cleanup()

    def remote_like_local(self):
        return {
            "nemotron/encoder.onnx": (5, hashlib.sha256(b"poids").hexdigest(), "x"),
            "README.md": (5, None, blob(b"fiche")),
            ".gitattributes": (10, None, "y"),
        }

    def test_identical_files_need_no_upload(self):
        self.assertEqual(differences(self.local, self.remote_like_local()), [])

    def test_a_changed_lfs_file_is_uploaded(self):
        remote = self.remote_like_local()
        remote["nemotron/encoder.onnx"] = (5, hashlib.sha256(b"autre").hexdigest(), "x")
        self.assertEqual(differences(self.local, remote), ["nemotron/encoder.onnx"])

    def test_a_changed_small_file_is_uploaded(self):
        remote = self.remote_like_local()
        remote["README.md"] = (5, None, blob(b"autre"))
        self.assertEqual(differences(self.local, remote), ["README.md"])

    def test_a_missing_file_is_uploaded(self):
        remote = self.remote_like_local()
        del remote["README.md"]
        self.assertEqual(differences(self.local, remote), ["README.md"])

    def test_same_hash_but_another_size_is_uploaded(self):
        remote = self.remote_like_local()
        remote["nemotron/encoder.onnx"] = (6, hashlib.sha256(b"poids").hexdigest(), "x")
        self.assertEqual(differences(self.local, remote), ["nemotron/encoder.onnx"])

    def test_an_empty_repository_needs_everything(self):
        self.assertEqual(
            sorted(differences(self.local, {})),
            ["README.md", "nemotron/encoder.onnx"],
        )


class ModelProblems(unittest.TestCase):
    MODELS = [
        {
            "path": "nemotron/encoder.onnx",
            "size": 5,
            "sha256": hashlib.sha256(b"poids").hexdigest(),
        },
    ]

    def test_an_empty_folder_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(local_files(Path(tmp)), {})
            self.assertEqual(
                model_problems({}, self.MODELS), ["nemotron/encoder.onnx absent"]
            )

    def test_a_complete_folder_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "nemotron").mkdir()
            (Path(tmp) / "nemotron" / "encoder.onnx").write_bytes(b"poids")
            self.assertEqual(model_problems(local_files(Path(tmp)), self.MODELS), [])

    def test_a_different_model_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "nemotron").mkdir()
            (Path(tmp) / "nemotron" / "encoder.onnx").write_bytes(b"autres")
            self.assertEqual(
                model_problems(local_files(Path(tmp)), self.MODELS),
                ["nemotron/encoder.onnx différent de models.json"],
            )


class MainRefusesBadFolders(unittest.TestCase):
    """main() refuse un dossier absent, vide ou incomplet (code 2) avant de lire
    HF_TOKEN ou d'importer huggingface_hub : aucun accès réseau."""

    def run_main(self, folder):
        argv, token = sys.argv, os.environ.pop("HF_TOKEN", None)
        sys.argv = [
            "hf_upload.py",
            str(folder),
            "WillisBack/syntheo-speech-models",
            "essai",
        ]
        try:
            return hf_upload.main()
        finally:
            sys.argv = argv
            if token is not None:
                os.environ["HF_TOKEN"] = token

    def test_an_absent_folder_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.run_main(Path(tmp) / "absent"), 2)

    def test_an_empty_folder_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.run_main(tmp), 2)

    def test_an_incomplete_folder_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "README.md").write_bytes(b"fiche")
            self.assertEqual(self.run_main(tmp), 2)


if __name__ == "__main__":
    unittest.main()
