export class MetaException extends Error {
  constructor(message, metaCode = 0, subcode = null, type = '', http = 0) {
    super(message)
    this.metaCode = metaCode; this.subcode = subcode; this.type = type; this.http = http
  }

  static fromResponse(http, json, raw) {
    const e = json?.error
    if (e && typeof e === 'object') {
      return new MetaException(String(e.error_user_msg ?? e.message ?? 'Error de la API de Meta'), Number(e.code ?? 0), e.error_subcode != null ? Number(e.error_subcode) : null, String(e.type ?? ''), http)
    }
    // Los endpoints de OAuth de Instagram devuelven error_type / error_message.
    if (json && json.error_message !== undefined) return new MetaException(String(json.error_message), Number(json.code ?? 0), null, String(json.error_type ?? ''), http)
    return new MetaException(`Respuesta inesperada de Meta (HTTP ${http}): ${String(raw).slice(0, 200)}`, 0, null, '', http)
  }

  // El token ya no sirve y hay que volver a conectar la cuenta.
  isAuthError() { return this.type === 'OAuthException' || this.metaCode === 190 }

  // Falta un permiso concedido (p. ej. la cuenta se conectó antes de pedir estadísticas).
  isPermissionError() { return this.metaCode === 10 || (this.metaCode >= 200 && this.metaCode < 300) }

  // Mensaje pensado para la persona que usa CalendApp (códigos de la documentación oficial de Meta).
  userMessage() {
    const bySub = {
      2207027: 'El archivo aún no está listo para publicarse. Inténtalo de nuevo en unos instantes.',
      2207003: 'Instagram tardó demasiado en descargar el archivo multimedia.',
      2207026: 'El formato de vídeo no es compatible con Instagram (usa MP4 o MOV con H.264/HEVC y audio AAC).',
      2207004: 'La imagen es demasiado grande para Instagram (máximo 8 MB).',
      2207032: 'Instagram no pudo crear el contenido. Vuelve a intentarlo.',
    }
    if (this.subcode != null && bySub[this.subcode]) return bySub[this.subcode]
    if (this.isAuthError()) return `Instagram rechazó las credenciales de la cuenta. Vuelve a conectarla en Ajustes → Integraciones. (${this.message})`
    return this.metaCode === 24 ? 'El contenedor de publicación ha caducado. Vuelve a intentarlo.' : this.message
  }
}
