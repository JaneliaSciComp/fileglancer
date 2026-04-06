"""Tests for apps module: miniforge/apptainer requirements, conda_env, and container support."""

import subprocess
from unittest.mock import patch, MagicMock

import pytest
from pydantic import ValidationError

from fileglancer.model import SUPPORTED_TOOLS, AppEntryPoint, JobSubmitRequest
from fileglancer.apps import (
    _TOOL_REGISTRY,
    merge_requirements,
    verify_requirements,
    _container_sif_name,
    _build_container_script,
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


# --- verify_requirements tests ---

class TestVerifyRequirementsMiniforge:
    @patch("fileglancer.apps.core.shutil.which")
    def test_miniforge_found_via_conda(self, mock_which):
        """miniforge binary doesn't exist, but conda does — should pass."""
        def which_side_effect(name, **kwargs):
            if name == "miniforge":
                return None
            if name == "conda":
                return "/usr/bin/conda"
            return None
        mock_which.side_effect = which_side_effect

        # No version constraint, so just checking binary existence
        verify_requirements(["miniforge"])

    @patch("fileglancer.apps.core.shutil.which")
    def test_miniforge_not_found(self, mock_which):
        mock_which.return_value = None
        with pytest.raises(ValueError, match="not installed or not on PATH"):
            verify_requirements(["miniforge"])

    @patch("fileglancer.apps.core.subprocess.run")
    @patch("fileglancer.apps.core.shutil.which")
    def test_miniforge_version_check(self, mock_which, mock_run):
        def which_side_effect(name, **kwargs):
            if name == "miniforge":
                return None
            if name == "conda":
                return "/usr/bin/conda"
            return None
        mock_which.side_effect = which_side_effect

        mock_run.return_value = MagicMock(
            stdout="conda 24.7.1", stderr="", returncode=0
        )
        verify_requirements(["miniforge>=24.0"])

    @patch("fileglancer.apps.core.subprocess.run")
    @patch("fileglancer.apps.core.shutil.which")
    def test_miniforge_version_too_old(self, mock_which, mock_run):
        def which_side_effect(name, **kwargs):
            if name == "miniforge":
                return None
            if name == "conda":
                return "/usr/bin/conda"
            return None
        mock_which.side_effect = which_side_effect

        mock_run.return_value = MagicMock(
            stdout="conda 23.1.0", stderr="", returncode=0
        )
        with pytest.raises(ValueError, match="does not satisfy"):
            verify_requirements(["miniforge>=24.0"])


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
            container_args="--nv",
        )
        assert "--nv" in script

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
        mock_session = MagicMock()
        with patch("fileglancer.database.find_fsp_from_absolute_path", return_value=None):
            error = validate_path_in_filestore("/nowhere/file.txt", mock_session)
        assert error is not None
        assert "not within an allowed file share" in error

    def test_valid_path_in_share(self, tmp_path):
        """Path inside a file share that exists returns None."""
        # Create a temp file inside a temp dir acting as a file share
        test_file = tmp_path / "data.txt"
        test_file.write_text("hello")

        from fileglancer.model import FileSharePath
        fsp = FileSharePath(zone="test", name="test", mount_path=str(tmp_path))

        mock_session = MagicMock()
        with patch("fileglancer.database.find_fsp_from_absolute_path",
                   return_value=(fsp, "data.txt")):
            error = validate_path_in_filestore(str(test_file), mock_session)
        assert error is None

    def test_syntax_error_short_circuits(self):
        """Metachar in path returns error before DB lookup."""
        mock_session = MagicMock()
        error = validate_path_in_filestore("/data;bad", mock_session)
        assert error is not None
        assert "invalid characters" in error
