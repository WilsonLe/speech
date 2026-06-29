from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/planning/v0.6.0-update-offline-rollback-verification.json"
CURRENT_STATE = ROOT / "docs/planning/CURRENT_STATE.json"
PWA_TEST = ROOT / "apps/web/src/app/pwa-lifecycle.test.ts"
OFFLINE_E2E = ROOT / "apps/web/e2e/offline-model-lifecycle.spec.ts"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_update_offline_rollback_evidence_is_local_privacy_safe_and_gate_aware() -> None:
    evidence = read_json(EVIDENCE)

    assert evidence["schemaVersion"] == 1
    assert evidence["issue"] == 257
    assert (
        evidence["status"]
        == "local release-candidate verification passed; hosted publication remains for issue #258"
    )
    assert evidence["sourceVersions"]["fromRelease"]["tag"] == "v0.5.0"
    assert (
        evidence["sourceVersions"]["fromRelease"]["commit"]
        == "8e72dd120e41e69cc52458804fa8b8804e74b9bc"
    )
    assert evidence["method"]["kind"] == "local same-origin two-version PWA verification"

    check_ids = {check["id"] for check in evidence["checks"]}
    assert check_ids == {
        "fresh-v0.5-load",
        "v0.5-offline-restart",
        "update-v0.5-to-v0.6-current",
        "ui-preferences-additive-after-update",
        "rollback-v0.6-to-v0.5",
        "ui-preferences-additive-after-rollback",
        "service-worker-update-prompt-contract",
        "offline-restart-regression-suite",
    }
    for check in evidence["checks"]:
        assert check["result"] == "pass"
        assert "evidence" in check

    limitations = "\n".join(evidence["residualLimitations"])
    assert "issue #258" in limitations.lower()
    assert "Issue #255 remains open" in limitations
    assert "not a production deployment claim" in limitations

    privacy = evidence["privacy"]
    for key in [
        "containsParticipantData",
        "containsAudio",
        "containsTranscripts",
        "containsVocabularyTerms",
        "containsProfileArtifacts",
        "containsModelWeights",
        "containsScreenshotsInRepository",
        "containsSupportBundles",
    ]:
        assert privacy[key] is False


def test_current_state_points_to_update_offline_rollback_evidence() -> None:
    current = read_json(CURRENT_STATE)
    evidence = current["verifiedGates"]

    assert (
        evidence["updateOfflineRollback"]
        == "docs/planning/v0.6.0-update-offline-rollback-verification.json"
    )
    gates = "\n".join(current["openReleaseGates"])
    assert "Issue #255 remains open" in gates
    assert "Production accuracy/performance claims" in gates
    issue_310_gate = (
        "Publication/deployment evidence is issue #310 work and must be completed "
        "on the tagged v0.6.1 hotfix release commit before closing #310."
    )
    assert issue_310_gate in gates


def test_update_prompt_and_offline_restart_tests_are_present() -> None:
    pwa_test = PWA_TEST.read_text(encoding="utf-8")
    offline_e2e = OFFLINE_E2E.read_text(encoding="utf-8")

    assert "activatePwaUpdate" in pwa_test
    assert "does not reload when an update is discovered until activation is explicit" in pwa_test
    assert "reloads the precached app shell while offline" in offline_e2e
    assert "waitForServiceWorkerControl" in offline_e2e
