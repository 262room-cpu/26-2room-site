from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any


class FirestoreCatalogError(RuntimeError):
    pass


def _decode_value(value: dict) -> Any:
    if not isinstance(value, dict):
        return value
    if "nullValue" in value:
        return None
    if "stringValue" in value:
        return value.get("stringValue", "")
    if "timestampValue" in value:
        return value.get("timestampValue", "")
    if "integerValue" in value:
        raw = value.get("integerValue")
        try:
            return int(raw)
        except (TypeError, ValueError):
            return raw
    if "doubleValue" in value:
        raw = value.get("doubleValue")
        try:
            return float(raw)
        except (TypeError, ValueError):
            return raw
    if "booleanValue" in value:
        return bool(value.get("booleanValue"))
    if "arrayValue" in value:
        return [_decode_value(v) for v in (value.get("arrayValue") or {}).get("values", [])]
    if "mapValue" in value:
        return {
            key: _decode_value(item)
            for key, item in ((value.get("mapValue") or {}).get("fields") or {}).items()
        }
    if "geoPointValue" in value:
        point = value.get("geoPointValue") or {}
        return {"latitude": point.get("latitude"), "longitude": point.get("longitude")}
    if "referenceValue" in value:
        return value.get("referenceValue", "")
    if "bytesValue" in value:
        # Keep opaque. The race catalog does not need binary payloads.
        return value.get("bytesValue", "")
    return value


def decode_document(document: dict) -> dict:
    name = str(document.get("name") or "")
    fields = document.get("fields") or {}
    row = {key: _decode_value(value) for key, value in fields.items()}
    if not row.get("id"):
        row["id"] = name.rsplit("/", 1)[-1] if name else ""
    row["_firestore_document_name"] = name
    if document.get("createTime"):
        row["_firestore_create_time"] = document.get("createTime")
    if document.get("updateTime"):
        row["_firestore_update_time"] = document.get("updateTime")
    return row


def configured() -> bool:
    return bool(os.environ.get("FIRESTORE_CATALOG_PROJECT") and os.environ.get("FIRESTORE_CATALOG_COLLECTION"))


def _collection_path(value: str) -> str:
    segments = [segment for segment in str(value or "").strip("/").split("/") if segment]
    if not segments or any(segment in {".", ".."} for segment in segments):
        raise FirestoreCatalogError("Invalid Firestore collection path")
    return "/".join(urllib.parse.quote(segment, safe="") for segment in segments)


def fetch_catalog(
    project: str,
    collection: str,
    *,
    database: str = "(default)",
    bearer_token: str = "",
    api_key: str = "",
    timeout: int = 20,
    max_pages: int = 10,
    page_size: int = 500,
) -> list[dict]:
    """Read Firestore documents using ListDocuments only.

    This module intentionally exposes no write operation. Authentication, when required, must be a
    credential whose IAM/Firebase permissions are read-only. The caller owns that configuration.
    """
    project = str(project or "").strip()
    if not project:
        raise FirestoreCatalogError("Missing Firestore project")
    path = _collection_path(collection)
    database = urllib.parse.quote(str(database or "(default)"), safe="()")
    project_q = urllib.parse.quote(project, safe="")
    base = f"https://firestore.googleapis.com/v1/projects/{project_q}/databases/{database}/documents/{path}"

    headers = {"User-Agent": "262room-race-discovery/0.4", "Accept": "application/json"}
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"

    rows: list[dict] = []
    page_token = ""
    max_pages = max(1, min(int(max_pages), 20))
    page_size = max(1, min(int(page_size), 1000))

    for _ in range(max_pages):
        params = {"pageSize": str(page_size)}
        if page_token:
            params["pageToken"] = page_token
        if api_key:
            params["key"] = api_key
        url = base + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read(10_000_000).decode("utf-8", errors="replace"))
        except Exception as exc:  # caller converts this into a safe catalog-unavailable state
            raise FirestoreCatalogError(f"Firestore read failed: {type(exc).__name__}: {exc}") from exc

        for document in payload.get("documents") or []:
            if isinstance(document, dict):
                rows.append(decode_document(document))
        page_token = str(payload.get("nextPageToken") or "")
        if not page_token:
            break
    return rows


def load_from_env() -> tuple[list[dict], str]:
    project = str(os.environ.get("FIRESTORE_CATALOG_PROJECT") or "").strip()
    collection = str(os.environ.get("FIRESTORE_CATALOG_COLLECTION") or "").strip()
    if not project or not collection:
        return [], "NOT_CONFIGURED"

    rows = fetch_catalog(
        project,
        collection,
        database=str(os.environ.get("FIRESTORE_CATALOG_DATABASE") or "(default)"),
        bearer_token=str(os.environ.get("FIRESTORE_CATALOG_BEARER_TOKEN") or ""),
        api_key=str(os.environ.get("FIRESTORE_CATALOG_API_KEY") or ""),
        timeout=int(os.environ.get("FIRESTORE_CATALOG_TIMEOUT_SECONDS") or "20"),
        max_pages=int(os.environ.get("FIRESTORE_CATALOG_MAX_PAGES") or "10"),
        page_size=int(os.environ.get("FIRESTORE_CATALOG_PAGE_SIZE") or "500"),
    )
    return rows, f"FIRESTORE_READ_ONLY:{project}/{collection}"
