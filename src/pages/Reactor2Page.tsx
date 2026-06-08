import { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler, TimeScale,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import { es } from 'date-fns/locale';
import { api } from '../api';
import './Reactor2Page.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, TimeScale, zoomPlugin);

interface Variable {
  id: number; name: string; value: string | null; data_type: string; group: string;
  ini: number | null; fin: number | null;
}
interface HistoryPoint { value: string; read_at: string; }

const GROUP = 'reactor2';
const TITLE = '⚗️ Reactor 2';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
                '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Reactor2Page() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [history, setHistory] = useState<Record<number, HistoryPoint[]>>({});
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportVarIds, setExportVarIds] = useState<Set<number>>(new Set());
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<Variable[]>('/api/variables').then(vars => {
      const f = vars.filter(v => v.group === GROUP);
      setVariables(f); loadHistory(f);
    }).catch(() => setError('Error al cargar variables'));
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      api.get<Variable[]>('/api/variables').then(vars => setVariables(vars.filter(v => v.group === GROUP))).catch(() => {});
    }, 2000);
    return () => clearInterval(i);
  }, []);

  const loadHistory = useCallback(async (vars?: Variable[]) => {
    const vlist = vars || variables;
    if (vlist.length === 0) return;
    try {
      const body: Record<string, unknown> = { variable_ids: vlist.map(v => v.id) };
      if (dateFrom) body.from = new Date(dateFrom + ':00').toISOString();
      if (dateTo) body.to = new Date(dateTo + ':00').toISOString();
      const data = await api.post<Record<string, HistoryPoint[]>>('/api/variables/history-batch', body);
      const p: Record<number, HistoryPoint[]> = {};
      for (const [k, pts] of Object.entries(data)) p[Number(k)] = pts;
      setHistory(p);
    } catch { /* ignore */ }
  }, [variables, dateFrom, dateTo]);

  const visibleVars = variables;

  const setRange = (hours: number) => {
    const now = new Date();
    setDateFrom(toLocalISO(new Date(now.getTime() - hours * 3600000)));
    setDateTo(toLocalISO(now));
  };

  // Build Chart.js datasets
  const datasets = visibleVars.map((v, i) => {
    const pts = (history[v.id] || [])
      .map(p => ({ x: new Date(p.read_at).getTime(), y: parseFloat(p.value) }))
      .filter(p => !isNaN(p.y))
      .sort((a, b) => a.x - b.x);
    return {
      label: v.name,
      data: pts,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + '20',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.1,
      yAxisID: 'y',
      fill: false,
    };
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      x: {
        type: 'time' as const,
        time: { unit: 'minute' as const, displayFormats: { minute: 'HH:mm' }, tooltipFormat: 'yyyy-MM-dd HH:mm:ss' },
        adapters: { date: { locale: es } },
        grid: { color: '#1e293b' },
        ticks: { color: '#64748b', maxTicksLimit: 15 },
      },
      y: {
        type: 'linear' as const,
        min: 0,
        max: 100,
        grid: { color: '#1e293b' },
        ticks: { color: '#64748b' },
      },
    },
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#94a3b8', boxWidth: 12, font: { size: 10 }, padding: 8 } },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#334155', borderWidth: 1,
      },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' as const },
      },
    },
  };

  // Export
  const openExport = () => {
    setExportVarIds(new Set(variables.map(v => v.id)));
    setExportFrom(dateFrom); setExportTo(dateTo); setShowExport(true);
  };
  const doExport = async () => {
    setExporting(true);
    try {
      const vlist = variables.filter(v => exportVarIds.has(v.id));
      const ids = vlist.map(v => v.id);
      const body: Record<string, unknown> = { variable_ids: ids };
      if (exportFrom) body.from = new Date(exportFrom + ':00').toISOString();
      if (exportTo) body.to = new Date(exportTo + ':00').toISOString();
      const data = await api.post<Record<string, HistoryPoint[]>>('/api/variables/history-batch', body);
      const tMap: Record<string, Record<number, string>> = {};
      for (const [key, pts] of Object.entries(data))
        for (const p of pts) {
          const ts = new Date(p.read_at).toISOString().replace('T', ' ').slice(0, 19);
          if (!tMap[ts]) tMap[ts] = {}; tMap[ts][Number(key)] = p.value;
        }
      const times = Object.keys(tMap).sort();
      const headers = ['fechaHora', ...vlist.map(v => v.name)];
      let content: string; let blob: Blob; let ext: string;
      if (exportFormat === 'csv' || exportFormat === 'xlsx') {
        const rows = [headers.join(';')];
        for (const ts of times) rows.push([ts, ...ids.map(id => tMap[ts][id] || '')].join(';'));
        content = rows.join('\n'); ext = exportFormat === 'xlsx' ? '.xlsx' : '.csv';
        blob = new Blob([exportFormat === 'xlsx' ? '\uFEFF' : '' + content], { type: exportFormat === 'xlsx' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8' });
      } else {
        const trs = times.map(ts => `<tr><td>${ts}</td>${ids.map(id => `<td>${tMap[ts][id] || ''}</td>`).join('')}</tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${TITLE}</title><style>body{font-family:monospace;font-size:10px;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:2px 6px;text-align:right}th{background:#eee}td:first-child{text-align:left}</style></head><body><h2>${TITLE} - Exportación</h2><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
        const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
        setShowExport(false); setExporting(false); return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${GROUP}_${new Date().toISOString().slice(0,10)}${ext}`; a.click();
      URL.revokeObjectURL(url); setShowExport(false);
    } catch { setError('Error al exportar'); }
    finally { setExporting(false); }
  };

  return (
    <div className="reactor-page">
      <header className="topbar"><h1>{TITLE}</h1><span className="subtitle">{variables.length} variables · grupo: {GROUP}</span></header>

      {/* P&ID Diagram */}
      <div className="reactor-diagram">
        <svg viewBox="0 0 1000 450" className="reactor-svg">
          <defs><linearGradient id="tankGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1e293b"/><stop offset="30%" stopColor="#334155"/><stop offset="70%" stopColor="#334155"/><stop offset="100%" stopColor="#1e293b"/></linearGradient></defs>
          <ellipse cx="80" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2"/><rect x="40" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2"/><ellipse cx="80" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2"/><rect x="44" y="130" width="72" height="88" fill="#0f3460" opacity="0.6"/><ellipse cx="80" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4"/>
          <ellipse cx="180" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2"/><rect x="140" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2"/><ellipse cx="180" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2"/><rect x="144" y="110" width="72" height="108" fill="#0f3460" opacity="0.6"/><ellipse cx="180" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4"/>
          <ellipse cx="500" cy="40" rx="70" ry="20" fill="none" stroke="#475569" strokeWidth="2.5"/><rect x="430" y="40" width="140" height="300" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2.5"/><ellipse cx="500" cy="340" rx="70" ry="22" fill="#1e293b" stroke="#475569" strokeWidth="2.5"/><rect x="420" y="100" width="160" height="200" rx="8" fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="5,3"/><rect x="434" y="140" width="132" height="198" fill="#0f3460" opacity="0.5"/><ellipse cx="500" cy="338" rx="66" ry="18" fill="#0f3460" opacity="0.3"/>
          <rect x="490" y="0" width="20" height="30" rx="3" fill="#334155" stroke="#475569" strokeWidth="1.5"/><circle cx="500" cy="0" r="16" fill="none" stroke="#475569" strokeWidth="2"/><line x1="500" y1="30" x2="500" y2="280" stroke="#64748b" strokeWidth="4"/><line x1="460" y1="240" x2="540" y2="240" stroke="#64748b" strokeWidth="4"/><line x1="465" y1="270" x2="535" y2="270" stroke="#64748b" strokeWidth="4"/>
          <ellipse cx="500" cy="40" rx="18" ry="18" fill="none" stroke="#475569" strokeWidth="2"/><rect x="420" y="22" width="160" height="36" rx="18" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2"/><ellipse cx="500" cy="40" rx="18" ry="18" fill="none" stroke="#475569" strokeWidth="2"/><line x1="440" y1="30" x2="440" y2="50" stroke="#94a3b8" strokeWidth="1"/><line x1="460" y1="28" x2="460" y2="52" stroke="#94a3b8" strokeWidth="1"/><line x1="480" y1="28" x2="480" y2="52" stroke="#94a3b8" strokeWidth="1"/>
          <ellipse cx="750" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2"/><rect x="710" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2"/><ellipse cx="750" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2"/><rect x="714" y="150" width="72" height="68" fill="#0f3460" opacity="0.6"/><ellipse cx="750" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4"/>
          <ellipse cx="860" cy="80" rx="40" ry="14" fill="none" stroke="#475569" strokeWidth="2"/><rect x="820" y="80" width="80" height="140" fill="url(#tankGrad)" stroke="#475569" strokeWidth="2"/><ellipse cx="860" cy="220" rx="40" ry="14" fill="#1e293b" stroke="#475569" strokeWidth="2"/><rect x="824" y="120" width="72" height="98" fill="#0f3460" opacity="0.6"/><ellipse cx="860" cy="218" rx="36" ry="10" fill="#0f3460" opacity="0.4"/>
          <line x1="120" y1="100" x2="140" y2="100" stroke="#94a3b8" strokeWidth="5"/><line x1="120" y1="220" x2="220" y2="220" stroke="#94a3b8" strokeWidth="5"/><line x1="220" y1="220" x2="220" y2="280" stroke="#94a3b8" strokeWidth="5"/><line x1="220" y1="280" x2="430" y2="280" stroke="#94a3b8" strokeWidth="5"/><polygon points="280,272 290,280 280,288" fill="#64748b"/><line x1="280" y1="280" x2="280" y2="268" stroke="#94a3b8" strokeWidth="2"/><circle cx="340" cy="280" r="14" fill="none" stroke="#475569" strokeWidth="2.5"/><circle cx="340" cy="280" r="4" fill="#64748b"/><polygon points="326,274 326,286 340,280" fill="#64748b" opacity="0.6"/>
          <line x1="500" y1="100" x2="500" y2="58" stroke="#94a3b8" strokeWidth="4"/><line x1="580" y1="40" x2="710" y2="40" stroke="#94a3b8" strokeWidth="4"/><line x1="710" y1="40" x2="710" y2="80" stroke="#94a3b8" strokeWidth="4"/><polygon points="640,32 650,40 640,48" fill="#64748b"/><line x1="640" y1="40" x2="640" y2="30" stroke="#94a3b8" strokeWidth="2"/>
          <line x1="790" y1="100" x2="820" y2="100" stroke="#94a3b8" strokeWidth="4"/><line x1="570" y1="340" x2="710" y2="340" stroke="#94a3b8" strokeWidth="5"/><line x1="710" y1="340" x2="710" y2="220" stroke="#94a3b8" strokeWidth="5"/><polygon points="630,332 640,340 630,348" fill="#64748b"/><line x1="630" y1="340" x2="630" y2="328" stroke="#94a3b8" strokeWidth="2"/><circle cx="680" cy="340" r="14" fill="none" stroke="#475569" strokeWidth="2.5"/><circle cx="680" cy="340" r="4" fill="#64748b"/><polygon points="666,334 666,346 680,340" fill="#64748b" opacity="0.6"/>
          <line x1="580" y1="58" x2="710" y2="58" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4,2"/><line x1="80" y1="220" x2="120" y2="220" stroke="#94a3b8" strokeWidth="5"/>
          <line x1="80" y1="66" x2="80" y2="50" stroke="#334155" strokeWidth="2"/><line x1="180" y1="66" x2="180" y2="50" stroke="#334155" strokeWidth="2"/><line x1="750" y1="66" x2="750" y2="50" stroke="#334155" strokeWidth="2"/><line x1="860" y1="66" x2="860" y2="50" stroke="#334155" strokeWidth="2"/>
          <text x="80" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-01</text><text x="180" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-02</text><text x="500" y="378" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">R-01</text><text x="750" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-03</text><text x="860" y="258" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">TK-04</text><text x="500" y="18" textAnchor="middle" fill="#475569" fontSize="8" fontFamily="monospace">E-01</text>
          <circle cx="80" cy="160" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/><circle cx="180" cy="140" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/><circle cx="500" cy="200" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/><circle cx="500" cy="310" r="8" fill="none" stroke="#f59e0b" strokeWidth="1.5"/><circle cx="750" cy="170" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/><circle cx="860" cy="150" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/>
        </svg>
      </div>

      {/* Controls */}
      <div className="chart-controls">
        <div className="controls-bar">
          <div className="ctrl-item"><label>Desde</label><input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></div>
          <div className="ctrl-item"><label>Hasta</label><input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)}/></div>
          <button onClick={() => loadHistory()} className="btn-apply">Aplicar</button>
          <div className="ctrl-sep"/>
          <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(() => loadHistory(variables), 50); }} className="btn-sm">Todo</button>
          <button onClick={() => setRange(1)} className="btn-sm">1h</button>
          <button onClick={() => setRange(6)} className="btn-sm">6h</button>
          <button onClick={() => setRange(24)} className="btn-sm">24h</button>
          <button onClick={() => setRange(168)} className="btn-sm">7d</button>
          <div className="ctrl-sep"/>
          <button onClick={openExport} className="btn-export">📥 Exportar</button>
        </div>
      </div>

      {/* Chart.js */}
      <div className="reactor-chart" style={{ height: '420px' }}>
        {error && <p className="error">{error}</p>}
        {datasets.length === 0 || datasets.every(d => d.data.length === 0) ? (
          <p className="muted">Sin datos. Activa historización y lectura del PLC.</p>
        ) : (
          <Line data={{ datasets }} options={chartOptions}/>
        )}
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>📥 Exportar datos</h3>
            <div className="export-row"><label>Formato</label><select value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option></select></div>
            <div className="export-row"><label>Desde</label><input type="datetime-local" value={exportFrom} onChange={e => setExportFrom(e.target.value)}/><label>Hasta</label><input type="datetime-local" value={exportTo} onChange={e => setExportTo(e.target.value)}/></div>
            <div className="export-vars"><label>Variables</label><div className="export-var-list"><label className="var-check"><input type="checkbox" checked={exportVarIds.size===variables.length} onChange={e => e.target.checked ? setExportVarIds(new Set(variables.map(v=>v.id))) : setExportVarIds(new Set())}/><span className="var-dot" style={{background:'#94a3b8'}}/>Todos</label>
            {variables.map((v,i)=><label key={v.id} className="var-check" style={{color:COLORS[i%COLORS.length]}}><input type="checkbox" checked={exportVarIds.has(v.id)} onChange={e=>{const n=new Set(exportVarIds);e.target.checked?n.add(v.id):n.delete(v.id);setExportVarIds(n)}}/><span className="var-dot" style={{background:COLORS[i%COLORS.length]}}/>{v.name}</label>)}</div></div>
            <div className="export-actions"><button onClick={()=>setShowExport(false)} className="btn-sm">Cancelar</button><button onClick={doExport} disabled={exporting} className="btn-apply">{exporting?'Exportando...':'Exportar'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
