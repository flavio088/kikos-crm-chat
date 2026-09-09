import { createHmac } from "node:crypto";

const [phone = "5511999990001", ...words] = process.argv.slice(2);
const body = words.length === 0 ? "Oi, ainda tem vaga?" : words.join(" ");

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const secret = process.env.WHATSAPP_APP_SECRET ?? "dev-app-secret";

const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "0",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5511000000000", phone_number_id: "0" },
            contacts: [{ profile: { name: "Cliente" }, wa_id: phone }],
            messages: [
              {
                from: phone,
                id: `wamid.sim${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body },
              },
            ],
          },
        },
      ],
    },
  ],
});

const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

const response = await fetch(`${apiUrl}/webhooks/whatsapp`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-hub-signature-256": signature },
  body: payload,
});

console.log(`${response.status} ${response.statusText}`);
const answer = await response.text();
if (answer.length > 0) console.log(answer);
if (!response.ok) process.exit(1);
console.log(`Mensagem de ${phone} entregue ao webhook: "${body}"`);
