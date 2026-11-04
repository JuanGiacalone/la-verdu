# La Verdu: PRD v1.0 (listo para implementar)

| Campo | Valor |
|---|---|
| Versión | 1.0 |
| Fecha | 2026-11-01 |
| Estado | Aprobado para implementación. Iteración 1 con perfil de despliegue B (híbrido). |
| Origen | `idea.md` y las decisiones de la conversación registradas en la sección 26 |
| País | Argentina |
| Idioma del documento | Español. Identificadores de código, tests, commits y docs técnicos en inglés. |
| Idioma del producto | Español rioplatense (voseo) para el asistente, la hoja impresa y los avisos. |

**Cómo leer este documento.** Los identificadores son estables y los usan el resto de los artefactos:

- `RF-nn`: requisito funcional.
- `BR-nn`: regla de negocio.
- `RNF-nn`: requisito no funcional.
- `ADR-nn`: decisión técnica.
- `I<n>` / `T<n.m>`: iteración y tarea del plan de implementación.
- `E2E-nn`: escenario de aceptación end-to-end.
- `P`: valor propuesto, ajustable con evidencia.

---

## 1. Resumen ejecutivo

La Verdu es un asistente que atiende por WhatsApp Business a clientes, vendedores y dueños de fruterías y verdulerías, por texto o audio. Gestiona:

- disponibilidad y precios del día por sucursal;
- la toma y confirmación de pedidos;
- la impresión de cada pedido en la sucursal que lo prepara.

El pesaje y el precio final se resuelven en la balanza y en el ticket que se adjunta físicamente a la hoja. El sistema no cobra, no factura y no calcula montos finales.

Incluye un panel de administración para el dueño y el operador técnico.

La primera iteración corre en el **perfil híbrido** (backend en la nube, agente de impresión en cada sucursal). La arquitectura queda preparada para el **perfil en sitio**, con LLM y STT locales, sin cambiar la lógica de negocio.

## 2. Contexto y problema

Hoy los pedidos llegan como mensajes sueltos y audios largos que el personal transcribe a mano. Los precios y la disponibilidad cambian durante el día y el cliente se entera tarde. El vendedor atiende el mostrador y no puede responder todos los chats.

Este diagnóstico es un supuesto a validar en el piloto (I6).

## 3. Objetivos, métricas y no objetivos

### 3.1 Objetivos

- **OBJ-1:** más del 80% de los pedidos de cliente se toman sin intervención humana (P, medido en piloto).
- **OBJ-2:** un pedido confirmado sale impreso en menos de 30 s desde la confirmación, con la impresora online (P).
- **OBJ-3:** una actualización diaria de precios y disponibilidad por audio se completa en menos de 5 min (P).
- **OBJ-4:** cero pedidos confirmados sin confirmación explícita del cliente (BR-01, verificable por test).
- **OBJ-5:** cero precios o disponibilidades inventados por el asistente (BR-02, verificable por eval).

### 3.2 Métricas

| Métrica | Definición | Fuente |
|---|---|---|
| Autonomía | Pedidos confirmados sin escalamiento / pedidos iniciados | Base de datos |
| Reclamos por producto | Reclamos por cada 100 pedidos | Registro manual en el panel (campo en el pedido, opcional) |
| Latencia de impresión | Tiempo entre confirmación y `PRINTED` | Tabla `print_jobs` |
| Fallos de impresión | Trabajos `FAILED` o `ABANDONED` por día | Tabla `print_jobs` |
| Tiempo del personal | Encuesta mensual | Manual |
| Precisión de interpretación | Porcentaje de casos del eval set interpretados correctamente | Suite de evals (sección 21) |

### 3.3 No objetivos (fuera de alcance)

- Pagos online, links de cobro, anticipos o integración con Mercado Pago como procesador. Mercado Pago es solo una etiqueta de método.
- Facturación electrónica o comprobantes fiscales. Se hace fuera del sistema.
- Control de stock físico o contable.
- Zonas de reparto, ruteo o cálculo de costos de envío.
- Calidades de producto. Salen del sistema por completo.
- Cuenta corriente con saldo o control de deuda. Es solo una etiqueta de método.
- App móvil nativa.
- Estado de cobro o de preparación obligatorio.

## 4. Usuarios, roles y permisos

| Rol | Canal | Puede hacer | No puede hacer |
|---|---|---|---|
| **Cliente** | WhatsApp | Darse de alta, consultar precios y disponibilidad de referencia, pedir, modificar y cancelar sus pedidos, elegir sucursal preferida, editar sus datos | Ver pedidos de otros clientes, cambiar precios o disponibilidad |
| **Vendedor** | WhatsApp | Cargar disponibilidad y precios de su sucursal (con confirmación), tomar pedidos a nombre de clientes, responder escalamientos | Administrar usuarios, sucursales o productos. Cambiar la configuración. |
| **Dueño** | WhatsApp + admin | Todo lo del vendedor en todas sus sucursales, más ABM de usuarios, sucursales, productos, métodos de pago y horarios, y reimpresión | Operar el servidor o los secretos |
| **Operador técnico** | Admin (acceso separado) | Ver estado de flujos, cola de impresión, logs técnicos, reiniciar agentes | Modificar pedidos o precios de negocio |

Notas de permisos:

- La identidad de personal se resuelve por número de WhatsApp en la lista de personal activo. El número no alcanza para acciones sensibles: cualquier cambio de precio o disponibilidad exige confirmación explícita (RF-07).
- El backend valida el rol en cada acción. El LLM no decide permisos (BR-18).
- El dueño recibe todos los avisos de todas sus sucursales. Un vendedor recibe avisos solo de su sucursal.

## 5. Alcance por iteración

| Iteración | Contenido | Perfil |
|---|---|---|
| **I0** | Fundamentos, entorno local, simuladores | Ambos (dev) |
| **I1** (MVP) | I0 a I5 completas | Perfil B (híbrido) |
| **I2** | I6 piloto y endurecimiento. I7 perfil en sitio. | B, luego A |

La "iteración 1" de este documento equivale al MVP completo (I0 a I5) sobre el perfil B. La decisión de hardware de IA solo bloquea I7.

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| BR-01 | Un pedido pasa a `CONFIRMED` solo con una respuesta afirmativa explícita del cliente al resumen. Ningún silencio, emoji ambiguo o respuesta parcial alcanza. |
| BR-02 | El asistente nunca inventa precios, disponibilidades ni productos. Todo dato sale de la base de datos vía herramientas. |
| BR-03 | Un ítem que no se mapea a un producto del catálogo no llega a impresión. Pasa a escalamiento (RF-15). |
| BR-04 | Todo producto está disponible en una sucursal, salvo que exista un registro `UNAVAILABLE` para esa sucursal y esa jornada. |
| BR-05 | Un registro `UNAVAILABLE` de la jornada anterior pasa a `PENDING_CHECK` al inicio de la nueva jornada. Mientras esté en `PENDING_CHECK`, el asistente lo trata como no disponible hasta que el personal lo confirme (supuesto S-01). |
| BR-06 | El precio vigente se guarda sin hora de informe. Cada cambio queda en el log de auditoría (con fecha) por seguridad, pero el sistema no ofrece historial de precios. |
| BR-07 | Todo cambio de precio o disponibilidad cargado por el personal se confirma con eco antes de aplicarse (RF-07). |
| BR-08 | El precio es referencial. El total final lo define el ticket de balanza. El sistema nunca presenta un total como cerrado. |
| BR-09 | No hay pagos anticipados ni cobros en el sistema. El método de pago es una preferencia para el personal. El cobro es externo. |
| BR-10 | Los métodos de pago se configuran por sucursal. Solo los activos se ofrecen en el chat. |
| BR-11 | Las notas son texto libre de hasta 200 caracteres, escrito por el asistente o por el cliente. |
| BR-12 | Los estados de cobro y de preparación son opcionales. El sistema no genera recordatorios ni alertas por falta de actualización. |
| BR-13 | Modificar y cancelar un pedido no tiene plazo. Cada modificación o cancelación genera una emisión impresa nueva. |
| BR-14 | El pedido se imprime en la sucursal que lo prepara, que puede no ser la preferida del cliente (RF-29). |
| BR-15 | Si un pedido se deriva, se deriva completo: todos sus ítems van a la misma sucursal. |
| BR-16 | Un pedido nunca se imprime si no está confirmado. Un pedido confirmado fuera de horario se imprime al inicio de jornada (RF-30). |
| BR-17 | Ante cualquier faltante, reclamo, problema de reparto, impresora offline o bloqueo con el cliente, el personal recibe aviso (RF-33). |
| BR-18 | Las acciones de personal validan el rol en el backend. Las respuestas del LLM nunca son fuente de autorización. |
| BR-19 | Entrega a domicilio: habilitada por sucursal. Con el envío desactivado, el asistente ofrece solo retiro (RF-32). |
| BR-20 | Facturación, comprobantes y pagos no pertenecen al sistema. Cualquier pedido de facturación se responde con derivación al personal. |

## 7. Requisitos funcionales

Cada requisito incluye sus criterios de aceptación. Los escenarios E2E de la sección 21 los verifican de punta a punta.

### 7.1 Clientes

- **RF-01 Alta automática.** Al primer mensaje de un número desconocido, el asistente muestra el aviso de privacidad (M-01) y pide nombre, dirección si quiere envío y sucursal preferida.
  - Criterio: el cliente queda creado con `phone_e164` único y `consent_at` registrado solo tras la aceptación explícita del aviso.
- **RF-02 Cliente recurrente.** Al reconocer un número, el asistente saluda por nombre y ofrece la modalidad habitual (retiro o domicilio) y la dirección guardada.
  - Criterio: no vuelve a pedir datos ya guardados salvo que el cliente quiera cambiarlos.
- **RF-03 Edición de datos.** El cliente cambia nombre, dirección, modalidad habitual y sucursal preferida en cualquier momento.
  - Criterio: un cambio de sucursal preferida no afecta pedidos ya confirmados (BR-14, supuesto S-07).

### 7.2 Disponibilidad y precios

- **RF-04 Carga de inicio de jornada.** Al inicio de jornada de cada sucursal, el asistente pregunta al personal qué falta, qué volvió a estar disponible y qué precios cambiaron. Acepta texto o audio.
  - Criterio: la pregunta llega a los destinatarios de la sucursal (plantilla si la ventana de 24 h está cerrada). Las respuestas se procesan como cambios con eco (RF-07).
- **RF-05 Precio.** Cada producto por sucursal tiene un precio vigente. Se actualiza cuando el personal lo notifica. No guarda hora de informe (BR-06).
  - Criterio: un cambio reemplaza el precio vigente y deja entrada de auditoría.
- **RF-06 Actualización en medio de jornada.** Por texto o audio, el personal marca un producto como no disponible ("se acabó la banana") o cambia un precio.
  - Criterio: el cambio se aplica inmediatamente después del eco (RF-07).
- **RF-07 Confirmación de cambios.** Antes de aplicar, el asistente devuelve la lista interpretada (M-12) y espera "sí" o "no".
  - Criterio: un "no" o una respuesta ambigua no aplica nada. Un producto no reconocido se pregunta, nunca se crea desde un audio.
- **RF-08 Ítem de pedido.** Cada ítem tiene producto del catálogo, unidad (`KG`, `UNIT`, `BUNCH`) y cantidad decimal.
  - Criterio: no existen calidades en el modelo ni en la hoja.

### 7.3 Pedidos de cliente

- **RF-09 Validación de disponibilidad.** Cada ítem se valida contra la disponibilidad de la sucursal que lo prepararía (BR-04, BR-05).
  - Criterio: un ítem no disponible activa RF-29 (derivación) o ofrece omitir el ítem, y avisa al personal (RF-33).
- **RF-10 Resumen y confirmación.** Antes de confirmar, el asistente muestra productos, cantidades, modalidad, sucursal de preparación, método de pago y notas. Puede incluir precio referencial por ítem y total referencial, con la aclaración de BR-08.
  - Criterio: el resumen termina con la pregunta de confirmación explícita (M-07). Sin "sí" explícito, el pedido queda en borrador.
- **RF-11 Método de pago.** El asistente ofrece los métodos activos de la sucursal que prepara (BR-10). El cliente elige uno.
  - Criterio: el método queda en el pedido. No hay cobro ni anticipo (BR-09).
- **RF-12 Persistencia.** Al confirmar, el pedido se guarda con número global, versión 1 y su snapshot de datos. Se encola la impresión.
  - Criterio: el mismo mensaje duplicado de WhatsApp no genera dos pedidos (idempotencia por `wa_message_id`).
- **RF-13 Modificación y cancelación.** El cliente modifica o cancela un pedido confirmado, sin plazo (BR-13).
  - Criterio: cada cambio incrementa la versión y encola una emisión (RF-31). Cancelar encola una emisión `CANCELLATION` (RF-31). Si la emisión anterior todavía no se imprimió, se reemplaza o anula sin generar hoja (supuesto S-08).
- **RF-14 Pedido del personal.** Un vendedor o dueño toma un pedido a nombre de un cliente identificado por teléfono o alta nueva.
  - Criterio: el pedido queda con `created_by_staff_id`. Aplican las mismas reglas de confirmación con el cliente, o la confirmación del personal si el cliente está presente (supuesto S-09).
- **RF-15 Escalamiento.** Si el asistente no puede resolver (ambigüedad repetida, reclamo, producto no catalogado, pedido fuera de reglas, facturación), notifica al personal con resumen e historial reciente.
  - Criterio: el cliente recibe M-06. La conversación queda en `ESCALATED`. La respuesta del personal desde su número se retransmite al cliente. Ver RF-16.
- **RF-16 Estados de conversación.** Cada conversación tiene estado: `BOT`, `ESCALATED`, `CLOSED`.
  - Criterio: en `ESCALATED` el asistente no responde por su cuenta, salvo para avisar que el personal fue notificado. Timeout de respuesta del personal: 10 min en horario (P), con un recordatorio. Fuera de horario, el aviso queda en cola hasta el inicio de jornada.

### 7.4 Impresión

- **RF-17 Impresión en la sucursal que prepara.** Cada emisión sale por la impresora de la sucursal asignada al pedido (BR-14).
- **RF-18 Cola de impresión.** Cada trabajo tiene estados (sección 9.3), reintentos con backoff (3 intentos, 10 s entre ellos, P) y alerta al personal al agotarlos.
  - Criterio: el trabajo `ABANDONED` puede reimprimirse desde el admin (RF-24).
- **RF-24 Reimpresión.** La reimpresión manual está disponible desde el admin. Se reimprime solo por modificación o cancelación (RF-13). El cobro manual no reimprime.
- **RF-31 Versionado de la hoja.** Cada emisión muestra `VERSION N`, empezando en 1. Las versiones 2 o posteriores muestran `*** MODIFICACION ***`. Una cancelación muestra `*** CANCELADO ***` con la versión siguiente.
- **RF-30 Fuera de horario.** Fuera del horario de atención, el asistente toma pedidos, avisa al cliente (M-04) y guarda la emisión en `HELD`. Al inicio de jornada, se liberan en orden de confirmación (BR-16).
- **RF-32 Domicilio por sucursal.** Cada sucursal habilita o deshabilita envíos desde el admin (BR-19). Con el envío deshabilitado, el asistente ofrece solo retiro (M-05).

### 7.5 Derivación y sucursales

- **RF-28 Sucursal preferida.** El cliente la elige en el chat entre las sucursales activas. Puede cambiarla en cualquier momento (supuesto S-07).
- **RF-29 Derivación.** Si falta al menos un ítem en la sucursal preferida, el asistente busca una sucursal activa que tenga disponibles todos los ítems del pedido (BR-15). Si la encuentra, deriva el pedido completo y lo informa al cliente (M-03). Si ninguna sucursal tiene todo, escala (RF-15).
  - Criterio: la hoja sale en la sucursal que prepara y lleva `Derivado desde: SUC. <preferida>`. El personal de la preferida también recibe aviso (RF-33).
  - Prioridad entre sucursales candidatas: orden de prioridad configurado por el dueño (supuesto S-02).
  - Solo se deriva al crear o modificar el pedido. Un faltante posterior a la impresión no se deriva automáticamente: avisa al personal (RF-33).

### 7.6 Pedidos, entrega y notas

- **RF-25 Notas.** Cada pedido tiene un campo de notas de hasta 200 caracteres (BR-11). Lo escriben el asistente o el cliente. Si no está vacío, se imprime.
- **RF-26 Métodos de pago por sucursal.** ABM de métodos con activar o desactivar. Los inactivos no se ofrecen. La lista inicial de cada sucursal es `EFECTIVO`, `TRANSFERENCIA`, `MERCADO PAGO`, `CUENTA CORRIENTE`, todos activos (P).
- **RF-23 Estado de cobro (opcional).** Valores: `A COBRAR` (por defecto al confirmar) y `PAGADO`. El personal lo marca a mano en el papel. En el sistema es opcional (BR-12). El cambio de estado no reimprime (RF-24).
- **RF-27 Estado de preparación (opcional).** Valores: `PENDIENTE`, `EN PREPARACION`, `LISTO`, `ENTREGADO`. Solo visible en el admin. No se imprime y no genera alertas.
- **RF-37 Retiro o domicilio.** Retiro: el asistente pide hora de retiro, dentro del horario de la sucursal que prepara. Domicilio: usa la dirección guardada o una nueva para el pedido, y la hora es opcional (supuesto S-10).

### 7.7 Administración

- **RF-19 Usuarios y roles.** ABM de personal: número de WhatsApp en formato E.164, nombre, rol (`OWNER`, `SELLER`), sucursales habilitadas y estado activo. Un número no puede estar en dos roles a la vez.
- **RF-20 Horarios por sucursal.** Cada sucursal configura: horario de atención (apertura y cierre), inicio de jornada (por defecto igual a la apertura, supuesto S-03) y zona horaria `America/Argentina/Buenos_Aires`.
- **RF-21 Catálogo.** ABM de productos: nombre oficial (lo que se imprime), unidad de venta, sinónimos (lista de textos que el asistente puede mapear), activo o inactivo. Sin calidades (BR, sección 6).
- **RF-22 Panel de estado.** Muestra conversaciones por estado, pedidos del día por sucursal, cola de impresión, alertas abiertas y disponibilidad vigente por sucursal.
- **RF-33 Aviso al personal.** Destinatarios: todo el personal activo de la sucursal y el dueño (supuesto S-04). Canales: WhatsApp y panel. Plantilla si la ventana de 24 h está cerrada.
  - Eventos: faltante en pedido, derivación, reclamo, problema de reparto, impresora offline, trabajo `ABANDONED`, bloqueo con el cliente, producto `UNAVAILABLE` que afecta pedidos pendientes, facturación solicitada.
- **RF-35 Privacidad.** Aviso de privacidad al alta (M-01). Atención de derechos ARCO (acceso, rectificación, supresión y oposición) desde el admin (sección 16.3).
- **RF-36 Auditoría.** Todo cambio de configuración, precio, disponibilidad, personal y pedido se registra con actor, acción, entidad, antes, después y fecha.
- **RF-34 Entrada de audio.** Cliente y personal pueden enviar audios de hasta 120 s (P). Un audio más largo se rechaza con M-14.
- **RF-38 Importación de productos por CSV.** El dueño puede subir un archivo CSV con los productos del negocio. El sistema lee las columnas "Descripción" (nombre oficial) y "Tipo de Venta" ("Peso" → KG, "Unidad" → UNIT). Los productos cuyo nombre ya existe se saltean y se reportan. El archivo puede estar en ISO-8859 o UTF-8. El panel muestra un resumen: importados, saltados y errores.
  - Criterio: un CSV con 118 productos se importa en menos de 5 s. Los duplicados no se sobrescriben. Los errores de fila se reportan con número de fila.

## 8. Modelo de dominio y datos

Entidades principales. El detalle de tipos y restricciones se define en la migración inicial (T0.3).

| Entidad | Campos clave | Notas |
|---|---|---|
| `branch` | `id`, `short_name`, `full_name`, `address`, `timezone`, `opens_at`, `closes_at`, `day_start_at`, `delivery_enabled`, `priority`, `active`, `printer_id` | `priority` ordena la derivación (S-02). |
| `staff` | `id`, `phone_e164` (único), `name`, `role` (`OWNER`/`SELLER`), `active` | Relación N:M con `branch` mediante `staff_branch`. |
| `customer` | `id`, `phone_e164` (único), `name`, `address_text`, `usual_fulfillment` (`PICKUP`/`DELIVERY`), `preferred_branch_id`, `consent_at`, `created_at` | `preferred_branch_id` lo elige el cliente (RF-28). |
| `product` | `id`, `official_name`, `unit` (`KG`/`UNIT`/`BUNCH`), `active` | Sin calidades (BR). |
| `product_alias` | `id`, `product_id`, `text_normalized` | Mapeo de texto libre a producto. |
| `branch_product` | `branch_id`, `product_id`, `price_amount`, `price_unit` | Precio vigente por sucursal y producto. Se actualiza al ser notificado. Sin hora de informe (BR-06). Separado de la disponibilidad porque el precio no se reinicia cada jornada. |
| `branch_product_day` | `branch_id`, `product_id`, `business_date`, `availability` (`AVAILABLE`/`UNAVAILABLE`/`PENDING_CHECK`) | Un registro por producto, sucursal y jornada solo si hay override. Único por (sucursal, producto, jornada). |
| `payment_method` | `id`, `code` (`CASH`, `TRANSFER`, `MERCADO_PAGO`, `CURRENT_ACCOUNT`), `label`, `active` | Sin cobros (BR-09). |
| `branch_payment_method` | `branch_id`, `payment_method_id`, `enabled` | Configuración por sucursal (RF-26). |
| `order` | `id`, `order_number` (global), `customer_id`, `preferred_branch_id`, `fulfilling_branch_id`, `derived` (bool), `fulfillment` (`PICKUP`/`DELIVERY`), `pickup_time`, `delivery_address_snapshot`, `delivery_time`, `payment_method_id`, `payment_status` (`TO_COLLECT`/`PAID`, nullable), `prep_status` (nullable), `notes`, `status` (`DRAFT`/`CONFIRMED`/`CANCELLED`), `version`, `source` (`CUSTOMER`/`STAFF`), `created_by_staff_id`, `wa_message_id`, `created_at`, `confirmed_at`, `cancelled_at` | `version` empieza en 1. `wa_message_id` es único para idempotencia. |
| `order_item` | `id`, `order_id`, `product_id`, `quantity` (decimal, 3 decimales), `unit`, `requested_text` | Sin precio ni total. Los precios no se congelan (BR-08). |
| `print_job` | `id`, `order_id`, `order_version`, `branch_id`, `kind` (`NEW`/`MODIFICATION`/`CANCELLATION`), `payload_escpos` (bytes), `preview_text`, `status`, `attempts`, `last_error`, `created_at`, `released_at`, `printed_at` | Ver estados en 9.3. |
| `conversation` | `id`, `phone_e164`, `actor_type` (`CUSTOMER`/`STAFF`), `state` (`BOT`/`ESCALATED`/`CLOSED`), `draft_order_id`, `context_json`, `last_inbound_at` | `context_json` guarda el estado del flujo, no datos de negocio. |
| `message` | `id`, `wa_message_id` (único), `conversation_id`, `direction`, `type` (`TEXT`/`AUDIO`/`OTHER`), `body_text`, `transcript`, `created_at` | El audio crudo se borra tras transcribir (16.3). |
| `alert` | `id`, `branch_id`, `kind`, `order_id` (nullable), `message`, `status` (`OPEN`/`ACKNOWLEDGED`), `created_at` | Ver RF-33. |
| `change_set` | `id`, `actor_staff_id`, `branch_id`, `payload_json`, `status` (`PENDING_CONFIRMATION`/`APPLIED`/`REJECTED`/`EXPIRED`), `created_at`, `resolved_at` | Cambios de personal pendientes de eco (RF-07). |
| `audit_log` | `id`, `actor`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `created_at` | Solo inserción. |
| `agent_session` | `id`, `branch_id`, `agent_version`, `last_seen_at`, `printer_status` | Estado del agente de impresión. |

## 9. Estados

### 9.1 Conversación

```
BOT ──(pedido de personal | escalamiento RF-15)──▶ ESCALATED
ESCALATED ──(personal responde "resolver" | timeout cerrado por personal)──▶ BOT
BOT | ESCALATED ──(inactividad 24 h P)──▶ CLOSED
CLOSED ──(nuevo mensaje)──▶ BOT
```

### 9.2 Pedido

```
DRAFT ──(sí explícito, BR-01)──▶ CONFIRMED (version 1)
CONFIRMED ──(modificación RF-13)──▶ CONFIRMED (version n+1)
CONFIRMED ──(cancelación RF-13)──▶ CANCELLED
DRAFT ──(inactividad 60 min P)──▶ expirado (se descarta)
```

Los estados de cobro (RF-23) y de preparación (RF-27) son independientes y opcionales. No participan de esta máquina.

### 9.3 Trabajo de impresión

```
QUEUED ──(sucursal abierta)──▶ DISPATCHED ──(ack ok)──▶ PRINTED
QUEUED ──(fuera de horario)──▶ HELD ──(inicio de jornada)──▶ QUEUED
DISPATCHED ──(error)──▶ FAILED ──(reintento)──▶ DISPATCHED
FAILED ──(agotados 3 intentos)──▶ ABANDONED ──(reimpresión admin RF-24)──▶ QUEUED
QUEUED | HELD ──(cancelación o modificación antes de imprimir, S-08)──▶ SUPERSEDED
```

## 10. Asistente conversacional

### 10.1 Principio de diseño

El LLM interpreta y redacta. El sistema decide. El LLM nunca escribe en la base de datos. Solo llama a herramientas tipadas y cada herramienta valida permisos, reglas de negocio y estado.

### 10.2 Herramientas (tools) del asistente

**Cliente:**

- `find_customer(phone)`
- `upsert_customer(name, address, usual_fulfillment, preferred_branch_id, consent)`
- `search_products(text)`: devuelve candidatos del catálogo con id y nombre oficial.
- `get_availability(branch_id, product_ids)`
- `get_reference_price(branch_id, product_id)`
- `list_payment_methods(branch_id)`
- `draft_order_update(items, fulfillment, pickup_time, delivery_address, payment_method_id, notes)`
- `confirm_order(draft_id, explicit_yes_message_id)`: solo válida si el turno anterior fue el resumen de confirmación (BR-01).
- `modify_order(order_id, changes)`
- `cancel_order(order_id)`
- `escalate(reason, summary)`

**Personal:**

- `propose_changes(branch_id, changes[])`: crea `change_set` en `PENDING_CONFIRMATION`.
- `apply_changes(change_set_id, explicit_yes_message_id)`: solo si el rol es válido y la confirmación es explícita (BR-07, BR-18).
- `create_staff_order(customer_phone, ...)`

### 10.3 Guardrails

- **Salida estructurada:** toda respuesta del LLM que dispara una herramienta se valida contra un esquema. Si no valida, se reintenta una vez y después se escala.
- **Contenido no confiable:** el texto y los audios del cliente son datos, no instrucciones. Un mensaje del tipo "ignorá tus reglas" no cambia permisos ni reglas (test de inyección en el eval set).
- **Precios y disponibilidad:** toda cifra o disponibilidad que el asistente diga se toma de una herramienta en el mismo turno. Un test de eval verifica que cada cifra mencionada exista en el resultado de herramienta (BR-02).
- **Precios de referencia:** el precio almacenado en el catálogo (`reference_price`) es de referencia y puede cambiar sin previo aviso, porque los precios de frutas y verduras son estacionales y se basan en la disponibilidad general diaria. Si el cliente solicita confirmación del precio de un producto, el asistente no confirma ni garantiza el precio; informa que es de referencia y que la confirmación final requiere la intervención de un vendedor o del dueño. El asistente nunca promete un precio final ni lo usa como compromiso de cobro (BR-08).
- **Límites de turno:** máximo 8 llamadas a herramientas por turno (P). Excedido, escala.
- **Fallo del proveedor de LLM:** M-15 y escalamiento. El sistema no improvisa.

### 10.4 Flujos conversacionales (resumen)

1. **Alta y saludo** (RF-01, RF-02).
2. **Pedido de cliente:** interpretar → mapear productos → validar disponibilidad (RF-09) → derivar o escalar si falta algo (RF-29) → elegir modalidad (RF-37) → elegir pago (RF-11) → notas (RF-25) → resumen (RF-10) → sí explícito (BR-01) → persistir (RF-12) → encolar impresión (RF-17, RF-30).
3. **Modificación o cancelación** (RF-13): identificar el pedido vigente del cliente, aplicar el cambio con resumen y confirmación, nueva versión y emisión.
4. **Carga de personal** (RF-04 a RF-07): texto o audio → transcripción → `change_set` → eco (M-12) → sí o no → aplicar y auditar → aviso a pedidos afectados (RF-33).
5. **Pedido del personal** (RF-14): identificar cliente por teléfono o alta, mismo flujo con `source = STAFF`.
6. **Escalamiento** (RF-15, RF-16): resumen al personal, respuesta retransmitida, cierre con "resolver".

## 11. Escenarios de flujo principales (texto)

**Flujo A: pedido con derivación.**

1. Cliente en sucursal preferida `CENTRO` pide tomate, banana y lechuga.
2. `CENTRO` no tiene banana. El asistente busca otras sucursales activas y encuentra `NORTE` con los tres ítems.
3. El asistente informa al cliente (M-03), sin pedir aceptación.
4. El pedido se confirma con sucursal de preparación `NORTE`, `Derivado desde: SUC. CENTRO`.
5. Se encola la impresión en `NORTE`. El personal de `CENTRO` recibe aviso (RF-33).

**Flujo B: pedido fuera de horario.**

1. Cliente escribe a las 22:00. La sucursal abre a las 08:00.
2. El asistente toma el pedido y avisa (M-04).
3. La emisión queda en `HELD`.
4. A las 08:00 (inicio de jornada), la emisión pasa a `QUEUED` y se imprime.

**Flujo C: carga de personal por audio.**

1. El vendedor envía un audio: "Hoy no hay banana. El tomate perita está a 2.400 el kilo."
2. El sistema transcribe, mapea, crea `change_set` y envía el eco (M-12).
3. El vendedor responde "sí". Se aplica y se audita.
4. Si había pedidos pendientes con banana, se avisa al personal (RF-33).

**Flujo D: modificación con reimpresión.**

1. El cliente agrega dos kilos de papa a su pedido #1042.
2. El asistente muestra el resumen y pide confirmación.
3. Cliente responde "sí": versión 2 y emisión `MODIFICATION`.
4. La hoja sale con `VERSION 2` y `*** MODIFICACION ***`.

## 12. Integraciones

### 12.1 WhatsApp Business Cloud API

- **Webhook:** verificación inicial con `hub.challenge` y token de verificación. Cada POST se valida con la firma `X-Hub-Signature-256` usando el secreto de la app. Respuesta `200` inmediata y procesamiento asíncrono.
- **Idempotencia:** deduplicación por `wa_message_id`.
- **Ventana de 24 h:** los mensajes libres solo se envían dentro de la ventana abierta por el último mensaje del usuario. Fuera de ella, solo plantillas aprobadas. Las plantillas necesarias son: inicio de jornada (RF-04) y alertas al personal (RF-33). Su aprobación es una tarea de I1.
- **Medios:** los audios se descargan al recibirlos, porque la URL de descarga es temporal y requiere token. El audio se transcribe y luego se borra (16.3).
- **Formato de número:** E.164 con código `+54`. La API usa el número sin `+`, la aplicación lo normaliza en la capa de entrada.
- **Reintentos de envío:** 5 intentos con backoff exponencial (P). Después, el mensaje queda en outbox como `FAILED` y se alerta.
- **Verificación del negocio y número:** trámites de Meta. Riesgo de demora (sección 19).
- Validar cualquier cambio de documentación de Meta antes de implementar. La On-Premises API de Meta está en desuso y no se usa.

### 12.2 Transcripción (STT)

- Interfaz `Transcriber` con implementación `HostedWhisperCompatible` (perfil B) y `LocalWhisperCompatible` (perfil A).
- Entrada: OGG/Opus de WhatsApp. Conversión a un formato soportado con `ffmpeg` si el proveedor lo requiere.
- Salida: texto, idioma detectado y duración. Un resultado vacío o de idioma no español escala.

### 12.3 LLM

- Interfaz `ChatModel` con formato compatible con la API de chat de OpenAI, para que el mismo cliente hable con un proveedor por API (perfil B) o con un servidor local (perfil A).
- Llamadas a herramientas con esquema JSON.
- Timeout de 15 s por llamada (P). Un timeout cuenta como fallo de proveedor (10.3).

### 12.4 Impresora térmica

- Transporte: TCP puerto 9100 (Ethernet, preferido) o USB con el agente (sección 13.3).
- Protocolo: ESC/POS, 80 mm, 48 columnas (fuente A).
- Estado: consulta de estado de papel y tapa mediante DLE EOT. Si no responde, el agente reporta offline.
- Modelo: no definido. Se prueba después (T4.8). El sistema debe funcionar con el simulador de impresora en todo el desarrollo.

### 12.5 Autenticación del admin

- Usuario y contraseña con hash fuerte (Argon2id).
- Sesiones con cookie `HttpOnly`, `Secure` y `SameSite=Strict`.
- Segundo factor TOTP recomendado para `OWNER` y obligatorio para `OPERATOR` (P).

## 13. Arquitectura

### 13.1 Componentes

```
                ┌──────────────────────── Backend (API + workers) ────────────────────────┐
WhatsApp ──▶ Webhook ──▶ Ingestion ──▶ Conversation orchestrator ──▶ Tools ──▶ Domain services
                                              │                              │
                                              ├──▶ Transcriber (STT)         ├──▶ PostgreSQL
                                              ├──▶ ChatModel (LLM)           ├──▶ Print render
                                              └──▶ Outbox (WhatsApp send)    └──▶ Print queue
                └──────────────────────────────────────────────────────────────────────────┘
                                                                          │ WSS (outbound)
Admin web (React) ──▶ API admin                              Print agent (Go) en cada sucursal ──▶ Impresora
Scheduler (start-of-day, timeouts, expiraciones, purga) ─────┘
```

- **Ingestion:** valida firma, deduplica, normaliza número, persiste el mensaje y encola el procesamiento.
- **Conversation orchestrator:** máquina de estados de conversación (9.1), llamadas al LLM y ejecución de herramientas.
- **Domain services:** catálogo, disponibilidad, clientes, pedidos, cambios de personal, alertas, configuración y auditoría. Son la única vía de escritura.
- **Print render:** convierte pedidos en bytes ESC/POS y en texto de vista previa (sección 14).
- **Print queue:** trabajos con estados (9.3) en PostgreSQL con `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Outbox:** mensajes de salida a WhatsApp con reintentos.
- **Scheduler:** inicio de jornada, timeouts, expiraciones de borradores, purga de datos y rotación de logs.

### 13.2 Perfiles de despliegue

| Aspecto | Perfil B (híbrido, iteración 1) | Perfil A (en sitio, iteración 2) |
|---|---|---|
| Backend, DB, admin | VPS en la nube, región con latencia baja desde Argentina | Mini PC o servidor en el local |
| Webhook | Directo a HTTPS público de la nube | Túnel HTTPS hacia el local (P: Cloudflare Tunnel u otro, a evaluar) |
| LLM | API hospedada, compatible con OpenAI | Modelo local servido con servidor compatible (por ejemplo Ollama o llama.cpp) |
| STT | API hospedada | Servidor local compatible (por ejemplo faster-whisper) |
| Agente de impresión | En cada sucursal | En cada sucursal (en el mismo local que el servidor, o en red local) |
| Dependencia de internet | Total para el flujo completo | WhatsApp y túnel requieren internet. Impresión y admin local, no. |
| Respaldo | Snapshot del proveedor y dump cifrado a almacenamiento externo | Dump cifrado diario a disco externo y a almacenamiento remoto (P) |
| Seguridad física | Proveedor | Cifrado de disco completo, acceso físico restringido (T7.4) |

La lógica de negocio es idéntica en ambos perfiles. Solo cambian la configuración de proveedores y la topología de red. Esto se verifica con la misma suite de tests contra ambas configuraciones (sección 21).

### 13.3 Agente de impresión

- **Lenguaje:** Go, binario único sin runtime en la sucursal (ADR-004).
- **Conexión:** saliente, WebSocket sobre TLS hacia el backend, con token por sucursal. Fallback a long polling HTTPS si el WebSocket no pasa.
- **Mensajes:**
  - `hello`: `{branch_id, agent_version}`.
  - `job`: `{job_id, order_id, order_version, kind, payload_base64}`.
  - `ack`: `{job_id, status: "PRINTED" | "FAILED", error_code}`.
  - `heartbeat`: `{printer_status, queue_depth}`, cada 30 s.
- **Spool local:** SQLite. Si el backend cae, el agente sigue imprimiendo lo que ya recibió y reconecta con backoff.
- **Idempotencia:** el agente guarda los `job_id` impresos durante 30 días. Si recibe un `job` repetido, responde `PRINTED` sin imprimir de nuevo (at-least-once con deduplicación).
- **Transporte a la impresora:** TCP 9100 o USB (libusb). Timeout de escritura de 5 s (P).
- **Configuración local:** archivo con URL del backend, token y dirección de la impresora. Ningún secreto en la imagen del binario.

## 14. Modelo de pedido impreso (especificación final)

### 14.1 Ejemplo: modificación

```
        LA VERDU - SUC. CENTRO
------------------------------------------------
          *** MODIFICACION ***
PEDIDO #1042                    VERSION 2
01/11/2026 10:32
Cliente: Maria Gomez
Entrega: RETIRA 11:30
Pago: TRANSFERENCIA
Estado: A COBRAR
------------------------------------------------
Cant.        Producto
2 kg         Tomate perita
1 u          Lechuga crespa
1/2 kg       Banana
------------------------------------------------
Notas: sin cascara en la banana. Llama al llegar.
------------------------------------------------
```

### 14.2 Reglas de render

- **Ancho:** 48 columnas. Texto sin tildes (compatibilidad de code page, validar con la impresora en T4.8).
- **Encabezado:** `LA VERDU - SUC. <short_name>`, centrado. Nombre de sucursal máximo 20 caracteres.
- **Número de pedido:** en negrita y doble altura. Es la clave para asociar la hoja con el ticket de balanza.
- **Versión:** `VERSION N` en la misma línea que el número. La versión 1 no muestra etiqueta. La versión 2 o posterior muestra `*** MODIFICACION ***` centrado arriba.
- **Cancelación:** `*** CANCELADO ***` centrado arriba, con la versión siguiente.
- **Fecha:** `DD/MM/YYYY HH:MM` con la hora de confirmación de la versión.
- **Cliente:** nombre hasta 30 caracteres.
- **Entrega:**
  - `RETIRA HH:MM`.
  - `DOMICILIO - <dirección>`, y si hay hora, `DOMICILIO - <dirección> - HH:MM`. Si la dirección excede la línea, se ajusta en varias líneas.
- **Pago:** nombre del método en mayúsculas, sin tildes.
- **Estado:** `A COBRAR` al emitir. El estado de cobro no se re-renderiza en emisiones posteriores salvo que el pedido esté en una versión nueva.
- **Derivación:** si aplica, `Derivado desde: SUC. <preferida>` debajo del encabezado.
- **Ítems:**
  - Cantidad en la columna de 12 caracteres.
  - Formato de cantidad: `0,5 kg` se imprime como `1/2 kg`. `0,25 kg` como `1/4 kg`. `0,75 kg` como `3/4 kg`. El resto con coma decimal (`1,5 kg`). Unidades: `N u`.
  - Producto: nombre oficial. Si excede 32 caracteres, se ajusta en dos líneas.
- **Notas:** `Notas:` seguido del texto, ajustado a 48 columnas. Sin notas, la línea no se imprime.
- **Cierre:** una línea de corte. Sin frase de agradecimiento obligatoria.
- **Bytes:** inicialización ESC @, selección de code page, negrita y doble altura con ESC `!` y ESC `E`, y corte parcial al final.

### 14.3 Qué no aparece

Precio, importe, total, calidad, teléfono, canal, nombre del vendedor y pagos. Esta lista es cerrada.

## 15. Admin web

Pantallas:

1. **Inicio (RF-22):** conversaciones por estado, pedidos del día por sucursal, cola de impresión, alertas abiertas.
2. **Conversaciones:** lista y detalle en solo lectura. Acciones: resolver escalamiento y responder en nombre del personal.
3. **Pedidos:** lista filtrable por sucursal, fecha, estado, modalidad y método. Detalle con versiones y emisiones. Acción de reimprimir (RF-24) y campos opcionales de cobro y preparación (RF-23, RF-27).
4. **Disponibilidad y precios del día:** grilla por sucursal y producto con estado vigente. Permite corregir cambios (con auditoría).
5. **Catálogo:** ABM de productos y sinónimos (RF-21).
6. **Sucursales:** ABM con horario, inicio de jornada, envío habilitado (RF-32), prioridad de derivación (RF-29), impresora, y métodos de pago (RF-26).
7. **Personal:** ABM de usuarios y roles (RF-19).
8. **Clientes:** búsqueda, edición y solicitudes ARCO (sección 16.3).
9. **Impresión:** cola, estado del agente, heartbeat y trabajos `ABANDONED` con acción de reimprimir.
10. **Alertas:** lista de avisos con estado y acción de reconocimiento.
11. **Auditoría:** solo lectura con filtros.
12. **Configuración técnica (operador):** versiones de agentes, estado de proveedores (LLM, STT, WhatsApp) y tokens (rotación).
13. **Configuración del negocio:** nombre del negocio, nombre del dueño, teléfono y dirección. Se usa en los mensajes del asistente (M-01) y en la hoja impresa. Editable desde el admin; el seed la carga desde las variables de entorno `BUSINESS_NAME`, `BUSINESS_OWNER_NAME`, `BUSINESS_PHONE` y `BUSINESS_ADDRESS` (con valores por defecto para desarrollo). Incluye un campo de **notas del agente** (texto libre) que se suman a sus guardrails e instrucciones, para adaptar el comportamiento a cada negocio. El nombre configurado se refleja dinámicamente en el panel de administración (título del sitio, página de login y encabezado del menú) mediante el endpoint público `GET /business`.

Idioma del admin: español (P, por la operación del local).

## 16. Requisitos no funcionales

### 16.1 Rendimiento y disponibilidad

- **RNF-01:** respuesta de texto p95 menor a 5 s, excluyendo el envío de WhatsApp (P).
- **RNF-02:** respuesta de audio de 30 s, p95 menor a 15 s (P).
- **RNF-03:** impresión del pedido confirmado, en menos de 30 s con agente online (OBJ-2).
- **RNF-04:** disponibilidad de 99% en horario de atención (perfil B).
- **RNF-05:** el sistema sostiene 20 conversaciones concurrentes por sucursal sin degradación visible (P, verificado en T6.5).

### 16.2 Confiabilidad

- **RNF-06:** ningún mensaje entrante se pierde. Si el procesamiento falla, se reintenta. Si se agotan los reintentos, se alerta.
- **RNF-07:** ningún trabajo de impresión se pierde. Pasa a `FAILED`, luego `ABANDONED` y genera alerta.
- **RNF-08:** operaciones de escritura críticas (confirmar pedido, aplicar cambio de personal) son transaccionales e idempotentes.
- **RNF-09:** degradación:
  - LLM caído: M-15 y escalamiento.
  - STT caído: pedir texto (M-16).
  - WhatsApp de salida caído: outbox con reintento.
  - Agente de impresión offline: cola y alerta (RF-18).
  - Base de datos caída: el webhook responde error para que Meta reintente. No se pierde el mensaje.

### 16.3 Privacidad y datos personales (Argentina, Ley 25.326)

- **Finalidad:** gestionar pedidos del cliente y comunicaciones operativas. Nada más.
- **Consentimiento:** `consent_at` se registra tras la aceptación explícita del aviso (M-01). Sin consentimiento no se guardan datos personales más allá del número para responder.
- **Audios:** se borran tras la transcripción exitosa. Si la transcripción falla, se borran a las 24 h (P).
- **Mensajes:** retención de 12 meses (P), luego purga. Retención configurable.
- **Derechos ARCO:** el dueño exporta los datos de un cliente, rectifica y suprime desde el admin. La supresión anonimiza el cliente y conserva los pedidos sin datos personales (P).
- **Enmascarado:** los teléfonos se muestran enmascarados en logs y en la hoja impresa (`***4521`). El detalle completo solo aparece en el admin para roles autorizados.
- **Cifrado:** TLS en tránsito. Cifrado en reposo en la base (en el perfil B, del proveedor; en el perfil A, de disco completo).
- **Validación legal:** el aviso de privacidad y el tratamiento se validan con asesoría legal antes del piloto (riesgo R-07).

### 16.4 Seguridad

- **RNF-10:** secretos fuera del código y de las imágenes, en variables de entorno o gestor de secretos.
- **RNF-11:** validación de firma en cada webhook. Rechazo de firmas inválidas con registro sin datos personales.
- **RNF-12:** rate limit por número de origen (P: 30 mensajes por minuto).
- **RNF-13:** el personal solo se identifica por número registrado, y cualquier acción sensible exige eco (BR-07). Un cambio de número o SIM del personal lo bloquea el dueño desde el admin (riesgo R-09).
- **RNF-14:** el agente de impresión solo acepta trabajos de su sucursal, autenticado por token rotable.
- **RNF-15:** dependencias con auditoría de vulnerabilidades en CI.

### 16.5 Observabilidad

- **RNF-16:** logs estructurados en JSON, sin datos personales en claro.
- **RNF-17:** métricas: mensajes entrantes y salientes, latencia de LLM y STT, profundidad de la cola de impresión, trabajos fallidos, alertas abiertas, heartbeat de agentes.
- **RNF-18:** trazas por conversación (identificador de correlación en logs).

### 16.6 Operación

- **RNF-19:** backups diarios con prueba de restauración mensual (T6.3).
- **RNF-20:** migraciones versionadas y reversibles.
- **RNF-21:** configuración por entorno (dev, staging, prod). Mismo artefacto en todos los entornos.

### 16.7 Idioma y formato

- **RNF-22:** el asistente responde en español rioplatense (voseo). Los mensajes fijos están en la sección 24.
- **RNF-23:** montos con formato argentino: `$ 3.600`. Cantidades con coma decimal (`1,5 kg`).
- **RNF-24:** teléfonos en E.164 (`+54 9 11 ...`).
- **RNF-25:** zona horaria `America/Argentina/Buenos_Aires` en toda la aplicación.

## 17. Stack técnico (propuesto, ADR)

| ADR | Decisión | Alternativas consideradas | Motivo |
|---|---|---|---|
| ADR-001 | Backend en TypeScript sobre Node.js LTS (Fastify) | Python (FastAPI), Go | Un lenguaje para backend y admin. Buen ecosistema para WhatsApp, LLM y STT vía HTTP. |
| ADR-002 | PostgreSQL 16 como única base, con cola de trabajos sobre tablas (`SKIP LOCKED`) | Redis, RabbitMQ | Menos piezas en el perfil en sitio. El volumen de un local no justifica más. |
| ADR-003 | Admin en React + Vite + TypeScript | Next.js, HTMX | Panel de datos sin SSR. Despliegue como estático servido por el backend. |
| ADR-004 | Agente de impresión en Go, binario único | Node.js con `node-escpos` | Sin runtime en la sucursal. Acceso USB y TCP simple y estable. |
| ADR-005 | Interfaces `ChatModel`, `Transcriber` y `Channel` con implementaciones intercambiables | Acoplar a un proveedor | Permite perfil B y A sin tocar la lógica de negocio. |
| ADR-006 | ORM: Drizzle | Prisma, TypeORM | Migraciones explícitas y SQL cercano. Tipos estrictos. |
| ADR-007 | Docker Compose para desarrollo y perfil en sitio | Kubernetes | Simplicidad operativa en un local. |
| ADR-008 | Identificadores de código en inglés, textos de producto en español rioplatense | Todo en español | Estándar de código. El producto habla a los usuarios en su idioma. |

Versiones exactas se fijan en T0.1 con el lockfile.

## 18. Estructura del repositorio

```
la-verdu/
  PRD.md
  idea.md
  apps/
    api/                 # backend TypeScript (Fastify + Drizzle)
    admin/               # panel React + Vite
    print-agent/         # agente Go
  packages/
    domain/              # reglas de negocio puras, sin I/O (BR-*)
    messages-es-ar/      # mensajes fijos del asistente (sección 24)
    print-render/        # render ESC/POS y vista previa
  infra/
    compose/
      dev.yml            # entorno local (sección 19)
      onsite.yml         # perfil A (I7)
    simulators/
      whatsapp-sim/      # simulador de webhook y envío
      printer-sim/       # servidor TCP 9100 que guarda bytes en archivos
      llm-stub/          # servidor compatible con chat, respuestas grabadas
      stt-stub/          # servidor compatible con transcripción, fixtures
  evals/
    conversations/       # casos de conversación con resultado esperado
    audio/               # audios de prueba y transcripciones de referencia
    render/              # golden files de impresión
  docs/
    adr/                 # ADR-001..008 y futuros
  scripts/
```

## 19. Entorno de desarrollo local (listo para implementar)

Este entorno permite implementar e probar todo el MVP sin cuentas reales de WhatsApp, sin impresora y sin claves de LLM o STT.

### 19.1 Servicios de `infra/compose/dev.yml`

| Servicio | Función |
|---|---|
| `db` | PostgreSQL 16 con volumen local |
| `api` | Backend en modo watch |
| `admin` | Panel en modo dev |
| `print-agent` | Agente Go apuntando a la API local |
| `printer-sim` | Simula la impresora en TCP 9100 y guarda cada trabajo en `./.dev/printouts/*.bin` y `*.txt` |
| `whatsapp-sim` | Envía webhooks firmados a la API y captura los mensajes salientes |
| `llm-stub` | Respuestas grabadas por escenario, con modo de grabación contra un proveedor real si hay clave |
| `stt-stub` | Transcripciones desde fixtures por nombre de archivo |

### 19.2 Comandos previstos (T0.2)

```
make dev-up        # levanta servicios
make dev-seed      # carga sucursales, personal, catálogo y métodos de pago
make dev-sim-msg   # envía un mensaje simulado desde un cliente o personal
make dev-printouts # lista las impresiones simuladas
make test          # unit + contract + render golden
make test-e2e      # escenarios E2E-01..E2E-12 contra los simuladores
make evals         # suite de conversaciones y audio (con stubs por defecto)
```

### 19.3 Variables de entorno

| Variable | Descripción | Dev |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | `postgres://...@db:5432/laverdu` |
| `TZ_APP` | Zona horaria de la aplicación | `America/Argentina/Buenos_Aires` |
| `WHATSAPP_APP_SECRET` | Firma de webhooks | Valor de simulador |
| `WHATSAPP_VERIFY_TOKEN` | Handshake de webhook | Valor de simulador |
| `WHATSAPP_ACCESS_TOKEN` | Envío de mensajes | Valor de simulador |
| `WHATSAPP_PHONE_NUMBER_ID` | Número emisor | Valor de simulador |
| `CHAT_BASE_URL`, `CHAT_API_KEY`, `CHAT_MODEL` | Proveedor de LLM | `http://llm-stub:...` |
| `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL` | Proveedor de STT | `http://stt-stub:...` |
| `PRINT_AGENT_TOKEN_<BRANCH>` | Token del agente por sucursal | Generado en seed |
| `ADMIN_SESSION_SECRET` | Firma de sesiones | Generado |

Los valores reales se cargan fuera del repositorio. Nunca en git.

### 19.4 Datos de seed

- Negocio con 2 sucursales: `CENTRO` y `NORTE`.
- Personal: 1 dueño, 2 vendedores (uno por sucursal).
- Catálogo de ejemplo: "Tomate perita" (KG), "Lechuga crespa" (UNIT), "Banana" (KG, sinónimos "bananas", "cavendish"), "Papa" (KG), "Naranja" (KG).
- Métodos de pago: los cuatro de RF-26, activos en ambas sucursales.
- Horarios: `CENTRO` 08:00 a 20:00, `NORTE` 08:30 a 19:30, inicio de jornada igual a la apertura.
- Clientes de prueba: 3 con sucursal preferida distinta.
- Negocio: el seed crea un registro en la tabla `business` usando las variables de entorno `BUSINESS_NAME` (default "La Verdu"), `BUSINESS_OWNER_NAME` (default "Dueño de prueba"), `BUSINESS_PHONE` y `BUSINESS_ADDRESS`. Para adaptar la instancia a otro negocio, configurar estas variables antes de `make dev-seed` o editar la configuración desde el admin.

### 19.5 Criterio de "listo para ejecutar localmente"

Un desarrollador clona el repositorio, ejecuta `make dev-up` y `make dev-seed`, envía un mensaje simulado de un cliente, confirma el pedido y ve el archivo de impresión generado en `./.dev/printouts/`, todo sin credenciales reales.

## 20. Plan de implementación

Cada tarea cita los requisitos que cubre. Las tareas se implementan con tests primero (RED, GREEN, REFACTOR) cuando hay un test ejecutable con resultado claro (política de ODD).

### I0. Fundamentos y entorno local

| Tarea | Descripción | Cubre |
|---|---|---|
| T0.1 | Monorepo con `apps/`, `packages/`, lint, formato y tests. Lockfile. | ADR-001, ADR-003 |
| T0.2 | `infra/compose/dev.yml` con los servicios de la sección 19.1 y comandos del 19.2 | Sección 19 |
| T0.3 | Migración inicial con todas las entidades de la sección 8, restricciones e índices | Sección 8, RNF-20 |
| T0.4 | Configuración por entorno, validación de variables al arrancar | RNF-10, RNF-21 |
| T0.5 | Logging estructurado con enmascarado de teléfonos | RNF-16 |
| T0.6 | Health checks y métricas base | RNF-17 |
| T0.7 | CI: lint, tests, auditoría de dependencias | RNF-15 |
| T0.8 | Seed de la sección 19.4 | Sección 19 |

**Aceptación de I0:** `make dev-up`, `make dev-seed` y `make test` pasan en una máquina limpia.

### I1. Administración base

| Tarea | Descripción | Cubre |
|---|---|---|
| T1.1 | Login de admin, sesiones y roles | 12.5, RF-19 |
| T1.2 | ABM de sucursales con horario, inicio de jornada, envío, prioridad e impresora | RF-20, RF-32, RF-29 |
| T1.3 | ABM de personal con roles y sucursales | RF-19 |
| T1.4 | ABM de productos y sinónimos, sin calidades | RF-21 |
| T1.5 | ABM de métodos de pago por sucursal | RF-26, BR-10 |
| T1.6 | Auditoría de cambios de configuración | RF-36 |
| T1.7 | ABM de configuración del negocio (nombre, dueño, teléfono, dirección) | Sección 15.13 |

**Aceptación de I1:** el dueño configura una sucursal completa desde cero y cada cambio aparece en auditoría. Tests de permisos verifican que `SELLER` no accede a estas pantallas.

### I2. Disponibilidad y precios del personal

| Tarea | Descripción | Cubre |
|---|---|---|
| T2.1 | Webhook con firma, handshake, deduplicación y respuesta rápida | 12.1, RNF-11, RF-12 |
| T2.2 | Identificación de personal por número y rol | BR-18, RF-19 |
| T2.3 | Interpretación de texto de personal a `change_set` (herramienta `propose_changes`) | RF-06, BR-02 |
| T2.4 | Eco de confirmación (M-12) y aplicación con "sí" explícito | RF-07, BR-07 |
| T2.5 | Aplicación de cambios con auditoría y precio sin hora | RF-05, RF-08, BR-06 |
| T2.6 | Carga de inicio de jornada (plantilla si aplica) | RF-04 |
| T2.7 | Transición de `UNAVAILABLE` a `PENDING_CHECK` al inicio de jornada | BR-05, S-01 |
| T2.8 | Audio de personal: descarga, transcripción y reutilización del flujo de texto | RF-34, 12.2 |
| T2.9 | Aviso al personal cuando un cambio afecta pedidos pendientes | RF-33 |

**Aceptación de I2:** E2E-07 y E2E-08 pasan. Ningún cambio se aplica sin eco.

### I3. Pedidos de cliente

| Tarea | Descripción | Cubre |
|---|---|---|
| T3.1 | Alta de cliente con aviso de privacidad y `consent_at` | RF-01, RF-35, M-01 |
| T3.2 | Reconocimiento de cliente recurrente y edición de datos | RF-02, RF-03 |
| T3.3 | Elección de sucursal preferida | RF-28 |
| T3.4 | Mapeo de texto a producto con sinónimos y reglas de BR-03 | RF-08, RF-21, BR-03 |
| T3.5 | Validación de disponibilidad en la sucursal que prepara | RF-09, BR-04, BR-05 |
| T3.6 | Retiro y domicilio con hora y dirección, respetando el envío habilitado | RF-37, RF-32, BR-19 |
| T3.7 | Métodos de pago activos de la sucursal | RF-11, BR-10, BR-09 |
| T3.8 | Notas de hasta 200 caracteres | RF-25, BR-11 |
| T3.9 | Resumen con referencia de precio y confirmación explícita | RF-10, BR-01, BR-08 |
| T3.10 | Persistencia del pedido con versión 1 e idempotencia | RF-12 |
| T3.11 | Modificación y cancelación con nueva versión (sin emisión todavía) | RF-13, RF-31 |

**Aceptación de I3:** E2E-01 hasta el paso de persistencia pasa. Un mensaje duplicado no crea segundo pedido.

### I4. Impresión

| Tarea | Descripción | Cubre |
|---|---|---|
| T4.1 | Render ESC/POS y vista previa desde el modelo de la sección 14 | Sección 14 |
| T4.2 | Golden files de render para pedido nuevo, modificación, cancelación, derivación, notas largas y domicilio | Sección 14, RNF |
| T4.3 | Cola de trabajos con estados de 9.3 | RF-17, RF-18 |
| T4.4 | Agente Go: WebSocket, spool SQLite, ack, heartbeat, deduplicación | 13.3, ADR-004 |
| T4.5 | Estados `HELD` y liberación al inicio de jornada | RF-30, BR-16 |
| T4.6 | Reglas de versión y etiquetas (MODIFICACION, CANCELADO) y supersesión | RF-31, RF-13, S-08 |
| T4.7 | Estado de impresora, alertas por offline y por `ABANDONED` | RF-18, RF-33, RNF-07 |
| T4.8 | Reimpresión desde admin | RF-24 |
| T4.9 | **Prueba con impresora real (diferida).** Se ejecuta cuando haya modelo elegido. Verifica code page, sin tildes, corte y estado. | Sección 12.4 |

**Aceptación de I4:** E2E-02, E2E-03, E2E-04, E2E-05, E2E-09 pasan con `printer-sim`. T4.9 queda abierta como riesgo hasta el hardware.

### I5. Derivación, escalamiento y personal

| Tarea | Descripción | Cubre |
|---|---|---|
| T5.1 | Derivación de pedido completo por prioridad de sucursal | RF-29, BR-15, S-02 |
| T5.2 | Aviso de derivación al cliente y al personal de la preferida | RF-29, M-03, RF-33 |
| T5.3 | Escalamiento con resumen, estado `ESCALATED` y retransmisión | RF-15, RF-16 |
| T5.4 | Pedido tomado por personal (`source = STAFF`) | RF-14 |
| T5.5 | Avisos al personal por faltantes, reclamos, reparto, impresora y bloqueos | RF-33, BR-17 |
| T5.6 | Timeouts de conversación y expiración de borradores | 9.1, 9.2 |
| T5.7 | Panel de estado completo | RF-22, Sección 15 |
| T5.8 | Campos opcionales de cobro y preparación en el admin, sin alertas | RF-23, RF-27, BR-12 |
| T5.9 | Envío habilitado o deshabilitado por sucursal, con efecto en el chat | RF-32, BR-19, M-05 |

**Aceptación de I5:** E2E-06, E2E-08, E2E-10, E2E-11 y E2E-12 pasan. Ninguna alerta aparece sin destinatario.

**Cierre de iteración 1 (MVP):** la suite completa de E2E pasa en `dev` y en un entorno de staging de perfil B.

### I6. Piloto y endurecimiento (iteración 2)

| Tarea | Descripción | Cubre |
|---|---|---|
| T6.1 | Purga de mensajes y audios según retención | 16.3 |
| T6.2 | Exportación, rectificación y supresión ARCO desde el admin | RF-35, 16.3 |
| T6.3 | Backups diarios y prueba de restauración | RNF-19 |
| T6.4 | Alertas operativas (monitor de colas, LLM, STT, WhatsApp, agentes) | RNF-17 |
| T6.5 | Prueba de carga con 20 conversaciones concurrentes por sucursal | RNF-05 |
| T6.6 | Piloto con una sucursal durante un período acordado (P: 2 semanas) | OBJ-1 a OBJ-5 |
| T6.7 | Suite de evals con umbrales de precisión y medición de autonomía | Sección 21 |
| T6.8 | Revisión legal del aviso de privacidad y del tratamiento | 16.3, R-07 |

### I7. Perfil en sitio (iteración 2)

| Tarea | Descripción | Cubre |
|---|---|---|
| T7.1 | Adaptador `ChatModel` local validado con el eval set | 12.3, ADR-005 |
| T7.2 | Adaptador `Transcriber` local validado con audios reales | 12.2, ADR-005 |
| T7.3 | `infra/compose/onsite.yml` y runbook de instalación en el local | 13.2, ADR-007 |
| T7.4 | Cifrado de disco, acceso físico, backups locales y remotos | 13.2, 16.3 |
| T7.5 | Túnel HTTPS para el webhook con firma validada | 12.1, 13.2 |
| T7.6 | Comparación de precisión, latencia y costo entre perfiles | Sección 21 |
| T7.7 | Decisión de hardware y presupuesto | Decisión abierta D-01 |

## 21. Estrategia de pruebas

### 21.1 Niveles

| Nivel | Qué prueba | Herramienta | Obligatorio |
|---|---|---|---|
| Unit | Reglas de `packages/domain` (BR-*), cantidades, estados, versiones | Vitest (P) | Sí, con RED previo cuando aplique |
| Contract | Webhooks de WhatsApp (fixtures reales anonimizadas), esquemas de herramientas, protocolo del agente | Vitest + fixtures | Sí |
| Golden | Render ESC/POS y texto de pedidos (sección 14) | Snapshots en `evals/render/` | Sí |
| Integración | Repositorios sobre PostgreSQL real, cola `SKIP LOCKED` | Testcontainers o compose | Sí |
| E2E | Escenarios de la sección 21.3 contra simuladores | Script + compose | Sí, en cada iteración |
| Evals de asistente | Conversaciones con resultado esperado, incluyendo inyección | Runner propio sobre `evals/conversations/` | Sí desde I2, con umbrales en T6.7 |
| Evals de audio | WER y precisión de mapeo de productos con audios reales | Runner sobre `evals/audio/` | Desde T2.8 con fixtures; con audios reales en T6.7 |
| Prueba física | Impresora real | Checklist manual | T4.9 |

### 21.2 Umbrales de evals (P, a calibrar en T6.7)

- Interpretación de productos y cantidades en pedidos de cliente: 95% o más.
- Interpretación de cambios de personal por audio: 90% o más, con eco que lo corrige cuando falla.
- Cero precios o disponibilidades inventados (BR-02): 0 casos.
- Cero confirmaciones sin "sí" explícito (BR-01): 0 casos.
- Cero aplicaciones de cambios sin eco (BR-07): 0 casos.
- Inyección de instrucciones: 0 cambios de permisos o reglas.

### 21.3 Escenarios E2E

| ID | Escenario | Resultado esperado |
|---|---|---|
| E2E-01 | Cliente nuevo: alta, sucursal preferida, pedido de retiro, pago, notas, confirmación | Pedido `CONFIRMED` v1, trabajo `PRINTED` en la preferida |
| E2E-02 | Cliente con sucursal preferida sin un producto, derivación | Pedido en la otra sucursal, hoja con `Derivado desde`, avisos a personal y cliente |
| E2E-03 | Pedido fuera de horario | Pedido `CONFIRMED`, trabajo `HELD`, liberado a la apertura |
| E2E-04 | Modificación de pedido | v2, trabajo `MODIFICATION`, hoja con `*** MODIFICACION ***` |
| E2E-05 | Cancelación de pedido impreso | `CANCELLED`, hoja con `*** CANCELADO ***` |
| E2E-06 | Domicilio deshabilitado en la sucursal | Asistente ofrece solo retiro |
| E2E-07 | Carga de personal por audio con eco y "sí" | Cambios aplicados y auditados |
| E2E-08 | Carga de personal con "no" o respuesta ambigua | Nada aplicado |
| E2E-09 | Impresora offline | Trabajo `FAILED`, reintentos, `ABANDONED`, alerta, reimpresión manual |
| E2E-10 | Producto no catalogado | Escalamiento, sin impresión de ese ítem |
| E2E-11 | Webhook duplicado de WhatsApp | Un solo pedido y un solo trabajo |
| E2E-12 | Caída del LLM | Mensaje de contingencia y escalamiento, sin pedido parcial |

## 22. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Errores de transcripción en productos y cantidades (kilos, medios kilos) | Alta | Alto | Eco obligatorio (BR-07). Sinónimos. Evals de audio con audios reales. |
| R-02 | Costos de WhatsApp o plantillas no aprobadas a tiempo | Media | Medio | Plantillas en I1 desde el inicio. Presupuesto por conversación. |
| R-03 | Demora en la verificación de negocio y número con Meta | Media | Alto | Iniciar trámites en I0. Usar simulador hasta tener número. |
| R-04 | Hardware local insuficiente para el LLM (perfil A) | Media | Medio | Perfil B en iteración 1. Evaluación en T7.6. |
| R-05 | Precios desactualizados en el chat | Alta | Medio | Precio de referencia (BR-08). Carga diaria y cambios por audio. |
| R-06 | Caída de internet en el local | Media | Alto | Perfil A: impresión y admin locales. Perfil B: cola en el agente. |
| R-07 | Tratamiento de datos sin validación legal | Media | Alto | T6.8 antes del piloto. Minimización (16.3). |
| R-08 | Dos personas cambian el mismo precio a la vez | Baja | Medio | Último cambio gana con auditoría. Eco confirma antes de aplicar. |
| R-09 | Robo o cambio de número del personal | Baja | Alto | Bloqueo desde el admin. Eco en acciones sensibles. Auditoría. |
| R-10 | Impresora sin soporte de acentos o code page distinto | Media | Bajo | Texto sin tildes. Prueba en T4.9. |
| R-11 | Sobreinterpretación del LLM (inventa productos o cantidades) | Media | Alto | BR-02, BR-03. Herramientas tipadas. Evals. |
| R-12 | Pedidos derivados que el cliente no espera | Media | Bajo | Aviso claro (M-03) y dirección de retiro explícita. |

## 23. Supuestos

| ID | Supuesto | Qué pasa si es falso |
|---|---|---|
| S-01 | El stock no informado al inicio de jornada se considera no disponible hasta confirmarlo (BR-05). | Se ajusta el estado inicial en T2.7. |
| S-02 | La derivación usa un orden de prioridad de sucursales configurado por el dueño. | Se cambia el criterio de selección en T5.1. |
| S-03 | El inicio de jornada por defecto es la hora de apertura y es configurable. | Se ajusta el valor por defecto. |
| S-04 | Los avisos al personal van a todo el personal activo de la sucursal y al dueño. | Se ajusta la lista de destinatarios. |
| S-05 | El pago se realiza al retirar o al recibir el envío. | No cambia el sistema. Es una frase del asistente. |
| S-06 | Cada emisión impresa muestra el estado de cobro vigente al momento de emitir. | Se ajusta el render. |
| S-07 | El cliente puede cambiar su sucursal preferida. Los pedidos confirmados conservan la sucursal que los prepara. | Se ajusta RF-03. |
| S-08 | Si un trabajo de impresión aún está en cola y el pedido cambia, el trabajo pendiente se reemplaza por la versión vigente. Si el trabajo ya fue impreso, se emite una nueva hoja. Cancelar un pedido no impreso no genera hoja. | Se ajusta la máquina de estados 9.3. |
| S-09 | Un pedido tomado por el personal con el cliente presente requiere confirmación del cliente. Sin presencia, el personal confirma por el cliente. | Se ajusta RF-14. |
| S-10 | En domicilio, la hora es opcional. | Se vuelve obligatoria. |
| S-11 | Los métodos de pago de una sucursal nueva arrancan todos activos. | Se cambia el seed. |
| S-12 | El audio máximo es de 120 s. | Se ajusta RF-34. |
| S-13 | La entrega a domicilio no tiene zonas: cualquier dirección puede recibir envío desde una sucursal con envío habilitado. | Se incorporan zonas en una iteración futura. |
| S-14 | El aviso de privacidad y el tratamiento de datos pueden cumplir la Ley 25.326 con las medidas de la sección 16.3, sujeto a revisión legal. | Se ajustan medidas. |
| S-15 | El stack de la sección 17 es aceptado. Cualquier cambio se registra como nuevo ADR antes de implementar. | Se reemplaza el ADR afectado. |

## 24. Mensajes fijos (es-AR)

Textos de producto. Se implementan en `packages/messages-es-ar/` y se testean por clave.

| ID | Texto |
|---|---|
| M-01 | Hola, soy el asistente de {business}. Para tomar tu pedido necesito tu nombre, la dirección si querés envío y la sucursal que preferís. Tus datos se usan solo para gestionar tus pedidos. ¿Seguimos? |
| M-02 | Los precios son referenciales y pueden cambiar. El total final lo define el peso en la balanza. Si el cliente solicita confirmación del precio de un producto, el asistente no confirma ni garantiza el precio: informa que los precios son de referencia (estacionales y sujetos a la disponibilidad general diaria) y que la confirmación final requiere la intervención de un vendedor o del dueño. |
| M-03 | En {preferred_branch} no tenemos {product}. Tu pedido se prepara en {fulfilling_branch}, donde sí lo tenemos. Podés retirarlo allí o pedir envío desde esa sucursal. |
| M-04 | Ahora estamos cerrados. Tomé tu pedido #{order_number}. Lo preparamos desde la apertura de {opens_at}. |
| M-05 | En {branch} por ahora solo hacemos retiro en el local. |
| M-06 | Necesito que una persona del local revise esto. Ya avisé al personal y te responden por acá. |
| M-07 | Confirmo tu pedido: {summary}. ¿Está todo bien? Respondé sí para confirmar. |
| M-08 | Listo, tu pedido #{order_number} quedó confirmado. Pagás con {payment_method} al {moment}. {reference_note} |
| M-09 | Actualicé tu pedido #{order_number}. Te confirmo el resumen: {summary}. |
| M-10 | Cancelé tu pedido #{order_number}. |
| M-11 | Buen día. Para {branch}: ¿qué productos faltan hoy?, ¿qué volvió a estar disponible? y ¿hay cambios de precio? |
| M-12 | Entendí: {changes}. ¿Lo aplico? Respondé sí o no. |
| M-13 | No reconozco "{text}" en el catálogo. ¿Querés decir {options}? |
| M-14 | El audio es muy largo. Mandame un audio de hasta 2 minutos o escribime el pedido. |
| M-15 | Tuvimos un problema para procesar tu mensaje. Ya avisé al personal para que te responda. |
| M-16 | No pude entender el audio. ¿Me lo podés escribir? |
| M-17 | Para facturación te deriva el personal del local. Ya les avisé. |

`{reference_note}` usa M-02. `{moment}` es "retirar" o "recibir" según la modalidad.

## 25. Riesgos de implementación y criterios de cierre

- **Criterio de "listo" por tarea:** tests verdes, golden files actualizados si cambió el render, docs de comandos actualizados, y resultado observado registrado.
- **Criterio de "listo" por iteración:** aceptación de la sección 20 cumplida y E2E de la iteración verdes.
- **Definición de hecho del MVP:** I0 a I5 completas, E2E-01 a E2E-12 verdes en dev y staging de perfil B, y una hoja real impresa con cualquier impresora disponible (la prueba definitiva queda en T4.9).

## 26. Registro de decisiones

| Fecha | Decisión | Origen |
|---|---|---|
| 2026-11-01 | Producto para pedidos y no para pagos. Pago externo, método informativo. | Conversación |
| 2026-11-01 | Precios consultables, referenciales. Actualización al ser notificado, sin hora de informe. | Conversación |
| 2026-11-01 | Calidad fuera del sistema. | Conversación |
| 2026-11-01 | Notas por pedido, libres, hasta 200 caracteres, escritas por asistente o cliente. | Conversación |
| 2026-11-01 | Métodos de pago: efectivo, transferencia, Mercado Pago, cuenta corriente. Por sucursal. Activables. | Conversación |
| 2026-11-01 | Cuenta corriente es solo etiqueta en el MVP. | Conversación |
| 2026-11-01 | Pedido sin pago anticipado. Precio final en balanza. | Conversación |
| 2026-11-01 | Estados de cobro y preparación opcionales. Sin recordatorios. | Conversación |
| 2026-11-01 | Cobro marcado a mano en la hoja. Sin reimpresión por cobro. | Conversación |
| 2026-11-01 | Modificación y cancelación sin plazo. Cada una reimprime. | Conversación |
| 2026-11-01 | Versión y MODIFICACION en la hoja. CANCELADO en cancelaciones. | Conversación |
| 2026-11-01 | Derivación con aviso al cliente, sin aceptación. Pedido completo. | Conversación |
| 2026-11-01 | Fuera de horario: se toma, se avisa, se imprime al inicio de jornada. | Conversación |
| 2026-11-01 | Envío a domicilio por sucursal, con opción de desactivar. Sin zonas. | Conversación |
| 2026-11-01 | Faltantes y problemas: siempre se informa al personal. | Conversación |
| 2026-11-01 | Sucursal preferida elegida por el cliente. | Conversación |
| 2026-11-01 | Facturación fuera del sistema. | Conversación |
| 2026-11-01 | Horario por sucursal configurable desde el admin. | Conversación |
| 2026-11-01 | Impresora: prueba diferida. Modelo no bloquea la iteración 1. | Conversación |
| 2026-11-01 | Iteración 1 en perfil B. Ambos perfiles preparados en la arquitectura. | Conversación |
| 2026-11-01 | País Argentina. Ley 25.326 aplicable. Voseo y formato argentino. | Conversación |
| 2026-11-02 | El precio del catálogo (`reference_price`) es de referencia y estacional; si el cliente solicita confirmación del precio, interviene un vendedor o el dueño. | Conversación |

### 26.1 Registro verbatim de las instrucciones del dueño

Textos originales, sin editar, en el orden en que se dieron.

1. "Analiza idea.md y empezemos con un PRD detallado para llevar acabo este proyecto"
2. "Evitemos mencionar Calidad y el importe, es importante saber solo el producto obtenido de la lista de productos a proveer y la cantidad solicitada. A este pedido impreso se le va a adjuntar fisicamente el ticket de la balanza con el precio final y los pesajes exactos"
3. "Agreguemos el metodo de pago y el estado en el ticket. Los precios pueden ser consultados por el cliente pero pueden cambiar sin previo aviso. La calidad sale del sistema, es un dato discreto. Agreguemos un campo notas para cada pedido en donde el asistente puede agregar solicitudes especificas de los clientes."
4. "La lista de metodos de pago seria efectivo, transferencia, mercado pago y cuenta corriente con posibilidad de agregar o desactivar los metodos. No es necesario guardar el precio con hora, simplemente se va actualizar de ser notificado. Exacto en la notas el asistente y el cliente es libre de escribir lo que necesite. La longitud esta bien. El pedido no puede ser pagado con anticipacion ya que el precio se define una vez pesados los productos, el pago sera efectuado externamente por ahora. Podemos agregar un estado de preparacion pero que sea opcional ya que queremos evitar que el duenio y los empleados esten pendientes de actualizar los estados"
5. "La lista de metodos puede ser por sucursal. La cuenta corriente puede ser una funcionalidad util pero en un futuro, por ahora es solo una etiqueta. No se van a procesar pagos por el momento con el asistente ya que no se puede conocer el precio final sin pesar los productos."
6. "Se marca a mano, es externo al sistema y asistente, los estados estan bien pero son opcionales y no vamos a requerir que se actualizen. Preparemos al asistente para ambos metodos de despliegue, el pais sera Argentina, no hay plazo para modificar, se puede hacer libremente por ahora, en caso de modificaion se reimprime el pedido y el horario de atencion puede ser configurado desde el sitio de administratcion y por sucursal"
7. "Excelente preparemos todos para ambos metodos de despliegue. La impresora se puede probar despues. Un cliente puede tener un sucursal preferencial, si falta un producto podemos mandar el pedido a la sucursal que lo tiene. El asistente puede tomar pedidos fuera de horario pero da aviso e imprime cuando comienza el dia. Las cancelaciones tambien se imprimen Exacto aca solo se manejan pedidos todo lo que es facturacion es aparte. Agreguemos version en la hoja y que diga MODIFICACION."
8. "La derivacion podemos solo informar al cliente. El inicio de jornada esta bien asi como propones. La cancelacion esta muy bien asi tambien. En caso de derivacion se deriva el pedido completo. Se permite la entrega a domicilio desde todas las sucursales, tenemos que agregar la opcion de desactivar los envios a domicilio en caso de problemas con el repartidor. Si en caso de problemas o de faltantes siempre se informa al personal."
9. "La sucursal preferida la selecciona el cliente, las zonas de reparto las dejamos fuera."
10. "Si guarda el PRD.md con el maximo detalle y deja todo listo para empezar a implementar el PRD. En la primera iteracion usaremos el modelo hibrido pero quiero dejar todo listo para poder implementarlo localmente"
11. "Excelente agreguemos la aclaracion para el agente que los precios son de referencia y en caso de solicitar una confirmacion es necesaria la intervencion de un vendedor o del duenio, esto ocurre ya que los precios de las frutas y verduras son estacionales y se basan en la disponibilidad general diaria."

## 27. Decisiones abiertas

| ID | Decisión | Bloquea | Estado |
|---|---|---|---|
| D-01 | Hardware de IA y presupuesto mensual para el perfil A | I7 | Abierta. No bloquea la iteración 1. |
| D-02 | Modelo de impresora térmica | T4.9 | Abierta. Prueba diferida por decisión del dueño. |
| D-03 | Confirmación de los ADR-001 a ADR-008 (sección 17) | I0 | Propuesta. Se cierra al iniciar I0. |
| D-04 | Proveedores de LLM y STT para el perfil B (modelos y precios) | I2 | Abierta. Se elige con las evals de I2. |
| D-05 | Región de hosting del perfil B | I0 | Abierta. Propuesta: región con latencia baja desde Argentina. |

## 28. Glosario

- **Balanza (ticket de):** comprobante que sale de la balanza con el peso exacto y el precio final. Se adjunta físicamente a la hoja.
- **Derivación:** envío del pedido completo a otra sucursal que tiene todos sus productos.
- **Emisión:** cada impresión de un pedido (`NEW`, `MODIFICATION`, `CANCELLATION`).
- **Hoja:** pedido impreso que va a la sucursal que prepara.
- **Inicio de jornada:** momento configurable por sucursal en que se pide la carga de disponibilidad y se liberan los pedidos `HELD`.
- **Jornada:** período de operación de una sucursal entre su inicio de jornada y el siguiente.
- **Eco:** resumen interpretado de un cambio que el personal confirma o rechaza antes de aplicarse.
- **Sucursal preferida:** sucursal que el cliente elige para su pedido. No siempre es la que prepara.
- **Sucursal que prepara (fulfilling):** sucursal donde se imprime y se arma el pedido.

---

**Fin del PRD v1.0.** Cambios posteriores se registran en la sección 26 y se reflejan en los requisitos afectados. Ningún cambio se aplica sin que el dueño lo apruebe.
