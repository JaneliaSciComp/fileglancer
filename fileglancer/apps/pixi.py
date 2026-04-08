"""Pixi manifest adapter.

Generates an AppManifest from a Pixi project's pixi.toml or pyproject.toml,
converting pixi tasks into runnables.
"""

import subprocess
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore[no-redef]

from fileglancer.model import (
    AppEntryPoint,
    AppManifest,
    AppParameter,
)

_PIXI_TOML = "pixi.toml"
_PYPROJECT_TOML = "pyproject.toml"


def _read_pixi_config(directory: Path) -> dict | None:
    """Read pixi configuration from pixi.toml or pyproject.toml.

    Returns the pixi config dict (equivalent to the [tool.pixi] section),
    or None if no pixi project is found. For pyproject.toml, project metadata
    from the top-level [project] section is merged in if not already present
    in [tool.pixi].
    """
    pixi_path = directory / _PIXI_TOML
    if pixi_path.is_file():
        data = tomllib.loads(pixi_path.read_text())
        # In pixi.toml, the config is at the top level
        if "tasks" in data or "project" in data:
            return data
        return None

    pyproject_path = directory / _PYPROJECT_TOML
    if pyproject_path.is_file():
        data = tomllib.loads(pyproject_path.read_text())
        pixi_config = data.get("tool", {}).get("pixi")
        if pixi_config and "tasks" in pixi_config:
            # Merge top-level [project] metadata into pixi config.
            # [tool.pixi.project] may only have channels/platforms,
            # so fill in missing fields (name, description, version)
            # from the top-level [project] section.
            top_project = data.get("project", {})
            if top_project:
                pixi_project = pixi_config.get("project", {})
                for key in ("name", "description", "version"):
                    if key not in pixi_project and key in top_project:
                        pixi_project[key] = top_project[key]
                pixi_config["project"] = pixi_project
            return pixi_config
        return None

    return None


def _collect_tasks(config: dict) -> dict[str, dict]:
    """Collect all tasks from a pixi config, including feature tasks.

    Returns a dict of task_name -> task_definition (normalized to dict form).
    """
    tasks: dict[str, dict] = {}

    # Top-level tasks
    for name, defn in config.get("tasks", {}).items():
        tasks[name] = _normalize_task(defn)

    # Feature tasks (e.g. [tool.pixi.feature.test.tasks])
    for feature_name, feature in config.get("feature", {}).items():
        for name, defn in feature.get("tasks", {}).items():
            if name not in tasks:
                tasks[name] = _normalize_task(defn)

    return tasks


def _normalize_task(defn) -> dict:
    """Normalize a task definition to dict form.

    Tasks can be defined as:
      - A plain string: "echo hello" -> {"cmd": "echo hello"}
      - A dict with cmd and optional fields
    """
    if isinstance(defn, str):
        return {"cmd": defn}
    return dict(defn)


def _convert_task_arg(arg) -> AppParameter:
    """Convert a pixi task argument to an AppParameter."""
    if isinstance(arg, str):
        # Simple required argument
        return AppParameter(
            name=arg.replace("_", " ").title(),
            type="string",
            required=True,
        )

    # Dict form with optional default and choices
    arg_name = arg["arg"]
    param_type = "enum" if "choices" in arg else "string"
    kwargs: dict = {
        "name": arg_name.replace("_", " ").title(),
        "type": param_type,
    }
    if "default" in arg:
        kwargs["default"] = arg["default"]
    else:
        kwargs["required"] = True
    if "choices" in arg:
        kwargs["options"] = arg["choices"]
    return AppParameter(**kwargs)


def _task_to_entry_point(name: str, task: dict) -> AppEntryPoint | None:
    """Convert a pixi task dict to an AppEntryPoint.

    Returns None for tasks without a command (dependency-only tasks with no
    cmd are not directly runnable).
    """
    cmd = task.get("cmd")

    # Dependency-only tasks (no cmd) are not runnable
    if not cmd:
        return None

    # Skip hidden tasks (names starting with _)
    if name.startswith("_"):
        return None

    # Handle array commands
    if isinstance(cmd, list):
        cmd = " ".join(cmd)

    # Build the pixi run command
    command = f"pixi run {name}"

    description = task.get("description")

    # Convert task arguments to parameters
    parameters = []
    args = task.get("args")
    if args:
        for arg in args:
            parameters.append(_convert_task_arg(arg))

    # Convert env vars — these become informational string parameters
    # (pixi handles them natively, but we expose them for visibility/override)
    env = task.get("env")
    if env:
        for var_name, var_value in env.items():
            parameters.append(AppParameter(
                flag=f"--env:{var_name}",
                name=var_name,
                type="string",
                description=f"Environment variable (default: {var_value})",
                default=str(var_value),
                hidden=True,
            ))

    return AppEntryPoint(
        id=name,
        name=name,
        description=description,
        command=command,
        parameters=parameters,
    )


def _get_git_repo_and_branch(directory: Path) -> tuple[str, str] | None:
    """Get the repo name and branch from a git directory.

    Returns (repo_name, branch) or None if not a git repo.
    """
    try:
        repo_url = subprocess.run(
            ["git", "-C", str(directory), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
        branch = subprocess.run(
            ["git", "-C", str(directory), "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        if repo_url.returncode != 0 or branch.returncode != 0:
            return None

        # Extract repo name from URL (e.g. "https://github.com/owner/repo.git" -> "repo")
        url = repo_url.stdout.strip()
        repo_name = url.rstrip("/").rsplit("/", 1)[-1].removesuffix(".git")
        branch_name = branch.stdout.strip()

        if repo_name and branch_name:
            return repo_name, branch_name
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


class PixiAdapter:
    """Generate an AppManifest from a Pixi project's tasks."""

    def can_handle(self, directory: Path) -> bool:
        return _read_pixi_config(directory) is not None

    def convert(self, directory: Path) -> AppManifest:
        config = _read_pixi_config(directory)

        # Extract project metadata
        project = config.get("project", config.get("workspace", {}))
        description = project.get("description")
        version = project.get("version")

        # Use repo_name/branch as the app name if in a git repo
        git_info = _get_git_repo_and_branch(directory)
        if git_info:
            repo_name, branch_name = git_info
            name = f"{repo_name}/{branch_name}"
        else:
            name = project.get("name", directory.name)

        # Collect and convert tasks
        tasks = _collect_tasks(config)
        runnables = []
        for task_name, task_defn in tasks.items():
            ep = _task_to_entry_point(task_name, task_defn)
            if ep is not None:
                runnables.append(ep)

        if not runnables:
            raise ValueError("No runnable tasks found in pixi config")

        return AppManifest(
            name=name,
            description=description,
            version=version,
            requirements=["pixi"],
            runnables=runnables,
        )
