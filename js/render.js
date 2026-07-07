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
      case "recapgame": return renderRecapGame(b);
      case "tip": {
        const wrap = el("div", "block");
        const box = el("div", "tip" + (b.variant === "warn" ? " warn" : ""));
        box.appendChild(el("span", "tip-emoji", b.variant === "warn" ? "⚠️" : "💡"));
        box.appendChild(el("div", null, b.html || ""));
        wrap.appendChild(box);
        return wrap;
      }
      case "example": {
        const wrap = el("div", "block");
        const card = el("div", "example-card");
        card.appendChild(el("h3", null, "🌍 Real-Life Example"));
        if (b.scenario) card.appendChild(el("div", "example-scenario", b.scenario));
        if (b.code) card.appendChild(makeCodeBox(b.code, { caption: b.caption || "See it in action 👇", output: b.output, noRun: !!b.noRun }));
        if (b.explain) card.appendChild(el("p", "explain", b.explain));
        wrap.appendChild(card);
        return wrap;
      }
      case "assessment": {
        const wrap = el("div", "block assessment-card");
        wrap.appendChild(el("h2", null, "📝 " + (b.title || "Milestone Assessment")));
        if (b.intro) wrap.appendChild(el("p", "assessment-intro", b.intro));
        const form = el("div", "assessment-form");
        const qEls = [];
        (b.questions || []).forEach((q, qi) => {
          const qw = el("div", "assessment-q");
          qw.appendChild(el("h3", null, (qi + 1) + ". " + (q.question || "")));
          const opts = el("div", "quiz-opts");
          (q.options || []).forEach((text, oi) => {
            const btn = el("button", "quiz-opt", escapeInline(text));
            btn.dataset.qi = qi;
            btn.dataset.oi = oi;
            btn.addEventListener("click", () => {
              opts.querySelectorAll(".quiz-opt").forEach(b => b.classList.remove("selected"));
              btn.classList.add("selected");
            });
            opts.appendChild(btn);
          });
          qw.appendChild(opts);
          const expl = el("div", "quiz-explain", q.explain || "");
          qw.appendChild(expl);
          qEls.push({ q, opts, expl });
          form.appendChild(qw);
        });
        wrap.appendChild(form);
        const resultBox = el("div", "assessment-result");
        const submitBtn = el("button", "btn btn-check", "Submit Assessment");
        submitBtn.addEventListener("click", () => {
          let correct = 0;
          qEls.forEach(({ q, opts, expl }) => {
            const sel = opts.querySelector(".selected");
            const picked = sel ? parseInt(sel.dataset.oi) : -1;
            const isRight = picked === q.answerIndex;
            if (isRight) correct++;
            opts.querySelectorAll(".quiz-opt").forEach(b => b.classList.add("disabled"));
            if (sel) sel.classList.add(isRight ? "correct" : "wrong");
            const rightBtn = opts.children[q.answerIndex];
            if (rightBtn && !isRight) { rightBtn.classList.add("correct"); rightBtn.textContent += " ✓"; }
            expl.classList.add("show");
          });
          const total = qEls.length;
          const pct = Math.round((correct / total) * 100);
          const pass = pct >= (b.passPct || 70);
          resultBox.className = "assessment-result show " + (pass ? "pass" : "fail");
          resultBox.innerHTML = (pass ? "🎉" : "📖") + " You scored " + correct + "/" + total + " (" + pct + "%) — " + (pass ? "You passed!" : "Review and try again.");
          submitBtn.disabled = true;
        });
        wrap.appendChild(submitBtn);
        wrap.appendChild(resultBox);
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

  // ---- Recap Game (fun end-of-milestone mini-game) ----
  // Two flavors: "sorter" (drag/reorder code lines) and "match" (match pairs).
  function renderRecapGame(b) {
    const wrap = el("div", "block recapgame");
    wrap.appendChild(el("h3", null, "🎮 " + escapeInline(b.title || "Recap Game")));
    if (b.instructions) wrap.appendChild(el("p", "recapgame-instructions", escapeInline(b.instructions)));
    if (b.gameType === "match") {
      wrap.appendChild(renderMatchGame(b));
    } else {
      // Default to sorter
      wrap.appendChild(renderSorterGame(b));
    }
    return wrap;
  }

  // Fisher-Yates shuffle (returns a new array). Ensures result differs from
  // input when possible so the player actually has something to solve.
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // If array of 2+ elements ended up identical to source, swap first two.
    if (a.length > 1 && a.every((v, i) => v === arr[i])) {
      [a[0], a[1]] = [a[1], a[0]];
    }
    return a;
  }

  function renderSorterGame(b) {
    const container = el("div", "sorter-game");
    const correct = (b.lines || []).slice();
    let current = shuffled(correct);

    const list = el("div", "sorter-list");
    container.appendChild(list);

    function rebuild() {
      list.innerHTML = "";
      current.forEach((line, idx) => {
        const row = el("div", "sorter-row");
        row.setAttribute("draggable", "true");
        row.dataset.idx = String(idx);

        const handle = el("span", "sorter-handle", "⋮⋮");
        row.appendChild(handle);

        const codeCell = el("pre", "sorter-code");
        codeCell.textContent = line;
        row.appendChild(codeCell);

        const controls = el("div", "sorter-controls");
        const up = el("button", "sorter-btn", "▲");
        up.title = "Move up";
        up.disabled = idx === 0;
        up.addEventListener("click", () => moveRow(idx, idx - 1));
        const down = el("button", "sorter-btn", "▼");
        down.title = "Move down";
        down.disabled = idx === current.length - 1;
        down.addEventListener("click", () => moveRow(idx, idx + 1));
        controls.appendChild(up);
        controls.appendChild(down);
        row.appendChild(controls);

        // Drag & drop
        row.addEventListener("dragstart", (e) => {
          row.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
          }
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (e) => {
          e.preventDefault();
          row.classList.add("drag-over");
        });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.classList.remove("drag-over");
          const from = parseInt((e.dataTransfer && e.dataTransfer.getData("text/plain")) || "-1", 10);
          const to = idx;
          if (from >= 0 && from !== to) moveRow(from, to);
        });

        list.appendChild(row);
      });
    }

    function moveRow(from, to) {
      if (to < 0 || to >= current.length) return;
      const [item] = current.splice(from, 1);
      current.splice(to, 0, item);
      rebuild();
    }

    rebuild();

    const toolbar = el("div", "recapgame-toolbar");
    const checkBtn = el("button", "btn btn-check", "🔎 Check Order");
    const resetBtn = el("button", "btn btn-soft", "🔀 Shuffle");
    toolbar.appendChild(checkBtn);
    toolbar.appendChild(resetBtn);
    container.appendChild(toolbar);

    const result = el("div", "recapgame-result");
    container.appendChild(result);

    checkBtn.addEventListener("click", () => {
      const win = current.every((v, i) => v === correct[i]);
      if (win) {
        result.className = "recapgame-result show win";
        result.innerHTML = '<div class="recapgame-big">✅</div>'
          + '<div class="recapgame-msg">Perfect Order!</div>'
          + '<div class="recapgame-xp">🏆 +100 XP!</div>';
        checkBtn.disabled = true;
        resetBtn.disabled = true;
        list.querySelectorAll(".sorter-row").forEach(r => r.classList.add("locked"));
      } else {
        result.className = "recapgame-result show lose";
        result.innerHTML = '<div class="recapgame-big">❌</div>'
          + '<div class="recapgame-msg">Not quite — try rearranging!</div>';
        container.classList.remove("shake");
        // Force reflow so animation replays.
        void container.offsetWidth;
        container.classList.add("shake");
      }
    });

    resetBtn.addEventListener("click", () => {
      current = shuffled(correct);
      rebuild();
      result.className = "recapgame-result";
      result.innerHTML = "";
    });

    return container;
  }

  function renderMatchGame(b) {
    const container = el("div", "match-game");
    const pairs = (b.pairs || []).slice();
    const lefts = pairs.map((p) => p.left);
    const rights = shuffled(pairs.map((p) => p.right));
    // Guard against unlikely shuffled-into-order case: shuffled() already handles it.

    const board = el("div", "match-board");
    const leftCol = el("div", "match-col match-left");
    const rightCol = el("div", "match-col match-right");
    board.appendChild(leftCol);
    board.appendChild(rightCol);
    container.appendChild(board);

    let selectedLeft = null; // { btn, value }
    let matchedCount = 0;
    let busy = false;

    // Build the correct-answer lookup: left value -> right value.
    const answer = {};
    pairs.forEach((p) => { answer[p.left] = p.right; });

    const result = el("div", "recapgame-result");
    container.appendChild(result);

    function clearSelection() {
      if (selectedLeft && selectedLeft.btn) selectedLeft.btn.classList.remove("selected");
      selectedLeft = null;
    }

    lefts.forEach((val) => {
      const btn = el("button", "match-card match-card-left", escapeInline(val));
      btn.addEventListener("click", () => {
        if (busy || btn.classList.contains("matched")) return;
        clearSelection();
        selectedLeft = { btn: btn, value: val };
        btn.classList.add("selected");
      });
      leftCol.appendChild(btn);
    });

    rights.forEach((val) => {
      const btn = el("button", "match-card match-card-right", escapeInline(val));
      btn.addEventListener("click", () => {
        if (busy || btn.classList.contains("matched")) return;
        if (!selectedLeft) {
          // Flash a hint by briefly wiggling the button.
          btn.classList.add("nudge");
          setTimeout(() => btn.classList.remove("nudge"), 400);
          return;
        }
        const expected = answer[selectedLeft.value];
        if (expected === val) {
          // Correct!
          selectedLeft.btn.classList.remove("selected");
          selectedLeft.btn.classList.add("matched");
          btn.classList.add("matched");
          selectedLeft.btn.disabled = true;
          btn.disabled = true;
          selectedLeft = null;
          matchedCount++;
          if (matchedCount === pairs.length) {
            result.className = "recapgame-result show win";
            result.innerHTML = '<div class="recapgame-big">🏆</div>'
              + '<div class="recapgame-msg">Perfect Recall!</div>'
              + '<div class="recapgame-xp">+200 XP!</div>';
          }
        } else {
          // Wrong — flash red on both and deselect.
          busy = true;
          const leftBtn = selectedLeft.btn;
          leftBtn.classList.add("wrong");
          btn.classList.add("wrong");
          setTimeout(() => {
            leftBtn.classList.remove("wrong", "selected");
            btn.classList.remove("wrong");
            selectedLeft = null;
            busy = false;
          }, 600);
        }
      });
      rightCol.appendChild(btn);
    });

    return container;
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
