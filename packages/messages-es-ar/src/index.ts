/**
 * Fixed product messages (PRD section 24), Rioplatense Spanish (voseo).
 *
 * Implemented in `packages/messages-es-ar` per PRD section 18/24 and tested
 * by key (M-01 .. M-17). Templates use `{placeholder}` tokens that callers
 * interpolate with a simple `format` helper; missing tokens are left verbatim.
 */

export type MessageKey =
  | "M-01" | "M-02" | "M-03" | "M-04" | "M-05" | "M-06" | "M-07"
  | "M-08" | "M-09" | "M-10" | "M-11" | "M-12" | "M-13" | "M-14"
  | "M-15" | "M-16" | "M-17";

export const MESSAGES: Record<MessageKey, string> = {
  "M-01":
    "Hola, soy el asistente de {business}. Para tomar tu pedido necesito tu nombre, la dirección si querés envío y la sucursal que preferís. Tus datos se usan solo para gestionar tus pedidos. ¿Seguimos?",
  "M-02":
    "Los precios son referenciales y pueden cambiar. El total final lo define el peso en la balanza. Si el cliente solicita confirmación del precio de un producto, el asistente no confirma ni garantiza el precio: informa que los precios son de referencia (estacionales y sujetos a la disponibilidad general diaria) y que la confirmación final requiere la intervención de un vendedor o del dueño.",
  "M-03":
    "En {preferred_branch} no tenemos {product}. Tu pedido se prepara en {fulfilling_branch}, donde sí lo tenemos. Podés retirarlo allí o pedir envío desde esa sucursal.",
  "M-04":
    "Ahora estamos cerrados. Tomé tu pedido #{order_number}. Lo preparamos desde la apertura de {opens_at}.",
  "M-05": "En {branch} por ahora solo hacemos retiro en el local.",
  "M-06": "Necesito que una persona del local revise esto. Ya avisé al personal y te responden por acá.",
  "M-07": "Confirmo tu pedido: {summary}. ¿Está todo bien? Respondé sí para confirmar.",
  "M-08":
    "Listo, tu pedido #{order_number} quedó confirmado. Pagás con {payment_method} al {moment}. {reference_note}",
  "M-09": "Actualicé tu pedido #{order_number}. Te confirmo el resumen: {summary}.",
  "M-10": "Cancelé tu pedido #{order_number}.",
  "M-11": "Buen día. Para {branch}: ¿qué productos faltan hoy?, ¿qué volvió a estar disponible? y ¿hay cambios de precio?",
  "M-12": "Entendí: {changes}. ¿Lo aplico? Respondé sí o no.",
  "M-13": 'No reconozco "{text}" en el catálogo. ¿Querés decir {options}?',
  "M-14": "El audio es muy largo. Mandame un audio de hasta 2 minutos o escribime el pedido.",
  "M-15": "Tuvimos un problema para procesar tu mensaje. Ya avisé al personal para que te responda.",
  "M-16": "No pude entender el audio. ¿Me lo podés escribir?",
  "M-17": "Para facturación te deriva el personal del local. Ya les avisé.",
};

export function getMessage(key: MessageKey): string {
  return MESSAGES[key];
}

/**
 * Interpolates `{placeholder}` tokens. Unknown tokens are left untouched so
 * that a missing value is visible instead of silently dropped.
 */
export function formatMessage(key: MessageKey, values: Record<string, string | number>): string {
  const template = MESSAGES[key];
  return template.replace(/\{([a-z_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export const referenceNoteKey = "M-02" as const;