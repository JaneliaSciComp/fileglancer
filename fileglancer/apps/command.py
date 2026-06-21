"""Requirement-check generation, path/parameter validation, and command building."""

import os
import re
import shlex

try:
    import pwd
except ImportError:
    pwd = None  # type: ignore[assignment]

from fileglancer import database as db
from fileglancer.model import (
    AppEntryPoint,
    AppParameter,
    AppParameterSection,
    _REQUIREMENT_PATTERN,
)


# --- Requirement Verification ---

_TOOL_REGISTRY = {
    "pixi": {
        "version_args": ["pixi", "--version"],
        "version_pattern": r"pixi (\S+)",
    },
    "npm": {
        "version_args": ["npm", "--version"],
        "version_pattern": r"^(\S+)$",
    },
    "maven": {
        "version_args": ["mvn", "--version"],
        "version_pattern": r"Apache Maven (\S+)",
    },
    "miniforge": {
        "version_args": ["conda", "--version"],
        "version_pattern": r"conda (\S+)",
    },
    "apptainer": {
        "version_args": ["apptainer", "--version"],
        "version_pattern": r"apptainer version (\S+)",
    },
    "nextflow": {
        "version_args": ["nextflow", "-version"],
        "version_pattern": r"version (\S+)",
    },
}

def merge_requirements(
    manifest_requirements: list[str], entry_point_requirements: list[str]
) -> list[str]:
    """Merge manifest-level and entry-point-level requirements.

    Entry-point requirements for the same tool override the manifest-level
    version spec (e.g. entry point 'pixi>=0.50' overrides manifest 'pixi>=0.40').
    Requirements are deduped by tool name, with entry-point taking precedence.
    """
    if not entry_point_requirements:
        return manifest_requirements
    if not manifest_requirements:
        return entry_point_requirements

    # Parse tool names from entry-point requirements
    ep_tools = set()
    for req in entry_point_requirements:
        match = _REQUIREMENT_PATTERN.match(req.strip())
        if match:
            ep_tools.add(match.group(1))

    # Keep manifest requirements that aren't overridden by entry-point
    merged = []
    for req in manifest_requirements:
        match = _REQUIREMENT_PATTERN.match(req.strip())
        if match and match.group(1) not in ep_tools:
            merged.append(req)
    merged.extend(entry_point_requirements)
    return merged


# Shared bash helpers for a requirements-check snippet. Each is emitted only
# when the generated checks actually call it (see build_requirements_check).
# Kept as module constants so they are easy to read and test.
_HELPER_CHECK_TOOL = r"""__fg_check_tool() {
  # $1 = tool name (for messages), $2 = binary to look for on PATH
  if command -v "$2" >/dev/null 2>&1; then return 0; fi
  __fg_errors+=("Required tool '$1' is not installed or not on PATH")
  return 1
}"""

# Emitted together since __fg_check_version depends on the other two.
_HELPER_CHECK_VERSION = r"""__fg_extract_version() { grep -oE '[0-9]+([.][0-9]+)*' | head -n1 || true; }
__fg_ver_le() {
  # returns 0 if $1 <= $2 (version order)
  [ "$1" = "$2" ] && return 0
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ]
}
__fg_check_version() {
  # $1=tool $2=installed $3=op $4=required
  local tool="$1" v="$2" op="$3" req="$4" ok=1
  if [ -z "$v" ]; then
    __fg_errors+=("Could not determine version for '$tool' to check $op$req")
    return 0
  fi
  case "$op" in
    ">=") __fg_ver_le "$req" "$v" && ok=0 ;;
    "<=") __fg_ver_le "$v" "$req" && ok=0 ;;
    ">")  { __fg_ver_le "$req" "$v" && [ "$v" != "$req" ]; } && ok=0 ;;
    "<")  { __fg_ver_le "$v" "$req" && [ "$v" != "$req" ]; } && ok=0 ;;
    "==") [ "$v" = "$req" ] && ok=0 ;;
    "!=") [ "$v" != "$req" ] && ok=0 ;;
  esac
  [ "$ok" -ne 0 ] && __fg_errors+=("'$tool' version $v does not satisfy $op$req")
  return 0
}"""


def build_requirements_check(requirements: list[str]) -> str:
    """Build a bash snippet that verifies required tools at job runtime.

    This snippet runs inside the job on the compute node, as the user, after
    conda/env activation, so it reflects the actual execution environment
    rather than the server's PATH at submit time. On any unmet requirement it
    prints all errors to
    stderr and exits 1, which marks the job FAILED and surfaces the message in
    the job's stderr log.

    Returns an empty string when there are no requirements.
    """
    if not requirements:
        return ""

    checks = []
    needs_check_tool = False
    needs_check_version = False
    for req in requirements:
        req = req.strip()
        match = _REQUIREMENT_PATTERN.match(req)
        if not match:
            checks.append(f"__fg_errors+=({shlex.quote(f'Invalid requirement format: {req!r}')})")
            continue

        tool = match.group(1)
        op = match.group(2)
        required = match.group(3)
        registry_entry = _TOOL_REGISTRY.get(tool)
        binary = registry_entry["version_args"][0] if registry_entry else tool

        if op is None:
            needs_check_tool = True
            checks.append(f"__fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)} || true")
            continue

        if not registry_entry:
            # Tool exists check still runs; version cannot be verified.
            needs_check_tool = True
            msg = f"Cannot check version for '{tool}': no version command configured"
            checks.append(
                f"if __fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)}; then\n"
                f"  __fg_errors+=({shlex.quote(msg)})\n"
                f"fi"
            )
            continue

        needs_check_tool = True
        needs_check_version = True
        version_cmd = " ".join(shlex.quote(a) for a in registry_entry["version_args"])
        checks.append(
            f"if __fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)}; then\n"
            f"  __fg_v=\"$({version_cmd} 2>&1 | __fg_extract_version)\"\n"
            f"  __fg_check_version {shlex.quote(tool)} \"$__fg_v\" {shlex.quote(op)} {shlex.quote(required)}\n"
            f"fi"
        )

    finalizer = (
        'if [ "${#__fg_errors[@]}" -gt 0 ]; then\n'
        '  echo "ERROR: This app\'s requirements are not met in the execution environment:" >&2\n'
        '  for __fg_e in "${__fg_errors[@]}"; do echo "  - $__fg_e" >&2; done\n'
        "  exit 1\n"
        "fi"
    )

    # Emit only the helper functions the generated checks actually call.
    preamble = ["__fg_errors=()"]
    if needs_check_tool:
        preamble.append(_HELPER_CHECK_TOOL)
    if needs_check_version:
        preamble.append(_HELPER_CHECK_VERSION)

    return "\n".join([
        "# Verify required tools are available in this environment (Fileglancer)",
        *preamble,
        *checks,
        finalizer,
    ])


# --- Path Validation ---

# Characters that are dangerous in shell commands
_SHELL_METACHAR_PATTERN = re.compile(r'[;&|`$(){}!<>\n\r]')
_WINDOWS_DRIVE_PATTERN = re.compile(r'^[a-zA-Z]:/')


def validate_path_for_shell(path_value: str) -> str | None:
    """Validate path syntax for use in shell commands (no filesystem I/O).

    Checks for shell metacharacters, rejects '..', and requires paths to
    start with '/', '~', or './'.
    Returns an error message string if invalid, or None if valid.
    """
    normalized = path_value.replace("\\", "/")

    # Cloud storage URIs are passed through as opaque strings
    if normalized.startswith(("s3://", "gs://", "https://")):
        return None

    if _SHELL_METACHAR_PATTERN.search(normalized):
        return "Path contains invalid characters"

    if ".." in normalized:
        return "Path must not contain '..'"

    if not (normalized.startswith("/") or normalized.startswith("~") or normalized.startswith("./")
            or _WINDOWS_DRIVE_PATTERN.match(normalized)):
        return "Must be an absolute or relative path (starting with /, ~, or ./)"

    return None


def validate_path_in_filestore(path_value: str, fsps: list) -> str | None:
    """Validate a path exists and is readable within an allowed file share.

    Performs syntax checks, then resolves the path against the given list of
    file share paths. Returns an error message string if invalid, or None if
    valid.
    """
    # Syntax check first
    error = validate_path_for_shell(path_value)
    if error:
        return error

    normalized = path_value.replace("\\", "/")

    # Relative paths and cloud storage URIs are not local filesystem paths;
    # skip filestore validation.
    if normalized.startswith("./") or normalized.startswith(("s3://", "gs://", "https://")):
        return None

    expanded = os.path.expanduser(normalized)

    # Resolve to a file share path
    from fileglancer.database import find_fsp_in_paths
    result = find_fsp_in_paths(fsps, expanded)
    if result is None:
        return "Path is not within an allowed file share"

    fsp, subpath = result

    from fileglancer.filestore import Filestore
    filestore = Filestore(fsp)
    return filestore.validate_path(subpath)


# --- Command Building ---

# Valid environment variable name
_ENV_VAR_NAME_PATTERN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _validate_parameter_value(param: AppParameter, value, session=None) -> str:
    """Validate a single parameter value against its schema and return the string representation.

    When session is provided and param type is file/directory, validates that
    the path is within an allowed file share mount. Otherwise falls back to
    syntax-only validation.

    Raises ValueError if validation fails.
    """
    if param.type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"Parameter '{param.name}' must be a boolean")
        return str(value)

    if param.type == "integer":
        try:
            int_val = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.name}' must be an integer")
        if param.min is not None and int_val < param.min:
            raise ValueError(f"Parameter '{param.name}' must be >= {param.min}")
        if param.max is not None and int_val > param.max:
            raise ValueError(f"Parameter '{param.name}' must be <= {param.max}")
        return str(int_val)

    if param.type == "number":
        try:
            num_val = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.name}' must be a number")
        if param.min is not None and num_val < param.min:
            raise ValueError(f"Parameter '{param.name}' must be >= {param.min}")
        if param.max is not None and num_val > param.max:
            raise ValueError(f"Parameter '{param.name}' must be <= {param.max}")
        return str(num_val)

    if param.type == "enum":
        str_val = str(value)
        if param.options and str_val not in param.options:
            raise ValueError(f"Parameter '{param.name}' must be one of {param.options}")
        return str_val

    # string, file, directory
    str_val = str(value)

    if param.type in ("file", "directory"):
        str_val = str_val.replace("\\", "/")
        # Expand ~ so the path works inside shlex.quote() single quotes,
        # where the shell would not perform tilde expansion.
        # Use euid so this works when the server runs as root with seteuid.
        if str_val.startswith("~/") or str_val == "~":
            try:
                home = pwd.getpwuid(os.geteuid()).pw_dir
            except (AttributeError, KeyError):
                home = os.path.expanduser("~")
            home = home.replace("\\", "/")
            str_val = home + str_val[1:]
        if session is not None:
            fsps = db.get_file_share_paths(session)
            error = validate_path_in_filestore(str_val, fsps)
        else:
            error = validate_path_for_shell(str_val)
        if error:
            raise ValueError(f"Parameter '{param.name}': {error}")

    if param.type == "string" and param.pattern:
        if not re.fullmatch(param.pattern, str_val):
            raise ValueError(f"Parameter '{param.name}' does not match required pattern")

    return str_val


def _flatten_param_items(items) -> list:
    """Flatten a list of AppParameter / AppParameterSection items into params."""
    result = []
    for item in items:
        if isinstance(item, AppParameterSection):
            result.extend(item.parameters)
        else:
            result.append(item)
    return result


def build_command(entry_point: AppEntryPoint, parameters: dict,
                  env_parameters: dict = None, session=None) -> str:
    """Build a shell command from an entry point and parameter values.

    `parameters` and `env_parameters` are independent namespaces: each param
    draws its value from the dict for the group it was declared in, so the same
    key may appear in both without colliding. Env-tab params are emitted first
    (matching declaration order: env_parameters then parameters), e.g. so
    Nextflow's `-profile` precedes the pipeline's `--params`.

    All parameter values are validated and shell-escaped. Flagged parameters
    are emitted first in declaration order, then positional parameters (no
    flag). When session is provided, file/directory parameters are validated
    against allowed file share mounts. Raises ValueError for invalid parameters.
    """
    env_parameters = env_parameters or {}
    env_flat = _flatten_param_items(entry_point.env_parameters)
    param_flat = _flatten_param_items(entry_point.parameters)
    groups = ((env_flat, env_parameters), (param_flat, parameters))

    for flat, values in groups:
        # Validate required parameters
        for param in flat:
            if param.required and param.key not in values and param.default is None:
                raise ValueError(f"Required parameter '{param.name}' is missing")
        # Check for unknown parameters
        keys = {p.key for p in flat}
        for param_key in values:
            if param_key not in keys:
                raise ValueError(f"Unknown parameter '{param_key}'")

    # Compute effective values (user-provided merged with defaults), keeping
    # env-then-pipeline declaration order across the combined list.
    effective: list[tuple[AppParameter, any]] = []
    for flat, values in groups:
        for param in flat:
            if param.key in values:
                effective.append((param, values[param.key]))
            elif param.default is not None:
                effective.append((param, param.default))

    # Start with the base command
    parts = [entry_point.command]

    # Pass 1: Flagged args in declaration order
    for p, value in effective:
        if p.flag is None:
            continue
        validated = _validate_parameter_value(p, value, session=session)
        if p.type == "boolean":
            if value is True:
                parts.append(p.flag)
        else:
            parts.append(f"{p.flag} {shlex.quote(validated)}")

    # Pass 2: Positional args in declaration order
    for p, value in effective:
        if p.flag is not None:
            continue
        validated = _validate_parameter_value(p, value, session=session)
        if p.raw:
            if _SHELL_METACHAR_PATTERN.search(validated):
                raise ValueError(
                    f"Parameter '{p.name}' contains forbidden shell characters"
                )
            parts.append(validated)
        else:
            parts.append(shlex.quote(validated))

    return (" \\\n  ").join(parts)
