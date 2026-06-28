/* runner-config.js — point the platform at its execution backend.
   Java has no in-browser runtime, so every Run/Profile/Grade goes through the backend.

   Default: same-origin Vercel serverless functions under "/api" (api/run.js, api/grade.js),
   so the site runs Java "through Vercel" with no separate server URL. The functions need
   JUDGE0_URL (etc.) configured in the Vercel project env — see README "Execution backend
   (Vercel)". Until those env vars are set, /api/run and /api/grade return a clear 503.

   Override with an external hft-runner deployment if you don't use Vercel functions, e.g.:
     window.HFT_RUNNER_URL = "https://hft-runner.fly.dev";
   JAVA_RUN_ENDPOINT is derived from it so the existing Run buttons light up automatically. */
window.HFT_RUNNER_URL = window.HFT_RUNNER_URL || "/api";
window.JAVA_RUN_ENDPOINT = window.HFT_RUNNER_URL
  ? window.HFT_RUNNER_URL.replace(/\/$/, "") + "/run"
  : null;
