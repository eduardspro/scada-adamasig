const { S7Endpoint } = require('@st-one-io/nodes7');
const constants = require('@st-one-io/nodes7/src/constants.json');

/**
 * Cliente S7 para leer variables de PLCs Siemens usando @st-one-io/nodes7.
 *
 * Cada variable adamaSig tiene:
 *   config: { area, db, offset, bit }
 *   data_type: bool, uint8, int8, uint16, int16, uint32, int32, float32, float64, string
 */

class S7Client {
  constructor(host, port = 102, rack = 0, slot = 1) {
    this.host = host;
    this.port = port;
    this.rack = rack;
    this.slot = slot;
    this.endpoint = null;
  }

  async connect() {
    if (this.endpoint) return;
    const ep = new S7Endpoint({
      host: this.host,
      port: this.port,
      rack: this.rack,
      slot: this.slot,
      timeout: 5000,
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timeout')), 6000);
      ep.on('connect', () => { clearTimeout(timer); resolve(); });
      ep.on('error', (err) => { clearTimeout(timer); reject(err); });
      ep.connect();
    });
    this.endpoint = ep;
  }

  disconnect() {
    if (this.endpoint) {
      try { this.endpoint.disconnect(); } catch {}
      this.endpoint = null;
    }
  }

  /**
   * Lee todas las variables de una sola conexión PLC.
   * variables: [{ id, data_type, config: { area, db, offset, bit } }]
   * Retorna: [{ id, value }]
   */
  async readVariables(variables) {
    if (!variables || variables.length === 0) return [];

    await this.connect();
    const ep = this.endpoint;

    // Agrupar por área+DB para lecturas eficientes
    const results = [];

    for (const v of variables) {
      try {
        const config = v.config || {};
        const area = (config.area || 'DB').toUpperCase();
        const db = config.db || 1;
        const offset = config.offset || 0;
        const bit = config.bit;
        const dataType = (v.data_type || 'uint16').toLowerCase();

        let rawBytes;
        let value;

        if (area === 'M') {
          // Merkers / Flags
          const byteLen = this._byteLength(dataType, bit);
          rawBytes = await ep.readFlags(offset, byteLen);
        } else if (area === 'I') {
          const byteLen = this._byteLength(dataType, bit);
          rawBytes = await ep.readInputs(offset, byteLen);
        } else if (area === 'Q') {
          const byteLen = this._byteLength(dataType, bit);
          rawBytes = await ep.readOutputs(offset, byteLen);
        } else {
          // DB (default)
          if (dataType === 'bool' && bit !== null && bit !== undefined) {
            // Read just the byte containing the bit
            rawBytes = await ep.readDB(db, offset, 1);
          } else {
            const byteLen = this._byteLength(dataType);
            rawBytes = await ep.readDB(db, offset, byteLen);
          }
        }

        value = this._parseValue(rawBytes, dataType, bit, offset);
        results.push({ id: v.id, value });

      } catch (err) {
        console.error(`S7 read failed for variable ${v.id}:`, err.message);
        results.push({ id: v.id, value: null });
      }
    }

    return results;
  }

  /**
   * Calcula cuántos bytes leer según el data_type.
   */
  _byteLength(dataType, bit) {
    if (dataType === 'bool' && bit !== null && bit !== undefined) return 1;
    switch (dataType) {
      case 'bool':
      case 'uint8':
      case 'int8':
      case 'byte':
        return 1;
      case 'uint16':
      case 'int16':
        return 2;
      case 'float32':
      case 'uint32':
      case 'int32':
        return 4;
      case 'float64':
        return 8;
      default:
        return 2;
    }
  }

  /**
   * Convierte bytes crudos a string según el data_type.
   */
  _parseValue(buffer, dataType, bit, offset) {
    if (!buffer || buffer.length === 0) return null;

    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    switch (dataType) {
      case 'bool': {
        if (bit !== null && bit !== undefined) {
          // Extraer bit específico del byte
          const byteVal = bytes[0];
          return ((byteVal >> bit) & 1) === 1 ? 'true' : 'false';
        }
        // Byte completo como bool
        return bytes[0] !== 0 ? 'true' : 'false';
      }

      case 'uint8':
        return String(bytes.readUInt8(0));
      case 'int8':
        return String(bytes.readInt8(0));

      case 'uint16':
        return String(bytes.readUInt16BE(0));
      case 'int16':
        return String(bytes.readInt16BE(0));

      case 'uint32':
        return String(bytes.readUInt32BE(0));
      case 'int32':
        return String(bytes.readInt32BE(0));

      case 'float32':
        return bytes.readFloatBE(0).toFixed(4);
      case 'float64':
        return bytes.readDoubleBE(0).toFixed(6);

      default:
        return String(bytes.readUInt16BE(0));
    }
  }
}

// Pool de clientes por conexión
const clients = {};

function getClient(host, port = 102, rack = 0, slot = 1) {
  const key = `${host}:${port}:${rack}:${slot}`;
  if (!clients[key]) {
    clients[key] = new S7Client(host, port, rack, slot);
  }
  return clients[key];
}

module.exports = { getClient };
