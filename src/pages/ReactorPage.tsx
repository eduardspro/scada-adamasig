import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import './ReactorPage.css';

interface Variable {
  id: number;
  name: string;
  value: string | null;
  data_type: string;
  group: string;
  ini: number | null;
  fin: number | null;
}

interface HistoryPoint {
  value: string;
  read_at: string;
}

const GROUP = 'reactor1';
const TITLE = '⚗️ Reactor 1';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
                '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ReactorPage() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [history, setHistory] = useState<Record<number, HistoryPoint[]>>({});
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Export modal
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportVarIds, setExportVarIds] = useState<Set<number>>(new Set());
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);

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
      for (const [key, pts] of Object.entries(data)) parsed[Number(key)] = pts;
      setHistory(parsed);
    } catch { /* ignore */ }
  }, [variables, dateFrom, dateTo]);

  const toggleVar = (id: number) => {
    setVisibleIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setVisibleIds(new Set(variables.map(v => v.id)));
  const selectNone = () => setVisibleIds(new Set());

  const setRange = (hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 3600000);
    setDateFrom(toLocalISO(from));
    setDateTo(toLocalISO(now));
  };

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
      varData[v.id] = { name: v.name, pts, min: Math.min(...vals), max: Math.max(...vals) };
      for (const p of pts) allPoints.push({ varId: v.id, ...p });
    }
  }

  const hasData = allPoints.length > 0;
  let tMin = 0, tMax = 0;
  if (hasData) {
    const times = allPoints.map(p => p.ts);
    tMin = Math.min(...times); tMax = Math.max(...times);
    if (tMin === tMax) { tMin -= 60000; tMax += 60000; }
  }

  const PAD = { l: 60, r: 20, t: 8, b: 22 };
  const baseW = 900, baseH = 350;
  const W = baseW * zoom, H = baseH;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const timeRange = tMax - tMin || 1;
  const viewStart = tMin - panX, viewEnd = tMax - panX;
  const viewRange = viewEnd - viewStart;
  const toX = (ts: number) => PAD.l + ((ts - viewStart) / viewRange) * plotW;
  // Y-axis per variable — usar ini/fin si están definidos, sino auto
  const yRanges: Record<number, { min: number; max: number }> = {};
  for (const [id, data] of Object.entries(varData)) {
    const v = visibleVars.find(v => v.id === Number(id));
    if (v && v.ini !== null && v.fin !== null) {
      yRanges[Number(id)] = { min: v.ini!, max: v.fin! };
    } else {
      const pad = (data.max - data.min) * 0.15 || 1;
      yRanges[Number(id)] = { min: data.min - pad, max: data.max + pad };
    }
  }

  const ticks: { ts: number; label: string }[] = [];
  if (hasData && viewRange > 0) {
    const tickCount = Math.max(2, Math.floor(plotW / 90));
    for (let i = 0; i <= tickCount; i++) {
      const ts = viewStart + (viewRange * i) / tickCount;
      ticks.push({ ts, label: fmtTime(new Date(ts).toISOString()) });
    }
  }

  // ──── EXPORT ────
  const openExport = () => {
    setExportVarIds(new Set(visibleIds));
    setExportFrom(dateFrom);
    setExportTo(dateTo);
    setShowExport(true);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const vlist = variables.filter(v => exportVarIds.has(v.id));
      const ids = vlist.map(v => v.id);
      const body: Record<string, unknown> = { variable_ids: ids };
      if (exportFrom) body.from = exportFrom + ':00';
      if (exportTo) body.to = exportTo + ':00';
      const data = await api.post<Record<string, HistoryPoint[]>>('/api/variables/history-batch', body);

      // Build aligned matrix: timestamp → { varId: value }
      const tMap: Record<string, Record<number, string>> = {};
      for (const [key, pts] of Object.entries(data)) {
        for (const p of pts) {
          const ts = new Date(p.read_at).toISOString().replace('T', ' ').slice(0, 19);
          if (!tMap[ts]) tMap[ts] = {};
          tMap[ts][Number(key)] = p.value;
        }
      }
      const times = Object.keys(tMap).sort();

      // Build rows
      const headers = ['fechaHora', ...vlist.map(v => v.name)];
      let content: string;
      let blob: Blob;
      let ext: string;

      if (exportFormat === 'csv' || exportFormat === 'xlsx') {
        const rows = [headers.join(';')];
        for (const ts of times) {
          const row = [ts, ...ids.map(id => tMap[ts][id] || '')];
          rows.push(row.join(';'));
        }
        content = rows.join('\n');
        ext = exportFormat === 'xlsx' ? '.xlsx' : '.csv';
        // Excel reads CSV with semicolons fine in Spanish locale
        const bom = exportFormat === 'xlsx' ? '\uFEFF' : '';
        blob = new Blob([bom + content], { type: exportFormat === 'xlsx' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8' });
      } else {
        // PDF via HTML table → print
        const tableRows = times.map(ts =>
          `<tr><td>${ts}</td>${ids.map(id => `<td>${tMap[ts][id] || ''}</td>`).join('')}</tr>`
        ).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${TITLE}</title>
<style>body{font-family:monospace;font-size:10px;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:2px 6px;text-align:right}th{background:#eee}td:first-child{text-align:left}</style></head><body>
<h2>${TITLE} - Exportación</h2><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.print(); }
        setShowExport(false);
        setExporting(false);
        return;
      }

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${GROUP}_${new Date().toISOString().slice(0,10)}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExport(false);
    } catch {
      setError('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="reactor-page">
      <header className="topbar">
        <h1>{TITLE}</h1>
        <span className="subtitle">{variables.length} variables · grupo: {GROUP}</span>
      </header>

      {/* Esquema SVG — 5 tanques P&ID */}
      <div className="reactor-diagram">
        <svg viewBox="0 0 1000 450" className="reactor-svg">
          <defs>
            <linearGradient id="tankGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="30%" stopColor="#334155" />
              <stop offset="70%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>

          {/* ── TANQUE 1: Vertical izquierdo (Alimentación) ── */}
          <ellipse cx="80" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="40" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2" />
          <ellipse cx="80" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          {/* Nivel interno */}
          <rect x="44" y="130" width="72" height="88" fill="#0f3460" opacity="0.6" stroke="none" />
          <ellipse cx="80" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4" stroke="none" />

          {/* ── TANQUE 2: Vertical izquierdo (Recuperado) ── */}
          <ellipse cx="180" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="140" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2" />
          <ellipse cx="180" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <rect x="144" y="110" width="72" height="108" fill="#0f3460" opacity="0.6" stroke="none" />
          <ellipse cx="180" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4" stroke="none" />

          {/* ── TANQUE 3: REACTOR principal (centro, más grande) ── */}
          <ellipse cx="500" cy="40" rx="70" ry="20" fill="none" stroke="#475569" strokeWidth="2.5" />
          <rect x="430" y="40" width="140" height="300" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2.5" />
          <ellipse cx="500" cy="340" rx="70" ry="22" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
          {/* Chaqueta */}
          <rect x="420" y="100" width="160" height="200" rx="8" fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="5,3" />
          {/* Nivel interno */}
          <rect x="434" y="140" width="132" height="198" fill="#0f3460" opacity="0.5" stroke="none" />
          <ellipse cx="500" cy="338" rx="66" ry="18" fill="#0f3460" opacity="0.3" stroke="none" />
          {/* Agitador */}
          <rect x="490" y="0" width="20" height="30" rx="3" fill="#334155" stroke="#475569" strokeWidth="1.5" />
          <circle cx="500" cy="0" r="16" fill="none" stroke="#475569" strokeWidth="2" />
          <line x1="500" y1="30" x2="500" y2="280" stroke="#64748b" strokeWidth="4" />
          <line x1="460" y1="240" x2="540" y2="240" stroke="#64748b" strokeWidth="4" />
          <line x1="465" y1="270" x2="535" y2="270" stroke="#64748b" strokeWidth="4" />

          {/* ── TANQUE 4: Horizontal (Condensador/Intercambiador) ── */}
          <ellipse cx="500" cy="40" rx="18" ry="18" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="420" y="22" width="160" height="36" rx="18" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2" />
          <ellipse cx="500" cy="40" rx="18" ry="18" fill="none" stroke="#475569" strokeWidth="2" />
          {/* Interno */}
          <line x1="440" y1="30" x2="440" y2="50" stroke="#94a3b8" strokeWidth="1" />
          <line x1="460" y1="28" x2="460" y2="52" stroke="#94a3b8" strokeWidth="1" />
          <line x1="480" y1="28" x2="480" y2="52" stroke="#94a3b8" strokeWidth="1" />

          {/* ── TANQUE 5: Vertical derecho (Producto) ── */}
          <ellipse cx="750" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="710" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2" />
          <ellipse cx="750" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <rect x="714" y="150" width="72" height="68" fill="#0f3460" opacity="0.6" stroke="none" />
          <ellipse cx="750" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4" stroke="none" />

          {/* ── TANQUE 6: Vertical derecho (Recuperado 2) ── */}
          <ellipse cx="860" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="820" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2" />
          <ellipse cx="860" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2" />
          <rect x="824" y="120" width="72" height="98" fill="#0f3460" opacity="0.6" stroke="none" />
          <ellipse cx="860" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4" stroke="none" />

          {/* ═══ TUBERÍAS ═══ */}

          {/* T1 → T2 (interconexión superior) */}
          <line x1="120" y1="100" x2="140" y2="100" stroke="#94a3b8" strokeWidth="5" />

          {/* T1 + T2 → Reactor (alimentación combinada) */}
          <line x1="120" y1="220" x2="220" y2="220" stroke="#94a3b8" strokeWidth="5" />
          <line x1="220" y1="220" x2="220" y2="280" stroke="#94a3b8" strokeWidth="5" />
          <line x1="220" y1="320" x2="220" y2="320" stroke="#94a3b8" strokeWidth="5" />
          <line x1="220" y1="280" x2="430" y2="280" stroke="#94a3b8" strokeWidth="5" />
          {/* Válvula T2 → reactor */}
          <polygon points="280,272 290,280 280,288" fill="#64748b" />
          <line x1="280" y1="280" x2="280" y2="268" stroke="#94a3b8" strokeWidth="2" />

          {/* Bomba alimentación */}
          <circle cx="340" cy="280" r="14" fill="none" stroke="#475569" strokeWidth="2.5" />
          <circle cx="340" cy="280" r="4" fill="#64748b" />
          <polygon points="326,274 326,286 340,280" fill="#64748b" opacity="0.6" />

          {/* Reactor → Condensador (vapor arriba) */}
          <line x1="500" y1="100" x2="500" y2="58" stroke="#94a3b8" strokeWidth="4" />

          {/* Condensador → T5 (destilado derecha) */}
          <line x1="580" y1="40" x2="710" y2="40" stroke="#94a3b8" strokeWidth="4" />
          <line x1="710" y1="40" x2="710" y2="80" stroke="#94a3b8" strokeWidth="4" />
          {/* Válvula condensador */}
          <polygon points="640,32 650,40 640,48" fill="#64748b" />
          <line x1="640" y1="40" x2="640" y2="30" stroke="#94a3b8" strokeWidth="2" />

          {/* T5 → T6 (interconexión) */}
          <line x1="790" y1="100" x2="820" y2="100" stroke="#94a3b8" strokeWidth="4" />

          {/* Reactor fondo → T5 (producto inferior) */}
          <line x1="570" y1="340" x2="710" y2="340" stroke="#94a3b8" strokeWidth="5" />
          <line x1="710" y1="340" x2="710" y2="220" stroke="#94a3b8" strokeWidth="5" />
          {/* Válvula fondo reactor */}
          <polygon points="630,332 640,340 630,348" fill="#64748b" />
          <line x1="630" y1="340" x2="630" y2="328" stroke="#94a3b8" strokeWidth="2" />

          {/* Bomba salida */}
          <circle cx="680" cy="340" r="14" fill="none" stroke="#475569" strokeWidth="2.5" />
          <circle cx="680" cy="340" r="4" fill="#64748b" />
          <polygon points="666,334 666,346 680,340" fill="#64748b" opacity="0.6" />

          {/* Tubería retorno condensador → T5 */}
          <line x1="580" y1="58" x2="710" y2="58" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4,2" />

          {/* Conexión inferior T1 */}
          <line x1="80" y1="220" x2="120" y2="220" stroke="#94a3b8" strokeWidth="5" />

          {/* Conexiones de venteo (top tanks) */}
          <line x1="80" y1="66" x2="80" y2="50" stroke="#334155" strokeWidth="2" />
          <line x1="180" y1="66" x2="180" y2="50" stroke="#334155" strokeWidth="2" />
          <line x1="750" y1="66" x2="750" y2="50" stroke="#334155" strokeWidth="2" />
          <line x1="860" y1="66" x2="860" y2="50" stroke="#334155" strokeWidth="2" />

          {/* Etiquetas pequeñas (siglas solamente) */}
          <text x="80" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-01</text>
          <text x="180" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-02</text>
          <text x="500" y="378" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">R-01</text>
          <text x="750" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-03</text>
          <text x="860" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-04</text>
          <text x="500" y="18" textAnchor="middle" fill="#475569" fontSize="8" fontFamily="monospace">E-01</text>

          {/* Indicadores (círculos de estado) */}
          <circle cx="80" cy="160" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          <circle cx="180" cy="140" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          <circle cx="500" cy="200" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          <circle cx="500" cy="310" r="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
          <circle cx="750" cy="170" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          <circle cx="860" cy="150" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
        </svg>
      </div>

      {/* ── CONTROLS ── */}
      <div className="chart-controls">
        <div className="controls-bar">
          <div className="ctrl-item">
            <label>Desde</label>
            <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="ctrl-item">
            <label>Hasta</label>
            <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button onClick={() => loadHistory()} className="btn-apply">Aplicar</button>

          <div className="ctrl-sep" />

          <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(() => loadHistory(variables), 50); }} className="btn-sm">Todo</button>
          <button onClick={() => setRange(1)} className="btn-sm">1h</button>
          <button onClick={() => setRange(6)} className="btn-sm">6h</button>
          <button onClick={() => setRange(24)} className="btn-sm">24h</button>
          <button onClick={() => setRange(168)} className="btn-sm">7d</button>

          <div className="ctrl-sep" />

          <div className="ctrl-item zoom-ctrl">
            <button onClick={() => setZoom(z => Math.min(z * 1.5, 8))} className="btn-sm" title="Acercar">+</button>
            <span>{zoom.toFixed(1)}x</span>
            <button onClick={() => setZoom(z => Math.max(z / 1.5, 0.5))} className="btn-sm" title="Alejar">−</button>
          </div>
          <div className="ctrl-item">
            <button onClick={() => setPanX(p => p - timeRange * 0.2)} className="btn-sm" title="Izquierda">◀</button>
            <button onClick={() => setPanX(p => p + timeRange * 0.2)} className="btn-sm" title="Derecha">▶</button>
            <button onClick={() => { setZoom(1); setPanX(0); }} className="btn-sm">↺</button>
          </div>

          <div className="ctrl-sep" />

          <button onClick={openExport} className="btn-export">📥 Exportar</button>
        </div>
      </div>

      {/* ── VARIABLE TOGGLES ── */}
      <div className="var-toggles">
        <button onClick={selectAll} className="btn-toggle">Todos</button>
        <button onClick={selectNone} className="btn-toggle">Ninguno</button>
        {variables.map((v, i) => (
          <label key={v.id} className="var-check" style={{ color: COLORS[i % COLORS.length] }}>
            <input type="checkbox" checked={visibleIds.has(v.id)} onChange={() => toggleVar(v.id)} />
            <span className="var-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {v.name.length > 28 ? v.name.slice(0, 27) + '\u2026' : v.name}
          </label>
        ))}
      </div>

      {/* ── CHART ── */}
      <div className="reactor-chart">
        {error && <p className="error">{error}</p>}
        {!hasData ? (
          <p className="muted">Sin datos. Activa historización y lectura del PLC.</p>
        ) : (
          <div className="chart-scroll">
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}px`, minWidth: '100%' }}>
              {visibleVars.filter(v => varData[v.id]).map((v, vi) => {
                const range = yRanges[v.id];
                const yOff = (vi * (plotH / visibleVars.length));
                const segH = plotH / visibleVars.length;
                return (
                  <g key={`grid-${v.id}`}>
                    <line x1={PAD.l} y1={PAD.t + yOff + segH} x2={W - PAD.r} y2={PAD.t + yOff + segH} stroke="#1e293b" strokeWidth="1" />
                    <text x={PAD.l - 5} y={PAD.t + yOff + segH / 2 + 4} textAnchor="end" fill="#64748b" fontSize="8">{range.min.toFixed(1)}</text>
                    <text x={PAD.l - 5} y={PAD.t + yOff + 4} textAnchor="end" fill="#64748b" fontSize="8">{range.max.toFixed(1)}</text>
                  </g>
                );
              })}
              {ticks.map((t, i) => (
                <g key={`tick-${i}`}>
                  <line x1={toX(t.ts)} y1={H - PAD.b} x2={toX(t.ts)} y2={H - PAD.b + 5} stroke="#475569" />
                  <text x={toX(t.ts)} y={H - PAD.b + 12} textAnchor="middle" fill="#64748b" fontSize="9">{t.label}</text>
                </g>
              ))}
              {visibleVars.filter(v => varData[v.id] && varData[v.id].pts.length >= 2).map((v, vi) => {
                const data = varData[v.id];
                const range = yRanges[v.id];
                const yOff = (vi * (plotH / visibleVars.length));
                const segH = plotH / visibleVars.length;
                const color = COLORS[vi % COLORS.length];
                const toY = (val: number) => PAD.t + yOff + segH - ((val - range.min) / (range.max - range.min)) * segH;
                const pathD = data.pts.filter(p => p.ts >= viewStart && p.ts <= viewEnd)
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.ts)} ${toY(p.value)}`).join(' ');
                return (
                  <g key={`line-${v.id}`}>
                    <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
                    <rect x={W - PAD.r - 180} y={PAD.t + vi * 16} width="8" height="8" fill={color} rx="1" />
                    <text x={W - PAD.r - 168} y={PAD.t + vi * 16 + 8} fill="#94a3b8" fontSize="8">{data.name}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* ── EXPORT MODAL ── */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>📥 Exportar datos</h3>

            <div className="export-row">
              <label>Formato</label>
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
                <option value="csv">CSV (semicolon)</option>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="pdf">PDF (imprimir)</option>
              </select>
            </div>

            <div className="export-row">
              <label>Desde</label>
              <input type="datetime-local" value={exportFrom} onChange={e => setExportFrom(e.target.value)} />
              <label>Hasta</label>
              <input type="datetime-local" value={exportTo} onChange={e => setExportTo(e.target.value)} />
            </div>

            <div className="export-vars">
              <label>Variables a exportar</label>
              <div className="export-var-list">
                <label className="var-check">
                  <input type="checkbox" checked={exportVarIds.size === variables.length}
                    onChange={e => e.target.checked ? setExportVarIds(new Set(variables.map(v => v.id))) : setExportVarIds(new Set())} />
                  <span className="var-dot" style={{ background: '#94a3b8' }} /> Todos
                </label>
                {variables.map((v, i) => (
                  <label key={v.id} className="var-check" style={{ color: COLORS[i % COLORS.length] }}>
                    <input type="checkbox" checked={exportVarIds.has(v.id)}
                      onChange={e => {
                        const n = new Set(exportVarIds);
                        e.target.checked ? n.add(v.id) : n.delete(v.id);
                        setExportVarIds(n);
                      }} />
                    <span className="var-dot" style={{ background: COLORS[i % COLORS.length] }} />
                    {v.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="export-actions">
              <button onClick={() => setShowExport(false)} className="btn-sm">Cancelar</button>
              <button onClick={doExport} disabled={exporting} className="btn-apply">
                {exporting ? 'Exportando...' : 'Exportar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
