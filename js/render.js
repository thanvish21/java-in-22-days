/* ===== render.js — turns a lesson JSON object into interactive DOM ===== */
(function () {
  "use strict";

  // ---- tiny DOM helpers ----
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function escapeInline(s) { return String(s).replace(/[<>]/g, (c) => ({ "<": "&lt;", ">": "&gt;" }[c])); }

  // ---- optional live runner (Judge0/JDoodle-style endpoint) ----
  // Posts {language:'java', code} and expects {stdout} (a few common field
  // names are accepted). Only used when window.JAVA_RUN_ENDPOINT is set.
  async function runViaEndpoint(code) {
    const res = await fetch(window.JAVA_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "java", code: code }),
    });
    if (!res.ok) throw new Error("Run server returned " + res.status);
    const data = await res.json();
    const stdout = data.stdout != null ? data.stdout
      : data.output != null ? data.output
      : data.stdout_text != null ? data.stdout_text : "";
    const stderr = data.stderr != null ? data.stderr
      : data.error != null ? data.error : "";
    return { stdout: String(stdout || ""), stderr: String(stderr || "") };
  }

  // ---- read-only code block: Copy + Show output (+ optional Run) ----
  // Predict-then-reveal: the learner reads the code and guesses the output,
  // then clicks to reveal the verified `output`. No execution by default.
  function makeCodeBox(code, opts) {
    opts = opts || {};
    const card = el("div", "code-card");
    if (opts.caption) card.appendChild(el("div", "code-caption", opts.caption));

    const pre = el("pre", "code-static");
    pre.textContent = code;
    card.appendChild(pre);

    const toolbar = el("div", "code-toolbar");
    const copyBtn = el("button", "btn btn-soft", "📋 Copy");
    toolbar.appendChild(copyBtn);

    const out = el("div", "run-out");
    out.setAttribute("role", "status");
    out.setAttribute("aria-live", "polite");

    if (opts.noRun) {
      // Input-based / illustrative code: nothing to reveal, just copy & run elsewhere.
      const note = el("div", "tip");
      note.appendChild(el("span", "tip-emoji", "⌨️"));
      note.appendChild(el("div", null, "This one needs input — copy it into your editor to run."));
      toolbar.appendChild(el("span", "py-status", ""));
      card.appendChild(toolbar);
      card.appendChild(note);
    } else {
      const showBtn = el("button", "btn btn-check", "👁 Show output");
      toolbar.appendChild(showBtn);

      let runBtn = null;
      let profBtn = null;
      const status = el("span", "py-status", "");
      if (window.JAVA_RUN_ENDPOINT) {
        runBtn = el("button", "btn btn-run", "▶ Run");
        toolbar.appendChild(runBtn);
        profBtn = el("button", "btn btn-soft", "⏱ Profile");
        toolbar.appendChild(profBtn);
      }
      toolbar.appendChild(status);
      card.appendChild(toolbar);
      card.appendChild(out);
      const perfBadge = el("div", "perf-badge");
      card.appendChild(perfBadge);

      showBtn.addEventListener("click", () => {
        out.classList.add("show");
        out.innerHTML = (opts.output != null && String(opts.output).length)
          ? escapeHtml(opts.output)
          : '<span class="ok-tag">✓ Runs with no output</span>';
        showBtn.textContent = "👁 Output shown";
        showBtn.disabled = true;
      });

      if (runBtn) {
        runBtn.addEventListener("click", async () => {
          runBtn.disabled = true;
          status.innerHTML = '<span class="spinner"></span>';
          out.classList.add("show");
          try {
            const res = await runViaEndpoint(code);
            const so = res.stdout.trim();
            out.innerHTML = so ? escapeHtml(res.stdout)
              : '<span class="ok-tag">✓ Ran with no output</span>';
            if (res.stderr.trim()) out.innerHTML += '<span class="err">' + escapeHtml(res.stderr) + "</span>";
          } catch (e) {
            out.innerHTML = '<span class="err">' + escapeHtml(e.message || String(e)) + "</span>";
          }
          status.textContent = "";
          runBtn.disabled = false;
        });
      }

      if (profBtn) {
        // Native Java profiling via hft-runner: honest wall time + peak heap (-Xlog:gc).
        profBtn.addEventListener("click", async () => {
          profBtn.disabled = true;
          status.innerHTML = '<span class="spinner"></span>';
          out.classList.add("show");
          const r = await window.OnePct.profile({
            language: "java",
            code: code,
            runtimeFlags: (opts.runtimeFlags || []).concat(["-Xlog:gc"]),
            onStatus: (m) => { status.textContent = m; },
          });
          out.innerHTML = r.ok
            ? (r.stdout && r.stdout.trim() ? escapeHtml(r.stdout) : '<span class="ok-tag">✓ Ran with no output</span>')
            : '<span class="err">' + escapeHtml(r.error || "Run failed") + "</span>";
          perfBadge.textContent = r.timeMs != null ? window.OnePct.badge(r) : "";
          status.textContent = "";
          profBtn.disabled = false;
        });
      }
    }

    copyBtn.addEventListener("click", async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = code; document.body.appendChild(ta); ta.select();
        try { copied = document.execCommand("copy"); } catch (e2) { copied = false; }
        document.body.removeChild(ta);
      }
      copyBtn.textContent = copied ? "✓ Copied!" : "Press Ctrl+C to copy";
      setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 1500);
    });

    return card;
  }

  // ---- editable exercise box: Check (pattern match) + Show solution ----
  // No execution — `check` is evaluated against the typed code only.
  function makeExercise(starter, opts) {
    opts = opts || {};
    const card = el("div", "code-card");
    if (opts.caption) card.appendChild(el("div", "code-caption", opts.caption));

    const input = el("textarea", "code-area");
    input.value = starter || "";
    input.rows = Math.min(20, Math.max(4, (starter || "").split("\n").length + 1));
    input.spellcheck = false;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = input.selectionStart, en = input.selectionEnd;
        input.value = input.value.slice(0, s) + "    " + input.value.slice(en);
        input.selectionStart = input.selectionEnd = s + 4;
      }
    });
    card.appendChild(input);

    const toolbar = el("div", "code-toolbar");
    const checkBtn = el("button", "btn btn-check", "✓ Check");
    toolbar.appendChild(checkBtn);
    let solBtn = null;
    if (opts.solution) {
      solBtn = el("button", "btn btn-soft", "💡 Show solution");
      toolbar.appendChild(solBtn);
    }
    card.appendChild(toolbar);

    const out = el("div", "run-out");
    out.setAttribute("role", "status");
    out.setAttribute("aria-live", "polite");
    card.appendChild(out);
    const feedback = el("div", "feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    card.appendChild(feedback);

    checkBtn.addEventListener("click", () => {
      const pass = evaluateCheck(opts.check, input.value);
      feedback.className = "feedback show " + (pass ? "pass" : "fail");
      feedback.textContent = pass
        ? "🎉 " + (opts.passMsg || "Perfect! That looks right!")
        : "🤔 " + (opts.failMsg || "Not quite — peek at the hint or solution and try again.");
    });

    if (solBtn) {
      solBtn.addEventListener("click", () => {
        input.value = opts.solution;
        input.rows = Math.min(20, opts.solution.split("\n").length + 1);
        if (opts.solutionOutput != null) {
          out.classList.add("show");
          out.innerHTML = String(opts.solutionOutput).length
            ? escapeHtml(opts.solutionOutput)
            : '<span class="ok-tag">✓ Runs with no output</span>';
        }
        solBtn.textContent = "✓ Solution loaded";
        solBtn.disabled = true;
      });
    }

    return card;
  }

  // Decide pass/fail from a check spec against the typed code (no execution).
  function evaluateCheck(check, code) {
    if (!check) return true;
    if (check.code_includes != null) {
      const needles = Array.isArray(check.code_includes) ? check.code_includes : [check.code_includes];
      return needles.every((n) => code.includes(String(n)));
    }
    if (check.regex != null) return new RegExp(check.regex, "m").test(code);
    // check object present but malformed (no code_includes / regex): fail closed.
    return false;
  }

  // ---- block renderers ----
  function renderBlock(b) {
    switch (b.type) {
      case "text": {
        const wrap = el("div", "block");
        if (b.heading) wrap.appendChild(el("h2", null, escapeInline(b.heading)));
        wrap.appendChild(el("div", null, b.html || ""));
        return wrap;
      }
      case "code": {
        const wrap = el("div", "block");
        wrap.appendChild(makeCodeBox(b.code, {
          caption: b.caption || "Read it, predict the output 👇",
          output: b.output,
          noRun: !!b.noRun,
        }));
        if (b.explain) wrap.appendChild(el("p", "explain", b.explain));
        return wrap;
      }
      case "tryit": {
        const wrap = el("div", "block tryit");
        wrap.appendChild(el("h3", null, "🛠️ " + (b.title || "Your turn!")));
        wrap.appendChild(el("div", "instructions", b.instructions || ""));
        wrap.appendChild(makeExercise(b.starter || "", {
          check: b.check, solution: b.solution, solutionOutput: b.solutionOutput,
          caption: "Edit, then Check", passMsg: b.passMsg, failMsg: b.failMsg,
        }));
        return wrap;
      }
      case "quiz": return renderQuiz(b);
      case "surprise": return renderSurprise(b);
      case "tip": {
        const wrap = el("div", "block");
        const box = el("div", "tip" + (b.variant === "warn" ? " warn" : ""));
        box.appendChild(el("span", "tip-emoji", b.variant === "warn" ? "⚠️" : "💡"));
        box.appendChild(el("div", null, b.html || ""));
        wrap.appendChild(box);
        return wrap;
      }
      default: {
        const wrap = el("div", "block");
        wrap.appendChild(el("p", null, "[unknown block: " + escapeInline(b.type || "?") + "]"));
        return wrap;
      }
    }
  }

  // One interactive quiz question: click an option to reveal correct/wrong + explanation.
  function renderQuizQuestion(q) {
    const wrap = el("div", "block quiz");
    wrap.appendChild(el("h3", null, "❓ " + (q.question || "Quick check")));
    const opts = el("div", "quiz-opts");
    let answered = false;
    const explain = el("div", "quiz-explain", q.explain || "");
    (q.options || []).forEach((text, i) => {
      const btn = el("button", "quiz-opt", escapeInline(text));
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === q.answerIndex;
        btn.classList.add(correct ? "correct" : "wrong");
        btn.textContent += correct ? " ✓" : " ✗";
        if (!correct) {
          const right = opts.children[q.answerIndex];
          if (right) { right.classList.add("correct"); right.textContent += " ✓"; }
        }
        explain.classList.add("show");
      });
      opts.appendChild(btn);
    });
    wrap.appendChild(opts);
    wrap.appendChild(explain);
    return wrap;
  }

  function renderQuiz(b) {
    return renderQuizQuestion(b);
  }

  function renderSurprise(b) {
    const wrap = el("div", "block surprise-quiz");
    wrap.appendChild(el("h3", null, "🎁 " + escapeInline(b.title || "Surprise Quiz!")));
    if (b.intro) wrap.appendChild(el("p", "surprise-intro", escapeInline(b.intro)));
    (b.questions || []).forEach((q) => wrap.appendChild(renderQuizQuestion(q)));
    return wrap;
  }

  // ---- backend availability ----
  function backendConfigured() {
    return !!(window.HFTRunner && window.HFTRunner.configured());
  }
  function backendNotice() {
    const n = el("div", "tip warn backend-notice");
    n.appendChild(el("span", "tip-emoji", "⚠️"));
    n.appendChild(el("div", null,
      "<strong>Needs an execution backend.</strong> Java can't run in the browser — " +
      "set <code class=\"inline\">HFT_RUNNER_URL</code> in <code class=\"inline\">js/runner-config.js</code> " +
      "or deploy <code class=\"inline\">/api</code> to enable Run · Profile · Grade · Complexity. " +
      "Starters and solutions stay viewable below."));
    return n;
  }

  // ---- graded problem card (all engines backend) ----
  function renderProblem(p, idx) {
    const card = el("div", "problem-card");

    const head = el("div", "problem-head");
    head.appendChild(el("span", "problem-num", "P" + (idx + 1)));
    head.appendChild(el("span", "problem-title", escapeInline(p.title || "Problem")));
    if (p.difficulty) head.appendChild(el("span", "diff-pill diff-" + p.difficulty, p.difficulty));
    card.appendChild(head);

    if (p.instructions) card.appendChild(el("div", "instructions", p.instructions));

    const flags = Array.isArray(p.runtimeFlags) ? p.runtimeFlags : [];
    if (flags.length) {
      card.appendChild(el("div", "runtime-flags", "flags: " + escapeInline(flags.join(" "))));
    }

    // editable code area, seeded with the starter
    const input = el("textarea", "code-area");
    input.value = p.starter || "";
    input.rows = Math.min(28, Math.max(6, (p.starter || "").split("\n").length + 1));
    input.spellcheck = false;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = input.selectionStart, en = input.selectionEnd;
        input.value = input.value.slice(0, s) + "    " + input.value.slice(en);
        input.selectionStart = input.selectionEnd = s + 4;
      }
    });
    card.appendChild(input);

    const toolbar = el("div", "code-toolbar");
    const runBtn = el("button", "btn btn-run", "▶ Run");
    const profBtn = el("button", "btn btn-soft", "⏱ Profile");
    const gradeBtn = el("button", "btn btn-check", "✓ Grade");
    const solBtn = el("button", "btn btn-soft", "💡 Solution");
    const cmplxBtn = p.complexity ? el("button", "btn btn-soft", "📈 Complexity") : null;
    toolbar.appendChild(runBtn);
    toolbar.appendChild(profBtn);
    toolbar.appendChild(gradeBtn);
    toolbar.appendChild(solBtn);
    if (cmplxBtn) toolbar.appendChild(cmplxBtn);
    const status = el("span", "py-status", "");
    toolbar.appendChild(status);
    card.appendChild(toolbar);

    const out = el("div", "run-out");
    out.setAttribute("role", "status");
    out.setAttribute("aria-live", "polite");
    card.appendChild(out);
    const perfBadge = el("div", "perf-badge");
    card.appendChild(perfBadge);
    const grades = el("div", "grade-results");
    card.appendChild(grades);
    const cmplxBox = el("div", "complexity-box");
    card.appendChild(cmplxBox);

    // Solution is always viewable, even without a backend.
    if (p.solution) {
      solBtn.addEventListener("click", () => {
        input.value = p.solution;
        input.rows = Math.min(28, p.solution.split("\n").length + 1);
        solBtn.textContent = "✓ Solution loaded";
        solBtn.disabled = true;
      });
    } else {
      solBtn.disabled = true;
    }

    const busy = (on) => {
      [runBtn, profBtn, gradeBtn, cmplxBtn].forEach((b) => { if (b) b.disabled = on; });
      status.innerHTML = on ? '<span class="spinner"></span>' : "";
    };

    if (!backendConfigured()) {
      // Execution actions are disabled; show a single clear notice.
      [runBtn, profBtn, gradeBtn].forEach((b) => { b.disabled = true; });
      if (cmplxBtn) cmplxBtn.disabled = true;
      card.appendChild(backendNotice());
      return card;
    }

    // ▶ Run
    runBtn.addEventListener("click", async () => {
      busy(true);
      out.classList.add("show");
      grades.innerHTML = "";
      try {
        const res = await window.HFTRunner.run({
          language: "java", code: input.value, runtimeFlags: flags, stdin: p.stdin,
        });
        const so = (res.stdout || "").trim();
        out.innerHTML = so ? escapeHtml(res.stdout) : '<span class="ok-tag">✓ Ran with no output</span>';
        if (res.stderr && res.stderr.trim()) {
          out.innerHTML += '<span class="err">' + escapeHtml(res.stderr) + "</span>";
        }
      } catch (e) {
        out.innerHTML = '<span class="err">' + escapeHtml(e.message || String(e)) + "</span>";
      }
      busy(false);
    });

    // ⏱ Profile
    profBtn.addEventListener("click", async () => {
      busy(true);
      out.classList.add("show");
      const r = await window.OnePct.profile({
        language: "java", code: input.value, preferBackend: true, runtimeFlags: flags,
        onStatus: (m) => { status.textContent = m; },
      });
      out.innerHTML = r.ok
        ? (r.stdout && r.stdout.trim() ? escapeHtml(r.stdout) : '<span class="ok-tag">✓ Ran with no output</span>')
        : '<span class="err">' + escapeHtml(r.error || "Run failed") + "</span>";
      perfBadge.textContent = r.timeMs != null ? window.OnePct.badge(r) : "";
      busy(false);
    });

    // ✓ Grade
    gradeBtn.addEventListener("click", async () => {
      busy(true);
      grades.innerHTML = "";
      out.classList.remove("show");
      try {
        const res = await window.HFTRunner.grade({
          language: "java", code: input.value, runtimeFlags: flags, tests: p.tests || [],
        });
        grades.appendChild(renderGrades(res));
        if (res.allPassed && p.id && window.HFTMatrix) {
          window.HFTMatrix.markMastered(p.id);
          card.classList.add("mastered");
        }
      } catch (e) {
        grades.appendChild(el("div", "grade-error err", escapeHtml(e.message || String(e))));
      }
      busy(false);
    });

    // 📈 Complexity
    if (cmplxBtn) {
      cmplxBtn.addEventListener("click", async () => {
        busy(true);
        cmplxBox.innerHTML = '<div class="py-status">measuring growth…</div>';
        try {
          const r = await window.OnePct.estimateComplexity({
            language: "java",
            codeTemplate: p.complexity.codeTemplate,
            sizes: p.complexity.sizes,
            preferBackend: true,
            runtimeFlags: flags,
            onStatus: (m) => { status.textContent = m; },
          });
          cmplxBox.innerHTML = "";
          cmplxBox.appendChild(renderComplexity(r, p.complexity.expected));
        } catch (e) {
          cmplxBox.innerHTML = '<div class="err">' + escapeHtml(e.message || String(e)) + "</div>";
        }
        busy(false);
      });
    }

    return card;
  }

  // Render { passed, total, allPassed, results:[{name, ok, hidden, timeMs, memKb}] }.
  function renderGrades(res) {
    const wrap = el("div", "grade-summary " + (res.allPassed ? "pass" : "fail"));
    wrap.appendChild(el("div", "grade-head",
      (res.allPassed ? "✅ " : "❌ ") + (res.passed || 0) + " / " + (res.total || 0) + " tests passed"));
    const list = el("div", "grade-list");
    (res.results || []).forEach((t) => {
      const row = el("div", "grade-row " + (t.ok ? "pass" : "fail"));
      const label = t.hidden ? "🔒 " + escapeInline(t.name || "hidden test") : escapeInline(t.name || "test");
      row.appendChild(el("span", "grade-name", (t.ok ? "✓ " : "✗ ") + label));
      const metrics = [];
      if (t.timeMs != null) metrics.push(t.timeMs.toFixed(t.timeMs < 10 ? 2 : 1) + " ms");
      if (t.memKb != null) metrics.push(window.OnePct.fmtKb(t.memKb));
      row.appendChild(el("span", "grade-metric", metrics.join("  ·  ")));
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // Render the complexity result: a per-size table + fitted Big-O vs expected.
  function renderComplexity(r, expected) {
    const wrap = el("div", "complexity-result");
    const table = el("table", "perf-table");
    const thead = el("tr", null,
      "<th>n</th><th>time</th><th>mem</th>");
    table.appendChild(thead);
    (r.points || []).forEach((p) => {
      const t = p.timeMs == null ? "—" : (p.timeMs < 10 ? p.timeMs.toFixed(2) : p.timeMs.toFixed(1)) + " ms";
      const m = p.memKb == null ? "—" : window.OnePct.fmtKb(p.memKb);
      const tr = el("tr", null,
        "<td>" + Number(p.n).toLocaleString() + "</td><td>" + t + "</td><td>" + m + "</td>");
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    const fit = (r.fit && r.fit.label) ? r.fit.label : "indeterminate";
    const slope = (r.fit && r.fit.slope != null) ? " (slope " + r.fit.slope + ")" : "";
    const line = el("div", "complexity-verdict");
    line.appendChild(el("span", "perf-bigo", "measured: " + escapeInline(fit) + slope));
    if (expected) line.appendChild(el("span", "complexity-expected", "  ·  expected: " + escapeInline(expected)));
    wrap.appendChild(line);
    return wrap;
  }

  // ---- full tier ----
  function renderTier(data) {
    const root = el("div", "tier");

    const head = el("div", "lesson-head tier-head");
    head.appendChild(el("div", "crumbs",
      '<a href="#/">🏠 Home</a> &nbsp;›&nbsp; Tier ' + data.tier + " of 4"));
    head.appendChild(el("div", "day-emoji", '<span style="font-size:40px">' + (data.emoji || "⚡") + "</span>"));
    head.appendChild(el("h1", null, "Tier " + data.tier + ": " + escapeInline(data.title)));
    if (data.subtitle) head.appendChild(el("div", "subtitle", escapeInline(data.subtitle)));
    const meta = el("div", "lesson-meta");
    meta.appendChild(el("span", "pill", "⏱️ ~" + (data.estMinutes || 180) + " min"));
    (data.tags || []).forEach((t) => meta.appendChild(el("span", "pill", "#" + t)));
    head.appendChild(meta);
    root.appendChild(head);

    if (data.goal) {
      const goal = el("div", "goal-box");
      goal.appendChild(el("span", "goal-emoji", "🎯"));
      goal.appendChild(el("div", null, "<strong>Tier goal:</strong> " + escapeInline(data.goal)));
      root.appendChild(goal);
    }

    if (!backendConfigured()) root.appendChild(backendNotice());

    // teaching blocks reuse the existing renderers
    (data.blocks || []).forEach((b) => root.appendChild(renderBlock(b)));

    const problems = data.problems || [];
    if (problems.length) {
      root.appendChild(el("h2", "section-title", "🧪 Graded Problems"));
      problems.forEach((p, i) => root.appendChild(renderProblem(p, i)));
    }

    return root;
  }

  window.Render = { renderTier };
})();
