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


# --- Task 2: schema -> AppManifest conversion ---


@pytest.fixture(scope="module")
def fixture_manifest():
    return FractalAdapter().convert(FIXTURE_REPO)


def _params_by_key(entry_point):
    """Flatten sections into {key: AppParameter}."""
    params = {}
    for item in entry_point.parameters:
        for p in getattr(item, "parameters", [item]):
            params[p.key] = p
    return params


def _entry_point(manifest, name):
    return next(ep for ep in manifest.runnables if ep.name == name)


def test_entry_point_per_task(fixture_manifest):
    assert [ep.name for ep in fixture_manifest.runnables] == [
        "Make Thumbnail", "Aggregate Stats", "Convert Fake Plate"
    ]
    assert [ep.id for ep in fixture_manifest.runnables] == [
        "make-thumbnail", "aggregate-stats", "convert-fake-plate"
    ]


def test_parallel_task_params(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    params = _params_by_key(ep)

    assert ep.parameters[0].section == "Input / Output"
    assert params["zarr_urls"].type == "string"
    assert params["zarr_urls"].required
    assert "zarr_dir" not in params
    assert "zarr_url" not in params

    assert params["level"].type == "integer"
    assert params["level"].min == 0
    assert params["level"].default == 0
    assert params["overwrite"].type == "boolean"
    assert params["overwrite"].boolean_style == "value"
    assert params["mode"].type == "enum"
    assert params["mode"].options == ["fast", "good"]
    assert params["label"].type == "string"
    assert not params["label"].required
    assert params["channel"].type == "string"
    assert params["channel"].default == json.dumps({"index": 0})
    assert params["channel"].description.startswith("(JSON)")


def test_non_parallel_task_params(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Aggregate Stats")
    params = _params_by_key(ep)
    assert params["zarr_urls"].required
    assert params["zarr_dir"].type == "directory"
    assert params["zarr_dir"].exists is False
    assert params["zarr_dir"].required
    assert params["table_name"].default == "stats"


def test_converter_compound_params(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Convert Fake Plate")
    params = _params_by_key(ep)
    assert "zarr_urls" not in params
    assert params["zarr_dir"].required
    assert params["init.plate_glob"].flag == "--init.plate_glob"
    assert params["init.plate_glob"].default == "*.fake"
    assert params["compression"].default == "zstd"
    assert "init_args" not in params


def test_type_inferred_from_executables():
    from fileglancer.apps.fractal import _task_type
    assert _task_type({"executable_non_parallel": "a.py"}) == "non_parallel"
    assert _task_type({"executable_parallel": "a.py"}) == "parallel"
    assert _task_type({"executable_parallel": "a.py",
                       "executable_non_parallel": "b.py"}) == "compound"
    assert _task_type({"type": "converter_compound"}) == "converter_compound"


def test_resources_from_meta(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    assert ep.resources.cpus == 2
    assert ep.resources.memory == "8000 MB"
    # converter_compound takes the max over both metas
    ep = _entry_point(fixture_manifest, "Convert Fake Plate")
    assert ep.resources.cpus == 4
    assert ep.resources.memory == "16000 MB"


def test_duplicate_slug_ids_unique(tmp_path):
    schema = {
        "title": "T", "type": "object", "required": ["zarr_url"],
        "properties": {"zarr_url": {"type": "string"}},
    }
    task = {"type": "parallel", "executable_parallel": "t.py",
            "args_schema_parallel": schema}
    _write_manifest(tmp_path, task_list=[
        {**task, "name": "Foo Bar"}, {**task, "name": "Foo-Bar"}
    ])
    manifest = FractalAdapter().convert(tmp_path)
    assert [ep.id for ep in manifest.runnables] == ["foo-bar", "foo-bar-2"]


def test_command_quotes_task_name(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    assert "--task-name 'Make Thumbnail'" in ep.command
    assert "--package-dir pkg" in ep.command
    assert ep.working_dir == "work"
