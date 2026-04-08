"""Nextflow manifest adapter.

Generates an AppManifest from a Nextflow pipeline's nextflow_schema.json,
optionally enriched with metadata from nextflow.config.
"""

import json
from pathlib import Path

from fileglancer.model import (
    AppEntryPoint,
    AppManifest,
    AppParameter,
    AppParameterSection,
)

_NEXTFLOW_SCHEMA_FILENAME = "nextflow_schema.json"


def _convert_property_type(prop: dict) -> str:
    """Map a nextflow_schema.json property to an AppParameter type string."""
    if "enum" in prop:
        return "enum"
    json_type = prop.get("type", "string")
    fmt = prop.get("format", "")
    if json_type == "boolean":
        return "boolean"
    if json_type == "integer":
        return "integer"
    if json_type == "number":
        return "number"
    if fmt in ("path", "file-path"):
        return "file"
    if fmt == "directory-path":
        return "directory"
    return "string"


def _convert_property(name: str, prop: dict, is_required: bool) -> AppParameter:
    """Convert a single nextflow_schema.json property to an AppParameter."""
    param_type = _convert_property_type(prop)

    kwargs: dict = {
        "flag": f"--{name}",
        "name": name.replace("_", " ").title(),
        "type": param_type,
    }

    desc = prop.get("description")
    if desc:
        kwargs["description"] = desc

    if is_required:
        kwargs["required"] = True

    if "default" in prop:
        default = prop["default"]
        if isinstance(default, str) and default.startswith("$projectDir"):
            default = "." + default[len("$projectDir"):]
        kwargs["default"] = default

    if param_type == "enum":
        kwargs["options"] = prop["enum"]

    if "pattern" in prop and param_type == "string":
        kwargs["pattern"] = prop["pattern"]

    if param_type in ("integer", "number"):
        if "minimum" in prop:
            kwargs["min"] = prop["minimum"]
        if "maximum" in prop:
            kwargs["max"] = prop["maximum"]

    if prop.get("hidden"):
        kwargs["hidden"] = True

    return AppParameter(**kwargs)


class NextflowAdapter:
    """Generate an AppManifest from a Nextflow pipeline's nextflow_schema.json."""

    def can_handle(self, directory: Path) -> bool:
        return (directory / _NEXTFLOW_SCHEMA_FILENAME).is_file()

    def convert(self, directory: Path) -> AppManifest:
        schema_path = directory / _NEXTFLOW_SCHEMA_FILENAME
        schema = json.loads(schema_path.read_text())

        # Determine app metadata — use owner/repo from the cache path
        # (directory is {cache_base}/{owner}/{repo}/{branch})
        name = f"{directory.parent.parent.name}/{directory.parent.name}"
        description = schema.get("description")

        # Build parameters from definitions, ordered by allOf
        definitions = schema.get("$defs", schema.get("definitions", {}))
        all_of = schema.get("allOf", [])

        # Determine ordering: use allOf refs if present, otherwise dict order
        ordered_def_keys = []
        for ref in all_of:
            ref_path = ref.get("$ref", "")
            # e.g. "#/definitions/pipeline_options" or "#/$defs/pipeline_options"
            if ref_path.startswith("#/$defs/") or ref_path.startswith("#/definitions/"):
                ordered_def_keys.append(ref_path.split("/")[-1])
        if not ordered_def_keys:
            ordered_def_keys = list(definitions.keys())

        parameters = []
        for def_key in ordered_def_keys:
            defn = definitions.get(def_key)
            if not defn:
                continue

            properties = defn.get("properties", {})
            if not properties:
                continue

            required_list = set(defn.get("required", []))

            params = [
                _convert_property(prop_name, prop, prop_name in required_list)
                for prop_name, prop in properties.items()
            ]

            section_title = defn.get("title", def_key.replace("_", " ").title())
            section_desc = defn.get("description", "")
            help_text = defn.get("help_text", "")
            if help_text:
                section_desc = f"{section_desc}\n\n{help_text}" if section_desc else help_text

            section = AppParameterSection(
                section=section_title,
                description=section_desc,
                collapsed=False,
                parameters=params,
            )
            parameters.append(section)

        env_parameters = [
            AppParameterSection(
                section="Nextflow",
                parameters=[
                    AppParameter(
                        flag="-profile",
                        name="Profiles",
                        type="string",
                        description="Comma-separated list of Nextflow profiles to apply (e.g. standard,docker)",
                    ),
                    AppParameter(
                        name="Extra Arguments",
                        type="string",
                        description="Additional Nextflow command-line arguments (e.g. -resume, -with-tower)",
                        raw=True,
                    ),
                ],
            ),
        ]

        entry_point = AppEntryPoint(
            id="run",
            name="Run pipeline",
            description=description,
            command="nextflow run . -ansi-log false",
            parameters=parameters,
            env_parameters=env_parameters,
        )

        return AppManifest(
            name=name,
            description=description,
            requirements=["nextflow"],
            runnables=[entry_point],
        )
