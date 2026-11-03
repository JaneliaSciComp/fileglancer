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


def _is_complex(prop: dict) -> bool:
    """True for schema shapes the flat parameter model can't express natively."""
    if any(k in prop for k in ("$ref", "oneOf", "allOf", "anyOf")):
        return True
    return prop.get("type") in ("array", "object")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _convert_property(key: str, prop: dict, required: bool,
                      key_prefix: str = "") -> AppParameter:
    """Convert one args-schema property to an AppParameter."""
    prop, nullable = _unwrap_nullable(prop)
    if nullable:
        required = False

    kwargs: dict = {
        "flag": f"--{key_prefix}{key}",
        "name": prop.get("title") or key.replace("_", " ").title(),
        "required": required,
    }
    desc = prop.get("description")

    if _is_complex(prop):
        kwargs["type"] = "string"
        kwargs["description"] = f"(JSON) {desc}" if desc else "(JSON)"
        if "default" in prop and prop["default"] is not None:
            kwargs["default"] = json.dumps(prop["default"])
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
        _convert_property(key, prop, key in required, key_prefix)
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
        params.append(AppParameter(
            flag="--zarr_urls",
            name="OME-Zarr Images",
            type="string",
            required=reserved_key in required,
            description="Comma-separated paths to OME-Zarr images",
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


def _task_description(task: dict, package_dir: Path) -> str | None:
    docs_info = task.get("docs_info") or ""
    if docs_info.startswith("file:"):
        try:
            docs_info = (package_dir / docs_info[len("file:"):]).read_text()
        except Exception:
            docs_info = ""
    parts = [docs_info.strip()] if docs_info.strip() else []
    if task.get("docs_link"):
        parts.append(task["docs_link"])
    tags = [f"{label}: {task[field]}"
            for label, field in (("Category", "category"), ("Modality", "modality"))
            if task.get(field)]
    if tags:
        parts.append(" | ".join(tags))
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
                pre_run="",
                parameters=sections,
                resources=_task_resources(task),
            ))

        if not runnables:
            raise ValueError("Fractal manifest contains no tasks")

        return AppManifest(
            name=name,
            source_filename=_FRACTAL_MANIFEST_FILENAME,
            requirements=["miniforge"],
            runnables=runnables,
        )
