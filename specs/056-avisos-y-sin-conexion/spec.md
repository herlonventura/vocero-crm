# 056 — Avisos del sistema y «sin conexión»

**Feature Branch**: `feat/056-avisos-y-sin-conexion`

**Created**: 2026-10-23

**Status**: Especificada antes de escribir código. Implementada; unitarias, arnés E2E (24/24, en claro y oscuro) y capturas en verde.

**Input**: candidata 10 del estudio de la 2.2
([046 research.md](../046-referencias-2.2/research.md)), que se dejó fuera de
esa versión. Kevin la eligió el 2026-10-23, después de publicar la 2.3.0.
Referencias:

- **WhatsApp Web**: notificación del sistema con la pestaña oculta.
- **DeskcommCRM (MIT)**: API `Notification` sin push, sin duplicados y con el
  texto recortado.
- **Chatwoot (MIT)** y **LeadDesk** (observado): aviso visible cuando se cae la
  conexión en tiempo real.

**Carril**: ligero (Principio VI). Sin tabla, sin migración, sin contrato
nuevo: vive en el navegador y en el service worker de la 048.

## Problema

1. **Si Vocero no está a la vista, el operador no se entera.** La 045 suena y
   cuenta en la pestaña, pero con la ventana minimizada, otra aplicación al
   frente o el sonido apagado del equipo, el mensaje pasa desapercibido.
2. **Cuando se cae el tiempo real, la bandeja se queda quieta sin decir
   nada.** El SSE se corta (internet, el servidor que se reinicia, un proxy) y
   la lista deja de moverse. Parece que nadie escribe.
   - Si el servidor responde con error, `EventSource` deja de reintentar para
     siempre.
   - Al volver de segundo plano en el celular, la conexión suele estar muerta.

## Decisiones

**D1 — Avisos del sistema, por dispositivo y a pedido.** En el menú, encima de
«Instalar app» (048), aparece la fila **«Activar avisos»**. Solo aparece
mientras el navegador no ha decidido el permiso. Al tocarla se pide el permiso
del navegador:

- **Concedido:** la fila desaparece y los avisos quedan activos en ese equipo.
- **Negado:** la fila desaparece. Volver a pedirlo es cosa de los ajustes del
  navegador, que es quien lo guarda.

La campana de la 045 sigue siendo el interruptor: silenciada, tampoco hay
avisos del sistema. Así, «no me molestes» es un solo clic.

**D2 — Cuándo avisa.** Un mensaje del cliente avisa si se cumple todo esto:

- la campana está activa y el permiso concedido;
- el operador no está mirando Vocero: la página está oculta o la ventana no
  tiene el foco. Si la está mirando, ya basta el sonido;
- la conversación está en la Bandeja. El Laboratorio no avisa: sus
  conversaciones no salen en la lista.

**D3 — Qué dice.**

- **Título:** el nombre del contacto.
- **Texto:** el mensaje, recortado a 120 caracteres, o la etiqueta del adjunto
  («Imagen», «Audio»…).
- **Etiqueta (`tag`):** el id de la conversación. Una ráfaga de un mismo chat
  reemplaza el aviso anterior en vez de apilar diez.

Al tocar el aviso, Vocero pasa al frente con esa conversación abierta: la
Bandeja acepta `/inbox?conversation=<id>`. Se muestra con
`registration.showNotification` del service worker de la 048, que es lo único
que acepta Chrome en Android. Sin service worker, se usa `new Notification`.

**D4 — Sin push.** El aviso sale mientras Vocero siga abierto, aunque esté
oculto. Con el navegador cerrado, o en el celular cuando Android congela la
app en segundo plano, no llega nada. El push real (Web Push) depende del
servicio de push del fabricante del navegador: es un tercero y queda fuera
(Principio II).

**D5 — La banda «sin conexión».** Encima de la aplicación, en cualquier
pantalla:

- **«Sin internet»**, en cuanto el navegador dice que perdió la red.
- **«Sin conexión en tiempo real. Reintentando…»**, si el canal en tiempo real
  lleva más de 4 segundos caído. Antes de eso no se pinta, para no parpadear
  en un corte breve.

Trae un botón **«Reintentar ahora»**. Al volver la conexión, la banda se va
sola y la bandeja se pone al día: se usa el `onReconnect` que ya existe.

**D6 — Reconectar de verdad.** El cliente del SSE (`useEvents`) ya no depende
solo de `EventSource`:

- si este se cierra (`readyState` CLOSED, como tras un 401 o un 502), se
  vuelve a abrir con espera creciente: 1 s, 2 s, 4 s… hasta 30 s;
- al volver la red (`online`) o la página al frente (`visibilitychange`), si
  no está abierta, se reconecta en el momento;
- «Reintentar ahora» hace lo mismo.

Cada reconexión llama a `onReconnect` para la puesta al día.

## Criterios de aceptación

- **AC1.** Con el permiso sin decidir, el menú ofrece «Activar avisos». Al
  concederlo, la fila desaparece. Con el permiso negado, no aparece.
- **AC2.** Con la página oculta, un mensaje del cliente produce un aviso con
  el nombre del contacto, el texto y el `tag` de su conversación. Un audio
  dice «Audio».
- **AC3.** Con la página al frente y con el foco, no hay aviso. Con la campana
  silenciada, tampoco.
- **AC4.** `/inbox?conversation=<id>` abre esa conversación.
- **AC5.** Al cortar la red, la banda dice «Sin internet». Al volver, la banda
  se va y aparece el mensaje que llegó mientras tanto, sin recargar.
- **AC6.** Si `/api/events` responde 503, a los 4 s la banda dice «Sin conexión
  en tiempo real». Cuando el servidor vuelve, «Reintentar ahora» la quita y la
  bandeja se pone al día.
- **AC7.** A 390 px, la banda no desborda, en claro y en oscuro.

## Qué NO se hace y por qué

- **Web Push** (avisos con la app cerrada): ver D4.
- **Avisos por conversación o por etapa** («solo los míos»): sin asignación
  (053) no hay «míos». La campana basta por ahora.
- **Guardar la preferencia en el servidor**: el permiso es del navegador y del
  dispositivo. Guardarlo en el servidor no cambiaría lo que el navegador deja
  hacer.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | Nada nuevo sale del navegador. El aviso muestra lo que el operador ya ve en la Bandeja |
| II · Soberanía | API `Notification` del navegador y el service worker propio. Sin servicio de push de terceros (D4) |
| III · Multi-tenancy | Los eventos ya llegan filtrados por organización (bus SSE). El nombre sale de `/api/conversations`, que pasa por `scoped()` |
| IV · Idempotencia | El `tag` por conversación reemplaza el aviso anterior. La puesta al día tras reconectar ya es idempotente (refetch) |
| V · Hecho | Unitarias (cuándo avisa, qué dice, espera de reintento) y arnés E2E: avisos simulados, red cortada y servidor caído |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | Que no se pierda un cliente porque la pestaña estaba atrás o la conexión se cayó |
| IX · En vivo | El arnés corta la red de verdad (`setOffline`) y tumba `/api/events` |
| Sandbox | El Laboratorio no avisa (D2) |
