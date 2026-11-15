import { X } from 'lucide-react';
import { AppSettings } from '../types/mars';

interface SettingsModalProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-amber-500/30 bg-[#0B0F17] text-xs text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-amber-500/20 bg-[#080B11] px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
              Survival Instrumentation
            </div>
            <h2 className="font-display text-sm font-semibold text-white">
              Datum & Hazard Threshold Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block font-medium text-slate-300">Coordinate Format</label>
            <div className="grid grid-cols-2 gap-2">
              {(['decimal', 'dms'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onChange({ ...settings, coordinateFormat: fmt })}
                  className={`rounded-md border px-3 py-1.5 font-medium transition-colors ${
                    settings.coordinateFormat === fmt
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700/80 bg-[#111824] text-slate-400 hover:text-white'
                  }`}
                >
                  {fmt === 'decimal' ? 'Decimal Degrees' : 'DMS (Deg Min Sec)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-slate-300">Longitude Convention</label>
            <div className="grid grid-cols-2 gap-2">
              {(['signed', 'east360'] as const).map((conv) => (
                <button
                  key={conv}
                  type="button"
                  onClick={() => onChange({ ...settings, longitudeConvention: conv })}
                  className={`rounded-md border px-3 py-1.5 font-medium transition-colors ${
                    settings.longitudeConvention === conv
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700/80 bg-[#111824] text-slate-400 hover:text-white'
                  }`}
                >
                  {conv === 'signed' ? 'Signed (-180° to +180°)' : 'Planetocentric (0°–360°E)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-slate-300">
              <span>Moderate Slope Warning Threshold</span>
              <span className="font-mono text-amber-300 tabular-nums">{settings.slopeWarningDeg}°</span>
            </div>
            <input
              type="range"
              min={3}
              max={12}
              step={1}
              value={settings.slopeWarningDeg}
              onChange={(e) =>
                onChange({ ...settings, slopeWarningDeg: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-slate-300">
              <span>Critical Slope Hazard Threshold</span>
              <span className="font-mono text-rose-400 tabular-nums">{settings.slopeDangerDeg}°</span>
            </div>
            <input
              type="range"
              min={10}
              max={25}
              step={1}
              value={settings.slopeDangerDeg}
              onChange={(e) =>
                onChange({ ...settings, slopeDangerDeg: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-md border border-slate-700/80 bg-[#111824] px-3 py-2">
            <span>Render NASA-3D-Resources Spacecraft & Rover Models</span>
            <input
              type="checkbox"
              checked={settings.showNasaModels}
              onChange={(e) => onChange({ ...settings, showNasaModels: e.target.checked })}
              className="accent-amber-500"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-md border border-slate-700/80 bg-[#111824] px-3 py-2">
            <span>Enable 3D Jezero Terrain Relief Model</span>
            <input
              type="checkbox"
              checked={settings.enable3dTerrain}
              onChange={(e) => onChange({ ...settings, enable3dTerrain: e.target.checked })}
              className="accent-amber-500"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-md border border-slate-700/80 bg-[#111824] px-3 py-2">
            <span>Show Mars Coordinate Graticule (30° Grid)</span>
            <input
              type="checkbox"
              checked={settings.showGraticule}
              onChange={(e) => onChange({ ...settings, showGraticule: e.target.checked })}
              className="accent-amber-500"
            />
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-800 bg-[#080B11] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-amber-500 px-5 py-1.5 font-semibold text-slate-950 hover:bg-amber-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
