import { useEffect, useState } from 'react';
import { api } from '../api';
import './Reactor2Page.css';

interface Variable {
  id: number;
  name: string;
  value: string | null;
  data_type: string;
  connection_name: string;
  group: string;
}

interface HistoryPoint {
  value: string;
  read_at: string;
}

const GROUP = 'reactor2';
const TITLE = '⚗️ Reactor 2';

export default function Reactor2Page() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [history, setHistory] = useState<Record<number, HistoryPoint[]>>({});
  const [error, setError] = useState('');

  // Load variables filtered by group
  useEffect(() => {
    api.get<Variable[]>('/api/variables')
      .then(vars => {
        const filtered = vars.filter(v => v.group === GROUP);
        setVariables(filtered);
        loadHistory(filtered);
      })
      .catch(() => setError('Error al cargar variables'));
  }, []);

  // Auto-refresh cada 2s
  useEffect(() => {
    const interval = setInterval(() => {
      api.get<Variable[]>('/api/variables')
        .then(vars => {
          const filtered = vars.filter(v => v.group === GROUP);
          setVariables(filtered);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  async function loadHistory(vars: Variable[]) {
    if (vars.length === 0) return;
    try {
      const ids = vars.map(v => v.id);
      const data = await api.post<Record<string, HistoryPoint[]>>('/api/variables/history-batch', { variable_ids: ids });
      // Keys are strings from JSON
      const parsed: Record<number, HistoryPoint[]> = {};
      for (const [key, points] of Object.entries(data)) {
        parsed[Number(key)] = points;
      }
      setHistory(parsed);
    } catch {
      // Silently ignore
    }
  }

  const getNumeric = (v: Variable) => {
    if (v.value === null || v.value === undefined) return null;
    const n = parseFloat(v.value);
    return isNaN(n) ? null : n;
  };

  // Chart dimensions
  const CHART_W = 700;
  const CHART_H = 220;
  const PAD_L = 50;
  const PAD_R = 10;
  const PAD_T = 15;
  const PAD_B = 30;
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  // Build chart data: all points across all variables, find min/max
  const allPoints: { varId: number; varName: string; value: number; ts: number }[] = [];
  for (const v of variables) {
    const pts = history[v.id] || [];
    for (const p of pts) {
      const val = parseFloat(p.value);
      if (!isNaN(val)) {
        allPoints.push({ varId: v.id, varName: v.name, value: val, ts: new Date(p.read_at).getTime() });
      }
    }
  }

  const hasData = allPoints.length > 0;
  let tMin = 0, tMax = 0, vMin = 0, vMax = 100;
  if (hasData) {
    const times = allPoints.map(p => p.ts);
    const vals = allPoints.map(p => p.value);
    tMin = Math.min(...times);
    tMax = Math.max(...times);
    vMin = Math.min(...vals);
    vMax = Math.max(...vals);
    const pad = (vMax - vMin) * 0.1 || 1;
    vMin -= pad;
    vMax += pad;
  }

  // Colors
  const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
                  '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

  // Group points by variable
  const pointsByVar: Record<number, { name: string; pts: { x: number; y: number }[] }> = {};
  for (const v of variables) {
    const pts = (history[v.id] || [])
      .map(p => ({ val: parseFloat(p.value), ts: new Date(p.read_at).getTime() }))
      .filter(p => !isNaN(p.val));

    if (pts.length > 0 && tMax > tMin) {
      pointsByVar[v.id] = {
        name: v.name.length > 25 ? v.name.slice(0, 24) + '…' : v.name,
        pts: pts.map(p => ({
          x: PAD_L + ((p.ts - tMin) / (tMax - tMin)) * plotW,
          y: PAD_T + plotH - ((p.val - vMin) / (vMax - vMin)) * plotH,
        })),
      };
    }
  }

  return (
    <div className="reactor-page">
      <header className="topbar">
        <h1>{TITLE}</h1>
        {variables.length > 0 && (
          <span className="subtitle">{variables.length} variables · grupo: {GROUP}</span>
        )}
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

      {/* Gráfica de líneas con historial */}
      <div className="reactor-chart">
        <h3>📈 Historial de variables</h3>
        {error && <p className="error">{error}</p>}

        {!hasData ? (
          <p className="muted">Sin datos históricos. Activa la historización en Variables.</p>
        ) : (
          <div className="chart-container">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="chart-svg">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                const y = PAD_T + plotH * (1 - frac);
                return (
                  <g key={frac}>
                    <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke="#1e293b" strokeWidth="1" />
                    <text x={PAD_L - 5} y={y + 4} textAnchor="end" fill="#64748b" fontSize="8">
                      {(vMin + (vMax - vMin) * frac).toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Lines per variable */}
              {Object.entries(pointsByVar).map(([varId, data], idx) => {
                const color = colors[idx % colors.length];
                if (data.pts.length < 2) return null;
                const pathD = data.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                return (
                  <g key={varId}>
                    <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />
                    {/* Legend dot + name */}
                    <circle cx={PAD_L + 10 + idx * 130} cy={CHART_H - 5} r="4" fill={color} />
                    <text x={PAD_L + 18 + idx * 130} y={CHART_H - 1} fill="#94a3b8" fontSize="7">
                      {data.name.length > 15 ? data.name.slice(0, 14) + '…' : data.name}
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
