CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Default admin user: admin / AdmiN
-- bcrypt hash of 'AdmiN' with 10 rounds
INSERT INTO users (username, password_hash)
VALUES ('admin', '$2b$10$FZrLokNpPMJKGjBOTxurhuHvitn08y22pktCEi9kuT4QJao9f7pX6')
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    host VARCHAR(200) NOT NULL,
    port INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'tcp',
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS variables (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER REFERENCES connections(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address VARCHAR(500) NOT NULL,
    data_type VARCHAR(50) DEFAULT 'uint16',
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    sample_time_ms INTEGER DEFAULT 1000,
    value TEXT,
    last_read_at TIMESTAMP,
    historize BOOLEAN DEFAULT false,
    "group" VARCHAR(200) DEFAULT 'main',
    description VARCHAR(500) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS variable_history (
    id SERIAL PRIMARY KEY,
    variable_id INTEGER REFERENCES variables(id) ON DELETE CASCADE,
    value TEXT,
    read_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variable_history_var ON variable_history(variable_id);
CREATE INDEX IF NOT EXISTS idx_variable_history_read ON variable_history(read_at DESC);

CREATE TABLE IF NOT EXISTS alarm_configs (
    id SERIAL PRIMARY KEY,
    variable_id INTEGER REFERENCES variables(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    ll_value DOUBLE PRECISION,
    ll_color VARCHAR(20) DEFAULT '#ef4444',
    l_value DOUBLE PRECISION,
    l_color VARCHAR(20) DEFAULT '#f59e0b',
    h_value DOUBLE PRECISION,
    h_color VARCHAR(20) DEFAULT '#f59e0b',
    hh_value DOUBLE PRECISION,
    hh_color VARCHAR(20) DEFAULT '#ef4444',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alarm_configs_var ON alarm_configs(variable_id);


