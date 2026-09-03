"""Apps package — manifest discovery, command building, and cluster job management."""

from fileglancer.apps.manifest import (  # noqa: F401
    MANIFEST_FILENAME,
    _ensure_repo_cache,
    clone_url_for_stored_app,
    discover_app_manifests,
    ensure_repo_snapshot,
    fetch_app_manifest,
    gc_repo_snapshots,
    get_app_branch,
    get_remote_head,
    get_remote_heads,
    canonical_app_url,
    get_or_load_manifest,
    refresh_cached_manifest,
    set_worker_exec,
    validate_commit_sha,
)
from fileglancer.apps.command import (  # noqa: F401
    _TOOL_REGISTRY,
    build_command,
    build_requirements_check,
    collect_creatable_dirs,
    collect_path_parameters,
    expand_user_path,
    merge_requirements,
    validate_path_for_shell,
    validate_path_in_filestore,
)
from fileglancer.apps.jobs import (  # noqa: F401
    _build_container_script,
    _build_service_url_publisher,
    _container_bind_paths,
    _container_sif_name,
    _SERVICE_PORT_HELPER,
    cancel_job,
    start_job_monitor,
    stop_job_monitor,
    submit_job,
)
from fileglancer.apps.jobfiles import (  # noqa: F401
    get_job_file_content,
    get_job_file_paths,
    get_service_url,
    get_service_phase,
)
from fileglancer.apps.serviceproxy import (  # noqa: F401
    build_proxied_service_url,
    cache_upstream,
    cached_upstream,
    job_id_from_host,
    record_resolve,
    reset_resolve_metrics,
    resolve_counts,
    service_host_label,
    upstream_from_service_url,
)
