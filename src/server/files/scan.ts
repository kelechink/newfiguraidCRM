import "server-only";
import net from "node:net";

/**
 * Virus scan via clamd INSTREAM (Security #11). Returns "CLEAN" | "INFECTED" | "FAILED".
 * In development without CLAMAV_HOST, files are treated as clean; production refuses
 * to start uploads without a scanner (see upload.ts).
 */
export async function scanBytes(bytes: Buffer): Promise<"CLEAN" | "INFECTED" | "FAILED"> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return "CLEAN";
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    let reply = "";
    sock.setTimeout(15_000, () => {
      sock.destroy();
      resolve("FAILED");
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 64 * 1024) {
        const chunk = bytes.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => resolve(/OK/.test(reply) ? "CLEAN" : /FOUND/.test(reply) ? "INFECTED" : "FAILED"));
    sock.on("error", () => resolve("FAILED"));
  });
}
