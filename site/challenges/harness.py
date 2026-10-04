"""Test harness for coding challenges.

The same file runs in two places:
- in the browser, inside Pyodide (loaded by site/src/lab/pyWorker.ts), to grade a player's code;
- locally, by build.py, to prove every reference solution passes and every starter fails.
"""

import io
import json
import traceback
from contextlib import redirect_stdout

MAX_OUTPUT = 4000


def run_tests(user_code: str, tests_json: str) -> str:
    """Execute user_code, then each test's assertion code against the resulting namespace.

    Returns JSON: {"error": str | None, "stdout": str, "results": [{"name", "ok", "message"}]}.
    """
    tests = json.loads(tests_json)
    out = io.StringIO()
    namespace: dict = {"__name__": "__challenge__"}
    try:
        with redirect_stdout(out):
            # Running the player's own code in their own browser sandbox is the point of the harness.
            exec(compile(user_code, "your_code.py", "exec"), namespace)  # noqa: S102
    except Exception as exc:  # noqa: BLE001 - report any error in the player's code
        return json.dumps({
            "error": _short_traceback(exc),
            "stdout": out.getvalue()[:MAX_OUTPUT],
            "results": [],
        })

    results = []
    for test in tests:
        scope = dict(namespace)
        try:
            with redirect_stdout(out):
                exec(compile(test["code"], f"test: {test['name']}", "exec"), scope)  # noqa: S102
            results.append({"name": test["name"], "ok": True, "message": ""})
        except AssertionError as exc:
            results.append({"name": test["name"], "ok": False, "message": str(exc) or "Assertion failed"})
        except Exception as exc:  # noqa: BLE001
            results.append({"name": test["name"], "ok": False, "message": f"{type(exc).__name__}: {exc}"})
    return json.dumps({"error": None, "stdout": out.getvalue()[:MAX_OUTPUT], "results": results})


def _short_traceback(exc: BaseException) -> str:
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "your_code.py"]
    where = f" (line {frames[-1].lineno})" if frames else ""
    return f"{type(exc).__name__}{where}: {exc}"
