"""Apps package — manifest discovery, command building, and cluster job management."""

from fileglancer.apps.manifest import (  # noqa: F401
    MANIFEST_FILENAME,
    _ensure_repo_cache,
    discover_app_manifests,
    fetch_app_manifest,
    get_app_branch,
    get_or_load_manifest,
    refresh_cached_manifest,
    set_worker_exec,
)
from fileglancer.apps.command import (  # noqa: F401
    _TOOL_REGISTRY,
    build_command,
    build_requirements_check,
    merge_requirements,
    validate_path_for_shell,
    validate_path_in_filestore,
)
from fileglancer.apps.jobs import (  # noqa: F401
    _build_container_script,
    _container_sif_name,
    cancel_job,
    start_job_monitor,
    stop_job_monitor,
    submit_job,
)
from fileglancer.apps.jobfiles import (  # noqa: F401
    get_job_file_content,
    get_job_file_paths,
    get_service_url,
)
