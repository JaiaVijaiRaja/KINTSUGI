import React, { useState, useEffect } from 'react';
import {
  Thermometer,
  Activity,
  Sun,
  Gauge,
  Droplets,
  SlidersHorizontal,
  Plus,
  Trash2,
  Save,
  Download,
  RotateCcw,
  CheckCircle2,
  Sliders,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { thresholdService } from '../../services/thresholdService';
import type {
  UnitThreshold,
  ControlAction,
  UnitCategory,
  ThresholdPolicyState,
} from '../../types/threshold';

const CONTROL_ACTION_OPTIONS: { value: ControlAction; label: string; badge: string }[] = [
  {
    value: 'ALARM_ONLY',
    label: 'Alarm & Operator Shift Report Only',
    badge: 'Annunciation',
  },
  {
    value: 'COOLING_PUMP_ENGAGE',
    label: 'Auxiliary Coolant Pump Engage + Anomaly Flag',
    badge: 'Thermal Mitigation',
  },
  {
    value: 'DE_RATE_POWER',
    label: 'Emergency Power De-Rate & Machinery Trip',
    badge: 'Interlock Shutdown',
  },
  {
    value: 'AUTO_ISOLATION',
    label: 'Trip Solenoid Valve & Pressure Relief Bypass',
    badge: 'Pressure Relief',
  },
  {
    value: 'REDUNDANT_SENSOR_FAILOVER',
    label: 'Switch to Redundant Sensor & Trigger Auto-Heal',
    badge: 'Self-Healing',
  },
  {
    value: 'AUDIT_LEDGER_LOG',
    label: 'Append to Immutable Cryptographic Audit Ledger',
    badge: 'Audit Record',
  },
];

export const ThresholdsManager: React.FC = () => {
  const [policyState, setPolicyState] = useState<ThresholdPolicyState>(() =>
    thresholdService.getStoredPolicy()
  );
  const [thresholds, setThresholds] = useState<UnitThreshold[]>(policyState.thresholds);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  // Form state for adding custom unit threshold
  const [newCustom, setNewCustom] = useState<{
    name: string;
    unit: string;
    category: UnitCategory;
    nominalValue: number;
    criticalLow: number;
    warningLow: number;
    warningHigh: number;
    criticalHigh: number;
    controlAction: ControlAction;
    standardReference: string;
  }>({
    name: '',
    unit: '',
    category: 'custom',
    nominalValue: 50,
    criticalLow: 0,
    warningLow: 20,
    warningHigh: 80,
    criticalHigh: 100,
    controlAction: 'ALARM_ONLY',
    standardReference: 'Internal Plant SOP',
  });

  useEffect(() => {
    setThresholds(policyState.thresholds);
  }, [policyState]);

  const updateThreshold = (id: string, updates: Partial<UnitThreshold>) => {
    setThresholds((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item))
    );
    setHasUnsavedChanges(true);
    setSaveSuccessMsg(null);
  };

  const handleSave = () => {
    const updated = thresholdService.savePolicy(thresholds, 'operator_local');
    setPolicyState(updated);
    setHasUnsavedChanges(false);
    setSaveSuccessMsg(`Operational thresholds saved successfully at ${new Date().toLocaleTimeString()}!`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  const handleReset = () => {
    if (window.confirm('Reset all threshold values to industrial baseline presets (ISO, ASME, API, OSHA)?')) {
      const resetState = thresholdService.resetToDefaults();
      setPolicyState(resetState);
      setThresholds(resetState.thresholds);
      setHasUnsavedChanges(false);
      setSaveSuccessMsg('Restored all thresholds to industrial baseline standards.');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  };

  const handleExport = () => {
    thresholdService.exportPolicyJson({
      ...policyState,
      thresholds,
      lastSavedAt: new Date().toISOString(),
    });
  };

  const handleDeleteUnit = (id: string) => {
    setThresholds((prev) => prev.filter((t) => t.id !== id));
    setHasUnsavedChanges(true);
  };

  const handleAddCustomUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustom.name.trim() || !newCustom.unit.trim()) {
      alert('Please provide a metric name and unit symbol.');
      return;
    }

    const newUnit: UnitThreshold = {
      id: `custom_${Date.now()}`,
      name: newCustom.name.trim(),
      category: newCustom.category,
      unit: newCustom.unit.trim(),
      nominalValue: Number(newCustom.nominalValue),
      criticalLow: Number(newCustom.criticalLow),
      warningLow: Number(newCustom.warningLow),
      warningHigh: Number(newCustom.warningHigh),
      criticalHigh: Number(newCustom.criticalHigh),
      controlAction: newCustom.controlAction,
      includeInReports: true,
      humanOverrideEnabled: true,
      standardReference: newCustom.standardReference.trim() || 'Custom Plant Limit',
      description: `Human-configured operational boundary for ${newCustom.name}.`,
      updatedAt: new Date().toISOString(),
      updatedBy: 'operator_local',
    };

    setThresholds((prev) => [...prev, newUnit]);
    setHasUnsavedChanges(true);
    setIsAddingCustom(false);
    setNewCustom({
      name: '',
      unit: '',
      category: 'custom',
      nominalValue: 50,
      criticalLow: 0,
      warningLow: 20,
      warningHigh: 80,
      criticalHigh: 100,
      controlAction: 'ALARM_ONLY',
      standardReference: 'Internal Plant SOP',
    });
    setSaveSuccessMsg(`Added new threshold unit "${newUnit.name}". Remember to click "Save Thresholds"!`);
  };

  const getCategoryIcon = (cat: UnitCategory) => {
    switch (cat) {
      case 'temperature':
        return <Thermometer className="w-4 h-4 text-rose-600" />;
      case 'vibration':
        return <Activity className="w-4 h-4 text-indigo-600" />;
      case 'light':
        return <Sun className="w-4 h-4 text-amber-500" />;
      case 'pressure':
        return <Gauge className="w-4 h-4 text-sky-600" />;
      case 'flow':
        return <Droplets className="w-4 h-4 text-teal-600" />;
      default:
        return <SlidersHorizontal className="w-4 h-4 text-stone-600" />;
    }
  };

  const filteredThresholds =
    activeCategoryFilter === 'ALL'
      ? thresholds
      : thresholds.filter((t) => t.category === activeCategoryFilter);

  return (
    <Card variant="default" className="border-stone-300">
      <CardHeader
        title="Human-Managed Operational Thresholds & Control Limits"
        subtitle="Supervisory boundary values for multi-unit telemetry (Temperature, Vibrations, Light, Pressure, Flow Rate) used in diagnostic reporting and automated control actions."
        icon={Sliders}
        badge={
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
                Unsaved Changes
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Human Control Active
            </span>
          </div>
        }
      />
      <CardContent className="space-y-6">
        {/* Success Alert Banner */}
        {saveSuccessMsg && (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
            <button
              onClick={() => setSaveSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-50 border border-stone-200">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-mono text-stone-500 uppercase mr-1">Filter Unit:</span>
            {[
              { id: 'ALL', label: `All Units (${thresholds.length})` },
              { id: 'temperature', label: 'Temperature' },
              { id: 'vibration', label: 'Vibrations' },
              { id: 'light', label: 'Light' },
              { id: 'pressure', label: 'Pressure' },
              { id: 'flow', label: 'Flow Rate' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveCategoryFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeCategoryFilter === f.id
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={handleReset}
              title="Reset all thresholds to ISO, ASME, and OSHA industrial presets"
            >
              Reset Standards
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={handleExport}
              title="Download human threshold specification JSON for reporting & SCADA"
            >
              Export Policy
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddingCustom((v) => !v)}
            >
              {isAddingCustom ? 'Cancel Custom' : 'Add Custom Unit'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Save}
              onClick={handleSave}
              className={hasUnsavedChanges ? 'ring-2 ring-[#EE602C]/40 animate-bounce' : ''}
            >
              Save Thresholds
            </Button>
          </div>
        </div>

        {/* Add Custom Unit Slide-Out / Card Form */}
        {isAddingCustom && (
          <form
            onSubmit={handleAddCustomUnit}
            className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200/90 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                  Configure New Telemetry Unit Threshold
                </span>
              </div>
              <span className="text-[11px] text-stone-500 font-mono">
                Operator Managed Custom Limit
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Metric / Channel Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acoustic Noise Level"
                  value={newCustom.name}
                  onChange={(e) => setNewCustom({ ...newCustom, name: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Engineering Unit Symbol *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dB, RPM, ppm, m/s²"
                  value={newCustom.unit}
                  onChange={(e) => setNewCustom({ ...newCustom, unit: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Category Classification
                </label>
                <select
                  value={newCustom.category}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, category: e.target.value as UnitCategory })
                  }
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                >
                  <option value="custom">Custom Industrial Unit</option>
                  <option value="temperature">Temperature Domain</option>
                  <option value="vibration">Vibration & Kinetic</option>
                  <option value="light">Optical & Illuminance</option>
                  <option value="pressure">Pressure & Vacuum</option>
                  <option value="flow">Fluid / Mass Flow</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-rose-700 block mb-1">
                  Critical Low (Trip)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCustom.criticalLow}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, criticalLow: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-rose-300 rounded-lg px-2.5 py-1 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-amber-700 block mb-1">
                  Warning Low
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCustom.warningLow}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, warningLow: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-emerald-700 block mb-1">
                  Nominal Target
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCustom.nominalValue}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, nominalValue: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-amber-700 block mb-1">
                  Warning High
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCustom.warningHigh}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, warningHigh: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-rose-700 block mb-1">
                  Critical High (Trip)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCustom.criticalHigh}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, criticalHigh: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-rose-300 rounded-lg px-2.5 py-1 text-xs text-stone-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Deterministic Control Action on Breach
                </label>
                <select
                  value={newCustom.controlAction}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, controlAction: e.target.value as ControlAction })
                  }
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                >
                  {CONTROL_ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Industry Standard / Compliance Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. ISO 1999 Acoustics or Custom SOP"
                  value={newCustom.standardReference}
                  onChange={(e) =>
                    setNewCustom({ ...newCustom, standardReference: e.target.value })
                  }
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingCustom(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" icon={Plus}>
                Register Metric Threshold
              </Button>
            </div>
          </form>
        )}

        {/* Threshold Units Grid */}
        <div className="space-y-4">
          {filteredThresholds.map((unit) => {
            const isCustom = unit.id.startsWith('custom_');
            return (
              <div
                key={unit.id}
                className="p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs hover:border-stone-300 transition-all space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200/80 flex items-center justify-center shrink-0">
                      {getCategoryIcon(unit.category)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-900">{unit.name}</span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                          {unit.unit}
                        </span>
                        {unit.standardReference && (
                          <span className="text-[10px] font-mono text-stone-500 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-full">
                            {unit.standardReference}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5 max-w-2xl">
                        {unit.description || 'Configured industrial telemetry bounds.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Report and Override indicators */}
                    <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={unit.includeInReports}
                        onChange={(e) =>
                          updateThreshold(unit.id, { includeInReports: e.target.checked })
                        }
                        className="rounded border-stone-300 text-[#EE602C] focus:ring-[#EE602C]"
                      />
                      <span>Include in Report</span>
                    </label>

                    {isCustom && (
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete custom unit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Visual Range Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-stone-500">
                    <span className="text-rose-700 font-medium">Trip &lt; {unit.criticalLow}</span>
                    <span className="text-amber-700 font-medium">Warn &lt; {unit.warningLow}</span>
                    <span className="text-emerald-700 font-bold">
                      Nominal: {unit.nominalValue} {unit.unit}
                    </span>
                    <span className="text-amber-700 font-medium">Warn &gt; {unit.warningHigh}</span>
                    <span className="text-rose-700 font-medium">Trip &gt; {unit.criticalHigh}</span>
                  </div>

                  {/* Multi-segmented Visual Bar */}
                  <div className="h-3 w-full rounded-full bg-stone-100 border border-stone-200 flex overflow-hidden">
                    <div
                      className="bg-rose-400/80 h-full"
                      style={{ width: '12%' }}
                      title={`Critical Low Trip Zone (< ${unit.criticalLow} ${unit.unit})`}
                    />
                    <div
                      className="bg-amber-300/80 h-full"
                      style={{ width: '15%' }}
                      title={`Warning Low Caution Zone (${unit.criticalLow} - ${unit.warningLow} ${unit.unit})`}
                    />
                    <div
                      className="bg-emerald-400/90 h-full flex-1 relative flex items-center justify-center"
                      title={`Nominal Safe Band (${unit.warningLow} - ${unit.warningHigh} ${unit.unit})`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-950 shadow-xs" />
                    </div>
                    <div
                      className="bg-amber-300/80 h-full"
                      style={{ width: '15%' }}
                      title={`Warning High Caution Zone (${unit.warningHigh} - ${unit.criticalHigh} ${unit.unit})`}
                    />
                    <div
                      className="bg-rose-400/80 h-full"
                      style={{ width: '12%' }}
                      title={`Critical High Trip Zone (> ${unit.criticalHigh} ${unit.unit})`}
                    />
                  </div>
                </div>

                {/* Editable Bounds and Control Policy Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-1 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-rose-700 block mb-1">
                      Critical Low ({unit.unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={unit.criticalLow}
                      onChange={(e) =>
                        updateThreshold(unit.id, { criticalLow: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 font-mono font-medium focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-amber-700 block mb-1">
                      Warning Low ({unit.unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={unit.warningLow}
                      onChange={(e) =>
                        updateThreshold(unit.id, { warningLow: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 font-mono font-medium focus:border-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-emerald-800 block mb-1">
                      Target Nominal ({unit.unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={unit.nominalValue}
                      onChange={(e) =>
                        updateThreshold(unit.id, { nominalValue: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 font-mono font-medium focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-amber-700 block mb-1">
                      Warning High ({unit.unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={unit.warningHigh}
                      onChange={(e) =>
                        updateThreshold(unit.id, { warningHigh: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 font-mono font-medium focus:border-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-rose-700 block mb-1">
                      Critical High ({unit.unit})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={unit.criticalHigh}
                      onChange={(e) =>
                        updateThreshold(unit.id, { criticalHigh: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 font-mono font-medium focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                      Control Action
                    </label>
                    <select
                      value={unit.controlAction}
                      onChange={(e) =>
                        updateThreshold(unit.id, { controlAction: e.target.value as ControlAction })
                      }
                      className="w-full bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-[11px] text-stone-900 font-medium focus:border-[#EE602C] focus:outline-hidden"
                    >
                      {CONTROL_ACTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.badge}: {opt.label.split('+')[0]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Footer Status */}
                <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono pt-1">
                  <span>Last Human Audit: {new Date(unit.updatedAt).toLocaleDateString()} by {unit.updatedBy}</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                    <Shield className="w-3 h-3" />
                    Enforced in Real-Time Anomaly Scoring & Reports
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Informational Guidance Box */}
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-600 flex items-start gap-3">
          <FileSpreadsheet className="w-4 h-4 text-[#EE602C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-stone-800">
              Human Operator Authority & Reporting Compliance
            </span>
            <p className="text-stone-500 leading-relaxed text-[11px]">
              Threshold values configured here take precedence in the Diagnostic Report exports, plant shift handovers, and multi-detector rule checks. When sensor values exceed warning or critical boundaries, the system automatically triggers the selected supervisory control action and appends the event to the cryptographic audit trail.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
