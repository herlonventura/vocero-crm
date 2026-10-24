# 055 — Atajos de teclado y Ctrl+K

**Feature Branch**: `feat/055-atajos-de-teclado`

**Created**: 2026-10-23

**Status**: Especificada antes de escribir código. Implementada; unitarias, arnés E2E (25/25, en claro y oscuro) y capturas en verde.

**Input**: candidata 9 del estudio de la 2.2
([046 research.md](../046-referencias-2.2/research.md)). Kevin la eligió el
2026-10-23 junto con la 054, como cierre de la 2.4.0. Referencias:

- **Chatwoot (MIT):** barra Ctrl+K y ayuda de atajos; Alt+J/K para cambiar de
  conversación.
- **DeskcommCRM (MIT):** atajos j/k y ayuda con «?».
- **LeadDesk** (observado): la barra de comandos con acciones.

**Carril**: ligero (Principio VI). Sin datos ni contrato: vive en el
navegador.

## Problema

Quien atiende muchos chats al día va del teclado al ratón para cada cosa:
pasar a la siguiente conversación, buscar a un cliente, cambiar a «Nota
interna» o ir a otra pantalla. Hoy no hay ni un atajo, y nada dice cuáles
habría.

## Decisiones

**D1 — Ctrl+K (⌘K en Mac): la barra de comandos**, desde cualquier pantalla.

- Un buscador que encuentra pantallas del menú (Bandeja, Pipeline,
  Contactos…, las mismas que el menú según el rol y las banderas, más
  Ajustes) y conversaciones por el nombre o el teléfono del contacto.
- Sin acentos ni mayúsculas, como el buscador de la Bandeja.
- ↑ ↓ para moverse, Enter para ir, Escape para cerrar.
- Elegir una conversación la abre en la Bandeja, con la misma vía que el aviso
  de la 056.

**D2 — «?»: la ayuda de atajos**, desde cualquier pantalla y fuera de un campo
de texto. Una lista de todos los atajos, agrupados por dónde sirven. Se
cierra con Escape. El pie de la barra Ctrl+K dice «? para ver los atajos».

**D3 — En la Bandeja**, fuera de un campo de texto:

| Atajo | Qué hace |
|---|---|
| Alt+J | Siguiente conversación de la lista, en el orden que se ve (con los filtros puestos) |
| Alt+K | Conversación anterior |
| / | Ir al buscador de la Bandeja |
| Alt+R | Escribir una respuesta (pestaña «Responder» y el foco en la caja) |
| Alt+N | Escribir una nota interna (pestaña «Nota interna», 050) |

Alt+J, Alt+K, Alt+R y Alt+N sirven también con el foco en el compositor: son
para no soltar el teclado mientras se contesta.

- Se usa la tecla física (`event.code`): en Mac, Option+J escribe «∆» y no
  serviría `event.key`.
- Alt+P, que proponía el estudio, se cambió por Alt+N (de «nota»): en Chrome
  y Edge Alt+P no choca, pero en Firefox abre un menú en algunos idiomas.

**D4 — Nunca pisar lo que se escribe.** «?» y «/» no hacen nada dentro de un
input, un textarea o un `contenteditable`: en el compositor, «/» sigue
abriendo las respuestas rápidas (049). Con un diálogo abierto (reenviar,
borrar…) los atajos de la Bandeja no actúan. Ctrl+K sí funciona desde un
campo: es una combinación que no escribe nada.

**D5 — Solo teclado físico.** En el celular no hay teclado con Alt; la barra
y la ayuda no tienen botón propio, para no sumar ruido a la pantalla chica.

## Criterios de aceptación

- **AC1.** Ctrl+K abre la barra desde Pipeline.
  - Escribir parte del nombre de un contacto, sin acentos, lo encuentra.
  - Enter abre su conversación en la Bandeja.
  - Escribir «pipe» y Enter lleva a Pipeline.
  - Escape cierra.
- **AC2.** «?» fuera de un campo abre la ayuda con todos los atajos. Dentro
  del compositor, «?» se escribe y no abre nada.
- **AC3.** En la Bandeja:
  - Alt+J y Alt+K recorren la lista en el orden visible y respetan un filtro
    puesto;
  - «/» enfoca el buscador.
- **AC4.** Alt+N cambia el compositor a «Nota interna» con el foco en la caja,
  y Alt+R vuelve a «Responder». Funcionan también con el foco en el
  compositor.
- **AC5.** En el compositor, «/» sigue abriendo las respuestas rápidas.
- **AC6.** A 390 px, la barra y la ayuda caben sin desplazamiento horizontal,
  en claro y en oscuro.

## Qué NO se hace y por qué

- **Acciones en la barra** (cambiar de etapa, asignar, filtrar): la barra
  navega. Las acciones necesitan un registro de comandos con permisos por
  rol; se puede crecer después sobre la misma barra.
- **Atajos configurables**: más pantallas y más datos por usuario, para un
  beneficio que nadie pidió.
- **Atajos de un solo carácter para acciones** (como «e» para cerrar): sin
  modificador se disparan por error, sobre todo con un lector de pantalla.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | La barra solo muestra lo que el usuario ya ve: el menú según su rol y sus conversaciones (`/api/conversations`) |
| II · Soberanía | Sin dependencias: eventos de teclado del navegador |
| III · Multi-tenancy | Las conversaciones vienen de `/api/conversations`, que pasa por `scoped()` |
| IV · Idempotencia | No escribe nada |
| V · Hecho | Unitarias (combinaciones, campo de texto, orden, búsqueda) y arnés E2E con el teclado real de Playwright |
| VI · Specs | Este documento, antes del código; carril ligero |
| VIII · Foco | El que atiende cien chats al día no suelta el teclado |
| IX · En vivo | El arnés teclea los atajos contra la app real |
