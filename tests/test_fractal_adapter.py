"""Tests for the Fractal manifest adapter."""

import json
import shutil
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
    assert params["zarr_urls"].type == "directory"
    assert params["zarr_urls"].exists is True
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
    assert params["channel"].type == "json"
    assert params["channel"].default == json.dumps({"index": 0}, indent=2)


def test_json_param_without_default_gets_example_hint(fixture_manifest):
    # A JSON param with no default is an empty box; ghost an example skeleton
    # in the input itself and list the optional fields in the description.
    params = _params_by_key(_entry_point(fixture_manifest, "Make Thumbnail"))
    rois = params["rois"]
    assert rois.type == "json"
    assert rois.placeholder == json.dumps([{"name": "..."}], indent=2)
    assert "Optional fields: start" in rois.description
    assert rois.description.startswith("Regions to process.")
    # a prefilled default already shows the shape — no ghost example
    assert params["channel"].placeholder is None


def test_ref_to_enum_becomes_enum_param(fixture_manifest):
    # A $ref to a plain string enum (pydantic StrEnum) is a controlled
    # vocabulary, not a nested model: render it as a dropdown, not JSON.
    params = _params_by_key(_entry_point(fixture_manifest, "Make Thumbnail"))
    p = params["overwrite_mode"]
    assert p.type == "enum"
    assert p.options == ["No Overwrite", "Overwrite", "Extend"]
    assert p.default == "No Overwrite"
    # the property's own description wins over the $defs placeholder
    assert p.description == "Overwrite mode for existing data."


def test_non_parallel_task_params(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Aggregate Stats")
    params = _params_by_key(ep)
    assert params["zarr_urls"].required
    assert params["zarr_urls"].type == "directory"
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


# --- Task 3: runtime shim + pre_run ---


@pytest.fixture
def tmp_work(tmp_path):
    """A job work dir: repo symlink to the fixture repo, shim materialized."""
    from fileglancer.apps.fractal import _SHIM
    (tmp_path / "repo").symlink_to(FIXTURE_REPO)
    (tmp_path / "fractal_run.py").write_text(_SHIM)
    return tmp_path


def _run_shim(tmp_work, *args, check=False):
    import subprocess
    import sys
    result = subprocess.run(
        [sys.executable, "fractal_run.py", "--package-dir", "pkg", *args],
        cwd=tmp_work, capture_output=True, text=True)
    if check:
        assert result.returncode == 0, result.stderr
    return result


def _runs(tmp_work, name):
    marker = tmp_work / f"ran_{name}.json"
    return json.loads(marker.read_text()) if marker.exists() else []


def test_shim_parallel_fan_out(tmp_work):
    (tmp_work / "img_a").mkdir()
    (tmp_work / "img_b").mkdir()
    _run_shim(
        tmp_work, "--task-name", "Make Thumbnail",
        "--zarr_urls", f"{tmp_work}/img_a,{tmp_work}/img_b",
        "--level", "2", "--overwrite", "false",
        "--channel", '{"index": 1}',
        "--overwrite_mode", "Extend",
        check=True)
    runs = _runs(tmp_work, "thumbnail")
    assert len(runs) == 2
    assert [r["args"]["zarr_url"] for r in runs] == [
        f"{tmp_work}/img_a", f"{tmp_work}/img_b"]
    args = runs[0]["args"]
    assert args["level"] == 2
    assert args["overwrite"] is False
    assert args["channel"] == {"index": 1}
    assert args["overwrite_mode"] == "Extend"  # enum via $ref: plain string, not JSON
    assert "zarr_urls" not in args


def test_shim_zarr_urls_splitting(tmp_work):
    (tmp_work / "img_a").mkdir()
    (tmp_work / "img_b").mkdir()
    _run_shim(
        tmp_work, "--task-name", "Make Thumbnail",
        "--zarr_urls", f" {tmp_work}/img_a , {tmp_work}/img_b ,",
        check=True)
    assert len(_runs(tmp_work, "thumbnail")) == 2


def test_shim_missing_zarr_dir_fails(tmp_work):
    result = _run_shim(
        tmp_work, "--task-name", "Make Thumbnail",
        "--zarr_urls", f"{tmp_work}/does_not_exist")
    assert result.returncode == 1
    assert "does_not_exist" in result.stderr
    assert not _runs(tmp_work, "thumbnail")


def test_shim_non_parallel(tmp_work):
    (tmp_work / "img_a").mkdir()
    out_dir = tmp_work / "out"
    _run_shim(
        tmp_work, "--task-name", "Aggregate Stats",
        "--zarr_urls", f"{tmp_work}/img_a",
        "--zarr_dir", str(out_dir),
        "--table_name", "mystats",
        check=True)
    runs = _runs(tmp_work, "aggregate")
    assert len(runs) == 1
    args = runs[0]["args"]
    assert args["zarr_urls"] == [f"{tmp_work}/img_a"]
    assert args["zarr_dir"] == str(out_dir)
    assert args["table_name"] == "mystats"


def test_shim_compound(tmp_work):
    out_dir = tmp_work / "plate_out"
    _run_shim(
        tmp_work, "--task-name", "Convert Fake Plate",
        "--zarr_dir", str(out_dir),
        "--init.plate_glob", "*.special",
        "--compression", "lz4",
        check=True)
    init_runs = _runs(tmp_work, "init_convert")
    assert len(init_runs) == 1
    assert init_runs[0]["args"]["plate_glob"] == "*.special"
    assert init_runs[0]["args"]["zarr_dir"] == str(out_dir)
    assert "compression" not in init_runs[0]["args"]
    compute_runs = _runs(tmp_work, "compute_convert")
    assert [r["args"]["init_args"] for r in compute_runs] == [{"n": 1}, {"n": 2}]
    assert [r["args"]["zarr_url"] for r in compute_runs] == [
        f"{out_dir}/a", f"{out_dir}/b"]
    assert all(r["args"]["compression"] == "lz4" for r in compute_runs)


def test_shim_compound_empty_parallelization(tmp_work):
    result = _run_shim(
        tmp_work, "--task-name", "Convert Fake Plate",
        "--zarr_dir", str(tmp_work / "out"),
        "--init.plate_glob", "NONE")
    assert result.returncode == 0
    assert not _runs(tmp_work, "compute_convert")


def test_shim_failure_propagates(tmp_work):
    (tmp_work / "img_a").mkdir()
    (tmp_work / "img_b").mkdir()
    result = _run_shim(
        tmp_work, "--task-name", "Make Thumbnail",
        "--zarr_urls", f"{tmp_work}/img_a,{tmp_work}/img_b",
        "--label", "FAIL")
    assert result.returncode == 3
    assert len(_runs(tmp_work, "thumbnail")) == 1


def test_shim_dangling_flag_fails(tmp_work):
    result = _run_shim(tmp_work, "--task-name", "Make Thumbnail", "--level")
    assert result.returncode == 1
    assert "--level" in result.stderr


def test_pre_run_shape(fixture_manifest):
    from fileglancer.apps.fractal import _SHIM
    pre_run = _entry_point(fixture_manifest, "Make Thumbnail").pre_run
    assert "conda create" in pre_run
    assert "flock" in pre_run
    assert "<<'FRACTAL_SHIM_EOF'" in pre_run
    assert 'export PATH="$ENV_DIR/bin:$PATH"' in pre_run
    assert not any(line.strip() == "FRACTAL_SHIM_EOF" for line in _SHIM.splitlines())


def test_pre_run_installs_from_temp_copy(fixture_manifest):
    # pip's in-tree build would drop build/ and *.egg-info into the immutable
    # snapshot, so the install must run against a temporary copy of it.
    pre_run = _entry_point(fixture_manifest, "Make Thumbnail").pre_run
    assert 'pip" install "$__fg_snapshot"' not in pre_run
    assert "mktemp -d" in pre_run


def _pixi_repo(tmp_path):
    repo = tmp_path / "repo"
    shutil.copytree(FIXTURE_REPO, repo)
    (repo / "pyproject.toml").write_text(
        '[project]\nname = "pkg"\n\n'
        '[tool.pixi.workspace]\nchannels = ["conda-forge"]\n'
    )
    return repo


def test_pixi_lock_switches_env_to_pixi(tmp_path):
    # A repo with pixi config and a lock file gets its env from
    # `pixi install --frozen` — the locked dependency set, not a pip resolve.
    repo = _pixi_repo(tmp_path)
    (repo / "pixi.lock").write_text("version: 6\n")
    manifest = FractalAdapter().convert(repo)
    assert manifest.requirements == ["pixi"]
    pre_run = manifest.runnables[0].pre_run
    assert "pixi install --frozen" in pre_run
    assert "conda create" not in pre_run
    assert 'export PATH="$ENV_DIR/.pixi/envs/default/bin:$PATH"' in pre_run
    # Separate env dir so a conda env already built for this SHA isn't reused.
    assert '-pixi"' in pre_run
    assert "<<'FRACTAL_SHIM_EOF'" in pre_run


def test_pixi_config_without_lock_stays_conda(tmp_path):
    repo = _pixi_repo(tmp_path)
    manifest = FractalAdapter().convert(repo)
    assert manifest.requirements == ["miniforge"]
    assert "conda create" in manifest.runnables[0].pre_run


def test_pixi_lock_without_config_stays_conda(tmp_path):
    repo = tmp_path / "repo"
    shutil.copytree(FIXTURE_REPO, repo)
    (repo / "pixi.lock").write_text("version: 6\n")
    manifest = FractalAdapter().convert(repo)
    assert manifest.requirements == ["miniforge"]


def test_needs_gpu_surfaced_in_description(fixture_manifest):
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    assert "GPU" in ep.description
    ep = _entry_point(fixture_manifest, "Aggregate Stats")
    assert not (ep.description or "").count("GPU")


def test_manifest_description_from_first_task(fixture_manifest):
    assert fixture_manifest.description == "Makes a thumbnail of one OME-Zarr image."


def test_description_keeps_markdown_without_title_echo(tmp_path):
    # Fractal docs_info is markdown; the UI renders it, so only the leading
    # heading that just repeats the task name is dropped.
    from fileglancer.apps.fractal import _task_description
    task = {
        "name": "Generic Task",
        "docs_info": (
            "## generic_task\n"
            "Does **something** with `zarr`.\n"
            "### Limitations\n"
            "| a | b |\n|---|---|\n| 1 | 2 |\n"
            "- See [docs](https://example.org)\n"
        ),
    }
    desc = _task_description(task, tmp_path)
    assert desc.startswith("Does **something** with `zarr`.")
    assert "generic_task" not in desc
    assert "### Limitations" in desc
    assert "| a | b |" in desc
    assert "[docs](https://example.org)" in desc


def test_plain_summary_flattens_markdown():
    # The manifest-level description is a one-line plain-text summary.
    from fileglancer.apps.fractal import _plain_summary
    text = "Does **something** with `zarr` per [docs](https://example.org).\nMore."
    assert _plain_summary(text) == (
        "Does something with zarr per docs (https://example.org).")


def test_plain_summary_skips_headings_to_first_prose_line():
    # A docs_info that opens with a section heading must not summarize to
    # just the heading text ("Purpose").
    from fileglancer.apps.fractal import _plain_summary
    text = "### Purpose\n- Converts a `.czi` file into OME-Zarr.\n| a |\n"
    assert _plain_summary(text) == "Converts a .czi file into OME-Zarr."
    assert _plain_summary("## Only A Heading") == ""


def test_build_command_round_trip(fixture_manifest):
    from fileglancer.apps.command import build_command
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    command = build_command(
        ep,
        {"zarr_urls": "/data/a.zarr",
         "channel": '{"index": 1}'},
        session=None)
    assert "--task-name 'Make Thumbnail'" in command
    assert "--zarr_urls /data/a.zarr" in command
    assert """--channel '{"index": 1}'""" in command


def test_json_param_rejects_invalid_json(fixture_manifest):
    from fileglancer.apps.command import build_command
    ep = _entry_point(fixture_manifest, "Make Thumbnail")
    with pytest.raises(ValueError, match="(?i)valid JSON"):
        build_command(
            ep,
            {"zarr_urls": "/data/a.zarr", "channel": '{"index": }'},
            session=None)


def test_zarr_urls_is_single_browsable_path(fixture_manifest):
    # ponytail: single image per launch; multipath param per
    # notes/multipath-param-plan.md when multi-image runs matter. The shim
    # still splits on commas, so the swap won't change the CLI contract.
    params = _params_by_key(_entry_point(fixture_manifest, "Make Thumbnail"))
    p = params["zarr_urls"]
    assert p.type == "directory"
    assert p.name == "OME-Zarr Image"
    assert "image" in p.description.lower()
