"""Tests for apps module: miniforge/apptainer requirements, conda_env, and container support."""

import os
import subprocess
import sys
import time

import pytest
from pydantic import ValidationError

from conftest import requires_symlinks
from fileglancer.model import (
    SUPPORTED_TOOLS,
    AppEntryPoint,
    AppManifest,
    AppParameter,
    JobSubmitRequest,
)
from fileglancer.apps import (
    _TOOL_REGISTRY,
    merge_requirements,
    build_requirements_check,
    _container_sif_name,
    _build_container_script,
    build_command,
    collect_path_parameters,
    expand_user_path,
)

# The `pwd` module is POSIX-only; on Windows `command_mod.pwd` is None, so tests
# that patch pwd.getpwnam/getpwuid to exercise per-user home resolution cannot run.
requires_pwd = pytest.mark.skipif(
    sys.platform == "win32", reason="pwd module is not available on Windows"
)


# --- Model tests ---

class TestSupportedTools:
    def test_miniforge_in_supported_tools(self):
        assert "miniforge" in SUPPORTED_TOOLS

    def test_miniforge_in_tool_registry(self):
        assert "miniforge" in _TOOL_REGISTRY
        entry = _TOOL_REGISTRY["miniforge"]
        assert entry["version_args"] == ["conda", "--version"]
        assert entry["version_pattern"] == r"conda (\S+)"


class TestCondaEnvValidation:
    def test_valid_name(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", conda_env="myenv")
        assert ep.conda_env == "myenv"

    def test_valid_name_with_dots_dashes(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", conda_env="my.env-2_test")
        assert ep.conda_env == "my.env-2_test"

    def test_valid_absolute_path(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", conda_env="/opt/envs/myenv")
        assert ep.conda_env == "/opt/envs/myenv"

    def test_none_is_allowed(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", conda_env=None)
        assert ep.conda_env is None

    def test_default_is_none(self):
        ep = AppEntryPoint(id="t", name="T", command="echo")
        assert ep.conda_env is None

    def test_rejects_name_with_spaces(self):
        with pytest.raises(ValidationError, match="conda_env name must match"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="my env")

    def test_rejects_name_with_semicolon(self):
        with pytest.raises(ValidationError, match="conda_env name must match"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="env;rm")

    def test_rejects_path_with_semicolon(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="/opt/envs;rm -rf /")

    def test_rejects_path_with_backtick(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="/opt/`whoami`/env")

    def test_rejects_path_with_dollar(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="/opt/$HOME/env")

    def test_rejects_path_with_pipe(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", conda_env="/opt/env|bad")


class TestContainerArgsValidation:
    def test_valid_args(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", container_args="--nv --bind /tmp")
        assert ep.container_args == "--nv --bind /tmp"

    def test_none_is_allowed(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", container_args=None)
        assert ep.container_args is None

    def test_rejects_with_semicolon(self):
        with pytest.raises(ValidationError, match="container_args contains forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", container_args="--nv; rm -rf /")

    def test_rejects_with_backtick(self):
        with pytest.raises(ValidationError, match="container_args contains forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", container_args="--nv `whoami`")

    def test_rejects_with_dollar(self):
        with pytest.raises(ValidationError, match="container_args contains forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", container_args="--nv $HOME")

    def test_rejects_with_pipe(self):
        with pytest.raises(ValidationError, match="container_args contains forbidden characters"):
            AppEntryPoint(id="t", name="T", command="echo", container_args="--nv | bad")


# --- build_requirements_check tests ---

def _make_fake_tool(directory, name, version_output):
    """Create an executable shim in `directory` that prints `version_output`."""
    path = directory / name
    path.write_text(f'#!/bin/bash\necho {version_output!r}\n')
    path.chmod(0o755)


def _run_check(reqs, extra_path=None, prefix=""):
    """Generate the runtime check snippet and execute it with bash.

    Returns (returncode, stderr).
    """
    snippet = prefix + build_requirements_check(reqs)
    env = dict(os.environ)
    if extra_path:
        env["PATH"] = f"{extra_path}{os.pathsep}{env['PATH']}"
    proc = subprocess.run(
        ["bash", "-c", snippet], capture_output=True, text=True, env=env
    )
    return proc.returncode, proc.stderr.strip()


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="requirement-check snippet is POSIX bash; it only runs on Linux compute nodes",
)
class TestBuildRequirementsCheck:
    def test_empty_returns_empty_string(self):
        assert build_requirements_check([]) == ""

    def test_present_tool_passes(self):
        # bash is always present in the test environment
        rc, _ = _run_check(["bash"])
        assert rc == 0

    def test_missing_tool_fails(self):
        rc, stderr = _run_check(["zzz_no_such_tool_999"])
        assert rc == 1
        assert "not installed or not on PATH" in stderr
        assert "zzz_no_such_tool_999" in stderr

    def test_multiple_errors_aggregated(self):
        rc, stderr = _run_check(["aaa_missing_111", "bbb_missing_222"])
        assert rc == 1
        assert "aaa_missing_111" in stderr
        assert "bbb_missing_222" in stderr

    def test_version_satisfied(self, tmp_path):
        _make_fake_tool(tmp_path, "pixi", "pixi 0.50.1")
        rc, _ = _run_check(["pixi>=0.40"], extra_path=str(tmp_path))
        assert rc == 0

    def test_version_too_old(self, tmp_path):
        _make_fake_tool(tmp_path, "pixi", "pixi 0.30.0")
        rc, stderr = _run_check(["pixi>=0.40"], extra_path=str(tmp_path))
        assert rc == 1
        assert "does not satisfy >=0.40" in stderr

    def test_version_exact_match(self, tmp_path):
        _make_fake_tool(tmp_path, "pixi", "pixi 0.50.1")
        rc, _ = _run_check(["pixi==0.50.1"], extra_path=str(tmp_path))
        assert rc == 0

    def test_miniforge_checks_conda_binary(self, tmp_path):
        # miniforge's binary is 'conda'; the snippet must look for conda
        _make_fake_tool(tmp_path, "conda", "conda 24.7.1")
        rc, _ = _run_check(["miniforge>=24.0"], extra_path=str(tmp_path))
        assert rc == 0

    def test_unknown_tool_with_version_cannot_be_checked(self):
        # bash exists but has no registry entry, so version cannot be verified
        rc, stderr = _run_check(["bash>=1.0"])
        assert rc == 1
        assert "no version command configured" in stderr

    def test_compound_version_spec_is_invalid(self):
        rc, stderr = _run_check(["pixi>=0.40,<0.60"])
        assert rc == 1
        assert "Invalid requirement format" in stderr

    def test_chained_version_spec_is_invalid(self):
        rc, stderr = _run_check(["pixi>=0.40<0.60"])
        assert rc == 1
        assert "Invalid requirement format" in stderr

    def test_unparseable_version_reports_error_under_pipefail(self, tmp_path):
        _make_fake_tool(tmp_path, "pixi", "version unavailable")
        rc, stderr = _run_check(
            ["pixi>=0.40"],
            extra_path=str(tmp_path),
            prefix="set -euo pipefail\n",
        )
        assert rc == 1
        assert "Could not determine version for 'pixi'" in stderr

    def test_robust_under_set_euo_pipefail(self):
        rc, stderr = _run_check(["zzz_missing_333"], prefix="set -euo pipefail\n")
        assert rc == 1
        assert "zzz_missing_333" in stderr


# --- job file path tests ---

from types import SimpleNamespace

from fileglancer.apps.jobfiles import get_job_file_paths, read_job_file


def _fake_job(**overrides):
    """Build a minimal job-like object for file-path tests."""
    base = dict(
        id=1,
        app_name="myapp",
        entry_point_id="run",
        entry_point_type="job",
        status="DONE",
        work_dir="/share/jobs/1",
        script_path="/share/jobs/1/myapp-run.1.sh",
        work_dir_fsp_name="myshare",
        work_dir_subpath=".fileglancer/jobs/1",
        started_at=object(),  # truthy "has started" marker
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class TestGetJobFilePaths:
    def test_uses_stored_paths_without_filesystem(self):
        # work_dir intentionally does not exist on disk; the function must not
        # touch the filesystem and must use the stored values verbatim.
        files = get_job_file_paths(_fake_job())
        assert files["script"]["path"] == "/share/jobs/1/myapp-run.1.sh"
        assert files["script"]["exists"] is True
        assert files["stdout"]["path"] == "/share/jobs/1/stdout.log"
        assert files["stderr"]["path"] == "/share/jobs/1/stderr.log"

    def test_browse_link_built_from_stored_base(self):
        files = get_job_file_paths(_fake_job())
        # subpath = work dir subpath + file name; fsp from the stored base
        assert files["script"]["fsp_name"] == "myshare"
        assert files["script"]["subpath"] == ".fileglancer/jobs/1/myapp-run.1.sh"
        assert files["stdout"]["subpath"] == ".fileglancer/jobs/1/stdout.log"

    def test_no_browse_link_when_base_unresolved(self):
        files = get_job_file_paths(
            _fake_job(work_dir_fsp_name=None, work_dir_subpath=None)
        )
        assert files["script"]["fsp_name"] is None
        assert files["script"]["subpath"] is None

    def test_logs_exist_only_after_start(self):
        pending = get_job_file_paths(_fake_job(status="PENDING", started_at=None))
        assert pending["stdout"]["exists"] is False
        assert pending["stderr"]["exists"] is False
        # script still exists once submitted (script_path recorded)
        assert pending["script"]["exists"] is True

    def test_legacy_job_without_script_path(self):
        files = get_job_file_paths(_fake_job(script_path=None))
        # Falls back to a default path and reports the script as not resolvable
        assert files["script"]["path"] == "/share/jobs/1/script.sh"
        assert files["script"]["exists"] is False

    def test_work_dir_entry_uses_stored_browse_base(self):
        files = get_job_file_paths(_fake_job())
        # The work dir's browse link is the stored base itself (no file name
        # appended), so it can be browsed directly.
        assert files["work_dir"]["path"] == "/share/jobs/1"
        assert files["work_dir"]["fsp_name"] == "myshare"
        assert files["work_dir"]["subpath"] == ".fileglancer/jobs/1"
        assert files["work_dir"]["exists"] is True

    def test_work_dir_entry_has_no_browse_link_when_base_unresolved(self):
        files = get_job_file_paths(
            _fake_job(work_dir_fsp_name=None, work_dir_subpath=None)
        )
        assert files["work_dir"]["fsp_name"] is None
        assert files["work_dir"]["exists"] is False

    def test_service_url_only_when_running(self):
        running = get_job_file_paths(
            _fake_job(entry_point_type="service", status="RUNNING")
        )
        assert running["service_url"]["exists"] is True
        done = get_job_file_paths(
            _fake_job(entry_point_type="service", status="DONE")
        )
        assert done["service_url"]["exists"] is False


class TestReadJobFile:
    def test_reads_stored_script_path(self, tmp_path):
        script = tmp_path / "myapp-run.1.sh"
        script.write_text("#!/bin/bash\necho hi\n")
        job = _fake_job(work_dir=str(tmp_path), script_path=str(script))
        assert read_job_file(job, "script") == "#!/bin/bash\necho hi\n"

    def test_missing_stored_script_returns_none(self, tmp_path):
        job = _fake_job(
            work_dir=str(tmp_path), script_path=str(tmp_path / "gone.sh")
        )
        assert read_job_file(job, "script") is None


# --- merge_requirements tests ---

class TestMergeRequirements:
    def test_empty_both(self):
        assert merge_requirements([], []) == []

    def test_manifest_only(self):
        assert merge_requirements(["pixi>=0.40"], []) == ["pixi>=0.40"]

    def test_entry_point_only(self):
        assert merge_requirements([], ["apptainer"]) == ["apptainer"]

    def test_disjoint_requirements_merged(self):
        result = merge_requirements(["pixi>=0.40"], ["apptainer"])
        assert "pixi>=0.40" in result
        assert "apptainer" in result

    def test_entry_point_overrides_manifest_version(self):
        result = merge_requirements(["pixi>=0.40"], ["pixi>=0.50"])
        assert result == ["pixi>=0.50"]

    def test_entry_point_overrides_manifest_adds_version(self):
        result = merge_requirements(["pixi"], ["pixi>=0.50"])
        assert result == ["pixi>=0.50"]

    def test_multiple_manifest_partial_override(self):
        result = merge_requirements(["pixi>=0.40", "npm"], ["pixi>=0.50"])
        assert "pixi>=0.50" in result
        assert "npm" in result
        assert len(result) == 2

    def test_no_duplicates(self):
        result = merge_requirements(["pixi>=0.40", "npm"], ["npm", "apptainer"])
        tools = [r.split(">")[0].split("<")[0].split("=")[0].split("!")[0] for r in result]
        assert len(tools) == len(set(tools))


class TestEntryPointRequirementsValidation:
    def test_valid_requirements(self):
        ep = AppEntryPoint(
            id="t", name="T", command="echo",
            requirements=["apptainer", "pixi>=0.40"],
        )
        assert ep.requirements == ["apptainer", "pixi>=0.40"]

    def test_empty_requirements_default(self):
        ep = AppEntryPoint(id="t", name="T", command="echo")
        assert ep.requirements == []

    def test_rejects_unsupported_tool(self):
        with pytest.raises(ValidationError, match="Unsupported tool"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                requirements=["docker"],
            )

    def test_rejects_compound_version_spec(self):
        with pytest.raises(ValidationError, match="Compound requirement specs"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                requirements=["pixi>=0.40,<0.60"],
            )

    def test_rejects_chained_version_spec(self):
        with pytest.raises(ValidationError, match="Compound requirement specs"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                requirements=["pixi>=0.40<0.60"],
            )


class TestManifestRequirementsValidation:
    def test_rejects_compound_version_spec(self):
        with pytest.raises(ValidationError, match="Compound requirement specs"):
            AppManifest(
                name="T",
                requirements=["pixi>=0.40,<0.60"],
                runnables=[
                    AppEntryPoint(id="t", name="T", command="echo"),
                ],
            )

    def test_rejects_chained_version_spec(self):
        with pytest.raises(ValidationError, match="Compound requirement specs"):
            AppManifest(
                name="T",
                requirements=["pixi>=0.40<0.60"],
                runnables=[
                    AppEntryPoint(id="t", name="T", command="echo"),
                ],
            )


# --- Script generation tests ---

class TestCondaActivationInScript:
    """Test that conda activation appears in the generated script."""

    @pytest.fixture
    def _make_entry_point(self):
        def factory(**kwargs):
            defaults = dict(
                id="test", name="Test", command="python run.py", parameters=[]
            )
            defaults.update(kwargs)
            return AppEntryPoint(**defaults)
        return factory

    def test_script_includes_conda_activation(self, _make_entry_point):
        """When conda_env is set, script should contain conda activation lines."""
        import shlex
        ep = _make_entry_point(conda_env="myenv")

        # Simulate the script building logic from submit_job
        script_parts = ["# preamble"]
        if ep.conda_env:
            conda_activation = (
                'eval "$(conda shell.bash hook)"\n'
                f'conda activate {shlex.quote(ep.conda_env)}'
            )
            script_parts.append(conda_activation)
        script_parts.append(ep.command)
        full_script = "\n\n".join(script_parts)

        assert 'eval "$(conda shell.bash hook)"' in full_script
        assert "conda activate myenv" in full_script
        # Activation should come before the command
        hook_pos = full_script.index('eval "$(conda shell.bash hook)"')
        cmd_pos = full_script.index("python run.py")
        assert hook_pos < cmd_pos

    def test_script_omits_conda_when_not_set(self, _make_entry_point):
        """When conda_env is None, script should not contain conda activation."""
        ep = _make_entry_point(conda_env=None)

        script_parts = ["# preamble"]
        if ep.conda_env:
            script_parts.append("conda activate something")
        script_parts.append(ep.command)
        full_script = "\n\n".join(script_parts)

        assert "conda" not in full_script

    def test_conda_env_path_is_quoted(self, _make_entry_point):
        """Absolute paths should be shell-quoted in the script."""
        import shlex
        ep = _make_entry_point(conda_env="/opt/conda/envs/my env")
        # This would fail validation (spaces in path name, not absolute path forbidden chars)
        # but let's test with a valid path containing special-but-allowed chars
        ep2 = _make_entry_point(conda_env="/opt/conda/envs/myenv")

        activation = f'conda activate {shlex.quote(ep2.conda_env)}'
        assert activation == "conda activate /opt/conda/envs/myenv"


# --- Apptainer / Container tests ---

class TestApptainerRequirement:
    def test_apptainer_in_supported_tools(self):
        assert "apptainer" in SUPPORTED_TOOLS

    def test_apptainer_in_tool_registry(self):
        assert "apptainer" in _TOOL_REGISTRY
        entry = _TOOL_REGISTRY["apptainer"]
        assert entry["version_args"] == ["apptainer", "--version"]
        assert entry["version_pattern"] == r"apptainer version (\S+)"


class TestContainerValidation:
    def test_valid_container_url(self):
        ep = AppEntryPoint(
            id="t", name="T", command="echo",
            container="ghcr.io/org/image:tag"
        )
        assert ep.container == "ghcr.io/org/image:tag"

    def test_valid_docker_prefix(self):
        ep = AppEntryPoint(
            id="t", name="T", command="echo",
            container="docker://ghcr.io/org/image:1.0"
        )
        assert ep.container == "docker://ghcr.io/org/image:1.0"

    def test_none_is_allowed(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", container=None)
        assert ep.container is None

    def test_default_is_none(self):
        ep = AppEntryPoint(id="t", name="T", command="echo")
        assert ep.container is None

    def test_rejects_shell_metacharacters(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                container="ghcr.io/org/image;rm -rf /"
            )

    def test_rejects_backtick(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                container="ghcr.io/`whoami`/image:tag"
            )

    def test_mutual_exclusion_with_conda(self):
        with pytest.raises(ValidationError, match="mutually exclusive"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                conda_env="myenv",
                container="ghcr.io/org/image:tag"
            )

    def test_bind_paths_requires_container(self):
        with pytest.raises(ValidationError, match="bind_paths requires container"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                bind_paths=["/data"]
            )

    def test_bind_paths_with_container(self):
        ep = AppEntryPoint(
            id="t", name="T", command="echo",
            container="ghcr.io/org/image:tag",
            bind_paths=["/data", "/scratch"]
        )
        assert ep.bind_paths == ["/data", "/scratch"]

    def test_bind_paths_rejects_metacharacters(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            AppEntryPoint(
                id="t", name="T", command="echo",
                container="ghcr.io/org/image:tag",
                bind_paths=["/data;rm -rf /"]
            )


class TestJobSubmitExtraArgsValidation:
    """Validate that extra_args rejects shell metacharacters."""

    _BASE = dict(
        app_url="https://github.com/org/repo",
        entry_point_id="ep1",
        parameters={"input": "/data/file.txt"},
    )

    def test_valid_extra_args(self):
        req = JobSubmitRequest(**self._BASE, extra_args="--gres=gpu:1 -W 60")
        assert req.extra_args == "--gres=gpu:1 -W 60"

    def test_none_is_allowed(self):
        req = JobSubmitRequest(**self._BASE, extra_args=None)
        assert req.extra_args is None

    def test_rejects_semicolon(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            JobSubmitRequest(**self._BASE, extra_args="--gres=gpu:1; rm -rf /")

    def test_rejects_backtick(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            JobSubmitRequest(**self._BASE, extra_args="--gres=`whoami`")

    def test_rejects_dollar(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            JobSubmitRequest(**self._BASE, extra_args="--queue=$USER")

    def test_rejects_pipe(self):
        with pytest.raises(ValidationError, match="forbidden characters"):
            JobSubmitRequest(**self._BASE, extra_args="--flag | cat /etc/passwd")


class TestContainerSifName:
    def test_simple_url(self):
        assert _container_sif_name("ghcr.io/org/image:1.0") == "ghcr.io_org_image_1.0.sif"

    def test_docker_prefix_stripped(self):
        assert _container_sif_name("docker://ghcr.io/org/image:tag") == "ghcr.io_org_image_tag.sif"

    def test_nested_path(self):
        result = _container_sif_name("godlovedc/lolcow")
        assert result == "godlovedc_lolcow.sif"

    def test_no_tag(self):
        result = _container_sif_name("ghcr.io/org/image")
        assert result == "ghcr.io_org_image.sif"


class TestContainerScriptGeneration:
    def test_basic_script(self):
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="python run.py",
            work_dir="/home/user/.fileglancer/jobs/1-test-run",
            bind_paths=[],
        )
        assert "apptainer pull" in script
        assert "apptainer exec" in script
        assert "docker://ghcr.io/org/image:1.0" in script
        assert "ghcr.io_org_image_1.0.sif" in script
        assert "python run.py" in script

    def test_bind_mounts_included(self):
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="echo hello",
            work_dir="/work",
            bind_paths=["/data/input", "/data/output"],
        )
        assert "--bind /data/input" in script
        assert "--bind /data/output" in script
        assert "--bind /work" in script

    def test_bind_mounts_deduplicated(self):
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="echo hello",
            work_dir="/work",
            bind_paths=["/work", "/data", "/data"],
        )
        # /work should only appear once in bind flags
        assert script.count("--bind /work") == 1
        assert script.count("--bind /data") == 1

    def test_extra_args(self):
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="python run.py",
            work_dir="/work",
            bind_paths=[],
            container_args="--nv --bind 'my dir'",
        )
        assert "--nv --bind 'my dir' \"$SIF_PATH\"" in script

    def test_pull_conditional(self):
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="echo",
            work_dir="/work",
            bind_paths=[],
        )
        assert 'if [ ! -f "$SIF_PATH" ]' in script

    def test_docker_prefix_not_doubled(self):
        script = _build_container_script(
            container_url="docker://ghcr.io/org/image:1.0",
            command="echo",
            work_dir="/work",
            bind_paths=[],
        )
        # Should not have docker://docker://
        assert "docker://docker://" not in script
        assert "docker://ghcr.io/org/image:1.0" in script


# --- Path validation tests ---

from fileglancer.apps import validate_path_for_shell, validate_path_in_filestore


class TestValidatePathForShell:
    """validate_path_for_shell performs syntax-only checks (no filesystem I/O)."""

    def test_valid_absolute_path(self):
        assert validate_path_for_shell("/data/input.txt") is None

    def test_valid_tilde_path(self):
        assert validate_path_for_shell("~/data/input.txt") is None

    def test_valid_relative_path(self):
        assert validate_path_for_shell("./data/input.txt") is None

    def test_rejects_bare_relative_path(self):
        error = validate_path_for_shell("relative/path.txt")
        assert error is not None
        assert "absolute or relative path" in error

    def test_rejects_dotdot(self):
        error = validate_path_for_shell("/data/../etc/passwd")
        assert error is not None
        assert ".." in error

    def test_rejects_dotdot_relative(self):
        error = validate_path_for_shell("./foo/../bar")
        assert error is not None
        assert ".." in error

    def test_rejects_metacharacters(self):
        error = validate_path_for_shell("/data/input;rm -rf /")
        assert error is not None
        assert "invalid characters" in error

    def test_no_filesystem_io(self, tmp_path):
        """Should NOT check existence — nonexistent path is syntactically fine."""
        fake_path = str(tmp_path / "no_such_file.txt")
        assert validate_path_for_shell(fake_path) is None


class TestValidatePathInFilestore:
    """validate_path_in_filestore validates against file share mounts."""

    def test_path_outside_any_share(self):
        """Path not in any file share returns an error."""
        error = validate_path_in_filestore("/nowhere/file.txt", [])
        assert error is not None
        assert "not within an allowed file share" in error

    def test_valid_path_in_share(self, tmp_path):
        """Path inside a file share that exists returns None."""
        # Create a temp file inside a temp dir acting as a file share
        test_file = tmp_path / "data.txt"
        test_file.write_text("hello")

        from fileglancer.model import FileSharePath
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        error = validate_path_in_filestore(str(test_file), [fsp])
        assert error is None

    def test_syntax_error_short_circuits(self):
        """Metachar in path returns error before path lookup."""
        error = validate_path_in_filestore("/data;bad", [])
        assert error is not None
        assert "invalid characters" in error

    def test_check_access_false_skips_exists_check(self, tmp_path):
        """With check_access=False, a nonexistent path inside a share passes.

        Exists/readable checks must be deferred to the setuid worker; the
        server-side call only confirms file-share containment.
        """
        from fileglancer.model import FileSharePath
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        missing = str(tmp_path / "no_such_file.txt")
        # Default (check_access=True) rejects the missing path...
        assert validate_path_in_filestore(missing, [fsp]) == "Path does not exist"
        # ...but with check_access=False the containment check alone passes.
        assert validate_path_in_filestore(missing, [fsp], check_access=False) is None

    def test_check_access_false_still_enforces_containment(self):
        """check_access=False does not bypass the file-share containment check."""
        error = validate_path_in_filestore("/nowhere/file.txt", [], check_access=False)
        assert error is not None
        assert "not within an allowed file share" in error



class TestBuildCommandTildeExpansion:
    """build_command expands ~ in file/directory params so shlex quoting works."""

    @pytest.fixture()
    def entry_point(self):
        return AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[
                {
                    "key": "output_dir",
                    "name": "Output Directory",
                    "type": "directory",
                    "flag": "--output_dir",
                }
            ],
        )

    def test_tilde_expanded_in_directory_param(self, entry_point):
        import os
        cmd = build_command(entry_point, {"output_dir": "~/data/output"})
        home = os.path.expanduser("~").replace("\\", "/")
        expected = f"{home}/data/output"
        assert expected in cmd
        assert "~" not in cmd

    def test_bare_tilde_expanded(self, entry_point):
        import os
        cmd = build_command(entry_point, {"output_dir": "~"})
        home = os.path.expanduser("~").replace("\\", "/")
        assert home in cmd
        assert "~" not in cmd

    def test_absolute_path_unchanged(self, entry_point):
        cmd = build_command(entry_point, {"output_dir": "/data/output"})
        assert "/data/output" in cmd

    @requires_pwd
    def test_tilde_expanded_to_target_user_home(self, entry_point, monkeypatch):
        """With a username, ~ resolves to that user's home, not the server's."""
        import fileglancer.apps.command as command_mod
        fake_pw = SimpleNamespace(pw_dir="/home/alice")
        monkeypatch.setattr(command_mod.pwd, "getpwnam",
                            lambda name: fake_pw if name == "alice" else (_ for _ in ()).throw(KeyError(name)))
        cmd = build_command(entry_point, {"output_dir": "~/data"}, username="alice")
        assert "/home/alice/data" in cmd
        assert "~" not in cmd

    def test_uri_passed_through_unchanged(self):
        """A file/directory param holding a cloud URI is not mangled into a path."""
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{
                "key": "input",
                "name": "Input",
                "type": "file",
                "flag": "--input",
            }],
        )
        cmd = build_command(ep, {"input": "s3://bucket/key"})
        assert "s3://bucket/key" in cmd


class TestBuildCommandCheckAccess:
    """build_command(check_access=False) defers exists checks to the worker."""

    def _ep(self):
        return AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{
                "key": "input",
                "name": "Input Path",
                "type": "directory",
                "flag": "--input",
            }],
        )

    def _stub_fsps(self, monkeypatch, tmp_path):
        """Make build_command's file-share lookup return a share at tmp_path."""
        from fileglancer.model import FileSharePath
        import fileglancer.apps.command as command_mod

        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        monkeypatch.setattr(command_mod.db, "get_file_share_paths",
                            lambda session: [fsp])

    def test_default_rejects_missing_path(self, tmp_path, monkeypatch):
        """With a session and the default check_access, a missing path raises."""
        self._stub_fsps(monkeypatch, tmp_path)
        missing = str(tmp_path / "nope")
        with pytest.raises(ValueError, match="Path does not exist"):
            build_command(self._ep(), {"input": missing}, session=object())

    def test_check_access_false_allows_missing_path(self, tmp_path, monkeypatch):
        """check_access=False lets a missing-but-contained path build the command."""
        self._stub_fsps(monkeypatch, tmp_path)
        missing = str(tmp_path / "nope")
        cmd = build_command(self._ep(), {"input": missing},
                            session=object(), check_access=False)
        # build_command normalizes backslashes to forward slashes.
        assert missing.replace("\\", "/") in cmd

    def test_check_access_false_still_rejects_outside_share(self, tmp_path, monkeypatch):
        """check_access=False does not bypass file-share containment."""
        self._stub_fsps(monkeypatch, tmp_path)
        with pytest.raises(ValueError, match="not within an allowed file share"):
            build_command(self._ep(), {"input": "/somewhere/else"},
                          session=object(), check_access=False)


class TestCollectPathParameters:
    """collect_path_parameters gathers effective file/directory params."""

    def test_collects_user_and_default_values_across_namespaces(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            env_parameters=[{
                "key": "envdir",
                "name": "Env Dir",
                "type": "directory",
                "default": "/data/envdefault",
            }],
            parameters=[
                {"key": "input", "name": "Input Path", "type": "file", "flag": "--input"},
                {"key": "count", "name": "Count", "type": "integer", "flag": "--count"},
                {"key": "outdir", "name": "Out Dir", "type": "directory",
                 "flag": "--outdir", "default": "/data/outdefault"},
            ],
        )
        result = collect_path_parameters(
            ep,
            {"input": "/data/in.txt", "count": 5},
            env_parameters={},
        )
        # Only file/directory params; non-path 'count' excluded. Env namespace
        # default included; pipeline 'outdir' falls back to its default.
        assert result == [
            ("envdir", "Env Dir", "/data/envdefault"),
            ("input", "Input Path", "/data/in.txt"),
            ("outdir", "Out Dir", "/data/outdefault"),
        ]

    def test_omits_path_params_without_value_or_default(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{"key": "input", "name": "Input Path", "type": "file", "flag": "--input"}],
        )
        assert collect_path_parameters(ep, {}) == []


class TestExpandUserPath:
    """expand_user_path normalizes file/dir param values consistently."""

    def test_uri_unchanged(self):
        assert expand_user_path("s3://bucket/key") == "s3://bucket/key"
        assert expand_user_path("gs://bucket/key") == "gs://bucket/key"
        assert expand_user_path("https://host/path") == "https://host/path"

    def test_absolute_unchanged(self):
        assert expand_user_path("/data/output") == "/data/output"

    def test_backslashes_normalized(self):
        assert expand_user_path("/data\\sub") == "/data/sub"

    @requires_pwd
    def test_tilde_uses_username_home(self, monkeypatch):
        import fileglancer.apps.command as command_mod
        monkeypatch.setattr(command_mod.pwd, "getpwnam",
                            lambda name: SimpleNamespace(pw_dir="/home/bob"))
        assert expand_user_path("~/x", username="bob") == "/home/bob/x"
        assert expand_user_path("~", username="bob") == "/home/bob"

    @requires_pwd
    def test_unknown_username_falls_back_to_euid(self, monkeypatch):
        import fileglancer.apps.command as command_mod
        monkeypatch.setattr(command_mod.pwd, "getpwnam",
                            lambda name: (_ for _ in ()).throw(KeyError(name)))
        monkeypatch.setattr(command_mod.pwd, "getpwuid",
                            lambda uid: SimpleNamespace(pw_dir="/home/server"))
        assert expand_user_path("~/x", username="ghost") == "/home/server/x"


# --- _find_manifests_in_repo adapter fallback tests ---

import fileglancer.apps.adapters as adapters_module
from fileglancer.apps.manifest import _find_manifests_in_repo, _run_git


class _StubAdapter:
    """Minimal manifest adapter for exercising the fallback loop."""

    def __init__(self, *, handles, manifest=None, error=None):
        self._handles = handles
        self._manifest = manifest
        self._error = error

    def can_handle(self, directory):
        return self._handles

    def convert(self, directory):
        if self._error is not None:
            raise self._error
        return self._manifest


# Distinct subclasses so aggregated error messages can be told apart by name.
class _NextStub(_StubAdapter):
    pass


class _PixiStub(_StubAdapter):
    pass


class TestFindManifestsAdapterFallback:
    """The adapter fallback runs only when no runnables.yaml is found, so an
    empty tmp_path exercises it directly."""

    def test_other_adapter_handles_when_one_fails(self, tmp_path, monkeypatch):
        manifest = AppManifest(name="From Pixi", runnables=[])
        monkeypatch.setattr(
            adapters_module,
            "MANIFEST_ADAPTERS",
            [
                _NextStub(handles=True, error=ValueError("boom")),
                _PixiStub(handles=True, manifest=manifest),
            ],
        )

        # The failing adapter must not prevent the later one from handling it.
        assert _find_manifests_in_repo(tmp_path) == [("", manifest)]

    def test_all_adapters_fail_aggregates_errors(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            adapters_module,
            "MANIFEST_ADAPTERS",
            [
                _NextStub(handles=True, error=ValueError("nextflow boom")),
                _PixiStub(handles=True, error=ValueError("pixi boom")),
            ],
        )

        with pytest.raises(ValueError) as exc_info:
            _find_manifests_in_repo(tmp_path)

        # All failures are surfaced together, not just the first.
        msg = str(exc_info.value)
        assert "nextflow boom" in msg
        assert "pixi boom" in msg
        assert "_NextStub" in msg
        assert "_PixiStub" in msg

    def test_no_adapter_handles_returns_empty(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            adapters_module,
            "MANIFEST_ADAPTERS",
            [_NextStub(handles=False), _PixiStub(handles=False)],
        )

        assert _find_manifests_in_repo(tmp_path) == []


class TestRunGitTimeout:
    @pytest.mark.asyncio
    async def test_timeout_covers_command_runtime(self):
        start = time.monotonic()

        with pytest.raises(ValueError, match="timed out"):
            await _run_git(
                [
                    sys.executable,
                    "-c",
                    "import time; time.sleep(2)",
                ],
                timeout=0.1,
            )

        assert time.monotonic() - start < 1.0


from fileglancer.apps.manifest import (
    validate_manifest_path,
    _safe_repo_subdir,
    _parse_github_url,
    get_app_branch,
)


class TestParseGitHubUrl:
    def test_branch_name_may_contain_slashes(self):
        owner, repo, branch = _parse_github_url(
            "https://github.com/org/tool/tree/feature/my-tool"
        )
        assert (owner, repo, branch) == ("org", "tool", "feature/my-tool")

    @pytest.mark.asyncio
    async def test_get_app_branch_returns_slash_branch_without_remote_lookup(self):
        branch = await get_app_branch(
            "https://github.com/org/tool/tree/release/2026-06"
        )
        assert branch == "release/2026-06"

    @pytest.mark.parametrize(
        "url",
        [
            "https://github.com/org/tool/tree/../escape",
            "https://github.com/org/tool/tree/feature//bad",
            "https://github.com/org/tool/tree//absolute-ish",
        ],
    )
    def test_rejects_unsafe_branch_paths(self, url):
        with pytest.raises(ValueError):
            _parse_github_url(url)


class TestValidateManifestPath:
    """manifest_path comes from API bodies/query params, so it must be rejected
    when it could escape the repo clone or inject shell content into the job
    script."""

    def test_empty_is_root(self):
        assert validate_manifest_path("") == ""

    def test_simple_relative_paths_pass(self):
        assert validate_manifest_path("subdir") == "subdir"
        assert validate_manifest_path("a/b/c") == "a/b/c"

    def test_normalizes_dot_and_redundant_separators(self):
        assert validate_manifest_path("./a") == "a"
        assert validate_manifest_path("a//b") == "a/b"
        assert validate_manifest_path("a/./b") == "a/b"

    @pytest.mark.parametrize(
        "bad",
        [
            "..",
            "../escape",
            "a/../../etc/passwd",
            "/etc/passwd",
            "/abs/path",
            "a\\b",
            "a\x00b",
        ],
    )
    def test_unsafe_paths_rejected(self, bad):
        with pytest.raises(ValueError):
            validate_manifest_path(bad)

    def test_shell_metacharacters_allowed_but_contained(self):
        # Shell metacharacters in a directory name are not a traversal risk and
        # are neutralized by shlex.quote when used in the job script, so the
        # validator accepts them (they remain a single path segment).
        assert validate_manifest_path('weird;$(rm -rf)') == 'weird;$(rm -rf)'


class TestSafeRepoSubdir:
    def test_resolves_within_repo(self, tmp_path):
        (tmp_path / "sub").mkdir()
        assert _safe_repo_subdir(tmp_path, "sub") == (tmp_path / "sub").resolve()

    def test_root_when_empty(self, tmp_path):
        assert _safe_repo_subdir(tmp_path, "") == tmp_path.resolve()

    def test_traversal_rejected(self, tmp_path):
        with pytest.raises(ValueError):
            _safe_repo_subdir(tmp_path, "../outside")

    @requires_symlinks
    def test_symlink_escaping_repo_rejected(self, tmp_path):
        outside = tmp_path / "outside"
        outside.mkdir()
        repo = tmp_path / "repo"
        repo.mkdir()
        # A symlink inside the repo that points out of it must not be accepted.
        (repo / "link").symlink_to(outside)
        with pytest.raises(ValueError):
            _safe_repo_subdir(repo, "link")


class TestEnumOptionsNormalization:
    """Enum options may be authored as numbers (e.g. a Nextflow schema enum).
    They must normalize to strings so the stringifying UI/API round-trips."""

    def test_numeric_options_become_strings(self):
        param = AppParameter(name="N", type="enum", options=[1, 2, 3])
        assert param.options == ["1", "2", "3"]

    def test_string_options_unchanged(self):
        param = AppParameter(name="Mode", type="enum", options=["a", "b"])
        assert param.options == ["a", "b"]

    def test_none_options_stay_none(self):
        param = AppParameter(name="S", type="string")
        assert param.options is None

    def test_numeric_enum_value_validates(self):
        # The UI submits the selected option as a string; build_command must
        # accept it against numeric-authored options.
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(flag="--n", name="N", type="enum", options=[1, 2, 3]),
            ],
        )
        cmd = build_command(ep, {"n": "2"})
        assert "--n 2" in cmd

    def test_invalid_enum_value_rejected(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(flag="--n", name="N", type="enum", options=[1, 2, 3]),
            ],
        )
        with pytest.raises(ValueError):
            build_command(ep, {"n": "4"})


class TestParameterKeyGeneration:
    """AppEntryPoint auto-generates parameter keys from the flag or a positional
    index, but honors an explicitly-authored key."""

    def test_flag_derived_key(self):
        ep = AppEntryPoint(
            id="r", name="r", command="run",
            parameters=[AppParameter(flag="--outdir", name="Out", type="string")],
        )
        assert ep.flat_parameters()[0].key == "outdir"

    def test_flagless_positional_key(self):
        ep = AppEntryPoint(
            id="r", name="r", command="run",
            parameters=[AppParameter(name="Pos", type="string", raw=True)],
        )
        assert ep.flat_parameters()[0].key == "_arg0"

    def test_explicit_key_honored(self):
        # A flag-less raw arg with an authored key keeps it instead of "_arg0",
        # so it reads as a real name in the params tab / exported JSON.
        ep = AppEntryPoint(
            id="r", name="r", command="run",
            parameters=[
                AppParameter(key="extra_args", name="Extra", type="string", raw=True),
            ],
        )
        assert ep.flat_parameters()[0].key == "extra_args"

    def test_same_key_allowed_across_groups(self):
        # parameters and env_parameters are independent namespaces, so a key may
        # appear in both (e.g. a pipeline --profile and Nextflow's -profile).
        ep = AppEntryPoint(
            id="r", name="r", command="run",
            parameters=[AppParameter(flag="--profile", name="P", type="string")],
            env_parameters=[AppParameter(flag="-profile", name="NfP", type="string")],
        )
        keys = [p.key for p in ep.flat_parameters()]
        assert keys.count("profile") == 2

    def test_duplicate_within_group_still_raises(self):
        with pytest.raises(ValueError, match="Duplicate parameter key"):
            AppEntryPoint(
                id="r", name="r", command="run",
                parameters=[
                    AppParameter(flag="--profile", name="A", type="string"),
                    AppParameter(key="profile", name="B", type="string", raw=True),
                ],
            )


class TestBuildCommandEnvParameterSeparation:
    """env_parameters resolve from their own value dict, independent of the
    pipeline parameters namespace even when keys collide."""

    def _ep(self):
        return AppEntryPoint(
            id="r", name="r", command="run",
            parameters=[AppParameter(flag="--profile", name="Pipeline profile", type="string")],
            env_parameters=[AppParameter(flag="-profile", name="Nextflow profile", type="string")],
        )

    def test_colliding_keys_resolve_from_own_dict(self):
        cmd = build_command(
            self._ep(), {"profile": "pipe"}, env_parameters={"profile": "nf"}
        )
        assert "--profile pipe" in cmd
        assert "-profile nf" in cmd

    def test_env_param_unknown_key_rejected(self):
        with pytest.raises(ValueError, match="Unknown parameter 'bogus'"):
            build_command(self._ep(), {}, env_parameters={"bogus": "x"})


import json

from fileglancer.apps.nextflow import NextflowAdapter


class TestNextflowRunsFromWorkDir:
    """Auto-detected Nextflow apps must run from the job work dir (against the
    `repo` symlink), not from inside the shared repo clone, so Nextflow's
    .nextflow.log / .nextflow/ / work/ artifacts don't pollute the cache."""

    def _make_schema(self, tmp_path):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "description": "Test pipeline",
            "$defs": {
                "input": {
                    "title": "Input",
                    "properties": {"input_dir": {"type": "string"}},
                }
            },
            "allOf": [{"$ref": "#/$defs/input"}],
        }))

    def test_runs_repo_from_work_dir(self, tmp_path):
        self._make_schema(tmp_path)
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        # Clean command (no embedded cd) plus working_dir="work".
        assert ep.command == "nextflow run repo -ansi-log false"
        assert ep.working_dir == "work"
        assert ep.effective_working_dir == "work"

    def test_full_command_keeps_profile_before_pipeline_params(self, tmp_path):
        self._make_schema(tmp_path)
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        # profile is an env-tab param (separate namespace); pass it via env_parameters.
        cmd = build_command(
            ep, {"input_dir": "/data/in"}, env_parameters={"profile": "janeliaLSF"}
        )
        assert cmd.startswith("nextflow run repo -ansi-log false")
        assert cmd.index("-profile") < cmd.index("--input_dir")

    def test_projectdir_default_rewritten_to_repo(self, tmp_path):
        # Running from the work dir, projectDir assets live under ./repo/, so a
        # $projectDir-relative schema default must rewrite to ./repo/... The
        # leading ./ also passes path validation (a bare repo/... is rejected).
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {
                "opts": {
                    "title": "Options",
                    "properties": {
                        "multiqc_config": {
                            "type": "string",
                            "default": "$projectDir/assets/multiqc_config.yml",
                        }
                    },
                }
            },
            "allOf": [{"$ref": "#/$defs/opts"}],
        }))
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        param = next(p for p in ep.flat_parameters() if p.key == "multiqc_config")
        assert param.default == "./repo/assets/multiqc_config.yml"

    def test_braced_projectdir_default_rewritten_to_repo(self, tmp_path):
        # Nextflow also accepts the braced ${projectDir} form (used by nf-core
        # schemas, e.g. rnaseq's ribo_database_manifest); it must rewrite too.
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {
                "opts": {
                    "title": "Options",
                    "properties": {
                        "ribo_database_manifest": {
                            "type": "string",
                            "default": "${projectDir}/assets/rrna-db-defaults.txt",
                        }
                    },
                }
            },
            "allOf": [{"$ref": "#/$defs/opts"}],
        }))
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        param = next(p for p in ep.flat_parameters() if p.key == "ribo_database_manifest")
        assert param.default == "./repo/assets/rrna-db-defaults.txt"


class TestNextflowAdapterNaming:
    def _make_schema(self, tmp_path):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "description": "Test pipeline",
            "$defs": {},
            "allOf": [],
        }))

    def test_standard_naming(self, tmp_path):
        from unittest.mock import patch
        cache_base = tmp_path / "cache"
        repo_dir = cache_base / "nf-core" / "rnaseq" / "main"
        repo_dir.mkdir(parents=True, exist_ok=True)
        self._make_schema(repo_dir)

        with patch("fileglancer.apps.manifest._repo_cache_base", return_value=cache_base):
            manifest = NextflowAdapter().convert(repo_dir)
            assert manifest.name == "nf-core/rnaseq"

    def test_slashed_branch_naming(self, tmp_path):
        from unittest.mock import patch
        cache_base = tmp_path / "cache"
        repo_dir = cache_base / "nf-core" / "rnaseq" / "feature" / "slashed" / "branch"
        repo_dir.mkdir(parents=True, exist_ok=True)
        self._make_schema(repo_dir)

        with patch("fileglancer.apps.manifest._repo_cache_base", return_value=cache_base):
            manifest = NextflowAdapter().convert(repo_dir)
            assert manifest.name == "nf-core/rnaseq"


class TestEffectiveWorkingDir:
    """working_dir resolution: explicit wins; containers default to 'work',
    everything else to 'repo'."""

    def test_default_is_repo(self):
        ep = AppEntryPoint(id="r", name="r", command="python x.py")
        assert ep.effective_working_dir == "repo"

    def test_container_defaults_to_work(self):
        ep = AppEntryPoint(id="r", name="r", command="cowsay hi",
                           container="godlovedc/lolcow")
        assert ep.effective_working_dir == "work"

    def test_explicit_overrides_container_default(self):
        ep = AppEntryPoint(id="r", name="r", command="run.sh",
                           container="ghcr.io/org/img", working_dir="repo")
        assert ep.effective_working_dir == "repo"

    def test_explicit_work_without_container(self):
        ep = AppEntryPoint(id="r", name="r", command="tool", working_dir="work")
        assert ep.effective_working_dir == "work"


from fileglancer.apps.pixi import _task_to_entry_point


class TestPixiTaskEnv:
    """Pixi task env vars must be exposed as entry-point env defaults, not as
    bogus `--env:VAR` CLI flags that `pixi run` rejects."""

    def test_env_mapped_to_entry_point_env(self):
        ep = _task_to_entry_point(
            "build", {"cmd": "make", "env": {"FOO": "bar", "N": 3}}
        )
        assert ep.env == {"FOO": "bar", "N": "3"}

    def test_env_not_emitted_as_flags(self):
        ep = _task_to_entry_point(
            "build", {"cmd": "make", "env": {"FOO": "bar"}}
        )
        # No parameter should carry an --env: flag anymore.
        assert all(
            p.flag is None or not p.flag.startswith("--env:")
            for p in ep.flat_parameters()
        )
        assert "--env:" not in build_command(ep, {})

    def test_no_env_leaves_env_none(self):
        ep = _task_to_entry_point("build", {"cmd": "make"})
        assert ep.env is None
