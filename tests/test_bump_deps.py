"""Unit tests for scripts/bump_deps.py (pure logic; network/pixi mocked)."""

import sys
import tomllib
from pathlib import Path

import pytest
from packaging.version import Version

# scripts/ is not a package — make it importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import bump_deps as bd  # noqa: E402


# --------------------------------------------------------------------------- #
# split_requirement
# --------------------------------------------------------------------------- #
def test_split_requirement_basic():
    """Name and spec split on whitespace."""
    assert bd.split_requirement("alembic >=1.18.4,<2") == ("alembic", ">=1.18.4,<2")


def test_split_requirement_no_space():
    """[dependency-groups] no-space form."""
    assert bd.split_requirement("build>=1.5.0,<2") == ("build", ">=1.5.0,<2")


def test_split_requirement_strips_extras():
    """Extras are dropped from the name (spec §4.4)."""
    assert bd.split_requirement("uvicorn[standard] >=0.48.0,<0.49") == (
        "uvicorn",
        ">=0.48.0,<0.49",
    )


def test_split_requirement_strips_markers():
    """Environment markers are dropped from the spec."""
    name, spec = bd.split_requirement("foo >=1.0,<2 ; python_version>='3.9'")
    assert name == "foo"
    assert spec == ">=1.0,<2"


# --------------------------------------------------------------------------- #
# parse_spec
# --------------------------------------------------------------------------- #
def test_parse_spec_capped():
    info = bd.parse_spec(">=1.18.4,<2")
    assert info.kind == "capped"
    assert info.floor == "1.18.4"
    assert info.cap == "2"


def test_parse_spec_open():
    info = bd.parse_spec(">=24.0")
    assert info.kind == "open"
    assert info.floor == "24.0"
    assert info.cap is None


@pytest.mark.parametrize(
    "spec",
    ["==1.2.3", "~=2.0", "3.12.*", "1.2.3", "", ">=1,<=2", ">=1,<2,<3"],
)
def test_parse_spec_skip(spec):
    """Anything not a clean >=a or >=a,<b is skipped (spec §4.3)."""
    assert bd.parse_spec(spec).kind == "skip"


# --------------------------------------------------------------------------- #
# compute_next
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "version,expected",
    [
        ("0.48.0", "0.49"),  # 0ver -> next minor
        ("0.136.3", "0.137"),
        ("1.18.4", "2"),  # semver -> next major
        ("7.1.4", "8"),
        ("3.0.3", "4"),
    ],
)
def test_compute_next_default(version, expected):
    assert bd.compute_next(Version(version)) == expected


def test_compute_next_policy_override():
    """cap_policy can force minor/major regardless of 0ver."""
    assert bd.compute_next(Version("2.13.4"), policy="minor") == "2.14"
    assert bd.compute_next(Version("0.48.0"), policy="major") == "1"


# --------------------------------------------------------------------------- #
# compute_new_spec
# --------------------------------------------------------------------------- #
def test_compute_new_spec_capped():
    info = bd.parse_spec(">=0.119.1,<0.120")
    assert bd.compute_new_spec(info, Version("0.136.3")) == ">=0.136.3,<0.137"


def test_compute_new_spec_capped_semver():
    info = bd.parse_spec(">=6.2.1,<7")
    assert bd.compute_new_spec(info, Version("7.1.4")) == ">=7.1.4,<8"


def test_compute_new_spec_noop():
    """Already-latest spec yields no change."""
    info = bd.parse_spec(">=0.136.3,<0.137")
    assert bd.compute_new_spec(info, Version("0.136.3")) is None


def test_compute_new_spec_open_left_alone():
    """Open specs are unchanged by default."""
    info = bd.parse_spec(">=24.0")
    assert bd.compute_new_spec(info, Version("25.1")) is None


def test_compute_new_spec_open_bump_floor():
    """--bump-open-floors raises the floor but keeps it open."""
    info = bd.parse_spec(">=24.0")
    assert bd.compute_new_spec(info, Version("25.1"), bump_open_floors=True) == ">=25.1"


def test_compute_new_spec_skip():
    info = bd.parse_spec("==1.2.3")
    assert bd.compute_new_spec(info, Version("2.0.0")) is None


# --------------------------------------------------------------------------- #
# Rewrite
# --------------------------------------------------------------------------- #
SAMPLE = """\
[project]
dependencies = [
    "pydantic >=2.10.6,<3",
    "pydantic-settings >=2.11.0,<3",
    "uvicorn[standard] >=0.38.0,<0.39",
    "packaging >=24.0",
]

[tool.pixi.dependencies]
pydantic = ">=2.10.6,<3"
pydantic-settings = ">=2.11.0,<3"

[dependency-groups]
release = ["build>=1.5.0,<2"]
"""


def _doc():
    return tomllib.loads(SAMPLE)


def test_rewrite_project_form_disambiguates_prefix():
    """Rewriting pydantic must not touch pydantic-settings."""
    doc = _doc()
    refs = bd.enumerate_deps(doc)
    new_specs = {"pydantic": ">=2.13.4,<3"}
    out = bd.apply_changes(SAMPLE, refs, new_specs)
    assert '"pydantic >=2.13.4,<3"' in out
    assert '"pydantic-settings >=2.11.0,<3"' in out  # untouched
    assert 'pydantic = ">=2.13.4,<3"' in out  # pixi key synced
    assert 'pydantic-settings = ">=2.11.0,<3"' in out


def test_rewrite_extras_preserved():
    """Extras stay in the project string after a version rewrite."""
    doc = _doc()
    refs = bd.enumerate_deps(doc)
    out = bd.apply_changes(SAMPLE, refs, {"uvicorn": ">=0.48.0,<0.49"})
    assert '"uvicorn[standard] >=0.48.0,<0.49"' in out


def test_rewrite_group_quoted_form():
    """No-space [dependency-groups] form is rewritten in place."""
    doc = _doc()
    refs = bd.enumerate_deps(doc)
    out = bd.apply_changes(SAMPLE, refs, {"build": ">=1.6.0,<2"})
    assert '"build>=1.6.0,<2"' in out


def test_rewrite_idempotent():
    """Applying the same target twice is a no-op the second time."""
    doc = _doc()
    refs = bd.enumerate_deps(doc)
    new_specs = {"pydantic": ">=2.13.4,<3"}
    once = bd.apply_changes(SAMPLE, refs, new_specs)
    twice = bd.apply_changes(once, bd.enumerate_deps(tomllib.loads(once)), new_specs)
    assert once == twice


# --------------------------------------------------------------------------- #
# enumerate_deps / classify_sources
# --------------------------------------------------------------------------- #
def test_enumerate_and_classify():
    doc = _doc()
    refs = bd.enumerate_deps(doc)
    names = {r.name for r in refs}
    assert {"pydantic", "pydantic-settings", "uvicorn", "packaging", "build"} <= names

    cats = bd.classify_sources(refs, doc)
    assert cats["pydantic"] == "synced"  # in both [project] and [tool.pixi]
    assert cats["uvicorn"] == "pypi_only"  # only in [project] here
    assert cats["build"] == "pypi_only"  # [dependency-groups]


# --------------------------------------------------------------------------- #
# resolve_target (network mocked)
# --------------------------------------------------------------------------- #
def test_resolve_target_synced_uses_conda(monkeypatch):
    monkeypatch.setattr(bd, "conda_latest", lambda n, allow=False: Version("2.13.4"))
    monkeypatch.setattr(bd, "pypi_latest", lambda n, allow=False: Version("2.13.4"))
    t = bd.resolve_target("pydantic", "synced", False, {})
    assert t.source == "conda-forge"
    assert t.version == Version("2.13.4")
    assert t.note == ""


def test_resolve_target_reports_pypi_ahead(monkeypatch):
    """Synced package caps at conda version and notes the divergence (spec §5)."""
    monkeypatch.setattr(bd, "conda_latest", lambda n, allow=False: Version("0.48.0"))
    monkeypatch.setattr(bd, "pypi_latest", lambda n, allow=False: Version("0.49.0"))
    t = bd.resolve_target("uvicorn", "synced", False, {})
    assert t.version == Version("0.48.0")
    assert "ahead of conda-forge" in t.note


def test_resolve_target_pypi_only(monkeypatch):
    monkeypatch.setattr(bd, "pypi_latest", lambda n, allow=False: Version("1.3.0"))
    t = bd.resolve_target("x2s3", "pypi_only", False, {})
    assert t.source == "PyPI"
    assert t.version == Version("1.3.0")


def test_resolve_target_unresolved(monkeypatch):
    monkeypatch.setattr(bd, "conda_latest", lambda n, allow=False: None)
    monkeypatch.setattr(bd, "pypi_latest", lambda n, allow=False: None)
    t = bd.resolve_target("ghost", "conda", False, {})
    assert t.version is None
    assert t.source == "unresolved"


# --------------------------------------------------------------------------- #
# pypi_latest version selection
# --------------------------------------------------------------------------- #
def test_max_version_excludes_prerelease():
    versions = [Version("1.0.0"), Version("2.0.0rc1"), Version("1.5.0")]
    assert bd._max_version(versions, allow_prerelease=False) == Version("1.5.0")
    assert bd._max_version(versions, allow_prerelease=True) == Version("2.0.0rc1")
