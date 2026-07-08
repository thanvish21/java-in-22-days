# Java Pro ☕

A kid-friendly, self-paced website that takes a complete beginner from zero to comfortable with Java in bite-sized lessons. Warm tone, bite-sized blocks, badges and a progress streak — but the code is real Java verified to produce exactly what the lessons claim.

## Why "predict-then-reveal" instead of in-browser execution

Some languages run for free inside the browser. Java does not: it needs the **JVM** (Java Virtual Machine), and there's no free, no-backend way to compile and run arbitrary Java client-side. Rather than ship a fake runner, this site teaches with two techniques real programmers use every day:

- **Predict-then-reveal.** Every demo shows the full, runnable program read-only. The learner reads it, predicts the output in their head, then clicks **👁 Show output** to reveal the *verified* result. (`📋 Copy` lets them paste it into a real editor.)
- **Pattern-checked exercises.** Try-it and challenge blocks are editable. **✓ Check** evaluates the typed code against a pattern (`code_includes` or `regex`) — no execution needed — and **💡 Show solution** loads a known-good answer plus its expected output.

Every declared output in the lessons is verified by actually running the code (see below), so "reveal" never lies.

## Optional pluggable live-run endpoint

If you *do* have a Java execution backend (Judge0, JDoodle, Piston, your own container, etc.), wire it in and a **▶ Run** button appears automatically on every runnable code block. Edit one line:

```js
// js/runner-config.js
window.JAVA_RUN_ENDPOINT = "https://your-endpoint.example/run";
```

The front end POSTs `{ "language": "java", "code": "<source>" }` and reads `stdout` (it also accepts `output` / `stdout_text`) and `stderr` (or `error`) from the JSON response. Leave it `null` (the default) and no Run buttons are shown — predict-then-reveal still works fully offline.

## Run locally

No build step. Just serve the folder over HTTP (lessons are loaded with `fetch`, which won't work from `file://`):

```bash
cd java-in-22-days
python3 -m http.server 8000
# open http://localhost:8000
```

Note: the AI tutor and the Matrix's Run/Grade buttons need the Vercel serverless functions in `api/`, so those stay dark on a plain static server — everything else works.

## Verify the lessons

`verify-java.py` is the safety net. For every runnable `code` block (those without `noRun`) and every `solution`/`challenge.solution`, it writes the source to `Main.java` in a temp dir and runs it with **`java Main.java`** (Java 21 single-file source mode — no `javac` step). When a block declares `output` / `solutionOutput`, the script asserts the produced stdout (trailing-whitespace-trimmed) **equals** the declared value. It also schema-checks each lesson (required keys, quiz `answerIndex` in range) and skips `noRun` blocks.

```bash
java -version        # should report 21
python3 verify-java.py
```

A clean run prints `✅ All lessons valid` and exits 0; any mismatch or runtime error exits non-zero with details.

## Deploy to Vercel

The site is fully static. From the project root:

```bash
vercel        # preview
vercel --prod # production
```

`vercel.json` enables clean URLs, sends `X-Content-Type-Options: nosniff`, and marks `/data/*` as always-revalidate so lesson edits show up immediately.

## Project layout

```
index.html            topbar, #app mount, footer; loads the JS in order
css/styles.css        Java-themed styling (shared class names with the renderer)
js/runner-config.js   one line: JAVA_RUN_ENDPOINT (null disables Run buttons)
js/render.js          turns a lesson JSON object into interactive DOM
js/app.js             hash router, localStorage progress, day-unlock, badges
js/ai-tutor.js        JavaBuddy chat panel; talks to /api/tutor
api/                  Vercel serverless functions: tutor.js (OpenRouter proxy),
                      run.js + grade.js (Judge0 proxies for the Matrix)
data/manifest.json    the Pro map (day, emoji, title, tag)
data/dayNN.json       one lesson per file (see schema below)
matrix/               ⚡ Pro Mode: the 1% HFT Matrix track (own README inside)
verify-java.py        runs + asserts every snippet; schema-checks every lesson
```

## Lesson schema (strict JSON)

```jsonc
{
  "day": 1, "emoji": "☕", "title": "...", "subtitle": "...",
  "goal": "...", "estMinutes": 180, "tags": ["..."],
  "blocks": [
    { "type": "text",  "heading": "...", "html": "<p>...</p>" },
    { "type": "code",  "caption": "...", "code": "<full program>", "output": "<exact stdout>", "explain": "..." },
    { "type": "code",  "code": "...", "noRun": true },                 // input-based/illustrative: omit output
    { "type": "tip",   "html": "...", "variant": "warn" },             // variant optional
    { "type": "quiz",  "question": "...", "options": ["..."], "answerIndex": 0, "explain": "..." },
    { "type": "tryit", "title": "...", "instructions": "...", "starter": "<compiles>",
      "check": { "code_includes": ["..."] },                          // or { "regex": "..." }
      "solution": "<full program>", "solutionOutput": "<exact stdout>",
      "passMsg": "...", "failMsg": "..." }
  ],
  "challenge": { /* same shape as tryit, plus "hint" */ }
}
```

**Hard rules for authoring:** every runnable `code`/`solution` is a complete program with a `public class Main` and `public static void main(String[] args)`. `output`/`solutionOutput` must be the exact stdout — always confirm with `python3 verify-java.py`. No `Scanner`/`System.in` in verified snippets (mark those `noRun`). Standard library only, single file, Java 21.

## 🤖 AI Tutor Setup

The AI tutor (JavaBuddy) uses [OpenRouter](https://openrouter.ai) for free AI model access. The browser never sees the key: the chat panel posts to the same-origin `api/tutor.js` function, which proxies to OpenRouter.

1. Sign up at [openrouter.ai](https://openrouter.ai) (free)
2. Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. Add `OPENROUTER_API_KEY` to your Vercel project environment variables
4. Deploy — the tutor defaults to `meta-llama/llama-3.3-70b-instruct:free`; set `OPENROUTER_MODEL` to use any other OpenRouter model id

Without the key, the tutor answers with a clear "not configured" message instead of failing silently. The tutor automatically knows which lesson the student is on and can see their code editor contents.
