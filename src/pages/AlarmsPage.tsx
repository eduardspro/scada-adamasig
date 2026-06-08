import { useEffect, useState } from 'react';
import { api } from '../api';
import './AlarmsPage.css';

interface Variable {
  id: number;
  name: string;
  value: string | null;
  data_type: string;
  group: string;
  description: string;
  connection_name: string;
}

interface Alarm {
  id: number;
  variable_id: number;
  enabled: boolean;
  ll_value: number | null;
  ll_color: string;
  l_value: number | null;
  l_color: string;
  h_value: number | null;
  h_color: string;
  hh_value: number | null;
  hh_color: string;
  variable_name: string;
  variable_value: string | null;
  data_type: string;
  group: string;
  description: string;
  connection_name: string;
}

const DEFAULT_COLORS = { ll: '#ef4444', l: '#f59e0b', h: '#f59e0b', hh: '#ef4444' };

function getAlarmLevel(alarm: Alarm): { level: string; color: string } | null {
  if (!alarm.enabled || alarm.variable_value === null || alarm.variable_value === undefined) return null;
  const val = parseFloat(alarm.variable_value);
  if (isNaN(val)) return null;

  if (alarm.ll_value !== null && val <= alarm.ll_value) return { level: 'LL', color: alarm.ll_color };
  if (alarm.l_value !== null && val <= alarm.l_value) return { level: 'L', color: alarm.l_color };
  if (alarm.hh_value !== null && val >= alarm.hh_value) return { level: 'HH', color: alarm.hh_color };
  if (alarm.h_value !== null && val >= alarm.h_value) return { level: 'H', color: alarm.h_color };
  return null;
}

export default function AlarmsPage() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [varId, setVarId] = useState('');
  const [llVal, setLlVal] = useState('');
  const [llCol, setLlCol] = useState(DEFAULT_COLORS.ll);
  const [lVal, setLVal] = useState('');
  const [lCol, setLCol] = useState(DEFAULT_COLORS.l);
  const [hVal, setHVal] = useState('');
  const [hCol, setHCol] = useState(DEFAULT_COLORS.h);
  const [hhVal, setHhVal] = useState('');
  const [hhCol, setHhCol] = useState(DEFAULT_COLORS.hh);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);

  function load() {
    Promise.all([
      api.get<Variable[]>('/api/variables'),
      api.get<Alarm[]>('/api/alarms'),
    ]).then(([vars, alms]) => {
      setVariables(vars);
      setAlarms(alms);
    }).catch(() => setError('Error al cargar'));
  }

  useEffect(() => { load(); }, []);

  // Refresh values every 2s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [vars, alms] = await Promise.all([
          api.get<Variable[]>('/api/variables'),
          api.get<Alarm[]>('/api/alarms'),
        ]);
        setVariables(vars);
        setAlarms(alms);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  function resetForm() {
    setVarId('');
    setLlVal(''); setLlCol(DEFAULT_COLORS.ll);
    setLVal(''); setLCol(DEFAULT_COLORS.l);
    setHVal(''); setHCol(DEFAULT_COLORS.h);
    setHhVal(''); setHhCol(DEFAULT_COLORS.hh);
    setShowForm(false);
    setEditingId(null);
  }

  async function handleAdd() {
    if (!varId) return;
    try {
      await api.post('/api/alarms', {
        variable_id: Number(varId),
        ll_value: llVal ? Number(llVal) : null, ll_color: llCol,
        l_value: lVal ? Number(lVal) : null, l_color: lCol,
        h_value: hVal ? Number(hVal) : null, h_color: hCol,
        hh_value: hhVal ? Number(hhVal) : null, hh_color: hhCol,
      });
      resetForm();
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al crear'); }
  }

  async function handleSave(id: number) {
    try {
      await api.put(`/api/alarms/${id}`, {
        ll_value: llVal ? Number(llVal) : null, ll_color: llCol,
        l_value: lVal ? Number(lVal) : null, l_color: lCol,
        h_value: hVal ? Number(hVal) : null, h_color: hCol,
        hh_value: hhVal ? Number(hhVal) : null, hh_color: hhCol,
      });
      resetForm();
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar'); }
  }

  function startEdit(a: Alarm) {
    setEditingId(a.id);
    setVarId(String(a.variable_id));
    setLlVal(a.ll_value !== null ? String(a.ll_value) : '');
    setLlCol(a.ll_color);
    setLVal(a.l_value !== null ? String(a.l_value) : '');
    setLCol(a.l_color);
    setHVal(a.h_value !== null ? String(a.h_value) : '');
    setHCol(a.h_color);
    setHhVal(a.hh_value !== null ? String(a.hh_value) : '');
    setHhCol(a.hh_color);
    setShowForm(true);
  }

  async function toggleAlarm(a: Alarm) {
    try {
      await api.patch(`/api/alarms/${a.id}`, { enabled: !a.enabled });
      load();
    } catch { /* ignore */ }
  }

  async function deleteAlarm(id: number) {
    try {
      await api.delete(`/api/alarms/${id}`);
      load();
    } catch { /* ignore */ }
  }

  return (
    <div className="alarms-page">
      <header className="topbar">
        <h1>🚨 Alarmas</h1>
        <button className="btn-add-alarm" onClick={() => { resetForm(); setShowForm(true); }}>
          + Nueva Alarma
        </button>
      </header>

      {error && <div className="error" onClick={() => setError('')}>{error} ✕</div>}

      {/* FORM */}
      {showForm && (
        <div className="alarm-form">
          <h3>{editingId ? 'Editar Alarma' : 'Nueva Alarma'}</h3>
          <div className="alarm-form-grid">
            <label>
              Variable
              <select value={varId} onChange={e => setVarId(e.target.value)} disabled={!!editingId}>
                <option value="">Seleccionar...</option>
                {variables.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.group})</option>
                ))}
              </select>
            </label>

            <div className="thresholds-row">
              <div className="threshold-group">
                <span className="th-label" style={{ color: llCol }}>LL</span>
                <input type="number" value={llVal} onChange={e => setLlVal(e.target.value)} placeholder="Valor" step="any" />
                <input type="color" value={llCol} onChange={e => setLlCol(e.target.value)} title="Color LL" className="color-input" />
              </div>
              <div className="threshold-group">
                <span className="th-label" style={{ color: lCol }}>L</span>
                <input type="number" value={lVal} onChange={e => setLVal(e.target.value)} placeholder="Valor" step="any" />
                <input type="color" value={lCol} onChange={e => setLCol(e.target.value)} title="Color L" className="color-input" />
              </div>
              <div className="threshold-group">
                <span className="th-label" style={{ color: hCol }}>H</span>
                <input type="number" value={hVal} onChange={e => setHVal(e.target.value)} placeholder="Valor" step="any" />
                <input type="color" value={hCol} onChange={e => setHCol(e.target.value)} title="Color H" className="color-input" />
              </div>
              <div className="threshold-group">
                <span className="th-label" style={{ color: hhCol }}>HH</span>
                <input type="number" value={hhVal} onChange={e => setHhVal(e.target.value)} placeholder="Valor" step="any" />
                <input type="color" value={hhCol} onChange={e => setHhCol(e.target.value)} title="Color HH" className="color-input" />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button onClick={resetForm} className="btn-cancel">Cancelar</button>
            <button onClick={() => editingId ? handleSave(editingId) : handleAdd()} className="btn-save">
              {editingId ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="content-area">
        {alarms.length === 0 ? (
          <p className="empty">No hay alarmas configuradas. Crea una nueva.</p>
        ) : (
          <table className="connections-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Grupo</th>
                <th>Valor</th>
                <th>LL</th>
                <th>L</th>
                <th>H</th>
                <th>HH</th>
                <th>Estado</th>
                <th>Activa</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map(a => {
                const level = getAlarmLevel(a);
                return (
                  <tr key={a.id} style={level ? { background: level.color + '20', borderLeft: `3px solid ${level.color}` } : {}}>
                    <td>
                      <strong>{a.variable_name}</strong>
                      {a.description && <div className="cell-desc">{a.description.slice(0, 60)}</div>}
                    </td>
                    <td><span className="badge">{a.group}</span></td>
                    <td className="cell-value">{a.variable_value || '—'}</td>
                    <td style={{ color: a.ll_color }}>{a.ll_value !== null ? a.ll_value : '—'}</td>
                    <td style={{ color: a.l_color }}>{a.l_value !== null ? a.l_value : '—'}</td>
                    <td style={{ color: a.h_color }}>{a.h_value !== null ? a.h_value : '—'}</td>
                    <td style={{ color: a.hh_color }}>{a.hh_value !== null ? a.hh_value : '—'}</td>
                    <td>
                      {level ? (
                        <span className="alarm-badge" style={{ background: level.color, color: '#fff' }}>
                          {level.level}
                        </span>
                      ) : (
                        <span className="alarm-ok">OK</span>
                      )}
                    </td>
                    <td>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={a.enabled} onChange={() => toggleAlarm(a)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td className="actions">
                      <button className="btn-edit" onClick={() => startEdit(a)}>Editar</button>
                      <button className="btn-delete" onClick={() => deleteAlarm(a.id)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
