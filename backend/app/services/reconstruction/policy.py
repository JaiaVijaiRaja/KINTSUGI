"""Deterministic acceptance and review policy engine for signal reconstructions."""

from typing import Optional, Tuple
import numpy as np

from app.schemas.pipeline import PipelineConfig
from app.schemas.reconstruction import ProcessingStatus


def evaluate_reconstruction_policy(
    original_val: Optional[float],
    proposed_val: Optional[float],
    confidence_score: float,
    pipeline_config: PipelineConfig,
    is_structurally_valid: bool,
    structural_failure_reason: Optional[str] = None,
    has_evidence_conflict: bool = False,
) -> Tuple[ProcessingStatus, Optional[float], Optional[str]]:
    """
    Evaluate deterministic acceptance, review, or abstention policy.

    Transitions:
    1. UNRESOLVED:
       Triggered when:
       - Proposed value is None or non-finite.
       - Structural safety check failed (prohibited extrapolation, gap limit exceeded).
       - Severe evidence conflict detected (e.g. cross-sensor disagreement).
       - Confidence score is strictly below the configured review threshold.
       Result: System strictly ABSTAINS from guessing. Final committed value remains original reading.
    2. ESTIMATED:
       Triggered when:
       - Proposed value is finite, structurally valid, without evidence conflict.
       - Confidence score meets or exceeds the configured review threshold (e.g. >= 80.0).
       - Human review is required (human_review_required=True OR allow_automatic_correction=False).
       Result: Proposed value is held for operator review; final value retains original measurement.
    3. CORRECTED:
       Triggered when:
       - All structural, consistency, and evidence quorums are satisfied.
       - Confidence score meets or exceeds review threshold.
       - Policy explicitly permits automatic correction (allow_automatic_correction=True and human_review_required=False).
       Result: Proposed value is approved and committed as final_value.

    Under all policies, the original_val is permanently retained and never overwritten in storage.
    """
    rec_cfg = pipeline_config.reconstruction_settings
    conf_policy = pipeline_config.confidence_policy
    threshold_pts = conf_policy.review_threshold * 100.0  # e.g. 0.80 -> 80.0

    # 1. Check structural validity
    if not is_structurally_valid or proposed_val is None or not np.isfinite(proposed_val):
        abstain_msg = structural_failure_reason or "Reconstruction proposal failed structural validity checks."
        return "UNRESOLVED", original_val, abstain_msg

    # 2. Check for unresolved evidence conflict
    if has_evidence_conflict:
        abstain_msg = "Unresolved evidence conflict: secondary sensor models contradict candidate reconstruction proposal."
        return "UNRESOLVED", original_val, abstain_msg

    # 3. Check confidence threshold
    if confidence_score < threshold_pts:
        abstain_msg = (
            f"Confidence score ({confidence_score:.1f}) is below the configured acceptance "
            f"threshold ({threshold_pts:.1f}); system abstains to prevent unjustified repair."
        )
        return "UNRESOLVED", original_val, abstain_msg

    # 4. Check review requirement vs automatic correction
    if rec_cfg.allow_automatic_correction and not conf_policy.human_review_required:
        # High confidence and automatic promotion permitted
        return "CORRECTED", proposed_val, None
    else:
        # High confidence proposal generated, but mandates human operator sign-off
        review_msg = (
            f"Candidate proposal meets confidence threshold ({confidence_score:.1f} >= {threshold_pts:.1f}); "
            f"held as ESTIMATED pending human operator review per policy."
        )
        # Note: under ESTIMATED, final committed value remains original reading until explicit human review
        return "ESTIMATED", original_val, review_msg
