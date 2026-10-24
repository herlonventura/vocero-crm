# Guion E2E — Eventos en el hilo (054)

> Automatizado en `scripts/e2e-eventos-hilo.mjs` (15 checks; `TEMA=dark` para
> la pasada en oscuro). Necesita `BOT_API_KEY` para el traspaso. Spec:
> [054](../../specs/054-eventos-en-el-hilo/spec.md).

## Por qué

El hilo contaba qué se dijo, pero no qué le pasó a la conversación: la etapa
o por qué la IA dejó de contestar.

## Camino verificado

1. Entra una conversación y su lead nace en el embudo.
2. **AC2.** El hilo dice «Entró al embudo en …».
3. **AC1.** Al mover el lead por el pipeline, el hilo pinta «Pasó a {etapa} ·
   por {nombre}» sin recargar.
4. **AC2.** Pasar a Perdido con motivo pinta «Pasó a Perdido · Le pareció
   caro · por …».
5. **AC4.** Los eventos no traen botones y no cambian el conteo de no leídos.
6. **AC3.** Un traspaso del cerebro (`/api/bot/handoff`, motivo `cliente`)
   pinta «La IA se pausó: el cliente pidió un humano». Al reactivar la IA, la
   línea se va.
7. **AC5.** `GET …/eventos` de una conversación ajena es 404, y la respuesta
   no trae correos.
8. **AC6.** A 390 px no desborda.
