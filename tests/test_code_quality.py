"""Tests for enforcing architectural code quality and style standards."""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"


def test_no_function_exceeds_40_lines() -> None:
    """Enforce that no function or method in app/ exceeds 40 source lines."""
    violations: list[str] = []

    for py_file in APP_DIR.rglob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                end_line = getattr(node, "end_lineno", node.lineno)
                line_count = end_line - node.lineno + 1
                if line_count > 40:
                    rel_path = py_file.relative_to(APP_DIR)
                    violations.append(
                        f"{rel_path}:{node.lineno} {node.name}() is {line_count} lines (> 40)"
                    )

    assert not violations, "Found functions exceeding 40 lines:\n" + "\n".join(violations)


def test_public_symbols_have_docstrings() -> None:
    """Enforce that all public modules, classes, and functions in app/ have docstrings."""
    missing: list[str] = []

    for py_file in APP_DIR.rglob("*.py"):
        if py_file.name == "__init__.py":
            continue

        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        rel_path = py_file.relative_to(APP_DIR)

        if not ast.get_docstring(tree):
            missing.append(f"{rel_path}: Module docstring is missing")

        for node in ast.walk(tree):
            if (
                isinstance(node, ast.ClassDef)
                and not node.name.startswith("_")
                and not ast.get_docstring(node)
            ):
                missing.append(f"{rel_path}:{node.lineno} Class '{node.name}' docstring missing")
            elif (
                isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
                and not node.name.startswith("_")
                and not ast.get_docstring(node)
            ):
                missing.append(f"{rel_path}:{node.lineno} Function '{node.name}' docstring missing")

    assert not missing, "Found public symbols without docstrings:\n" + "\n".join(missing)
