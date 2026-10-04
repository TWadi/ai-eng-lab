"""Sanity check for a fresh clone: run with `uv run python 00-setup/check_env.py`."""

import importlib
import os
import sys

from dotenv import load_dotenv

from shared.env import mask, missing_keys

PACKAGES = ["numpy", "pandas", "matplotlib", "requests", "pytest", "jupyterlab"]
KEYS_BY_PHASE = {
    "phase 4+": ["ANTHROPIC_API_KEY"],
    "phase 3+": ["HF_TOKEN"],
}


def main() -> int:
    ok = True
    print(f"Python {sys.version.split()[0]}", "OK" if sys.version_info >= (3, 12) else "-> need 3.12+")
    ok &= sys.version_info >= (3, 12)

    for name in PACKAGES:
        try:
            mod = importlib.import_module(name)
            print(f"  {name:<12} {getattr(mod, '__version__', 'installed')}")
        except ImportError:
            print(f"  {name:<12} MISSING -> run `uv sync`")
            ok = False

    if not load_dotenv():
        print(".env not found -> copy .env.example to .env (fine to leave keys blank for now)")
    for phase, keys in KEYS_BY_PHASE.items():
        for key in keys:
            status = "not set" if missing_keys([key], os.environ) else mask(os.environ[key])
            print(f"  {key:<20} {status}  ({phase})")

    print("\nAll good." if ok else "\nFix the items above, then run again.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
