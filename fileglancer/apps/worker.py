"""Subprocess worker for running cluster operations as a target user.

This module is invoked as a subprocess by fileglancer to run py-cluster-api
operations (submit, cancel) with the identity of the authenticated user.
The parent process uses Python 3.9+ ``user``/``group``/``extra_groups``
subprocess kwargs to set the child's identity before any code runs.

Protocol:
    - Input:  JSON on stdin
    - Output: JSON on stdout ({"job_id": ...} or {"error": ...})
    - Errors: non-zero exit code + JSON error on stdout

Usage (called by fileglancer, not directly):
    subprocess.run(
        [sys.executable, "-m", "fileglancer.apps.worker"],
        input=json.dumps(request).encode(),
        capture_output=True,
        user=uid, group=gid, extra_groups=groups,
    )
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from cluster_api import create_executor, ResourceSpec


async def _submit(request: dict) -> dict:
    """Create work dir, symlink repo, submit job via py-cluster-api."""
    config = request["cluster_config"]
    # extra_args are handled via ResourceSpec, not config
    config.pop("extra_args", None)

    executor = create_executor(**config)

    work_dir = Path(request["work_dir"])
    work_dir.mkdir(parents=True, exist_ok=True)

    # Symlink the cached repo into the work directory
    cached_repo_dir = request["cached_repo_dir"]
    repo_link = work_dir / "repo"
    if repo_link.is_symlink() or repo_link.exists():
        repo_link.unlink()
    repo_link.symlink_to(cached_repo_dir)

    # Build ResourceSpec from the serialized dict
    res = request["resources"]
    resource_spec = ResourceSpec(
        cpus=res.get("cpus"),
        gpus=res.get("gpus"),
        memory=res.get("memory"),
        walltime=res.get("walltime"),
        queue=res.get("queue"),
        work_dir=res["work_dir"],
        stdout_path=res.get("stdout_path"),
        stderr_path=res.get("stderr_path"),
        extra_directives=res.get("extra_directives"),
        extra_args=res.get("extra_args"),
    )

    job = await executor.submit(
        command=request["command"],
        name=request["job_name"],
        resources=resource_spec,
    )

    return {"job_id": job.job_id, "script_path": job.script_path}


async def _cancel(request: dict) -> dict:
    """Cancel a cluster job via py-cluster-api."""
    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)
    await executor.cancel(request["job_id"])

    return {"status": "ok"}


_ACTIONS = {
    "submit": _submit,
    "cancel": _cancel,
}


def main():
    request = json.loads(sys.stdin.buffer.read())
    action = request.get("action")

    handler = _ACTIONS.get(action)
    if handler is None:
        json.dump({"error": f"Unknown action: {action}"}, sys.stdout)
        sys.exit(1)

    try:
        result = asyncio.run(handler(request))
        json.dump(result, sys.stdout)
    except Exception as e:
        json.dump({"error": str(e)}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
