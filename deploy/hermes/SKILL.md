---
name: openinstadm
description: Gestiona las cuentas de Instagram conectadas a OpenInstaDM (estadísticas, publicaciones, bandeja de mensajes, campañas comentario→DM y logs) a través de su API con el comando `ig`.
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

## Publicar un Reel (SIEMPRE con confirmación)

Usa `ig-reel`, que sirve el vídeo temporalmente, espera a que Instagram lo
procese (puede tardar varios minutos) y lo publica:

```
ig-reel --account pink.trainer --video /ruta/video.mp4 \
        --caption-file /tmp/caption.txt [--cover /ruta/portada.jpg | --thumb-ms 3000] [--no-feed]
```

- `--video`: archivo local (p. ej. el que te mandan por Telegram) o un enlace
  directo de descarga. Debe ser MP4/MOV vertical (9:16), 3 s – 15 min.
- Caption: escríbelo en un archivo y pásalo con `--caption-file` (evita
  problemas con comillas y emojis). Máx. 2200 caracteres, 30 hashtags.
- Portada: `--cover` con una imagen (se convierte a JPEG sola) o
  `--thumb-ms` con el milisegundo del fotograma. Sin ninguna, Instagram elige.
- `--no-feed`: el Reel no aparece en la cuadrícula del perfil.

Antes de ejecutarlo, enseña al usuario: cuenta, vídeo, caption completo y
portada, y espera un "sí" explícito. Publicar es irreversible desde aquí
(solo se puede borrar en la app de Instagram). Al terminar, devuelve el
`permalink`. Si sale 403 sobre permisos, la cuenta debe reconectarse en
OpenInstaDM para conceder el permiso de publicación. Ejecuta `ig-reel` en
segundo plano si tu herramienta tiene límite de tiempo: puede tardar >5 min.

## Límites que debes respetar

- Instagram solo permite escribir por DM a quien escribió en las últimas 24 h.
- Solo se pueden publicar Reels (no fotos, carruseles ni historias).
- Instagram limita las publicaciones por API a unas 50 cada 24 h por cuenta.
- Un 401 significa que la clave del agente falta o es incorrecta; un 403, que
  el usuario no tiene permiso en ese workspace. No reintentes en bucle.
- Nunca muestres el contenido de `~/.hermes/openinstadm.header`.
