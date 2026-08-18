import re
import shlex
from datetime import datetime
from typing import Annotated, Any, List, Literal, Optional, Dict, Union

from pydantic import BaseModel, ConfigDict, Discriminator, Field, HttpUrl, Tag, field_validator, model_validator

from fileglancer.giturls import _parse_github_url


class FileSharePath(BaseModel):
    """A file share path from the database"""
    name: str = Field(
        description="The name of the file share, which uniquely identifies the file share."
    )
    zone: str = Field(
        description="The zone of the file share, for grouping paths in the UI."
    )
    group: Optional[str] = Field(
        description="The group that owns the file share",
        default=None
    )
    storage: Optional[str] = Field(
        description="The storage type of the file share (home, primary, scratch, etc.)",
        default=None
    )
    mount_path: str = Field(
        description="The path where the file share is mounted on the local machine"
    )
    mac_path: Optional[str] = Field(
        description="The path used to mount the file share on Mac (e.g. smb://server/share)",
        default=None
    )
    windows_path: Optional[str] = Field(
        description="The path used to mount the file share on Windows (e.g. \\\\server\\share)",
        default=None
    )
    linux_path: Optional[str] = Field(
        description="The path used to mount the file share on Linux (e.g. /unix/style/path)",
        default=None
    )

class FileSharePathResponse(BaseModel):
    paths: List[FileSharePath] = Field(
        description="A list of file share paths"
    )
    
class TicketComment(BaseModel):
    """A comment on a ticket"""
    author_name: str = Field(
        description="The author of the comment"
    )
    author_display_name: str = Field(
        description="The display name of the author"
    )
    body: str = Field(
        description="The body of the comment"
    )
    created: datetime = Field(
        description="The date and time the comment was created"
    )
    updated: datetime = Field(
        description="The date and time the comment was updated"
    )

class Ticket(BaseModel):
    """A JIRA ticket"""
    username: str = Field(
        description="The username of the user who created the ticket"
    )
    path: str = Field(
        description="The path of the file the ticket was created for, relative to the file share path mount point"
    )
    fsp_name: str = Field(
        description="The name of the file share path associated with the file this ticket was created for"
    )
    key: str = Field(
        description="The key of the ticket"
    )
    created: Optional[datetime] = Field(
        description="The date and time the ticket was created",
    )
    updated: Optional[datetime] = Field(
        description="The date and time the ticket was updated"
    )
    status: Optional[str] = Field(
        description="The status of the ticket",
        default=None
    )
    resolution: Optional[str] = Field(
        description="The resolution of the ticket",
        default=None
    )
    description: Optional[str] = Field(
        description="The description of the ticket",
        default=None
    )
    link: Optional[HttpUrl] = Field(
        description="The link to the ticket",
        default=None
    )
    comments: List[TicketComment] = Field(
        description="The comments on the ticket",
        default=[]
    )
    def populate_details(self, ticket_details: dict):
        self.status = ticket_details.get('status')
        self.resolution = ticket_details.get('resolution')
        self.description = ticket_details.get('description')
        self.link = ticket_details.get('link')
        self.comments = ticket_details.get('comments', [])
        self.created = ticket_details.get('created')
        self.updated = ticket_details.get('updated')
    

class TicketResponse(BaseModel):
    tickets: List[Ticket] = Field(
        description="A list of tickets"
    )


class UserPreference(BaseModel):
    """A user preference"""
    key: str = Field(
        description="The key of the preference"
    )
    value: Dict = Field(
        description="The value of the preference"
    )


class ProxiedPath(BaseModel):
    """A proxied path which is used to share a file system path via a URL"""
    id: int = Field(
        description="Database id of the Data Link; matches ViewLayer.data_link_id"
    )
    username: str = Field(
        description="The username of the user who owns this proxied path"
    )
    sharing_key: str = Field(
        description="The sharing key is part of the URL proxy path. It is used to uniquely identify the proxied path."
    )
    sharing_name: str = Field(
        description="A display-only label for the data link. Does not appear in the URL."
    )
    path: str = Field(
        description="The path relative to the file share path mount point"
    )
    fsp_name: str = Field(
        description="The name of the file share path that this proxied path is associated with"
    )
    created_at: datetime = Field(
        description="When this proxied path was created"
    )
    updated_at: datetime = Field(
        description="When this proxied path was last updated"
    )
    url_prefix: str = Field(
        description="The URL path prefix that appears after the sharing key in the proxy URL"
    )
    url: Optional[HttpUrl] = Field(
        description="The URL for accessing the data via the proxy",
        default=None
    )

class ProxiedPathResponse(BaseModel):
    paths: List[ProxiedPath] = Field(
        description="A list of proxied paths"
    )


class ViewLayer(BaseModel):
    """One dataset/channel layer of a Neuroglancer View."""
    model_config = ConfigDict(from_attributes=True)

    layer_index: int = Field(description="Position of this layer within the View")
    data_link_id: Optional[int] = Field(
        default=None,
        description="ID of the Data Link (proxied path) backing this layer; null if broken",
    )
    channel: Optional[str] = Field(default=None, description="Channel identifier, if this layer is one channel")
    opts: Optional[Dict] = Field(default=None, description="Per-layer options")
    broken: bool = Field(default=False, description="True if the backing Data Link was deleted")


class View(BaseModel):
    """A Neuroglancer View: saved NG state + its layers + sharing settings."""
    model_config = ConfigDict(from_attributes=True)

    short_key: str = Field(description="Owner-facing key identifying this View")
    read_key: str = Field(description="Key that opens this View read-only")
    name: str = Field(description="Display name of the View")
    ng_state: Dict = Field(description="The Neuroglancer state JSON")
    sharing_mode: Literal['private', 'read'] = Field(description="'private' or 'read'")
    owner: str = Field(description="Username of the View owner")
    created_at: datetime = Field(description="When this View was created")
    updated_at: datetime = Field(description="When this View was last updated")
    layers: List[ViewLayer] = Field(default_factory=list, description="The layers of this View")


class ViewResponse(BaseModel):
    views: List[View] = Field(description="A list of Neuroglancer Views")


class ViewLayerInput(BaseModel):
    """One layer in a create-View request. `sharing_key` names the Data Link
    that backs this layer (resolved to an internal id server-side); null for a
    layer with no Fileglancer Data Link (e.g. an external URL layer)."""
    sharing_key: Optional[str] = Field(default=None, description="Data Link sharing key backing this layer")
    layer_index: int = Field(description="Position of this layer within the View")
    channel: Optional[str] = Field(default=None, description="Channel identifier, if this layer is one channel")
    opts: Optional[Dict] = Field(default=None, description="Per-layer options")


class ViewCreateRequest(BaseModel):
    """Request body for creating a View. The client builds `ng_state`."""
    name: str = Field(description="Display name of the View")
    ng_state: Dict = Field(description="The Neuroglancer state JSON")
    sharing_mode: Literal['private', 'read'] = Field(default='read', description="'private' or 'read'")
    layers: List[ViewLayerInput] = Field(default_factory=list, description="Layers backing this View")


class ViewUpdateRequest(BaseModel):
    """Request body for an owner update (rename / restate)."""
    name: Optional[str] = Field(default=None, description="New display name")
    ng_state: Optional[Dict] = Field(default=None, description="Replacement Neuroglancer state JSON")


class ExternalBucket(BaseModel):
    """An external bucket for S3-compatible storage"""
    id: int = Field(
        description="The unique identifier for this external bucket"
    )
    full_path: str = Field(
        description="The full path to the external bucket"
    )
    external_url: str = Field(
        description="The external URL for accessing this bucket"
    )
    fsp_name: str = Field(
        description="The name of the file share path that this external bucket is associated with"
    )
    relative_path: Optional[str] = Field(
        description="The relative path within the file share path",
        default=None
    )


class ExternalBucketResponse(BaseModel):
    buckets: List[ExternalBucket] = Field(
        description="A list of external buckets"
    )

class Notification(BaseModel):
    """A notification message for users"""
    id: int = Field(
        description="The unique identifier for this notification"
    )
    type: str = Field(
        description="The type of notification (info, warning, success, error)"
    )
    title: str = Field(
        description="The title of the notification"
    )
    message: str = Field(
        description="The notification message"
    )
    active: bool = Field(
        description="Whether the notification is active"
    )
    created_at: datetime = Field(
        description="When this notification was created"
    )
    expires_at: Optional[datetime] = Field(
        description="When this notification expires (null for no expiration)",
        default=None
    )


class NotificationResponse(BaseModel):
    notifications: List[Notification] = Field(
        description="A list of active notifications"
    )


class NeuroglancerShortenRequest(BaseModel):
    """Request payload for creating a shortened Neuroglancer state"""
    short_name: Optional[str] = Field(
        description="Optional human-friendly name for the short link",
        default=None
    )
    title: Optional[str] = Field(
        description="Optional title that appears in the Neuroglancer tab name",
        default=None
    )
    url: Optional[str] = Field(
        description="Neuroglancer URL containing the encoded JSON state after #!",
        default=None
    )
    state: Optional[Dict] = Field(
        description="Neuroglancer state as a JSON object",
        default=None
    )
    url_base: Optional[str] = Field(
        description="Base Neuroglancer URL, required when providing state directly",
        default=None
    )


class NeuroglancerUpdateRequest(BaseModel):
    """Request payload for updating a Neuroglancer state"""
    url: str = Field(
        description="Neuroglancer URL containing the encoded JSON state after #!"
    )
    title: Optional[str] = Field(
        description="Optional title that appears in the Neuroglancer tab name",
        default=None
    )


class NeuroglancerShortenResponse(BaseModel):
    """Response payload for shortened Neuroglancer state"""
    short_key: str = Field(
        description="Short key for retrieving the stored state"
    )
    short_name: Optional[str] = Field(
        description="Optional human-friendly name for the short link",
        default=None
    )
    title: Optional[str] = Field(
        description="Optional title that appears in the Neuroglancer tab name",
        default=None
    )
    state_url: str = Field(
        description="Absolute URL to the stored state JSON"
    )
    neuroglancer_url: str = Field(
        description="Neuroglancer URL that references the stored state"
    )


class NeuroglancerShortLink(BaseModel):
    """Stored Neuroglancer short link"""
    short_key: str = Field(
        description="Short key for retrieving the stored state"
    )
    short_name: Optional[str] = Field(
        description="Optional human-friendly name for the short link",
        default=None
    )
    title: Optional[str] = Field(
        description="Optional title that appears in the Neuroglancer tab name",
        default=None
    )
    created_at: datetime = Field(
        description="When this short link was created"
    )
    updated_at: datetime = Field(
        description="When this short link was last updated"
    )
    state_url: str = Field(
        description="Absolute URL to the stored state JSON"
    )
    neuroglancer_url: str = Field(
        description="Neuroglancer URL that references the stored state"
    )
    state: Dict = Field(
        description="The stored Neuroglancer JSON state object"
    )
    url_base: str = Field(
        description="The Neuroglancer base URL"
    )


class NeuroglancerShortLinkResponse(BaseModel):
    links: List[NeuroglancerShortLink] = Field(
        description="A list of stored Neuroglancer short links"
    )


# --- API token models ---

class ApiTokenInfo(BaseModel):
    """An API token, without its secret"""
    token_id: str = Field(
        description="Public identifier for the token, used to revoke it"
    )
    name: str = Field(
        description="User-supplied label for the token"
    )
    scopes: List[str] = Field(
        description="Scopes granted to this token"
    )
    created_at: datetime = Field(
        description="When this token was created"
    )
    expires_at: datetime = Field(
        description="When this token stops working"
    )
    last_used_at: Optional[datetime] = Field(
        description="When this token was last used, accurate to five minutes",
        default=None
    )


class ApiTokenListResponse(BaseModel):
    tokens: List[ApiTokenInfo] = Field(
        description="The caller's API tokens, newest first"
    )


class ApiTokenCreateRequest(BaseModel):
    """Request payload for creating an API token"""
    name: str = Field(
        description="A label to identify this token later",
        min_length=1, max_length=100
    )
    scopes: List[str] = Field(
        description="Scopes to grant, e.g. ['files:read', 'links:write']"
    )
    expires_in_days: int = Field(
        description="How long the token stays valid",
        default=30, ge=1, le=365
    )

    @field_validator('name')
    @classmethod
    def _strip_name(cls, value: str) -> str:
        """Strip before validating, so a whitespace-only name is rejected
        rather than silently stored as an empty string."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class ApiTokenCreateResponse(BaseModel):
    """Response for a newly created API token"""
    token: ApiTokenInfo = Field(
        description="The token metadata"
    )
    secret: str = Field(
        description="The full token string. Returned once and never recoverable."
    )


# --- App Manifest Models ---

# Conservative CLI-flag shape: one or two leading dashes, then an alphanumeric
# followed by word characters, dots, or dashes. Flags are emitted into the
# generated job script unquoted, so anything shell-significant is rejected.
_FLAG_PATTERN = re.compile(r'^-{1,2}[A-Za-z0-9][A-Za-z0-9_.-]*$')


class AppParameter(BaseModel):
    """A parameter definition for an app entry point"""
    flag: Optional[str] = Field(
        description="CLI flag syntax (e.g. '--outdir', '-n'). Omit for positional arguments.",
        default=None,
    )
    key: str = Field(
        description="Internal key for this parameter, auto-generated from flag or positional index",
        default="",
    )
    name: str = Field(description="Display name of the parameter")
    type: Literal["string", "integer", "number", "boolean", "file", "directory", "enum"] = Field(
        description="The data type of the parameter"
    )
    description: Optional[str] = Field(description="Description of the parameter", default=None)
    required: bool = Field(description="Whether the parameter is required", default=False)
    default: Optional[Any] = Field(description="Default value for the parameter", default=None)
    options: Optional[List[str]] = Field(description="Allowed values for enum type", default=None)
    min: Optional[float] = Field(description="Minimum value for numeric types", default=None)
    max: Optional[float] = Field(description="Maximum value for numeric types", default=None)
    pattern: Optional[str] = Field(description="Regex validation pattern for string types", default=None)
    hidden: bool = Field(description="Whether the parameter is hidden by default in the UI", default=False)
    raw: bool = Field(description="If true, value is appended to the command without shell quoting", default=False)
    value_separator: Literal["space", "equals"] = Field(
        description=(
            "How flagged parameters are joined to their value in the generated "
            "command: 'space' emits '--flag value', while 'equals' emits "
            "'--flag=value'."
        ),
        default="space",
    )
    boolean_style: Literal["flag", "value"] = Field(
        description=(
            "How flagged boolean parameters are emitted: 'flag' emits '--flag' "
            "for true and omits false, while 'value' emits '--flag true' or "
            "'--flag false' (or '--flag=true/false' when value_separator is "
            "'equals')."
        ),
        default="flag",
    )
    exists: bool = Field(
        description="file/directory params only: when true (the default), the path "
                    "must exist and be readable before launch. Set false for outputs "
                    "the job creates — the pre-launch existence check is skipped "
                    "(file-share containment is still enforced), and directory params "
                    "are created (as the user, within an allowed file share) before "
                    "launch, so a home default like '~/.fileglancer/logs' works on "
                    "first launch",
        default=True,
    )

    @field_validator("flag")
    @classmethod
    def validate_flag(cls, v):
        if v is not None:
            if not v.startswith("-"):
                raise ValueError(f"Flag must start with '-', got '{v}'")
            stripped = v.lstrip("-")
            if not stripped:
                raise ValueError("Flag must have content after dashes")
            # Flags are appended to the generated shell command unquoted, and
            # the Nextflow adapter derives them from schema property names, so
            # constrain them to a conservative CLI-flag shape rather than
            # allowing shell-significant characters through.
            if not _FLAG_PATTERN.fullmatch(v):
                raise ValueError(
                    f"Flag must look like '-n' or '--long-name' "
                    f"(letters, digits, '_', '.', '-'), got '{v}'"
                )
        return v

    @field_validator("options", mode="before")
    @classmethod
    def stringify_options(cls, v):
        # Enum options may be authored as numbers (e.g. a Nextflow schema with
        # "enum": [1, 2]). The UI <select> stringifies values and backend
        # validation compares str(value), so normalize options to strings here
        # so numeric enums round-trip instead of failing validation.
        if v is None:
            return v
        return [str(item) for item in v]

    @model_validator(mode='after')
    def validate_exists(self):
        # Check the value, not model_fields_set: manifests round-trip through
        # model_dump (worker -> server, DB cache), which serializes the True
        # default onto every param, so presence of the field is meaningless.
        if not self.exists and self.type not in ("file", "directory"):
            raise ValueError(
                f"exists is only valid on file and directory parameters, "
                f"but '{self.name}' has type '{self.type}'"
            )
        if self.boolean_style != "flag" and self.type != "boolean":
            raise ValueError(
                f"boolean_style is only valid on boolean parameters, "
                f"but '{self.name}' has type '{self.type}'"
            )
        return self


class AppParameterSection(BaseModel):
    """A collapsible section that groups parameters in the UI"""
    section: str = Field(description="Section title")
    description: Optional[str] = Field(default=None)
    collapsed: bool = Field(default=False)
    parameters: List[AppParameter] = Field(default=[])


def _param_item_discriminator(v):
    if isinstance(v, dict):
        return 'section' if 'section' in v else 'parameter'
    return 'section' if isinstance(v, AppParameterSection) else 'parameter'


AppParameterItem = Annotated[
    Union[
        Annotated[AppParameter, Tag('parameter')],
        Annotated[AppParameterSection, Tag('section')],
    ],
    Discriminator(_param_item_discriminator),
]


class AppResourceDefaults(BaseModel):
    """Resource defaults for an app entry point"""
    cpus: Optional[int] = Field(description="Number of CPUs", default=None)
    memory: Optional[str] = Field(description="Memory allocation (e.g. '16 GB')", default=None)
    walltime: Optional[str] = Field(description="Wall time limit (e.g. '04:00')", default=None)
    queue: Optional[str] = Field(description="Cluster queue/partition name", default=None)


class AppEntryPoint(BaseModel):
    """An entry point (command) within an app"""
    id: str = Field(description="Unique identifier for the entry point")
    name: str = Field(description="Display name of the entry point")
    type: Literal["job", "service"] = Field(description="Whether this is a batch job or long-running service", default="job")
    description: Optional[str] = Field(description="Description of the entry point", default=None)
    command: str = Field(description="The base CLI command to execute")
    parameters: List[AppParameterItem] = Field(description="Parameters for this entry point", default=[])
    env_parameters: List[AppParameterItem] = Field(
        description="Parameters shown in the Environment tab (e.g. Nextflow profiles)",
        default=[],
    )
    resources: Optional[AppResourceDefaults] = Field(description="Default resource requirements", default=None)
    env: Optional[Dict[str, str]] = Field(description="Default environment variables", default=None)
    pre_run: Optional[str] = Field(description="Script to run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script to run after the main command", default=None)
    conda_env: Optional[str] = Field(
        description="Conda environment name or path to activate before running",
        default=None,
    )
    container: Optional[str] = Field(
        description="Container image URL for Apptainer (e.g. 'ghcr.io/org/image:tag')",
        default=None,
    )
    bind_paths: Optional[List[str]] = Field(
        description="Additional paths to bind-mount into the container",
        default=None,
    )
    container_args: Optional[str] = Field(
        description="Default extra arguments for container exec (e.g. '--nv')",
        default=None,
    )
    working_dir: Optional[Literal["work", "manifest", "repo"]] = Field(
        description=(
            "Directory the command runs from: 'manifest' (the manifest's "
            "directory inside the cloned project), 'repo' (the cloned project's "
            "root), or 'work' (the job's work directory). Defaults to 'work' for "
            "container entry points and 'manifest' otherwise."
        ),
        default=None,
    )
    auto_url: bool = Field(
        description=(
            "For service entry points only: have Fileglancer publish the service "
            "URL for you. Once the service's port ($FG_SERVICE_PORT) is accepting "
            "connections, Fileglancer writes http://$FG_HOSTNAME:$FG_SERVICE_PORT "
            "(plus service_url_suffix, if set) to SERVICE_URL_PATH. Set this when "
            "your service binds to the Fileglancer-provided $FG_SERVICE_PORT."
        ),
        default=False,
    )
    service_url_suffix: Optional[str] = Field(
        description=(
            "For auto_url service entry points: text appended to "
            "http://$FG_HOSTNAME:$FG_SERVICE_PORT when publishing the URL, e.g. a "
            "path and/or query for one-click auth. May contain the placeholders "
            "${FG_SERVICE_TOKEN}, ${FG_SERVICE_PORT}, ${FG_HOSTNAME} (braces "
            "required) and literal URL text; nothing else. Example: "
            "'/?access_token=${FG_SERVICE_TOKEN}'."
        ),
        default=None,
    )
    service_proxy: bool = Field(
        description=(
            "For service entry points only: whether Fileglancer may republish "
            "this service at an HTTPS proxy URL when the server has a service "
            "proxy configured. Set it to false only when the service cannot "
            "work behind the proxy at all, e.g. it pins an OAuth callback to a "
            "fixed host and port. Users then reach it at the direct "
            "http://host:port URL, with no transport encryption on any hop, so "
            "nothing sensitive should be sent to a service that opts out."
        ),
        default=True,
    )
    requirements: List[str] = Field(
        description="Required tools for this entry point, e.g. ['apptainer']. Merged with manifest-level requirements.",
        default=[],
    )

    @field_validator("requirements")
    @classmethod
    def validate_entry_point_requirements(cls, v):
        return _validate_requirements(v)

    @field_validator("conda_env")
    @classmethod
    def validate_conda_env(cls, v):
        if v is None:
            return v
        if v.startswith("/"):
            # Absolute path: reject shell metacharacters
            if _CONDA_ENV_PATH_FORBIDDEN.search(v):
                raise ValueError(
                    f"conda_env path contains forbidden characters: {v!r}"
                )
        else:
            # Name: must be alphanumeric, dots, dashes, underscores
            if not _CONDA_ENV_NAME_PATTERN.match(v):
                raise ValueError(
                    f"conda_env name must match [a-zA-Z0-9_.-]+, got: {v!r}"
                )
        return v

    @field_validator("container")
    @classmethod
    def validate_container(cls, v):
        if v is None:
            return v
        if _SHELL_METACHAR_PATTERN.search(v):
            raise ValueError(f"container URL contains forbidden characters: {v!r}")
        return v

    @field_validator("service_url_suffix")
    @classmethod
    def validate_service_url_suffix(cls, v):
        if v is None:
            return v
        # Strip the recognized ${FG_*} placeholders, then reject anything that
        # would be unsafe or unexpanded inside the double-quoted shell string the
        # suffix is emitted into (a stray $, quote, backtick, backslash, newline).
        residual = _SERVICE_URL_PLACEHOLDER.sub("", v)
        if _SERVICE_URL_UNSAFE.search(residual):
            raise ValueError(
                "service_url_suffix may contain only literal URL text and the "
                "placeholders ${FG_SERVICE_TOKEN}, ${FG_SERVICE_PORT}, "
                f"${{FG_HOSTNAME}} (braces required); got: {v!r}"
            )
        return v

    @field_validator("bind_paths")
    @classmethod
    def validate_bind_paths(cls, v):
        if v is None:
            return v
        for p in v:
            if _SHELL_METACHAR_PATTERN.search(p):
                raise ValueError(f"bind_paths entry contains forbidden characters: {p!r}")
        return v

    @field_validator("container_args")
    @classmethod
    def validate_container_args(cls, v):
        if v is None:
            return v
        if _SHELL_METACHAR_PATTERN.search(v):
            raise ValueError(f"container_args contains forbidden characters: {v!r}")
        return v

    @property
    def effective_working_dir(self) -> str:
        """Resolve where the command runs: 'work', 'manifest', or 'repo'.

        An explicit working_dir wins; otherwise container entry points default
        to 'work' (the repo clone isn't bind-mounted into the container, but the
        work dir always is) and everything else defaults to 'manifest'.
        """
        if self.working_dir:
            return self.working_dir
        return "work" if self.container else "manifest"

    def flat_parameters(self) -> List[AppParameter]:
        """Return a flat list of all parameters, traversing sections."""
        result = []
        for item in (*self.env_parameters, *self.parameters):
            if isinstance(item, AppParameterSection):
                result.extend(item.parameters)
            else:
                result.append(item)
        return result

    @model_validator(mode='after')
    def generate_parameter_keys(self):
        # `parameters` and `env_parameters` are independent namespaces whose
        # values travel in separate dicts end-to-end, so keys must be unique
        # *within* each group but may legitimately repeat across groups (e.g. a
        # pipeline `--profile` param alongside Nextflow's injected `-profile`).
        for group in (self.parameters, self.env_parameters):
            positional_index = 0
            keys_seen: dict[str, str] = {}
            for item in group:
                params = item.parameters if isinstance(item, AppParameterSection) else [item]
                for param in params:
                    if param.key:
                        # Honor an explicitly-authored key (e.g. flag-less raw
                        # args that want a readable name instead of "_argN").
                        pass
                    elif param.flag is not None:
                        param.key = param.flag.lstrip("-")
                    else:
                        param.key = f"_arg{positional_index}"
                        positional_index += 1
                    if param.key in keys_seen:
                        raise ValueError(
                            f"Duplicate parameter key '{param.key}' "
                            f"(from '{param.name}' and '{keys_seen[param.key]}')"
                        )
                    keys_seen[param.key] = param.name
        return self

    @model_validator(mode='after')
    def check_conda_container_exclusive(self):
        if self.conda_env and self.container:
            raise ValueError("conda_env and container are mutually exclusive — use one or the other")
        if self.bind_paths and not self.container:
            raise ValueError("bind_paths requires container to be set")
        if self.auto_url and self.type != "service":
            raise ValueError("auto_url is only valid for service entry points (type: service)")
        if self.service_url_suffix is not None and not self.auto_url:
            raise ValueError("service_url_suffix requires auto_url to be set")
        # Checked by value rather than by model_fields_set, like the parameter
        # validators above: manifests round-trip through model_dump, which
        # writes the True default onto every entry point, so only an explicit
        # false is distinguishable — and only false means anything here.
        if not self.service_proxy and self.type != "service":
            raise ValueError("service_proxy is only valid for service entry points (type: service)")
        return self


SUPPORTED_TOOLS = {"pixi", "npm", "maven", "miniforge", "apptainer", "nextflow"}
# Canonical parser for a single requirement spec, shared with fileglancer.apps.command
# (imported there) so manifest validation and the runtime requirement check stay
# in sync. Groups: 1=tool name, 2=operator (or None), 3=version (or None).
_REQUIREMENT_OPERATOR_PATTERN = re.compile(r">=|<=|!=|==|>|<")
_REQUIREMENT_PATTERN = re.compile(
    r"^([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:(>=|<=|!=|==|>|<)\s*([^,\s><=!]+))?$"
)

_SHELL_METACHAR_PATTERN = re.compile(r'[;&|`$(){}!<>\n\r]')
# Placeholders Fileglancer substitutes into service_url_suffix at runtime.
_SERVICE_URL_PLACEHOLDER = re.compile(r'\$\{(?:FG_SERVICE_TOKEN|FG_SERVICE_PORT|FG_HOSTNAME)\}')
# The suffix is emitted inside a double-quoted shell string, so only these are
# dangerous once the recognized placeholders are removed: a stray $, a double
# quote, a backtick, a backslash, or a newline. Everything else (?, &, =, /, %,
# ...) is literal inside double quotes and valid in a URL.
_SERVICE_URL_UNSAFE = re.compile(r'[$"`\\\n\r]')
_CONDA_ENV_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9_.-]+$')
_CONDA_ENV_PATH_FORBIDDEN = re.compile(r'[;&|`$(){}!<>\n\r]')


def _validate_requirements(requirements: List[str]) -> List[str]:
    for req in requirements:
        stripped = req.strip()
        match = _REQUIREMENT_PATTERN.match(stripped)
        if not match:
            if (
                "," in stripped
                or len(_REQUIREMENT_OPERATOR_PATTERN.findall(stripped)) > 1
            ):
                raise ValueError(
                    "Compound requirement specs are not supported; use at most "
                    "one version comparison per tool, e.g. 'pixi>=0.40'."
                )
            raise ValueError(
                f"Invalid requirement format: {req!r}. Expected a tool name "
                "with an optional single version comparison, e.g. 'pixi>=0.40'."
            )

        tool = match.group(1)
        if tool not in SUPPORTED_TOOLS:
            raise ValueError(
                f"Unsupported tool: '{tool}'. Supported: {SUPPORTED_TOOLS}"
            )
    return requirements


class AppManifest(BaseModel):
    """Top-level app manifest (runnables.yaml)"""
    name: str = Field(description="Display name of the app")
    description: Optional[str] = Field(description="Description of the app", default=None)
    source_filename: str = Field(
        description="Name of the file this manifest was read or generated from, "
                    "e.g. runnables.yaml, nextflow_schema.json, or pixi.toml",
        default="runnables.yaml",
    )
    repo_url: Optional[str] = Field(
        description="GitHub repo URL where the tool code lives. If absent, uses the repo containing this manifest.",
        default=None,
    )
    requirements: List[str] = Field(
        description="Required tools, e.g. ['pixi>=0.40', 'npm']",
        default=[],
    )
    runnables: List[AppEntryPoint] = Field(
        description="Available entry points for this app", min_length=1)

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, v):
        return _validate_requirements(v)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, v):
        # A separate code repo must be a GitHub URL the same way app URLs are —
        # reject anything else at manifest load so authors get a clear error
        # instead of a cryptic failure later at launch/update when
        # ensure_repo_snapshot tries to parse it.
        if v is None:
            return v
        try:
            _parse_github_url(v)
        except ValueError as e:
            raise ValueError(f"repo_url must be a GitHub repository URL: {e}")
        return v


class UserApp(BaseModel):
    """A user's saved app reference"""
    url: str = Field(description="URL to the app manifest")
    manifest_path: str = Field(description="Relative directory path to the manifest within the repo", default="")
    branch: Optional[str] = Field(description="Revision the user requested; empty means no explicit revision was requested. The fixed actually-cloned revision is baked into url; a bare stored URL means main.", default=None)
    commit_sha: Optional[str] = Field(
        description="Commit the app is pinned to; jobs run an immutable snapshot of this SHA. None for legacy rows not yet pinned.",
        default=None,
    )
    code_commit_sha: Optional[str] = Field(
        description="Pin for the manifest's separate code repo (repo_url), when declared.",
        default=None,
    )
    name: str = Field(description="App name from manifest")
    description: Optional[str] = Field(description="App description from manifest", default=None)
    added_at: datetime = Field(description="When the app was added")
    updated_at: Optional[datetime] = Field(description="When the app was last updated", default=None)
    manifest: Optional[AppManifest] = Field(description="Cached manifest data", default=None)
    listing_id: Optional[int] = Field(
        description="If this app is also shared by the user, the id of the catalog listing",
        default=None,
    )


class AppListing(BaseModel):
    """A shared app listing in the catalog"""
    id: int = Field(description="Unique identifier for this listing")
    owner_username: str = Field(description="The user who published this listing")
    url: str = Field(description="Git URL of the app repo")
    manifest_path: str = Field(description="Manifest path within the repo", default="")
    branch: Optional[str] = Field(description="Revision the user requested; empty means no explicit revision was requested. The fixed actually-cloned revision is baked into url; a bare stored URL means main.", default=None)
    name: str = Field(description="Display name for the catalog")
    description: Optional[str] = Field(description="Description for the catalog", default=None)
    published_at: datetime = Field(description="When this listing was published")
    updated_at: Optional[datetime] = Field(description="When this listing was last edited", default=None)
    install_count: int = Field(description="Number of users who currently have this app installed", default=0)


def validate_catalog_listing_name(name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    stripped = name.strip()
    if not stripped:
        raise ValueError("Catalog listing name must not be empty")
    return stripped


def resolve_catalog_listing_name(
    requested_name: Optional[str], fallback_name: str
) -> str:
    resolved = validate_catalog_listing_name(
        requested_name if requested_name is not None else fallback_name
    )
    if resolved is None:
        raise ValueError("Catalog listing name must not be empty")
    return resolved


class ShareAppRequest(BaseModel):
    """Request to share (publish) one of the user's apps to the catalog"""
    url: str = Field(description="URL of the user's app to share")
    manifest_path: str = Field(description="Manifest path within the repo", default="")
    name: Optional[str] = Field(
        description="Override display name for the catalog (defaults to the app's name)",
        default=None,
    )
    description: Optional[str] = Field(
        description="Override description for the catalog (defaults to the app's description)",
        default=None,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        return validate_catalog_listing_name(v)


class UpdateAppListingRequest(BaseModel):
    """Request to update a listing's editable metadata"""
    url: Optional[str] = Field(
        description=(
            "New GitHub URL for the listing, optionally carrying a revision "
            "as /tree/<rev> (same form the add flow uses). When it differs "
            "from the stored URL, the repo is cloned and the listing's "
            "manifest path must still exist there."
        ),
        default=None,
    )
    name: Optional[str] = Field(description="New display name", default=None)
    description: Optional[str] = Field(description="New description", default=None)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        return validate_catalog_listing_name(v)


class ManifestFetchRequest(BaseModel):
    """Request to fetch an app manifest"""
    url: str = Field(description="URL to the app manifest or GitHub repo")
    manifest_path: str = Field(description="Relative directory path to the manifest within the repo", default="")


class AppAddRequest(BaseModel):
    """Request to add an app"""
    url: str = Field(description="URL to the app manifest or GitHub repo")
    manifest_paths: Optional[List[str]] = Field(
        description=(
            "Manifest paths (relative dirs within the repo) to add. When omitted "
            "or null, every discovered manifest in the repo is added. Use this to "
            "add a subset of a multi-app repository."
        ),
        default=None,
    )


class DiscoveredApp(BaseModel):
    """A manifest discovered in a repo, for previewing before adding"""
    manifest_path: str = Field(description="Relative directory path to the manifest within the repo", default="")
    name: str = Field(description="App name from the manifest")
    description: Optional[str] = Field(description="App description from the manifest", default=None)
    already_added: bool = Field(
        description="True if the user has already added this manifest from this repo",
        default=False,
    )


class AppUpdateCheck(BaseModel):
    """Whether a newer commit exists on an app's pinned revision"""
    url: str = Field(description="Canonical URL of the app")
    manifest_path: str = Field(description="Manifest path within the repo", default="")
    commit_sha: Optional[str] = Field(description="Commit the app is currently pinned to", default=None)
    latest_sha: Optional[str] = Field(
        description="Tip of the pinned revision on the remote; None if it could not be resolved",
        default=None,
    )
    update_available: bool = Field(
        description="True when the remote tip differs from the pinned commit",
        default=False,
    )


class AppRemoveRequest(BaseModel):
    """Request to remove an app"""
    url: str = Field(description="URL of the app to remove")


class JobFileInfo(BaseModel):
    """Information about a job file"""
    path: str = Field(description="Absolute path to the file")
    exists: bool = Field(description="Whether the file exists on disk")
    fsp_name: Optional[str] = Field(description="File share path name for browse link", default=None)
    subpath: Optional[str] = Field(description="Subpath within the FSP for browse link", default=None)


class Job(BaseModel):
    """A job record"""
    id: int = Field(description="Unique job identifier")
    app_url: str = Field(description="URL of the app manifest")
    app_name: str = Field(description="Name of the app")
    manifest_path: str = Field(description="Relative manifest path within the app repo", default="")
    entry_point_id: str = Field(description="Entry point that was executed")
    entry_point_name: str = Field(description="Display name of the entry point")
    name: str = Field(description="Human-editable job name")
    entry_point_type: str = Field(description="Whether this is a batch job or long-running service", default="job")
    parameters: Dict = Field(description="Parameters used for the job")
    env_parameters: Optional[Dict] = Field(
        description="Environment-tab parameter values (separate namespace from parameters)",
        default=None,
    )
    status: str = Field(description="Job status (PENDING, RUNNING, UNKNOWN, DONE, FAILED, KILLED)")
    exit_code: Optional[int] = Field(description="Exit code of the job", default=None)
    resources: Optional[Dict] = Field(description="Requested resources", default=None)
    env: Optional[Dict[str, str]] = Field(description="Environment variables used for the job", default=None)
    clean_env: Optional[bool] = Field(
        description="Whether the job ran in a clean shell (minimal environment) "
                    "instead of the user's login environment",
        default=None,
    )
    pre_run: Optional[str] = Field(description="Script run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script run after the main command", default=None)
    container: Optional[str] = Field(description="Container image URL used for this job", default=None)
    container_args: Optional[str] = Field(description="Extra arguments for container exec (e.g. '--nv' for GPU)", default=None)
    command: Optional[str] = Field(description="Base command for the entry point", default=None)
    conda_env: Optional[str] = Field(description="Conda environment activated for the job", default=None)
    requirements: Optional[List[str]] = Field(description="Declared runtime requirements (e.g. ['nextflow', 'apptainer'])", default=None)
    work_dir: Optional[str] = Field(description="Working directory the job ran in", default=None)
    commit_sha: Optional[str] = Field(description="Commit whose code the job executed", default=None)
    code_repo_url: Optional[str] = Field(
        description="Repo the executed commit belongs to, when it differs from app_url",
        default=None,
    )
    cluster_job_id: Optional[str] = Field(description="Cluster-assigned job ID", default=None)
    service_url: Optional[str] = Field(description="URL of the running service (for service-type jobs)", default=None)
    phase: Optional[str] = Field(description="Startup phase of a running service before its URL is ready, e.g. 'pulling_image' or 'starting'", default=None)
    created_at: datetime = Field(description="When the job was created")
    started_at: Optional[datetime] = Field(description="When the job started running", default=None)
    finished_at: Optional[datetime] = Field(description="When the job finished", default=None)
    files: Optional[Dict[str, JobFileInfo]] = Field(description="Job file paths and existence", default=None)


class JobSubmitRequest(BaseModel):
    """Request to submit a new job"""
    app_url: str = Field(description="URL of the app manifest")
    manifest_path: str = Field(description="Relative manifest path within the app repo", default="")
    name: Optional[str] = Field(
        description="Job name; defaults to 'app name - entry point' when omitted",
        default=None,
    )
    entry_point_id: str = Field(description="Entry point to execute")
    parameters: Dict = Field(description="Parameter values keyed by parameter key")
    env_parameters: Dict = Field(
        description="Environment-tab parameter values, keyed by parameter key (separate namespace from parameters)",
        default={},
    )
    resources: Optional[AppResourceDefaults] = Field(description="Resource overrides", default=None)
    extra_args: Optional[str] = Field(description="Extra CLI args for the submit command (replaces config defaults)", default=None)
    env: Optional[Dict[str, str]] = Field(description="Environment variables to export", default=None)
    clean_env: bool = Field(
        description="Run the job in a clean shell (minimal environment) instead "
                    "of the user's login environment",
        default=False,
    )
    pre_run: Optional[str] = Field(description="Script to run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script to run after the main command", default=None)
    container: Optional[str] = Field(
        description="Container image URL override (defaults to manifest value)",
        default=None,
    )
    container_args: Optional[str] = Field(
        description="Extra arguments for container exec (e.g. '--nv' for GPU)",
        default=None,
    )

    @field_validator("extra_args")
    @classmethod
    def validate_extra_args(cls, v):
        # extra_args are shlex-split into argv tokens and passed to the
        # scheduler via exec (no shell — see cluster_api's bsub), so shell
        # metacharacters are safe and in fact required: LSF resource strings
        # like -R "select[mem>8000]" contain '>', '[' and ']'. Only require
        # that the string parses into balanced tokens and carries no NUL.
        if v is None:
            return v
        if "\x00" in v:
            raise ValueError("extra_args must not contain NUL bytes")
        try:
            shlex.split(v)
        except ValueError as e:
            raise ValueError(f"extra_args could not be parsed into arguments: {e}")
        return v

    @field_validator("container")
    @classmethod
    def validate_container(cls, v):
        if v is not None and _SHELL_METACHAR_PATTERN.search(v):
            raise ValueError(f"container contains forbidden characters: {v!r}")
        return v

    @field_validator("container_args")
    @classmethod
    def validate_container_args(cls, v):
        if v is not None and _SHELL_METACHAR_PATTERN.search(v):
            raise ValueError(f"container_args contains forbidden characters: {v!r}")
        return v


class UpdateJobRequest(BaseModel):
    """Request to rename a job"""
    name: str = Field(description="New job name")


class PathValidationRequest(BaseModel):
    """Request to validate file/directory paths"""
    paths: Dict[str, str] = Field(description="Map of parameter key to path value")
    may_be_missing: List[str] = Field(
        default=[],
        description="Keys whose path may not exist yet (exists=false params): "
                    "validated for file-share containment only, not existence",
    )
    types: Dict[str, str] = Field(
        default={},
        description="Expected type per key ('file' or 'directory'): when the "
                    "path exists, its type must match",
    )


class PathValidationResponse(BaseModel):
    """Response with path validation results"""
    errors: Dict[str, str] = Field(description="Map of parameter key to error message (empty if all valid)")


class JobResponse(BaseModel):
    """Response containing a list of jobs"""
    jobs: List[Job] = Field(description="A list of jobs")


class JobActiveCountResponse(BaseModel):
    """Response containing the number of pending/running jobs (UNKNOWN excluded)"""
    count: int = Field(description="Number of active jobs")
