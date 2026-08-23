"""Context is the only configuration source for these stacks -- every value
comes from the `context` block of cdktf.json, read once per stack in the
base stack's constructor.

Nothing here reads environment variables. These accessors throw rather than
defaulting: a missing region or account number should fail at synth with the
key name in the message, not produce a plan against the wrong account.

Ported from the reference CDK Terrain (TypeScript) project's models/context.ts.
"""

from typing import Any

ContextNode = dict[str, Any]


def require_node(node: ContextNode, key: str, path: str) -> ContextNode:
    value = node.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"Context {path}.{key} must be an object")
    return value


def require_string(node: ContextNode, key: str, path: str) -> str:
    value = node.get(key)
    if not isinstance(value, str) or len(value) == 0:
        raise ValueError(f"Context {path}.{key} must be a non-empty string")
    return value


def require_number(node: ContextNode, key: str, path: str) -> float:
    value = node.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"Context {path}.{key} must be a number")
    return value


def optional_string(node: ContextNode, key: str, path: str) -> str | None:
    value = node.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or len(value) == 0:
        raise ValueError(f"Context {path}.{key} must be a non-empty string when present")
    return value


def require_string_map(node: ContextNode, key: str, path: str) -> dict[str, str]:
    raw = require_node(node, key, path)
    result: dict[str, str] = {}

    for entry_key, entry_value in raw.items():
        if not isinstance(entry_value, str):
            raise ValueError(f"Context {path}.{key}.{entry_key} must be a string")
        result[entry_key] = entry_value

    return result
