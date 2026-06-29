from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
VERCEL_CONFIG = ROOT / "vercel.json"
MODEL_PACKS_DIR = ROOT / "apps" / "web" / "public" / "model-packs"

# Hugging Face /resolve URLs for the committed model pack currently redirect
# large Xet-backed files to this exact CDN origin. Keep this explicit rather
# than allowing wildcard hf.co/CDN hosts.
REQUIRED_MODEL_REDIRECT_ORIGINS = {"https://us.aws.cdn.hf.co"}

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


def get_vercel_headers() -> dict[str, str]:
    config = read_vercel_config()
    header_rules = config["headers"]
    assert isinstance(header_rules, list)
    app_rule = next(rule for rule in header_rules if rule["source"] == "/(.*)")
    return {header["key"]: header["value"] for header in app_rule["headers"]}


def get_csp_directive(csp: str, directive_name: str) -> list[str]:
    for directive in csp.split(";"):
        tokens = directive.strip().split()
        if tokens and tokens[0] == directive_name:
            return tokens[1:]
    raise AssertionError(f"missing CSP directive: {directive_name}")


def installable_model_file_origins() -> set[str]:
    origins: set[str] = set()
    for manifest_path in MODEL_PACKS_DIR.glob("*/manifest.json"):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for file_info in manifest.get("files", {}).values():
            url = file_info.get("url")
            if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                continue
            parsed = urlparse(url)
            origins.add(f"{parsed.scheme}://{parsed.netloc}")
    return origins


def test_vercel_has_spa_fallback_for_direct_app_routes() -> None:
    config = read_vercel_config()
    rewrites = config.get("rewrites")

    assert rewrites == [{"source": "/(.*)", "destination": "/index.html"}]
    assert REQUIRED_DIRECT_ROUTES


def test_vercel_keeps_security_headers_with_spa_fallback() -> None:
    headers = get_vercel_headers()

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


def test_vercel_csp_allows_only_committed_installable_model_origins() -> None:
    manifest_origins = installable_model_file_origins()
    assert manifest_origins == {"https://huggingface.co"}

    required_origins = manifest_origins | REQUIRED_MODEL_REDIRECT_ORIGINS

    csp = get_vercel_headers()["Content-Security-Policy"]
    connect_src = get_csp_directive(csp, "connect-src")

    for origin in required_origins:
        assert origin in connect_src

    assert "'self'" in connect_src
    assert "*" not in connect_src
    assert "https:" not in connect_src
    assert "http:" not in connect_src
    assert "https://*.huggingface.co" not in connect_src
    assert "https://*.hf.co" not in connect_src
