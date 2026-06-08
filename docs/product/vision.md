# adamaSig — Product Vision

## Visión
SCADA web minimalista para monitoreo y control de PLCs industriales (Siemens Profinet como primer driver), con backend robusto, base de datos PostgreSQL y despliegue en contenedores Docker.

## Usuarios objetivo
- **Operadores**: Visualizan variables en tiempo real, reciben alarmas
- **Ingenieros**: Configuran conexiones PLC, variables y alarmas
- **Administradores**: Gestionan usuarios y sistema

## Stack tecnológico
- Frontend: React + TypeScript + Vite (minimalista)
- Backend: Fastify + Node.js (API REST)
- Base de datos: PostgreSQL 15
- Despliegue: Docker Compose (2 contenedores: app + db)
- Protocolos: Profinet (Siemens), MQTT (futuro), Modbus (futuro)

## MVP (Must Have)
1. Login con usuarios en DB (admin/admin → forzar cambio)
2. CRUD de conexiones PLC (Profinet: IP, Slot, Rack, Puerto)
3. CRUD de variables por conexión (nombre, área, tipo, dirección, polling)
4. Panel de monitoreo de variables en tiempo real
5. Log histórico de variables con check de guardado
6. Banner de alarmas con setpoints alto/bajo

## Próximas fases (Should/Could)
- Pantalla de visualización tipo reactor/tanque
- MQTT y Modbus como drivers adicionales
- Dashboard de histórico con gráficos
- Exportación de datos
