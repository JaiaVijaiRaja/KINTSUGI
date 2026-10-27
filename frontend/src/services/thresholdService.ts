import type { UnitThreshold, ThresholdPolicyState } from '../types/threshold';

export const DEFAULT_THRESHOLDS: UnitThreshold[] = [
  {
    id: 'unit_temp',
    name: 'Turbine & Core Temperature',
    category: 'temperature',
    unit: '°C',
    nominalValue: 72.0,
    criticalLow: 10.0,
    warningLow: 25.0,
    warningHigh: 88.0,
    criticalHigh: 105.0,
    controlAction: 'COOLING_PUMP_ENGAGE',
    includeInReports: true,
    humanOverrideEnabled: true,
    standardReference: 'API 670 Machinery Thermal Protection',
    description: 'Monitors thermal core boundaries, triggers secondary coolant valves before metallurgy degradation.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'operator_local',
  },
  {
    id: 'unit_vib',
    name: 'Shaft & Bearing Vibrations',
    category: 'vibration',
    unit: 'mm/s',
    nominalValue: 1.8,
    criticalLow: 0.0,
    warningLow: 0.0,
    warningHigh: 4.5,
    criticalHigh: 7.1,
    controlAction: 'DE_RATE_POWER',
    includeInReports: true,
    humanOverrideEnabled: true,
    standardReference: 'ISO 10816-3 Zone C/D Limits',
    description: 'Rotational kinetic velocity; trips breaker on unbalance, cavitation or bearing cage fracture.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'operator_local',
  },
  {
    id: 'unit_light',
    name: 'Enclosure Optical Luminosity',
    category: 'light',
    unit: 'lux',
    nominalValue: 450.0,
    criticalLow: 50.0,
    warningLow: 150.0,
    warningHigh: 900.0,
    criticalHigh: 2000.0,
    controlAction: 'ALARM_ONLY',
    includeInReports: true,
    humanOverrideEnabled: true,
    standardReference: 'OSHA 1926.56 & IEC 62471',
    description: 'Detects optical occlusion, blackout hazards, or electric arc flashes inside switchgear cabinets.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'operator_local',
  },
  {
    id: 'unit_press',
    name: 'Hydraulic Manifold Pressure',
    category: 'pressure',
    unit: 'psi',
    nominalValue: 85.0,
    criticalLow: 30.0,
    warningLow: 45.0,
    warningHigh: 110.0,
    criticalHigh: 135.0,
    controlAction: 'AUTO_ISOLATION',
    includeInReports: true,
    humanOverrideEnabled: true,
    standardReference: 'ASME Section VIII Div 1',
    description: 'Supervises hydraulic actuator head; auto-isolates relief loop upon line breach or overpressure.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'operator_local',
  },
  {
    id: 'unit_flow',
    name: 'Coolant Circulation Flow Rate',
    category: 'flow',
    unit: 'L/min',
    nominalValue: 32.0,
    criticalLow: 8.0,
    warningLow: 18.0,
    warningHigh: 48.0,
    criticalHigh: 62.0,
    controlAction: 'REDUNDANT_SENSOR_FAILOVER',
    includeInReports: true,
    humanOverrideEnabled: true,
    standardReference: 'ISO 5167 Differential Metering',
    description: 'Liquid displacement rate; initiates redundant sensor crossover and auto-reconstruction on blockage.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'operator_local',
  },
];

const STORAGE_KEY = 'kintsugi_operational_thresholds';

export const thresholdService = {
  getStoredPolicy(): ThresholdPolicyState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ThresholdPolicyState;
        if (parsed && Array.isArray(parsed.thresholds) && parsed.thresholds.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback on corrupt JSON
    }

    const defaultState: ThresholdPolicyState = {
      version: '1.2.0',
      operator: 'operator_local',
      lastSavedAt: new Date().toISOString(),
      thresholds: DEFAULT_THRESHOLDS,
    };
    return defaultState;
  },

  savePolicy(thresholds: UnitThreshold[], operator: string = 'operator_local'): ThresholdPolicyState {
    const updatedState: ThresholdPolicyState = {
      version: '1.2.0',
      operator,
      lastSavedAt: new Date().toISOString(),
      thresholds,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState));
    } catch (err) {
      console.error('Failed to persist thresholds to localStorage', err);
    }
    return updatedState;
  },

  resetToDefaults(): ThresholdPolicyState {
    const defaultState: ThresholdPolicyState = {
      version: '1.2.0',
      operator: 'operator_local',
      lastSavedAt: new Date().toISOString(),
      thresholds: DEFAULT_THRESHOLDS.map((t) => ({
        ...t,
        updatedAt: new Date().toISOString(),
      })),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    } catch (err) {
      console.error('Failed to reset thresholds in localStorage', err);
    }
    return defaultState;
  },

  exportPolicyJson(state: ThresholdPolicyState): void {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kintsugi_thresholds_control_policy_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
