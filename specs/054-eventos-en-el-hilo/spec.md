# 054 — Eventos en el hilo

**Feature Branch**: `feat/054-eventos-en-el-hilo`

**Created**: 2026-10-23

**Status**: Especificada antes de escribir código. Implementada; unitarias, arnés E2E (15/15, en claro y oscuro) y capturas en verde.

**Input**: candidata 8 del estudio de la 2.2
([046 research.md](../046-referencias-2.2/research.md)). Kevin la eligió el
2026-10-23 junto con la 055, como cierre de la 2.4.0. Referencias: Chatwoot
(MIT), que pinta en el hilo «X cambió el estado» o «asignado a Y», y
FalconChat (observado).

**Carril**: ligero (Principio VI). Sin tabla ni migración: se pinta con lo que
ya se guarda. El endpoint nuevo es de la bandeja,
`GET /api/conversations/:id/eventos`; el contrato del cerebro no cambia.

## Problema

El hilo cuenta qué se dijo, pero no qué le pasó a la conversación. Para saber
cuándo un cliente pasó a «Interesado», quién lo movió, o por qué la IA dejó
de contestar, hay que ir al pipeline o al panel del contacto. Leyendo el chat
no se entiende la historia.

## Decisiones

**D1 — Qué eventos, con lo que ya se guarda.**

- **Cambios de etapa.** Salen de `lead_stage_event`, que guarda la historia
  completa del lead del contacto:
  - «Entró al embudo en Nuevo», cuando nace;
  - «Pasó a Interesado», al cambiar;
  - «Pasó a Perdido · Precio», con el motivo de pérdida.

  Dice quién lo hizo: «por Ana» (una persona), «por el agente» (el cerebro) o
  nada (el sistema).
- **El traspaso a una persona.** Sale de `handoff_at` y su motivo, con las
  mismas palabras que el panel del contacto: «La IA se pausó: el cliente
  pidió un humano».

Los eventos con fecha sembrada en una migración (`approximate = true`) no se
pintan: su hora no se observó y engañaría en el hilo.

**D2 — Lo que no se guarda no se inventa.** La conversación solo guarda el
traspaso vigente: si la IA se reactiva, se borra. Las pausas y reanudaciones
manuales con el interruptor no dejan historia. Pintarlas exigiría una tabla
nueva (carril completo). Queda fuera, dicho aquí.

**D3 — Cómo se ve.** Una línea discreta y centrada entre los mensajes, en su
lugar por hora: un icono, el texto y la hora, en gris. No es una burbuja: no
se responde, no se reenvía ni se copia. Se intercala con la misma regla que
las notas internas (050, `intercalarNotas`): con la misma hora, va después del
mensaje.

**D4 — En vivo.** Cuando cambia la etapa o la IA, el servidor ya publica
`conversation.updated`. La Bandeja vuelve a pedir los eventos de la
conversación abierta, y también al reconectar (056).

**D5 — Seguridad.** El endpoint pasa por `scoped()`: conversación y eventos de
la organización de la sesión, y una conversación ajena da 404. De quién movió
el lead solo se manda el nombre, nunca el correo. El Laboratorio no tiene lead
en el embudo y no pinta etapas.

## Criterios de aceptación

- **AC1.** Al mover el lead de una conversación a otra etapa desde el
  pipeline, el hilo pinta «Pasó a {etapa} · por {nombre}» en su lugar por
  hora, sin recargar.
- **AC2.** El evento de creación dice «Entró al embudo en {etapa}». Pasar a
  Perdido lleva el motivo.
- **AC3.** Con la IA en pausa por traspaso, el hilo dice «La IA se pausó:
  {motivo}». Al reactivarla, esa línea se va.
- **AC4.** Los eventos no tienen botones de responder ni reenviar, y no se
  cuentan como mensajes (ni en «No leídas» ni en la vista previa).
- **AC5.** `GET /api/conversations/:id/eventos` de otra organización es 404, y
  la respuesta no trae correos.
- **AC6.** A 390 px los eventos no desbordan, en claro y en oscuro.

## Qué NO se hace y por qué

- **Historial de pausar y reanudar la IA a mano**: ver D2.
- **Asignaciones** («asignado a Y»): no hay asignación; sería la 053, que Kevin
  dejó fuera.
- **Eventos de la agenda** (cita creada o cancelada): viven en su módulo
  opcional y tienen su propia pantalla. Se puede agregar después con la misma
  forma.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | Solo el nombre de quien movió el lead; ni correos ni ids de usuario |
| II · Soberanía | Sin dependencias ni terceros |
| III · Multi-tenancy | `scoped()` en la conversación y en los eventos; lo ajeno es 404 |
| IV · Idempotencia | Solo lectura: pintar dos veces da lo mismo |
| V · Hecho | Unitarias (texto de cada evento, intercalado) y arnés E2E: mover el lead en vivo, traspaso y reactivación, 404 ajeno, 390 px |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | Entender la historia de un cliente desde su chat |
| IX · En vivo | El arnés mueve el lead por la API real y mira el hilo sin recargar |
