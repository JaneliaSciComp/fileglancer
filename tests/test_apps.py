"""Tests for apps module: miniforge/apptainer requirements, conda_env, and container support."""

import os
import shlex
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
    _container_bind_paths,
    _SERVICE_PORT_HELPER,
    _build_service_url_publisher,
    build_command,
    collect_creatable_dirs,
    collect_path_parameters,
    expand_user_path,
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

from fileglancer.apps.jobfiles import get_job_file_paths, read_job_file, get_service_phase


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

    def test_small_log_returned_in_full(self, tmp_path):
        (tmp_path / "stdout.log").write_text("line 1\nline 2\n")
        job = _fake_job(work_dir=str(tmp_path))
        assert read_job_file(job, "stdout") == "line 1\nline 2\n"

    def test_oversized_log_is_tail_truncated(self, tmp_path):
        from fileglancer.apps.jobfiles import _MAX_JOB_FILE_BYTES
        # One byte per line so line boundaries are easy to reason about.
        big = ("A\n" * (_MAX_JOB_FILE_BYTES // 2)) + ("TAIL_MARKER\n" * 5)
        (tmp_path / "stderr.log").write_text(big)
        job = _fake_job(work_dir=str(tmp_path))
        content = read_job_file(job, "stderr")
        # Truncation marker present, size bounded, and the trailing content kept.
        assert "earlier bytes omitted" in content
        assert "TAIL_MARKER" in content
        # Marker header plus at most the cap of tail bytes — nowhere near the
        # full file, and safely under the 64 MB IPC limit.
        assert len(content.encode()) <= _MAX_JOB_FILE_BYTES + 1024


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


class TestManifestRepoUrlValidation:
    _RUN = [AppEntryPoint(id="t", name="T", command="echo")]

    def test_valid_github_repo_url(self):
        m = AppManifest(name="T", repo_url="https://github.com/org/code",
                        runnables=self._RUN)
        assert m.repo_url == "https://github.com/org/code"

    def test_none_is_allowed(self):
        assert AppManifest(name="T", runnables=self._RUN).repo_url is None

    def test_rejects_non_github_url(self):
        with pytest.raises(ValidationError, match="GitHub repository URL"):
            AppManifest(name="T", repo_url="https://gitlab.com/org/code",
                        runnables=self._RUN)

    def test_rejects_garbage(self):
        with pytest.raises(ValidationError, match="GitHub repository URL"):
            AppManifest(name="T", repo_url="not a url", runnables=self._RUN)


class TestManifestRunnablesRequired:
    def test_rejects_empty_runnables(self):
        with pytest.raises(ValidationError):
            AppManifest(name="T", runnables=[])

    def test_accepts_one_runnable(self):
        m = AppManifest(name="T",
                        runnables=[AppEntryPoint(id="t", name="T", command="echo")])
        assert len(m.runnables) == 1


class TestParameterFlagValidation:
    """Flags are emitted into the job script unquoted (and the Nextflow
    adapter derives them from schema property names), so they must be
    constrained to a conservative CLI-flag shape."""

    @pytest.mark.parametrize("flag", [
        "-n", "-1", "--outdir", "-profile", "--long-name",
        "--dotted.name", "--under_score",
    ])
    def test_accepts_conventional_flags(self, flag):
        p = AppParameter(flag=flag, name="P", type="string")
        assert p.flag == flag

    @pytest.mark.parametrize("flag", [
        "--out;rm -rf /", "--a b", "--$(whoami)", "--x'y", '--x"y',
        "---triple", "--", "-", "notaflag", "--=x", "--a|b",
    ])
    def test_rejects_shell_significant_or_malformed_flags(self, flag):
        with pytest.raises(ValidationError):
            AppParameter(flag=flag, name="P", type="string")


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
    """extra_args are shlex-split into argv tokens and exec'd (no shell) by the
    scheduler, so shell metacharacters are safe; only unparseable strings and
    NUL bytes are rejected."""

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

    def test_lsf_resource_string_allowed(self):
        # LSF -R strings use '>', '[' and ']' — exactly what the UI placeholder
        # suggests — so they must be accepted.
        req = JobSubmitRequest(
            **self._BASE, extra_args='-P proj -R "select[mem>8000]"')
        assert req.extra_args == '-P proj -R "select[mem>8000]"'

    @pytest.mark.parametrize("value", [
        "--gres=gpu:1; rm -rf /",
        "--gres=`whoami`",
        "--queue=$USER",
        "--flag | cat /etc/passwd",
    ])
    def test_shell_metacharacters_allowed_as_literal_argv(self, value):
        # These are safe: shlex.split turns them into literal argv tokens
        # passed to the scheduler via exec, so no shell interprets them.
        req = JobSubmitRequest(**self._BASE, extra_args=value)
        assert req.extra_args == value

    def test_rejects_unbalanced_quotes(self):
        with pytest.raises(ValidationError, match="could not be parsed"):
            JobSubmitRequest(**self._BASE, extra_args='-R "unterminated')

    def test_rejects_nul(self):
        with pytest.raises(ValidationError, match="NUL"):
            JobSubmitRequest(**self._BASE, extra_args="--flag\x00")


class TestBuildResourceSpecExtraArgs:
    """extra_args strings are tokenized (not wrapped as one argv element)."""

    def _settings(self):
        from fileglancer.settings import Settings
        return Settings(db_url="sqlite://", file_share_mounts=[], cli_mode=True)

    def test_string_is_split_into_tokens(self):
        from fileglancer.apps.jobs import _build_resource_spec
        ep = AppEntryPoint(id="t", name="T", command="echo")
        spec = _build_resource_spec(
            ep, {"extra_args": '-P proj -R "select[mem>8000]"'}, self._settings())
        assert spec.extra_args == ["-P", "proj", "-R", "select[mem>8000]"]

    def test_empty_string_yields_no_args(self):
        from fileglancer.apps.jobs import _build_resource_spec
        ep = AppEntryPoint(id="t", name="T", command="echo")
        spec = _build_resource_spec(ep, {"extra_args": ""}, self._settings())
        assert spec.extra_args == []


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
        # Pull without populating Apptainer's own cache, so the SIF we keep is
        # the only copy (no multi-GB duplicate under ~/.apptainer/cache).
        assert "apptainer pull --disable-cache" in script
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

    def test_cache_dir_expands_tilde_before_quoting(self):
        cache_dir = "~/apptainer cache"
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="python run.py",
            work_dir="/work",
            bind_paths=[],
            cache_dir=cache_dir,
        )

        expected = shlex.quote(os.path.expanduser(cache_dir))
        assert f"APPTAINER_CACHE_DIR={expected}" in script
        assert "APPTAINER_CACHE_DIR='~/" not in script

    def test_cache_dir_uses_target_user_home(self, monkeypatch):
        def fake_expanduser(path):
            return "/home/alice" if path == "~alice" else path

        monkeypatch.setattr(os.path, "expanduser", fake_expanduser)
        script = _build_container_script(
            container_url="ghcr.io/org/image:1.0",
            command="python run.py",
            work_dir="/work",
            bind_paths=[],
            cache_dir="~/apptainer cache",
            username="alice",
        )

        assert "APPTAINER_CACHE_DIR='/home/alice/apptainer cache'" in script

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


class TestContainerBindPaths:
    """_container_bind_paths decides what host paths get mounted into a container."""

    def _ep(self, **kwargs):
        defaults = dict(id="t", name="T", command="echo",
                        container="ghcr.io/org/image:tag")
        defaults.update(kwargs)
        return AppEntryPoint(**defaults)

    def test_directory_param_bound_directly(self):
        ep = self._ep(parameters=[
            AppParameter(flag="--data", name="Data", type="directory")
        ])
        binds = _container_bind_paths(ep, {"data": "/groups/lab/data"}, None, None, "/cache/repo")
        assert "/groups/lab/data" in binds

    def test_file_param_binds_parent_dir(self):
        ep = self._ep(parameters=[
            AppParameter(flag="--in", name="In", type="file")
        ])
        binds = _container_bind_paths(ep, {"in": "/groups/lab/x.tif"}, None, None, "/cache/repo")
        assert "/groups/lab" in binds
        assert "/groups/lab/x.tif" not in binds

    def test_cloud_uri_and_relative_skipped(self):
        ep = self._ep(parameters=[
            AppParameter(flag="--a", name="A", type="directory"),
            AppParameter(flag="--b", name="B", type="directory"),
        ])
        binds = _container_bind_paths(
            ep, {"a": "s3://bucket/key", "b": "./rel"}, None, None, "/cache/repo"
        )
        assert binds == []  # neither is a bind-mountable absolute local path

    def test_explicit_bind_paths_included(self):
        ep = self._ep(bind_paths=["/shared/ref", "/scratch"])
        binds = _container_bind_paths(ep, {}, None, None, "/cache/repo")
        assert "/shared/ref" in binds and "/scratch" in binds

    def test_repo_bound_only_when_running_from_clone(self):
        # Container default is working_dir=work → repo NOT bound.
        work_ep = self._ep()
        assert "work" == work_ep.effective_working_dir
        assert "/cache/repo" not in _container_bind_paths(work_ep, {}, None, None, "/cache/repo")

        # Opt into manifest or repo → the cached clone is bound so the repo
        # symlink resolves.
        for wd in ("manifest", "repo"):
            ep = self._ep(working_dir=wd)
            assert "/cache/repo" in _container_bind_paths(ep, {}, None, None, "/cache/repo")

    def test_file_directory_default_is_bound(self):
        # A file/directory param the user did not override still contributes its
        # default path to the binds (the command references it, so it must be
        # mounted).
        ep = self._ep(parameters=[
            AppParameter(flag="--ref", name="Ref", type="directory",
                         default="/groups/lab/reference"),
        ])
        binds = _container_bind_paths(ep, {}, None, None, "/cache/repo")
        assert "/groups/lab/reference" in binds

    def test_env_tab_file_param_is_bound(self):
        # A file/directory parameter declared in the env tab has its value in
        # env_parameters, not parameters; it must still be bound.
        ep = self._ep(env_parameters=[
            AppParameter(flag="--cfg", name="Cfg", type="file"),
        ])
        binds = _container_bind_paths(
            ep, {}, {"cfg": "/groups/lab/config/app.yaml"}, None, "/cache/repo")
        assert "/groups/lab/config" in binds


# --- Service port / URL tests (FG_SERVICE_PORT + auto_url) ---

class TestServicePortHelper:
    """The preamble helper Fileglancer injects for service-type jobs."""

    def test_helper_exports_port_hostname_and_token(self):
        assert "export FG_SERVICE_PORT=" in _SERVICE_PORT_HELPER
        assert "export FG_HOSTNAME=" in _SERVICE_PORT_HELPER
        assert "export FG_SERVICE_TOKEN=" in _SERVICE_PORT_HELPER

    def test_helper_mints_a_urlsafe_token(self):
        import re
        script = _SERVICE_PORT_HELPER + '\necho "$FG_SERVICE_TOKEN"'
        result = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        token = result.stdout.strip().splitlines()[-1]
        # Non-empty and URL-safe (hex), so no encoding is needed in the URL.
        assert re.fullmatch(r"[0-9a-f]{16,}", token), token

    def test_helper_is_valid_bash(self):
        # The generated snippet must at least parse as bash.
        result = subprocess.run(
            ["bash", "-n", "-c", _SERVICE_PORT_HELPER],
            capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stderr

    def test_helper_picks_a_free_port_at_runtime(self):
        # Run the helper and confirm FG_SERVICE_PORT is a plausible TCP port.
        script = _SERVICE_PORT_HELPER + '\necho "$FG_SERVICE_PORT"'
        result = subprocess.run(
            ["bash", "-c", script], capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stderr
        port = int(result.stdout.strip().splitlines()[-1])
        assert 1 <= port <= 65535

    def test_helper_robust_under_set_euo_pipefail(self):
        # A deployment may prepend `set -euo pipefail` via script_prologue; the
        # helper must still allocate a port and not abort the job.
        script = "set -euo pipefail\n" + _SERVICE_PORT_HELPER + '\necho "$FG_SERVICE_PORT"'
        result = subprocess.run(
            ["bash", "-c", script], capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stderr
        assert int(result.stdout.strip().splitlines()[-1]) >= 1


class TestServiceAutoUrl:
    """auto_url is service-only and drives Fileglancer to publish the URL file."""

    def test_auto_url_defaults_false(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", type="service")
        assert ep.auto_url is False

    def test_auto_url_allowed_on_service(self):
        ep = AppEntryPoint(id="t", name="T", command="echo",
                           type="service", auto_url=True)
        assert ep.auto_url is True

    def test_auto_url_rejected_on_job(self):
        with pytest.raises(ValidationError, match="auto_url is only valid for service"):
            AppEntryPoint(id="t", name="T", command="echo",
                          type="job", auto_url=True)


class TestServiceProxyOptOut:
    """service_proxy lets a service that cannot work behind the HTTPS proxy keep
    its direct URL. It defaults on, so opting out is always explicit."""

    def test_defaults_true(self):
        ep = AppEntryPoint(id="t", name="T", command="echo", type="service")
        assert ep.service_proxy is True

    def test_can_be_disabled_on_a_service(self):
        ep = AppEntryPoint(id="t", name="T", command="echo",
                           type="service", service_proxy=False)
        assert ep.service_proxy is False

    def test_rejected_on_a_job(self):
        with pytest.raises(ValidationError, match="service_proxy is only valid for service"):
            AppEntryPoint(id="t", name="T", command="echo",
                          type="job", service_proxy=False)

    def test_default_survives_a_job_entry_point(self):
        """The True default is written onto every entry point by model_dump, so
        the validator must key on the value being false, not on the field being
        set — otherwise a round-tripped job manifest fails to revalidate."""
        ep = AppEntryPoint(id="t", name="T", command="echo", type="job")
        assert AppEntryPoint(**ep.model_dump()).service_proxy is True


class TestServiceUrlSuffix:
    """service_url_suffix is a restricted template validated for shell-safety."""

    def _ep(self, suffix, **kw):
        kw.setdefault("type", "service")
        kw.setdefault("auto_url", True)
        return AppEntryPoint(id="t", name="T", command="echo",
                             service_url_suffix=suffix, **kw)

    def test_allows_literal_and_known_placeholders(self):
        ep = self._ep("/?access_token=${FG_SERVICE_TOKEN}")
        assert ep.service_url_suffix == "/?access_token=${FG_SERVICE_TOKEN}"

    def test_allows_multiple_query_params_and_paths(self):
        # ? & = / are literal inside the double-quoted emission; base paths ok.
        ep = self._ep("/lab?token=${FG_SERVICE_TOKEN}&reset=1")
        assert "reset=1" in ep.service_url_suffix

    def test_rejects_unknown_placeholder(self):
        with pytest.raises(ValidationError, match="service_url_suffix"):
            self._ep("/?t=${SECRET}")

    def test_rejects_bare_dollar(self):
        with pytest.raises(ValidationError, match="service_url_suffix"):
            self._ep("/?t=$FG_SERVICE_TOKEN")  # braces required

    def test_rejects_shell_injection_chars(self):
        for bad in ['/`whoami`', '/"x"', "/\\x"]:
            with pytest.raises(ValidationError, match="service_url_suffix"):
                self._ep(bad)

    def test_requires_auto_url(self):
        with pytest.raises(ValidationError, match="service_url_suffix requires auto_url"):
            AppEntryPoint(id="t", name="T", command="echo", type="service",
                          auto_url=False, service_url_suffix="/?t=x")


class TestServiceUrlPublisher:
    """The backgrounded readiness probe that publishes SERVICE_URL_PATH."""

    def test_publisher_is_valid_bash(self):
        snippet = _build_service_url_publisher("/?access_token=${FG_SERVICE_TOKEN}")
        result = subprocess.run(["bash", "-n", "-c", snippet],
                                capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert "SERVICE_URL_PATH" in snippet and "3600" in snippet

    @pytest.mark.parametrize("preexisting", [False, True])
    def test_publishes_tokenized_url_only_once_port_is_up(self, tmp_path,
                                                          preexisting):
        import socket
        # Bind a real port so the probe's TCP connect succeeds.
        srv = socket.socket()
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("127.0.0.1", 0))
        port = srv.getsockname()[1]
        srv.listen()
        try:
            url_file = tmp_path / "service_url"
            if preexisting:
                # Redirection keeps the mode of a file that already exists, so
                # the umask alone would leave this one readable.
                url_file.touch()
                os.chmod(url_file, 0o644)
            env = (
                f'export FG_HOSTNAME=h1 FG_SERVICE_PORT={port} '
                f'FG_SERVICE_TOKEN=deadbeef SERVICE_URL_PATH={url_file}\n'
            )
            # Run the publisher in the foreground (drop the trailing &) so the
            # test can wait for it deterministically.
            snippet = _build_service_url_publisher(
                "/?access_token=${FG_SERVICE_TOKEN}").rstrip().removesuffix("&")
            result = subprocess.run(["bash", "-c", env + snippet],
                                    capture_output=True, text=True, timeout=30)
            assert result.returncode == 0, result.stderr
            assert url_file.read_text() == f"http://h1:{port}/?access_token=deadbeef"
            # The URL carries the access token: never group/world readable.
            assert url_file.stat().st_mode & 0o077 == 0
        finally:
            srv.close()

    def test_does_not_publish_when_port_never_opens(self, tmp_path):
        import socket
        # Grab a free port number, then close it so nothing is listening.
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        url_file = tmp_path / "service_url"
        env = (
            f'export FG_HOSTNAME=h1 FG_SERVICE_PORT={port} '
            f'FG_SERVICE_TOKEN=x SERVICE_URL_PATH={url_file}\n'
        )
        # Shrink the loop to 2 iterations so the timeout path is quick.
        snippet = _build_service_url_publisher("").replace("$(seq 1 3600)", "$(seq 1 2)")
        snippet = snippet.rstrip().removesuffix("&")
        result = subprocess.run(["bash", "-c", env + snippet],
                                capture_output=True, text=True, timeout=30)
        assert not url_file.exists()
        assert "never opened" in result.stderr


class TestPrivateStateDir:
    """~/.fileglancer holds service tokens and private clones: owner-only."""

    def _chain(self, leaf):
        """leaf and every ancestor up to (and including) .fileglancer."""
        chain = [leaf]
        while chain[-1].name != ".fileglancer":
            chain.append(chain[-1].parent)
        return chain

    @pytest.mark.parametrize("subpath", [
        ".fileglancer/jobs/1-demo-run",          # job work dir
        ".fileglancer/apps/org/demo",            # repo clone
        ".fileglancer/apps/org/demo/.snapshots",  # pinned checkouts
    ])
    def test_locks_down_the_whole_chain(self, tmp_path, subpath):
        from fileglancer.apps.jobfiles import ensure_private_dir

        # tmp_path stands in for $HOME: its mode must survive the walk upward.
        os.chmod(tmp_path, 0o755)
        leaf = tmp_path / subpath
        ensure_private_dir(leaf)
        for path in self._chain(leaf):
            assert path.stat().st_mode & 0o077 == 0, path
        assert tmp_path.stat().st_mode & 0o777 == 0o755

    def test_fixes_an_already_world_readable_tree(self, tmp_path):
        from fileglancer.apps.jobfiles import ensure_private_dir

        leaf = tmp_path / ".fileglancer" / "jobs" / "1-demo-run"
        leaf.mkdir(parents=True)
        for path in self._chain(leaf):
            os.chmod(path, 0o755)
        ensure_private_dir(leaf)
        for path in self._chain(leaf):
            assert path.stat().st_mode & 0o077 == 0, path

    def test_the_walk_stops_at_the_innermost_state_root(self, tmp_path):
        """A ``.fileglancer`` component further up the path is not the root."""
        from fileglancer.apps.jobfiles import ensure_private_dir

        outer_state = tmp_path / ".fileglancer"
        leaf = outer_state / "shared" / ".fileglancer" / "jobs" / "1-demo-run"
        leaf.mkdir(parents=True)
        os.chmod(outer_state, 0o755)
        os.chmod(outer_state / "shared", 0o755)

        ensure_private_dir(leaf)

        for path in self._chain(leaf):
            assert path.stat().st_mode & 0o077 == 0, path
        # Everything above that root belongs to whoever put it there.
        assert (outer_state / "shared").stat().st_mode & 0o777 == 0o755
        assert outer_state.stat().st_mode & 0o777 == 0o755

    def test_an_unfixable_ancestor_warns_instead_of_failing(self, tmp_path,
                                                            monkeypatch):
        """A state root owned by someone else must not break job submission."""
        from fileglancer.apps import jobfiles

        real_chmod = os.chmod

        def fake_chmod(target, mode):
            if os.path.basename(target) == ".fileglancer":
                raise PermissionError(1, "Operation not permitted")
            real_chmod(target, mode)

        monkeypatch.setattr(jobfiles.os, "chmod", fake_chmod)
        leaf = tmp_path / ".fileglancer" / "jobs" / "1-demo-run"
        jobfiles.ensure_private_dir(leaf)
        assert leaf.stat().st_mode & 0o077 == 0
        assert leaf.parent.stat().st_mode & 0o077 == 0

    def test_an_unlockable_leaf_raises_a_readable_error(self, tmp_path,
                                                        monkeypatch):
        from fileglancer.apps import jobfiles

        def fake_chmod(target, mode):
            raise PermissionError(1, "Operation not permitted")

        monkeypatch.setattr(jobfiles.os, "chmod", fake_chmod)
        leaf = tmp_path / ".fileglancer" / "jobs" / "1-demo-run"
        with pytest.raises(PermissionError, match="not safe to write sensitive"):
            jobfiles.ensure_private_dir(leaf)

    def test_outside_the_state_dir_locks_the_leaf_only(self, tmp_path):
        """A relocated cache base (as in tests) still gets a private leaf."""
        from fileglancer.apps.jobfiles import ensure_private_dir

        leaf = tmp_path / "somewhere" / "else"
        ensure_private_dir(leaf)
        assert leaf.stat().st_mode & 0o077 == 0
        # The walk stops immediately: an unrelated parent keeps its mode.
        os.chmod(tmp_path / "somewhere", 0o755)
        ensure_private_dir(leaf)
        assert (tmp_path / "somewhere").stat().st_mode & 0o777 == 0o755


class TestServicePhase:
    """The 'phase' marker the container script writes and get_service_phase reads."""

    def test_container_script_reports_pull_and_start_phases(self):
        script = _build_container_script("docker://x/y:latest", "run", "/wd", [])
        # 'pulling_image' is written inside the "SIF missing" branch (the pull),
        # 'starting' unconditionally before exec.
        assert 'printf pulling_image > "$FG_PHASE_PATH"' in script
        assert 'printf starting > "$FG_PHASE_PATH"' in script
        pull_i = script.index("apptainer pull")
        assert script.index("pulling_image") < pull_i < script.index("apptainer exec")

    def _svc(self, tmp_path, phase=None, **kw):
        if phase is not None:
            (tmp_path / "phase").write_text(phase)
        kw.setdefault("entry_point_type", "service")
        kw.setdefault("status", "RUNNING")
        return _fake_job(work_dir=str(tmp_path), **kw)

    def test_reads_recognized_phase_for_running_service(self, tmp_path):
        assert get_service_phase(self._svc(tmp_path, "pulling_image")) == "pulling_image"
        (tmp_path / "phase").write_text("starting")
        assert get_service_phase(self._svc(tmp_path)) == "starting"

    def test_none_when_not_running(self, tmp_path):
        assert get_service_phase(self._svc(tmp_path, "pulling_image", status="PENDING")) is None

    def test_none_for_non_service(self, tmp_path):
        assert get_service_phase(self._svc(tmp_path, "starting", entry_point_type="job")) is None

    def test_none_when_no_phase_file(self, tmp_path):
        assert get_service_phase(self._svc(tmp_path)) is None

    def test_rejects_unknown_phase(self, tmp_path):
        assert get_service_phase(self._svc(tmp_path, "garbage")) is None


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

    def test_folder_rejected_when_file_expected(self, tmp_path):
        from fileglancer.model import FileSharePath
        subdir = tmp_path / "results"
        subdir.mkdir()
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        error = validate_path_in_filestore(str(subdir), [fsp], expected_type="file")
        assert error == "Path is a folder, but a file is required"

    def test_file_rejected_when_directory_expected(self, tmp_path):
        from fileglancer.model import FileSharePath
        test_file = tmp_path / "data.txt"
        test_file.write_text("hello")
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        error = validate_path_in_filestore(str(test_file), [fsp],
                                           expected_type="directory")
        assert error == "Path is a file, but a folder is required"

    def test_matching_type_passes(self, tmp_path):
        from fileglancer.model import FileSharePath
        test_file = tmp_path / "data.txt"
        test_file.write_text("hello")
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        assert validate_path_in_filestore(str(test_file), [fsp],
                                          expected_type="file") is None
        assert validate_path_in_filestore(str(tmp_path), [fsp],
                                          expected_type="directory") is None

    def test_missing_path_not_type_checked(self, tmp_path):
        """An exists=false output has no type yet, so only containment applies."""
        from fileglancer.model import FileSharePath
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))
        missing = str(tmp_path / "report.html")
        assert validate_path_in_filestore(missing, [fsp], check_access=False,
                                          expected_type="file") is None



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
        assert [(p.key, p.type, v) for p, v in result] == [
            ("envdir", "directory", "/data/envdefault"),
            ("input", "file", "/data/in.txt"),
            ("outdir", "directory", "/data/outdefault"),
        ]

    def test_carries_exists_flag(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[
                {"key": "report", "name": "Report", "type": "file",
                 "flag": "--report", "exists": False},
                {"key": "input", "name": "Input Path", "type": "file", "flag": "--input"},
            ],
        )
        result = collect_path_parameters(
            ep, {"report": "/data/report.html", "input": "/data/in.txt"}
        )
        assert [(p.key, p.exists, v) for p, v in result] == [
            ("report", False, "/data/report.html"),
            ("input", True, "/data/in.txt"),
        ]

    def test_omits_path_params_without_value_or_default(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{"key": "input", "name": "Input Path", "type": "file", "flag": "--input"}],
        )
        assert collect_path_parameters(ep, {}) == []


class TestExistsValidation:
    """exists is only valid on file and directory params."""

    def test_accepted_on_directory(self):
        p = AppParameter(key="d", name="Dir", type="directory", exists=False)
        assert p.exists is False

    def test_accepted_on_file(self):
        p = AppParameter(key="f", name="File", type="file", exists=False)
        assert p.exists is False

    def test_defaults_true(self):
        p = AppParameter(key="d", name="Dir", type="directory")
        assert p.exists is True

    @pytest.mark.parametrize("bad_type", ["string", "integer", "enum"])
    def test_exists_false_rejected_on_non_path_type(self, bad_type):
        kwargs = {"key": "p", "name": "P", "type": bad_type, "exists": False}
        if bad_type == "enum":
            kwargs["options"] = ["a", "b"]
        with pytest.raises(ValidationError):
            AppParameter(**kwargs)

    def test_exists_true_tolerated_on_non_path_type(self):
        # model_dump serializes the True default onto every param, so a
        # round-tripped manifest carries exists=True on strings; that must
        # revalidate cleanly.
        p = AppParameter(key="s", name="S", type="string", exists=True)
        assert p.exists is True

    def test_round_trip_through_model_dump(self):
        # Worker -> server and DB-cache paths reconstruct the model from its
        # own model_dump; the validator must accept its own serialized output.
        p = AppParameter(key="s", name="S", type="string", flag="--s")
        assert AppParameter(**p.model_dump()) == p


class TestCollectCreatableDirs:
    """collect_creatable_dirs gathers directory params with exists=false."""

    def test_collects_via_default_and_user_value(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            env_parameters=[{
                "key": "envdir", "name": "Env Dir", "type": "directory",
                "default": "~/.fileglancer/env", "exists": False,
            }],
            parameters=[
                {"key": "logdir", "name": "Log Dir", "type": "directory",
                 "flag": "--logdir", "default": "~/.fileglancer/logs",
                 "exists": False},
                # directory without the flag -> excluded
                {"key": "indir", "name": "In Dir", "type": "directory",
                 "flag": "--indir", "default": "/data/in"},
            ],
        )
        result = collect_creatable_dirs(
            ep,
            {"logdir": "/data/mylogs"},  # user override
            env_parameters={},
        )
        # Env default included; pipeline 'logdir' uses the user value; 'indir'
        # excluded (must exist, so it is never created).
        assert result == [
            ("Env Dir", "~/.fileglancer/env"),
            ("Log Dir", "/data/mylogs"),
        ]

    def test_omits_file_params(self):
        # exists=false file params skip the existence check but are never
        # created (there is nothing sensible to create for a file output).
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{"key": "report", "name": "Report", "type": "file",
                         "flag": "--report", "default": "~/report.html",
                         "exists": False}],
        )
        assert collect_creatable_dirs(ep, {}) == []

    def test_omits_when_no_effective_value(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{"key": "logdir", "name": "Log Dir", "type": "directory",
                         "flag": "--logdir", "exists": False}],
        )
        assert collect_creatable_dirs(ep, {}) == []

    def test_omits_empty_string_value(self):
        ep = AppEntryPoint(
            id="test",
            name="test",
            command="test_cmd",
            parameters=[{"key": "logdir", "name": "Log Dir", "type": "directory",
                         "flag": "--logdir", "default": "~/logs",
                         "exists": False}],
        )
        assert collect_creatable_dirs(ep, {"logdir": ""}) == []


class TestExpandUserPath:
    """expand_user_path normalizes file/dir param values consistently."""

    def test_uri_unchanged(self):
        assert expand_user_path("s3://bucket/key") == "s3://bucket/key"
        assert expand_user_path("gs://bucket/key") == "gs://bucket/key"
        assert expand_user_path("https://host/path") == "https://host/path"

    def test_absolute_unchanged(self):
        assert expand_user_path("/data/output") == "/data/output"

    def test_tilde_uses_username_home(self, monkeypatch):
        import fileglancer.apps.command as command_mod
        monkeypatch.setattr(command_mod.pwd, "getpwnam",
                            lambda name: SimpleNamespace(pw_dir="/home/bob"))
        assert expand_user_path("~/x", username="bob") == "/home/bob/x"
        assert expand_user_path("~", username="bob") == "/home/bob"

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
        manifest = AppManifest(
            name="From Pixi",
            runnables=[AppEntryPoint(id="run", name="Run", command="echo")],
        )
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
    _is_git_auth_error,
    _clone_repo,
    get_app_branch,
)


class TestParseGitHubUrl:
    def test_branch_name_may_contain_slashes(self):
        owner, repo, branch = _parse_github_url(
            "https://github.com/org/tool/tree/feature/my-tool"
        )
        assert (owner, repo, branch) == ("org", "tool", "feature/my-tool")

    @pytest.mark.parametrize(
        "url",
        [
            "git@github.com:org/tool.git",
            "git@github.com:org/tool",
            "ssh://git@github.com/org/tool.git",
            "ssh://git@github.com/org/tool",
        ],
    )
    def test_parses_ssh_urls(self, url):
        assert _parse_github_url(url) == ("org", "tool", None)


class TestCanonicalGithubUrl:
    @pytest.mark.parametrize(
        "url",
        [
            "https://github.com/Org/Repo",
            "https://github.com/Org/Repo.git",
            "https://github.com/Org/Repo/",
            "https://github.com/Org/Repo/tree/main",
            "git@github.com:Org/Repo.git",
            "ssh://git@github.com/Org/Repo",
        ],
    )
    def test_cosmetic_variations_canonicalize_identically(self, url):
        from fileglancer.giturls import canonical_github_url

        assert canonical_github_url(url) == "https://github.com/Org/Repo"

    def test_non_default_branch_preserved(self):
        from fileglancer.giturls import canonical_github_url

        assert (
            canonical_github_url("https://github.com/Org/Repo/tree/dev")
            == "https://github.com/Org/Repo/tree/dev"
        )

    def test_unparseable_returned_unchanged(self):
        from fileglancer.giturls import canonical_github_url

        assert canonical_github_url("not a url") == "not a url"

    @pytest.mark.parametrize(
        "url",
        [
            "https://gitlab.com/org/tool",
            "git@gitlab.com:org/tool.git",
            "not a url",
        ],
    )
    def test_rejects_non_github_urls(self, url):
        with pytest.raises(ValueError):
            _parse_github_url(url)


class TestGithubUrlAtBranch:
    def test_default_branch_folds_to_bare(self):
        from fileglancer.giturls import github_url_at_branch

        assert (
            github_url_at_branch("Org", "Repo", "main")
            == "https://github.com/Org/Repo"
        )

    def test_non_default_branch_is_explicit(self):
        from fileglancer.giturls import github_url_at_branch

        assert (
            github_url_at_branch("Org", "Repo", "master")
            == "https://github.com/Org/Repo/tree/master"
        )


class TestCloneUrlForStoredApp:
    def test_bare_stored_url_means_fixed_main(self):
        from fileglancer.apps import clone_url_for_stored_app

        # A pinned app (branch recorded, "" = took the default which was main).
        assert (
            clone_url_for_stored_app("https://github.com/Org/Repo", "")
            == "https://github.com/Org/Repo/tree/main"
        )

    def test_non_main_revision_stays_explicit(self):
        from fileglancer.apps import clone_url_for_stored_app

        assert (
            clone_url_for_stored_app("https://github.com/Org/Repo/tree/master", "master")
            == "https://github.com/Org/Repo/tree/master"
        )

    def test_null_branch_legacy_row_tracks_default(self):
        from fileglancer.apps import clone_url_for_stored_app

        # branch is None: a legacy row with an unknown default — return the URL
        # unchanged so git resolves the current default, rather than guessing
        # "main" and breaking a repo that defaults to e.g. "master".
        assert (
            clone_url_for_stored_app("https://github.com/Org/Repo", None)
            == "https://github.com/Org/Repo"
        )


class TestCloneFallback:
    def test_auth_error_detection(self):
        assert _is_git_auth_error(
            "fatal: could not read Username for 'https://github.com': "
            "terminal prompts disabled"
        )
        assert _is_git_auth_error("remote: Repository not found.")
        assert not _is_git_auth_error("fatal: Remote branch v9 not found")

    @pytest.mark.asyncio
    async def test_falls_back_to_ssh_on_https_auth_error(self, tmp_path, monkeypatch):
        from fileglancer.apps import manifest as m

        calls = []

        async def fake_run_git(args, timeout=60, extra_env=None):
            calls.append((args, extra_env))
            if "https://github.com/org/tool.git" in args:
                raise ValueError(
                    "Git command failed: fatal: could not read Username for "
                    "'https://github.com': terminal prompts disabled"
                )
            return (b"", b"")

        monkeypatch.setattr(m, "_run_git", fake_run_git)
        monkeypatch.setattr(m.shutil, "rmtree", lambda *a, **k: None)

        await _clone_repo("org", "tool", "v0.1.0", tmp_path / "dest")

        used = [args for args, _ in calls]
        assert any("https://github.com/org/tool.git" in a for a in used)
        # The SSH retry was attempted with the SSH-specific environment.
        ssh_call = next(
            (env for args, env in calls if "git@github.com:org/tool.git" in args),
            None,
        )
        assert ssh_call is not None and "GIT_SSH_COMMAND" in ssh_call

    @pytest.mark.asyncio
    async def test_raises_understandable_error_when_both_fail(self, tmp_path, monkeypatch):
        from fileglancer.apps import manifest as m

        async def fake_run_git(args, timeout=60, extra_env=None):
            raise ValueError(
                "Git command failed: fatal: could not read Username for "
                "'https://github.com': terminal prompts disabled"
            )

        monkeypatch.setattr(m, "_run_git", fake_run_git)
        monkeypatch.setattr(m.shutil, "rmtree", lambda *a, **k: None)

        with pytest.raises(ValueError, match="Could not access the repository org/tool"):
            await _clone_repo("org", "tool", "v0.1.0", tmp_path / "dest")

    @pytest.mark.asyncio
    async def test_https_ref_not_found_is_not_retried(self, tmp_path, monkeypatch):
        from fileglancer.apps import manifest as m

        calls = []

        async def fake_run_git(args, timeout=60, extra_env=None):
            calls.append(args)
            raise ValueError(
                "Git command failed: fatal: Remote branch v9 not found in upstream origin"
            )

        monkeypatch.setattr(m, "_run_git", fake_run_git)
        monkeypatch.setattr(m.shutil, "rmtree", lambda *a, **k: None)

        with pytest.raises(ValueError, match="Revision 'v9' was not found"):
            await _clone_repo("org", "tool", "v9", tmp_path / "dest")
        # A reachable remote with a missing ref is authoritative — no SSH retry.
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_ssh_ref_not_found_reports_revision_not_access(self, tmp_path, monkeypatch):
        """Private repo + mistyped tag: HTTPS auth-fails, SSH reaches the repo but
        the revision is missing — report the revision, not a misleading
        'can't access / maybe private' message."""
        from fileglancer.apps import manifest as m

        async def fake_run_git(args, timeout=60, extra_env=None):
            if "https://github.com/org/tool.git" in args:
                raise ValueError(
                    "Git command failed: fatal: could not read Username for "
                    "'https://github.com': terminal prompts disabled"
                )
            raise ValueError(
                "Git command failed: fatal: Remote branch v1.0.1 not found in upstream origin"
            )

        monkeypatch.setattr(m, "_run_git", fake_run_git)
        monkeypatch.setattr(m.shutil, "rmtree", lambda *a, **k: None)

        with pytest.raises(ValueError, match="Revision 'v1.0.1' was not found") as exc:
            await _clone_repo("org", "tool", "v1.0.1", tmp_path / "dest")
        assert "private" not in str(exc.value).lower()

    def test_ref_not_found_detection(self):
        from fileglancer.apps.manifest import _is_git_ref_not_found

        assert _is_git_ref_not_found(
            "fatal: Remote branch v1.0.1 not found in upstream origin"
        )
        assert _is_git_ref_not_found("fatal: could not find remote ref refs/tags/v9")
        assert not _is_git_ref_not_found(
            "fatal: could not read Username for 'https://github.com'"
        )

    @pytest.mark.asyncio
    async def test_pull_resets_to_fetch_head_not_origin_branch(self, tmp_path, monkeypatch):
        """A cached tag/SHA has no origin/<ref> tracking branch, so the pull must
        reset to FETCH_HEAD (works for branches, tags and SHAs)."""
        from fileglancer.apps import manifest as m

        monkeypatch.setattr(m, "_repo_cache_base", lambda username=None: tmp_path)
        # Pre-create the cache dir so _ensure_repo_cache takes the pull branch.
        repo_dir = tmp_path / "org" / "tool" / "v0.1.0"
        repo_dir.mkdir(parents=True)

        calls = []

        async def fake_run_git(args, timeout=60, extra_env=None):
            calls.append(args)
            return (b"", b"")

        monkeypatch.setattr(m, "_run_git", fake_run_git)

        await m._ensure_repo_cache(
            "https://github.com/org/tool/tree/v0.1.0", pull=True
        )

        reset_calls = [a for a in calls if "reset" in a]
        assert reset_calls, "expected a reset during pull"
        # Must reset to FETCH_HEAD, never origin/<tag>.
        assert "FETCH_HEAD" in reset_calls[0]
        assert not any("origin/v0.1.0" in a for a in reset_calls)

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


class TestOptionalFlagEmptyValue:
    """An optional flagged param with an empty value must be omitted entirely,
    not emitted as `--flag ''`. No CLI expects an empty flag value (e.g. argparse
    rejects '' against its choices).

    The UI form strips empty values before submitting, so the empty value reaches
    build_command via a manifest default="" (the typical case: the UI drops the
    blank selection, then build_command re-fills from the default) or via an
    API/CLI/relaunch payload that didn't pass through the form. build_command is
    the authoritative boundary and must stay robust regardless of caller."""

    def _ep(self, **param_kwargs):
        return AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[AppParameter(name="Preset", type="enum",
                                     options=["webknossos", "paintera"],
                                     **param_kwargs)],
        )

    def test_empty_string_default_omits_flag(self):
        # Typical failure path: the UI drops the blank selection, build_command
        # fills from the manifest default, and an empty-string default must not
        # resurrect `--preset ''`.
        ep = self._ep(flag="--preset", default="")
        cmd = build_command(ep, {})
        assert "--preset" not in cmd
        assert cmd == "tool"

    def test_empty_value_in_payload_omits_flag(self):
        # Defensive: a "" handed in directly (API/CLI/relaunch JSON) is dropped
        # rather than emitted, even though the UI form would have stripped it.
        ep = self._ep(flag="--preset")
        cmd = build_command(ep, {"preset": ""})
        assert "--preset" not in cmd
        assert cmd == "tool"

    def test_selected_value_still_emitted(self):
        ep = self._ep(flag="--preset")
        cmd = build_command(ep, {"preset": "webknossos"})
        assert "--preset webknossos" in cmd

    def test_required_empty_value_still_validates(self):
        # Required params keep the empty value so validation raises rather than
        # silently dropping a mandatory flag.
        ep = self._ep(flag="--preset", required=True)
        with pytest.raises(ValueError):
            build_command(ep, {"preset": ""})

    def test_empty_positional_value_preserved(self):
        # The omit-empty rule targets flagged params; a flag-less positional
        # with an empty value keeps an empty quoted arg (positional slots count).
        ep = AppEntryPoint(
            id="run", name="run", command="tool",
            parameters=[AppParameter(name="Pos", type="string")],
        )
        cmd = build_command(ep, {"_arg0": ""})
        assert cmd.endswith("''")


class TestBuildCommandValueSeparator:
    def test_flagged_params_default_to_space_separator(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[AppParameter(flag="--opt", name="Opt", type="string")],
        )
        cmd = build_command(ep, {"opt": "value"})
        assert "--opt value" in cmd

    def test_equals_separator_attaches_leading_dash_value(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(
                    flag="--runtime_opts",
                    name="Runtime opts",
                    type="string",
                    value_separator="equals",
                ),
            ],
        )
        cmd = build_command(ep, {"runtime_opts": "--nv"})
        assert "--runtime_opts=--nv" in cmd
        assert "--runtime_opts --nv" not in cmd

    def test_equals_separator_still_shell_quotes_spaces(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(
                    flag="--runtime_opts",
                    name="Runtime opts",
                    type="string",
                    value_separator="equals",
                ),
            ],
        )
        cmd = build_command(ep, {"runtime_opts": "--bind /data in"})
        assert "--runtime_opts='--bind /data in'" in cmd


class TestBuildCommandBooleanStyle:
    def test_flag_style_preserves_generic_switch_behavior(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[AppParameter(flag="--verbose", name="Verbose", type="boolean")],
        )
        assert build_command(ep, {"verbose": True}) == "tool \\\n  --verbose"
        assert build_command(ep, {"verbose": False}) == "tool"

    def test_value_style_emits_explicit_boolean_values(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(
                    flag="--skip_qc",
                    name="Skip QC",
                    type="boolean",
                    boolean_style="value",
                ),
            ],
        )
        assert "--skip_qc true" in build_command(ep, {"skip_qc": True})
        assert "--skip_qc false" in build_command(ep, {"skip_qc": False})

    def test_value_style_can_use_equals_separator(self):
        ep = AppEntryPoint(
            id="run",
            name="run",
            command="tool",
            parameters=[
                AppParameter(
                    flag="--skip_qc",
                    name="Skip QC",
                    type="boolean",
                    boolean_style="value",
                    value_separator="equals",
                ),
            ],
        )
        assert "--skip_qc=true" in build_command(ep, {"skip_qc": True})
        assert "--skip_qc=false" in build_command(ep, {"skip_qc": False})


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
        assert "-profile janeliaLSF" in cmd

    def test_pipeline_params_use_equals_separator_for_leading_dash_values(self, tmp_path):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {
                "opts": {
                    "title": "Options",
                    "properties": {
                        "runtime_opts": {"type": "string"},
                    },
                }
            },
            "allOf": [{"$ref": "#/$defs/opts"}],
        }))
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        cmd = build_command(ep, {"runtime_opts": "--nv"})
        assert "--runtime_opts=--nv" in cmd
        assert "--runtime_opts --nv" not in cmd

    def test_boolean_params_are_emitted_explicitly(self, tmp_path):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {
                "opts": {
                    "title": "Options",
                    "properties": {
                        "skip_qc": {"type": "boolean", "default": True},
                    },
                }
            },
            "allOf": [{"$ref": "#/$defs/opts"}],
        }))
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        param = next(p for p in ep.flat_parameters() if p.key == "skip_qc")
        assert param.boolean_style == "value"

        assert "--skip_qc=true" in build_command(ep, {})
        assert "--skip_qc=false" in build_command(ep, {"skip_qc": False})
        assert "--skip_qc false" not in build_command(ep, {"skip_qc": False})

    def test_legacy_cached_nextflow_params_use_safe_forms(self):
        # Cached manifests created before Fileglancer knew about
        # value_separator/boolean_style still validate with those fields at
        # their generic defaults. Command generation must recognize Nextflow
        # pipeline params and use the safe forms anyway, otherwise existing
        # installed apps keep the old bugs until manually updated/re-added.
        ep = AppEntryPoint(
            id="run",
            name="Run pipeline",
            command="nextflow run repo -ansi-log false",
            working_dir="work",
            env_parameters=[
                AppParameter(flag="-profile", name="Profiles", type="string"),
            ],
            parameters=[
                AppParameter(
                    flag="--runtime_opts",
                    name="Runtime opts",
                    type="string",
                ),
                AppParameter(
                    flag="--skip_qc",
                    name="Skip QC",
                    type="boolean",
                    default=True,
                ),
            ],
        )

        cmd = build_command(
            ep,
            {"runtime_opts": "--nv", "skip_qc": False},
            env_parameters={"profile": "janeliaLSF"},
        )
        assert "-profile janeliaLSF" in cmd
        assert "--runtime_opts=--nv" in cmd
        assert "--skip_qc=false" in cmd
        assert "--runtime_opts --nv" not in cmd
        assert "--skip_qc false" not in cmd

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


class TestNextflowPathExists:
    """Nextflow path params only require existence when the schema sets
    "exists": true — anything else (outdir, report paths, ...) is an output
    the pipeline creates."""

    def _convert(self, tmp_path, properties):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {"opts": {"title": "Options", "properties": properties}},
            "allOf": [{"$ref": "#/$defs/opts"}],
        }))
        ep = NextflowAdapter().convert(tmp_path).runnables[0]
        return {p.key: p for p in ep.flat_parameters()}

    def test_exists_true_requires_existence(self, tmp_path):
        params = self._convert(tmp_path, {
            "input": {"type": "string", "format": "file-path", "exists": True},
        })
        assert params["input"].exists is True

    def test_path_without_exists_may_be_missing(self, tmp_path):
        params = self._convert(tmp_path, {
            "outdir": {"type": "string", "format": "directory-path"},
            "report": {"type": "string", "format": "file-path"},
        })
        assert params["outdir"].exists is False
        assert params["report"].exists is False

    def test_exists_false_may_be_missing(self, tmp_path):
        # nf-schema uses "exists": false to assert non-existence; either way
        # the path is not required to exist before launch.
        params = self._convert(tmp_path, {
            "outdir": {"type": "string", "format": "directory-path", "exists": False},
        })
        assert params["outdir"].exists is False

    def test_non_path_params_unaffected(self, tmp_path):
        params = self._convert(tmp_path, {
            "title": {"type": "string"},
        })
        assert params["title"].exists is True  # model default, not path-validated


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
            assert manifest.name == "rnaseq"

    def test_slashed_branch_naming(self, tmp_path):
        from unittest.mock import patch
        cache_base = tmp_path / "cache"
        repo_dir = cache_base / "nf-core" / "rnaseq" / "feature" / "slashed" / "branch"
        repo_dir.mkdir(parents=True, exist_ok=True)
        self._make_schema(repo_dir)

        with patch("fileglancer.apps.manifest._repo_cache_base", return_value=cache_base):
            manifest = NextflowAdapter().convert(repo_dir)
            assert manifest.name == "rnaseq"


class TestEffectiveWorkingDir:
    """working_dir resolution: explicit wins; containers default to 'work',
    everything else to 'manifest'."""

    def test_default_is_manifest(self):
        ep = AppEntryPoint(id="r", name="r", command="python x.py")
        assert ep.effective_working_dir == "manifest"

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
        # No parameter should carry an --env: flag.
        assert all(
            p.flag is None or not p.flag.startswith("--env:")
            for p in ep.flat_parameters()
        )
        assert "--env:" not in build_command(ep, {})

    def test_no_env_leaves_env_none(self):
        ep = _task_to_entry_point("build", {"cmd": "make"})
        assert ep.env is None

    def test_task_name_is_shell_quoted(self):
        ep = _task_to_entry_point("build; echo injected", {"cmd": "make"})
        assert ep.command == 'pixi run --manifest-path "$FG_MANIFEST_DIR" \'build; echo injected\''


class TestPixiAdapterName:
    """The generated app name should come from the pixi project's name, falling
    back to the git repo name, then the directory name — never a repo/branch
    combination like 'repo/HEAD'."""

    def _write_pixi(self, tmp_path, body: str):
        (tmp_path / "pixi.toml").write_text(body)

    def test_uses_project_name_from_pixi_toml(self, tmp_path):
        from fileglancer.apps.pixi import PixiAdapter

        self._write_pixi(
            tmp_path,
            '[project]\nname = "SmartSPIM"\n\n[tasks]\nrun = "echo hi"\n',
        )
        manifest = PixiAdapter().convert(tmp_path)
        assert manifest.name == "SmartSPIM"

    def test_falls_back_to_git_repo_name(self, tmp_path, monkeypatch):
        from fileglancer.apps import pixi as pixi_mod
        from fileglancer.apps.pixi import PixiAdapter

        # pixi.toml without a project name
        self._write_pixi(tmp_path, '[tasks]\nrun = "echo hi"\n')
        monkeypatch.setattr(
            pixi_mod, "_get_git_repo_name", lambda d: "SmartSPIMGlancer"
        )
        manifest = PixiAdapter().convert(tmp_path)
        assert manifest.name == "SmartSPIMGlancer"

    def test_falls_back_to_directory_name(self, tmp_path, monkeypatch):
        from fileglancer.apps import pixi as pixi_mod
        from fileglancer.apps.pixi import PixiAdapter

        self._write_pixi(tmp_path, '[tasks]\nrun = "echo hi"\n')
        monkeypatch.setattr(pixi_mod, "_get_git_repo_name", lambda d: None)
        manifest = PixiAdapter().convert(tmp_path)
        assert manifest.name == tmp_path.name


class TestManifestSourceFilename:
    """The manifest records which file it was read or generated from, so the
    UI can link to the real source instead of always naming runnables.yaml."""

    def test_runnables_yaml(self, tmp_path):
        from fileglancer.apps.manifest import _read_manifest_file

        (tmp_path / "runnables.yaml").write_text(
            "name: Test\n"
            "runnables:\n"
            "  - id: run\n"
            "    name: Run\n"
            "    command: echo\n"
        )
        assert _read_manifest_file(tmp_path).source_filename == "runnables.yaml"

    def test_nextflow_schema(self, tmp_path):
        (tmp_path / "nextflow_schema.json").write_text(json.dumps({
            "$defs": {
                "input": {
                    "title": "Input",
                    "properties": {"input_dir": {"type": "string"}},
                }
            },
            "allOf": [{"$ref": "#/$defs/input"}],
        }))
        manifest = NextflowAdapter().convert(tmp_path)
        assert manifest.source_filename == "nextflow_schema.json"

    def test_pixi_toml(self, tmp_path):
        from fileglancer.apps.pixi import PixiAdapter

        (tmp_path / "pixi.toml").write_text(
            '[project]\nname = "Foo"\n\n[tasks]\nrun = "echo hi"\n'
        )
        manifest = PixiAdapter().convert(tmp_path)
        assert manifest.source_filename == "pixi.toml"

    def test_pyproject_toml(self, tmp_path):
        from fileglancer.apps.pixi import PixiAdapter

        (tmp_path / "pyproject.toml").write_text(
            '[project]\nname = "Foo"\n\n[tool.pixi.tasks]\nrun = "echo hi"\n'
        )
        manifest = PixiAdapter().convert(tmp_path)
        assert manifest.source_filename == "pyproject.toml"


class TestPollLoopStopRace:
    """The poll loop must not orphan a job submitted while it is stopping.

    When _poll_jobs reports no active jobs, the loop re-checks for active jobs
    before exiting, with no await in between, and keeps polling if one appeared
    during the cycle. So a job submitted just as the loop is about to stop is
    still picked up rather than left unpolled in PENDING.
    """

    def test_keeps_polling_when_job_appears_during_stop(self, tmp_path, monkeypatch):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch
        import fileglancer.apps.jobs as jobs_mod

        monkeypatch.setattr(jobs_mod, "_POLL_LOCK_PATH", str(tmp_path / "poll.lock"))
        monkeypatch.setattr(jobs_mod, "_poll_task", None, raising=False)
        settings = SimpleNamespace(cluster=SimpleNamespace(poll_interval=0.01))

        # _poll_jobs reports "no active jobs" every cycle. The stop re-check
        # returns a user first (a job appeared mid-cycle -> keep going), then
        # None (really nothing -> stop).
        with patch.object(jobs_mod, "_poll_jobs", new=AsyncMock(return_value=False)) as poll_jobs, \
             patch.object(jobs_mod, "_get_any_active_username",
                          side_effect=["someuser", None]) as active_user:
            async def run():
                await asyncio.wait_for(jobs_mod._poll_loop(settings), timeout=5)
            asyncio.run(run())

        # Polled twice: it did NOT exit on the first no-jobs cycle because the
        # re-check still saw an active job.
        assert poll_jobs.await_count == 2
        assert active_user.call_count == 2
        assert jobs_mod._poll_task is None


class TestSubmitJobOrphanCleanup:
    """A submit-time failure after the job row is created must delete the row.

    Env-var validation, script assembly, and the worker submit all run after
    create_job; if any of them fails without cleanup, the user is left with a
    phantom PENDING job that never runs and never resolves.
    """

    def _submit(self, tmp_path, monkeypatch, entry_point=None, dispatch=None,
                **submit_kwargs):
        import asyncio
        from unittest.mock import AsyncMock
        import fileglancer.apps.jobs as jobs_mod
        from fileglancer import database as db
        from fileglancer.model import AppEntryPoint, AppManifest
        from fileglancer.settings import Settings

        db_url = f"sqlite:///{tmp_path / 'jobs.db'}"
        db.Base.metadata.create_all(db._get_engine(db_url))
        settings = Settings(db_url=db_url, file_share_mounts=[], cli_mode=True)
        monkeypatch.setattr(jobs_mod, "get_settings", lambda: settings)

        manifest = AppManifest(
            name="demo",
            runnables=[AppEntryPoint(id="run", name="Run", command="echo hi",
                                     **(entry_point or {}))],
        )
        monkeypatch.setattr(jobs_mod, "get_or_load_manifest",
                            AsyncMock(return_value=manifest))
        monkeypatch.setattr(jobs_mod, "ensure_repo_snapshot",
                            AsyncMock(return_value=(tmp_path / "repo", "abc123")))
        monkeypatch.setattr(jobs_mod, "_dispatch",
                            dispatch or AsyncMock(return_value={}))

        async def run():
            return await jobs_mod.submit_job(
                username="alice",
                app_url="https://github.com/org/demo",
                entry_point_id="run",
                parameters={},
                **submit_kwargs,
            )
        return asyncio.run(run())

    def _job_count(self, tmp_path):
        from fileglancer import database as db
        with db.get_db_session(f"sqlite:///{tmp_path / 'jobs.db'}") as session:
            return session.query(db.JobDB).count()

    def test_invalid_env_var_name_deletes_row(self, tmp_path, monkeypatch):
        with pytest.raises(ValueError, match="Invalid environment variable name"):
            self._submit(tmp_path, monkeypatch, env={"BAD NAME": "x"})
        assert self._job_count(tmp_path) == 0

    def test_malformed_container_args_deletes_row(self, tmp_path, monkeypatch):
        # shlex.split raises "No closing quotation" during script assembly
        with pytest.raises(ValueError):
            self._submit(tmp_path, monkeypatch,
                         container="docker://busybox",
                         container_args="'unterminated")
        assert self._job_count(tmp_path) == 0

    def test_worker_submit_failure_deletes_row(self, tmp_path, monkeypatch):
        from unittest.mock import AsyncMock
        dispatch = AsyncMock(side_effect=RuntimeError("worker down"))
        with pytest.raises(RuntimeError, match="worker down"):
            self._submit(tmp_path, monkeypatch, dispatch=dispatch)
        assert self._job_count(tmp_path) == 0


class TestSubmitJobAssembly:
    """Happy-path coverage for submit_job's assembly.

    The building blocks (build_command, _build_container_script, preamble
    helpers) have their own unit tests; these cover how submit_job composes
    them — the exact script text and resource spec dispatched to the worker,
    which is what actually runs as the user — and the job row it creates.
    """

    WORKER_RESULT = {
        "job_id": "cluster-42",
        "script_path": "/home/alice/.fileglancer/jobs/1-demo-run/script.sh",
        "work_dir_fsp_name": "home",
        "work_dir_subpath": ".fileglancer/jobs/1-demo-run",
    }

    def _submit(self, tmp_path, monkeypatch, entry_point=None, cluster=None,
                file_share_mounts=None, validate_errors=None, **submit_kwargs):
        """Run submit_job with worker seams mocked; return (job, dispatch calls)."""
        import asyncio
        from unittest.mock import AsyncMock
        import fileglancer.apps.jobs as jobs_mod
        from fileglancer import database as db
        from fileglancer.settings import Settings

        db_url = f"sqlite:///{tmp_path / 'jobs.db'}"
        db.Base.metadata.create_all(db._get_engine(db_url))
        settings = Settings(db_url=db_url,
                            file_share_mounts=file_share_mounts or [],
                            cli_mode=True,
                            cluster=cluster or {})
        monkeypatch.setattr(jobs_mod, "get_settings", lambda: settings)
        # build_command validates path params against the file shares, which
        # get_file_share_paths reads from settings.
        monkeypatch.setattr(db, "get_settings", lambda: settings)

        manifest = AppManifest(
            name="demo",
            runnables=[AppEntryPoint(id="run", name="Run", command="echo hi",
                                     **(entry_point or {}))],
        )
        monkeypatch.setattr(jobs_mod, "get_or_load_manifest",
                            AsyncMock(return_value=manifest))
        monkeypatch.setattr(jobs_mod, "ensure_repo_snapshot",
                            AsyncMock(return_value=(tmp_path / "repo", "a" * 40)))
        monkeypatch.setattr(jobs_mod, "ensure_poll_loop", lambda: None)

        calls = []

        async def fake_dispatch(username, action, **kwargs):
            calls.append((action, kwargs))
            if action == "validate_paths":
                return {"errors": validate_errors or {}}
            if action == "create_dirs":
                return {"errors": {}}
            if action == "submit":
                return dict(self.WORKER_RESULT)
            return {}

        monkeypatch.setattr(jobs_mod, "_dispatch", fake_dispatch)

        async def run():
            return await jobs_mod.submit_job(
                username="alice",
                app_url="https://github.com/org/demo",
                entry_point_id="run",
                parameters=submit_kwargs.pop("parameters", {}),
                **submit_kwargs,
            )
        return asyncio.run(run()), calls

    def _submitted(self, calls):
        """Return the kwargs of the single worker 'submit' dispatch."""
        submits = [kwargs for action, kwargs in calls if action == "submit"]
        assert len(submits) == 1
        return submits[0]

    def test_creates_pending_job_with_cluster_metadata(self, tmp_path, monkeypatch):
        job, calls = self._submit(tmp_path, monkeypatch)

        assert job.status == "PENDING"
        assert job.cluster_job_id == "cluster-42"
        assert job.script_path == self.WORKER_RESULT["script_path"]
        assert job.work_dir_fsp_name == "home"
        assert job.work_dir_subpath == ".fileglancer/jobs/1-demo-run"
        assert job.commit_sha == "a" * 40
        assert job.app_name == "demo"
        assert f"{job.id}-demo-run" in job.work_dir

        submitted = self._submitted(calls)
        assert submitted["work_dir"] == job.work_dir
        assert submitted["job_name"] == "demo-run"
        # work_dir is an OS-native path, so join the same way submit_job does.
        assert submitted["resources"]["stdout_path"] == os.path.join(job.work_dir, "stdout.log")
        assert submitted["resources"]["stderr_path"] == os.path.join(job.work_dir, "stderr.log")

    def test_script_layout_and_parameter_quoting(self, tmp_path, monkeypatch):
        job, calls = self._submit(
            tmp_path, monkeypatch,
            # A developer config.yaml deep-merges into Settings, so pin the
            # executor rather than relying on the 'local' default.
            cluster={"executor": "local"},
            entry_point={
                "conda_env": "tools",
                "env": {"GREETING": "hello world"},
                "pre_run": "echo before",
                "post_run": "echo after",
                "parameters": [{"flag": "--name", "name": "Name", "type": "string"}],
            },
            parameters={"name": "Ada Lovelace"},
        )
        script = self._submitted(calls)["command"]

        assert script.startswith(f"export FG_WORK_DIR={shlex.quote(job.work_dir)}")
        # FG_MANIFEST_DIR points at the app's project root directory, so
        # pixi-style commands can pass --manifest-path explicitly.
        assert 'export FG_MANIFEST_DIR="$FG_WORK_DIR"/repo' in script
        # Default working dir is the repo snapshot (no manifest subdir here).
        assert 'cd "$FG_WORK_DIR"/repo' in script
        assert "conda activate tools" in script
        # User-facing values reach the script shell-quoted.
        assert "export GREETING='hello world'" in script
        assert "echo hi" in script
        assert "--name 'Ada Lovelace'" in script
        # pre_run -> command -> post_run ordering.
        assert (script.index("echo before")
                < script.index("echo hi")
                < script.index("echo after"))
        # The local executor records the exit code for PID polling.
        assert 'trap \'echo $? > "$FG_WORK_DIR/exit_code"\' EXIT' in script

    def test_working_dir_repo_vs_manifest_with_subdir(self, tmp_path, monkeypatch):
        # With a manifest in a subdirectory: 'manifest' cd's into the subdir,
        # 'repo' always cd's into the clone root.
        _, calls = self._submit(
            tmp_path, monkeypatch,
            entry_point={"working_dir": "manifest"},
            manifest_path="tools/rnaseq",
        )
        assert 'cd "$FG_WORK_DIR"/repo/tools/rnaseq' in self._submitted(calls)["command"]

        _, calls = self._submit(
            tmp_path, monkeypatch,
            entry_point={"working_dir": "repo"},
            manifest_path="tools/rnaseq",
        )
        script = self._submitted(calls)["command"]
        assert 'cd "$FG_WORK_DIR"/repo\n' in script or script.endswith('cd "$FG_WORK_DIR"/repo')
        # The cd goes to the clone root, not the manifest subdir (FG_MANIFEST_DIR
        # still points at the subdir, so check the cd line specifically).
        assert 'cd "$FG_WORK_DIR"/repo/tools/rnaseq' not in script

    def test_non_local_executor_omits_exit_code_trap(self, tmp_path, monkeypatch):
        _, calls = self._submit(tmp_path, monkeypatch, cluster={"executor": "lsf"})
        assert "exit_code" not in self._submitted(calls)["command"]

    def test_default_env_mode_uses_login_shell(self, tmp_path, monkeypatch):
        job, calls = self._submit(tmp_path, monkeypatch)
        submitted = self._submitted(calls)
        assert submitted["login_shell"] is True
        # The login shell's profile builds PATH; no clean-mode guards needed.
        assert 'export PATH="${PATH:-' not in submitted["command"]
        assert job.clean_env is False

    def test_clean_env_starts_script_with_guards(self, tmp_path, monkeypatch):
        job, calls = self._submit(tmp_path, monkeypatch, clean_env=True)
        submitted = self._submitted(calls)
        assert submitted["login_shell"] is False
        script = submitted["command"]
        # Clean mode gets no login shell, so the script itself must establish
        # PATH and identity before anything else runs.
        assert script.startswith('export PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}"')
        assert 'export HOME="${HOME:-' in script
        assert job.clean_env is True

    def test_service_entry_point_preamble(self, tmp_path, monkeypatch):
        _, calls = self._submit(
            tmp_path, monkeypatch,
            entry_point={"type": "service", "auto_url": True},
        )
        script = self._submitted(calls)["command"]
        assert 'export SERVICE_URL_PATH="$FG_WORK_DIR/service_url"' in script
        assert "FG_SERVICE_PORT" in script

    def test_container_wraps_command_and_binds_default_paths(self, tmp_path, monkeypatch):
        input_file = tmp_path / "input.txt"
        input_file.write_text("data")
        job, calls = self._submit(
            tmp_path, monkeypatch,
            entry_point={
                "container": "docker://busybox",
                "parameters": [{"flag": "--input", "name": "Input", "type": "file",
                                "default": str(input_file)}],
            },
            file_share_mounts=[str(tmp_path)],
        )
        script = self._submitted(calls)["command"]

        assert "apptainer" in script
        # The file param came from its manifest default (not the submitted
        # parameters), and its parent dir must still be bind-mounted. Bind
        # paths are '/'-normalized for the bash script, hence as_posix().
        assert f"--bind {shlex.quote(tmp_path.as_posix())}" in script
        # Container runnables default to running from the work dir.
        assert 'cd "$FG_WORK_DIR"\n' in script or script.endswith('cd "$FG_WORK_DIR"')
        assert 'cd "$FG_WORK_DIR"/repo' not in script

    def test_resource_overrides_and_extra_args_tokens(self, tmp_path, monkeypatch):
        job, calls = self._submit(
            tmp_path, monkeypatch,
            resources={"cpus": 4, "memory": "8G", "queue": "gpu"},
            extra_args='-P proj -R "select[mem>8000]"',
        )
        resources = self._submitted(calls)["resources"]
        assert resources["cpus"] == 4
        assert resources["memory"] == "8G"
        assert resources["queue"] == "gpu"
        # The user's string arrives at the scheduler as distinct argv tokens.
        assert resources["extra_args"] == ["-P", "proj", "-R", "select[mem>8000]"]
        # The job row stores the same tokens, shell-joined for lossless
        # round-tripping into the relaunch form.
        assert job.resources["extra_args"] == "-P proj -R 'select[mem>8000]'"
        assert job.resources["cpus"] == 4

    def test_worker_path_validation_failure_names_parameter(self, tmp_path, monkeypatch):
        from fileglancer import database as db
        with pytest.raises(ValueError, match="Parameter 'Input': not readable"):
            self._submit(
                tmp_path, monkeypatch,
                entry_point={
                    "parameters": [{"flag": "--input", "name": "Input", "type": "file"}],
                },
                parameters={"input": str(tmp_path / "missing.txt")},
                file_share_mounts=[str(tmp_path)],
                validate_errors={"0": "not readable"},
            )
        # Validation runs before the job row is created — nothing to clean up.
        with db.get_db_session(f"sqlite:///{tmp_path / 'jobs.db'}") as session:
            assert session.query(db.JobDB).count() == 0
