import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import './Reactor2Page.css';

interface Variable {
  id: number;
  name: string;
  value: string | null;
  data_type: string;
  group: string;
}

interface HistoryPoint {
  value: string;
  read_at: string;
}

const GROUP = 'reactor2';
const TITLE = '⚗️ Reactor 2';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
                '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Reactor2Page() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [history, setHistory] = useState<Record<number, HistoryPoint[]>>({});
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Load variables
  useEffect(() => {
    api.get<Variable[]>('/api/variables')
      .then(vars => {
        const filtered = vars.filter(v => v.group === GROUP);
        setVariables(filtered);
        setVisibleIds(new Set(filtered.map(v => v.id)));
        loadHistory(filtered);
      })
      .catch(() => setError('Error al cargar variables'));
  }, []);

  // Refresh values every 2s
  useEffect(() => {
    const i = setInterval(() => {
      api.get<Variable[]>('/api/variables')
        .then(vars => setVariables(vars.filter(v => v.group === GROUP)))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(i);
  }, []);

  const loadHistory = useCallback(async (vars?: Variable[]) => {
    const vlist = vars || variables;
    if (vlist.length === 0) return;
    try {
      const body: Record<string, unknown> = { variable_ids: vlist.map(v => v.id) };
      if (dateFrom) body.from = dateFrom + ':00';
      if (dateTo) body.to = dateTo + ':00';
      const data = await api.post<Record<string, HistoryPoint[]>>('/api/variables/history-batch', body);
      const parsed: Record<number, HistoryPoint[]> = {};
      for (const [key, pts] of Object.entries(data)) {
        parsed[Number(key)] = pts;
      }
      setHistory(parsed);
    } catch { /* ignore */ }
  }, [variables, dateFrom, dateTo]);

  const toggleVar = (id: number) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setVisibleIds(new Set(variables.map(v => v.id)));
  const selectNone = () => setVisibleIds(new Set());

  // Build chart data
  const visibleVars = variables.filter(v => visibleIds.has(v.id));
  const allPoints: { varId: number; ts: number; value: number }[] = [];
  const varData: Record<number, { name: string; pts: { ts: number; value: number }[]; min: number; max: number }> = {};

  for (const v of visibleVars) {
    const pts = (history[v.id] || [])
      .map(p => ({ ts: new Date(p.read_at).getTime(), value: parseFloat(p.value) }))
      .filter(p => !isNaN(p.value));
    if (pts.length > 0) {
      const vals = pts.map(p => p.value);
      const name = v.name.length > 30 ? v.name.slice(0, 29) + '\u2026' : v.name;
      varData[v.id] = { name, pts, min: Math.min(...vals), max: Math.max(...vals) };
      for (const p of pts) allPoints.push({ varId: v.id, ...p });
    }
  }

  const hasData = allPoints.length > 0;
  let tMin = 0, tMax = 0;
  if (hasData) {
    const times = allPoints.map(p => p.ts);
    tMin = Math.min(...times);
    tMax = Math.max(...times);
    if (tMin === tMax) { tMin -= 60000; tMax += 60000; }
  }

  // Dimensions
  const PAD = { l: 60, r: 20, t: 20, b: 55 };
  const baseW = 900, baseH = 400;
  const W = baseW * zoom, H = baseH;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const timeRange = tMax - tMin || 1;
  const viewStart = tMin - panX;
  const viewEnd = tMax - panX;
  const viewRange = viewEnd - viewStart;

  const toX = (ts: number) => PAD.l + ((ts - viewStart) / viewRange) * plotW;

  // Y-axis per variable with padding
  const yRanges: Record<number, { min: number; max: number }> = {};
  for (const [id, data] of Object.entries(varData)) {
    const pad = (data.max - data.min) * 0.15 || 1;
    yRanges[Number(id)] = { min: data.min - pad, max: data.max + pad };
  }

  const globalYMin = hasData
    ? Math.min(...Object.values(yRanges).map(r => r.min))
    : 0;
  const globalYMax = hasData
    ? Math.max(...Object.values(yRanges).map(r => r.max))
    : 100;

  // Time ticks
  const ticks: { ts: number; label: string }[] = [];
  if (hasData && viewRange > 0) {
    const tickCount = Math.max(2, Math.floor(plotW / 90));
    for (let i = 0; i <= tickCount; i++) {
      const ts = viewStart + (viewRange * i) / tickCount;
      ticks.push({ ts, label: fmtTime(new Date(ts).toISOString()) });
    }
  }

  // Handle quick date ranges
  const setRange = (hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 3600000);
    setDateFrom(toLocalISO(from));
    setDateTo(toLocalISO(now));
  };

  return (
    <div className="reactor-page">
      <header className="topbar">
        <h1>{TITLE}</h1>
        <span className="subtitle">{variables.length} variables · grupo: {GROUP}</span>
      </header>

      {/* Esquema SVG */}
      <div className="reactor-diagram">
        <svg viewBox="0 0 800 500" className="reactor-svg">
          <line x1="0" y1="140" x2="240" y2="140" stroke="#94a3b8" strokeWidth="8" />
          <line x1="240" y1="140" x2="280" y2="200" stroke="#94a3b8" strokeWidth="8" />
          <rect x="200" y="128" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="208" y1="128" x2="208" y2="118" stroke="#94a3b8" strokeWidth="3" />
          <rect x="260" y="200" width="220" height="240" rx="10" fill="#1e293b" stroke="#475569" strokeWidth="3" />
          <rect x="250" y="250" width="240" height="160" rx="8" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="6,3" />
          <rect x="355" y="150" width="30" height="40" rx="4" fill="#334155" stroke="#475569" strokeWidth="2" />
          <circle cx="370" cy="135" r="12" fill="none" stroke="#475569" strokeWidth="2" />
          <line x1="370" y1="190" x2="370" y2="360" stroke="#64748b" strokeWidth="4" />
          <line x1="340" y1="330" x2="400" y2="330" stroke="#64748b" strokeWidth="4" />
          <line x1="345" y1="360" x2="395" y2="360" stroke="#64748b" strokeWidth="4" />
          <line x1="480" y1="380" x2="580" y2="380" stroke="#94a3b8" strokeWidth="8" />
          <line x1="580" y1="380" x2="620" y2="340" stroke="#94a3b8" strokeWidth="8" />
          <line x1="620" y1="340" x2="800" y2="340" stroke="#94a3b8" strokeWidth="8" />
          <rect x="530" y="368" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="538" y1="368" x2="538" y2="358" stroke="#94a3b8" strokeWidth="3" />
          <line x1="0" y1="380" x2="200" y2="380" stroke="#94a3b8" strokeWidth="8" />
          <line x1="200" y1="380" x2="240" y2="400" stroke="#94a3b8" strokeWidth="8" />
          <line x1="240" y1="400" x2="260" y2="400" stroke="#94a3b8" strokeWidth="8" />
          <rect x="160" y="368" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="168" y1="368" x2="168" y2="358" stroke="#94a3b8" strokeWidth="3" />
          <line x1="380" y1="200" x2="380" y2="140" stroke="#94a3b8" strokeWidth="6" />
          <line x1="380" y1="140" x2="550" y2="60" stroke="#94a3b8" strokeWidth="6" />
          <line x1="550" y1="60" x2="800" y2="60" stroke="#94a3b8" strokeWidth="6" />
          <rect x="490" y="88" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="498" y1="88" x2="498" y2="78" stroke="#94a3b8" strokeWidth="3" />
          <rect x="560" y="40" width="30" height="80" rx="4" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <circle cx="300" cy="310" r="14" fill="none" stroke="#22c55e" strokeWidth="2" />
          <circle cx="440" cy="310" r="14" fill="none" stroke="#22c55e" strokeWidth="2" />
          <circle cx="370" cy="430" r="14" fill="none" stroke="#f59e0b" strokeWidth="2" />
          <circle cx="120" cy="380" r="22" fill="none" stroke="#475569" strokeWidth="3" />
          <circle cx="120" cy="380" r="6" fill="#64748b" />
        </svg>
      </div>

      {/* CHART CONTROLS */}
      <div className="chart-controls">
        <div className="controls-row">
          <div className="control-group">
            <label>📅 Desde</label>
            <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="control-group">
            <label>📅 Hasta</label>
            <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button onClick={() => loadHistory()} className="btn-apply">Aplicar</button>
          </div>
          <div className="control-group quick-btns">
            <label>Rápido</label>
            <div className="btn-row">
              <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(() => loadHistory(variables), 50); }}>Todo</button>
              <button onClick={() => setRange(1)}>1h</button>
              <button onClick={() => setRange(6)}>6h</button>
              <button onClick={() => setRange(24)}>24h</button>
              <button onClick={() => setRange(168)}>7d</button>
            </div>
          </div>
        </div>

        <div className="controls-row">
          <div className="control-group zoom-group">
            <label>🔍 Zoom</label>
            <button onClick={() => setZoom(z => Math.min(z * 1.5, 8))}>+</button>
            <span>{zoom.toFixed(1)}x</span>
            <button onClick={() => setZoom(z => Math.max(z / 1.5, 0.5))}>−</button>
            <button onClick={() => { setZoom(1); setPanX(0); }}>Reset</button>
          </div>
          <div className="control-group">
            <label>◀▶ Desplazar</label>
            <button onClick={() => setPanX(p => p - timeRange * 0.2)}>◀</button>
            <button onClick={() => setPanX(p => p + timeRange * 0.2)}>▶</button>
          </div>
        </div>
      </div>

      {/* VARIABLE TOGGLES */}
      <div className="var-toggles">
        <button onClick={selectAll} className="btn-toggle">Todos</button>
        <button onClick={selectNone} className="btn-toggle">Ninguno</button>
        {variables.map((v, i) => (
          <label key={v.id} className="var-check" style={{ color: COLORS[i % COLORS.length] }}>
            <input
              type="checkbox"
              checked={visibleIds.has(v.id)}
              onChange={() => toggleVar(v.id)}
            />
            <span className="var-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {v.name.length > 25 ? v.name.slice(0, 24) + '\u2026' : v.name}
          </label>
        ))}
      </div>

      {/* CHART */}
      <div className="reactor-chart">
        {error && <p className="error">{error}</p>}
        {!hasData ? (
          <p className="muted">Sin datos. Activa historización y lectura del PLC.</p>
        ) : (
          <div className="chart-scroll" style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}px`, minWidth: '100%' }}>
              {/* Grid horizontal per variable */}
              {visibleVars.filter(v => varData[v.id]).map((v, vi) => {
                const range = yRanges[v.id];
                const yOffset = (vi * (plotH / visibleVars.length));
                const segH = plotH / visibleVars.length;
                return (
                  <g key={`grid-${v.id}`}>
                    <line x1={PAD.l} y1={PAD.t + yOffset + segH} x2={W - PAD.r} y2={PAD.t + yOffset + segH} stroke="#1e293b" strokeWidth="1" />
                    <text x={PAD.l - 5} y={PAD.t + yOffset + segH / 2 + 4} textAnchor="end" fill="#64748b" fontSize="8">
                      {range.min.toFixed(1)}
                    </text>
                    <text x={PAD.l - 5} y={PAD.t + yOffset + 4} textAnchor="end" fill="#64748b" fontSize="8">
                      {range.max.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Time axis ticks */}
              {ticks.map((t, i) => (
                <g key={`tick-${i}`}>
                  <line x1={toX(t.ts)} y1={H - PAD.b} x2={toX(t.ts)} y2={H - PAD.b + 5} stroke="#475569" />
                  <text x={toX(t.ts)} y={H - PAD.b + 18} textAnchor="middle" fill="#64748b" fontSize="9">
                    {t.label}
                  </text>
                </g>
              ))}

              {/* Lines */}
              {visibleVars.filter(v => varData[v.id] && varData[v.id].pts.length >= 2).map((v, vi) => {
                const data = varData[v.id];
                const range = yRanges[v.id];
                const yOffset = (vi * (plotH / visibleVars.length));
                const segH = plotH / visibleVars.length;
                const color = COLORS[vi % COLORS.length];

                const toY = (val: number) => PAD.t + yOffset + segH - ((val - range.min) / (range.max - range.min)) * segH;

                const pathD = data.pts
                  .filter(p => p.ts >= viewStart && p.ts <= viewEnd)
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.ts)} ${toY(p.value)}`)
                  .join(' ');

                return (
                  <g key={`line-${v.id}`}>
                    <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
                    {/* Legend */}
                    <rect x={W - PAD.r - 180} y={PAD.t + vi * 16} width="8" height="8" fill={color} rx="1" />
                    <text x={W - PAD.r - 168} y={PAD.t + vi * 16 + 8} fill="#94a3b8" fontSize="8">
                      {data.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
