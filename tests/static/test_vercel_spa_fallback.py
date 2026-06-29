from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERCEL_CONFIG = ROOT / "vercel.json"

REQUIRED_DIRECT_ROUTES = [
    "/about",
    "/settings/audio",
    "/settings/storage",
    "/settings/privacy",
    "/settings/shortcuts",
    "/settings/diagnostics",
    "/models/import",
    "/models/local-enrollment-profile/export",
]

REQUIRED_SECURITY_HEADERS = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def read_vercel_config() -> dict[str, object]:
    return json.loads(VERCEL_CONFIG.read_text(encoding="utf-8"))


def test_vercel_has_spa_fallback_for_direct_app_routes() -> None:
    config = read_vercel_config()
    rewrites = config.get("rewrites")

    assert rewrites == [{"source": "/(.*)", "destination": "/index.html"}]
    assert REQUIRED_DIRECT_ROUTES


def test_vercel_keeps_security_headers_with_spa_fallback() -> None:
    config = read_vercel_config()
    header_rules = config["headers"]
    assert isinstance(header_rules, list)
    app_rule = next(rule for rule in header_rules if rule["source"] == "/(.*)")
    headers = {header["key"]: header["value"] for header in app_rule["headers"]}

    for key, value in REQUIRED_SECURITY_HEADERS.items():
        assert headers[key] == value

    csp = headers["Content-Security-Policy"]
    for directive in [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
    ]:
        assert directive in csp
