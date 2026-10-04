"""Helpers for checking the local environment without leaking secrets."""

from collections.abc import Iterable, Mapping


def missing_keys(required: Iterable[str], env: Mapping[str, str]) -> list[str]:
    """Return the names in `required` that are absent or blank in `env`."""
    return [name for name in required if not env.get(name, "").strip()]


def mask(value: str, visible: int = 4) -> str:
    """Show only the last `visible` characters of a secret, e.g. '****abcd'."""
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]
