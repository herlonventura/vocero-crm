# 059 — Reenviar cualquier mensaje y deslizar para responder

**Feature Branch**: `feat/059-reenviar-y-deslizar`

**Created**: 2026-10-23

**Status**: Especificada antes de escribir código. Implementada; unitarias, arnés E2E (42/42, en claro y oscuro) y capturas en verde.

**Input**: lo pidió Kevin al probar la 2.2.0-rc.1 en Android (2026-10-23):

- que se pueda reenviar cualquier mensaje, no solo responderlo;
- que en el celular «la flechita para responder» se entiende como reenviar, y
  sería mejor arrastrar el mensaje para responderlo.

Se anotó como la 059 y se dejó para después de la 2.2.0.

**Carril**: ligero (Principio VI). Sin tabla ni migración. Hay un endpoint
nuevo de la bandeja (`POST /api/conversations/:id/messages/forward`), que es
el de la 042 generalizado; el contrato del cerebro (`docs/openapi.json`) no
cambia.

## Problema

1. **Solo se reenvían imágenes** (042). Un texto con precios, un PDF de
   cotización o un audio se tienen que copiar o descargar y volver a subir.
2. **En el celular la flecha de responder confunde.** Cada burbuja trae a la
   vista una flecha curva (Responder citando, 039) que en WhatsApp se lee
   como «reenviar». Y no hay cómo reenviar desde el celular salvo el botón de
   texto de las imágenes.

## Decisiones

**D1 — Qué se reenvía.**

| Mensaje | Sale como |
|---|---|
| Texto, o plantilla, o cualquier mensaje con texto | Texto libre con el mismo texto |
| Imagen | Imagen, con el pie editable (como en la 042) |
| Video y documento | El mismo archivo, con el pie editable |
| Audio | El mismo audio. Si es Ogg/Opus, sale como nota de voz |
| Sticker | Imagen (es un WebP; la Cloud API lo acepta como imagen) |

No se reenvían:

- ubicación ni contacto (el compositor ya no los manda, 045);
- reacciones ni mensajes que WhatsApp no soporta;
- notas internas (050): son del equipo;
- nada desde ni hacia el Laboratorio (sandbox).

La regla vive en un módulo puro (`src/lib/reenvio.ts`) que usan el hilo (para
ofrecer el botón) y el servidor (para decidir qué mandar).

**D2 — Un endpoint, el de la 042 generalizado.** El nuevo es
`POST /api/conversations/:id/messages/forward` con
`{ sourceMessageId, caption? }`, en `.strict()`. Como en la 042:

- el cliente solo nombra el mensaje de origen, nunca una URL ni una ruta;
- el servidor arma el contenido con lo guardado (texto o archivo) y lo manda
  por `sendText` o `sendMediaMessage`, con todas sus guardas: ventana, canal,
  sandbox y credenciales;
- origen y destino se buscan en la organización de la sesión; lo ajeno es 404;
- un adjunto que falta en el disco se vuelve a bajar de Meta (`leerAdjunto`).

`forward-image` se queda como está para no romper a quien ya lo llama.

**D3 — Un destino a la vez.** Como en la 042: se elige una conversación, que
no puede ser la del propio mensaje y necesita la ventana abierta. Para un
adjunto, además, su canal tiene que aceptar adjuntos. Elegir no envía: hace
falta el botón «Reenviar a Fulano».

**D4 — Sale como mensaje nuevo, sin «Reenviado».** La Cloud API no deja
marcar un mensaje como reenviado: el cliente lo recibe como cualquier otro.
El diálogo lo dice en una línea.

**D5 — En la computadora: dos iconos al pasar el ratón.** Junto a la burbuja
aparecen «Responder» (si se puede citar) y «Reenviar» (si D1 lo permite). Con
el teclado aparecen al enfocarlos. El botón de texto «Reenviar imagen» dentro
de la burbuja desaparece: lo cubre el icono.

**D6 — En el celular: deslizar para responder y mantener presionado para
lo demás.** En una pantalla táctil (sin «pasar el ratón») no hay iconos junto
a las burbujas:

- **Deslizar** la burbuja hacia un lado la cita en el compositor. Sirve hacia
  la izquierda, como lo pidió Kevin, y hacia la derecha, como en WhatsApp. La
  burbuja sigue al dedo hasta 72 px, se asoma el icono de responder y, a
  partir de 56 px, soltar cita el mensaje (vibra un instante si el teléfono
  lo permite). Un movimiento más vertical que horizontal es desplazar el hilo
  y no cuenta.
- **Mantener presionado** medio segundo abre un menú abajo con
  «Responder», «Reenviar» y «Copiar texto», según aplique. Reemplaza el menú
  del navegador sobre la burbuja.

Copiar texto se agrega porque, al mantener presionado, el navegador ya no
selecciona el texto de la burbuja.

**D7 — El diálogo se llama por lo que reenvía.** Muestra:

- «Reenviar imagen» con la miniatura;
- «Reenviar mensaje» con el texto (hasta cuatro líneas);
- «Reenviar video», «Reenviar audio» o «Reenviar documento» con su etiqueta y
  nombre de archivo.

El campo de pie solo aparece en imagen, video y documento. Al salir, el hilo
dice «Imagen reenviada a Fulano» o «Mensaje reenviado a Fulano».

## Criterios de aceptación

- **AC1.** En la computadora, al pasar el ratón por un texto aparecen
  «Responder» y «Reenviar». El texto se reenvía a otra conversación y aparece
  allá con el mismo texto.
- **AC2.** Un documento y un audio se reenvían igual: llegan al wa-mock como
  adjuntos nuevos del mismo tipo, y el pie editado del documento se respeta.
- **AC3.** La imagen sigue reenviándose como en la 042 (mismos checks de
  `e2e-imagenes.mjs`), ahora desde el icono.
- **AC4.** Ubicación, contacto y notas internas no ofrecen «Reenviar». El
  endpoint responde 422 si se le pide uno, 404 con un origen ajeno, y nunca
  manda nada desde ni hacia el Laboratorio.
- **AC5.** Con la ventana cerrada en el destino, ese destino aparece apagado
  en el diálogo. Si se fuerza por la API, es 409 `window_closed`.
- **AC6.** En el celular (táctil, 390 px) no hay iconos junto a las burbujas.
  Deslizar un mensaje 80 px a la izquierda lo cita en el compositor; a la
  derecha también. Deslizar 30 px no cita, y un arrastre vertical no cita.
- **AC7.** En el celular, mantener presionado abre el menú con «Responder»,
  «Reenviar» y «Copiar texto». «Reenviar» abre el diálogo y el reenvío sale.
- **AC8.** A 390 px, el diálogo y el menú no causan desplazamiento
  horizontal, en claro y en oscuro.

## Qué NO se hace y por qué

- **Reenviar a varios a la vez**: multiplica los envíos con un clic, con el
  riesgo de que Meta lo tome como spam. Uno a la vez cubre el caso de Kevin.
- **Marca «Reenviado»**: ver D4.
- **Reenviar ubicación o contacto**: ver D1.
- **Gestos con el ratón** (arrastrar en la computadora): ahí hay iconos.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | El cliente solo nombra un id de mensaje; el archivo se lee del almacén de la organización. Nada de URLs |
| II · Soberanía | Sin dependencias ni terceros: gestos con eventos táctiles del navegador |
| III · Multi-tenancy | Origen y destino resueltos con `scoped()` en la organización de la sesión |
| IV · Idempotencia | Cada reenvío es un mensaje nuevo; el diálogo no deja mandar dos veces con un doble clic (como en la 042) |
| V · Hecho | Unitarias (regla de D1, gesto, endpoint) y arnés E2E con Playwright, con toques simulados |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | Lo que Kevin pidió al usar la bandeja en su teléfono |
| IX · En vivo | El arnés reenvía de verdad contra el wa-mock y desliza con eventos táctiles |
| Sandbox | El Laboratorio no reenvía ni recibe reenvíos |
