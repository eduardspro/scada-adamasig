const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const net = require('net');
const { getClient } = require('./s7client');

const app = express();
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'adamasig-jwt-secret-2026';

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:adamasig2026@db:5432/adamasig',
});

app.use(cors());
app.use(express.json());

// ---------- AUTH MIDDLEWARE ----------
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ---------- ROUTES ----------

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  try {
    const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/me
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/connections
app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, host, port, type, config, enabled, created_at, updated_at FROM connections WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('List connections error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/connections
app.post('/api/connections', authMiddleware, async (req, res) => {
  const { name, host, port, type, config } = req.body;
  if (!name || !host || !port) {
    return res.status(400).json({ error: 'name, host y port son requeridos' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO connections (user_id, name, host, port, type, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, host, port, type, config, enabled, created_at`,
      [req.user.id, name, host, port, type || 'tcp', JSON.stringify(config || {})]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create connection error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/connections/:id
app.delete('/api/connections/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM connections WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete connection error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/connections/:id — update
app.put('/api/connections/:id', authMiddleware, async (req, res) => {
  const { name, host, port, type, config } = req.body;
  try {
    const result = await pool.query(
      `UPDATE connections SET name=$1, host=$2, port=$3, type=$4, config=$5, updated_at=NOW()
       WHERE id=$6 AND user_id=$7
       RETURNING id, name, host, port, type, config, enabled, created_at, updated_at`,
      [name, host, port, type, JSON.stringify(config || {}), req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update connection error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/connections/:id — toggle enabled
app.patch('/api/connections/:id', authMiddleware, async (req, res) => {
  const { enabled } = req.body;
  try {
    const result = await pool.query(
      `UPDATE connections SET enabled=$1, updated_at=NOW()
       WHERE id=$2 AND user_id=$3
       RETURNING id, name, host, port, type, config, enabled, created_at, updated_at`,
      [enabled, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Toggle connection error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/connections/:id/test — TCP probe
app.post('/api/connections/:id/test', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, host, port FROM connections WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    const { host, port } = result.rows[0];
    const online = await tcpProbe(host, port);
    return res.json({ id: Number(req.params.id), host, port, online });
  } catch (err) {
    console.error('Test connection error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/connections/test-all
app.post('/api/connections/test-all', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, host, port FROM connections WHERE user_id = $1',
      [req.user.id]
    );
    const results = await Promise.all(
      result.rows.map(async (c) => {
        const online = await tcpProbe(c.host, c.port);
        return { id: c.id, host: c.host, port: c.port, online };
      })
    );
    return res.json(results);
  } catch (err) {
    console.error('Test all error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

function tcpProbe(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

// ---------- VARIABLES CRUD ----------

// GET /api/variables?connection_id=X
app.get('/api/variables', authMiddleware, async (req, res) => {
  try {
    let query = `SELECT v.id, v.connection_id, v.name, v.address, v.data_type, v.config,
                        v.enabled, v.sample_time_ms, v.value, v.last_read_at, v.historize,
                        v."group", v.description, v.created_at, v.updated_at,
                        c.name as connection_name, c.type as connection_type
                 FROM variables v
                 JOIN connections c ON v.connection_id = c.id
                 WHERE c.user_id = $1`;
    const params = [req.user.id];
    if (req.query.connection_id) {
      query += ' AND v.connection_id = $2';
      params.push(req.query.connection_id);
    }
    query += ' ORDER BY v.created_at DESC';
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('List variables error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/variables
app.post('/api/variables', authMiddleware, async (req, res) => {
  const { connection_id, name, address, data_type, config, enabled, sample_time_ms, historize, group, description } = req.body;
  if (!connection_id || !name || !address) {
    return res.status(400).json({ error: 'connection_id, name y address son requeridos' });
  }
  try {
    // Verify connection belongs to user
    const conn = await pool.query(
      'SELECT id FROM connections WHERE id = $1 AND user_id = $2',
      [connection_id, req.user.id]
    );
    if (conn.rows.length === 0) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    const result = await pool.query(
      `INSERT INTO variables (connection_id, name, address, data_type, config, enabled, sample_time_ms, historize, "group", description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, connection_id, name, address, data_type, config, enabled, sample_time_ms, value, last_read_at, historize, "group", description, created_at`,
      [connection_id, name, address, data_type || 'uint16', JSON.stringify(config || {}),
       enabled !== undefined ? enabled : true,
       sample_time_ms || 1000,
       historize !== undefined ? historize : false,
       group || 'main',
       description || '']
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create variable error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/variables/:id
app.delete('/api/variables/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM variables WHERE id = $1
       AND connection_id IN (SELECT id FROM connections WHERE user_id = $2)
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Variable no encontrada' });
    }
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete variable error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/variables/:id — toggle enabled, update value, sample_time, historize
app.patch('/api/variables/:id', authMiddleware, async (req, res) => {
  const { enabled, value, sample_time_ms, historize, group, description } = req.body;
  try {
    // Verify variable belongs to user's connections
    const check = await pool.query(
      `SELECT v.id, v.historize FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE v.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Variable no encontrada' });
    }

    const sets = [];
    const params = [];
    let idx = 1;
    let willHistorize = false;

    if (enabled !== undefined) {
      sets.push(`enabled=$${idx++}`);
      params.push(enabled);
    }
    if (value !== undefined) {
      sets.push(`value=$${idx++}`);
      params.push(value);
      sets.push(`last_read_at=NOW()`);
      // Historize if variable has historize=true or we're setting it now
      if (historize !== undefined ? historize : check.rows[0].historize) {
        willHistorize = true;
      }
    }
    if (sample_time_ms !== undefined) {
      sets.push(`sample_time_ms=$${idx++}`);
      params.push(sample_time_ms);
    }
    if (historize !== undefined) {
      sets.push(`historize=$${idx++}`);
      params.push(historize);
    }
    if (group !== undefined) {
      sets.push(`"group"=$${idx++}`);
      params.push(group);
    }
    if (description !== undefined) {
      sets.push(`description=$${idx++}`);
      params.push(description);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    sets.push('updated_at=NOW()');
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE variables SET ${sets.join(', ')} WHERE id=$${idx}
       RETURNING id, connection_id, name, address, data_type, config, enabled, sample_time_ms, value, last_read_at, historize, "group", description, created_at, updated_at`,
      params
    );

    // Insert into history if historize is enabled
    if (willHistorize && value !== undefined) {
      await pool.query(
        'INSERT INTO variable_history (variable_id, value) VALUES ($1, $2)',
        [req.params.id, value]
      );
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Patch variable error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/variables/:id — full update (edit)
app.put('/api/variables/:id', authMiddleware, async (req, res) => {
  const { name, address, data_type, config, group, description } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'name y address son requeridos' });
  }
  try {
    const check = await pool.query(
      `SELECT v.id FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE v.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Variable no encontrada' });
    }
    const result = await pool.query(
      `UPDATE variables SET name=$1, address=$2, data_type=$3, config=$4, "group"=$5, description=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING id, connection_id, name, address, data_type, config, enabled, sample_time_ms, value, last_read_at, historize, "group", description, created_at, updated_at`,
      [name, address, data_type || 'uint16', JSON.stringify(config || {}), group || 'main', description || '', req.params.id]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update variable error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/variables/:id/read — leer valor real del PLC
app.post('/api/variables/:id/read', authMiddleware, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT v.id, v.name, v.data_type, v.config, v.historize,
              c.host, c.port, c.config as conn_config
       FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE v.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Variable no encontrada' });
    }

    const v = check.rows[0];
    const connConfig = v.conn_config || {};
    const rack = connConfig.rack || 0;
    const slot = connConfig.slot || 1;

    const client = getClient(v.host, v.port || 102, rack, slot);
    const results = await client.readVariables([{
      id: v.id,
      data_type: v.data_type,
      config: v.config,
    }]);

    const newValue = results.length > 0 ? results[0].value : null;

    const result = await pool.query(
      `UPDATE variables SET value=$1, last_read_at=NOW(), updated_at=NOW()
       WHERE id=$2
       RETURNING id, connection_id, name, address, data_type, config, enabled, sample_time_ms, value, last_read_at, historize, "group", description, created_at, updated_at`,
      [newValue, req.params.id]
    );

    if (v.historize && newValue !== null) {
      await pool.query(
        'INSERT INTO variable_history (variable_id, value) VALUES ($1, $2)',
        [req.params.id, newValue]
      );
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Read variable error:', err);
    return res.status(500).json({ error: err.message || 'Error al leer del PLC' });
  }
});

// GET /api/variables/:id/history — historial de valores
app.get('/api/variables/:id/history', authMiddleware, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT v.id FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE v.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Variable no encontrada' });
    }
    const result = await pool.query(
      'SELECT id, value, read_at FROM variable_history WHERE variable_id = $1 ORDER BY read_at DESC LIMIT 200',
      [req.params.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/variables/history-batch — historial múltiple
app.post('/api/variables/history-batch', authMiddleware, async (req, res) => {
  const { variable_ids, from, to } = req.body;
  if (!variable_ids || !Array.isArray(variable_ids) || variable_ids.length === 0) {
    return res.status(400).json({ error: 'variable_ids (array) requerido' });
  }
  try {
    // Verify all belong to user
    const check = await pool.query(
      `SELECT v.id FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE v.id = ANY($1) AND c.user_id = $2`,
      [variable_ids, req.user.id]
    );
    const validIds = check.rows.map(r => r.id);

    let query = 'SELECT variable_id, value, read_at FROM variable_history WHERE variable_id = ANY($1)';
    const params = [validIds];
    let idx = 2;

    if (from) {
      query += ` AND read_at >= $${idx++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND read_at <= $${idx++}`;
      params.push(to);
    }
    query += ' ORDER BY read_at ASC LIMIT 5000';

    const result = await pool.query(query, params);

    // Group by variable_id
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.variable_id]) grouped[row.variable_id] = [];
      grouped[row.variable_id].push({ value: row.value, read_at: row.read_at });
    }
    return res.json(grouped);
  } catch (err) {
    console.error('History batch error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/variables/read-all — read all enabled variables from their PLCs
app.post('/api/variables/read-all', authMiddleware, async (req, res) => {
  try {
    const vars = await pool.query(
      `SELECT v.id, v.name, v.data_type, v.config, v.historize,
              c.host, c.port, c.config as conn_config
       FROM variables v
       JOIN connections c ON v.connection_id = c.id
       WHERE c.user_id = $1 AND v.enabled = true`,
      [req.user.id]
    );

    if (vars.rows.length === 0) return res.json([]);

    // Group by connection (host:port:rack:slot)
    const groups = {};
    for (const v of vars.rows) {
      const connConfig = v.conn_config || {};
      const rack = connConfig.rack || 0;
      const slot = connConfig.slot || 1;
      const key = `${v.host}:${v.port || 102}:${rack}:${slot}`;
      if (!groups[key]) {
        groups[key] = { host: v.host, port: v.port || 102, rack, slot, variables: [] };
      }
      groups[key].variables.push({
        id: v.id,
        data_type: v.data_type,
        config: v.config,
        historize: v.historize,
      });
    }

    const allResults = [];
    for (const [key, group] of Object.entries(groups)) {
      try {
        const client = getClient(group.host, group.port, group.rack, group.slot);
        const results = await client.readVariables(group.variables);
        allResults.push(...results);
      } catch (err) {
        console.error(`S7 read failed for ${key}:`, err.message);
        // Continue with other connections
      }
    }

    // Update DB with read values
    const updated = [];
    for (const r of allResults) {
      try {
        const result = await pool.query(
          `UPDATE variables SET value=$1, last_read_at=NOW(), updated_at=NOW()
           WHERE id=$2
           RETURNING id, connection_id, name, address, data_type, config, enabled, sample_time_ms, value, last_read_at, historize, "group", description, created_at, updated_at`,
          [r.value, r.id]
        );
        updated.push(result.rows[0]);

        // Historize
        const v = vars.rows.find(v => v.id === r.id);
        if (v && v.historize && r.value !== null) {
          await pool.query(
            'INSERT INTO variable_history (variable_id, value) VALUES ($1, $2)',
            [r.id, r.value]
          );
        }
      } catch (err) {
        console.error(`DB update failed for variable ${r.id}:`, err.message);
      }
    }

    return res.json(updated);
  } catch (err) {
    console.error('Read-all error:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'dist')));

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
