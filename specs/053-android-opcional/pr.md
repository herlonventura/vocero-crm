## Qué cambia

Contenedor Android opcional que complementa la PWA de #148: reutiliza el CRM y
su sesión, toma nombre/icono/color del manifest de la instancia y añade cámara,
archivos, descargas y recepción de imágenes/PDF desde Compartir. Nunca envía
un adjunto automáticamente. Incluye guía para compilar y firmar con clave propia.

Spec 053, carril ligero. Sin migraciones, contratos nuevos, cambios en el login,
Firebase ni servicios adicionales. La PWA sigue siendo la opción sin APK.
Versión 2.3.0 propuesta según AGENTS.md, pendiente de asignación del mantenedor.

## Cómo se probó

Typecheck, lint, test y build con banderas apagadas y encendidas; 1.322 tests
del CRM por configuración y 40 comprobaciones Java.
APK debug y lint Android. Emulador API 35 con WhatsApp falso: login, cámara,
PDF, descarga/lector, compartir en frío/caliente, offline/reintento, enlace
externo, micrófono denegado, logout y dos marcas ficticias.

Detalles y límites: `specs/053-android-opcional/verificacion.md`. Sin publicación ni
pruebas en hardware físico; el APK requiere mantenimiento Android separado.
