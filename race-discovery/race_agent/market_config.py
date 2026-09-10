from __future__ import annotations

import json
import pathlib

DEFAULT_EVENT_TERMS = [
    "марафон", "полумарафон", "забег", "трейл", "trail", "race", "run",
    "триатлон", "дуатлон", "open water", "swim", "гонка с препятствиями",
    "obstacle race", "ультрамарафон", "ultra", "экиден", "nordic walking",
    "family run", "kids run"
]


def _read_json(path: pathlib.Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _generic_queries(query_name: str) -> list[str]:
    return [
        f'марафон {query_name} 2026 регистрация официальный',
        f'марафон {query_name} 2027 регистрация официальный',
        f'забег {query_name} 2026 регистрация',
        f'забег {query_name} 2027 регистрация',
        f'trail {query_name} 2026 race registration',
        f'trail {query_name} 2027 race registration',
        f'полумарафон {query_name} 2026 регистрация',
        f'триатлон {query_name} 2026 регистрация',
        f'дуатлон {query_name} 2026 регистрация',
        f'open water {query_name} 2026 race',
        f'гонка с препятствиями {query_name} 2026',
        f'семейный забег {query_name} 2026',
        f'детский забег {query_name} 2026',
        f'ультрамарафон {query_name} 2026',
        f'календарь забегов {query_name} 2026',
        f'календарь стартов {query_name} 2027'
    ]


def load_market_config(config_dir: pathlib.Path, code: str) -> dict:
    manifest = _read_json(config_dir / "markets.json", {})
    market = ((manifest.get("markets") or {}).get(code) or {}).copy()
    if not market:
        raise ValueError(f"Unknown market code: {code}")

    custom = _read_json(config_dir / f"{code}.json", {})
    # Market manifest owns cross-country routing fields; a country file can enrich search sources/queries.
    cfg = dict(market)
    for key, value in custom.items():
        if key in {"queries", "social_queries", "seed_urls", "source_hints", "event_terms", "cities"}:
            continue
        cfg[key] = value

    query_name = (market.get("query_names") or [market.get("country", code)])[0]
    cfg["queries"] = list(dict.fromkeys(_generic_queries(query_name) + list(custom.get("queries", []))))
    cfg["social_queries"] = list(dict.fromkeys(custom.get("social_queries", [])))
    cfg["seed_urls"] = list(dict.fromkeys(custom.get("seed_urls", [])))
    cfg["source_hints"] = dict(custom.get("source_hints", {}))
    cfg["event_terms"] = list(dict.fromkeys(DEFAULT_EVENT_TERMS + list(custom.get("event_terms", []))))
    cfg["cities"] = list(dict.fromkeys(list(market.get("cities", [])) + list(custom.get("cities", []))))
    cfg["country_aliases"] = list(dict.fromkeys(market.get("country_aliases", []) + market.get("query_names", [])))
    cfg["market_code"] = code
    cfg["country"] = market.get("country", code)
    return cfg


def enabled_markets(config_dir: pathlib.Path) -> list[tuple[str, dict]]:
    manifest = _read_json(config_dir / "markets.json", {})
    rows = []
    for code, market in (manifest.get("markets") or {}).items():
        if market.get("enabled", True):
            rows.append((code, market))
    return sorted(rows, key=lambda item: (-int(item[1].get("priority", 0)), item[0]))
