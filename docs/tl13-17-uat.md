# UAT con Lisa · Tres Leches

Estado: pack preparado; **UAT real NO ejecutado**. Rama feature/tl-production-integration. No autoriza cobros reales ni despliegue.

Participantes por confirmar: Lisa (reglas/aceptación), responsable operativo (WhatsApp), responsable técnico (cuentas/infraestructura). Registrar fecha, operador, número de prueba, referencias internas y resultado en entorno protegido. No incluir teléfonos, coordenadas de clientes ni secretos en reportes públicos.

| # | Escenario y pasos | Criterio de aceptación | Evidencia local | UAT real |
|---|---|---|---|---|
| 1 | Escribir a WA1, abrir inbox, tomar conversación, responder | Origen WA1; una sola respuesta desde WA1 | Adapter HTTP fixtures + routing unit | BLOCKED — EXTERNAL CREDENTIALS |
| 2 | Escribir a WA2, crear orden, compartir GPS | Zona, mínimo, entrega y elegibilidad correctos según regla aprobada | GPS demo JVC + fixture Mapbox normalizado | BLOCKED — EXTERNAL CREDENTIALS / muestra Dubai |
| 3 | Agregar productos por debajo del mínimo | Botón y servidor bloquean Request Payment con motivo | Dominio + E2E | Pendiente Lisa |
| 4 | Orden válida → Request Payment | Checkout persistido; un enlace sale por el número original sin salir del workspace | Paymennt HTTP mock + outbox | BLOCKED — EXTERNAL CREDENTIALS |
| 5 | Completar Paymennt test; recibir actualización | GET autoritativo confirma importe/AED/referencias antes de Paid/Confirmed | Check Status mock validado; webhook real no implementado | BLOCKED — PROVIDER CONTRACT + EXTERNAL CREDENTIALS |
| 6 | Repetir notificación Paymennt | Ningún pago, mensaje o transición duplicados | Relecturas autoritativas idempotentes; webhook mock heredado | BLOCKED — PROVIDER CONTRACT |
| 7 | GPS ambiguo/no disponible → revisar → elegir zona y motivo | No adivina tarifa; selección auditada; datos comerciales desconocidos siguen bloqueando | Dominio + E2E manual | Pendiente Lisa y geo real |
| 8 | Fallo o timeout enviando enlace | No falso sent; resultado incierto no reenvía; checkout recuperable | Rechazo/timeout/recovery unit y error UI E2E | Pendiente prueba controlada |
| 9 | Confirmed → Production → Ready → Out for Delivery → Delivered | Actor/fecha/transición; cobro conciliado; sin saltos imposibles | E2E demo + dominio | Pendiente operador |
| 10 | Operar inbox/pago/zonas en 390/768/1024/1440 | Sin overflow, controles utilizables, consola limpia | Playwright y capturas | Pendiente Lisa/dispositivos reales |

## Muestra geográfica

Fixtures sintéticos basados en nombres de la tabla fuente: JLT Cluster O (30), Marina (50), JVC (100), Dubai Hills (150), DIP (200), Damac Hills (250), Deira (300), JLT Cluster B (free delivery, mínimo desconocido), Palm Jumeirah genérico (ambiguo), Al Ain (sin cobertura configurada). Punto JVC heredado solo de demo; prueba de borde usa un cuadrado sintético 0–2, no una frontera Dubai. Respuesta Mapbox usa ID `synthetic`, no ID geográfico real. Se prueban proveedor sin resultado, latitud inválida, aliases y precios pendientes. No se afirma exactitud GPS real para estos barrios.

Lisa debe proporcionar una muestra de direcciones/puntos autorizados por banda, incluyendo los límites entre Shoreline/Golden Mile y crescents y clusters JLT. Comparar resultado del proveedor con regla confirmada, registrar desacuerdos y usar resolución manual hasta verificar cada mapping. No asignar polígonos desde aproximaciones visuales.

## Lista de datos por confirmar

- Tarifa delivery de las zonas donde la tabla no la especifica: permanece null.
- Mínimo aplicable a JLT B/C/D: free delivery confirmado; mínimo null.
- REMRAN: ortografía y localidad exacta.
- Reglas y cobertura de ubicaciones amplias/ambiguas; IDs/polígonos solo con evidencia.
- Tres números/WABA actuales, migración o coexistencia y plantillas aprobadas.
- Paymennt claves de prueba, contrato de notificación firmado y forma de conseguir IDs/fechas adicionales si disponibles.
- Mapbox token y permiso de almacenamiento permanente; benchmark Dubai.

## Gates

A — INTEGRATION READY requiere contratos/adaptadores completos, tests/docs y ningún bloqueo de seguridad. **No alcanzado:** webhook Paymennt no implementado sin contrato verificable; endpoint cerrado.

B — PILOT READY requiere A más tres WhatsApps reales, Paymennt test, geo real, reglas comerciales completas, usuarios/HTTPS/volumen persistente/copias/restauración y aceptación de los diez escenarios. **No alcanzado.** Credenciales y UAT no se sustituyen con fixtures.

No-GO inmediato: número emisor incorrecto, doble cobro, doble fulfillment, importe/moneda discrepantes aceptados, zona/precio desconocidos cobrables, secretos expuestos, auth/persistencia/recuperación ausentes. Detener activación, preservar evidencia sin PII y corregir/repetir escenario.

Firma de aceptación futura: versión/HEAD ___ · fecha ___ · Lisa ___ · operaciones ___ · técnico ___ · incidencias abiertas ___ .
