"""Tests de cpu-check/run.sh avec un faux qemu (sans réseau ni modèle) :
une erreur interne de qemu (SIGBUS, code 135) est relancée une seule fois,
un verdict (code 1) ne l'est jamais, deux SIGBUS de suite échouent.

python3 -I -m unittest discover -s apps/speech/models -p 'test_*.py'
"""

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

RUN = Path(__file__).resolve().parent / "cpu-check" / "run.sh"

OK_LINES = "\n".join(
    json.dumps(line)
    for line in (
        {"file": "mic.wav", "words": 80, "ok": True},
        {"file": "sys.wav", "words": 43, "ok": True},
        {"total": True, "words": 123, "ok": True},
    )
)
MUTE_LINES = "\n".join(
    json.dumps(line)
    for line in (
        {"file": "mic.wav", "words": 0, "ok": False},
        {"file": "sys.wav", "words": 0, "ok": False},
        {"total": True, "words": 0, "ok": False},
    )
)

# Faux qemu : rejoue, appel après appel, le scénario donné (un état par ligne
# de SCENARIO) et compte ses appels dans CALLS.
FAKE_QEMU = """#!/usr/bin/env bash
n=$(( $(cat "$CALLS" 2> /dev/null || echo 0) + 1 ))
echo "$n" > "$CALLS"
state=$(sed -n "${n}p" "$SCENARIO")
case "$state" in
  sigbus) echo "qemu-x86_64-static: QEMU internal SIGBUS {code=ADRERR, addr=0x0}" >&2; exit 135 ;;
  sigbus-message) echo "qemu-x86_64-static: QEMU internal SIGBUS {code=ADRERR, addr=0x0}" >&2; exit 134 ;;
  ok) cat "$OK" ; exit 0 ;;
  mute) cat "$MUTE" ; exit 1 ;;
  *) echo "état inconnu : $state" >&2; exit 2 ;;
esac
"""


class RunShTest(unittest.TestCase):
    def run_scenario(self, states, *extra):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            qemu = tmp / "qemu"
            qemu.write_text(FAKE_QEMU)
            qemu.chmod(qemu.stat().st_mode | stat.S_IXUSR)
            (tmp / "scenario").write_text("\n".join(states) + "\n")
            (tmp / "ok.jsonl").write_text(OK_LINES + "\n")
            (tmp / "mute.jsonl").write_text(MUTE_LINES + "\n")
            models = tmp / "models"
            models.mkdir()
            env = {
                **os.environ,
                "QEMU": str(qemu),
                "CPU_CHECK_BIN": "/bin/true",
                "CALLS": str(tmp / "calls"),
                "SCENARIO": str(tmp / "scenario"),
                "OK": str(tmp / "ok.jsonl"),
                "MUTE": str(tmp / "mute.jsonl"),
            }
            result = subprocess.run(
                ["bash", str(RUN), str(models), *extra],
                env=env,
                capture_output=True,
                text=True,
            )
            calls = int((tmp / "calls").read_text())
        return result, calls

    def test_one_sigbus_is_retried_once_with_a_warning(self):
        result, calls = self.run_scenario(["sigbus", "ok"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, 2)
        self.assertIn("::warning::", result.stdout)
        self.assertIn("modèles acceptés", result.stdout)

    def test_the_sigbus_message_alone_is_recognised(self):
        result, calls = self.run_scenario(["sigbus-message", "ok"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, 2)

    def test_two_sigbus_in_a_row_fail(self):
        result, calls = self.run_scenario(["sigbus", "sigbus", "ok"])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, 2)
        self.assertIn("non conclusif", result.stderr)

    def test_a_verdict_is_never_retried(self):
        result, calls = self.run_scenario(["mute", "ok"])
        self.assertEqual(result.returncode, 1)
        self.assertEqual(calls, 1)
        self.assertNotIn("::warning::", result.stdout)

    def test_the_negative_control_still_expects_no_words(self):
        result, calls = self.run_scenario(["mute"], "--expect-empty")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, 1)


if __name__ == "__main__":
    unittest.main()
