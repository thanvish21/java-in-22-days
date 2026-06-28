# 1% HFT Matrix — Java Platform Contract (authoritative)

Single source of truth. Frontend plumbing and content agents conform exactly.
Field names are normative — do not rename. Mirrors the Python platform contract,
with one key difference: **the browser cannot run Java, so every problem uses the
backend engine.**

## Architecture
- Static site on Vercel. `index.html` + `js/*` + `data/*.json`.
- ALL Java execution (compile + run, GC/JIT flags, concurrency stress) runs on the
  **backend**: Vercel serverless `api/run.js` + `api/grade.js` proxying to Judge0
  (key server-side in Vercel env). There is no in-browser Java.
- `js/runner.js` posts to `window.HFT_RUNNER_URL` (default `"/api"`) at `/run`, `/grade`.
- `js/onepct.js` = 1% dark-terminal toggle + `profile()` (time+mem) + `estimateComplexity()`
  (empirical Big-O). Already built — reuse.

## Curriculum (replaces the old 22-day basics entirely)
Four tiers, one file each `data/tier1.json` … `data/tier4.json`.
1. High-Speed Lambda Comparators & PriorityQueues — multi-layer custom comparators,
   multi-dimensional sort under tight time/memory budgets, 1e6-element streams.
2. Collections Framework Internals — HashMap bucket collisions, treeification
   (linked nodes → red-black trees), load-factor resize cost trackers.
3. Concurrency & Project Loom — virtual threads, ExecutorService, CountDownLatch,
   Semaphore; thread-safe pools; deadlock / race / safety stress tests.
4. JVM Low-Level Execution & GC Tuning — G1 vs ZGC behavior via runtime flags,
   heap vs stack allocation trackers, JIT warm-up profiling.

## `data/tiers.json` (tier manifest)
```json
{
  "track": "Java Systems Engineering — 1% HFT Matrix",
  "tiers": [
    { "tier": 1, "emoji": "⚡", "title": "High-Speed Lambda Comparators & PriorityQueues",
      "tag": "comparators", "summary": "one-line summary" }
  ]
}
```

## `data/tierN.json` (one tier)
```json
{
  "tier": 1,
  "language": "java",
  "emoji": "⚡",
  "title": "High-Speed Lambda Comparators & PriorityQueues",
  "subtitle": "short tagline",
  "goal": "what the engineer can do after this tier",
  "estMinutes": 240,
  "tags": ["comparators", "priorityqueue", "sorting"],
  "blocks": [ /* teaching blocks */ ],
  "problems": [ /* graded challenges */ ]
}
```

### `blocks[]` — teaching content (renderer block types)
Allowed `type`: `text`, `code`, `tip`, `quiz`, `tryit`.
- `text`: `{ "type":"text", "heading":"…", "html":"<p>…</p>" }`
- `code`: `{ "type":"code", "caption":"…", "code":"…", "explain":"…" }`  (Java, shown; run via backend)
- `tip`: `{ "type":"tip", "variant":"warn"?, "html":"…" }`
- `quiz`: `{ "type":"quiz", "question":"…", "options":[…], "answerIndex":0, "explain":"…" }`
- `tryit`: `{ "type":"tryit", "title":"…", "instructions":"…", "starter":"…",
    "check": { "stdout_includes"|"stdout_equals"|"code_includes"|"regex": … },
    "solution":"…", "passMsg":"…", "failMsg":"…" }`
Senior/HFT level only. No "hello world".

### `problems[]` — graded challenges
```json
{
  "id": "java-t1-p1",
  "title": "Three-key comparator hot path",
  "difficulty": "hard",
  "instructions": "<p>HTML. Exact constraints: input format, time/mem budget, ordering rule.</p>",
  "language": "java",
  "engine": "backend",
  "starter": "complete compilable skeleton; public class Main; reads stdin, prints stdout",
  "solution": "complete correct reference solution",
  "runtimeFlags": ["-Xlog:gc"],
  "stdin": "default stdin for Run (optional)",
  "tests": [
    { "name": "basic", "stdin": "…", "expectStdout": "…",
      "matchMode": "trim", "timeBudgetMs": 2000, "memBudgetKb": 262144, "hidden": false },
    { "name": "stress 1e6", "stdin": "…", "expectStdout": "…",
      "matchMode": "trim", "timeBudgetMs": 2000, "memBudgetKb": 524288, "hidden": true }
  ],
  "complexity": {
    "codeTemplate": "self-contained Main with {N} input size for timing",
    "sizes": [10000, 50000, 100000, 500000, 1000000],
    "expected": "O(n log n)"
  },
  "hint": "one nudge"
}
```
Rules:
- `engine` is always `"backend"` for Java.
- Class name MUST be `Main` (Judge0 single-file Java expects `Main`). `starter`/`solution`
  are full compilable files with `public class Main { public static void main(String[] a) … }`.
- `matchMode` ∈ `exact` | `trim` | `includes` | `regex`. Default `trim`.
- I/O via **stdin → stdout**; state the format precisely in `instructions`.
- Tier 4 problems pass GC/JIT flags via `runtimeFlags` (e.g. `-Xlog:gc`, `-XX:+UseZGC`,
  `-Xint` vs JIT). Peak heap comes from the backend's GC-log parse.
- Every problem: ≥1 visible test + ≥1 hidden test. 3–5 problems per tier.
- `complexity` expected on ≥1 problem per tier.

## Grading contract
Backend only: `window.HFTRunner.grade({language:"java", code, runtimeFlags, tests})`
→ `{ passed, total, allPassed, results:[{name, ok, hidden, timeMs, memKb}] }`.
Hidden tests reveal pass/fail only. If `window.HFTRunner.configured()` is false, the card
shows a "needs execution backend" notice instead of grading.

## Profile + complexity UI
Per problem: ▶ Run · ⏱ Profile · ✓ Grade · 💡 Solution, plus 📈 Complexity when
`problem.complexity` exists. All route through the backend for Java.

## File ownership (no overlap)
- Frontend agent: `index.html`, `js/render.js`, `js/app.js`, `css/onepct.css`,
  `data/tiers.json`. Remove day/module/exam wiring + PCEP-style nav.
  Do NOT touch `js/runner-config.js`, `vercel.json`, `api/*`.
- Backend agent: `api/run.js`, `api/grade.js`, `js/runner-config.js`, `vercel.json`, docs.
- Content agents: exactly one `data/tierN.json` each.
