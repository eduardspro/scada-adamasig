import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

interface Connection {
  id: number;
  name: string;
  host: string;
  port: number;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

interface Variable {
  id: number;
  connection_id: number;
  name: string;
  address: string;
  data_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  sample_time_ms: number;
  value: string | null;
  last_read_at: string | null;
  historize: boolean;
  group: string;
  description: string;
  connection_name: string;
  connection_type: string;
  created_at: string;
}

interface Props {
  user: { id: number; username: string };
  onLogout: () => void;
}

const DATA_TYPES = [
  'bool', 'uint8', 'int8', 'uint16', 'int16',
  'uint32', 'int32', 'float32', 'float64', 'string',
];

const SAMPLE_TIMES = [
  { label: '500ms', value: 500 },
  { label: '1s', value: 1000 },
  { label: '10s', value: 10000 },
  { label: '1min', value: 60000 },
];

export default function VariablesPage({ user, onLogout }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [connId, setConnId] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [dataType, setDataType] = useState('uint16');
  // Protocol-specific
  const [area, setArea] = useState('DB');
  const [db, setDb] = useState('1');
  const [offset, setOffset] = useState('0');
  const [bit, setBit] = useState('');
  const [byteOrder, setByteOrder] = useState('big');
  const [group, setGroup] = useState('main');
  const [description, setDescription] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDataType, setEditDataType] = useState('uint16');
  const [editGroup, setEditGroup] = useState('main');
  const [editDescription, setEditDescription] = useState('');
  const [readLoading, setReadLoading] = useState<Record<number, boolean>>({});

  async function load() {
    try {
      const [conns, vars] = await Promise.all([
        api.get<Connection[]>('/api/connections'),
        api.get<Variable[]>('/api/variables'),
      ]);
      setConnections(conns);
      setVariables(vars);
    } catch {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Refresh display desde DB cada 2s (read-all ya corre en Layout)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await api.get<Variable[]>('/api/variables');
        if (updated.length === 0) return;
        setVariables(prev => prev.map(v => {
          const match = updated.find(u => u.id === v.id);
          return match ? { ...v, ...match } : v;
        }));
      } catch {
        // Silently ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const selectedConn = connections.find(c => c.id === Number(connId));
  const connType = selectedConn?.type || '';

  function buildAddress(): string {
    switch (connType) {
      case 'profinet':
      case 'profibus': {
        // Siemens addressing: DBX (bit), DBB (byte), DBW (word), DBD (dword/real)
        const dt = dataType.toLowerCase();
        if (dt === 'bool' && bit !== '') {
          return `${area}${db}.DBX${offset}.${bit}`;
        } else if (dt === 'uint8' || dt === 'int8' || dt === 'byte') {
          return `${area}${db}.DBB${offset}`;
        } else if (dt === 'uint32' || dt === 'int32' || dt === 'float32' || dt === 'float64') {
          return `${area}${db}.DBD${offset}`;
        } else {
          // uint16, int16, word → DBW
          return `${area}${db}.DBW${offset}`;
        }
      }
      case 'modbus':
        return address; // user types register directly
      case 'opcua':
        return address; // user types node ID
      default:
        return address;
    }
  }

  function buildConfig(): Record<string, unknown> {
    switch (connType) {
      case 'profinet':
      case 'profibus':
        return { area, db: Number(db), offset: Number(offset), bit: bit !== '' ? Number(bit) : null };
      case 'modbus':
        return { byte_order: byteOrder };
      case 'opcua':
        return {};
      default:
        return {};
    }
  }

  function addressPlaceholder(): string {
    switch (connType) {
      case 'modbus': return 'ej: 40001';
      case 'opcua': return 'ej: ns=3;s=Temperature';
      case 'profinet': return 'auto-generado de DB/offset';
      case 'profibus': return 'auto-generado de DB/offset';
      default: return 'ej: 192.168.1.100:502';
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!connId || !name) return;
    setSaving(true);
    try {
      const created = await api.post<Variable>('/api/variables', {
        connection_id: Number(connId),
        name,
        address: buildAddress(),
        data_type: dataType,
        config: buildConfig(),
        group: group || 'main',
        description: description || '',
      });
      setVariables([created, ...variables]);
      setName('');
      setAddress('');
      setDataType('uint16');
      setGroup('main');
      setDescription('');
      setDb('1'); setOffset('0'); setBit(''); setByteOrder('big');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/api/variables/${id}`);
      setVariables(variables.filter(v => v.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  async function toggleEnabled(v: Variable) {
    try {
      const updated = await api.patch<Variable>(`/api/variables/${v.id}`, { enabled: !v.enabled });
      setVariables(variables.map(x => x.id === v.id ? { ...x, ...updated } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  }

  async function updateSampleTime(v: Variable, ms: number) {
    try {
      const updated = await api.patch<Variable>(`/api/variables/${v.id}`, { sample_time_ms: ms });
      setVariables(variables.map(x => x.id === v.id ? { ...x, ...updated } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar muestreo');
    }
  }

  // ---------- EDIT ----------
  function startEdit(v: Variable) {
    setEditingId(v.id);
    setEditName(v.name);
    setEditAddress(v.address);
    setEditDataType(v.data_type);
    setEditGroup(v.group || 'main');
    setEditDescription(v.description || '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: number) {
    if (!editName || !editAddress) return;
    try {
      const updated = await api.put<Variable>(`/api/variables/${id}`, {
        name: editName,
        address: editAddress,
        data_type: editDataType,
        group: editGroup || 'main',
        description: editDescription || '',
        config: variables.find(v => v.id === id)?.config || {},
      });
      setVariables(variables.map(x => x.id === id ? { ...x, ...updated } : x));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  // ---------- READ ----------
  async function handleRead(v: Variable) {
    setReadLoading(prev => ({ ...prev, [v.id]: true }));
    try {
      const updated = await api.post<Variable>(`/api/variables/${v.id}/read`, {});
      setVariables(variables.map(x => x.id === v.id ? { ...x, ...updated } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer');
    } finally {
      setReadLoading(prev => ({ ...prev, [v.id]: false }));
    }
  }

  // ---------- TOGGLE HISTORIZE ----------
  async function toggleHistorize(v: Variable) {
    try {
      const updated = await api.patch<Variable>(`/api/variables/${v.id}`, { historize: !v.historize });
      setVariables(variables.map(x => x.id === v.id ? { ...x, ...updated } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar historización');
    }
  }

  function fmtConfig(v: Variable): string {
    const c = v.config || {};
    const parts: string[] = [];
    if (c.area) parts.push(`Area:${c.area}`);
    if (c.db !== undefined) parts.push(`DB${c.db}`);
    if (c.offset !== undefined) parts.push(`Off:${c.offset}`);
    if (c.bit !== undefined && c.bit !== null) parts.push(`Bit:${c.bit}`);
    if (c.byte_order) parts.push(c.byte_order === 'little' ? 'LE' : 'BE');
    return parts.join(' ') || '—';
  }

  function fmtValue(v: Variable): string {
    if (v.value === null || v.value === undefined) return '—';
    if (v.data_type === 'bool') return v.value === 'true' ? '✓ true' : '✗ false';
    return v.value;
  }

  function fmtLastRead(v: Variable): string {
    if (!v.last_read_at) return 'Sin datos';
    const d = new Date(v.last_read_at);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Guardado ✓';
    return `Guardado ${d.toLocaleTimeString('es-CO')}`;
  }

  function sampleLabel(ms: number): string {
    const match = SAMPLE_TIMES.find(s => s.value === ms);
    return match ? match.label : `${ms}ms`;
  }

  return (
    <div>
      <header className="topbar">
        <h1>Variables</h1>
        <div className="user-info">
          <span>{user.username}</span>
          <button className="btn-logout" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <div className="content-area">
        {error && <div className="error" onClick={() => setError('')}>{error} ✕</div>}

        {/* FORM */}
        <form className="connection-form" onSubmit={handleAdd}>
          <div className="form-col">
            <div className="form-row">
              <label>
                Conexión
                <select value={connId} onChange={e => setConnId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {connections.filter(c => c.enabled).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type.toUpperCase()})</option>
                  ))}
                </select>
              </label>
              <label>
                Nombre variable
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Temp. entrada" />
              </label>
              <label>
                Descripción
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción opcional" />
              </label>
              <label>
                Tipo dato
                <select value={dataType} onChange={e => setDataType(e.target.value)}>
                  {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                Grupo
                <input value={group} onChange={e => setGroup(e.target.value)} placeholder="main" className="group-input" />
              </label>

              {/* Modbus: address + byte order */}
              {connType === 'modbus' && (
                <>
                  <label>
                    Registro
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder="40001" />
                  </label>
                  <label>
                    Byte order
                    <select value={byteOrder} onChange={e => setByteOrder(e.target.value)}>
                      <option value="big">Big Endian</option>
                      <option value="little">Little Endian</option>
                    </select>
                  </label>
                </>
              )}

              {/* Profinet/Profibus: area, DB, offset, bit */}
              {(connType === 'profinet' || connType === 'profibus') && (
                <>
                  <label>
                    Área
                    <select value={area} onChange={e => setArea(e.target.value)}>
                      <option value="DB">DB</option>
                      <option value="M">M (Marcas)</option>
                      <option value="I">I (Entradas)</option>
                      <option value="Q">Q (Salidas)</option>
                    </select>
                  </label>
                  <label>
                    DB
                    <input type="number" value={db} onChange={e => setDb(e.target.value)} min="1" max="65535" className="small-input" />
                  </label>
                  <label>
                    Offset
                    <input type="number" value={offset} onChange={e => setOffset(e.target.value)} min="0" className="small-input" />
                  </label>
                  <label>
                    Bit
                    <input value={bit} onChange={e => setBit(e.target.value)} placeholder="0-7" className="tiny-input" />
                  </label>
                </>
              )}

              {/* OPC UA: node ID */}
              {connType === 'opcua' && (
                <label>
                  Node ID
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="ns=3;s=MyVar" style={{ width: 220 }} />
                </label>
              )}

              {/* TCP / Serial: generic address */}
              {(connType === 'tcp' || connType === 'serial' || !connType) && (
                <label>
                  Dirección
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder={addressPlaceholder()} />
                </label>
              )}

              <button type="submit" disabled={saving || !connId} className="btn-add">
                {saving ? '...' : 'Agregar'}
              </button>
            </div>
            {connType && (
              <div className="form-hint">
                {connType === 'modbus' && 'Registro: 40001-49999 HR, 30001-39999 IR, 00001 coils, 10001 DI'}
                {connType === 'profinet' && `Dirección: ${buildAddress()} — Área ${area}${area==='DB'?db:''} offset ${offset}${bit?', bit '+bit:''}`}
                {(connType === 'profibus') && `Dirección: ${buildAddress()}`}
                {connType === 'opcua' && 'Node ID formato: ns=<namespace>;s=<identifier>'}
              </div>
            )}
          </div>
        </form>

        {/* TABLE */}
        {loading ? (
          <p className="loading">Cargando...</p>
        ) : variables.length === 0 ? (
          <p className="empty">No hay variables. Selecciona una conexión y agrega una.</p>
        ) : (
          <table className="connections-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Descripción</th>
                <th>Dirección</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Conexión</th>
                <th>Config</th>
                <th>Grupo</th>
                <th>Habilitado</th>
                <th>Muestreo</th>
                <th>Historizar</th>
                <th>Guardado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {variables.map(v => (
                editingId === v.id ? (
                  /* ---- EDIT ROW ---- */
                  <tr key={v.id} className="edit-row">
                    <td><input value={editName} onChange={e => setEditName(e.target.value)} /></td>
                    <td><input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Descripción" /></td>
                    <td><input value={editAddress} onChange={e => setEditAddress(e.target.value)} /></td>
                    <td>
                      <select value={editDataType} onChange={e => setEditDataType(e.target.value)}>
                        {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="cell-muted">{fmtValue(v)}</td>
                    <td className="cell-muted">{v.connection_name}</td>
                    <td className="cell-muted">{fmtConfig(v)}</td>
                    <td><input value={editGroup} onChange={e => setEditGroup(e.target.value)} placeholder="main" /></td>
                    <td></td>
                    <td></td>
                    <td className="cell-saved">{fmtLastRead(v)}</td>
                    <td className="actions">
                      <button className="btn-save" onClick={() => saveEdit(v.id)}>Guardar</button>
                      <button className="btn-cancel" onClick={cancelEdit}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  /* ---- VIEW ROW ---- */
                  <tr key={v.id} className={v.enabled ? '' : 'row-disabled'}>
                    <td><strong>{v.name}</strong></td>
                    <td className="cell-muted" title={v.description}>{v.description ? (v.description.length > 40 ? v.description.slice(0, 39) + '…' : v.description) : '—'}</td>
                    <td><code>{v.address}</code></td>
                    <td><span className="badge">{v.data_type}</span></td>
                    <td className="cell-value">{fmtValue(v)}</td>
                    <td className="cell-muted">{v.connection_name}</td>
                    <td className="cell-muted">{fmtConfig(v)}</td>
                    <td><code>{v.group || 'main'}</code></td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={v.enabled}
                          onChange={() => toggleEnabled(v)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td>
                      <select
                        value={v.sample_time_ms}
                        onChange={e => updateSampleTime(v, Number(e.target.value))}
                        className="sample-select"
                      >
                        {SAMPLE_TIMES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className={`btn-historize ${v.historize ? 'active' : ''}`}
                        onClick={() => toggleHistorize(v)}
                        title={v.historize ? 'Historizando — click para desactivar' : 'No historiza — click para activar'}
                      >
                        {v.historize ? '📊 ON' : '📋 OFF'}
                      </button>
                    </td>
                    <td className="cell-saved">{fmtLastRead(v)}</td>
                    <td className="actions">
                      <button className="btn-edit" onClick={() => startEdit(v)}>Editar</button>
                      <button className="btn-read" onClick={() => handleRead(v)} disabled={readLoading[v.id]}>
                        {readLoading[v.id] ? '...' : 'Leer'}
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(v.id)}>Eliminar</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
