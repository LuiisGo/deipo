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
