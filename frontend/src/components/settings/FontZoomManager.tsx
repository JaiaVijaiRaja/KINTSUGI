import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Type,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../common/Card';
import {
  getStoredFontZoom,
  applyFontZoom,
  DEFAULT_FONT_ZOOM,
  MIN_FONT_ZOOM,
  MAX_FONT_ZOOM,
  FONT_ZOOM_STEP,
  FONT_ZOOM_PRESETS,
} from '../../utils/fontZoom';

export const FontZoomManager: React.FC = () => {
  const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_FONT_ZOOM);
  const [showSavedFeedback, setShowSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    setZoomLevel(getStoredFontZoom());
  }, []);

  const handleUpdateZoom = (newZoom: number) => {
    const clamped = Math.max(MIN_FONT_ZOOM, Math.min(MAX_FONT_ZOOM, newZoom));
    setZoomLevel(clamped);
    applyFontZoom(clamped);

    setShowSavedFeedback(true);
    const timer = setTimeout(() => setShowSavedFeedback(false), 2000);
    return () => clearTimeout(timer);
  };

  const handleZoomIn = () => {
    handleUpdateZoom(zoomLevel + FONT_ZOOM_STEP);
  };

  const handleZoomOut = () => {
    handleUpdateZoom(zoomLevel - FONT_ZOOM_STEP);
  };

  const handleReset = () => {
    handleUpdateZoom(DEFAULT_FONT_ZOOM);
  };

  // Base pixel calculation (assuming browser standard 16px at 100%)
  const calculatedBasePx = ((16 * zoomLevel) / 100).toFixed(1);

  return (
    <Card className="border-[#EBE7E1] shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
      <CardHeader
        title="Display Zoom & Font Size Controls"
        subtitle="Zoom in or zoom out to increase or decrease global application font size for optimal readability."
        icon={Type}
        badge={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-[#EE602C] border border-orange-200 shadow-2xs">
              {zoomLevel}% Zoom Scale
            </span>
            {showSavedFeedback && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 animate-fadeIn">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Saved</span>
              </span>
            )}
          </div>
        }
      />
      <CardContent className="space-y-6">
        {/* Main Stepper Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#FAF8F5] border border-[#EBE7E1]">
          <div className="space-y-0.5 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className="text-sm font-bold text-stone-900">
                Application Font Scaling
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-200/70 text-stone-700 font-semibold">
                1.0rem = {calculatedBasePx}px
              </span>
            </div>
            <p className="text-xs text-stone-500 font-sans">
              Increases or decreases all dashboard labels, tables, telemetry readouts, and menus.
            </p>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Zoom Out Button */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= MIN_FONT_ZOOM}
              title="Zoom Out — Decrease font size (-5%)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed text-stone-800 text-xs font-bold border border-stone-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <ZoomOut className="w-4 h-4 text-stone-600" />
              <span>Zoom Out</span>
            </button>

            {/* Current Level Pill */}
            <div className="px-4 py-1.5 rounded-xl bg-white border border-[#E0DCD3] shadow-2xs text-center min-w-[76px]">
              <span className="text-base font-bold font-mono text-stone-900 block leading-tight">
                {zoomLevel}%
              </span>
              <span className="text-[9px] font-mono text-stone-500 uppercase tracking-wider block">
                {zoomLevel === 100
                  ? 'Default'
                  : zoomLevel > 100
                  ? `+${zoomLevel - 100}%`
                  : `-${100 - zoomLevel}%`}
              </span>
            </div>

            {/* Zoom In Button */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= MAX_FONT_ZOOM}
              title="Zoom In — Increase font size (+5%)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EE602C] hover:bg-[#D95322] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs shadow-[#EE602C]/25 active:scale-95 transition-all cursor-pointer"
            >
              <ZoomIn className="w-4 h-4 text-white" />
              <span>Zoom In</span>
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              disabled={zoomLevel === DEFAULT_FONT_ZOOM}
              title="Reset font zoom to default 100%"
              className="p-2 rounded-xl bg-white hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed text-stone-600 hover:text-stone-900 border border-stone-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Continuous Range Slider */}
        <div className="space-y-2 p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-stone-600 font-semibold flex items-center gap-1.5">
              <span>Fine Adjustment Slider:</span>
              <span className="text-stone-900 font-bold">{zoomLevel}%</span>
            </span>
            <span className="text-stone-500 text-[11px]">
              Range: {MIN_FONT_ZOOM}% to {MAX_FONT_ZOOM}%
            </span>
          </div>

          <div className="relative pt-1 pb-2">
            <input
              type="range"
              min={MIN_FONT_ZOOM}
              max={MAX_FONT_ZOOM}
              step={FONT_ZOOM_STEP}
              value={zoomLevel}
              onChange={(e) => handleUpdateZoom(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#EE602C]"
            />
            {/* Range markers */}
            <div className="flex justify-between text-[10px] font-mono text-stone-400 mt-1">
              <span>75% (Min)</span>
              <span className="text-stone-600 font-semibold">100% (Standard)</span>
              <span>125%</span>
              <span>150% (Max)</span>
            </div>
          </div>
        </div>

        {/* Preset Sizing Pills */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono uppercase text-stone-600 font-bold block">
            Quick Zoom Presets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {FONT_ZOOM_PRESETS.map((preset) => {
              const isActive = zoomLevel === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleUpdateZoom(preset.value)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    isActive
                      ? 'bg-[#EE602C] text-white border-[#EE602C] shadow-xs shadow-[#EE602C]/25'
                      : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300 shadow-2xs'
                  }`}
                >
                  <span
                    className={`text-xs font-bold font-mono ${
                      isActive ? 'text-white' : 'text-stone-900'
                    }`}
                  >
                    {preset.label}
                  </span>
                  <span
                    className={`text-[10px] ${
                      isActive ? 'text-white/80' : 'text-stone-500'
                    }`}
                  >
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Live Font Preview Showcase */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FAF8F5] via-white to-orange-50/20 border border-[#EBE7E1] space-y-3 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#EBE7E1]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#EE602C]" />
              <span className="text-xs font-bold text-stone-900 uppercase font-mono tracking-wider">
                Live Typography Preview
              </span>
            </div>
            <span className="text-[10px] font-mono text-stone-500">
              Renders with current scale ({zoomLevel}%)
            </span>
          </div>

          <div className="space-y-2">
            <h4 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">
              Turbine Temperature Telemetry & Multi-Detector Consensus
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed font-sans">
              Transient outlier detection actively validates streaming sensors with zero score fabrication.
              When communication gaps exceed the safety threshold, mandatory abstention is enforced.
            </p>

            {/* Readout Pills */}
            <div className="flex items-center gap-2 flex-wrap pt-1 font-mono text-xs">
              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                Original: 118.13 °C (+76.7%)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                Restored: 52.35 °C (Kalman)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-300 font-bold">
                Pass (MAD 3.5σ)
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
