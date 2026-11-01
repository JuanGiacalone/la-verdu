// Printer simulator (PRD 12.4, 19.1). Listens like an Ethernet ESC/POS printer on TCP 9100.
// Every print job (one TCP connection) is saved as <name>.bin with the raw bytes and
// <name>.txt with a plain-text preview. Node built-ins only.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const port = Number(process.env.PRINTER_SIM_PORT ?? 9100);
const outDir = process.env.PRINTER_SIM_OUT ?? join(process.cwd(), ".dev", "printouts");
const DLE = 0x10;
const EOT = 0x04;
const STATUS_ONLINE = 0x12;

mkdirSync(outDir, { recursive: true });
let sequence = 0;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Strips ESC and GS command sequences for a readable preview. A command is the
 * introducer, optional parameter bytes (0x20-0x3f) and a final byte (0x40-0x7e).
 * Other control bytes are dropped; line feeds are kept. Approximate by design.
 */
export function toPreview(bytes) {
  const kept = [];
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte === ESC || byte === GS) {
      index += 1;
      while (index < bytes.length && bytes[index] >= 0x20 && bytes[index] <= 0x3f) {
        index += 1;
      }
      index += 1;
      continue;
    }
    if (byte === LF || byte >= 0x20) {
      kept.push(byte);
    }
    index += 1;
  }
  return Buffer.from(kept).toString("latin1");
}

const server = createServer((socket) => {
  const chunks = [];
  socket.on("data", (chunk) => {
    chunks.push(chunk);
    // Answer real-time status requests (DLE EOT n) with an online status byte.
    for (let i = 0; i < chunk.length - 2; i += 1) {
      if (chunk[i] === DLE && chunk[i + 1] === EOT) {
        socket.write(Buffer.from([STATUS_ONLINE]));
      }
    }
  });
  socket.on("end", () => {
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0) {
      return;
    }
    sequence += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(outDir, `${stamp}-${String(sequence).padStart(4, "0")}`);
    writeFileSync(`${base}.bin`, bytes);
    writeFileSync(`${base}.txt`, toPreview(bytes));
    process.stdout.write(`printed ${bytes.length} bytes -> ${base}.txt\n`);
  });
  socket.on("error", () => socket.destroy());
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`printer-sim listening on ${port}, output in ${outDir}\n`);
});
