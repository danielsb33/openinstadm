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

## Límites que debes respetar

- Instagram solo permite escribir por DM a quien escribió en las últimas 24 h.
- No se puede publicar contenido (posts/reels) desde aquí: la app de Meta no
  tiene ese permiso. Si lo piden, dilo y propón preparar el texto/caption.
- Un 401 significa que la clave del agente falta o es incorrecta; un 403, que
  el usuario no tiene permiso en ese workspace. No reintentes en bucle.
- Nunca muestres el contenido de `~/.hermes/openinstadm.header`.
