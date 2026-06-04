# Spec: Dependency Range Update Utility

Status: **draft** · Owner: TBD · Origin: manual process in PR #381

## 1. Goal

Automate bumping the Python dependency **version ranges** in `pyproject.toml` so
they include the latest released versions, following the repo's existing
convention, keeping the PyPI (`[project]`) and conda (`[tool.pixi]`) specs in
sync, regenerating `pixi.lock`, validating with tests, and producing a
reviewable PR.

This replaces the hand process used for PR #381 (`chore(deps): update dependency
ranges to include latest releases`).

## 2. Why a script, and where Renovate fits

We evaluated Renovate first. Findings (verified, not assumed):

- Renovate's **pixi/conda manager *can* lift caps** (`>=0.119.1,<0.120 →
  >=0.136.3,<0.137`) and regenerate `pixi.lock` in-branch via
  `postUpgradeTasks`. Confirmed on a real Renovate PR.
- Renovate's **pep621/pep440 manager *cannot* rewrite a two-sided `>=x,<y` cap**
  (or `~=`) when the new version is past the cap — it returns
  `skipReason: invalid-value` under `bump`, `widen`, **and** `replace`.
  Confirmed on a real Renovate PR and in isolated tests with successful
  lookups.

Consequence: Renovate alone **cannot** keep `[project]` and `[tool.pixi]` in
sync across a cap, which is exactly what this repo's convention requires. So the
reusable core is a script that (at minimum) rewrites the `[project]` specs.

Three workflow options (see §10):
- **A. Script-only** — the script does everything. *Recommended to start.*
- **B. Hybrid** — Renovate loosens the conda specs + regenerates the lock on a
  schedule; a thin step (this script's "sync `[project]` from `[tool.pixi]`"
  logic, run as a `postUpgradeTasks`) mirrors the result into `[project]`.
- **C. Renovate + regex custom manager** for `[project]` — possible but hacky
  (templates can't compute "next minor"). Not recommended.

## 3. Scope

**In scope** — dependency tables in `pyproject.toml`:
- `[project].dependencies`, `[project.optional-dependencies].*`
- `[dependency-groups].*`
- `[tool.pixi.dependencies]`
- `[tool.pixi.feature.*.dependencies]`

**Out of scope (default):**
- Toolchain pins: `python`, `nodejs`, `pip` (and `[tool.pixi.feature.py312]`
  `python = "3.12.*"`). Never touch `requires-python`.
- Frontend npm deps (`frontend/package.json`) — separate ecosystem; possible
  follow-on.
- Editing application source for breaking changes.

## 4. Conventions to follow

1. Target spec shape: **`>=LATEST,<NEXT`**, where `NEXT` =
   - `0.(minor+1)` when `LATEST` is `0.x` (0ver: next minor), else
   - `(major+1)` (next major).
   Per-package override allowed (see §8 config).
2. **`[project]` and `[tool.pixi.dependencies]` stay in sync** — identical
   version string for the same package.
3. **Preserve each spec's shape:**
   - `>=a,<b`  → rewrite to `>=latest,<next`
   - `>=a`     (open) → **leave unchanged** by default (already includes latest);
     `--bump-open-floors` raises the floor to `>=latest`.
   - anything not starting with `>=` (`==`, `~=`, `3.12.*`, path/table deps,
     unpinned) → **skip**.
4. Strip extras/markers when reading the name (`uvicorn[standard]` → `uvicorn`);
   rewrite the version portion only.

## 5. Version resolution

For each in-scope package, determine the **target version**:

| Package appears in | Source of "latest" |
|---|---|
| any `[tool.pixi.*]` table (conda) | conda-forge |
| both `[project]` and a conda table (synced) | **conda-forge** (binding for the lock); use for *both* specs |
| `[project]`/`[dependency-groups]` only (e.g. `x2s3`, `py-cluster-api`, `build`) | PyPI |

Rules:
- Exclude pre-releases (unless `--allow-prerelease`).
- conda-forge frequently **lags** PyPI. Cap synced packages at the
  conda-available version so the two specs stay in sync and `pixi.lock`
  resolves; **report the divergence** (e.g. "uvicorn: PyPI 0.49.0 ahead of
  conda-forge 0.48.0") so a human can decide whether to split the specs.
- Registry "latest" is a *proposal*; the authoritative check is whether
  `pixi lock` can resolve it (§7). If lock fails for a package, back it off and
  report.
- Name mapping: conda name may differ from PyPI name — support a `name_map`
  override (rare here; watch `psycopg2-binary`).

## 6. Algorithm

1. Read `pyproject.toml` structure with `tomllib`; enumerate `(section, name,
   current_spec)` and classify conda vs pypi-only vs synced.
2. Apply excludes/filters (`--exclude`, `--only`).
3. Resolve target versions (§5) with retries/backoff for flaky registries.
4. Compute new spec per §4; skip no-ops.
5. Rewrite `pyproject.toml` via **anchored, targeted regex** replacements
   (preserve formatting/comments — do *not* round-trip through a TOML writer):
   - `[project]`-style: `"name >=…"` (name + space) → avoids matching
     `pydantic` vs `pydantic-settings`.
   - pixi table key: `(?m)^name = "…"`.
   - `[dependency-groups]` quoted no-space form: `"name>=…"`.
   Sync `[project]` and `[tool.pixi.dependencies]`.
6. Regenerate `pixi.lock` (`pixi lock`); on failure, surface the conflict and
   optionally retry without the offending bump.
7. Validate (§9).
8. Emit summary (§nine output).

## 7. Lockfile / build considerations

- `pixi.lock` **must** be regenerated after editing the manifest (any manifest
  change invalidates `pixi install --locked`, which CI runs).
- The editable `fileglancer` pypi-dependency means `pixi` must **build** the
  package to resolve PyPI deps. Therefore:
  - Run in a **full checkout** (needs `frontend/package.json` for the
    hatch-nodejs version hook); a stripped temp dir fails.
  - `pixi lock --no-install` / `pixi upgrade --dry-run` **cannot** resolve (they
    refuse to build the editable dep). Use a real `pixi lock`.
- `pixi` binary must be on `PATH`.

## 8. CLI / configuration

```
pixi run python scripts/bump_deps.py [options]
```

Options:
- `--dry-run` (default) — print proposed changes; no writes.
- `--write` — apply to `pyproject.toml`.
- `--lock` — run `pixi lock` after writing.
- `--test` — run the backend test suite after locking.
- `--exclude PKG…` — default `{python, nodejs, pip}`.
- `--only PKG…` — restrict to these packages.
- `--bump-open-floors` — also raise floors of open `>=x` specs.
- `--allow-prerelease`.
- `--json` — machine-readable output (for CI / hybrid use).

Optional config block (in `pyproject.toml`, e.g. `[tool.bump-deps]`):
```toml
[tool.bump-deps]
exclude = ["python", "nodejs", "pip"]
name_map = { }                 # pypi_name -> conda_name overrides
cap_policy = { fastapi = "minor", pandas = "major" }   # per-pkg NEXT override
```

## 9. Validation & output

- **Tests:** `pixi run -e test test-backend`. Note: suite collection currently
  breaks on **stray untracked test files** (e.g. `tests/test_ssh_app.py`
  importing a module not on the branch). Run on a **clean checkout** (git
  worktree / stash) or pass `--ignore` for stray files. Frontend is unaffected
  by Python bumps; leave to CI.
- **Output** (human): a table of `package | current → new | source | notes`,
  plus sections for *skipped*, *already-latest*, and *PyPI-ahead-of-conda*
  divergences, and prominent flagging of **major bumps**.

## 10. PR workflow (optional `--pr`, or a thin wrapper)

- Branch off `main`; commit **only** `pyproject.toml` + `pixi.lock`.
- Push to the fork over HTTPS using a token (SSH may be unavailable in CI).
- Use `--no-verify`: the Lefthook pre-push Prettier hook fails on unrelated
  stray/working-tree files, and this change is Python-only.
- Open a (draft) PR to `JaneliaSciComp/fileglancer:main` with a body listing
  runtime/dev bumps, notable majors, and conda-vs-PyPI divergences.

## 11. Edge cases & risks

- **Major bumps** (pandas 2→3, cachetools 6→7, pytest 8→9) may break code;
  the test step is the guard — surface majors loudly.
- First-party packages (`x2s3`, `py-cluster-api`) are **PyPI-only** (not on
  conda-forge).
- conda/PyPI **name** or **version** divergence (§5).
- Extras/markers in specs; environment markers.
- Never bump `python` / `requires-python`.
- Per-package cap policy (0ver vs semver) may need overriding.

## 12. Non-goals

- Resolving breaking-change fallout in source code.
- Frontend/npm updates.
- Replacing Renovate for non-pyproject ecosystems.

## 13. Open questions

1. Default for open `>=x` specs: leave (current default) or bump floor?
2. Should the script own PR creation, or only edit + lock and leave git to a
   wrapper / CI?
3. Adopt the hybrid Renovate workflow (§2 option B) for scheduled runs, or keep
   it on-demand?
4. Source of truth for "latest": registry query (fast, may propose
   un-installable versions) vs. pixi-resolved (authoritative, heavier)?
