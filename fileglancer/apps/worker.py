"""Subprocess worker for running operations as a target user.

This module is invoked as a subprocess by fileglancer to run py-cluster-api
operations (submit, cancel, poll) and git/manifest operations (clone, pull,
read) with the identity of the authenticated user.  The parent process uses
Python 3.9+ ``user``/``group``/``extra_groups`` subprocess kwargs to set the
child's identity before any code runs.

Protocol:
    - Input:  JSON on stdin
    - Output: JSON on stdout ({"job_id": ...} or {"error": ...})
    - Errors: non-zero exit code + JSON error on stdout

Usage (called by fileglancer, not directly):
    subprocess.run(
        [sys.executable, "-m", "fileglancer.apps.worker"],
        input=json.dumps(request).encode(),
        capture_output=True,
        env={**os.environ, "HOME": pw.pw_dir},
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


async def _poll(request: dict) -> dict:
    """Poll job statuses via py-cluster-api (bjobs -u all).

    The executor needs to know which jobs to track, so we seed it with
    the cluster_job_ids from the DB before polling. After poll(), we
    return the updated statuses and metadata for each tracked job.
    """
    from cluster_api._types import JobRecord, JobStatus

    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)

    # Seed the executor with stub JobRecords so poll() knows what to track.
    # poll() queries bjobs and updates these records in-place.
    for cid in request["cluster_job_ids"]:
        executor._jobs[cid] = JobRecord(
            job_id=cid,
            name="",
            command="",
            status=JobStatus.PENDING,
        )

    await executor.poll()

    # Return the updated state for each job
    jobs = {}
    for cid, record in executor.jobs.items():
        jobs[cid] = {
            "status": record.status.value,
            "exit_code": record.exit_code,
            "exec_host": record.exec_host,
            "start_time": record.start_time.isoformat() if record.start_time else None,
            "finish_time": record.finish_time.isoformat() if record.finish_time else None,
        }

    return {"jobs": jobs}


async def _reconnect(request: dict) -> dict:
    """Reconnect to existing jobs via py-cluster-api (bjobs -u all)."""
    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)
    reconnected = await executor.reconnect()

    jobs = {}
    for record in reconnected:
        jobs[record.job_id] = {
            "status": record.status.value,
            "name": record.name,
            "exit_code": record.exit_code,
            "exec_host": record.exec_host,
            "start_time": record.start_time.isoformat() if record.start_time else None,
            "finish_time": record.finish_time.isoformat() if record.finish_time else None,
        }

    return {"jobs": jobs}


async def _ensure_repo(request: dict) -> dict:
    """Clone or update a GitHub repo in the current user's cache."""
    from fileglancer.apps.core import _ensure_repo_cache

    repo_dir = await _ensure_repo_cache(
        url=request["url"],
        pull=request.get("pull", False),
    )
    return {"repo_dir": str(repo_dir)}


async def _discover_manifests(request: dict) -> dict:
    """Clone/pull repo and discover all manifests."""
    from fileglancer.apps.core import _ensure_repo_cache, _find_manifests_in_repo

    repo_dir = await _ensure_repo_cache(
        url=request["url"],
        pull=True,
    )
    results = _find_manifests_in_repo(repo_dir)
    return {
        "manifests": [
            {"path": path, "manifest": manifest.model_dump(mode="json")}
            for path, manifest in results
        ]
    }


async def _read_manifest(request: dict) -> dict:
    """Fetch and read a single manifest from a cached repo."""
    from fileglancer.apps.core import _ensure_repo_cache, _read_manifest_file

    repo_dir = await _ensure_repo_cache(
        url=request["url"],
        pull=request.get("pull", False),
    )
    manifest_path = request.get("manifest_path", "")
    target_dir = repo_dir / manifest_path if manifest_path else repo_dir
    manifest = _read_manifest_file(target_dir)
    return {"manifest": manifest.model_dump(mode="json")}


_ACTIONS = {
    "submit": _submit,
    "cancel": _cancel,
    "poll": _poll,
    "reconnect": _reconnect,
    "ensure_repo": _ensure_repo,
    "discover_manifests": _discover_manifests,
    "read_manifest": _read_manifest,
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
