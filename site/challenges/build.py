"""Validate the coding challenges and write the files the site loads.

Usage (from the repo root):  python site/challenges/build.py

Checks every challenge: the reference solution passes all tests, and the starter code fails at least one.
Then writes:
- site/src/swc/logic/lab/challenges.gen.json  (everything except the solutions)
- site/public/harness.py            (served next to the site, loaded into Pyodide)
"""

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from harness import run_tests
from rag import CHALLENGES

XP = {"easy": 20, "medium": 30, "hard": 50}
OUT_JSON = HERE.parent / "src" / "swc" / "logic" / "lab" / "challenges.gen.json"
OUT_HARNESS = HERE.parent / "public" / "harness.py"


def tests_json(challenge: dict) -> str:
    return json.dumps([{"name": n, "code": c} for n, c, _ in challenge["tests"]])


def check(challenge: dict) -> None:
    cid = challenge["id"]
    solved = json.loads(run_tests(challenge["solution"], tests_json(challenge)))
    failing = [r for r in solved["results"] if not r["ok"]]
    if solved["error"] or failing:
        raise SystemExit(f"{cid}: reference solution fails: {solved['error'] or failing}")
    starter = json.loads(run_tests(challenge["starter"], tests_json(challenge)))
    if not starter["error"] and all(r["ok"] for r in starter["results"]):
        raise SystemExit(f"{cid}: starter code already passes every test")
    ids = [c["id"] for c in CHALLENGES]
    if ids.count(cid) != 1:
        raise SystemExit(f"{cid}: duplicate id")


def main() -> None:
    for c in CHALLENGES:
        check(c)
    public = [
        {
            "id": c["id"], "item": c["item"], "title": c["title"], "level": c["level"], "xp": XP[c["level"]],
            "prompt": c["prompt"], "starter": c["starter"],
            "tests": [{"name": n, "code": code, "hidden": hidden} for n, code, hidden in c["tests"]],
        }
        for c in CHALLENGES
    ]
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(public, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    OUT_HARNESS.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "harness.py", OUT_HARNESS)
    print(f"OK: {len(CHALLENGES)} challenges validated -> {OUT_JSON.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
