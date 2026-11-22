"""Tests de la comparaison de hf_upload.py, sans réseau ni huggingface_hub.

Lancement : python3 -I -m unittest discover -s apps/speech/models -p 'test_*.py'
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hf_upload import differences, local_files  # noqa: E402


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

    def test_an_empty_repository_needs_everything(self):
        self.assertEqual(
            sorted(differences(self.local, {})),
            ["README.md", "nemotron/encoder.onnx"],
        )


if __name__ == "__main__":
    unittest.main()
