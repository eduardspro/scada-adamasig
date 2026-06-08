import { useEffect, useState } from 'react';
import { api } from '../api';
import './ReactorPage.css';

interface Variable {
  id: number;
  name: string;
  value: string | null;
  data_type: string;
  connection_name: string;
  last_read_at: string | null;
}

export default function ReactorPage() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/variables')
      .then(res => {
        const realVars = res.data.filter((v: Variable) =>
          ['float32', 'uint16', 'int16', 'uint32', 'int32', 'real'].includes(v.data_type)
        );
        setVariables(realVars);
      })
      .catch(() => setError('Error al cargar variables'));
  }, []);

  // Auto-refresh cada 2s
  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/api/variables')
        .then(res => {
          const realVars = res.data.filter((v: Variable) =>
            ['float32', 'uint16', 'int16', 'uint32', 'int32', 'real'].includes(v.data_type)
          );
          setVariables(realVars);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getNumeric = (v: Variable) => {
    if (v.value === null || v.value === undefined) return null;
    const n = parseFloat(v.value);
    return isNaN(n) ? null : n;
  };

  const chartVars = variables.filter(v => getNumeric(v) !== null);
  const maxVal = chartVars.length > 0
    ? Math.max(...chartVars.map(v => getNumeric(v)!), 1)
    : 100;
  const chartHeight = 160;
  const barWidth = Math.max(14, Math.min(40, 600 / Math.max(chartVars.length, 1)));

  return (
    <div className="reactor-page">
      <h2 className="page-title">⚗️ Reactor 1</h2>

      {/* Esquema SVG sin textos ni valores */}
      <div className="reactor-diagram">
        <svg viewBox="0 0 800 500" className="reactor-svg">
          {/* Tubería entrada superior izquierda */}
          <line x1="0" y1="140" x2="240" y2="140" stroke="#94a3b8" strokeWidth="8" />
          <line x1="240" y1="140" x2="280" y2="200" stroke="#94a3b8" strokeWidth="8" />

          {/* Válvula entrada */}
          <rect x="200" y="128" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="208" y1="128" x2="208" y2="118" stroke="#94a3b8" strokeWidth="3" />

          {/* Reactor principal */}
          <rect x="260" y="200" width="220" height="240" rx="10" fill="#1e293b" stroke="#475569" strokeWidth="3" />

          {/* Chaqueta */}
          <rect x="250" y="250" width="240" height="160" rx="8" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="6,3" />

          {/* Agitador - motor arriba */}
          <rect x="355" y="150" width="30" height="40" rx="4" fill="#334155" stroke="#475569" strokeWidth="2" />
          <circle cx="370" cy="135" r="12" fill="none" stroke="#475569" strokeWidth="2" />
          {/* Eje agitador */}
          <line x1="370" y1="190" x2="370" y2="360" stroke="#64748b" strokeWidth="4" />
          {/* Paletas */}
          <line x1="340" y1="330" x2="400" y2="330" stroke="#64748b" strokeWidth="4" />
          <line x1="345" y1="360" x2="395" y2="360" stroke="#64748b" strokeWidth="4" />

          {/* Tubería salida inferior */}
          <line x1="480" y1="380" x2="580" y2="380" stroke="#94a3b8" strokeWidth="8" />
          <line x1="580" y1="380" x2="620" y2="340" stroke="#94a3b8" strokeWidth="8" />
          <line x1="620" y1="340" x2="800" y2="340" stroke="#94a3b8" strokeWidth="8" />

          {/* Válvula salida */}
          <rect x="530" y="368" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="538" y1="368" x2="538" y2="358" stroke="#94a3b8" strokeWidth="3" />

          {/* Tubería entrada inferior (reactivos) */}
          <line x1="0" y1="380" x2="200" y2="380" stroke="#94a3b8" strokeWidth="8" />
          <line x1="200" y1="380" x2="240" y2="400" stroke="#94a3b8" strokeWidth="8" />
          <line x1="240" y1="400" x2="260" y2="400" stroke="#94a3b8" strokeWidth="8" />

          {/* Válvula inferior */}
          <rect x="160" y="368" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="168" y1="368" x2="168" y2="358" stroke="#94a3b8" strokeWidth="3" />

          {/* Tubería salida superior (vapor/gas) */}
          <line x1="380" y1="200" x2="380" y2="140" stroke="#94a3b8" strokeWidth="6" />
          <line x1="380" y1="140" x2="550" y2="60" stroke="#94a3b8" strokeWidth="6" />
          <line x1="550" y1="60" x2="800" y2="60" stroke="#94a3b8" strokeWidth="6" />

          {/* Válvula vapor */}
          <rect x="490" y="88" width="16" height="24" rx="2" fill="#64748b" />
          <line x1="498" y1="88" x2="498" y2="78" stroke="#94a3b8" strokeWidth="3" />

          {/* Condensador (intercambiador arriba derecha) */}
          <rect x="560" y="40" width="30" height="80" rx="4" fill="#1e293b" stroke="#475569" strokeWidth="2" />

          {/* Indicadores (círculos sin texto) */}
          <circle cx="300" cy="310" r="14" fill="none" stroke="#22c55e" strokeWidth="2" />
          <circle cx="440" cy="310" r="14" fill="none" stroke="#22c55e" strokeWidth="2" />
          <circle cx="370" cy="430" r="14" fill="none" stroke="#f59e0b" strokeWidth="2" />

          {/* Bomba */}
          <circle cx="120" cy="380" r="22" fill="none" stroke="#475569" strokeWidth="3" />
          <circle cx="120" cy="380" r="6" fill="#64748b" />
        </svg>
      </div>

      {/* Gráfica de barras de variables reales */}
      <div className="reactor-chart">
        <h3>📈 Variables de proceso</h3>
        {error && <p className="error">{error}</p>}

        {chartVars.length === 0 ? (
          <p className="muted">No hay variables de tipo real configuradas.</p>
        ) : (
          <div className="chart-container">
            <svg viewBox={`0 0 700 ${chartHeight + 30}`} className="chart-svg">
              {/* Líneas de grid */}
              {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                const y = 10 + chartHeight * (1 - frac);
                return (
                  <g key={frac}>
                    <line x1="0" y1={y} x2="700" y2={y} stroke="#1e293b" strokeWidth="1" />
                  </g>
                );
              })}

              {/* Barras */}
              {chartVars.map((v, i) => {
                const val = getNumeric(v)!;
                const x = i * (700 / chartVars.length) + (700 / chartVars.length - barWidth) / 2;
                const h = (val / maxVal) * chartHeight;
                const y = 10 + chartHeight - h;

                // Color según tipo de variable
                const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
                const color = colors[i % colors.length];

                return (
                  <g key={v.id}>
                    <rect x={x} y={y} width={barWidth} height={h} rx="3" fill={color} opacity="0.85" />
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 25}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="9"
                    >
                      {v.name.length > 10 ? v.name.slice(0, 9) + '…' : v.name}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={y - 4}
                      textAnchor="middle"
                      fill={color}
                      fontSize="9"
                    >
                      {val.toFixed(1)}
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
