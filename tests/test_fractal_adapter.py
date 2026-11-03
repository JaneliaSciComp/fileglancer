"""Tests for the Fractal manifest adapter."""

import json
from pathlib import Path

import pytest

from fileglancer.apps.adapters import MANIFEST_ADAPTERS
from fileglancer.apps.fractal import FractalAdapter

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "fractal"


def _write_manifest(directory: Path, **overrides) -> Path:
    manifest = {
        "manifest_version": "2",
        "has_args_schemas": True,
        "args_schema_version": "pydantic_v2",
        "task_list": [],
    }
    manifest.update(overrides)
    path = directory / "__FRACTAL_MANIFEST__.json"
    path.write_text(json.dumps(manifest))
    return path


def test_can_handle_root(tmp_path):
    _write_manifest(tmp_path)
    assert FractalAdapter().can_handle(tmp_path)


def test_can_handle_nested():
    assert FractalAdapter().can_handle(FIXTURE_REPO)


def test_can_handle_src_layout(tmp_path):
    pkg = tmp_path / "src" / "mypkg"
    pkg.mkdir(parents=True)
    _write_manifest(pkg)
    assert FractalAdapter().can_handle(tmp_path)


def test_can_handle_absent(tmp_path):
    assert not FractalAdapter().can_handle(tmp_path)


def test_convert_rejects_v1(tmp_path):
    _write_manifest(tmp_path, manifest_version=1)
    with pytest.raises(ValueError, match="manifest_version"):
        FractalAdapter().convert(tmp_path)


def test_convert_rejects_no_schemas(tmp_path):
    _write_manifest(tmp_path, has_args_schemas=False)
    with pytest.raises(ValueError, match="args schemas"):
        FractalAdapter().convert(tmp_path)


def test_registered_in_adapters():
    assert any(isinstance(a, FractalAdapter) for a in MANIFEST_ADAPTERS)
