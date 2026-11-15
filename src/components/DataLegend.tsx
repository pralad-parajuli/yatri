import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import { LayerRuntimeState, MarsLayerConfig } from '../types/mars';

interface DataLegendProps {
  layers: MarsLayerConfig[];
  layerStates: Record<string, LayerRuntimeState>;
  onClose?: () => void;
}

export default function DataLegend({ layers, layerStates, onClose }: DataLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  const activeWithLegend = layers.filter(
    (l) => layerStates[l.id]?.enabled && l.legend && l.legend.length > 0
  );

  return (
    <div className="pointer-events-auto w-64 overflow-hidden rounded-lg border border-amber-500/25 bg-[#0B0F17]/95 text-xs text-slate-200 shadow-2xl">
      <div className="flex items-center justify-between border-b border-amber-500/20 bg-[#080B11] px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-1.5 text-left font-display font-semibold tracking-wide text-amber-300 hover:text-amber-200"
        >
          <Info className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px]">Survival Hazard & Layer Key</span>
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Hide Legend"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="max-h-64 space-y-3 overflow-y-auto p-3">
          {activeWithLegend.length === 0 ? (
            <div className="text-[11px] text-slate-400">
              Optical basemaps active. Enable MOLA, Slope Hazard, CRISM, or TES Dust in Survival Overlays to view hazard keys.
            </div>
          ) : (
            activeWithLegend.map((layer) => (
              <div key={layer.id}>
                <div className="mb-1 text-[11px] font-semibold text-white">
                  {layer.shortName}
                </div>
                <div className="space-y-1">
                  {layer.legend!.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[10px] text-slate-300">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-xs border border-white/20"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="leading-tight">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="border-t border-slate-800 pt-2 text-[10px] leading-snug text-slate-400">
            Mars 2000 IAU Sphere · NASA/USGS Survival Reference · Not flight-certified.
          </div>
        </div>
      )}
    </div>
  );
}
