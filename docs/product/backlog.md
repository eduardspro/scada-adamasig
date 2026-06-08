# adamaSig — Product Backlog

## Epic 1: Fundación (Must)

### US-01: Inicializar proyecto con Docker
**Como** desarrollador, **quiero** tener el proyecto con Docker Compose (app + db) y estructura base **para** poder desarrollar sobre una base sólida.

Criterios de aceptación:
- Given el repo clonado, When ejecuto `docker compose up`, Then la app responde en :80 y la DB en :5432
- Given los contenedores corriendo, When reinicio el sistema, Then los datos persisten (volumen PostgreSQL)

### US-02: Login de usuarios
**Como** usuario, **quiero** autenticarme con email y contraseña **para** acceder al sistema de forma segura.

Criterios de aceptación:
- Given un usuario registrado, When ingreso credenciales correctas, Then accedo al dashboard
- Given credenciales incorrectas, When intento login, Then veo mensaje de error
- Given el usuario admin/admin, When ingreso por primera vez, Then me fuerza a cambiar contraseña
- Given sesión inactiva por 5 minutos, When intento navegar, Then me redirige al login

### US-03: Gestión de usuarios (CRUD)
**Como** administrador, **quiero** crear, editar y deshabilitar usuarios **para** controlar quién accede al sistema.

Criterios de aceptación:
- Given soy admin, When creo un usuario con email y contraseña, Then queda registrado en DB
- Given un usuario activo, When admin lo deshabilita, Then no puede hacer login

## Epic 2: Conexiones PLC (Must)

### US-04: CRUD de conexiones
**Como** ingeniero, **quiero** registrar conexiones a PLCs Siemens Profinet **para** comunicarme con los equipos de planta.

Criterios de aceptación:
- Given el formulario de conexión, When ingreso nombre, IP, Slot, Rack, Puerto y tipo Profinet, Then se guarda en DB
- Given una conexión guardada, When veo la lista, Then muestra estado (conectado/desconectado)
- Given una conexión, When hago click en habilitar/deshabilitar, Then cambia su estado
- Given una conexión deshabilitada, When intento usarla en variables, Then no aparece como opción

## Epic 3: Variables PLC (Must)

### US-05: CRUD de variables
**Como** ingeniero, **quiero** definir variables ligadas a una conexión PLC **para** monitorear datos específicos del proceso.

Criterios de aceptación:
- Given una conexión Profinet habilitada, When creo variable con nombre, área (DB/Marca/Entrada/Salida), tipo (bool/string/real/entero/word) y dirección, Then se guarda
- Given una variable creada, When veo la lista, Then muestra nombre, conexión, tipo, dirección, estado y polling
- Given una variable, When cambio el check de habilitar, Then se activa/desactiva su lectura
- Given una variable, When selecciono tiempo de polling (500ms/1s/1min), Then se lee a esa frecuencia

### US-06: Monitoreo en tiempo real
**Como** operador, **quiero** ver los valores actuales de las variables **para** conocer el estado del proceso.

Criterios de aceptación:
- Given variables habilitadas, When abro el panel de monitoreo, Then veo nombre, valor actual, timestamp y estado
- Given una variable activa, When su valor cambia en el PLC, Then se actualiza en pantalla sin recargar
- Given una variable con error de conexión, When falla la lectura, Then muestra indicador de error

### US-07: Log histórico de variables
**Como** ingeniero, **quiero** que las variables marcadas para guardado se almacenen en histórico **para** analizar tendencias después.

Criterios de aceptación:
- Given una variable con check "guardar" activado, When se lee un nuevo valor, Then se inserta registro en tabla de log (timestamp, valor)
- Given una variable sin check "guardar", When se lee, Then NO se guarda en histórico
- Given datos en histórico, When consulto por rango de fechas, Then obtengo los registros ordenados

## Epic 4: Alarmas (Must)

### US-08: Configuración de alarmas
**Como** ingeniero, **quiero** definir alarmas sobre variables **para** ser notificado cuando un valor sale de rango.

Criterios de aceptación:
- Given una variable numérica, When configuro setpoint superior y/o inferior, Then la alarma queda definida
- Given una alarma configurada, When la variable supera el setpoint superior, Then se dispara notificación
- Given una alarma, When la variable vuelve al rango normal, Then la alarma se normaliza

### US-09: Banner de alarmas activas
**Como** operador, **quiero** ver un banner con alarmas activas **para** reaccionar rápidamente a fallas.

Criterios de aceptación:
- Given alarmas disparadas, When veo la app, Then un banner superior muestra las alarmas activas
- Given una alarma activa, When se normaliza, Then desaparece del banner
- Given alarmas activas, When hago click en el banner, Then veo detalle de cada alarma

---

## Resumen MVP

| Epic | Historias | Prioridad |
|------|-----------|-----------|
| Fundación (Docker + Auth + CRUD usuarios) | US-01, US-02, US-03 | Must |
| Conexiones PLC | US-04 | Must |
| Variables + Monitoreo + Log | US-05, US-06, US-07 | Must |
| Alarmas | US-08, US-09 | Must |

**Total: 9 historias de usuario para MVP**
