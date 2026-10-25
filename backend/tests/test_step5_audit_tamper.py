"""Step 5 Technical Audit: Audit Integrity & SHA-256 Hash-Chain Tamper Testing.
Tests in an isolated temporary fixture:
1. Valid ledger baseline.
2. Historical event modification (detected).
3. Event deletion (detected).
4. Event insertion (detected).
5. Event reordering (detected).
6. Invalid parent hash (detected).
7. Invalid event hash (detected).
8. Sequence gap (detected).
9. Ledger head truncation (detected).
10. Ledger tail truncation (detected if external latest_hash known, but internally valid).
"""

import json
import tempfile
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch
import pytest

from app.schemas.audit import AuditEvent, AuditEventType
from app.services.audit_service import AuditService, GENESIS_HASH, canonicalize_for_hash


def build_ledger(events_data, base_dir):
    events_file = base_dir / "events.jsonl"
    with open(events_file, "w", encoding="utf-8") as f:
        for ev in events_data:
            f.write(json.dumps(ev) + "\n")
    return events_file


def create_sample_chain(n=5):
    chain = []
    prev_hash = GENESIS_HASH
    for i in range(1, n + 1):
        ev_dict = {
            "event_id": f"evt_{i:04d}",
            "sequence_number": i,
            "timestamp": f"2026-01-01T00:0{i}:00Z",
            "event_type": "pipeline_created",
            "previous_hash": prev_hash,
            "details": {"step": i},
        }
        canonical_str = canonicalize_for_hash(ev_dict)
        content = f"{canonical_str}{prev_hash}".encode("utf-8")
        h = sha256(content).hexdigest()
        ev_dict["event_hash"] = h
        prev_hash = h
        chain.append(ev_dict)
    return chain


def test_audit_tamper_scenarios():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        service = AuditService()

        with patch("app.services.audit_service.get_audit_storage_path", return_value=tmp_path):
            # 1. Baseline: valid chain
            chain = create_sample_chain(5)
            build_ledger(chain, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is True
            assert res.total_events_checked == 5
            assert len(res.errors) == 0

            # 2. Historical Event Modification
            tampered = create_sample_chain(5)
            tampered[2]["details"]["step"] = 999  # modify payload of event 3
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Digest mismatch" in e for e in res.errors)

            # 3. Event Deletion (delete event 3)
            tampered = create_sample_chain(5)
            del tampered[2]
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Sequence gap" in e or "Hash chain broken" in e for e in res.errors)

            # 4. Event Insertion (insert duplicate event 2.5)
            tampered = create_sample_chain(5)
            inserted = dict(tampered[1])
            inserted["event_id"] = "evt_inserted"
            tampered.insert(2, inserted)
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert len(res.errors) > 0

            # 5. Event Reordering (swap event 2 and 3)
            tampered = create_sample_chain(5)
            tampered[1], tampered[2] = tampered[2], tampered[1]
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Sequence gap" in e or "Hash chain broken" in e for e in res.errors)

            # 6. Invalid parent hash
            tampered = create_sample_chain(5)
            tampered[3]["previous_hash"] = "a" * 64
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Hash chain broken" in e for e in res.errors)

            # 7. Invalid event hash
            tampered = create_sample_chain(5)
            tampered[1]["event_hash"] = "b" * 64
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Digest mismatch" in e for e in res.errors)

            # 8. Sequence Gap (seq 1, 2, 4, 5 without changing hashes)
            tampered = create_sample_chain(5)
            tampered[2]["sequence_number"] = 10
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Sequence gap" in e for e in res.errors)

            # 9. Head truncation (delete event 1)
            tampered = create_sample_chain(5)[1:]
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is False
            assert any("Sequence gap" in e or "Hash chain broken" in e for e in res.errors)

            # 10. Tail truncation (delete event 5)
            # Internal self-consistency remains intact for remaining 4 events!
            tampered = create_sample_chain(5)[:4]
            build_ledger(tampered, tmp_path)
            res = service.verify_hash_chain()
            assert res.is_valid is True  # Remaining 4 events are internally consistent
            assert res.total_events_checked == 4
            # Key Audit Finding: Tail truncation is NOT detectable by internal ledger checks alone
            # without an external trust anchor or published latest_hash.
