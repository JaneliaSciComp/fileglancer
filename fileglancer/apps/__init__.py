"""Apps package — manifest discovery, command building, and cluster job management."""

from fileglancer.apps.core import (  # noqa: F401
    MANIFEST_FILENAME,
    _TOOL_REGISTRY,
    _build_container_script,
    _container_sif_name,
    _ensure_repo_cache,
    build_command,
    cancel_job,
    discover_app_manifests,
    fetch_app_manifest,
    get_app_branch,
    get_job_file_content,
    get_job_file_paths,
    get_service_url,
    start_job_monitor,
    stop_job_monitor,
    submit_job,
    merge_requirements,
    validate_path_for_shell,
    validate_path_in_filestore,
    verify_requirements,
)
