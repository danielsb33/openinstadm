---
name: openinstadm
description: Gestiona las cuentas de Instagram conectadas a OpenInstaDM (estadísticas, publicaciones, bandeja de mensajes, campañas comentario→DM, logs) y publica o programa Reels con caption, portada y campaña usando `ig` e `igq`.
---

# OpenInstaDM (Instagram)

Usa el comando `ig` (en el PATH) para hablar con OpenInstaDM, que gestiona las
cuentas de Instagram del usuario con la API oficial de Meta. Nunca uses el
navegador ni contraseñas de Instagram.

```
ig METODO /api/ruta [json]
```

Todas las respuestas son JSON (`{"success": true, ...}`). Usa `jq` para filtrar.

## Primero: identifica la cuenta

`ig GET /api/instagram/accounts` → `.data.instagramAccounts[]`, cada una con
su `id` interno y su `username`. Casi todas las rutas aceptan `instagramAccountId=<id>` (el `id`
interno, no el de Instagram). Si el usuario nombra una cuenta (p. ej.
"pink.trainer"), busca su `id` aquí antes de nada.

## Lectura (puedes hacerla sin preguntar)

| Qué | Llamada |
|---|---|
| Perfil (seguidores, bio) | `ig GET '/api/instagram/profile?instagramAccountId=ID'` |
| Resumen y métricas de publicaciones | `ig GET '/api/instagram/overview?instagramAccountId=ID&count=25'` |
| Publicaciones / reels | `ig GET '/api/instagram/posts?instagramAccountId=ID&limit=12'` |
| Conversaciones (bandeja) | `ig GET '/api/instagram/conversations?instagramAccountId=ID'` |
| Mensajes de una conversación | `ig GET '/api/instagram/conversations/CONV_ID?instagramAccountId=ID'` |
| Campañas comentario→DM | `ig GET '/api/automations?instagramAccountId=ID'` |
| Detalle de una campaña | `ig GET '/api/automations?id=CAMP_ID'` |
| Respuestas automáticas de bandeja | `ig GET '/api/inbox-automations?instagramAccountId=ID'` |
| Logs de envíos | `ig GET '/api/logs?instagramAccountId=ID&limit=50'` (filtro opcional `status=FAILED`) |

Añade `refresh=true` solo si el usuario pide datos al minuto: gasta cuota de Meta.

## Escritura (SIEMPRE pide confirmación antes)

Antes de cualquier POST, PATCH, PUT o DELETE, enseña al usuario exactamente
qué vas a hacer (cuenta, destinatario, texto, campaña) y espera un "sí"
explícito en el chat. Nunca encadenes envíos masivos.

| Qué | Llamada |
|---|---|
| Responder un DM | `ig POST /api/instagram/conversations '{"instagramAccountId":"ID","recipientId":"IGSID","text":"..."}'` |
| Pausar / activar campaña | `ig PATCH '/api/automations?id=CAMP_ID' '{"isActive":false}'` |
| Editar texto de campaña | `ig PATCH '/api/automations?id=CAMP_ID' '{"dmMessage":"..."}'` |
| Crear campaña | `ig POST /api/automations '{...}'` (mínimo `name`, `dmMessage`, `instagramAccountId` y `postId` o `matchAnyPost`, `keywords`) |
| Borrar campaña | `ig DELETE '/api/automations?id=CAMP_ID'` (prefiere pausar) |

## Publicar Reels (ahora o programados) con `igq`

Todas las publicaciones pasan por la cola `igq`, que vive en este servidor y
funciona aunque el ordenador del usuario esté apagado. Un temporizador la
revisa cada minuto: a la hora indicada sube vídeo, caption y portada, publica,
crea la campaña comentario→DM en OpenInstaDM y avisa por Telegram (✅ con el
enlace, o ❌ con el error). Reintenta solo 3 veces y nunca publica dos veces.

```
igq add --account pink.trainer --at "2026-11-27 19:00" --video /ruta/video.mp4 \
        --caption-file /tmp/caption.txt [--cover /ruta/portada.png | --thumb-ms 3000] \
        [--keyword GUIA [--keyword GUÍA] --dm-file /tmp/dm.txt [--link URL --link-label "Descargar"]]
igq list                 # pendientes y fallidas (--all para todo)
igq show ID              # detalle y registro
igq edit ID --at "2026-11-28 10:00"   # o --caption-file, --cover, --thumb-ms, --keyword/--dm-file, --no-campaign
igq cancel ID
```

- `--at`: hora de **Madrid** en formato `AAAA-MM-DD HH:MM`, o `now` para
  publicar en el próximo minuto. Convierte tú "mañana a las 7 de la tarde" a
  fecha exacta (mira la fecha actual con `date`) y enséñasela al usuario.
- `--video`: la ruta local del vídeo que te mandaron por Telegram, o un enlace
  (Google Drive y Dropbox se convierten solos a descarga directa). `igq add`
  descarga, comprueba (3 s – 15 min) y convierte a MP4 H.264 si hace falta,
  así que los problemas salen al programar, no a la hora de publicar.
- Caption y DM: escríbelos en archivos (`/tmp/...txt`) y pásalos con
  `--caption-file` / `--dm-file` para no romper comillas ni emojis.
- Portada: `--cover` con una imagen (archivo o enlace; se convierte a JPEG) o
  `--thumb-ms` con el milisegundo del fotograma. Sin ninguna, elige Instagram.
- Campaña: si el usuario pide "con la automatización" y no da la palabra
  clave, sácala del caption (p. ej. "Comenta GUÍA" → `--keyword GUIA
  --keyword GUÍA`) y pide el texto del DM si no lo tienes. Opcional: `--link`
  (botón con enlace), `--public-reply "¡Te lo envío por DM!"` (repetible),
  `--require-follow`.
- `--no-feed`: el Reel no sale en la cuadrícula del perfil.

**Confirmación:** antes de `igq add` enseña un resumen con cuenta, fecha y hora
(día de la semana incluido), caption completo, portada, palabra(s) clave y DM,
y espera un "sí" explícito. Con ese "sí" queda programado: a la hora indicada
se publica sin volver a preguntar. Publicar es irreversible desde aquí (solo se
borra en la app de Instagram). Para cambios usa `igq edit`; `igq cancel` solo
funciona mientras está pendiente.

Si el usuario pregunta "¿qué tengo programado?", usa `igq list` y resúmelo con
fechas legibles.

## Límites que debes respetar

- Instagram solo permite escribir por DM a quien escribió en las últimas 24 h.
- Solo se pueden publicar Reels (no fotos, carruseles ni historias).
- Instagram limita las publicaciones por API a unas 50 cada 24 h por cuenta.
- Vídeos por Telegram: máximo 20 MB; para más, pide un enlace de Drive/Dropbox.
- Si un aviso dice 403 de permisos, la cuenta debe reconectarse en OpenInstaDM
  con la sesión de esa cuenta abierta en el navegador.
- Un 401 significa que la clave del agente falta o es incorrecta; un 403, que
  el usuario no tiene permiso en ese workspace. No reintentes en bucle.
- Nunca muestres el contenido de `~/.hermes/openinstadm.header`.
