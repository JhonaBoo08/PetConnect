// Loopback-only test double: never forwards a message to an SMS provider.
import http from "node:http";
if (process.env.NODE_ENV !== "test") throw new Error("Mock SMSGate requires NODE_ENV=test.");
const messages = new Map();
const authorization = "Basic " + Buffer.from("fixture:fixture-password").toString("base64");
http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") return res.end('{"ok":true}');
  if (req.headers.authorization !== authorization) { res.writeHead(401); return res.end("{}"); }
  if (req.method === "POST" && url.pathname === "/messages") {
    const parts = [];
    let size = 0;
    for await (const part of req) {
      size += part.length; if (size > 8192) { res.writeHead(413); return res.end("{}"); }
      parts.push(part);
    }
    try {
      const body = JSON.parse(Buffer.concat(parts));
      const phone = body.phoneNumbers?.[0];
      const code = body.textMessage?.text?.match(/\b\d{6}\b/)?.[0];
      if (!/^\+63\d{10}$/.test(phone) || !code || body.ttl !== 600) throw new Error();
      messages.set(phone, code);
      res.writeHead(202); return res.end('{"id":"mock-message","state":"Pending"}');
    } catch { res.writeHead(400); return res.end("{}"); }
  }
  if (req.method === "GET" && url.pathname === "/test-code") {
    const phone = url.searchParams.get("phone");
    const code = messages.get(phone);
    if (code) { messages.delete(phone); return res.end(JSON.stringify({ code })); }
  }
  res.writeHead(404); res.end("{}");
}).listen(Number(process.env.MOCK_SMSGATE_PORT || 9098), "127.0.0.1");
