"""Fractal task-package manifest adapter.

Generates an AppManifest from a Fractal task package's __FRACTAL_MANIFEST__.json
(https://fractal-analytics-platform.github.io/), one runnable per task.
"""

import json
from pathlib import Path

from fileglancer.model import AppEntryPoint, AppManifest

_FRACTAL_MANIFEST_FILENAME = "__FRACTAL_MANIFEST__.json"


def _find_manifest(directory: Path) -> Path | None:
    """Locate the Fractal manifest: repo root, one package dir down, or src layout."""
    candidates = [directory / _FRACTAL_MANIFEST_FILENAME]
    candidates += sorted(directory.glob(f"*/{_FRACTAL_MANIFEST_FILENAME}"))
    candidates += sorted(directory.glob(f"src/*/{_FRACTAL_MANIFEST_FILENAME}"))
    return next((c for c in candidates if c.is_file()), None)


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

        return AppManifest(
            name=directory.name,
            source_filename=_FRACTAL_MANIFEST_FILENAME,
            requirements=["miniforge"],
            runnables=[
                AppEntryPoint(id="placeholder", name="placeholder", command="true")
            ],
        )
