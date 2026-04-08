"""Manifest adapters for generating AppManifest from non-runnables.yaml project types.

Each adapter knows how to detect a specific project type (e.g. Nextflow pipeline)
in a directory and convert its configuration into an AppManifest.

To add a new adapter:
  1. Subclass ManifestAdapter
  2. Implement can_handle(directory) and convert(directory)
  3. Register it by adding an instance to the MANIFEST_ADAPTERS list below
"""

from abc import ABC, abstractmethod
from pathlib import Path

from fileglancer.model import AppManifest

from fileglancer.apps.nextflow import NextflowAdapter
from fileglancer.apps.pixi import PixiAdapter


class ManifestAdapter(ABC):
    """Base class for converting project-specific config files into an AppManifest."""

    @abstractmethod
    def can_handle(self, directory: Path) -> bool:
        """Return True if this adapter can generate a manifest for the given directory."""

    @abstractmethod
    def convert(self, directory: Path) -> AppManifest:
        """Convert the project config in the given directory to an AppManifest.

        Only called when can_handle() returned True.
        """


# ---------------------------------------------------------------------------
# Adapter registry — checked in order when no runnables.yaml is found.
# Add new adapters here.
# ---------------------------------------------------------------------------

MANIFEST_ADAPTERS: list[ManifestAdapter] = [
    NextflowAdapter(),
    PixiAdapter(),
]


def try_adapt(directory: Path) -> AppManifest | None:
    """Try each registered adapter and return the first successful manifest, or None."""
    for adapter in MANIFEST_ADAPTERS:
        if adapter.can_handle(directory):
            return adapter.convert(directory)
    return None
