# Pegar y reenviar imágenes (spec 042)

Automatizado: `node --env-file=.env scripts/e2e-imagenes.mjs`, con la app
viva, `WA_MOCK_ENABLED=true` y `META_GRAPH_BASE_URL` apuntando a wa-mock.

## Guion

1. Por API, antes de tocar la UI: reenviar sin sesión (401), a una
   conversación que no existe (404), un mensaje que no existe (404), con una
   URL en el cuerpo (422), a una conversación con la ventana cerrada (409) y a
   la misma conversación (422). **Esperado:** nada llega a Graph.
2. Copiar una imagen al portapapeles y Ctrl+V en el campo. **Esperado:**
   queda como adjunto con vista previa. Quitarla no manda nada.
3. Pegar texto. **Esperado:** se pega como siempre; no hay adjunto.
4. Pegar una imagen, escribir un pie y luego pegar un GIF, una de más de 5 MB
   y dos a la vez. **Esperado:** cada una avisa; el adjunto y el pie siguen.
5. Enviar con la red caída. **Esperado:** «No se pudo conectar…»; el adjunto
   y el pie se quedan. Reintentar con red: sale una sola vez al hilo y a Graph.
6. En otra conversación, el icono «Reenviar» (059) sobre una imagen del cliente.
   **Esperado:** el diálogo enseña la imagen, su pie, y destinos de WhatsApp
   sin el origen; el de ventana cerrada, deshabilitado; la búsqueda filtra.
7. Elegir un destino. **Esperado:** el botón dice «Reenviar a {nombre}» y no
   sale nada. Escape cierra sin enviar; Cancelar también.
8. Editar el pie, elegir el destino y doble clic en «Reenviar a…».
   **Esperado:** «Imagen reenviada a {nombre}» en el hilo; en el destino, una
   sola copia saliente con el pie editado y un adjunto nuevo; el original no
   cambia.
9. En 390 px de ancho, abrir el diálogo. **Esperado:** cabe, sin
   desplazamiento horizontal.

## El archivo se perdió del volumen

> Automatizado en `scripts/e2e-adjunto-perdido.mjs` (13 checks). Caso real del
> 2026-10-23 en crm-dev: la app corría sin volumen en `/data`, un
> redespliegue se llevó los archivos y todos los audios e imágenes daban 410,
> aunque Meta todavía los tenía.

1. Entra una imagen y se descarga. Se borra su archivo del volumen.
   **Esperado:** `GET /api/media/{id}` responde 200 con el mismo contenido: el
   CRM la vuelve a bajar de Meta y la deja otra vez en el volumen.
2. Igual, pero Meta ya no la tiene (id caducado). **Esperado:** 410 «ya no
   está en el volumen ni en WhatsApp» en menos de 10 s, sin 500, y el adjunto
   queda como no disponible («contenido no disponible» en la bandeja).

## Fuera del guion

- Destinos de Instagram, Messenger o TikTok (422), origen o destino del
  Laboratorio (403), origen que no es imagen o es un sticker, y el archivo que
  falta en el almacén (410): `tests/unit/forward-image.test.ts`. Crear aquí una
  conversación de Instagram exige conectar Zernio y firmar su webhook.
