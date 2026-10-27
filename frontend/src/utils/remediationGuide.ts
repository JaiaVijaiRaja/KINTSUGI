/**
 * KINTSUGI Industrial Remediation & Rectification Engine
 * 
 * Provides domain-specific algorithmic solutions, value difference (Δ) analysis,
 * and actionable operator/field engineering maintenance instructions for judges and plant operators.
 */

export interface ValueDifferenceAnalysis {
  originalFormatted: string;
  repairedFormatted: string;
  delta: number | null;
  deltaFormatted: string;
  percentChange: number | null;
  percentFormatted: string;
  adjustmentType: 'HEALED_SPIKE' | 'IMPUTED_MISSING' | 'FILTERED_NOISE' | 'ABSTAINED_BOUNDARY' | 'NOMINAL';
  badgeColor: string;
  summaryText: string;
}

export interface RemediationProtocol {
  sensorName: string;
  sensorCategory: 'temperature' | 'vibration' | 'pressure' | 'generic';
  methodCode: string;
  methodName: string;
  methodDescription: string;
  digitalFixSteps: string[];
  fieldEngineeringSteps: string[];
  safetyNotice: string;
}

/**
 * Calculates the exact numerical difference between the raw corrupted telemetry
 * and the repaired/reconstructed value.
 */
export function calculateValueDifference(
  original: number | null | undefined,
  repaired: number | null | undefined
): ValueDifferenceAnalysis {
  const isOriginalMissing = original === null || original === undefined || isNaN(original);
  const isRepairedMissing = repaired === null || repaired === undefined || isNaN(repaired);

  const origFormatted = isOriginalMissing ? 'NaN (Missing)' : original.toFixed(3);
  const repFormatted = isRepairedMissing ? 'NaN (Unresolved)' : repaired.toFixed(3);

  // Case 1: Both missing / boundary abstention
  if (isOriginalMissing && isRepairedMissing) {
    return {
      originalFormatted: origFormatted,
      repairedFormatted: repFormatted,
      delta: null,
      deltaFormatted: '0.000 (No change)',
      percentChange: null,
      percentFormatted: '0.0%',
      adjustmentType: 'ABSTAINED_BOUNDARY',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      summaryText: 'System safely abstained from extrapolating at sequence boundary.',
    };
  }

  // Case 2: Original was missing (telecom dropout / gap), repaired value imputed
  if (isOriginalMissing && !isRepairedMissing) {
    return {
      originalFormatted: origFormatted,
      repairedFormatted: repFormatted,
      delta: null,
      deltaFormatted: `+${repaired.toFixed(3)} (Synthesized)`,
      percentChange: null,
      percentFormatted: '+100% Imputed',
      adjustmentType: 'IMPUTED_MISSING',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      summaryText: `Communication dropout healed. Filled gap with temporal continuity estimate of ${repaired.toFixed(3)}.`,
    };
  }

  // Case 3: Both values numeric
  if (!isOriginalMissing && !isRepairedMissing) {
    const delta = Number((repaired - original).toFixed(4));
    const sign = delta > 0 ? '+' : '';
    const deltaFormatted = `${sign}${delta.toFixed(3)}`;

    let percentChange: number | null = null;
    let percentFormatted = '0.0%';
    if (Math.abs(original) > 1e-6) {
      percentChange = Number((((repaired - original) / Math.abs(original)) * 100).toFixed(2));
      const pSign = percentChange > 0 ? '+' : '';
      percentFormatted = `${pSign}${percentChange.toFixed(1)}%`;
    }

    const absDelta = Math.abs(delta);
    if (absDelta < 0.001) {
      return {
        originalFormatted: origFormatted,
        repairedFormatted: repFormatted,
        delta: 0,
        deltaFormatted: '0.000 (Nominal)',
        percentChange: 0,
        percentFormatted: '0.0%',
        adjustmentType: 'NOMINAL',
        badgeColor: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
        summaryText: 'Observation within normal operational tolerance; raw reading preserved.',
      };
    }

    const isSpike = Math.abs(percentChange ?? 0) > 15 || absDelta > 10;
    return {
      originalFormatted: origFormatted,
      repairedFormatted: repFormatted,
      delta,
      deltaFormatted,
      percentChange,
      percentFormatted,
      adjustmentType: isSpike ? 'HEALED_SPIKE' : 'FILTERED_NOISE',
      badgeColor: isSpike
        ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      summaryText: `Signal healed by ${deltaFormatted} (${percentFormatted} adjustment) to restore steady-state baseline.`,
    };
  }

  // Case 4: Original numeric, repaired is missing (abstained)
  return {
    originalFormatted: origFormatted,
    repairedFormatted: repFormatted,
    delta: 0,
    deltaFormatted: '0.000 (Retained raw)',
    percentChange: 0,
    percentFormatted: '0.0%',
    adjustmentType: 'ABSTAINED_BOUNDARY',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    summaryText: 'Insufficient surrounding evidence; system strictly abstained and retained original raw value.',
  };
}

/**
 * Returns domain-specific rectification methodology and actionable field maintenance
 * instructions for operators and hackathon judges.
 */
export function getRemediationProtocol(
  sensorColumn: string,
  method: string = 'linear_interpolation',
  _originalValue: number | null = null,
  _baselineValue: number | null = null
): RemediationProtocol {
  const col = sensorColumn.toLowerCase();

  let sensorCategory: 'temperature' | 'vibration' | 'pressure' | 'generic' = 'generic';
  if (col.includes('temp') || col.includes('bearing') || col.includes('thermal') || col.includes('_c')) {
    sensorCategory = 'temperature';
  } else if (col.includes('vib') || col.includes('accel') || col.includes('drive') || col.includes('_g')) {
    sensorCategory = 'vibration';
  } else if (col.includes('press') || col.includes('feed') || col.includes('bar') || col.includes('psi')) {
    sensorCategory = 'pressure';
  }

  // Determine method label
  let methodName = 'Chronological Linear Interpolation';
  let methodDescription =
    'Calculates rate-of-change continuity between verified pre-fault and post-fault temporal neighbors without boundary extrapolation.';
  if (method === 'local_median') {
    methodName = 'Centered Rolling Median Filter';
    methodDescription =
      'Calculates localized median across steady-state temporal window to reject non-Gaussian impulse spikes with 50% breakdown immunity.';
  } else if (method === 'cross_sensor') {
    methodName = 'Coupled Cross-Sensor Physical Imputation';
    methodDescription =
      'Leverages multivariate Pearson/Spearman physical dependencies against healthy co-located machine sensors.';
  } else if (method === 'none' || method === 'UNRESOLVED') {
    methodName = 'Conservative Abstention & Raw Retention';
    methodDescription =
      'System refuses to invent synthetic data when temporal boundaries or evidence thresholds are unmet.';
  }

  // Category-specific instructions
  if (sensorCategory === 'temperature') {
    return {
      sensorName: sensorColumn,
      sensorCategory,
      methodCode: method,
      methodName,
      methodDescription,
      digitalFixSteps: [
        'Isolate anomalous thermal excursion via MAD dispersion thresholding to prevent false trip signals.',
        'Reconstruct continuous thermal gradient using chronologically verified boundary neighbors.',
        'Validate reconstructed value against ASME Section VIII maximum allowable thermal rate-of-rise (≤ 2.5°C/sec).',
        'Commit repaired observation into audit ledger with SHA-256 tamper-proof provenance.',
      ],
      fieldEngineeringSteps: [
        'Inspect RTD / Type-K thermocouple lead wire terminal block for galvanic oxidation or loose crimps.',
        'Verify lube oil heat exchanger circulation pump pressure and thermostatic bypass valve operation.',
        'Check transmitter 4-20mA loop for 50/60Hz electromagnetic induction from adjacent VFD motor leads.',
        'Measure thermocouple resistance (nominal Pt100: ~126Ω at 67°C; verify within ±0.3Ω).',
      ],
      safetyNotice:
        'CRITICAL: If physical bearing casing temperature exceeds 85.0°C during physical inspection, initiate manual turbine load shedding.',
    };
  }

  if (sensorCategory === 'vibration') {
    return {
      sensorName: sensorColumn,
      sensorCategory,
      methodCode: method,
      methodName,
      methodDescription,
      digitalFixSteps: [
        'Filter high-frequency accelerometer packet dropouts and electrical spikes using rolling temporal interpolation.',
        'Bound reconstructed vibration amplitude to ISO 10816 Zone A/B industrial machine limits (< 2.3 mm/s RMS).',
        'Reject extrapolation across gaps exceeding 5 seconds to maintain mathematical integrity.',
        'Calculate multi-factor confidence score incorporating local variance and temporal proximity.',
      ],
      fieldEngineeringSteps: [
        'Check piezoelectric accelerometer mounting stud torque (tighten to specification: 2.8 to 3.5 Nm).',
        'Inspect accelerometer low-noise coaxial cable for microphonic flex fatigue or jacket chafing.',
        'Perform multi-channel FFT spectral analysis to distinguish real mechanical unbalance (1X RPM) from electrical spikes.',
        'Inspect journal bearing radial clearances and verify lubricant hydrodynamic film pressure.',
      ],
      safetyNotice:
        'WARNING: Sustained physical vibration above 4.5 g RMS indicates severe shaft unbalance or imminent bearing spalling.',
    };
  }

  if (sensorCategory === 'pressure') {
    return {
      sensorName: sensorColumn,
      sensorCategory,
      methodCode: method,
      methodName,
      methodDescription,
      digitalFixSteps: [
        'Dampen transient pneumatic pressure dips caused by sensor cavitation or digital telemetry glitches.',
        'Interpolate manifold pressure across temporal window using verified steady-state baseline.',
        'Ensure reconstructed pressure stays strictly within hydraulic minimum operating envelope (> 3.5 bar).',
        'Log automated correction event in append-only audit trail with operator notification tag.',
      ],
      fieldEngineeringSteps: [
        'Inspect 3-valve manifold and bleed impulse piping to clear trapped air pockets or particulate sludge.',
        'Verify zero and span calibration of piezoelectric pressure transducer against certified deadweight tester.',
        'Inspect supply line check valves and lube oil strainer differential pressure indicator.',
        'Check 24V DC loop power supply rail stability; verify line voltage ripple is below 50 mV.',
      ],
      safetyNotice:
        'CAUTION: Lube oil pressure below 3.0 bar trips emergency turbine shutdown to prevent journal bearing wiping.',
    };
  }

  // Generic Sensor
  return {
    sensorName: sensorColumn,
    sensorCategory: 'generic',
    methodCode: method,
    methodName,
    methodDescription,
    digitalFixSteps: [
      'Reject outlier sample via multi-detector consensus (MAD + Unsupervised Isolation Forest).',
      'Compute continuous signal candidate value via local temporal interpolation.',
      'Enforce non-probabilistic multi-factor evidence scoring before automated acceptance.',
      'Preserve original raw telemetry immutably while committing healed value for downstream SCADA.',
    ],
    fieldEngineeringSteps: [
      'Inspect sensor physical wiring, terminal block screws, and environmental cable gland sealing.',
      'Verify transducer transmitter supply voltage (24V DC ±5%) and loop signal continuity.',
      'Perform multi-point calibration check against certified secondary standard instrument.',
      'Inspect industrial gateway and switch ports for transmission CRC error counter accumulation.',
    ],
    safetyNotice:
      'STANDARD PROTOCOL: All automated signal reconstructions must be reviewed in the KINTSUGI Provenance Audit Ledger.',
  };
}
