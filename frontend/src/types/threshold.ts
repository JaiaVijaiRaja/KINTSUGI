export type ControlAction =
  | 'ALARM_ONLY'
  | 'COOLING_PUMP_ENGAGE'
  | 'DE_RATE_POWER'
  | 'AUTO_ISOLATION'
  | 'REDUNDANT_SENSOR_FAILOVER'
  | 'AUDIT_LEDGER_LOG';

export type UnitCategory =
  | 'temperature'
  | 'vibration'
  | 'light'
  | 'pressure'
  | 'flow'
  | 'custom';

export interface UnitThreshold {
  id: string;
  name: string;
  category: UnitCategory;
  unit: string;
  nominalValue: number;
  criticalLow: number;
  warningLow: number;
  warningHigh: number;
  criticalHigh: number;
  controlAction: ControlAction;
  includeInReports: boolean;
  humanOverrideEnabled: boolean;
  standardReference?: string;
  description?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ThresholdPolicyState {
  version: string;
  operator: string;
  lastSavedAt: string;
  thresholds: UnitThreshold[];
}
