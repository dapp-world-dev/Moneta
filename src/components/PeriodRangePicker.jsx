import React from 'react';
import { Calendar } from 'lucide-react';
import { PERIOD_PRESETS, detectPreset, presetRange } from '../utils';

export function PeriodRangePicker({ range, onChange }) {
  const activePreset = detectPreset(range);

  function handlePresetChange(event) {
    const value = event.target.value;
    if (value === 'custom') return;
    onChange(presetRange(value));
  }

  function handleFromChange(event) {
    const nextFrom = event.target.value;
    if (!nextFrom) return;
    onChange({
      from: nextFrom,
      to: nextFrom > range.to ? nextFrom : range.to,
    });
  }

  function handleToChange(event) {
    const nextTo = event.target.value;
    if (!nextTo) return;
    onChange({
      from: nextTo < range.from ? nextTo : range.from,
      to: nextTo,
    });
  }

  return (
    <div className="range-picker">
      <div className="range-picker-label">
        <Calendar size={12} />
        <span>Periode</span>
      </div>
      <div className="range-picker-controls">
        <select
          className="range-preset"
          value={activePreset}
          onChange={handlePresetChange}
          aria-label="Preset periode"
        >
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
          {activePreset === 'custom' && <option value="custom">Kustom</option>}
        </select>
        <div className="range-dates">
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={handleFromChange}
            aria-label="Tanggal mulai"
          />
          <span className="range-sep">–</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={handleToChange}
            aria-label="Tanggal akhir"
          />
        </div>
      </div>
    </div>
  );
}
