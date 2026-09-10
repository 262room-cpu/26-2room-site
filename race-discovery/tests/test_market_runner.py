import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

from race_agent import market_runner


class MarketRunnerBudgetTests(unittest.TestCase):
    def test_timeout_is_checkpointed_instead_of_raising(self):
        with tempfile.TemporaryDirectory() as td:
            market_root = pathlib.Path(td) / "markets"
            target = market_root / "zz"
            target.mkdir(parents=True)
            (target / "STATE.json").write_text(
                json.dumps({"status": "PASS", "run_id": "previous-run"}), encoding="utf-8"
            )

            def timeout_after_partial_write(*args, **kwargs):
                runtime = pathlib.Path(kwargs["cwd"]) / "runtime"
                (runtime / "partial.jsonl").write_text('{"partial": true}\n', encoding="utf-8")
                raise subprocess.TimeoutExpired(
                    cmd=args[0], timeout=kwargs["timeout"], output=b"partial stdout", stderr=b"partial stderr"
                )

            with mock.patch.object(market_runner, "MARKET_ROOT", market_root), mock.patch.object(
                market_runner.subprocess, "run", side_effect=timeout_after_partial_write
            ):
                result = market_runner.run_market(
                    "zz", {"country": "Testland"}, timeout_seconds=3
                )

            self.assertEqual(result["returncode"], 124)
            self.assertEqual(result["status"], "TIMEOUT_CHECKPOINTED")
            self.assertTrue(result["timed_out"])
            self.assertTrue(result["checkpointed"])
            self.assertEqual(result["timeout_seconds"], 3)
            self.assertIn("partial stdout", result["stdout_tail"])
            self.assertIn("partial stderr", result["stderr_tail"])
            self.assertTrue((target / "partial.jsonl").exists())

            state = json.loads((target / "STATE.json").read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "TIMEOUT_CHECKPOINTED")
            self.assertEqual(state["last_timeout"]["previous_status"], "PASS")
            self.assertEqual(state["last_timeout"]["timeout_seconds"], 3)

    def test_rotation_caps_market_timeout_and_defers_after_global_budget(self):
        times = iter([0.0, 0.0, 6.0, 8.0])
        calls = []

        def fake_now():
            return next(times)

        def fake_runner(code, cfg, timeout_seconds=None):
            calls.append((code, timeout_seconds))
            return {
                "market_code": code,
                "country": cfg["country"],
                "status": "PASS",
                "returncode": 0,
                "finished_at": f"finished-{code}",
            }

        manifest = {
            "aa": {"country": "AA"},
            "bb": {"country": "BB"},
            "cc": {"country": "CC"},
        }
        results = market_runner.run_rotation(
            ["aa", "bb", "cc"],
            manifest,
            total_budget_seconds=7,
            per_market_timeout_seconds=5,
            now_fn=fake_now,
            config_loader=lambda code: manifest[code],
            market_runner=fake_runner,
        )

        self.assertEqual(calls, [("aa", 5), ("bb", 1)])
        self.assertEqual(results[0]["status"], "PASS")
        self.assertEqual(results[1]["status"], "PASS")
        self.assertEqual(results[2]["status"], "DEFERRED_GLOBAL_BUDGET")
        self.assertIsNone(results[2]["returncode"])

    def test_unknown_market_is_reported_without_running_worker(self):
        calls = []
        results = market_runner.run_rotation(
            ["missing"],
            {"aa": {"country": "AA"}},
            total_budget_seconds=10,
            per_market_timeout_seconds=5,
            now_fn=lambda: 0.0,
            config_loader=lambda code: {},
            market_runner=lambda *args, **kwargs: calls.append((args, kwargs)),
        )
        self.assertEqual(calls, [])
        self.assertEqual(results[0]["status"], "UNKNOWN_MARKET")
        self.assertIsNone(results[0]["returncode"])


if __name__ == "__main__":
    unittest.main()
