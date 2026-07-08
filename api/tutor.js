/* api/tutor.js — Vercel Node serverless function for the JavaBuddy AI tutor.

   Same-origin endpoint POST /api/tutor. The frontend (js/ai-tutor.js) posts
   { message, lessonDay?, lessonTitle?, codeContext?, history? } and expects
   { ok: true, reply } or { ok: false, error }. This proxies to OpenRouter so
   the API key stays server-side in Vercel env vars:

     OPENROUTER_API_KEY   required — https://openrouter.ai/keys
     OPENROUTER_MODEL     optional — defaults to a free-tier model
*/

"use strict";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const MAX_MSG = 2000; // matches the client textarea maxlength
const MAX_HISTORY = 12; // last N turns; enough context without runaway tokens

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function buildSystemPrompt(lessonDay, lessonTitle, codeContext) {
  let prompt =
    "You are JavaBuddy, a friendly Java tutor on a beginner-to-pro Java course website. " +
    "Explain concepts simply and encouragingly, with short runnable Java examples where helpful. " +
    "Stay on the topic of Java and programming. Keep answers concise.";
  if (lessonDay) {
    prompt += " The student is currently on Day " + lessonDay + (lessonTitle ? ": " + lessonTitle : "") + ".";
  }
  if (codeContext) {
    prompt += "\n\nThe student's current code editor contains:\n```java\n" + codeContext + "\n```";
  }
  return prompt;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // 503 so the client can distinguish "not configured" from a transient failure.
    sendJson(res, 503, {
      ok: false,
      error: "AI tutor not configured. Set OPENROUTER_API_KEY in the Vercel project environment. See README 'AI Tutor Setup'.",
    });
    return;
  }

  const body = await readBody(req);
  const { message, lessonDay, lessonTitle, codeContext, history } = body || {};

  if (typeof message !== "string" || !message.trim()) {
    sendJson(res, 400, { ok: false, error: "Missing 'message'." });
    return;
  }

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(
        typeof lessonDay === "number" ? lessonDay : null,
        typeof lessonTitle === "string" ? lessonTitle : null,
        typeof codeContext === "string" ? codeContext.slice(0, 4000) : null
      ),
    },
  ];

  if (Array.isArray(history)) {
    for (const turn of history.slice(-MAX_HISTORY)) {
      if (turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string") {
        messages.push({ role: turn.role, content: turn.content.slice(0, MAX_MSG) });
      }
    }
  }
  messages.push({ role: "user", content: message.slice(0, MAX_MSG) });

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        "X-Title": "JavaBuddy Tutor",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages,
        max_tokens: 1024,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = data && data.error && data.error.message ? data.error.message : "HTTP " + resp.status;
      sendJson(res, 502, { ok: false, error: "AI tutor upstream error: " + detail });
      return;
    }

    const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== "string" || !reply.trim()) {
      sendJson(res, 502, { ok: false, error: "AI tutor returned an empty reply. Please try again." });
      return;
    }

    sendJson(res, 200, { ok: true, reply });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
  }
};
