#!/usr/bin/env python3
"""Smoke-test every Java lesson: JSON schema + run all Java snippets with `java Main.java`.

For every runnable code/solution snippet we write Main.java to a temp dir and run it
with `java Main.java` (Java 21 single-file source mode, no javac). When the snippet
declares an expected stdout ("output"/"solutionOutput"), we ASSERT the produced
stdout (trailing-whitespace-trimmed) EQUALS the declared value.

Skips blocks marked "noRun" (input-based / illustrative).
"""
import json, os, sys, glob, tempfile, subprocess

DATA = os.path.join(os.path.dirname(__file__), "data")
BLOCK_TYPES = {"text", "code", "tip", "quiz", "tryit", "surprise", "example", "assessment", "recapgame"}
errors, warnings, snippet_count = [], [], 0


def collect_code(day, data):
    """Yield (label, code, expected_output_or_None) for every runnable snippet."""
    for i, b in enumerate(data.get("blocks", [])):
        t = b.get("type")
        if t == "code" and b.get("code") and not b.get("noRun"):
            yield (f"d{day} block{i} code", b["code"], b.get("output"))
        if t == "example" and b.get("code") and not b.get("noRun"):
            yield (f"d{day} block{i} example.code", b["code"], b.get("output"))
        if t == "tryit" and b.get("solution"):
            yield (f"d{day} block{i} tryit.solution", b["solution"], b.get("solutionOutput"))
    c = data.get("challenge")
    if c and c.get("solution"):
        yield (f"d{day} challenge.solution", c["solution"], c.get("solutionOutput"))


def check_schema(day, data):
    for k in ("day", "title", "blocks"):
        if k not in data:
            errors.append(f"day{day:02d}: missing key '{k}'")
    if data.get("day") != day:
        warnings.append(f"day{day:02d}: 'day' field is {data.get('day')}")
    for i, b in enumerate(data.get("blocks", [])):
        t = b.get("type")
        if t not in BLOCK_TYPES:
            errors.append(f"day{day:02d} block{i}: bad type '{t}'")
        if t == "code" and not b.get("noRun") and "code" not in b:
            errors.append(f"day{day:02d} block{i}: code block missing 'code'")
        if t == "quiz":
            opts = b.get("options", [])
            ai = b.get("answerIndex")
            if not isinstance(ai, int) or ai < 0 or ai >= len(opts):
                errors.append(f"day{day:02d} block{i}: answerIndex {ai} out of range (0..{len(opts)-1})")
        if t == "assessment":
            qs = b.get("questions", [])
            if not qs:
                errors.append(f"day{day:02d} block{i}: assessment has no questions")
            for qi, q in enumerate(qs):
                label = f"day{day:02d} block{i} q{qi}"
                opts = q.get("options", [])
                ai = q.get("answerIndex")
                if not isinstance(ai, int) or ai < 0 or ai >= len(opts):
                    errors.append(f"{label}: answerIndex {ai} out of range (0..{len(opts)-1})")


def run_snippet(label, code, expected):
    """Write Main.java, run `java Main.java`, assert stdout if expected is provided.

    A snippet with no declared output and which reads keyboard input (Scanner /
    System.in) is interactive: there is nothing to assert and it would hang or
    crash without stdin, so we skip running it (recorded as a warning instead).
    """
    global snippet_count
    if expected is None and ("System.in" in code or "Scanner" in code):
        warnings.append(f"SKIP    {label}: interactive (Scanner/System.in), no output to verify")
        return
    snippet_count += 1
    with tempfile.TemporaryDirectory() as tmp:
        main = os.path.join(tmp, "Main.java")
        with open(main, "w") as f:
            f.write(code)
        try:
            r = subprocess.run(["java", "Main.java"], capture_output=True,
                               text=True, timeout=30, cwd=tmp)
        except subprocess.TimeoutExpired:
            errors.append(f"TIMEOUT {label}: ran >30s (possible infinite loop)")
            return
        except FileNotFoundError:
            errors.append(f"NO-JAVA {label}: `java` not found on PATH")
            return

        if r.returncode != 0:
            last = (r.stderr.strip().splitlines() or ["?"])[-1]
            errors.append(f"RUNTIME {label}: {last}")
            return

        if expected is not None:
            got = r.stdout.rstrip()
            want = str(expected).rstrip()
            if got != want:
                errors.append(
                    f"OUTPUT  {label}: stdout mismatch\n"
                    f"        expected: {want!r}\n"
                    f"        got:      {got!r}")


def main():
    files = sorted(glob.glob(os.path.join(DATA, "day*.json")))
    for f in files:
        day = int(os.path.basename(f)[3:5])
        try:
            data = json.load(open(f))
        except Exception as e:
            errors.append(f"{os.path.basename(f)}: JSON parse error: {e}")
            continue
        check_schema(day, data)
        for label, code, expected in collect_code(day, data):
            run_snippet(label, code, expected)

    print(f"Files checked: {len(files)}  |  Snippets run with `java Main.java`: {snippet_count}")
    if warnings:
        print(f"\nWARN  {len(warnings)} warnings:")
        for w in warnings[:12]:
            print("   ", w)
    if errors:
        print(f"\nERRORS  {len(errors)}:")
        for e in errors:
            print("   ", e)
        sys.exit(1)
    print("\n✅ All lessons valid — schema OK, all runnable snippets compile & produce the declared output.")


if __name__ == "__main__":
    main()
