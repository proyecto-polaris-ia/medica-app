#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";

const DEFAULT_WEBHOOK_URL = "http://medica-app.vercel.app/api/whatsapp/webhook";

function signBody(rawBody, appSecret) {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

function printFailureHint(status, body, signature) {
  const error = typeof body === "object" && body ? body.error : String(body ?? "");

  if (status === 503 && error.includes("signing secret is not configured")) {
    console.error("\nDiagnóstico:");
    console.error("  El webhook destino no tiene WHATSAPP_APP_SECRET configurado.");
    console.error("  Configura en Vercel Production el App Secret de tu app de Meta y redeploya.");
    console.error("  Ese mismo valor debe existir localmente en .env.local para que este script firme el payload.");
    return;
  }

  if (status === 401) {
    console.error("\nDiagnóstico:");
    if (!signature) {
      console.error("  Este script envió el payload sin firma porque no encontró WHATSAPP_APP_SECRET local.");
      console.error("  Agrega WHATSAPP_APP_SECRET en .env.local con el mismo App Secret configurado en Vercel.");
    } else {
      console.error("  El webhook rechazó la firma. Revisa que WHATSAPP_APP_SECRET local sea exactamente el mismo que en Vercel.");
    }
  }
}

function loadDotEnv(path = ".env.local") {
  if (!existsSync(path)) return {};
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key.trim()] = value;
  }
  return env;
}

function printHelp() {
  console.log(`Simula un mensaje inbound de WhatsApp Cloud API contra el webhook de medica-app.

Uso:
  npm run whatsapp:simulate -- --text "¿Cuál es su horario?"
  node scripts/whatsapp-simulate-inbound.mjs --text "Quiero agendar una valoración"

Opciones:
  --text <mensaje>                  Texto del mensaje inbound. Requerido, salvo --help.
  --url <webhook_url>               Default: ${DEFAULT_WEBHOOK_URL}
  --from <telefono_e164_sin_plus>   Remitente simulado. Default: WHATSAPP_SIMULATED_FROM_PHONE o WHATSAPP_HUMAN_ALERT_PHONE de .env.local.
  --name <nombre>                   Nombre de perfil simulado. Default: Controlled Test.
  --message-id <wamid>              ID de mensaje. Default: wamid.SIM_<timestamp>_<uuid>.
  --timestamp <unix_seconds>        Timestamp del evento. Default: now.
  --business-phone-number-id <id>   Incluye metadata.phone_number_id. Omitido por default para que la app use WHATSAPP_PHONE_NUMBER_ID de Vercel al responder.
  --display-phone-number <numero>   metadata.display_phone_number. Default: 15556766474.
  --dry-run                         Solo imprime payload y headers simulados; no envía.
  --help                            Muestra esta ayuda.

Notas:
  - Si WHATSAPP_APP_SECRET está configurado, firma el body exacto enviado con X-Hub-Signature-256.
  - No usa ni imprime tokens ni secrets de WhatsApp.
  - Para probar idempotencia, ejecuta dos veces con el mismo --message-id.
  - Si incluyes --business-phone-number-id fake, el outbound puede fallar igual que los payloads de prueba de Meta.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Falta valor para ${arg}`);
      args[key] = value;
      i += 1;
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }
  return args;
}

function buildPayload({ text, from, name, messageId, timestamp, businessPhoneNumberId, displayPhoneNumber }) {
  const metadata = { display_phone_number: displayPhoneNumber };
  if (businessPhoneNumberId) metadata.phone_number_id = businessPhoneNumberId;

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "controlled-waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata,
              contacts: [{ profile: { name }, wa_id: from }],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp: String(timestamp),
                  text: { body: text },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const fileEnv = loadDotEnv();
  const mergedEnv = { ...fileEnv, ...process.env };
  const text = args.text;
  const from = args.from || mergedEnv.WHATSAPP_SIMULATED_FROM_PHONE || mergedEnv.WHATSAPP_HUMAN_ALERT_PHONE;

  if (!text) throw new Error("Debes pasar --text \"mensaje\"");
  if (!from) throw new Error("Debes pasar --from o configurar WHATSAPP_SIMULATED_FROM_PHONE/WHATSAPP_HUMAN_ALERT_PHONE en .env.local");

  const timestamp = args.timestamp || Math.floor(Date.now() / 1000);
  const messageId = args.messageId || `wamid.SIM_${timestamp}_${randomUUID().slice(0, 8)}`;
  const url = args.url || DEFAULT_WEBHOOK_URL;
  const payload = buildPayload({
    text,
    from,
    name: args.name || "Controlled Test",
    messageId,
    timestamp,
    businessPhoneNumberId: args.businessPhoneNumberId,
    displayPhoneNumber: args.displayPhoneNumber || "15556766474",
  });

  const rawBody = JSON.stringify(payload);
  const appSecret = mergedEnv.WHATSAPP_APP_SECRET?.trim();
  const signature = appSecret ? signBody(rawBody, appSecret) : null;
  const headers = {
    "Content-Type": "application/json",
    ...(signature ? { "X-Hub-Signature-256": signature } : {}),
  };

  console.log(`Webhook: ${url}`);
  console.log(`Message ID: ${messageId}`);
  console.log(`From: ${from}`);
  console.log(`Text: ${text}`);
  console.log(`Signed: ${signature ? "yes" : "no"}`);
  if (!signature) {
    console.warn("Warning: WHATSAPP_APP_SECRET is not configured locally; hardened webhooks will reject unsigned POSTs.");
  }

  if (args.dryRun) {
    console.log("\nHeaders:");
    console.log(JSON.stringify(headers, null, 2));
    console.log("\nPayload:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  console.log(`HTTP: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok) {
    printFailureHint(response.status, body, signature);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
