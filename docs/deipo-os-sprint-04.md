# DEIPO OS — Sprint 04A: Operations & Fulfillment Foundation

Checkpoint local del 2026-10-05 (trabajo iniciado el 2026-10-04, Guatemala). Base: `origin/main` actualizado a
`67099f7d847764941412900296cb938c88c989a0`, Sprint 03 CLOSED / Sandbox accepted.
Rama: `feat/deipo-os-sprint-04-operations`. Solo 04A: sin push, PR, deploy,
migraciones remotas, activación LIVE ni cambios de datos de Producción.

## Propósito y límites de dominio

Operar cada pedido pagado desde cola hasta una resolución terminal, con tandas,
checklist, responsables e incidencias independientes. Objetivos de lanzamiento:
sold out del cupo real del drop (referencia 80 unidades), cero pedidos perdidos,
cero sobreventa y al menos 95% de entregas a tiempo. El dashboard no inventa estos
resultados ni presenta on-time como un KPI ya calculado.

- `payment_attempts` / `payment_webhook_events`: hechos del proveedor y resolución del pago.
- `orders` / `order_items`: pedido y snapshots comerciales inmutables.
- `drop_inventory` / holds / marcas de compromiso: única verdad de inventario.
- `order_fulfillment` y su historial: ejecución operativa. Cancelar aquí no cambia
  pago, inventario, importes, dirección original ni equivale a reembolso.

No se modifican 001–018, el finalizador de pagos, sus wrappers, el checkout,
`requireAdmin()`, el proxy de entrada Admin ni el storefront. El enlace nuevo en
Admin se ajusta en varias líneas en móvil y conserva blancos táctiles de 44px.

## Creación exactamente una vez y locks

Se eligió aprovisionamiento lazy mediante `ops_provision`, integrado en
`ops_queue` para founder/admin/fulfillment y en el Command Center del founder.
Cocina y driver consultan proyecciones; no aprovisionan por su cuenta.

Requisitos comprobados dentro de la transacción:

1. `orders.status = paid`.
2. `inventory_committed_at IS NOT NULL` y `inventory_released_at IS NULL`.
3. Existe un attempt `succeeded` con resolución `committed`.
4. La fila de `orders` se bloquea antes de comprobar elegibilidad y crear la ficha.
5. `UNIQUE(order_id)` y el lock retornan el mismo fulfillment ante replays.
6. Ficha, snapshot de checklist y evento `provisioned` se confirman juntos.

Un webhook duplicado no crea fichas operativas: el código de pagos se mantiene
intacto. Un pedido ya pagado antes de 019 también se reconcilia al abrir la cola.
Un pago concurrente que ya bloqueó el pedido hace esperar al aprovisionamiento;
tras su commit, se observa el estado confirmado. Si todavía está impago, se
rechaza y una consulta posterior puede reintentar. No se cachea esa reconciliación.

Lock de operaciones: advisory transaccional por drop, luego pedido, luego ficha.
Los writes de tandas y asignaciones usan el mismo lock de operaciones. Nunca
adquieren después los locks de inbox/session/drop/hold del motor de pagos. Así no
se invierte el orden de Sprint 03 (inbox → session → drop → hold → order → attempt).
El usuario y asignación del driver se vuelven a comprobar después de esperar.
Cambios de acceso usan un advisory independiente por usuario para evitar mezclar
perfiles Admin/staff bajo concurrencia.

Tradeoff deliberado: la ficha física aparece al reconciliar Operaciones, no en
el commit del pago. Antes de usar Cocina, founder/fulfillment debe abrir la cola.
Una reconciliación programada/outbox podría añadirse después; no se presenta 04A
como operación autónoma ni como garantía de puntualidad en Producción.

## Máquina de estados

```mermaid
stateDiagram-v2
  [*] --> queued: pago e inventario comprometidos
  queued --> in_prep: tanda iniciada
  in_prep --> packed: checklist completo + sello
  packed --> ready
  ready --> completed: pickup
  ready --> out_for_delivery: delivery + driver activo
  out_for_delivery --> completed
  queued --> cancelled: founder/admin con motivo
  in_prep --> cancelled: founder/admin con motivo
  packed --> cancelled: founder/admin con motivo
  ready --> cancelled: founder/admin con motivo
  out_for_delivery --> cancelled: founder/admin con motivo
```

Estados exactos: `queued`, `in_prep`, `packed`, `ready`, `out_for_delivery`,
`completed`, `cancelled`. `issue` nunca es un estado principal.

- `ops_transition` exige versión esperada. Un write concurrente obsoleto falla.
- Pickup no puede ir a reparto. Delivery normalmente exige reparto antes de completar.
- Para preparar se necesita una tanda iniciada y no terminada.
- PACKED exige al menos un componente, todas las cantidades requeridas comprobadas
  por una persona y `p_sealed = true`. Se registran `sealed_at` y `sealed_by`.
- El checklist es un snapshot por pedido: cantidad comprada × unidades por componente.
  Los componentes se configuran explícitamente una vez por drop; no hay receta ficticia.
  Si ya hay pedidos queued sin plan, la primera configuración les agrega el plan
  atómicamente con evento. Una vez configurado no se reemplaza silenciosamente.
- Fuera de `in_prep` no se pueden cambiar comprobaciones de packing.
- Overrides founder/admin, con motivo obligatorio, permiten volver a `queued` o
  `in_prep`, o cancelar. Volver a preparación/cola invalida sello y checklist para
  exigir nueva comprobación. No reabre estados terminales ni permite saltar packing.
- Cancelación normal requiere cutoff configurado y vigente. Cutoff ausente o vencido
  exige override explícito; no se interpreta null como cancelación ilimitada.
- `completed` y `cancelled` son terminales. No hay auto-refund ni reposición automática.

## RBAC y PII

Se conserva `admin_profiles` y su semántica histórica. `operator_profiles` separado
contiene exactamente `kitchen`, `fulfillment`, `driver`, con activo/inactivo,
inviter, timestamps y auditoría. `ops_set_operator` solo permite founder/admin.
El usuario debe existir en Auth; el aprovisionamiento de cuentas se realiza por
invitación administrativa. No hay autoasignación por signup, primer usuario,
correo o metadata. Tampoco UI de invitaciones en 04A. Antes de lanzamiento debe
validarse la configuración invite-only de Supabase Auth y el flujo de login staff.

Un trigger rechaza pertenencia simultánea a las dos tablas, incluso si un perfil
está inactivo. El `operator` histórico de Admin NO se convierte en kitchen ni obtiene
permisos nuevos. Una migración futura de cuentas entre dominios necesita un
procedimiento explícito que conserve su historial.

| Actor | Lectura | Mutaciones 04A |
|---|---|---|
| Founder | Command Center, operación completa, PII necesaria y Admin comercial existente | Todo el motor, acceso, configuración y overrides auditados |
| Admin | Operación completa, PII necesaria y Admin comercial existente | Igual motor; Command Center restringido a founder |
| Kitchen | Código, producto, cantidad, estado, tanda, tiempos, checklist, número de incidencias; conteos de producción | Crear/asignar/iniciar/completar tandas, registrar producción, queued → in_prep |
| Fulfillment | Cola y logística necesaria, checklist e incidencias/timeline | Aprovisionar, packing, ready, reparto/handoff, asignar driver, abrir/resolver incidencias |
| Driver | Solo fichas asignadas actualmente; nombre/teléfono/dirección/referencia/pin necesarios | ready → out_for_delivery → completed; abrir/resolver incidencias asignadas |
| Cliente | Código, producto, cantidad, estado operativo, método y horario de su ficha | Ninguna |
| Anónimo / inactivo / usuario sin perfil | Ninguna operación | Ninguna |

Kitchen nunca recibe teléfono, email, dirección, pago, proveedor, revenue ni raw
metadata de eventos. Driver no recibe `order_id`, pago, revenue ni pedidos de otros
drivers. No se copia PII en tablas de staff: los RPCs proyectan desde el snapshot
comercial. Solo los overrides logísticos explícitos contienen datos nuevos.
La pantalla founder usa código/producto/estado/tanda, sin renderizar contacto.

Todas las tablas nuevas tienen RLS activado, sin grants directos a anon,
authenticated o service_role. La autorización y proyección se realizan en funciones
privadas SECURITY DEFINER con `search_path = ''`; los wrappers públicos son
SECURITY INVOKER y tienen grants de ejecución explícitos. Service role solo recibe
el RPC nuevo de lectura del tracker. Las mutaciones usan JWT de la sesión de staff.

## Esquema exacto

019 crea estas 12 tablas (todas las FK tienen índices por PK, unique o índice explícito):

| Tabla | Persistencia principal |
|---|---|
| `operator_profiles` | user_id, role, is_active, invited_by, created_at/updated_at |
| `drop_operations_config` | drop_id, cancellation_cutoff_at, prep_lead_minutes, delivery_lead_minutes, pickup_grace_minutes, updated_by/at |
| `drop_packing_components` | drop_id, code, label, units_per_item; unique(drop_id, code) |
| `production_waves` | drop_id, sequence, planned_units, target_ready_at, started_at, completed_at, created_by/at |
| `order_fulfillment` | unique order_id, status, wave_id, version, seal actor/time, completed_at/cancelled_at, created_at/updated_at |
| `fulfillment_events` | identity id, fulfillment_id, event_type, from/to, actor, reason, metadata, created_at; append-only |
| `fulfillment_packing_checks` | fulfillment_id, component_code/label, required_quantity, checked_quantity, checked_by/at |
| `fulfillment_issues` | fulfillment_id, reason, open/resolved, opened_by/at, resolved_by/at, resolution |
| `delivery_assignments` | fulfillment_id, driver_user_id, assigned_by/at, ended_at, reason; una asignación activa |
| `production_adjustments` | wave_id, produced/waste/damaged/replacement, quantity, unique request_id, actor, reason, created_at; append-only |
| `fulfillment_logistics_overrides` | fulfillment_id, revision identity, address, guatemala_zone, instructions, optional lat/lng, actor/time/reason; append-only |
| `customer_order_access` | fulfillment_id PK, unique token_hash, expires_at, revoked_at, created_by/at |

Además: `drop_slots.max_units` nullable, sin valor de lanzamiento. El `capacity`
existente conserva sus valores y se documenta como `max_orders` logístico; no se
crea una segunda tabla de horarios. `drop_delivery_zones` existente conserva
code/label/fee/is_enabled; no se duplican zonas ni se implementa pricing por km.
No se crean fixtures comerciales en ninguna migración.

Eventos exactos: `provisioned`, `transition`, `state_override`, `wave_assigned`,
`packing_checked`, `packing_plan_set`, `issue_opened`, `issue_resolved`,
`driver_assigned`, `logistics_override`, `access_rotated`, `access_revoked`.
La configuración/staff/tandas también escriben el `audit_log` existente. Las
correcciones logísticas conservan todos los overlays y el snapshot original de
`orders`; la revisión identity define el último overlay incluso dentro del mismo
transaction timestamp. Los eventos referencian el override sin duplicar dirección.

Conteos de producción son hechos físicos positivos, separados de las ventas y el
inventario. `request_id` evita duplicarlos al reintentar; payload distinto con
la misma clave falla. Las asignaciones no exceden `planned_units` de una tanda,
incluso bajo concurrencia. `planned_start_at = target_ready_at - prep_lead_minutes`
solo se calcula si se configuró lead time. Sin duración de receta predeterminada.

## RPCs y funciones

020 expone 22 RPCs nuevos con implementaciones privadas del mismo nombre:

| Grupo | RPCs públicos |
|---|---|
| Autorización/configuración | `ops_current_role`, `ops_set_operator`, `ops_configure_drop`, `ops_update_schedule` |
| Ciclo/packing | `ops_provision`, `ops_transition`, `ops_check_packing` |
| Producción | `ops_create_wave`, `ops_wave_action`, `ops_assign_wave`, `ops_record_production` |
| Logística/incidencias | `ops_assign_driver`, `ops_open_issue`, `ops_resolve_issue`, `ops_override_logistics` |
| Acceso cliente | `ops_rotate_access`, `ops_revoke_access`, `ops_customer_tracker` |
| Lecturas | `ops_queue`, `ops_waves`, `ops_timeline`, `ops_command_center` |

Helpers privados sin execute directo: `ops_role`, `ops_require`, `ops_reason`,
`ops_drop_lock`, `ops_lock`, `ops_can_access`, `ops_event`; trigger helper de 019:
`ops_profile_separation`. Los argumentos exactos están en SQL y en
`src/types/database.types.ts`. Los tipos nuevos son aditivos al snapshot 018;
no se afirma que hayan sido generados desde Producción con 019 aplicada.

Repositorios server-only: Command Center, queue tipada por rol esperado,
production waves y dispatcher de mutaciones tipadas con JWT. El rol esperado se
vuelve a validar dentro de `ops_queue`, sin confiar en una comprobación anterior.
No se exponen aún Server Actions ni endpoints de mutación operativa.

## QR y acceso customer-safe

32 bytes de `crypto.randomBytes` codificados base64url (43 caracteres, 256 bits).
El token no contiene UUID, teléfono, email ni PII; SHA-256 es lo único persistido.
Founder/admin puede emitir/rotar/revocar; la respuesta server-only entrega el token
una vez al futuro flujo autorizado. Expiración explícita obligatoria, sin duración
inventada. Rotación invalida el token anterior y registra actor/time en eventos.

`readCustomerTracker` valida formato, hace hash en servidor y usa un RPC exclusivo
de service_role que retorna una whitelist sin UUID interno, contacto, dirección,
importes, incidencias internas o detalles de pago. El token no representa una
sesión Auth y no aparece en firmas de RPCs de mutación. El código corto existente
`D-…` se conserva como referencia humana; nunca autentica al cliente.

04A no genera imagen QR, no añade `/order/<token>` ni envía mensajes. Antes de
exponer esa ruta en 04C/04D: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
exclusión de analytics y redacción del token en logs de aplicación/infraestructura.
El checkout token no se reutiliza ni se coloca en URLs. No se registra PII/tokens
con console, audit metadata de acceso, analytics o errores de repositorio.

## Incidencias, cancelación y promesas de entrega

Razones exactas: `customer_unreachable`, `address_issue`, `missing_item`,
`damaged_order`, `late`, `delivery_failed`, `pickup_no_show`, `other`.
Ciclo `open → resolved`; el segundo resolve no genera otro evento. Pueden coexistir
con cualquier estado operativo y no modifican pago o snapshot comercial.

Pickup no-show requiere pickup, slot_end conocido, plazo de gracia transcurrido
(default operativo 30 minutos) y ficha no terminal. Solo permite abrir incidencia;
no automatiza detección, cancelación ni reembolso.

La política comercial confirmada es corte 24 horas antes del fulfillment/drop.
Debe configurarse `cancellation_cutoff_at` desde la fecha/promesa real; 04A no inventa
fecha ni calcula un corte desde medianoche cuando no hay horario definido. Cambiar
el corte requiere founder/admin con motivo y registro de valor anterior/nuevo.
No hay cancelación pública por tracker; solicitudes de cliente/reembolsos se
resolverán en fases posteriores, respetando el corte.

Ventanas previstas 18:00–19:00, 19:00–20:00 y 20:00–21:00, America/Guatemala:
son promesas al cliente, no tandas. Referencia logística: aproximadamente 35
PEDIDOS por horario, independiente de 80 UNIDADES de referencia por drop. El
checkout Sprint 02 aún no garantiza cupo transaccional por slot; 04A no lo cambia
ni afirma que max_units esté configurado. Debe resolverse antes de lanzar.

Pickup: lobby en Zona 10. Delivery propio: Zonas 10/14/15 incluidas; extras externos
explícitos por zona y zonas no soportadas deshabilitadas. Son decisiones de negocio,
no seeds de Producción. Direcciones y pin opcional tienen soporte operativo;
checkout original sigue inmutable y no agrega solicitudes libres de comida.

## Command Center

`/admin/operations`, founder-only tanto en DAL como SQL. CURRENT real desde
storefront_config; sold desde drop_inventory, pagados y estados operativos desde
DB, incidencias abiertas y atraso activo cuando ya terminó la ventana prometida.
No cuenta incidencias `late` como si fueran un estado ni inventa un porcentaje SLA.
Sin CURRENT muestra vacío; error de DB muestra error, nunca métricas simuladas.
Actualización explícita con `router.refresh()`, sin polling o cron nuevos.

Cream/black/orange existentes, español, formato Guatemala 24h, navegación móvil
sin overflow, accesibilidad WCAG A/AA automatizada. Sin cambios al storefront.

## Migración y validación

- `20261005050000_019_operations_domain.sql`: schema, RLS, índices, constraints,
  separación de perfiles y triggers de inmutabilidad.
- `20261005051000_020_operations_engine.sql`: ciclo, RBAC, DTOs, RPCs y grants.
- Read-only remoto: Producción está en PostgreSQL 17.6 y termina en018; el timestamp
  remoto018 es `20261001040748`, distinto del archivo local de aceptación, con el
  mismo SQL MD5 `bc2a56fcb2f7c3813dc3ce52c784775a`. Se conserva el historial.
- Read-only remoto: cero drops con ordering habilitado, CURRENT/NEXT null; no existe
  esquema operativo previo equivalente. No se inspecciona ni modifica PII remota.
- Runtime de pruebas instalado solo bajo `/private/tmp`. Sin recurso externo pago;
  `deipo-os-acceptance` y Producción nunca son destinos de pruebas/migración.
- Aplicación local inicial desde base vacía sobre PostgreSQL 18.4; verificación final
  desde base vacía y regresiones también en PostgreSQL 17.6.

Validación final (Node **22.22.1**):

| Validación | Resultado |
|---|---|
| Migraciones desde DB vacía PostgreSQL 17.6 | 001–020 aplicadas; 21 archivos incluyendo los dos 005 históricos |
| Sprint 01 | Regresión SQL existente aprobada |
| Sprint 02 | 78 assertions, 2 carreras con conexiones independientes |
| Sprint 03 | 279 assertions, 9 carreras con conexiones independientes |
| Sprint 04A | 364 assertions, 6 carreras con bloqueo probado en pg_stat_activity |
| Unitarias generales | 45/45 |
| Proveedor/firma/origen pagos | 80/80 |
| Tokens operativos | 2/2, incluyendo 1,000 tokens aleatorios y rechazo de códigos/PII |
| Navegador Admin | 17/17; 14 regresiones y 3 OPS; WCAG A/AA y 390/1440px |
| Navegador checkout/pagos | 18/18 |
| Command Center PostgreSQL 17.6 | Tres casos OPS repetidos contra el esquema final |
| TypeScript / lint | Aprobados, sin errores |
| Build Next producción | Webpack, Node 22.22.1, SITE_MODE=production, aprobado |
| Secret scan | 19 archivos cambiados/nuevos + 120 archivos compilados; 0 hallazgos |

Las seis carreras OPS: provisión duplicada, pago vs provisión, transición con
versión duplicada, asignaciones que compiten por cupo de tanda, conteo de producción
con request_id duplicado y reasignación de driver mientras el driver previo espera.
Los resultados no son simulaciones secuenciales; se confirma espera de lock antes
de liberar la primera transacción. Inventario/pagos se comparan antes/después de
incidencias, overrides y cancelación operativa y permanecen idénticos.

SHA-256 de migraciones finales:

- 019: `46663e70b2d498dfab8e4fd3daeceab4e8f5923c299aa9d4ffdaad6d6cba6f70`.
- 020: `cf2b3062cec77a3ec040ee81c054f4428f2c3911db13ba4ef016f3c50f09dbe7`.

Secret scan propio por patrones de credenciales/proveedor/private-key y comparación
con valores privados locales (sin imprimirlos). Incluye bundles cliente/servidor;
no sustituye un scanner de secretos del hosting ni una aceptación remota.

Archivos entregados (19):

- `AGENTS.md`, `package.json`, `docs/deipo-os-sprint-04.md`.
- Las dos migraciones019/020 de la tabla anterior.
- `src/types/database.types.ts`.
- `src/lib/deipo/operations.ts`, `src/lib/deipo/customer-access.ts`,
  `src/lib/deipo/repositories/operations.ts`.
- `src/app/admin/(protected)/operations/page.tsx`,
  `src/components/admin/refresh-operations.tsx`,
  `src/app/admin/(protected)/layout.tsx`, `src/app/admin/admin.css`.
- `scripts/test-operations-db.mjs`, `tests/operations.test.ts`,
  `tests/operations/access.test.ts`, `tests/admin-browser/operations.spec.ts`,
  `tests/fixtures/operations-db.mjs`, `tests/fixtures/supabase-http.mjs`.

Checkpoint de Git: commit local de esta documentación y código en la rama indicada.
El SHA exacto se registra en Wichiss y en la entrega; no se añade autorreferencia
circular al commit. Ninguna migración aplicada remotamente; main remoto conserva
67099f7. El entorno de aceptación no se consultó, repurposó ni eliminó.

Comandos reproducibles (Node 22 en PATH; `DEIPO_TEST_DATABASE_URL` solo loopback,
base vacía exclusiva; no usar acceptance):

```sh
node scripts/setup-orders-test-db.mjs
npm run test:db
npm run test:payments:db
npm run test:operations:db
npm test
npm run test:payments
npm run test:operations
npm run test:admin
npm run test:checkout
npm run lint
npm run typecheck
NEXT_PUBLIC_SITE_MODE=production npm run build
```

`test:operations:db` deja únicamente fixtures locales de las carreras para el
bridge de navegador. `test:admin` ejecuta las tres pruebas OPS con esa variable;
sin DB las omite explícitamente, sin sustituir métricas inventadas. El bridge
abre transacción, consulta RPC real y hace rollback. Auth HTTP es un fixture local,
no Supabase Auth/Storage real. Al terminar, detener el cluster local dedicado.

Hallazgos resueltos durante validación: nombres ambiguos de variables SQL,
serialización JSON de arrays en el harness, expectativas de ceros de fecha según
ICU, aislamiento de imports de Next en tests de tokens y overflow del menú móvil.
Las suites finales usan constraints reales; no se desactivaron triggers ni RLS.
La advertencia de imágenes loopback/SSRF del fixture checkout se conserva sin
relajar las protecciones de producción; no valida almacenamiento remoto real.

## Pendientes y alcance siguiente

No avanzar automáticamente. 04B/04C/04D: Kitchen Mode, Packing Station, scanner/QR,
login e invitaciones UI de staff, Driver Mode, tracker público, impresión,
WhatsApp manual, reporte de cierre y aceptación runtime tras release autorizado.
WhatsApp Cloud API sigue Sprint 05. No dynamic Q/km, launch date, precio final,
menú inventado, food customization libre, refund automation ni LIVE.

Falta confirmar/configurar: drop real/capacidad, precios, menú/componentes por
unidad y plan de packing, fechas/cutoff, cupos por slot y enforcement, zonas/fees,
lead times, tandas, usuarios invitados y drivers, expiración/retención de acceso y
PII, proceso de cambios de recipe plan, y resolución financiera de cancelaciones.
La aceptación local no equivale a migración ni aceptación operativa remota.

---

## 2026-10-06 — Sprint 04B: operación móvil (historia posterior a 04A)

El brief 04B autoriza continuar **la misma rama** desde
`ac917cb76f82699c74cd65e13d3fe590f26d389f`. Reemplaza únicamente el límite de
alcance que detenía 04A. Se conserva arriba su historia completa. No se modifican
001–020, no se ejecutan migraciones remotas, no se publica código ni se configura
el entorno remoto. Production ordering y Recurrente LIVE siguen sin activarse.
La base main de referencia permanece `67099f7d847764941412900296cb938c88c989a0`.

### Migraciones y cambios de arquitectura

| Archivo nuevo | SHA-256 |
|---|---|
| `20261006010000_021_slot_capacity_delivery_pin.sql` | `07faa8fbd723356d6a769c945243de870b92b01c0e68900e80ad9ac6dff73181` |
| `20261006011000_022_operations_workflows.sql` | `03872538c461dff183ea5309e16e4ee5c2c2766d07a3aeccc766cb6a58b17124` |

Los hashes019/020 siguen siendo los del checkpoint04A. No hay una segunda verdad
de inventario ni estados Kitchen en `orders.status`. La nueva validación logística
reutiliza pedidos/holds; el inventario sigue derivándose en `drop_inventory`.

021 añade `orders.delivery_latitude` / `delivery_longitude`, constraint de pareja,
rangos y exclusión en pickup. Históricos quedan null, sin backfill inventado.
El trigger existente `order_facts_immutable` ya compara todas las columnas que no
son de lifecycle: también impide cambiar las coordenadas nuevas. La creación de
**nuevos** pedidos delivery requiere dirección y ambas coordenadas. Un retry de un
pedido histórico idéntico mantiene el contrato previo. Checkout incluye entrada
numérica de coordenadas; el pin-picker gráfico es pendiente04C, sin proveedor pago.
Los overlays operativos usan sus propias coordenadas; nunca sobrescriben el original.

022 añade `operator_profiles.display_name`: trimmed, 1–100 caracteres, no interviene
en permisos. El default de compatibilidad `Pendiente de identificar` obliga a la
preparación humana antes de operar, sin inferir nombres/roles de Auth metadata.
El rol y la activación siguen en `operator_profiles`; exclusión con Admin intacta.

### Cupo transaccional exacto

`drop_slots.capacity` limita **pedidos**, `max_units` limita unidades cuando no es
null. Null significa sin límite configurado; no se siembra35 ni un tamaño de tanda.
La pantalla de configuración Admin permite ambos límites explícitos.

Para un slot se cuentan únicamente pedidos con `inventory_released_at IS NULL` y:

- `status = pending_payment`, sin compromiso de inventario, con hold `active` y
  `expires_at > clock_timestamp()`; o
- `status = paid` y `inventory_committed_at IS NOT NULL`.

Cada pedido cuenta una vez y sus unidades vienen de su hold inmutable. No cuentan
cancelados, expirados, reservas vencidas aunque el estado persistido siga active,
inventario liberado, otros slots ni fichas operativas como un inventario paralelo.
Las preventas sin pedido/slot no se asignan automáticamente a logística.

Se mantiene el lock de checkout **session → drop row → hold → order**. Dos sesiones
que compiten por cupo esperan el mismo drop; el conteo se ejecuta tras ese lock.
Retry idéntico se resuelve antes del cupo y no consume otra plaza. `SLOT_FULL`
revierte la creación del pedido, conserva el hold vigente y permite elegir otro slot.
El DTO customer solo agrega `available` por horario, calculado para la cantidad del
hold y excluyendo su propio pedido en retries. Es orientativo: SQL decide al guardar.

**Evidencia que justifica tocar el finalizador:** una reserva vencida deja libre
logística, pero el éxito del proveedor puede llegar después. 021 reemplaza la
función018 conservando todo su cuerpo salvo una comprobación de cupo antes del
branch existente review/commit. Mantiene inbox → session → drop → hold → order →
attempt, sin adquirir locks operativos. Si otro comprador ocupó el horario, conserva
el éxito como hecho financiero y usa `PAYMENT_RECEIVED_SLOT_FULL` / review_required;
no compromete inventario, no crea fulfillment y no reembolsa automáticamente.
No se reprocesa historia ni se relaja la validación Sandbox de018.

### Sync explícito y funciones

`ops_queue` y Command Center ahora son lecturas puras. Se retira la reconciliación
lazy de04A en la nueva migración. La UI ofrece **SINCRONIZAR PEDIDOS PAGADOS** en
Founder y Fulfillment, con scanned/already_present/provisioned. No hay cron ni polling
nuevo. Kitchen debe recibir una cola previamente sincronizada.

`ops_sync_paid_orders(drop_id)` exige founder/admin/fulfillment y toma el advisory
operativo del drop; enumera órdenes por UUID y reutiliza `ops_provision` con su lock
de pedido, elegibilidad paid/commit/attempt y unicidad. Repeticiones/concurrencia
no duplican fichas, checklist ni eventos. Un pago que aún no era visible durante
el scan entra en la siguiente sincronización; no se presenta como outbox automático.

Nuevos RPCs públicos, todos invoker con implementación private definer y grants
explícitos solo authenticated:

- `ops_save_operator`, `ops_operators`, `ops_drops`.
- `ops_sync_paid_orders`.
- `ops_bulk_wave`, `ops_pack_check`.
- `ops_issues`, `ops_lookup`.

Funciones reemplazadas: `private.create_pending_order_from_hold_entry`,
`private.checkout_payload`, `private.process_payment_webhook`,
`private.ops_queue`, `private.ops_role`, `private.ops_require`,
`private.ops_transition`. Nuevos helpers sin execute cliente:
`private.slot_occupancy`, `private.slot_has_room`.
Los RPCs de04A restantes se conservan; las nuevas pantallas usan packing versionado.

`ops_bulk_wave`: de1 a200 pedidos de un único drop, IDs únicos, locks ordenados por
order_id/fulfillment_id después del advisory de drop, versión esperada para cada
ficha. Asignar o preparar ocurre **todo o nada**. Reutiliza cupo de tanda y máquina
de estados04A. Un stale/cupo insuficiente revierte toda la selección.
`ops_pack_check` valida versión antes de cambiar un componente y aumenta versión.
`ops_transition` vuelve a consultar el rol tras esperar, además de la asignación.

### Invitación y acceso del personal

Rutas: `/admin/operations/staff` (solo founder), `/ops/login`, `/ops/accept`, `/ops`,
y `/ops/kitchen`, `/ops/fulfillment`, `/ops/driver` mediante segmento validado.
Endpoints server-only: `/api/ops` y `/api/ops/staff`. Son no-store, con comprobación
de origen, usuario verificado y lista explícita de acciones/roles; SQL repite RBAC.
No se despacha un RPC arbitrario suministrado por el navegador.

Founder invita por email, asigna nombre/rol, activa/desactiva y cambia rol con motivo
auditado. Auth Admin SDK corre únicamente en servidor. Para recuperarse de una
invitación enviada cuyo perfil no pudo guardarse, se busca el email exacto en Auth
(solo servidor) y se reintenta la provisión con JWT founder. Una cuenta Auth por sí
sola no recibe permisos. La UI no enumera usuarios Auth ni expone sus internals.
Muestra solo estado derivado: invitación pendiente / sesión iniciada / no disponible.
Reenvío está limitado a perfiles con invitación aún pendiente; se usa la invitación
nativa y se informa si el proveedor no permite reinvitar. No se reemplaza contraseña,
no se genera una cuenta pública, no se manda email desde otro servicio.

Configuración requerida **antes de una futura aceptación de invitaciones**:

- `SUPABASE_SECRET_KEY` server-only en runtime (sí, requerido para invitar).
- `STAFF_INVITE_ORIGIN`: origen HTTPS exacto sin path ni slash final, independiente
  de Host y de la allowlist de pagos.
- Supabase Auth con signup público deshabilitado, entrega de emails configurada y
  `${STAFF_INVITE_ORIGIN}/ops/accept` autorizado en redirect URLs.

No se establece ninguna de estas variables remotamente en04B. Sin configuración,
la invitación falla cerrada. Agregar el secreto de Supabase **no autoriza pagos**:
Recurrente secret/mode/Sandbox/origen de pago y ordering continúan siendo gates
separados. El acceptance anterior se conserva.

La invitación nativa usa su fragmento de sesión (Auth JS instalado documenta que
inviteUserByEmail no usa PKCE). `/ops/accept` elimina el fragmento de la barra antes
de establecer la sesión y permite definir contraseña; después SQL decide acceso.
No logs ni analytics de tokens. Login dirige kitchen/fulfillment/driver a su modo;
founder al Command Center y admin a Fulfillment. Inactivos y cuentas sin perfil se
rechazan. El proxy agrega `/ops` al mismo comportamiento de Auth sin inicializar
checkout en entrada anónima; `requireAdmin()` y sus reglas no se modifican.

### Flujos móviles y PII

Kitchen: drop actual o selector, tandas/conteos, búsqueda por código, filtros por
estado/tanda/slot, selección múltiple y acciones de asignación/preparación. Número,
capacidad y hora objetivo de tanda los ingresa el operador. Conteos físicos usan
request_id estable mientras un resultado sea incierto. Sin default20 unidades.

Packing: código grande, primer nombre, cantidad, slot, método, checklist configurado,
controles −/+ o COMPLETO. EMPACADO Y SELLADO permanece deshabilitado si falta un
componente; checkbox de sello requerido y SQL lo verifica. Sigue MARCAR LISTO.
El founder tiene configuración inicial del plan y corrección explícita auditada.
Regresar a cola/prep invalida checklist/sello conforme a04A.

Fulfillment: sincronización, packing/ready/pickup/delivery, driver por nombre,
incidencias abiertas/resueltas y overrides founder/admin. Pickup usa la etiqueta
configurada (base de negocio lobby Zona10) y ready → completed con sesión autorizada.
Buscar por código no autentica a ningún cliente. No-show continúa respetando la
configuración de gracia, sin cancelación/refund automático.

Driver: solo deliveries activas actualmente asignadas, sin enum de otros drivers,
tandas, pagos ni revenue. Muestra logística necesaria y pin original/overlay.
ready → out_for_delivery → completed; al completar sale de la lista activa.
Reasignación revoca el acceso del driver anterior en SQL, incluso tras esperar lock.

Scanner interno04B: entrada de lector externo que escribe el token/URL o pegar QR;
siempre existe búsqueda manual por código. Una URL debe pertenecer al mismo origen
antes de extraer `/order/<token>`. El servidor hace SHA-256 y consulta `ops_lookup`
con JWT founder/admin/fulfillment. Identificar NO completa: la acción separada exige
RBAC, estado y versión. No se abre el tracker público, no se genera QR cliente, no se
solicita cámara ni se transmite imagen. Decodificación por cámara queda diferida.

WhatsApp: `src/lib/ops/messages.ts` centraliza pickup listo/en camino/localización;
links manuales, sin ETA inventada, automatización, API, seguimiento ni analytics.
Teléfono y mapas son acciones externas iniciadas por el operador, con noreferrer.

| Actor | Proyección04B |
|---|---|
| Founder/Admin | Cola operacional completa; lista de perfiles. Gestión UI/endpoint de staff solo founder |
| Kitchen | Código, ID de fulfillment necesario para acción, producto, cantidad, estado, slot, tanda, checklist, conteo de incidencias; nunca UUID comercial/contacto/pin/pago/revenue |
| Fulfillment | Logística necesaria + drivers activos con nombre/ID/rol; sin Auth internals |
| Driver | Logística de entregas activas asignadas, issues asignados; sin otros drivers/pedidos/payment/order_id |
| Customer | DTO checkout propio; `available` por horario, sin ocupantes ni PII de terceros |

Targets móviles48px, blanco/crema/negro/naranja, español, sin emojis ni nuevo estilo
SaaS. Refresh manual, bloqueo de doble-submit, errores visibles; no optimistic writes
ni polling operativo. Cambiar filtros no solicita datos adicionales.

### Evidencia de validación04B

Validación ejecutada con Node **22.22.1**, PostgreSQL local desechable, fixtures
sintéticos. Sin recursos externos, mensajes reales ni cambios en Supabase/Netlify.

- Sprint01 SQL: aprobado. Sprint02:78 aserciones y2 carreras. Sprint03:279 y9.
- Sprint04A:388 aserciones y6 carreras; pruebas originales preservadas, fixtures
  delivery reciben pin. El conteo incluye la matriz de grants para RPCs adicionales.
- Sprint04B:158 aserciones y7 carreras. Incluye3 compradores simultáneos por2 cupos,
  max_units, sync duplicado, bulk con cupo, packing stale y pago tardío vs nuevo pedido.
  Las carreras observan `pg_stat_activity.wait_event_type = Lock` antes de liberar.
- SQL02–04B total:903 aserciones,24 carreras reales. Constraints/RLS no deshabilitados.
- Unitarias generales47/47; proveedor/firma/origen80/80; operaciones/tokens6/6.
- Admin/Ops navegador23/23:14 regresiones Admin,3 Command Center y6 flujos04B; Chrome,
  390px y1440px, WCAG A/AA, entrada cero cookies, perfiles inactivos y whitelist PII.
- 80 unidades:40 pedidos multiunidad,3 slots, sincronización + asignación + prep masiva
  en57–77ms en PostgreSQL local; navegador carga/filtra el fixture sin overflow.
  Es una prueba local representativa, **no** el ensayo operacional04D ni SLA remoto.

La primera ejecución de npm se resolvió a Node20 por Volta. Se corrigió invocando el
binario22 explícitamente;47 unitarias y23 navegador pasaron con22. Se corrigieron
nombres accesibles de selects y el indicador de configuración de invitaciones.
La entrada anónima de Admin sigue sin construir Auth ni fabricar cookie checkout.

- Migración final desde otra base PostgreSQL17.6 vacía:23 archivos001–022 aplicados;
  regresiones SQL completas repetidas con los mismos resultados.
- Checkout/pagos navegador:18 casos existentes aprobados; nuevo caso delivery/pin/slot
  lleno aprobado,19 casos distintos en total. El caso nuevo valida la propiedad
  nativa `HTMLOptionElement.disabled` (el matcher genérico de Playwright no la
  reconocía aunque el atributo y árbol accesible ya mostraban disabled).
- Storefront/packaging:42/42,320–1440px. Total de casos browser distintos:84.
- Build final Next16.3.5 webpack, `NEXT_PUBLIC_SITE_MODE=production`, Node22.22.1:
  aprobado. TypeScript y lint sin errores ni warnings de código.
- Secret scan:49 archivos fuente/documentación modificados/nuevos y146 compilados
  cliente/servidor;0 hallazgos por patrones de credenciales y valores privados locales
  exactos, sin imprimirlos. No se usa esto como evidencia de un scan del hosting.
- No se imprimió ni se agregó un secreto al commit; `.env.example` solo documenta
  el nombre vacío `STAFF_INVITE_ORIGIN`. Los harnesses usan credenciales sintéticas.

Para reproducir: usar **el ejecutable Node22** (Volta puede interceptar `npm`),
`DEIPO_TEST_DATABASE_URL` con una base loopback vacía y exclusiva; ejecutar
`node scripts/setup-orders-test-db.mjs`, scripts `test-orders-db`, `test-payments-db`,
`test-operations-db`, `test-operations-04b-db`, luego `test-admin` y `test-checkout`.
`test-checkout` acepta filtros Playwright como `--grep 'delivery checkout'`.
El último fixture04B deja40 pedidos/80 unidades para browser; nunca usar acceptance.
Las pruebas storefront requieren build local preview; después se reconstruye en
production. Invocaciones unitarias conservan `--conditions=react-server` para pagos
/operaciones. Los clusters locales se detienen al terminar; sus archivos se conservan.

Warnings conocidos: fixtures de imágenes HTTP loopback disparan la protección SSRF
de Next; se conserva sin habilitar dangerouslyAllowLocalIP. Los tests de refresh
revocado y DB caída generan errores esperados. Ninguno acredita Auth/email/Storage
remoto ni reemplaza la aceptación runtime después de un release autorizado.

### Lo que falta para04C/04D y lanzamiento

Detenerse en04B. Hace falta autorización nueva para cualquier push/PR/deploy,
aplicación019+ o cambio de entorno. Antes de lanzar: configurar cupos reales por
slot (null no protege un máximo de negocio), plan/fechas/cutoff/lead times, menú y
precio reales, zonas/fees y usuarios con nombres válidos. Resolver expiración y
retención de tracker/PII; validar invitación/email/contraseña y roles en Supabase real,
Safari/iPhone real, y el runtime Netlify. El bridge local comprueba contratos y SQL,
no entrega emails ni prueba el proveedor Auth remoto.

04C: pin-picker cómodo, tracker público pulido/QR cliente, eventual cámara y
experiencia final de etiquetas/impresión según alcance nuevo. 04D: ensayo completo,
reporte de cierre y aceptación operacional. No se implementan automatización de
WhatsApp, CRM/loyalty/ERP, analítica Meta/GA, rutas óptimas, Q/km, refunds, menú/precio
inventados, fecha pública o LIVE. El siguiente sprint no empieza automáticamente.

### Archivos del checkpoint04B

- `.env.example`.
- `AGENTS.md`.
- `docs/deipo-os-sprint-04.md`.
- `package.json`.
- `playwright.admin.config.ts`.
- `scripts/test-admin.mjs`.
- `scripts/test-checkout.mjs`.
- `scripts/test-operations-04b-db.mjs`.
- `scripts/test-operations-db.mjs`.
- `scripts/test-orders-db.mjs`.
- `src/app/admin/(protected)/drops/[id]/page.tsx`.
- `src/app/admin/(protected)/operations/page.tsx`.
- `src/app/admin/(protected)/operations/staff/page.tsx`.
- `src/app/api/ops/route.ts`.
- `src/app/api/ops/staff/route.ts`.
- `src/app/ops/(staff)/[mode]/page.tsx`.
- `src/app/ops/accept/page.tsx`.
- `src/app/ops/actions.ts`.
- `src/app/ops/layout.tsx`.
- `src/app/ops/login/page.tsx`.
- `src/app/ops/ops.css`.
- `src/app/ops/page.tsx`.
- `src/components/checkout/live-checkout.tsx`.
- `src/components/ops/accept-invite.tsx`.
- `src/components/ops/console.tsx`.
- `src/components/ops/login.tsx`.
- `src/components/ops/packing-plan.tsx`.
- `src/components/ops/staff.tsx`.
- `src/components/ops/sync.tsx`.
- `src/lib/deipo/checkout.ts`.
- `src/lib/deipo/repositories/mutations.ts`.
- `src/lib/ops/auth.ts`.
- `src/lib/ops/contracts.ts`.
- `src/lib/ops/http.ts`.
- `src/lib/ops/messages.ts`.
- `src/lib/ops/repository.ts`.
- `src/lib/ops/staff.ts`.
- `src/proxy.ts`.
- `src/types/database.types.ts`.
- `supabase/migrations/20261006010000_021_slot_capacity_delivery_pin.sql`.
- `supabase/migrations/20261006011000_022_operations_workflows.sql`.
- `tests/admin-browser/operations-04b.spec.ts`.
- `tests/checkout-browser/checkout.spec.ts`.
- `tests/fixtures/checkout-http.mjs`.
- `tests/fixtures/operations-db.mjs`.
- `tests/fixtures/operations-helpers.mjs`.
- `tests/fixtures/supabase-http.mjs`.
- `tests/operations/04b.test.ts`.
- `tests/proxy.test.ts`.

Commit local: el SHA exacto se registra en Wichiss y en la entrega, evitando una
autorreferencia al hash. La rama queda ahead1 del checkpoint04A; no push/PR/deploy.


---

## 2026-10-07 — Sprint 04C: Customer Experience + Omnichannel Commerce

Continuación local del checkpoint04B `9a17969a6c848c307224c90edf526d92e666cb37`,
en la misma rama `feat/deipo-os-sprint-04-operations`. El nuevo brief supersede
únicamente el límite de alcance04B; arriba se conserva su historia. Ningún archivo
001–022 se modifica. Sin push, PR, deploy, migraciones/configuración remota, LIVE,
activación de ordering ni inicio04D. Los fixtures y todos los RPCs de validación
corren exclusivamente en PostgreSQL desechable loopback.

### Un motor comercial, tres canales de lanzamiento

`orders.sales_channel` es `NOT NULL DEFAULT 'web'`, con check de valores
`web`, `whatsapp_manual`, `admin_assisted`, `whatsapp_api`. Históricos quedan web;
no se infiere de contacto/referrer. `assisted_by_user_id` es FK nullable a Auth,
indexada; se escribe al crear el pedido, no mediante un UPDATE posterior. Ambos
quedan protegidos por el trigger existente de snapshots inmutables.

`private.create_commercial_order` extrae el cuerpo021 con dos parámetros privados
de atribución y usa el deadline efectivo. El entrypoint público histórico sigue
siendo web-only; no acepta un canal enviado por el cliente. La nueva función no
tiene grants directos a anon/authenticated/service_role. No se duplican tablas
de pedidos, snapshots, inventario, pagos o reconciliación.

La mesa `/admin/operations/sales` exige founder/admin en aplicación y SQL. Recoge
contacto, cantidad, método, slot, zona, dirección/referencia y pin; enumera borradores
y deriva estados desde order/hold/último attempt: DRAFT, RESERVED, AWAITING PAYMENT,
TRANSFER PENDING, PAID, EXPIRED, REVIEW y CANCELED. CLAIMED es un timestamp factual,
no un estado comercial competidor. El pedido real enlaza a su detalle Admin.

Analytics interno por drop/canal: pedidos, unidades, valor bruto de los pedidos,
importe pagado comprometido y conteos pagados por tarjeta/transferencia. El valor
bruto está rotulado separado del revenue; pendientes/review no son ingresos pagados.
No se calcula conversión ni se agregan Meta/GA/UTMs.

### Borrador, claim y flujo WhatsApp

`assisted_sale_drafts` contiene intención y cotización, **sin reserva**. Token de32
bytes aleatorios/base64url, solo SHA-256 en DB, expiración absoluta explícita,
creator autenticado y canal manual. RLS habilitado, sin acceso directo incluso
service_role, índices de FK, no-delete y trigger de hechos inmutables. Solo se
permite una transición atómica a claimed con session_hash/order_id.

Founder genera `CUSTOMER_COMMERCE_ORIGIN/buy/<token>`, copia o abre una conversación
manual WhatsApp. No UUID/contacto en URL. El token se entrega una vez al crear el
borrador; perder esa respuesta requiere crear otro borrador, nunca reservar a ciegas.
La expiración del borrador se elige explícitamente (máximo técnico7 días, sin default
de negocio). El link es un acceso al checkout DEIPO, no un checkout de proveedor
precreado que reserve stock.

GET `/buy` no consume nada: crea una cookie checkout normal y ofrece REVISAR MI
PEDIDO. Este paso explícito evita que los previews de WhatsApp consuman el enlace.
POST same-site `/api/customer/claim` manda el token en cuerpo, hace hash en servidor
y llama un RPC service-only. Bajo lock de borrador -> session -> drop se verifican:
expiración, cliente del replay, CURRENT/publicación/gate/ventana, precio y fee
cotizados, inventario, método/slot/cupo/zona/dirección/pin. Hold y pedido canónicos
se crean juntos y la reclamación se consume en el mismo commit. Un fallo revierte
todo. No cambia cantidad, slot o precio silenciosamente. Un checkout preexistente
se rechaza; una reclamación repetida solo retorna el pedido de la misma sesión.

La cookie sigue siendo256 bits, HttpOnly, Secure en HTTPS, host-only, SameSite=Lax.
El token del enlace no se reutiliza como cookie. Otro cliente no puede volver a
reclamar ni cancelar el pedido ya vinculado a la sesión ganadora. El resumen del
pedido precede a Recurrente; ningún redirect o screenshot confirma el pago.

Flujo manual: WhatsApp -> founder mesa de ventas -> link DEIPO -> revisión del
cliente -> Recurrente -> webhook verificado -> inventario comprometido -> Ops ->
tracker. `whatsapp_api` está reservado por el schema de pedidos pero rechazado
por la creación manual de drafts. Sprint05 deberá incorporar un adaptador autenticado
de servicio con creator/auditoría propios para esa misma intención/claim; no se
habilita una identidad de staff implícita ni una segunda reserva.

### Transferencia: referencia, métodos y deadline efectivo

Recurrente recibe exactamente `card` y `bank_transfer` por línea, sin cuotas.
`bank_transfer_memo = 'DEIPO' + order_code sin guion`, por ejemplo
`DEIPOD8626F64A7F6F`:18 caracteres alfanuméricos, longitud constante, único por el
código immutable/unique del pedido y sin PII. No se cambia la referencia al retry.
Una colisión activa reportada por el proveedor falla de forma explícita; no se
genera otra referencia ni se duplica el checkout automáticamente.

El cliente exige que la respuesta confirme ambos métodos, ningún método adicional
y el memo esperado antes de redirigir. Si faltan o difieren, queda creation_unknown
para revisión segura; no anuncia un método inexistente. Se conservan en el attempt
`provider_payment_methods` y `provider_bank_transfer_memo`, junto a status/IDs/fechas
ya soportados. Históricos y fixtures legados admiten null en estos dos campos.
Metadata agrega `sales_channel`; se conserva `integration_version=sprint-03` como
versión del protocolo vigente, no como versión de la interfaz.

Referencia oficial consultada: [Crear checkout de Recurrente](https://docs.recurrente.com/referencia-api/api-reference/checkouts/create-checkout).

`drops.bank_transfer_grace_seconds` empieza null. El máximo604800 es un límite
técnico de seguridad, no una duración de lanzamiento. Solo el primer pending
verificado y correlacionado del intento, `type=bank_transfer`, mientras hold activo
y aún vigente, puede escribir `inventory_holds.payment_pending_until` y su
`payment_pending_attempt_id`. El deadline es el primer tiempo de recepción/proceso
verificado + duración configurada. Replays o nuevas deliveries del mismo pending
no lo extienden; configurar gracia después de observar pending tampoco lo renueva.

Decisión conservadora: **pending tardío no resucita una reserva vencida**. Si el
cliente dejó vencer el hold antes del primer webhook, solo succeeded puede recuperar
capacidad por la comprobación autoritativa preexistente. Esto evita competir por
stock ya ofrecido a otros clientes por una transferencia todavía impaga.

Deadline único = `greatest(expires_at, payment_pending_until)`. Se actualizan
`drop_inventory`, ocupación de slots, DTO checkout, expiración de sesión, cancelación,
preparación de pago, estado de pago/recibo, proyección Admin y finalizador. Los
recuentos usan tiempo actual después de locks; no requieren cron. El expires_at
original nunca se reescribe. Solo un RPC controlado modifica la extensión; se
retira UPDATE/INSERT/DELETE directo de service_role sobre holds.

Failure/canceled correlacionado limpia únicamente la extensión del mismo attempt,
dejando el plazo original si todavía existe. Succeeded compromete una vez. Expirado
el plazo efectivo, el finalizador revalida inventario y slot; sin cupo registra el
éxito financiero y review_required, sin fulfillment ni auto-refund. Tarjeta pending
no obtiene gracia. Null conserva la política03 de reservas válidas.

Reemplazo exacto del finalizador021: se conserva orden inbox -> session -> drop ->
hold -> order -> attempt, monotonicidad, Sandbox exacto y dedupe; se agrega validación
de amount/currency/correlación para eventos no terminales antes de efectos de reserva,
atribución de canal cuando viene en metadata, extensión/limpieza acotadas y uso del
deadline efectivo. No adquiere locks Ops ni aprovisiona fulfillment. Eventos de
correlación incorrecta quedan diagnosticados; ningún dato del cliente autoriza pago.

### Tracker, entrega del token y QR

GET `/order/<token>` es una lectura server-only con whitelist. Código, drop/producto,
cantidad, pickup/delivery, slot, pago confirmado y progreso. Queued -> CONFIRMED,
in_prep -> PREPARING, packed -> PACKED, ready -> READY, out_for_delivery -> ON THE WAY,
completed -> DELIVERED o PICKED UP. Pickup omite reparto. Cancelación operativa
informa atención necesaria sin inventar refund. Sin horario se indica por confirmar.

El tracker público solo existe después de paid + inventario comprometido/no liberado
+ attempt succeeded/committed. TRANSFERENCIA EN PROCESO se muestra en el recibo privado
de la sesión, con deadline vigente cuando existe, refresh finito/manual y sin QR
operacional previo al pago. Review required nunca recibe una promesa de fulfillment.

POST `/api/customer/access` exige mismo origen y checkout cookie propia. Comparte
`private.provision_committed_order` con `ops_provision`; toma únicamente advisory
Ops -> pedido, comprueba pago/commit dentro del lock, crea snapshot de packing y
evento exactamente una vez. No toma locks de inbox/session/drop/hold después, por
lo que no invierte el protocolo de pagos. No llama RPCs de mutación Ops generales
con identidad inventada. `actor_kind=customer_claim` permite actor NULL únicamente
para provisioned/access_rotated; staff conserva actor obligatorio. Sync explícito
04B continúa como fallback, y las lecturas de colas siguen puras.

Token aleatorio256 bits; SHA-256 para lookup. Para recuperación durable se agrega
un **envelope AES-256-GCM**, nonce aleatorio96 bits, tag128 bits, AAD/version fija,
a `customer_order_access`. El servidor verifica hash tras descifrar. La clave32
bytes vive en `CUSTOMER_ACCESS_ENCRYPTION_KEY`, nunca DB, cliente o repositorio.
No se persiste token plaintext. El RPC devuelve el envelope solo a servidor capaz
de autenticar la sesión; navegador recibe únicamente URL/QR. Replays devuelven el
envelope existente, incluso bajo dos claims simultáneos; no rotan al recargar.

`tracker_access_seconds` null bloquea provisión automática, sin duración inventada.
Staff puede emitir/rotar con expiración absoluta o revocar desde impresión; los
replays del cliente no reactivan acceso revocado/expirado. Cambiar/perder la clave
requiere rotar los accesos afectados con nueva clave; links ya entregados siguen
funcionando por hash hasta expiración/revocación. Reencriptado masivo/retención de
PII no forma parte04C. Una rotación por el RPC04A antiguo invalida el envelope
para evitar recuperación de un token viejo; usar la nueva UI para entrega durable.

QR con [node-qrcode](https://github.com/soldair/node-qrcode) local, PNG/data URI,
error correction M y margen4. Codifica únicamente el origen configurado + `/order/`
+ token; sin contacto, UUID, payment ID o servicios QR externos. Se muestra en
tracker, recibo verificado y etiquetas cuando hay acceso. El test decodifica el
PNG con jsQR y verifica igualdad byte a byte del URL. Identificación no autoriza
entrega: scanner04B continúa requiriendo JWT, estado y versión.

Headers: no-store privado y CDN, noindex/nofollow, no-referrer en buy/order/success,
API y print. No analytics ni console de tokens; logging de request paths buy/order
excluido en Next dev. **Pendiente antes de release:** verificar redacción/exclusión
de logs de acceso/errores en infraestructura Netlify; este cambio local no puede
certificar ni modificar el logging remoto bajo las restricciones del brief.

### Pin, printing y storefront

Geolocalización por botón USAR MI UBICACIÓN, preview, AJUSTAR PIN MANUALMENTE con
pareja de coordenadas requerida y fallback visible al denegar permiso. Dirección
sigue requerida y notas opcionales; pickup no pide ubicación. Adapter pequeño
`browserLocation`, sin SDK/tiles/provider externo, credencial pública, geocoding
automático, cuenta o costo contratado. **No hay mapa visual configurado**; el flujo
entrega la alternativa explícitamente solicitada cuando no hay proveedor. El
snapshot original021 y overrides auditados permanecen separados. Permissions-Policy
permite geolocalización same-origin; solo checkout/ventas asistidas llaman la API
tras pulsar el botón. El permiso del documento debe sobrevivir navegación SPA
desde el storefront/login; una policy global deny con override solo por ruta no
funciona al navegar sin recargar. Cámara/micrófono siguen bloqueados.

`/ops/print/<fulfillment>` requiere founder/admin/fulfillment, nunca kitchen/driver
o token público. Formatos packing/pickup/delivery/sheet, thermal genérico y A4 con
CSS de páginas nombradas. No binding a impresora. Bag labels incluyen código, primer
nombre, cantidad, fecha/slot/método y checklist donde corresponde. Solo delivery
es un documento logístico interno con teléfono/dirección/referencia actuales,
incluido overlay auditado. QR opcional cuando existe acceso vigente; raw envelope
no se serializa al cliente. Páginas enlazadas desde cada ficha de Fulfillment.

La superficie de compra conserva identidad: COMPRAR ONLINE + PEDIR POR WHATSAPP,
negro/crema/naranja y texto Tarjeta · Transferencia bancaria. Número empresarial
configurable `NEXT_PUBLIC_SALES_WHATSAPP_NUMBER` (solo dígitos internacionales).
Sin número válido no se fabrica CTA. Copy y deep links centralizados, sin Cloud API,
bot, webhook de WhatsApp, tracking o envío automático. Solo CURRENT alimenta el
número de drop del mensaje; no se inventa DROP001.

### Rutas, funciones y matriz de privacidad

Rutas nuevas: `/admin/operations/sales`, `/api/ops/sales`, `/buy/[token]`,
`/api/customer/claim`, `/api/customer/access`, `/order/[token]`, `/ops/print/[id]`.
Checkout, success, storefront y la cola Ops reciben mejoras aditivas.

RPCs nuevos authenticated (RBAC interno): `sales_create_draft`, `sales_desk`,
`sales_configure`, `sales_rotate_access`, `sales_print`. Service-only: `sales_claim`,
`customer_claim_access`. Cada RPC tiene wrapper invoker y private definer de
search_path vacío, grants explícitos y PUBLIC execute revocado.

Helpers privados nuevos sin ejecución cliente: `effective_hold_deadline`,
`create_commercial_order`, `assisted_facts_immutable`, `provision_committed_order`.
Reemplazados: `hold_facts_immutable`, `expire_checkout_session`, `slot_occupancy`,
`checkout_payload`, `prepare_payment_checkout`, `customer_payment_state`,
`process_payment_webhook`, `cancel_pending_order_impl`, `save_payment_checkout`,
`create_pending_order_from_hold_entry`, `ops_provision`, `ops_rotate_access`,
`ops_customer_tracker`. Views reemplazadas: `drop_inventory`, `admin_order_state`.

| Superficie / actor | Datos y autoridad |
|---|---|
| Founder/Admin ventas | Intención con contacto/logística; crea links/configura política; ningún paid manual |
| Cliente con checkout cookie | Solo su pedido/recibo; reclama draft y acceso tras commit; no staff auth |
| Tracker público | Código/producto/cantidad/método/slot/progreso; ningún contacto, UUID, importe, issue o provider ID; read-only |
| Packing/pickup/sheet | Founder/Admin/Fulfillment; primer nombre/cantidad/slot/checklist/QR; sin dirección/teléfono |
| Delivery print | Founder/Admin/Fulfillment; logística necesaria con overlay; documento interno |
| Kitchen / driver | Proyecciones04B intactas; sin acceso a mesa de ventas ni impresión privilegiada |
| SQL / servidor | Claim hash; tracker hash + envelope cifrado; secretos solo servidor, ningún raw token en DB |

### Validación y checkpoint04C

Node **v22.22.1**, PostgreSQL **17.6** aislado en loopback. Base nueva desde cero:
26 archivos de migración001–025, incluidos los dos005 históricos. Los23 archivos
001–022 son byte-idénticos al checkpoint04B. Migraciones nuevas solo locales:

| Migración | SHA-256 |
|---|---|
| `20261007010000_023_commerce_reservation.sql` | `c143e0ea85fd4f683c2a5fb7788701609418ebc49e7b051b7699f5a77b68b847` |
| `20261007011000_024_assisted_commerce.sql` | `0145e15a5bbbe5b3d28941a9c58c12a01e221d505a1f783f05a7000d957073e7` |
| `20261007012000_025_customer_access.sql` | `1a9fa087dcff2963724a85c4e34c2bf47c9474e8f8f583e3511fb361b2e0726f` |

| Validación final | Resultado |
|---|---|
| Sprint01 schema/RLS/regresión | PASS sobre base recién creada |
| SQL Sprint02 | 78 aserciones / 2 carreras |
| SQL Sprint03 | 279 aserciones / 9 carreras |
| SQL Sprint04A | 388 aserciones / 6 carreras |
| SQL Sprint04B | 158 aserciones / 7 carreras |
| SQL Sprint04C | 170 aserciones / 7 carreras |
| Total SQL | **1073 aserciones / 31 carreras reales** |
| Unitarias generales | 47 PASS |
| Unitarias pagos + operaciones | 97 PASS; total **144** |
| Browser checkout/pagos/comercio | 26 PASS; total browser **91** |
| Browser Admin/Ops | 23 PASS |
| Browser storefront | 42 PASS |
| Fixture80 unidades | 40 pedidos / 3 slots; sync + asignación + prep **80ms** |
| TypeScript / ESLint | PASS |
| Build production webpack | PASS con Node22 |
| Secret scan | Sin coincidencias; ver alcance abajo |
| Histórico001–022 / whitespace diff | Byte-idéntico / PASS |

Las carreras SQL esperan un bloqueo real observado en `pg_stat_activity`, con
clientes independientes. Las siete nuevas cubren: claim competido entre clientes;
claim duplicado misma sesión; pending transferencia contra comprador; pending
ocupando último slot; claim tracker contra sync Ops; extensión vigente después
del vencimiento original mientras espera otro comprador; comprador que gana stock
vencido antes de un pending tardío. No hay oversell, sobrecupo ni resurrección de
holds vencidos. Persisten carreras históricas de webhook, cancelación, slots,
provisión, bulk y packing versionado.

QR: decodificación jsQR tanto de PNG generado como del screenshot de la etiqueta
bajo `media=print`, igualdad exacta del URL original. Browser incluye390px y1440px,
accesibilidad automática del tracker, ventas asistidas pickup/delivery, revisión,
recibo web, revoke/rotate, aislamiento, permisos de impresión, pin real del navegador
y fallback al denegar. No reemplaza aceptación Safari/iPhone ni impresora física.

Comandos reproducibles (Node22 en PATH; DB desechable **localhost** previamente
seleccionada mediante `DEIPO_TEST_DATABASE_URL`; nunca apuntar a Production):

```sh
node scripts/setup-orders-test-db.mjs
node scripts/test-orders-db.mjs
node scripts/test-payments-db.mjs
node scripts/test-operations-db.mjs
node scripts/test-commerce-db.mjs
node scripts/test-operations-04b-db.mjs
npm test
npm run test:payments
npm run test:operations
npm run test:checkout
npm run test:admin
NEXT_PUBLIC_SITE_MODE=preview npm run build
npm run test:e2e
NEXT_PUBLIC_SITE_MODE=production npm run build
npm run typecheck
npm run lint
git diff --check
```

Warnings esperados: fixtures de imágenes loopback rechazados por protección SSRF
de Next, imagen faltante intencional, fallo DB intencional y NO_COLOR/FORCE_COLOR.
No se habilitó `dangerouslyAllowLocalIP` ni se debilitó seguridad para hacer pasar
pruebas. Los fallos iniciales detectaron contraste del tracker, espera del aviso
de revocación y Permissions-Policy durante navegación SPA; corregidos y revalidados.

Secret scan: archivos nuevos/modificados más65 bundlesJS cliente del build final;
comparación exacta con2 valores privados presentes en `.env.local`, sin imprimirlos,
y patrones de clave privada/credencial LIVE. **Cero coincidencias.** No es garantía
de auditoría universal. `.env.local` no se modificó ni se agregó al commit; nuevos
valores comerciales quedan vacíos en `.env.example`. Dependencias auditadas aparte.

Archivos cambiados en este checkpoint (50):

- `.env.example`.
- `AGENTS.md`.
- `docs/deipo-os-sprint-04.md`.
- `next.config.ts`.
- `package-lock.json`.
- `package.json`.
- `scripts/test-checkout.mjs`.
- `scripts/test-commerce-db.mjs`.
- `scripts/test-operations-db.mjs`.
- `src/app/admin/(protected)/operations/page.tsx`.
- `src/app/admin/(protected)/operations/sales/page.tsx`.
- `src/app/api/customer/access/route.ts`.
- `src/app/api/customer/claim/route.ts`.
- `src/app/api/ops/sales/route.ts`.
- `src/app/buy/[token]/page.tsx`.
- `src/app/globals.css`.
- `src/app/ops/(staff)/print/[id]/page.tsx`.
- `src/app/ops/(staff)/print/[id]/print.css`.
- `src/app/order/[token]/page.tsx`.
- `src/components/checkout/live-checkout.tsx`.
- `src/components/checkout/reserve-button.tsx`.
- `src/components/commerce/assisted-claim.tsx`.
- `src/components/commerce/pin-picker.tsx`.
- `src/components/commerce/print-controls.tsx`.
- `src/components/commerce/sales-desk.tsx`.
- `src/components/commerce/tracker-access.tsx`.
- `src/components/drop/controls.tsx`.
- `src/components/ops/console.tsx`.
- `src/components/receipt/payment-status.tsx`.
- `src/lib/commerce/access.ts`.
- `src/lib/commerce/contracts.ts`.
- `src/lib/commerce/location.ts`.
- `src/lib/commerce/messages.ts`.
- `src/lib/commerce/qr.ts`.
- `src/lib/deipo/operations.ts`.
- `src/lib/payments/errors.ts`.
- `src/lib/payments/recurrente/client.ts`.
- `src/lib/payments/recurrente/types.ts`.
- `src/lib/payments/repository.ts`.
- `src/proxy.ts`.
- `src/types/database.types.ts`.
- `supabase/migrations/20261007010000_023_commerce_reservation.sql`.
- `supabase/migrations/20261007011000_024_assisted_commerce.sql`.
- `supabase/migrations/20261007012000_025_customer_access.sql`.
- `tests/checkout-browser/checkout.spec.ts`.
- `tests/checkout-browser/commerce.spec.ts`.
- `tests/checkout-browser/payments.spec.ts`.
- `tests/fixtures/checkout-http.mjs`.
- `tests/operations/commerce.test.ts`.
- `tests/payments/provider.test.ts`.

Commit local: SHA exacto en Wichiss y entrega, evitando autorreferencia. Rama
`feat/deipo-os-sprint-04-operations`, padre `9a17969a6c848c307224c90edf526d92e666cb37`.
Después del commit, árbol limpio y ahead1 del checkpoint remoto04B. Main remoto
verificado read-only en `67099f7d847764941412900296cb938c88c989a0`. Sin push/PR/deploy,
DDL/env remotos, activación de ordering/LIVE ni trabajo04D.

### Configuración pendiente y bloqueo de lanzamiento

Sin inventar fecha, menú, precio, cupos por slot, fees, lead times, gracia bancaria
o vigencia tracker. Configurar por separado el origen HTTPS exacto de comercio,
clave cifrado y su custodia, teléfono empresarial y políticas por drop. Persisten
los gates independientes de ordering, Recurrente Sandbox y PAYMENT_ALLOWED_ORIGIN.
No basta con configurar CUSTOMER_COMMERCE_ORIGIN para autorizar un pago.

Resolver la auditoría de dependencias antes de release: npm reporta9 paquetes
afectados (8 high,1 critical), todos existentes con **las mismas versiones que
9a17969**: Next, sharp, source-map-js, @next/eslint-plugin-next, eslint-config-next,
brace-expansion, braces, fast-glob y micromatch. Ninguno proviene de qrcode/jsQR.
No se ejecutó audit fix ni una actualización mayor/ajena de framework en este
checkpoint. Esta evidencia es distinta del secret scan.

Además: aceptación real Auth/roles/email, Safari/iPhone, permisos de geolocalización,
Recurrente métodos/memo en Sandbox real, impresora física/QR y runtime/logs Netlify
solo tras autorización de release. Conservar infraestructura de aceptación y
Production existentes. STOP04C; ningún ensayo04D ni WhatsApp Cloud API iniciado.

## 2026-10-08 — Sprint 04D release candidate and launch rehearsal

**Release decision: NO-GO for DROP 001.** Local hardening is implemented. Remote acceptance remains incomplete: Preview configuration, real staff Auth/invite delivery, a new end-to-end Sandbox payment roundtrip, physical iPhone/printing, final business policies and hosting token-log controls are not accepted. This section does not authorize merging, Production migrations, ordering, LIVE payments or Sprint05.

### Scope and implementation

Continued `feat/deipo-os-sprint-04-operations` from `d576f0dd3b54a5cb02a3addc5c9692ea4d27eeab`. Historical migrations 001–025 are byte-identical. No broad redesign, scheduler, WhatsApp API or new observability platform.

- 026 adds configurable abandoned-draft redaction and clears expired/revoked tracker envelopes. Founder-only, audited, idempotent, deterministic and row-lock serialized. A previously discovered PL/pgSQL alias collision was fixed before remote application and all final SQL tests rerun.
- 027 adds founder-only current operational reports, immutable first-close snapshots and readiness checks. Close serializes through the Ops lock; a repeated close returns the same snapshot and does not emit another event. Closing does not lock fulfillment, change payment state, refund, release stock or delete history. Corrections remain visible in the separately labeled current report.
- `/admin/operations/release` exposes configuration gaps, retention controls, close and printable reports. Tables support keyboard scrolling at 390px. The API requires founder identity and exact same-origin POST. No raw errors or prior PII are returned.
- Payment copy and provider requests use explicit `NEXT_PUBLIC_PAYMENT_METHODS`: `CARD_ONLY` or `CARD_AND_BANK_TRANSFER`. Unconfigured means no payment-method promise and checkout creation fails closed. Response methods must match the requested set; transfer requires the exact memo. There is no silent card-only fallback. `PAYMENT_ACCEPTANCE_CONFIRMED` records the founder's verified set; readiness rejects mismatches. Configure public/server mode together and rebuild the deploy.

### Dependency advisory triage

Preserved machine-readable audit before/after/runtime results and affected dependency trees in `docs/evidence/sprint-04d/`. Initial audit: **8 high + 1 critical** affected packages. Final full audit: **5 high + 0 critical**. Runtime audit (`--omit=dev`): **0**. These are affected-package counts, not unique advisory counts.

Minimal patches: Next and eslint-config-next 16.3.5 → 16.3.8; sharp 0.35.4 → 0.35.5; source-map-js 1.2.1 → 1.2.2; brace-expansion 1.1.18 → 1.1.21 and 5.0.9 → 5.0.12. No force fix, framework major migration or automated downgrade. Node 22.22.1 used for builds and tests; npm initially ran under the machine's Node20 shim and emitted engine warnings, so that invocation is not Node22 build evidence.

| Advisory | Dependency / applicability and preconditions | Disposition |
| --- | --- | --- |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | next direct runtime; ImageResponse with attacker-controlled SVG/style. DEIPO's OG content is static trusted artwork, not customer SVG. | REMEDIATE NOW, patched 16.3.8. Critical removed. |
| [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) | next runtime; concurrent Draft Mode/use-cache fill. No such application path found. | REMEDIATE NOW, 16.3.8. |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | next runtime; self-hosted SSG/ISR cache poisoning. Adapter-specific reachability not proven. | REMEDIATE NOW, 16.3.8. |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | next development MCP endpoint; not served by a Production build. | DEV-ONLY / NOT RUNTIME RELEVANT; patched 16.3.8 anyway. |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | next runtime metadata dynamicParams bypass; DEIPO metadata image is static. | REMEDIATE NOW, 16.3.8. |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | next runtime SSG/ISR cross-user cache substitution; infrastructure preconditions not fully established. | REMEDIATE NOW, 16.3.8. |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | next runtime image optimizer SSRF; configured storage origin only. Local QA image rejection confirms private-IP protection remains enabled. | REMEDIATE NOW, 16.3.8; do not enable dangerouslyAllowLocalIP. |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp direct dev tool plus Next optional dependency; crafted SVG/librsvg input. Supplied image pipeline is controlled. | REMEDIATE NOW, 0.35.5. |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js transitive CSS/build tooling; hostile indexed source maps. | REMEDIATE NOW, 1.2.2. |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion transitive tooling; crafted brace pattern quadratic CPU use. | REMEDIATE NOW, 1.1.21 / 5.0.12. |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion transitive tooling; deeply nested group recursion. | REMEDIATE NOW, same patches. |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion transitive tooling; parseCommaParts stack exhaustion. | REMEDIATE NOW, same patches. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 via micromatch 4.0.8 → fast-glob 3.3.1 → @next/eslint-plugin-next 16.3.8 → eslint-config-next 16.3.8. Crafted deeply nested glob reaches lint tooling; no request handler accepts globs. Five inherited package findings, one underlying advisory. | DEV-ONLY / NOT RUNTIME RELEVANT, ACCEPT TEMPORARILY for tooling. No patched braces release available at audit time; suggested Next14 downgrade is incompatible. |

Temporary tooling owner: DEIPO maintainer / founder. Controls: keep lint/build input reviewed, do not run hostile glob patterns, run CI with bounded time, retain lockfile. Upgrade target: first braces patch that fixes the advisory and a compatible Next16 lint dependency chain; re-audit before release and track in Sprint05+ maintenance without starting that sprint. No known critical runtime finding remains in the recorded audit. Static reachability assessments above are code-review inferences, not exploit proofs.

### Retention policy and limits

| Record | Implemented policy | Launch decision still required |
| --- | --- | --- |
| Unclaimed assisted draft | Redact `details` only when expired, unclaimed, not connected to an order and past `expires_at + assisted_draft_retention_days`. Keep minimal identity/channel/price/expiry/audit fact and one redaction timestamp. Audit never copies the removed values. No revival or mutation of other immutable fields. | Founder must select final days. Null blocks cleanup; acceptance uses explicit 0 days only. |
| Real order/payment/inventory | Preserve immutable commercial and financial snapshots. No paid-record deletion or automatic order redaction. | Founder must establish accounting/support retention with appropriate jurisdictional advice; this sprint invents no legal duration. |
| Tracker access | Existing explicit `tracker_access_seconds`; hash lookup, server AES-GCM envelope, expiry/revoke checks. Expired access returns no order even if envelope remains. Revoke now removes envelope immediately; controlled cleanup removes expired envelopes. Rotation invalidates the old token. | Final duration, post-drop cleanup schedule, key custody and founder responsibility. Acceptance 3600 seconds only. |
| Operational overrides | Preserve append-only actor/time/reason and original order snapshot. No new automatic deletion because audit/support requirements are unresolved. | Separate logistics/contact retention decision remains a launch condition; no claim of completed lifecycle cleanup. |

Cleanup is a deliberate founder action, not a cron. Run after the configured horizon and after closing each drop; the report records the cleanup counts. The operation can redact sensitive data irreversibly, so use the explicitly configured policy and review eligible scope. Concurrent duplicate cleanup yields one audit fact; concurrent close yields one immutable snapshot. No RLS or triggers were disabled for tests.

### Acceptance environment and migrations

Preserved `deipo-os-acceptance` (`zyixizuutoyccouuijjz`) was restored from inactive state. Waited for ACTIVE_HEALTHY and original 001–018 history before writes; transient empty responses during startup were not treated as an empty database. No new Supabase project created.

Acceptance has **28 migration records, 001–027 including the two historical 005 files**. Remote 019–027 SQL MD5 matches local contents. All local SHA256/MD5 values are in `migration-hashes.json`.

| Migration | Remote version | SQL MD5 |
| --- | --- | --- |
| 019 | 20261008142307 | a9c0778c48259c2d4aa5d347bd84d0fd |
| 020 | 20261008142326 | c8b49c0b96c932442390cf6908182826 |
| 021 | 20261008142329 | 322bf686722709ff67bbb6a3ece5f861 |
| 022 | 20261008142332 | cbc6d4fc7a8528c9d4b64ef52d65278c |
| 023 | 20261008142340 | 43ae5da1912edb1bb4812fb0cab502ca |
| 024 | 20261008142344 | 39a4dbf546deb8e4bb4822f1d85754b7 |
| 025 | 20261008142347 | 4204111da5fe50fa5b671daa28acc639 |
| 026 | 20261008202213 | 2855ba81c57a9a5ca6ea1f845aae630b |
| 027 | 20261008202217 | 783fe5d9483c85b43aa2e01b3e6c5b87 |

New 04D migration SHA256:

- 026: `c6970eda5ce21e3403596d16f121ed10bc2d10d4e278e1de7a35fd22d5334c27`
- 027: `0787aef77fa6dfe23b3ef0d154db5c630e0144ea19b81eda28e410a98e2d09d3`

Remote synthetic DROP 9004 `ecae5fac-5735-4c83-80a6-2881b42c9776`, named **ACCEPTANCE / NOT CUSTOMER DATA / 04D**, has 80 units, synthetic Q5 price, optional max9, pickup/delivery, slots18–19/19–20/20–21 with explicit order capacities14/13/13 and unit capacities28/26/26, zones10/14/15 free plus16 Q1, three packing components, grace60s, tracker3600s, draft-retention0d. This is a draft with ordering OFF. Existing DROP9001 and CURRENT assignment are preserved. Auth-backed operations config/waves/staff are pending. Values are test configuration, not migration defaults or Production proposals.

### Provider evidence versus fixtures

`provider-methods.json` records two actual Sandbox HTTP201 creations at 20:33:58 UTC on 2026-10-08. The production client first verified `/test` environment=sandbox and exact existing Sandbox ID. Both returned live_mode=false; checkout responses omitted sandbox_id, so identity comes from the mandatory preflight, not an invented response field.

- **PROVIDER-CONFIRMED:** CARD_ONLY returns exactly card, no memo required; CARD_AND_BANK_TRANSFER returns card+bank_transfer and exact requested bank_transfer_memo. The initial Q1 request was rejected with documented provider message minimum Q5, then corrected only in synthetic fixtures. No payment was submitted by these creation probes; no database order was fabricated for them.
- **Historical evidence only:** Sprint03 card acceptance remains recorded in the previous closeout. It is not new 04D Preview roundtrip evidence.
- **FIXTURE-CONFIRMED:** local signed Svix browser tests and parser tests cover pending/succeeded/failed/canceled, replay, expiry, environment mismatch and review. The 80-unit SQL rehearsal invokes normalized webhook consumer RPCs directly; those particular events are not signed network/provider deliveries.
- **NOT VALIDATED in new Preview:** card success/decline return, real provider pending/failed/canceled delivery to the new Preview and staff/customer full remote journeys. Existing Sandbox webhook is preserved, not reconfigured or deleted.
- Real bank transfer settlement is not possible in Sandbox. [Recurrente's Sandbox guide](https://docs.recurrente.com/guides-english/guides/sandboxes-and-test-clocks) states that simulations do not contact banks or processors. Its webhook helper tests delivery contracts without constructing the underlying domain flow. Offering bank transfer is confirmed; settlement is not.

Grace evidence (`grace-timestamps.json`, UTC): original expiry20:30:22.410, extended deadline20:30:25.414. At20:30:22.569 the original deadline had passed and one unit remained held; at20:30:25.674 grace had expired and held units were0 before late success. Separate tests assert retained slot, no replay renewal, no card grace, failure/cancel clearing, late success capacity commit, no-capacity review and genuine races. These accelerated seconds and the remote60s setting are acceptance-only values. Financial data and slot counts are asserted, not inferred from UI timers.

### Staff Auth, customer journeys and rehearsal

Acceptance currently has zero Auth users. The available Supabase connector can migrate/query but does not provide acceptance service credentials. Local SUPABASE_SECRET_KEY is associated with a different project and was not reused. Netlify CLI is unauthenticated and the site configuration page still requires login. No site/Production environment variable was changed. Real founder invite delivery, `/ops/accept`, password setup/session and staff role redirects are **PENDING**; no direct inserts into remote auth.users were used to imitate real Auth. Controlled recipient email addresses are also pending from the founder.

Required Preview-only setup after login: acceptance Supabase URL/publishable/service credentials, exact STAFF_INVITE_ORIGIN, CUSTOMER_COMMERCE_ORIGIN and PAYMENT_ALLOWED_ORIGIN for the new Preview, fresh server-only CUSTOMER_ACCESS_ENCRYPTION_KEY, explicit methods and matching acceptance acknowledgement, suitable test WhatsApp number, existing Sandbox key/ID/webhook secret. Verify callback allowlist for `/ops/accept`. Never set these payment credentials in Production or allow wildcard origins.

Local customer browser tests cover storefront purchase, pickup/delivery pin, assisted WhatsApp/admin draft review+claim, fake-provider redirect/receipt, tracker/QR, expiry/revocation, geolocation success/denial, no fake paid confirmation, stock/slot errors and manual fallback. WhatsApp remains a manually opened deep link with DEIPO styling. Signed fixtures are labeled as such. These tests do not establish remote Auth or real email delivery.

The preserved local rehearsal (`local-rehearsal.json`) covers **40 orders / 80 units**, three channels, card+transfer fixtures, pickup+delivery, 1/multi-unit quantities, 3 slots, 3 waves, one address override, sealed frozen packing checklists, assignment/reassignment, delivery lifecycle, one delivery issue resolved, waste1/damaged1/replacement1. **39 completed + 1 explicitly open pickup no-show = 40 accounted; zero oversell, slot overbooking or lost paid orders.** Expired claim, slot-full, payment-review, QR decoding and code fallback are covered by adjacent SQL/browser suites, not misrepresented as completed remote operator actions within this single script. On-time ≥95% is **NOT VALIDATED**: execution is accelerated and dates synthetic.

Founder report includes drop, order/unit counts, sold percentage, gross order value, verified successful payment amount (including review), committed paid amount, method/channel splits, pickup/delivery, completed, both cancellation domains, review, lost operational rows, issues, production adjustments, slot distribution and timestamp-derived durations/late counts. Monetary values are explicitly labeled centavos. First close remains stable after repetition; live corrections appear separately. Print CSS is A4-friendly, and browser print rendering does not prove physical readability.

### Mobile, physical printing and launch checklist

WebKit equivalent is exercised at390px, including customer geolocation/assisted review/tracker/QR and Ops roles. Physical iPhone Safari remains **PENDING HUMAN VALIDATION**. For the final configured Preview, founder must record device/OS/date and result:

- [ ] Safari390px: storefront → online checkout → pickup/delivery → deny location and enter pin manually → Hosted Checkout → return → receipt/tracker.
- [ ] WhatsApp deep link → founder assisted draft → customer `/buy` review/claim → payment → tracker; repeat with expired link.
- [ ] Real invite email for Kitchen/Fulfillment/Driver → `/ops/accept` → password/session → role redirect; deactivate staff and verify denial.
- [ ] Kitchen has no contact/payment PII; Fulfillment checklist/seal and code fallback; Driver sees only assigned deliveries after reassignment.
- [ ] Print packing, pickup and delivery labels on the actual A4/thermal device; inspect clipping, contrast, code and logistics access boundaries.
- [ ] Scan QR from phone screen and printed paper; compare order; complete manual code fallback. Physical printing/scanning is **PENDING**.
- [ ] Complete plausible timed 80-unit operations with operators and record ≥95% on-time only if measured; resolve or document every paid order.

### Hosting privacy and error UX

Application review retains private/no-store and no-referrer on buy/order/receipt, no analytics on capability routes, server-only keys and no application token/path console logging. Next's incoming-request ignore rule is not a platform log-redaction guarantee.

[Netlify log-drain documentation](https://docs.netlify.com/manage/monitoring/log-drains/) exposes request paths; its optional PII exclusion removes client_ip/user_agent, not a documented capability-path redaction. No path-level redaction/disable setting was verified in this account. **Platform token logging remains unproven and is not accepted as a public-launch risk in this checkpoint.** High entropy prevents guessing but does not protect a token read from a log. Tracker is PII-free/read-only; unclaimed buy tokens can expose intended contact/logistics, so expiry alone is insufficient without verified log access/retention controls.

Before GO: prove platform controls and document founder risk acceptance for bounded token lifetime/log-reader access, or use a focused mitigation: deliver capability in URL fragment, exchange through same-origin POST for a scoped HttpOnly session, then clear fragment and use fixed request paths. This is a proposed security change, not an implemented claim; verify POST logging/body redaction too. No platform logging controls or drains were changed.

Existing customer/ops errors remain actionable for full slot, insufficient inventory, payment review/pending, expired claim, invalid/revoked tracker, inactive operator, driver assignment and stale version. SQL/browser tests cover these outcomes. No new stack traces, service keys or internal database IDs are intentionally displayed to customers. Admin retains manual payment review visibility.

### Validation and release gates

Final SQL run from an empty PostgreSQL17.6 database applies all28 migration files without disabling RLS/triggers. Sprint01 passed; Sprint02 78 assertions/2 races; Sprint03 279/9;04A403/6;04B158/7;04C170/7;04D71/2: **1,159 assertions and33 races**, plus Sprint01 regression and separate80-unit rehearsal. Grace timestamp logging was corrected and the complete04C suite passed again.

Required founder gates remain explicit: CURRENT, published, capacity, price, menu/components, opening/closing/fulfillment date, cancellation cutoff, pickup/delivery, intended3slots/capacities, zones/fees, packing, optional max quantity and lead-time decision, transfer grace when enabled, tracker/draft retention, actual ready staff, WhatsApp, runtime keys/origins and method acceptance. Syntactically present values cannot prove real menu/pricing or trained staff; the panel always requires final founder acceptance and never enables ordering.

Production baseline: project `qntjxfmwblhetpsmzzhm` has001–018 only (19 records), orders0, CURRENT/NEXT null, ordering-enabled drops0, hold TTL600. Drop-row aggregate MD5 `056d3ea1d4fc18e228759510e1f67d9d`. Netlify published deploy `6abddcecea4c8a000840c3cb`, main `67099f7d847764941412900296cb938c88c989a0`. No Production mutations, merge, LIVE endpoint or cleanup authorized/performed. Final remote checkpoint and postflight evidence are recorded below after release.

Local browser/build evidence: Chrome checkout26 and storefront42 passed; WebKit checkout26 and Admin/Ops24 passed, including390px, geolocation permission/denial, assisted review, fixture payment return, tracker, QR, Kitchen/Fulfillment/Driver and release-report accessibility. General unit47 + payment/operations102 =149 passed. Typegen, TypeScript, ESLint and production build on Node22.22.1 passed. Final secret review compared changed files and751 client/server build artifacts (134 clientJS bundles) against the two actual local private credential values, plus private-key/live-key patterns: no findings. Credentials unavailable locally (webhook/encryption key) cannot be exact-value compared; reviewed server-only boundaries and synthetic test values instead. No actual staff/customer/assisted plaintext token was added to source/evidence. No `.env.local` changes or secret-bearing logs committed.

Known validation warnings: Node NO_COLOR/FORCE_COLOR warning; intentionally revoked Auth refresh fixtures produce generic test-runtime errors; Next image optimization rejects loopback mock-storage images. SSRF protection remains intact. Initial browser failures caused by reused mutated Ops fixtures were resolved by generating a fresh04B fixture for each browser run. This is local fixture isolation, not a production data reset.

Reproduce using Node22 and a disposable loopback PostgreSQL17.6 URL in `DEIPO_TEST_DATABASE_URL`: run `scripts/setup-orders-test-db.mjs` only against an empty DB; then test-orders-db, test-payments-db, test-operations-db, test-commerce-db, test-release-db, rehearse-release and test-operations-04b-db. Browser tests need those fixtures. Reset with test-operations-04b-db before each Admin browser execution; run scripts/test-admin.mjs. Use `DEIPO_BROWSER=webkit` and installed Playwright WebKit for equivalent acceptance. Customer tests use scripts/test-checkout.mjs; storefront expects a preview-mode build, then finish with a production-mode build. Never point any fixture helper at remote Supabase. Evidence deliberately excludes Playwright traces containing synthetic capability URLs.

Production postflight confirms the same001–018 migration history, zero orders, zero ordering-enabled drops, null CURRENT/NEXT and TTL600. Repeating the original fingerprint expression `md5(string_agg(to_jsonb(d)::text,'' order by id))` gives the exact baseline `056d3ea1d4fc18e228759510e1f67d9d`. The published Production deploy still points to main67099f7. A JSON-array hash is a different serialization and must not be compared to this string-aggregation baseline.

Final Chrome Admin/Ops rerun:24/24 passed including the new release report. Total final browser coverage: Chrome92 (26 checkout +24 Admin/Ops +42 storefront), WebKit50 (26 checkout +24 Admin/Ops). Physical device and actual remote customer acceptance remain separate pending gates.

### Published implementation checkpoint and Preview acceptance

Implementation commit and normal-push remote SHA: `f7d7495c1876226443a5efd8ef79aa3c8c52fd5c`. [Draft PR5](https://github.com/LuiisGo/deipo/pull/5) targets main and remains unmerged. The GitHub connector lacked PR-write permission; the existing Git HTTPS authentication created the Draft PR without printing or persisting credentials.

Netlify deploy `6ac84ae644082b0008565239` is READY, context deploy-preview, branch feat/deipo-os-sprint-04-operations, exact commit f7d7495. URL: [Deploy Preview5](https://deploy-preview-5--deipo.netlify.app). A documentation-only follow-up records this evidence; its PR head can be verified separately without changing the tested implementation.

Fresh zero-cookie Chrome at390px passed read-only runtime smoke: direct `/admin/login`200, protected `/admin`→login, `/ops/login`200, storefront200/ORDERS CLOSED, invalid buy/order access with no-store/no-referrer and no horizontal overflow. Request IDs and status/header facts are preserved in `preview-smoke.json`; the invalid strings are not real capabilities. This confirms direct-entry runtime, not authenticated staff or a completed payment journey. The Preview still needs its explicit04D settings, acceptance Auth/users and operational fixture activation.

Post-Preview Netlify project check still reports published Production deploy `6abddcecea4c8a000840c3cb`; remote main remains `67099f7d847764941412900296cb938c88c989a0`. Production database postflight and fingerprint are unchanged as recorded above. No Production env mutations, merge, LIVE payments, cleanup or Sprint05 work. Final classification stays **NO-GO for launch** with the enumerated acceptance/business/privacy blockers.
