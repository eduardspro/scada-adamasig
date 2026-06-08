import { useState, type FormEvent } from 'react';
import { api } from '../api';

interface Props {
  onLogin: (user: { id: number; username: string }) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; user: { id: number; username: string } }>(
        '/api/login',
        { username, password }
      );
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>AdamaSig</h1>
        <h2>Iniciar Sesión</h2>

        {error && <div className="error">{error}</div>}

        <label>
          Usuario
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
            autoFocus
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
