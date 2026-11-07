// Genera el sorteo. Nunca imprime ni guarda en claro quién regala a quién.
// Salida: docs/data.json (cifrado) y enlaces.txt (solo nombre -> enlace).
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomInt, createHash, createCipheriv } from "node:crypto";

const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
const nombres = cfg.participantes;
if (nombres.length < 2) throw new Error("Hacen falta al menos 2 participantes");

// Barajado criptográfico hasta que nadie se toque a sí mismo
function sorteo(n) {
  for (;;) {
    const p = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = randomInt(i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    if (p.every((v, i) => v !== i)) return p;
  }
}

const sha = (prefijo, token) => createHash("sha256").update(prefijo).update(token).digest();
const b64u = (buf) => buf.toString("base64url");

const asignacion = sorteo(nombres.length);
const data = {};
const enlaces = [];

nombres.forEach((nombre, i) => {
  const token = randomBytes(16);                       // 128 bits: imposible de adivinar
  const id = sha("id:", token).toString("hex").slice(0, 32);
  const key = sha("key:", token);                      // AES-256-GCM
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plano = JSON.stringify({ de: nombre, para: nombres[asignacion[i]], mensaje: cfg.mensaje });
  const ct = Buffer.concat([cipher.update(plano, "utf8"), cipher.final(), cipher.getAuthTag()]);
  data[id] = { iv: b64u(iv), ct: b64u(ct) };
  enlaces.push(`${nombre}: ${cfg.baseUrl}#${b64u(token)}`);
});

// Orden de las entradas aleatorio para no delatar el orden de los participantes
const ordenado = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("./docs/data.json", import.meta.url), JSON.stringify({ titulo: cfg.titulo, entradas: ordenado }) + "\n");
writeFileSync(new URL("./enlaces.txt", import.meta.url), enlaces.join("\n") + "\n");
console.log(`Sorteo hecho para ${nombres.length} personas. Enlaces en enlaces.txt (no contiene resultados).`);
