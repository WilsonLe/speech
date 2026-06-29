from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_CURRENT_VERSION = "0.6.0"


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def read_json(relative_path: str) -> dict[str, object]:
    return json.loads(read_text(relative_path))


def package_json_paths() -> list[Path]:
    return [
        ROOT / "package.json",
        ROOT / "apps/web/package.json",
        *sorted((ROOT / "packages").glob("*/package.json")),
    ]


def test_current_workspace_versions_are_aligned_after_v0_6_bump() -> None:
    versions = {
        path.relative_to(ROOT).as_posix(): json.loads(path.read_text(encoding="utf-8"))["version"]
        for path in package_json_paths()
    }

    assert versions
    assert set(versions.values()) == {EXPECTED_CURRENT_VERSION}


def test_v0_5_release_snapshot_records_claim_boundaries() -> None:
    adr = read_text("docs/adr/0007-v0-5-0-release-notes-and-planning-snapshot.md")

    assert "Release tag: `v0.5.0`" in adr
    assert "Package version: `0.5.0`" in adr
    assert "ADR 0004" in adr
    assert "ADR 0005" in adr
    assert "ADR 0006" in adr
    assert "Do not claim production Personal Voice Model accuracy" in adr
    assert "Do not claim production memory, storage, latency" in adr
    assert "Synthetic fixtures, CI smoke tests, local diagnostics, and contract tests" in adr
    assert "Attach source and web build archives plus `SHA256SUMS.txt`" in adr


def test_readme_points_to_v0_5_release_limitations() -> None:
    readme = read_text("README.md")

    assert "v0.5.0 browser Personal Voice Model infrastructure" in readme
    assert "docs/adr/0004-v0-5-0-quality-cohort-gate.md" in readme
    assert "docs/adr/0005-v0-5-0-reference-benchmark-gate.md" in readme
    assert "docs/adr/0006-v0-5-0-privacy-security-licensing-review.md" in readme
    assert "docs/adr/0007-v0-5-0-release-notes-and-planning-snapshot.md" in readme
    assert "do not claim production Personal Voice Model accuracy" in readme
    assert "do not claim production memory, storage, latency" in readme


def test_release_process_references_final_snapshot() -> None:
    instructions = read_text("docs/instructions/release-process.instructions.md")

    assert "ADR 0007" in instructions
    assert (
        "unresolved ADR 0004 cohort and ADR 0005 reference-benchmark evidence gates" in instructions
    )
