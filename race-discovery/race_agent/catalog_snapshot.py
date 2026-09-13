from __future__ import annotations

import argparse
import csv
import io
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "runtime" / "app_catalog_snapshot.jsonl"


def decode_snapshot_text(text: str, suffix: str = "") -> list[dict]:
    suffix = (suffix or "").lower()
    stripped = text.lstrip()
    if suffix == ".csv":
        return [dict(row) for row in csv.DictReader(io.StringIO(text))]

    try:
        payload = json.loads(text)
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if isinstance(payload, dict):
            for key in ("events", "items", "data", "results", "rows"):
                value = payload.get(key)
                if isinstance(value, list):
                    return [row for row in value if isinstance(row, dict)]
                if isinstance(value, dict):
                    for nested in ("events", "items", "results", "rows"):
                        nested_value = value.get(nested)
                        if isinstance(nested_value, list):
                            return [row for row in nested_value if isinstance(row, dict)]
            return [payload]
    except json.JSONDecodeError:
        pass

    rows = []
    for line in stripped.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def import_snapshot(input_path: pathlib.Path, output_path: pathlib.Path = DEFAULT_OUTPUT) -> int:
    rows = decode_snapshot_text(input_path.read_text(encoding="utf-8-sig"), input_path.suffix)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a read-only 26.2 ROOM app catalog snapshot")
    parser.add_argument("--input", required=True, help="JSON, JSONL or CSV export from the real admin panel")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    count = import_snapshot(pathlib.Path(args.input), pathlib.Path(args.output))
    print(json.dumps({"snapshot_events": count, "output": args.output}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
