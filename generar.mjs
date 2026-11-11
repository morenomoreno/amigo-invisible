// Genera el sorteo. Nunca imprime ni guarda en claro quién regala a quién.
// Uso: node generar.mjs <familia>   (lee familias/<familia>/config.json)
// Salida: docs/<familia>/data.json (cifrado) + docs/<familia>/index.html,
//         y familias/<familia>/enlaces.txt y mensajes.txt (solo nombre -> enlace).
// El primer sorteo (raíz de docs/) no se toca: sus enlaces siguen funcionando.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { randomBytes, randomInt, createHash, createCipheriv } from "node:crypto";

const familia = process.argv[2];
if (!familia || !/^[a-z0-9-]+$/.test(familia)) {
  console.error("Uso: node generar.mjs <familia>   (minúsculas, números y guiones; p. ej. familia-garcia)");
  process.exit(1);
}
const dirCfg = new URL(`./familias/${familia}/`, import.meta.url);
const dirWeb = new URL(`./docs/${familia}/`, import.meta.url);
const salidaData = new URL("data.json", dirWeb);
if (existsSync(salidaData) && !process.argv.includes("--rehacer")) {
  console.error(`Ya existe un sorteo en docs/${familia}/. Repetirlo invalidaría los enlaces enviados.\nSi de verdad quieres rehacerlo: node generar.mjs ${familia} --rehacer`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(new URL("config.json", dirCfg)));
const baseUrl = cfg.baseUrl.replace(/\/?$/, "/") + `${familia}/`;
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
const mensajes = [];

nombres.forEach((nombre, i) => {
  const token = randomBytes(16);                       // 128 bits: imposible de adivinar
  const id = sha("id:", token).toString("hex").slice(0, 32);
  const key = sha("key:", token);                      // AES-256-GCM
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plano = JSON.stringify({ de: nombre, para: nombres[asignacion[i]], mensaje: cfg.mensaje });
  const ct = Buffer.concat([cipher.update(plano, "utf8"), cipher.final(), cipher.getAuthTag()]);
  data[id] = { iv: b64u(iv), ct: b64u(ct) };
  const enlace = `${baseUrl}#${b64u(token)}`;
  enlaces.push(`${nombre}: ${enlace}`);
  mensajes.push(`===== ${nombre} =====\n` + cfg.whatsapp.replaceAll("{nombre}", nombre).replaceAll("{enlace}", enlace));
});

// Orden de las entradas aleatorio para no delatar el orden de los participantes
const ordenado = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(dirWeb, { recursive: true });
copyFileSync(new URL("./docs/index.html", import.meta.url), new URL("index.html", dirWeb));
writeFileSync(salidaData, JSON.stringify({ titulo: cfg.titulo, presupuesto: cfg.presupuesto, entradas: ordenado }) + "\n");
writeFileSync(new URL("enlaces.txt", dirCfg), enlaces.join("\n") + "\n");
writeFileSync(new URL("mensajes.txt", dirCfg), mensajes.join("\n\n\n") + "\n");
console.log(`Sorteo hecho para ${nombres.length} personas. Enlaces y mensajes de WhatsApp en familias/${familia}/ (no contienen resultados).`);
