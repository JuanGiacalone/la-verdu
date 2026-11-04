import type { PrintJobData, RenderedPrint } from "./types.js";

const WIDTH = 48;

// ESC/POS command bytes.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function escInit(): number[] {
  return [ESC, 0x40]; // ESC @
}

function escCodePage0(): number[] {
  return [ESC, 0x74, 0x00]; // ESC t 0 (PC437)
}

function escBold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0]; // ESC E
}

function escDoubleHeight(on: boolean): number[] {
  // ESC ! n: bit 4 = double height, bit 5 = double width
  return [ESC, 0x21, on ? 0x10 : 0x00];
}

function escAlignCenter(): number[] {
  return [ESC, 0x61, 0x01]; // ESC a 1
}

function escAlignLeft(): number[] {
  return [ESC, 0x61, 0x00]; // ESC a 0
}

function gsCutPartial(): number[] {
  return [GS, 0x56, 0x01]; // GS V 1
}

function textToBytes(text: string): number[] {
  // Strip accents for ESC/POS code page compatibility.
  const normalized = stripAccents(text);
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    bytes.push(normalized.charCodeAt(i) & 0xff);
  }
  return bytes;
}

function stripAccents(text: string): string {
  return text
    .replace(/[áàäâ]/gi, "a")
    .replace(/[éèëê]/gi, "e")
    .replace(/[íìïî]/gi, "i")
    .replace(/[óòöô]/gi, "o")
    .replace(/[úùüû]/gi, "u")
    .replace(/[ñ]/gi, "n")
    .replace(/[ç]/gi, "c");
}

function padRight(text: string, width: number): string {
  const stripped = stripAccents(text);
  if (stripped.length >= width) return stripped.slice(0, width);
  return stripped + " ".repeat(width - stripped.length);
}

function center(text: string, width: number): string {
  const stripped = stripAccents(text);
  if (stripped.length >= width) return stripped.slice(0, width);
  const leftPad = Math.floor((width - stripped.length) / 2);
  return " ".repeat(leftPad) + stripped;
}

function formatQuantity(qty: number, unit: "KG" | "UNIT" | "BUNCH"): string {
  if (unit === "KG") {
    if (qty === 0.25) return "1/4";
    if (qty === 0.5) return "1/2";
    if (qty === 0.75) return "3/4";
    // Use comma decimal for other values.
    return qty.toString().replace(".", ",");
  }
  return String(qty);
}

function formatUnit(unit: "KG" | "UNIT" | "BUNCH"): string {
  if (unit === "KG") return "kg";
  if (unit === "UNIT") return "u";
  return "atado";
}

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function buildPreview(data: PrintJobData): string {
  const lines: string[] = [];
  const sep = "-".repeat(WIDTH);

  // Header.
  lines.push(center(`LA VERDU - SUC. ${data.branchShortName}`, WIDTH));
  lines.push(sep);

  // Version label.
  if (data.kind === "MODIFICATION") {
    lines.push(center("*** MODIFICACION ***", WIDTH));
  } else if (data.kind === "CANCELLATION") {
    lines.push(center("*** CANCELADO ***", WIDTH));
  }

  // Order number and version.
  const versionStr = data.version > 1 ? `VERSION ${data.version}` : "";
  const orderLine = `PEDIDO #${data.orderNumber}`;
  if (versionStr) {
    lines.push(padRight(orderLine, WIDTH - versionStr.length) + versionStr);
  } else {
    lines.push(orderLine);
  }

  // Date.
  lines.push(formatDate(data.confirmedAt));

  // Customer.
  let customerLine = `Cliente: ${stripAccents(data.customerName).slice(0, 30)}`;
  if (data.customerOrderCount !== undefined) {
    const count = data.customerOrderCount;
    const suffix = count <= 1 ? " (NUEVO)" : ` (pedido #${count})`;
    customerLine += suffix;
  }
  lines.push(customerLine);

  // Delivery.
  if (data.fulfillment === "PICKUP") {
    lines.push(`Entrega: RETIRA ${data.pickupTime ?? ""}`);
  } else {
    let deliveryLine = `Entrega: DOMICILIO - ${stripAccents(data.deliveryAddress ?? "")}`;
    if (data.deliveryTime) {
      deliveryLine += ` - ${data.deliveryTime}`;
    }
    // Wrap if too long.
    if (deliveryLine.length > WIDTH) {
      lines.push(deliveryLine.slice(0, WIDTH));
      let rest = deliveryLine.slice(WIDTH);
      while (rest.length > 0) {
        lines.push(rest.slice(0, WIDTH));
        rest = rest.slice(WIDTH);
      }
    } else {
      lines.push(deliveryLine);
    }
  }

  // Payment.
  lines.push(`Pago: ${stripAccents(data.paymentMethodName).toUpperCase()}`);

  // Status.
  const statusLabel = data.paymentStatus === "PAID" ? "PAGADO" : "A COBRAR";
  lines.push(`Estado: ${statusLabel}`);

  // Derivation.
  if (data.derived && data.preferredBranchShortName) {
    lines.push(`Derivado desde: SUC. ${stripAccents(data.preferredBranchShortName)}`);
  }

  lines.push(sep);

  // Items header.
  lines.push(`${padRight("Cant.", 12)}Producto`);

  // Items.
  for (const item of data.items) {
    const qtyStr = `${formatQuantity(item.quantity, item.unit)} ${formatUnit(item.unit)}`;
    const name = stripAccents(item.productName);
    const qtyCol = padRight(qtyStr, 12);
    if (name.length <= 32) {
      lines.push(qtyCol + name);
    } else {
      // Wrap to two lines.
      lines.push(qtyCol + name.slice(0, 32));
      lines.push(" ".repeat(12) + name.slice(32, 64));
    }
  }

  lines.push(sep);

  // Notes.
  if (data.notes && data.notes.trim().length > 0) {
    const notesText = `Notas: ${stripAccents(data.notes)}`;
    if (notesText.length <= WIDTH) {
      lines.push(notesText);
    } else {
      lines.push(notesText.slice(0, WIDTH));
      let rest = notesText.slice(WIDTH);
      while (rest.length > 0) {
        lines.push(rest.slice(0, WIDTH));
        rest = rest.slice(WIDTH);
      }
    }
    lines.push(sep);
  }

  return `${lines.join("\n")}\n`;
}

function buildBytes(data: PrintJobData): Uint8Array {
  const bytes: number[] = [];

  // Initialize.
  bytes.push(...escInit());
  bytes.push(...escCodePage0());

  // Header (centered, bold).
  bytes.push(...escAlignCenter());
  bytes.push(...escBold(true));
  bytes.push(...textToBytes(`LA VERDU - SUC. ${data.branchShortName}`));
  bytes.push(LF);
  bytes.push(...escBold(false));
  bytes.push(...escAlignLeft());

  // Separator.
  bytes.push(...textToBytes("-".repeat(WIDTH)));
  bytes.push(LF);

  // Version label.
  if (data.kind === "MODIFICATION") {
    bytes.push(...escAlignCenter());
    bytes.push(...escBold(true));
    bytes.push(...textToBytes("*** MODIFICACION ***"));
    bytes.push(LF);
    bytes.push(...escBold(false));
    bytes.push(...escAlignLeft());
  } else if (data.kind === "CANCELLATION") {
    bytes.push(...escAlignCenter());
    bytes.push(...escBold(true));
    bytes.push(...textToBytes("*** CANCELADO ***"));
    bytes.push(LF);
    bytes.push(...escBold(false));
    bytes.push(...escAlignLeft());
  }

  // Order number (bold, double height).
  bytes.push(...escBold(true));
  bytes.push(...escDoubleHeight(true));
  bytes.push(...textToBytes(`PEDIDO #${data.orderNumber}`));
  bytes.push(...escDoubleHeight(false));
  bytes.push(...escBold(false));

  // Version on same line.
  if (data.version > 1) {
    const versionStr = `VERSION ${data.version}`;
    // Pad to align right.
    const orderStr = `PEDIDO #${data.orderNumber}`;
    const padding = WIDTH - orderStr.length - versionStr.length;
    if (padding > 0) {
      bytes.push(...textToBytes(" ".repeat(padding) + versionStr));
    }
  }
  bytes.push(LF);

  // Date.
  bytes.push(...textToBytes(formatDate(data.confirmedAt)));
  bytes.push(LF);

  // Customer.
  let customerBytesLine = `Cliente: ${stripAccents(data.customerName).slice(0, 30)}`;
  if (data.customerOrderCount !== undefined) {
    const count = data.customerOrderCount;
    const suffix = count <= 1 ? " (NUEVO)" : ` (pedido #${count})`;
    customerBytesLine += suffix;
  }
  bytes.push(...textToBytes(customerBytesLine));
  bytes.push(LF);

  // Delivery.
  if (data.fulfillment === "PICKUP") {
    bytes.push(...textToBytes(`Entrega: RETIRA ${data.pickupTime ?? ""}`));
    bytes.push(LF);
  } else {
    let deliveryLine = `Entrega: DOMICILIO - ${stripAccents(data.deliveryAddress ?? "")}`;
    if (data.deliveryTime) {
      deliveryLine += ` - ${data.deliveryTime}`;
    }
    // Simple: print on one or more lines.
    bytes.push(...textToBytes(deliveryLine.slice(0, WIDTH)));
    bytes.push(LF);
    let rest = deliveryLine.slice(WIDTH);
    while (rest.length > 0) {
      bytes.push(...textToBytes(rest.slice(0, WIDTH)));
      bytes.push(LF);
      rest = rest.slice(WIDTH);
    }
  }

  // Payment.
  bytes.push(...textToBytes(`Pago: ${stripAccents(data.paymentMethodName).toUpperCase()}`));
  bytes.push(LF);

  // Status.
  const statusLabel = data.paymentStatus === "PAID" ? "PAGADO" : "A COBRAR";
  bytes.push(...textToBytes(`Estado: ${statusLabel}`));
  bytes.push(LF);

  // Derivation.
  if (data.derived && data.preferredBranchShortName) {
    bytes.push(
      ...textToBytes(`Derivado desde: SUC. ${stripAccents(data.preferredBranchShortName)}`),
    );
    bytes.push(LF);
  }

  // Separator.
  bytes.push(...textToBytes("-".repeat(WIDTH)));
  bytes.push(LF);

  // Items header.
  bytes.push(...textToBytes(`${padRight("Cant.", 12)}Producto`));
  bytes.push(LF);

  // Items.
  for (const item of data.items) {
    const qtyStr = `${formatQuantity(item.quantity, item.unit)} ${formatUnit(item.unit)}`;
    const name = stripAccents(item.productName);
    const qtyCol = padRight(qtyStr, 12);
    if (name.length <= 32) {
      bytes.push(...textToBytes(qtyCol + name));
      bytes.push(LF);
    } else {
      bytes.push(...textToBytes(qtyCol + name.slice(0, 32)));
      bytes.push(LF);
      bytes.push(...textToBytes(" ".repeat(12) + name.slice(32, 64)));
      bytes.push(LF);
    }
  }

  // Separator.
  bytes.push(...textToBytes("-".repeat(WIDTH)));
  bytes.push(LF);

  // Notes.
  if (data.notes && data.notes.trim().length > 0) {
    const notesText = `Notas: ${stripAccents(data.notes)}`;
    if (notesText.length <= WIDTH) {
      bytes.push(...textToBytes(notesText));
      bytes.push(LF);
    } else {
      bytes.push(...textToBytes(notesText.slice(0, WIDTH)));
      bytes.push(LF);
      let rest = notesText.slice(WIDTH);
      while (rest.length > 0) {
        bytes.push(...textToBytes(rest.slice(0, WIDTH)));
        bytes.push(LF);
        rest = rest.slice(WIDTH);
      }
    }
    bytes.push(...textToBytes("-".repeat(WIDTH)));
    bytes.push(LF);
  }

  // Cut.
  bytes.push(...gsCutPartial());

  return new Uint8Array(bytes);
}

export function renderPrintJob(data: PrintJobData): RenderedPrint {
  const bytes = buildBytes(data);
  const preview = buildPreview(data);
  return { bytes, preview };
}
