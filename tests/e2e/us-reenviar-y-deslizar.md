# Guion E2E — Reenviar cualquier mensaje y deslizar para responder (059)

> Automatizado en `scripts/e2e-reenviar-y-deslizar.mjs` (42 checks; `TEMA=dark`
> para la pasada en oscuro). Spec:
> [059](../../specs/059-reenviar-y-deslizar/spec.md).

## Por qué

Solo se reenviaban imágenes, y en el celular la flecha de responder se leía
como «reenviar». Kevin pidió reenviar cualquier mensaje y deslizar para
responder.

## Camino verificado

1. Entran tres conversaciones: el origen (un texto, un PDF con pie, una nota de
   voz Ogg y una ubicación), el destino y una de hace 30 h (ventana cerrada).
2. **AC2.** Por la API, el PDF sale a Graph como documento con el pie editado
   y su nombre; la nota de voz sale con `voice: true`.
3. **AC4 · AC5.** La ubicación es 422, un origen inexistente 404, la misma
   conversación 422, una URL en el cuerpo 422 y la ventana cerrada 409
   `window_closed`. Nada de eso llega a Graph.
4. **AC1.** En la computadora, al pasar el ratón por el texto aparecen
   «Responder» y «Reenviar»; la ubicación no ofrece «Reenviar».
   - El diálogo «Reenviar mensaje» enseña el texto, no trae pie, avisa que
     llega sin «Reenviado» y apaga la de ventana cerrada.
   - Un doble clic en «Reenviar a…» lo manda una sola vez, al hilo y a Graph.
   - El documento abre «Reenviar documento» con su pie.
5. **AC6.** En un celular emulado (táctil, 390 px, sin «pasar el ratón») no hay
   iconos junto a las burbujas.
   - Deslizar 60 px a la izquierda cita el mensaje; 80 px a la derecha también.
   - 30 px no cita, y un arrastre vertical tampoco.
6. **AC7.** Mantener presionado abre el menú con «Responder», «Reenviar» y
   «Copiar texto», sin citar.
   - «Copiar texto» deja el texto en el portapapeles.
   - «Reenviar» abre el diálogo, que cabe en 390 px, y el reenvío sale.
   - «Responder» cita.
7. **AC8.** Menú y diálogo sin desplazamiento horizontal.

La imagen (AC3) sigue en `scripts/e2e-imagenes.mjs`, ahora desde el icono.
