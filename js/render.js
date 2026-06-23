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
      const status = el("span", "py-status", "");
      if (window.JAVA_RUN_ENDPOINT) {
        runBtn = el("button", "btn btn-run", "▶ Run");
        toolbar.appendChild(runBtn);
      }
      toolbar.appendChild(status);
      card.appendChild(toolbar);
      card.appendChild(out);

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
    }

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = code; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e2) { /* ignore */ }
        document.body.removeChild(ta);
      }
      copyBtn.textContent = "✓ Copied!";
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
    card.appendChild(out);
    const feedback = el("div", "feedback");
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
    return true;
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

  function renderQuiz(b) {
    const wrap = el("div", "block quiz");
    wrap.appendChild(el("h3", null, "❓ " + (b.question || "Quick check")));
    const opts = el("div", "quiz-opts");
    let answered = false;
    const explain = el("div", "quiz-explain", b.explain || "");
    (b.options || []).forEach((text, i) => {
      const btn = el("button", "quiz-opt", escapeInline(text));
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === b.answerIndex;
        btn.classList.add(correct ? "correct" : "wrong");
        if (!correct) {
          const right = opts.children[b.answerIndex];
          if (right) right.classList.add("correct");
        }
        explain.classList.add("show");
      });
      opts.appendChild(btn);
    });
    wrap.appendChild(opts);
    wrap.appendChild(explain);
    return wrap;
  }

  // ---- full lesson ----
  function renderLesson(data) {
    const root = el("div", "lesson");

    const head = el("div", "lesson-head");
    head.appendChild(el("div", "crumbs", '<a href="#/">🏠 Home</a> &nbsp;›&nbsp; Day ' + data.day + " of 22"));
    head.appendChild(el("div", "day-emoji", '<span style="font-size:40px">' + (data.emoji || "☕") + "</span>"));
    head.appendChild(el("h1", null, "Day " + data.day + ": " + escapeInline(data.title)));
    if (data.subtitle) head.appendChild(el("div", "subtitle", escapeInline(data.subtitle)));
    const meta = el("div", "lesson-meta");
    meta.appendChild(el("span", "pill", "⏱️ ~" + (data.estMinutes || 180) + " min"));
    (data.tags || []).forEach((t) => meta.appendChild(el("span", "pill", "#" + t)));
    head.appendChild(meta);
    root.appendChild(head);

    if (data.goal) {
      const goal = el("div", "goal-box");
      goal.appendChild(el("span", "goal-emoji", "🎯"));
      goal.appendChild(el("div", null, "<strong>Today's goal:</strong> " + escapeInline(data.goal)));
      root.appendChild(goal);
    }

    (data.blocks || []).forEach((b) => root.appendChild(renderBlock(b)));

    if (data.challenge) {
      const c = data.challenge;
      const box = el("div", "block challenge");
      box.appendChild(el("h3", null, "🏆 " + (c.title || "Day Challenge")));
      box.appendChild(el("div", "instructions", c.instructions || ""));
      box.appendChild(makeExercise(c.starter || "", {
        check: c.check, solution: c.solution, solutionOutput: c.solutionOutput,
        caption: "Build it here", passMsg: c.passMsg || "🏆 Challenge complete — you crushed it!",
        failMsg: c.failMsg || "Almost! Re-read the steps and try again.",
      }));
      if (c.hint) {
        const tip = el("div", "tip");
        tip.appendChild(el("span", "tip-emoji", "💡"));
        tip.appendChild(el("div", null, "<strong>Hint:</strong> " + c.hint));
        box.appendChild(tip);
      }
      root.appendChild(box);
    }
    return root;
  }

  window.Render = { renderLesson };
})();
