#!/usr/bin/env python
"""Bump Python dependency *version ranges* in ``pyproject.toml``.

Automates the manual process from PR #381: for each in-scope dependency, look up
the latest released version and rewrite its range so it includes that version,
following the repo convention ``>=LATEST,<NEXT`` while keeping the PyPI
(``[project]``) and conda (``[tool.pixi]``) specs byte-identical. After writing,
optionally regenerate ``pixi.lock`` and run the backend test suite.

See ``docs/dependency-update-spec.md`` for the full design.

Version sources (spec §5):
  * packages on conda-forge (anything in a ``[tool.pixi.*]`` table, and synced
    packages) -> ``pixi search <name> -c conda-forge`` (binding for the lock);
  * PyPI-only packages (e.g. ``x2s3``, ``py-cluster-api``, ``build``) -> PyPI JSON.

This script only edits the manifest, locks, and tests. Git/PR creation is left to
a wrapper or CI (spec §10 option A).
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import click
from loguru import logger
from packaging.version import InvalidVersion, Version

REPO_ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = REPO_ROOT / "pyproject.toml"

# Toolchain pins we never touch (spec §3). Extendable via [tool.bump-deps].exclude.
DEFAULT_EXCLUDE = {"python", "nodejs", "pip"}

PYPI_JSON_URL = "https://pypi.org/pypi/{name}/json"

# Splits a PEP 508 requirement string into (name[extras], rest). ``rest`` holds
# the version specifier and any environment marker.
_REQ_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(.*)$")


# --------------------------------------------------------------------------- #
# Pure helpers (no I/O — unit tested)
# --------------------------------------------------------------------------- #
@dataclass
class SpecInfo:
    """Classification of a single version specifier string."""

    kind: str  # "capped" | "open" | "skip"
    floor: Optional[str] = None  # version after ">="
    cap: Optional[str] = None  # version after "<"
    raw: str = ""


def split_requirement(entry: str) -> tuple[str, str]:
    """Split a PEP 508 string into (canonical_name, version_spec).

    Strips extras and environment markers; returns the version portion only.

        "uvicorn[standard] >=0.48.0,<0.49 ; python_version>='3.9'"
            -> ("uvicorn", ">=0.48.0,<0.49")
    """
    m = _REQ_RE.match(entry)
    if not m:
        return entry.strip(), ""
    name = m.group(1)
    rest = m.group(3) or ""
    # Drop environment markers.
    spec = rest.split(";", 1)[0].strip()
    return name, spec


def parse_spec(spec: str) -> SpecInfo:
    """Classify a version specifier per spec §4.3.

    ``>=a,<b`` -> capped; ``>=a`` -> open; anything else (``==``, ``~=``,
    ``3.12.*``, table/path deps, unpinned) -> skip.
    """
    s = spec.strip()
    if not s.startswith(">="):
        return SpecInfo(kind="skip", raw=spec)
    parts = [p.strip() for p in s.split(",")]
    floor = parts[0][2:].strip()
    if not floor:
        return SpecInfo(kind="skip", raw=spec)
    if len(parts) == 1:
        return SpecInfo(kind="open", floor=floor, raw=spec)
    if len(parts) == 2 and parts[1].startswith("<") and not parts[1].startswith("<="):
        cap = parts[1][1:].strip()
        return SpecInfo(kind="capped", floor=floor, cap=cap, raw=spec)
    # Multiple constraints or "<=" cap: leave it alone.
    return SpecInfo(kind="skip", raw=spec)


def compute_next(latest: Version, policy: Optional[str] = None) -> str:
    """Compute the exclusive upper bound NEXT for a target version (spec §4.1).

    Default: 0ver-aware — ``0.x`` bumps the minor, otherwise bump the major.
    ``policy`` ("minor"/"major") overrides per-package via [tool.bump-deps].
    """
    if policy == "major":
        return str(latest.major + 1)
    if policy == "minor":
        if latest.major == 0:
            return f"0.{latest.minor + 1}"
        return f"{latest.major}.{latest.minor + 1}"
    # Default convention.
    if latest.major == 0:
        return f"0.{latest.minor + 1}"
    return str(latest.major + 1)


def compute_new_spec(
    info: SpecInfo,
    latest: Version,
    policy: Optional[str] = None,
    bump_open_floors: bool = False,
) -> Optional[str]:
    """Compute the new specifier string, or ``None`` for a no-op / skip.

    Preserves each spec's shape (spec §4.3):
      * ``>=a,<b`` -> ``>=latest,<next``
      * ``>=a``    -> unchanged, unless ``bump_open_floors`` -> ``>=latest``
      * skip       -> ``None``
    """
    if info.kind == "skip":
        return None
    if info.kind == "open":
        if not bump_open_floors:
            return None
        new = f">={latest}"
        return new if new != info.raw.strip() else None
    # capped
    next_cap = compute_next(latest, policy)
    new = f">={latest},<{next_cap}"
    return new if new != info.raw.strip() else None


# --------------------------------------------------------------------------- #
# Enumeration
# --------------------------------------------------------------------------- #
@dataclass
class DepRef:
    """A single occurrence of a dependency in some manifest table."""

    name: str
    spec: str
    table: str  # human label, e.g. "project", "pixi", "pixi.feature.test"
    form: str  # "project" | "pixi_key" | "group_quoted"


def _project_deps(doc: dict) -> list[tuple[str, str]]:
    return list(doc.get("project", {}).get("dependencies", []) or [])


def enumerate_deps(doc: dict) -> list[DepRef]:
    """Walk the in-scope tables (spec §3) yielding a DepRef per occurrence."""
    refs: list[DepRef] = []

    # [project].dependencies  (PEP 508 strings, "name >=...")
    for entry in _project_deps(doc):
        name, spec = split_requirement(entry)
        refs.append(DepRef(name=name, spec=spec, table="project", form="project"))

    pixi = doc.get("tool", {}).get("pixi", {})

    # [tool.pixi.dependencies]
    for name, spec in (pixi.get("dependencies", {}) or {}).items():
        if isinstance(spec, str):
            refs.append(DepRef(name=name, spec=spec, table="pixi", form="pixi_key"))

    # [tool.pixi.feature.*.dependencies]
    for feat_name, feat in (pixi.get("feature", {}) or {}).items():
        for name, spec in (feat.get("dependencies", {}) or {}).items():
            if isinstance(spec, str):
                refs.append(
                    DepRef(
                        name=name,
                        spec=spec,
                        table=f"pixi.feature.{feat_name}",
                        form="pixi_key",
                    )
                )

    # [dependency-groups].*  (PEP 508 strings, often "name>=..." no space)
    for group_name, members in (doc.get("dependency-groups", {}) or {}).items():
        for entry in members or []:
            if not isinstance(entry, str):
                continue  # skip {include-group = ...} tables
            name, spec = split_requirement(entry)
            refs.append(
                DepRef(
                    name=name,
                    spec=spec,
                    table=f"group.{group_name}",
                    form="group_quoted",
                )
            )

    return refs


def classify_sources(refs: list[DepRef], doc: dict) -> dict[str, str]:
    """Map each package name to a source category: synced | conda | pypi_only."""
    project_names = {split_requirement(e)[0] for e in _project_deps(doc)}
    pixi_main = set((doc.get("tool", {}).get("pixi", {}).get("dependencies", {}) or {}))

    conda_names: set[str] = set()
    for r in refs:
        if r.form == "pixi_key":
            conda_names.add(r.name)

    categories: dict[str, str] = {}
    for r in refs:
        if r.name in categories:
            continue
        if r.name in project_names and r.name in pixi_main:
            categories[r.name] = "synced"
        elif r.name in conda_names:
            categories[r.name] = "conda"
        else:
            categories[r.name] = "pypi_only"
    return categories


# --------------------------------------------------------------------------- #
# Version resolution (network — mocked in tests)
# --------------------------------------------------------------------------- #
def _max_version(versions: list[Version], allow_prerelease: bool) -> Optional[Version]:
    candidates = [v for v in versions if allow_prerelease or not v.is_prerelease]
    return max(candidates) if candidates else None


def conda_latest(name: str, allow_prerelease: bool = False) -> Optional[Version]:
    """Latest conda-forge version via ``pixi search`` (spec §5)."""
    try:
        proc = subprocess.run(
            ["pixi", "search", name, "-c", "conda-forge"],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.warning("pixi search failed for {}: {}", name, exc)
        return None
    if proc.returncode != 0:
        logger.debug("pixi search non-zero for {}: {}", name, proc.stderr.strip())
        return None

    versions: list[Version] = []
    for line in proc.stdout.splitlines():
        stripped = line.strip()
        # The matched (newest) block has a "Version    X.Y.Z" field; the
        # "Other Versions" table lists older ones in the first column.
        if stripped.startswith("Version"):
            tokens = stripped.split()
            if len(tokens) >= 2:
                try:
                    versions.append(Version(tokens[1]))
                except InvalidVersion:
                    pass
        else:
            tok = stripped.split()
            if tok:
                try:
                    versions.append(Version(tok[0]))
                except InvalidVersion:
                    pass
    return _max_version(versions, allow_prerelease)


def pypi_latest(name: str, allow_prerelease: bool = False) -> Optional[Version]:
    """Latest PyPI version from the JSON API, skipping fully-yanked releases."""
    url = PYPI_JSON_URL.format(name=name)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        logger.warning("PyPI lookup failed for {}: {}", name, exc)
        return None

    versions: list[Version] = []
    for ver, files in (data.get("releases", {}) or {}).items():
        if files and all(f.get("yanked") for f in files):
            continue  # entirely yanked
        try:
            versions.append(Version(ver))
        except InvalidVersion:
            continue
    return _max_version(versions, allow_prerelease)


@dataclass
class Target:
    """Resolved target version for a package."""

    name: str
    category: str
    version: Optional[Version]
    source: str  # "conda-forge" | "PyPI" | "unresolved"
    note: str = ""


def resolve_target(
    name: str,
    category: str,
    allow_prerelease: bool,
    name_map: dict[str, str],
) -> Target:
    """Resolve the binding target version + report conda/PyPI divergence (spec §5)."""
    if category in ("synced", "conda"):
        conda_name = name_map.get(name, name)
        cv = conda_latest(conda_name, allow_prerelease)
        note = ""
        if category == "synced":
            pv = pypi_latest(name, allow_prerelease)
            if pv and cv and pv > cv:
                note = f"PyPI {pv} ahead of conda-forge {cv}"
        if cv is None:
            return Target(name, category, None, "unresolved", "not found on conda-forge")
        return Target(name, category, cv, "conda-forge", note)

    # pypi_only
    pv = pypi_latest(name, allow_prerelease)
    if pv is None:
        return Target(name, category, None, "unresolved", "not found on PyPI")
    return Target(name, category, pv, "PyPI", "")


# --------------------------------------------------------------------------- #
# Rewrite (targeted, formatting-preserving — spec §6.5)
# --------------------------------------------------------------------------- #
@dataclass
class Change:
    name: str
    old_spec: str
    new_spec: str
    source: str
    tables: list[str] = field(default_factory=list)
    is_major: bool = False
    note: str = ""


def _rewrite_one(text: str, ref: DepRef, new_spec: str) -> str:
    """Apply a single spec rewrite for ``ref`` to the raw manifest text.

    Uses anchored matches keyed on the package name so e.g. ``pydantic`` never
    matches inside ``pydantic-settings``. Asserts exactly one substitution.
    """
    if ref.form == "pixi_key":
        # ^name = ">=..."
        pattern = re.compile(
            r'(?m)^(\s*' + re.escape(ref.name) + r'\s*=\s*")'
            + re.escape(ref.spec)
            + r'(")'
        )
        repl = r"\g<1>" + new_spec.replace("\\", "\\\\") + r"\g<2>"
    elif ref.form == "project":
        # "name <spec>"  (name followed by whitespace, inside quotes)
        pattern = re.compile(
            r'("' + re.escape(ref.name) + r'(?:\[[^\]]*\])?\s+)'
            + re.escape(ref.spec)
        )
        repl = r"\g<1>" + new_spec.replace("\\", "\\\\")
    else:  # group_quoted: "name>=..." (no space)
        pattern = re.compile(
            r'("' + re.escape(ref.name) + r'(?:\[[^\]]*\])?)'
            + re.escape(ref.spec)
        )
        repl = r"\g<1>" + new_spec.replace("\\", "\\\\")

    new_text, n = pattern.subn(repl, text)
    if n != 1:
        raise RuntimeError(
            f"expected exactly 1 rewrite for {ref.name} in {ref.table} "
            f"({ref.form}), found {n}"
        )
    return new_text


def apply_changes(text: str, refs: list[DepRef], new_specs: dict[str, str]) -> str:
    """Rewrite every in-scope ref whose package has a new spec."""
    for ref in refs:
        new_spec = new_specs.get(ref.name)
        if new_spec is None:
            continue
        # Only rewrite refs whose current spec is itself capped/open and differs.
        info = parse_spec(ref.spec)
        if info.kind == "skip" or new_spec == ref.spec.strip():
            continue
        text = _rewrite_one(text, ref, new_spec)
    return text


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
@dataclass
class Config:
    exclude: set[str]
    name_map: dict[str, str]
    cap_policy: dict[str, str]


def load_config(doc: dict) -> Config:
    block = doc.get("tool", {}).get("bump-deps", {}) or {}
    exclude = set(DEFAULT_EXCLUDE) | set(block.get("exclude", []) or [])
    name_map = dict(block.get("name_map", {}) or {})
    cap_policy = dict(block.get("cap_policy", {}) or {})
    return Config(exclude=exclude, name_map=name_map, cap_policy=cap_policy)


# --------------------------------------------------------------------------- #
# Orchestration helpers
# --------------------------------------------------------------------------- #
def plan_changes(
    doc: dict,
    cfg: Config,
    only: set[str],
    extra_exclude: set[str],
    allow_prerelease: bool,
    bump_open_floors: bool,
) -> tuple[list[Change], list[DepRef], dict[str, str], list[tuple[str, str]]]:
    """Resolve targets and compute the set of changes.

    Returns ``(changes, refs, new_specs, skipped)`` where ``skipped`` is a list
    of ``(name, reason)`` for reporting.
    """
    refs = enumerate_deps(doc)
    categories = classify_sources(refs, doc)

    exclude = cfg.exclude | extra_exclude
    names = sorted({r.name for r in refs})
    selected = [
        n for n in names if n not in exclude and (not only or n in only)
    ]

    # Resolve targets in parallel (each conda lookup spawns a pixi subprocess).
    targets: dict[str, Target] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {
            pool.submit(
                resolve_target, n, categories[n], allow_prerelease, cfg.name_map
            ): n
            for n in selected
        }
        for fut in futs:
            t = fut.result()
            targets[t.name] = t

    changes: list[Change] = []
    new_specs: dict[str, str] = {}
    skipped: list[tuple[str, str]] = []

    # Group refs by name to compute one new spec per package (shapes match across
    # tables in practice; we use the [project]/pixi ref as the shape reference).
    by_name: dict[str, list[DepRef]] = {}
    for r in refs:
        by_name.setdefault(r.name, []).append(r)

    for name in selected:
        target = targets.get(name)
        pkg_refs = by_name[name]
        if target is None or target.version is None:
            skipped.append((name, target.note if target else "unresolved"))
            continue

        # Pick a representative ref for shape (prefer a capped one).
        infos = [(r, parse_spec(r.spec)) for r in pkg_refs]
        capped = [(r, i) for r, i in infos if i.kind == "capped"]
        open_ = [(r, i) for r, i in infos if i.kind == "open"]
        if capped:
            ref, info = capped[0]
        elif open_:
            ref, info = open_[0]
        else:
            skipped.append((name, f"unsupported spec ({pkg_refs[0].spec!r})"))
            continue

        policy = cfg.cap_policy.get(name)
        try:
            floor_v = Version(info.floor) if info.floor else None
        except InvalidVersion:
            floor_v = None
        if floor_v is not None and target.version < floor_v:
            skipped.append(
                (name, f"registry {target.version} behind current floor {floor_v}")
            )
            continue

        new_spec = compute_new_spec(info, target.version, policy, bump_open_floors)
        if new_spec is None:
            continue  # already latest / open floor left as-is
        new_specs[name] = new_spec

        is_major = info.kind == "capped" and info.cap is not None and (
            _is_major_bump(info.cap, target.version)
        )
        changes.append(
            Change(
                name=name,
                old_spec=info.raw.strip(),
                new_spec=new_spec,
                source=target.source,
                tables=sorted({r.table for r in pkg_refs}),
                is_major=is_major,
                note=target.note,
            )
        )

    return changes, refs, new_specs, skipped


def _is_major_bump(old_cap: str, latest: Version) -> bool:
    """Heuristic: does ``latest`` cross the previous upper bound's major?"""
    try:
        cap_v = Version(old_cap)
    except InvalidVersion:
        return False
    # old cap like "8" means previous major was 7; latest.major >= cap implies bump.
    if latest.major == 0:
        return False
    return latest.major >= cap_v.major


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #
def render_human(
    changes: list[Change],
    skipped: list[tuple[str, str]],
    divergences: list[Change],
    selected_count: int,
) -> str:
    lines: list[str] = []
    lines.append("")
    if changes:
        lines.append(f"Proposed changes ({len(changes)}):")
        width = max(len(c.name) for c in changes)
        for c in changes:
            flag = "  ⚠ MAJOR" if c.is_major else ""
            note = f"  [{c.note}]" if c.note else ""
            lines.append(
                f"  {c.name:<{width}}  {c.old_spec}  →  {c.new_spec}"
                f"  ({c.source}){flag}{note}"
            )
    else:
        lines.append("No changes proposed — all in-scope specs already include the latest.")

    majors = [c for c in changes if c.is_major]
    if majors:
        lines.append("")
        lines.append(f"⚠ MAJOR bumps ({len(majors)}) — review for breaking changes:")
        for c in majors:
            lines.append(f"  {c.name}: {c.old_spec} → {c.new_spec}")

    if divergences:
        lines.append("")
        lines.append("PyPI ahead of conda-forge (specs kept in sync at conda version):")
        for c in divergences:
            lines.append(f"  {c.name}: {c.note}")

    if skipped:
        lines.append("")
        lines.append(f"Skipped ({len(skipped)}):")
        for name, reason in skipped:
            lines.append(f"  {name}: {reason}")

    return "\n".join(lines)


def render_json(
    changes: list[Change],
    skipped: list[tuple[str, str]],
) -> str:
    payload = {
        "changes": [
            {
                "name": c.name,
                "old": c.old_spec,
                "new": c.new_spec,
                "source": c.source,
                "tables": c.tables,
                "major": c.is_major,
                "note": c.note,
            }
            for c in changes
        ],
        "skipped": [{"name": n, "reason": r} for n, r in skipped],
    }
    return json.dumps(payload, indent=2)


# --------------------------------------------------------------------------- #
# Subprocess steps
# --------------------------------------------------------------------------- #
def run_lock() -> bool:
    """Regenerate pixi.lock with a real ``pixi lock`` (spec §7)."""
    logger.info("Running 'pixi lock' ...")
    proc = subprocess.run(["pixi", "lock"], cwd=REPO_ROOT)
    if proc.returncode != 0:
        logger.error(
            "pixi lock failed — a bump likely conflicts. Re-run with --exclude on "
            "the offending package, or split its [project]/[tool.pixi] specs."
        )
        return False
    return True


def run_tests() -> bool:
    """Run the backend test suite (spec §9).

    Note: collection can break on stray untracked test files; run on a clean
    checkout or remove/ignore them first.
    """
    logger.info("Running backend tests ('pixi run -e test test-backend') ...")
    proc = subprocess.run(
        ["pixi", "run", "-e", "test", "test-backend"], cwd=REPO_ROOT
    )
    return proc.returncode == 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
@click.command()
@click.option("--write", is_flag=True, help="Apply changes to pyproject.toml (default: dry-run).")
@click.option("--dry-run", is_flag=True, help="Force dry-run even if --write is given.")
@click.option("--lock", is_flag=True, help="Run 'pixi lock' after writing.")
@click.option("--test", "run_test", is_flag=True, help="Run the backend test suite after locking.")
@click.option("--exclude", multiple=True, help="Extra package(s) to skip (adds to defaults).")
@click.option("--only", multiple=True, help="Restrict to these package(s).")
@click.option("--bump-open-floors", is_flag=True, help="Raise floors of open '>=x' specs to '>=latest'.")
@click.option("--allow-prerelease", is_flag=True, help="Consider pre-release versions.")
@click.option("--json", "as_json", is_flag=True, help="Machine-readable JSON output.")
def main(
    write: bool,
    dry_run: bool,
    lock: bool,
    run_test: bool,
    exclude: tuple[str, ...],
    only: tuple[str, ...],
    bump_open_floors: bool,
    allow_prerelease: bool,
    as_json: bool,
) -> None:
    """Bump dependency version ranges in pyproject.toml to include latest releases."""
    write_mode = write and not dry_run

    raw = PYPROJECT.read_text()
    doc = tomllib.loads(raw)
    cfg = load_config(doc)

    changes, refs, new_specs, skipped = plan_changes(
        doc=doc,
        cfg=cfg,
        only=set(only),
        extra_exclude=set(exclude),
        allow_prerelease=allow_prerelease,
        bump_open_floors=bump_open_floors,
    )
    divergences = [c for c in changes if c.note]

    if as_json:
        click.echo(render_json(changes, skipped))
    else:
        selected_count = len({r.name for r in refs})
        click.echo(render_human(changes, skipped, divergences, selected_count))

    if not changes:
        return

    if not write_mode:
        if not as_json:
            click.echo("\n(dry-run — pass --write to apply)")
        return

    new_text = apply_changes(raw, refs, new_specs)
    PYPROJECT.write_text(new_text)
    logger.info("Wrote {} change(s) to {}", len(changes), PYPROJECT)

    if lock:
        if not run_lock():
            sys.exit(1)
    elif not as_json:
        click.echo("\n(remember to run 'pixi lock' — pass --lock to do it now)")

    if run_test:
        if not lock:
            logger.warning("--test without --lock: testing against a stale lockfile.")
        if not run_tests():
            logger.error("Backend tests failed.")
            sys.exit(1)


if __name__ == "__main__":
    main()
