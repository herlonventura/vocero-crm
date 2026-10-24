# Guion E2E — Atajos de teclado y Ctrl+K (055)

> Automatizado en `scripts/e2e-atajos.mjs` (25 checks; `TEMA=dark` para la
> pasada en oscuro), con el teclado real de Playwright. Spec:
> [055](../../specs/055-atajos-de-teclado/spec.md).

## Por qué

Quien atiende muchos chats al día iba del teclado al ratón para todo.

## Camino verificado

1. Entran tres conversaciones de esta corrida, una de «José».
2. **AC1.** Desde Pipeline:
   - Ctrl+K abre la barra;
   - «jose atajos …», sin acento, encuentra a José, y Enter abre su
     conversación en la Bandeja;
   - «pipe» y Enter lleva a Pipeline;
   - Escape cierra.
3. **AC2.** «?» fuera de un campo abre la ayuda con los 7 atajos, y Escape la
   cierra.
4. **AC3.** En la Bandeja, con la búsqueda dejando solo las tres:
   - Alt+J abre la primera y la segunda;
   - Alt+K vuelve, y en el extremo no da la vuelta;
   - «/» fuera de un campo enfoca el buscador.
5. **AC4.** Alt+N pasa a «Nota interna» con el foco y Alt+R vuelve a
   «Responder». Alt+N funciona también desde la caja de respuesta.
6. **AC2 · AC5.** En el compositor, «?» se escribe sin abrir la ayuda, y «/»
   abre las respuestas rápidas con el foco ahí.
7. **AC6.** A 390 px la barra y la ayuda caben.
