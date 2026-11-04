"""Fractal task-package manifest adapter.

Generates an AppManifest from a Fractal task package's __FRACTAL_MANIFEST__.json
(https://fractal-analytics-platform.github.io/), one runnable per task.

Fractal task executables are invoked as `python task.py --args-json F --out-json F`,
so the generated entry points run through a shim (written by pre_run) that turns
the flag-style parameters Fileglancer builds back into the task's args JSON.
"""

import json
import re
import shlex
import tomllib
from pathlib import Path

from fileglancer.model import (
    AppEntryPoint,
    AppManifest,
    AppParameter,
    AppParameterSection,
    AppResourceDefaults,
)

_FRACTAL_MANIFEST_FILENAME = "__FRACTAL_MANIFEST__.json"

# Arguments the Fractal server (here: the shim) injects; never user-facing params.
_RESERVED_KEYS = {"zarr_url", "zarr_urls", "zarr_dir", "init_args"}


def _find_manifest(directory: Path) -> Path | None:
    """Locate the Fractal manifest: repo root, one package dir down, or src layout."""
    candidates = [directory / _FRACTAL_MANIFEST_FILENAME]
    candidates += sorted(directory.glob(f"*/{_FRACTAL_MANIFEST_FILENAME}"))
    candidates += sorted(directory.glob(f"src/*/{_FRACTAL_MANIFEST_FILENAME}"))
    return next((c for c in candidates if c.is_file()), None)


def _task_type(task: dict) -> str:
    """The task's declared type, or inferred from which executables it has."""
    if task.get("type"):
        return task["type"]
    if task.get("executable_non_parallel") and task.get("executable_parallel"):
        return "compound"
    if task.get("executable_parallel"):
        return "parallel"
    return "non_parallel"


def _unwrap_nullable(prop: dict) -> tuple[dict, bool]:
    """Unwrap pydantic's Optional encoding anyOf: [X, {type: null}] to (X, True)."""
    any_of = prop.get("anyOf")
    if any_of and len(any_of) == 2:
        non_null = [s for s in any_of if s.get("type") != "null"]
        if len(non_null) == 1:
            inner = {k: v for k, v in prop.items() if k != "anyOf"}
            inner.update(non_null[0])
            return inner, True
    return prop, False


def _resolve_ref(prop: dict, schema: dict) -> dict:
    """Resolve a local $ref against the schema, property-level keys winning.

    Pydantic emits StrEnums and nested models as $defs entries referenced by
    $ref, with the field's own title/description/default as siblings. A $ref
    that resolves to a plain enum is a controlled vocabulary, so it must come
    back as an enum shape rather than falling into the JSON-string catch-all.
    """
    for _ in range(5):
        ref = prop.get("$ref")
        if not ref or not ref.startswith("#/"):
            return prop
        target = schema
        for part in ref[2:].split("/"):
            target = target.get(part) if isinstance(target, dict) else None
            if target is None:
                return prop
        merged = dict(target)
        merged.update({k: v for k, v in prop.items() if k != "$ref"})
        prop = merged
    return prop


def _is_complex(prop: dict) -> bool:
    """True for schema shapes the flat parameter model can't express natively."""
    if "enum" in prop:
        return False
    if any(k in prop for k in ("$ref", "oneOf", "allOf", "anyOf")):
        return True
    return prop.get("type") in ("array", "object")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _example_value(prop: dict, schema: dict, depth: int = 0):
    """A minimal example value for a schema shape, for json-param hints.

    Objects show required fields only (all fields when nothing is required);
    scalars become obvious fillers. Depth-capped against recursive models.
    """
    prop = _resolve_ref(_unwrap_nullable(prop)[0], schema)
    if "default" in prop and prop["default"] is not None:
        return prop["default"]
    if "enum" in prop:
        return prop["enum"][0]
    prop_type = prop.get("type")
    if depth >= 3:
        return [] if prop_type == "array" else {}
    if prop_type == "array":
        return [_example_value(prop.get("items", {}), schema, depth + 1)]
    if prop_type == "object" or "properties" in prop:
        props = prop.get("properties", {})
        keys = set(prop.get("required", [])) or set(props)
        return {k: _example_value(v, schema, depth + 1)
                for k, v in props.items() if k in keys}
    if prop_type == "integer":
        return 0
    if prop_type == "number":
        return 0.0
    if prop_type == "boolean":
        return False
    return "..."


def _optional_fields(prop: dict, schema: dict) -> list[str]:
    """The fields the example skeleton left out of the (item) model, if any."""
    prop = _resolve_ref(_unwrap_nullable(prop)[0], schema)
    if prop.get("type") == "array":
        prop = _resolve_ref(_unwrap_nullable(prop.get("items", {}))[0], schema)
    required = set(prop.get("required", []))
    if not required:
        return []
    return [k for k in prop.get("properties", {}) if k not in required]


def _convert_property(key: str, prop: dict, required: bool,
                      key_prefix: str = "", schema: dict | None = None) -> AppParameter:
    """Convert one args-schema property to an AppParameter."""
    prop, nullable = _unwrap_nullable(prop)
    if nullable:
        required = False
    prop = _resolve_ref(prop, schema or {})

    kwargs: dict = {
        "flag": f"--{key_prefix}{key}",
        "name": prop.get("title") or key.replace("_", " ").title(),
        "required": required,
    }
    desc = prop.get("description")

    if _is_complex(prop):
        kwargs["type"] = "json"
        if "default" in prop and prop["default"] is not None:
            kwargs["default"] = json.dumps(prop["default"], indent=2)
        else:
            # An empty box with no shape hint is unanswerable; ghost a skeleton.
            kwargs["placeholder"] = json.dumps(
                _example_value(prop, schema or {}), indent=2)
            optional = _optional_fields(prop, schema or {})
            if optional:
                desc_parts = [desc] if desc else []
                desc_parts.append("Optional fields: " + ", ".join(optional))
                desc = "\n\n".join(desc_parts)
        if desc:
            kwargs["description"] = desc
        return AppParameter(**kwargs)

    if desc:
        kwargs["description"] = desc

    if "enum" in prop:
        kwargs["type"] = "enum"
        kwargs["options"] = [str(o) for o in prop["enum"]]
    elif prop.get("type") == "boolean":
        kwargs["type"] = "boolean"
        kwargs["boolean_style"] = "value"
    elif prop.get("type") in ("integer", "number"):
        kwargs["type"] = prop["type"]
        if "minimum" in prop:
            kwargs["min"] = prop["minimum"]
        if "maximum" in prop:
            kwargs["max"] = prop["maximum"]
    else:
        kwargs["type"] = "string"

    if "default" in prop and prop["default"] is not None:
        default = prop["default"]
        kwargs["default"] = str(default) if kwargs["type"] == "enum" else default

    return AppParameter(**kwargs)


def _schema_params(schema: dict, key_prefix: str = "") -> list[AppParameter]:
    """Convert a task args schema's non-reserved properties to parameters."""
    required = set(schema.get("required", []))
    return [
        _convert_property(key, prop, key in required, key_prefix, schema)
        for key, prop in schema.get("properties", {}).items()
        if key not in _RESERVED_KEYS
    ]


def _io_section(task_type: str, np_schema: dict | None,
                p_schema: dict | None) -> AppParameterSection | None:
    """Synthesize the Input / Output section from the schemas' reserved args.

    zarr_urls comes from the schema the user-facing run starts with: the
    non-parallel (init) schema when there is one, else the parallel schema
    (whose per-image zarr_url the shim fans out over). zarr_dir only ever
    appears in non-parallel schemas.
    """
    source = np_schema if np_schema is not None else (p_schema or {})
    props = source.get("properties", {})
    required = set(source.get("required", []))
    params = []

    if "zarr_url" in props or "zarr_urls" in props:
        reserved_key = "zarr_urls" if "zarr_urls" in props else "zarr_url"
        # ponytail: one image per launch; a multipath param type
        # (notes/multipath-param-plan.md) is the upgrade for multi-image runs.
        # The shim splits its value on commas either way, so swapping types
        # later won't change the CLI contract.
        params.append(AppParameter(
            flag="--zarr_urls",
            name="OME-Zarr Image",
            type="directory",
            required=reserved_key in required,
            description="Path to an OME-Zarr image",
        ))
    if "zarr_dir" in props:
        params.append(AppParameter(
            flag="--zarr_dir",
            name="Zarr Output Directory",
            type="directory",
            exists=False,
            required="zarr_dir" in required,
            description=props["zarr_dir"].get("description")
            or "Base directory where new OME-Zarr images are written",
        ))
    if not params:
        return None
    return AppParameterSection(section="Input / Output", parameters=params)


def _drop_title_echo(text: str, task_name: str) -> str:
    """Drop a leading heading that just repeats the task name.

    Descriptions stay markdown — the UI renders them — but the title echo
    would duplicate the entry point name shown right above.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        heading = re.match(r"\s*#{1,6}\s+(.*)", line)
        if heading and _slugify(heading.group(1)) == _slugify(task_name):
            lines = lines[i + 1:]
        break
    return "\n".join(lines).strip()


def _task_description(task: dict, package_dir: Path) -> str | None:
    docs_info = task.get("docs_info") or ""
    if docs_info.startswith("file:"):
        try:
            docs_info = (package_dir / docs_info[len("file:"):]).read_text()
        except Exception:
            docs_info = ""
    docs_info = _drop_title_echo(docs_info, task.get("name", ""))
    parts = [docs_info] if docs_info else []
    if task.get("docs_link"):
        parts.append(task["docs_link"])
    tags = [f"{label}: {task[field]}"
            for label, field in (("Category", "category"), ("Modality", "modality"))
            if task.get(field)]
    if tags:
        parts.append(" | ".join(tags))
    metas = (task.get("meta_non_parallel") or {}, task.get("meta_parallel") or {})
    if any(m.get("needs_gpu") for m in metas):
        parts.append("Requires a GPU — select a GPU queue on the Cluster tab.")
    return "\n\n".join(parts) or None


def _task_resources(task: dict) -> AppResourceDefaults | None:
    metas = [task.get(k) or {} for k in ("meta_non_parallel", "meta_parallel")]
    cpus = max((m["cpus_per_task"] for m in metas if "cpus_per_task" in m),
               default=None)
    mem = max((m["mem"] for m in metas if "mem" in m), default=None)
    if cpus is None and mem is None:
        return None
    return AppResourceDefaults(
        cpus=cpus, memory=f"{mem} MB" if mem is not None else None)


# The runtime bridge between Fileglancer's flag-style command and Fractal's
# `--args-json/--out-json` task contract. Written by pre_run into the job work
# dir and run from there (cwd holds the `repo` snapshot symlink). Stdlib only.
# Its schema handling (nullable unwrap, complex detection, reserved keys, init.
# prefix) must mirror the conversion rules above.
_SHIM = '''"""Fileglancer-generated runner for Fractal tasks (see fileglancer/apps/fractal.py)."""
import json
import subprocess
import sys
from pathlib import Path


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def unwrap_nullable(prop):
    any_of = prop.get("anyOf")
    if any_of and len(any_of) == 2:
        non_null = [s for s in any_of if s.get("type") != "null"]
        if len(non_null) == 1:
            inner = {k: v for k, v in prop.items() if k != "anyOf"}
            inner.update(non_null[0])
            return inner
    return prop


def resolve_ref(prop, schema):
    for _ in range(5):
        ref = prop.get("$ref")
        if not ref or not ref.startswith("#/"):
            return prop
        target = schema
        for part in ref[2:].split("/"):
            target = target.get(part) if isinstance(target, dict) else None
            if target is None:
                return prop
        merged = dict(target)
        merged.update({k: v for k, v in prop.items() if k != "$ref"})
        prop = merged
    return prop


def is_complex(prop):
    if "enum" in prop:
        return False
    if any(k in prop for k in ("$ref", "oneOf", "allOf", "anyOf")):
        return True
    return prop.get("type") in ("array", "object")


def coerce(key, value, schema):
    prop = schema.get("properties", {}).get(key)
    if prop is None:
        return value  # unknown keys were already rejected server-side
    prop = unwrap_nullable(prop)
    prop = resolve_ref(prop, schema)
    if is_complex(prop):
        try:
            return json.loads(value)
        except json.JSONDecodeError as e:
            fail(f"Parameter --{key} is not valid JSON: {e}")
    if "enum" in prop:
        return next((m for m in prop["enum"] if str(m) == value), value)
    prop_type = prop.get("type")
    if prop_type == "integer":
        return int(value)
    if prop_type == "number":
        return float(value)
    if prop_type == "boolean":
        return value == "true"
    return value


def parse_argv(argv):
    pairs = {}
    i = 0
    while i < len(argv):
        flag = argv[i]
        if not flag.startswith("--") or i + 1 >= len(argv):
            fail(f"Expected --key value pairs, got dangling {flag}")
        pairs[flag[2:]] = argv[i + 1]
        i += 2
    return pairs


def run_unit(executable, args, n, label):
    args_path = Path(f"args_{n}.json")
    out_path = Path(f"out_{n}.json")
    args_path.write_text(json.dumps(args, indent=2))
    print(f"[fractal_run] {label}", flush=True)
    result = subprocess.run([sys.executable, str(executable),
                             "--args-json", str(args_path),
                             "--out-json", str(out_path)])
    if result.returncode != 0:
        sys.exit(result.returncode)
    return json.loads(out_path.read_text()) if out_path.exists() else {}


def main():
    pairs = parse_argv(sys.argv[1:])
    task_name = pairs.pop("task-name", None)
    package_dir = pairs.pop("package-dir", None)
    if not task_name or not package_dir:
        fail("--task-name and --package-dir are required")
    pkg = Path("repo") / package_dir
    manifest = json.loads((pkg / "__FRACTAL_MANIFEST__.json").read_text())
    task = next((t for t in manifest["task_list"] if t["name"] == task_name), None)
    if task is None:
        fail(f"Task {task_name!r} not found in the Fractal manifest")

    task_type = task.get("type")
    if not task_type:
        if task.get("executable_non_parallel") and task.get("executable_parallel"):
            task_type = "compound"
        elif task.get("executable_parallel"):
            task_type = "parallel"
        else:
            task_type = "non_parallel"

    np_schema = task.get("args_schema_non_parallel") or {}
    p_schema = task.get("args_schema_parallel") or {}
    main_schema = p_schema if task.get("executable_parallel") else np_schema

    zarr_urls_raw = pairs.pop("zarr_urls", None)
    zarr_dir = pairs.pop("zarr_dir", None)
    init_args, main_args = {}, {}
    for key, value in pairs.items():
        if key.startswith("init."):
            stripped = key[len("init."):]
            init_args[stripped] = coerce(stripped, value, np_schema)
        else:
            main_args[key] = coerce(key, value, main_schema)

    zarr_urls = []
    if zarr_urls_raw is not None:
        zarr_urls = [u.strip() for u in zarr_urls_raw.split(",") if u.strip()]
        for url in zarr_urls:
            if not Path(url).is_dir():
                fail(f"OME-Zarr image path is not an existing directory: {url}")

    exec_np = task.get("executable_non_parallel")
    exec_p = task.get("executable_parallel")

    if task_type == "parallel":
        for i, url in enumerate(zarr_urls):
            run_unit(pkg / exec_p, {"zarr_url": url, **main_args}, i,
                     f"{task_name} [{i + 1}/{len(zarr_urls)}] {url}")
    elif task_type == "non_parallel":
        run_unit(pkg / exec_np,
                 {"zarr_urls": zarr_urls, "zarr_dir": zarr_dir, **main_args},
                 0, task_name)
    elif task_type == "converter_non_parallel":
        run_unit(pkg / exec_np, {"zarr_dir": zarr_dir, **main_args}, 0, task_name)
    elif task_type in ("compound", "converter_compound"):
        init_payload = {"zarr_dir": zarr_dir, **init_args}
        if task_type == "compound":
            init_payload["zarr_urls"] = zarr_urls
        out = run_unit(pkg / exec_np, init_payload, 0, f"{task_name} (init)")
        plist = out.get("parallelization_list") or []
        if not plist:
            print("[fractal_run] init produced an empty parallelization list; "
                  "nothing to compute", flush=True)
            return
        for i, entry in enumerate(plist):
            run_unit(pkg / exec_p,
                     {"zarr_url": entry["zarr_url"],
                      "init_args": entry.get("init_args", {}), **main_args},
                     i + 1,
                     f"{task_name} [{i + 1}/{len(plist)}] {entry['zarr_url']}")
    else:
        fail(f"Unsupported Fractal task type: {task_type}")


main()
'''


def _uses_pixi(directory: Path) -> bool:
    """True when the repo ships pixi config plus a lock file, so the env can
    reproduce the locked dependency set instead of a fresh pip resolve."""
    if not (directory / "pixi.lock").is_file():
        return False
    if (directory / "pixi.toml").is_file():
        return True
    try:
        return "[tool.pixi" in (directory / "pyproject.toml").read_text()
    except OSError:
        return False


def _build_pre_run(use_pixi: bool = False) -> str:
    """Bash that builds the per-SHA task env and writes the shim.

    Runs inside the job script after `cd` into the work dir, in the same shell
    as the command, so the PATH export carries over. The env lives next to the
    repo's .snapshots cache, keyed by the pinned commit, and is built at most
    once per SHA (flock-guarded for concurrent first launches).

    Conda mode installs the package with pip into a python=3.12 env; pixi mode
    runs `pixi install --frozen` so dependencies come from the repo's pixi.lock.
    """
    if use_pixi:
        # pixi writes .pixi/ into the project dir and its editable install of
        # the package keeps pointing at the sources, so build in a persistent
        # copy of the snapshot. The -pixi suffix keeps clear of conda envs
        # built for the same SHA before the repo gained a lock file.
        env_suffix = "-pixi"
        build = '''  if ! cp -a "$__fg_snapshot" "$ENV_DIR" \\
      || ! pixi install --frozen --manifest-path "$ENV_DIR"; then
    rm -rf "$ENV_DIR"
    echo "ERROR: failed to build the Fractal task environment" >&2
    exit 1
  fi'''
        path_export = 'export PATH="$ENV_DIR/.pixi/envs/default/bin:$PATH"'
    else:
        env_suffix = ""
        # pip builds local directories in-tree (build/, *.egg-info), which
        # would pollute the immutable snapshot every job's repo symlink
        # exposes — so install from a throwaway copy instead.
        # ponytail: fixed python=3.12; parse requires-python from pyproject if it bites
        build = '''  __fg_src="$(mktemp -d)"
  if ! cp -a "$__fg_snapshot/." "$__fg_src" \\
      || ! conda create -y -p "$ENV_DIR" python=3.12 pip \\
      || ! "$ENV_DIR/bin/pip" install "$__fg_src"; then
    rm -rf "$ENV_DIR" "$__fg_src"
    echo "ERROR: failed to build the Fractal task environment" >&2
    exit 1
  fi
  rm -rf "$__fg_src"'''
        path_export = 'export PATH="$ENV_DIR/bin:$PATH"'
    return f'''# --- Fractal task environment (generated by Fileglancer) ---
__fg_snapshot="$(readlink -f "$FG_WORK_DIR/repo")"
ENV_DIR="$(dirname "$(dirname "$__fg_snapshot")")/.envs/$(basename "$__fg_snapshot"){env_suffix}"
mkdir -p "$(dirname "$ENV_DIR")"
exec 9>"$ENV_DIR.lock"
flock 9
if [ ! -f "$ENV_DIR/.ok" ]; then
  echo "Building Fractal task environment in $ENV_DIR (one-time for this version)..."
  rm -rf "$ENV_DIR"
{build}
  touch "$ENV_DIR/.ok"
  # ponytail: no env eviction; GC alongside gc_repo_snapshots when quota bites
fi
flock -u 9
exec 9>&-
{path_export}
cat > "$FG_WORK_DIR/fractal_run.py" <<'FRACTAL_SHIM_EOF'
{_SHIM}FRACTAL_SHIM_EOF
'''


class FractalAdapter:
    """Generate an AppManifest from a Fractal task package."""

    def can_handle(self, directory: Path) -> bool:
        return _find_manifest(directory) is not None

    def convert(self, directory: Path) -> AppManifest:
        manifest_path = _find_manifest(directory)
        manifest = json.loads(manifest_path.read_text())

        version = manifest.get("manifest_version")
        if str(version) != "2":
            raise ValueError(
                f"Unsupported Fractal manifest_version {version!r} (only version 2 is supported)"
            )
        if not manifest.get("has_args_schemas"):
            raise ValueError(
                "Fractal manifest has no args schemas (has_args_schemas is false); "
                "cannot generate a parameter form"
            )

        package_dir = manifest_path.parent
        package_rel = package_dir.relative_to(directory).as_posix()

        # App name from the repo cache path ({cache_base}/{owner}/{repo}/{branch});
        # fall back to the directory name outside the cache (e.g. tests).
        try:
            from fileglancer.apps.manifest import _repo_cache_base
            cache_base = _repo_cache_base().resolve()
            relative = directory.resolve().relative_to(cache_base)
            name = relative.parts[1]
        except Exception:
            name = directory.name

        use_pixi = _uses_pixi(directory)
        pre_run = _build_pre_run(use_pixi)
        runnables = []
        seen_ids: set[str] = set()
        for task in manifest.get("task_list", []):
            task_type = _task_type(task)
            np_schema = task.get("args_schema_non_parallel")
            p_schema = task.get("args_schema_parallel")
            is_compound = task_type in ("compound", "converter_compound")
            main_schema = p_schema if p_schema is not None else np_schema

            sections = []
            io_section = _io_section(task_type, np_schema, p_schema)
            if io_section:
                sections.append(io_section)
            if is_compound and np_schema:
                init_params = _schema_params(np_schema, key_prefix="init.")
                if init_params:
                    sections.append(AppParameterSection(
                        section="Init parameters", parameters=init_params))
            main_params = _schema_params(main_schema or {})
            if main_params:
                sections.append(AppParameterSection(
                    section="Parameters", parameters=main_params))

            slug = _slugify(task["name"]) or "task"
            entry_id, n = slug, 1
            while entry_id in seen_ids:
                n += 1
                entry_id = f"{slug}-{n}"
            seen_ids.add(entry_id)

            runnables.append(AppEntryPoint(
                id=entry_id,
                name=task["name"],
                description=_task_description(task, package_dir),
                command=(
                    f'python "$FG_WORK_DIR/fractal_run.py"'
                    f" --task-name {shlex.quote(task['name'])}"
                    f" --package-dir {shlex.quote(package_rel)}"
                ),
                working_dir="work",
                pre_run=pre_run,
                parameters=sections,
                resources=_task_resources(task),
            ))

        if not runnables:
            raise ValueError("Fractal manifest contains no tasks")

        # The Fractal manifest has no package description, so use pyproject's.
        # Not a task's: that would make a multi-task app look like one task.
        description = None
        try:
            project = tomllib.loads((directory / "pyproject.toml").read_text()).get("project", {})
            description = project.get("description") or None
        except (OSError, tomllib.TOMLDecodeError):
            pass
        return AppManifest(
            name=name,
            description=description,
            source_filename=_FRACTAL_MANIFEST_FILENAME,
            requirements=["pixi"] if use_pixi else ["miniforge"],
            runnables=runnables,
        )
