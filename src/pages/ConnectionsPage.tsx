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
  created_at: string;
}

interface TestResult {
  id: number;
  host: string;
  port: number;
  online: boolean;
}

interface Props {
  user: { id: number; username: string };
  onLogout: () => void;
}

const DEFAULT_PORTS: Record<string, number> = {
  tcp: 0, modbus: 502, serial: 0, opcua: 4840, profinet: 102, profibus: 0,
};
const NEEDS_RACK_SLOT = ['profinet', 'profibus'];

export default function ConnectionsPage({ user, onLogout }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [status, setStatus] = useState<Record<number, boolean | null>>({});
  const [testing, setTesting] = useState<Record<number, boolean>>({});
  const [testAllRunning, setTestAllRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New connection form
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [connType, setConnType] = useState('tcp');
  const [rack, setRack] = useState('0');
  const [slot, setSlot] = useState('1');
  const [saving, setSaving] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editHost, setEditHost] = useState('');
  const [editPort, setEditPort] = useState('');
  const [editType, setEditType] = useState('tcp');
  const [editRack, setEditRack] = useState('0');
  const [editSlot, setEditSlot] = useState('1');

  async function loadConnections() {
    try {
      const data = await api.get<Connection[]>('/api/connections');
      setConnections(data);
    } catch {
      setError('Error al cargar conexiones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadConnections(); }, []);

  function handleTypeChange(newType: string) {
    setConnType(newType);
    const dp = DEFAULT_PORTS[newType];
    if (dp > 0) setPort(String(dp));
  }

  function editTypeChange(newType: string) {
    setEditType(newType);
    const dp = DEFAULT_PORTS[newType];
    if (dp > 0) setEditPort(String(dp));
  }

  // ---------- TEST SINGLE ----------
  async function handleTest(c: Connection) {
    setTesting(prev => ({ ...prev, [c.id]: true }));
    try {
      const result = await api.post<TestResult>(`/api/connections/${c.id}/test`, {});
      setStatus(prev => ({ ...prev, [c.id]: result.online }));
    } catch {
      setStatus(prev => ({ ...prev, [c.id]: false }));
    } finally {
      setTesting(prev => ({ ...prev, [c.id]: false }));
    }
  }

  // ---------- TEST ALL ----------
  async function handleTestAll() {
    setTestAllRunning(true);
    try {
      const results = await api.post<TestResult[]>('/api/connections/test-all', {});
      const newStatus: Record<number, boolean> = {};
      for (const r of results) newStatus[r.id] = r.online;
      setStatus(prev => ({ ...prev, ...newStatus }));
    } catch {
      setError('Error al probar conexiones');
    } finally {
      setTestAllRunning(false);
    }
  }

  // ---------- CREATE ----------
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name || !host || !port) return;
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (NEEDS_RACK_SLOT.includes(connType)) {
      config.rack = Number(rack);
      config.slot = Number(slot);
    }
    try {
      const created = await api.post<Connection>('/api/connections', {
        name, host, port: Number(port), type: connType, config,
      });
      setConnections([created, ...connections]);
      setName(''); setHost(''); setPort(''); setRack('0'); setSlot('1'); setConnType('tcp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally { setSaving(false); }
  }

  // ---------- TOGGLE ----------
  async function handleToggle(c: Connection) {
    try {
      const updated = await api.patch<Connection>(`/api/connections/${c.id}`, { enabled: !c.enabled });
      setConnections(connections.map(x => x.id === c.id ? updated : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  }

  // ---------- START EDIT ----------
  function startEdit(c: Connection) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditHost(c.host);
    setEditPort(String(c.port));
    setEditType(c.type);
    setEditRack(String(c.config?.rack ?? 0));
    setEditSlot(String(c.config?.slot ?? 1));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // ---------- SAVE EDIT ----------
  async function saveEdit(id: number) {
    if (!editName || !editHost || !editPort) return;
    const config: Record<string, unknown> = {};
    if (NEEDS_RACK_SLOT.includes(editType)) {
      config.rack = Number(editRack);
      config.slot = Number(editSlot);
    }
    try {
      const updated = await api.put<Connection>(`/api/connections/${id}`, {
        name: editName, host: editHost, port: Number(editPort), type: editType, config,
      });
      setConnections(connections.map(x => x.id === id ? updated : x));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  }

  // ---------- DELETE ----------
  async function handleDelete(id: number) {
    try {
      await api.delete(`/api/connections/${id}`);
      setConnections(connections.filter(c => c.id !== id));
      setStatus(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  function configSummary(c: Connection): string {
    const parts: string[] = [];
    if (c.config?.rack !== undefined) parts.push(`R${c.config.rack}`);
    if (c.config?.slot !== undefined) parts.push(`S${c.config.slot}`);
    return parts.join(' / ');
  }

  function statusDot(conn: Connection) {
    const s = status[conn.id];
    if (s === undefined) return <span className="dot dot-unknown" title="Sin probar">●</span>;
    if (testing[conn.id]) return <span className="dot dot-testing" title="Probando...">◌</span>;
    return s
      ? <span className="dot dot-online" title="Online">●</span>
      : <span className="dot dot-offline" title="Offline">●</span>;
  }

  const showRackSlot = NEEDS_RACK_SLOT.includes(connType);
  const editShowRackSlot = NEEDS_RACK_SLOT.includes(editType);

  return (
    <div className="connections-page">
      <header className="topbar">
        <h1>AdamaSig</h1>
        <div className="user-info">
          <span>{user.username}</span>
          <button className="btn-logout" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main>
        <div className="header-row">
          <h2>Configuración de Conexiones</h2>
          {connections.length > 0 && (
            <button className="btn-test-all" onClick={handleTestAll} disabled={testAllRunning}>
              {testAllRunning ? '⏳ Probando...' : '↻ Probar todas'}
            </button>
          )}
        </div>

        {error && <div className="error" onClick={() => setError('')}>{error} ✕</div>}

        {/* NEW CONNECTION FORM */}
        <form className="connection-form" onSubmit={handleAdd}>
          <div className="form-row">
            <label>Nombre<input value={name} onChange={e => setName(e.target.value)} placeholder="PLC Principal" /></label>
            <label>Host/IP<input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" /></label>
            <label>Puerto<input type="number" value={port} onChange={e => setPort(e.target.value)} placeholder={String(DEFAULT_PORTS[connType] || '')} /></label>
            <label>Tipo
              <select value={connType} onChange={e => handleTypeChange(e.target.value)}>
                <option value="tcp">TCP</option>
                <option value="modbus">Modbus</option>
                <option value="serial">Serial</option>
                <option value="opcua">OPC UA</option>
                <option value="profinet">Profinet</option>
                <option value="profibus">Profibus</option>
              </select>
            </label>
            {showRackSlot && (
              <>
                <label>Rack<input type="number" value={rack} onChange={e => setRack(e.target.value)} min="0" max="15" className="small-input" /></label>
                <label>Slot<input type="number" value={slot} onChange={e => setSlot(e.target.value)} min="0" max="31" className="small-input" /></label>
              </>
            )}
            <button type="submit" disabled={saving} className="btn-add">{saving ? '...' : 'Agregar'}</button>
          </div>
          {showRackSlot && (
            <div className="form-hint">S7-1200/1500: R0/S1 | S7-300: R0/S2 | S7-400: R0/S3 | Puerto: 102</div>
          )}
        </form>

        {/* TABLE */}
        {loading ? (
          <p className="loading">Cargando conexiones...</p>
        ) : connections.length === 0 ? (
          <p className="empty">No hay conexiones configuradas. Agrega una arriba.</p>
        ) : (
          <table className="connections-table">
            <thead>
              <tr>
                <th>On</th>
                <th>Nombre</th>
                <th>Host</th>
                <th>Puerto</th>
                <th>Tipo</th>
                <th>Params</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {connections.map(c => (
                editingId === c.id ? (
                  /* ---- EDIT ROW ---- */
                  <tr key={c.id} className="edit-row">
                    <td>
                      <input type="checkbox" checked={c.enabled} onChange={() => handleToggle(c)} title={c.enabled ? 'Deshabilitar' : 'Habilitar'} />
                    </td>
                    <td><input value={editName} onChange={e => setEditName(e.target.value)} /></td>
                    <td><input value={editHost} onChange={e => setEditHost(e.target.value)} /></td>
                    <td><input type="number" value={editPort} onChange={e => setEditPort(e.target.value)} className="port-input" /></td>
                    <td>
                      <select value={editType} onChange={e => editTypeChange(e.target.value)}>
                        <option value="tcp">TCP</option>
                        <option value="modbus">Modbus</option>
                        <option value="serial">Serial</option>
                        <option value="opcua">OPC UA</option>
                        <option value="profinet">Profinet</option>
                        <option value="profibus">Profibus</option>
                      </select>
                    </td>
                    <td>
                      {editShowRackSlot ? (
                        <span className="rack-slot-inline">
                          R<input type="number" value={editRack} onChange={e => setEditRack(e.target.value)} min="0" className="tiny-input" />
                          S<input type="number" value={editSlot} onChange={e => setEditSlot(e.target.value)} min="0" className="tiny-input" />
                        </span>
                      ) : <span className="cell-muted">—</span>}
                    </td>
                    <td>{statusDot(c)}</td>
                    <td className="actions">
                      <button className="btn-save" onClick={() => saveEdit(c.id)}>Guardar</button>
                      <button className="btn-cancel" onClick={cancelEdit}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  /* ---- VIEW ROW ---- */
                  <tr key={c.id} className={c.enabled ? '' : 'row-disabled'}>
                    <td>
                      <input type="checkbox" checked={c.enabled} onChange={() => handleToggle(c)} title={c.enabled ? 'Deshabilitar' : 'Habilitar'} />
                    </td>
                    <td>{c.name}</td>
                    <td><code>{c.host}</code></td>
                    <td>{c.port}</td>
                    <td><span className={`badge badge-${c.type}`}>{c.type.toUpperCase()}</span></td>
                    <td className="cell-muted">{configSummary(c)}</td>
                    <td className="td-status">
                      {statusDot(c)}
                      <button
                        className="btn-test"
                        onClick={() => handleTest(c)}
                        disabled={testing[c.id]}
                      >
                        {testing[c.id] ? '...' : 'Test'}
                      </button>
                    </td>
                    <td className="actions">
                      <button className="btn-edit" onClick={() => startEdit(c)}>Editar</button>
                      <button className="btn-delete" onClick={() => handleDelete(c)}>Eliminar</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
