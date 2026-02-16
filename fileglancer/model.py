import re
from datetime import datetime
from typing import Annotated, Any, List, Literal, Optional, Dict, Union

from pydantic import BaseModel, Discriminator, Field, HttpUrl, Tag, field_validator, model_validator


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
    username: str = Field(
        description="The username of the user who owns this proxied path"
    )
    sharing_key: str = Field(
        description="The sharing key is part of the URL proxy path. It is used to uniquely identify the proxied path."
    )
    sharing_name: str = Field(
        description="The sharing path is part of the URL proxy path. It is mainly used to provide file extension information to the client."
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
    url: Optional[HttpUrl] = Field(
        description="The URL for accessing the data via the proxy",
        default=None
    )

class ProxiedPathResponse(BaseModel):
    paths: List[ProxiedPath] = Field(
        description="A list of proxied paths"
    )


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


# --- App Manifest Models ---

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

    @field_validator("flag")
    @classmethod
    def validate_flag(cls, v):
        if v is not None:
            if not v.startswith("-"):
                raise ValueError(f"Flag must start with '-', got '{v}'")
            stripped = v.lstrip("-")
            if not stripped:
                raise ValueError("Flag must have content after dashes")
        return v


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


class AppEntryPoint(BaseModel):
    """An entry point (command) within an app"""
    id: str = Field(description="Unique identifier for the entry point")
    name: str = Field(description="Display name of the entry point")
    description: Optional[str] = Field(description="Description of the entry point", default=None)
    command: str = Field(description="The base CLI command to execute")
    parameters: List[AppParameterItem] = Field(description="Parameters for this entry point", default=[])
    resources: Optional[AppResourceDefaults] = Field(description="Default resource requirements", default=None)
    env: Optional[Dict[str, str]] = Field(description="Default environment variables", default=None)
    pre_run: Optional[str] = Field(description="Script to run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script to run after the main command", default=None)

    def flat_parameters(self) -> List[AppParameter]:
        """Return a flat list of all parameters, traversing sections."""
        result = []
        for item in self.parameters:
            if isinstance(item, AppParameterSection):
                result.extend(item.parameters)
            else:
                result.append(item)
        return result

    @model_validator(mode='after')
    def generate_parameter_keys(self):
        positional_index = 0
        keys_seen: dict[str, str] = {}
        for param in self.flat_parameters():
            if param.flag is not None:
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


SUPPORTED_TOOLS = {"pixi", "npm", "maven"}


class AppManifest(BaseModel):
    """Top-level app manifest (runnables.yaml)"""
    name: str = Field(description="Display name of the app")
    description: Optional[str] = Field(description="Description of the app", default=None)
    version: Optional[str] = Field(description="Version of the app", default=None)
    repo_url: Optional[str] = Field(
        description="GitHub repo URL where the tool code lives. If absent, uses the repo containing this manifest.",
        default=None,
    )
    requirements: List[str] = Field(
        description="Required tools, e.g. ['pixi>=0.40', 'npm']",
        default=[],
    )
    runnables: List[AppEntryPoint] = Field(description="Available entry points for this app")

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, v):
        for req in v:
            tool = re.split(r"[><=!]", req)[0].strip()
            if tool not in SUPPORTED_TOOLS:
                raise ValueError(f"Unsupported tool: '{tool}'. Supported: {SUPPORTED_TOOLS}")
        return v


class UserApp(BaseModel):
    """A user's saved app reference"""
    url: str = Field(description="URL to the app manifest")
    manifest_path: str = Field(description="Relative directory path to the manifest within the repo", default="")
    name: str = Field(description="App name from manifest")
    description: Optional[str] = Field(description="App description from manifest", default=None)
    added_at: datetime = Field(description="When the app was added")
    manifest: Optional[AppManifest] = Field(description="Cached manifest data", default=None)


class ManifestFetchRequest(BaseModel):
    """Request to fetch an app manifest"""
    url: str = Field(description="URL to the app manifest or GitHub repo")
    manifest_path: str = Field(description="Relative directory path to the manifest within the repo", default="")


class AppAddRequest(BaseModel):
    """Request to add an app"""
    url: str = Field(description="URL to the app manifest or GitHub repo")


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
    parameters: Dict = Field(description="Parameters used for the job")
    status: str = Field(description="Job status (PENDING, RUNNING, DONE, FAILED, KILLED)")
    exit_code: Optional[int] = Field(description="Exit code of the job", default=None)
    resources: Optional[Dict] = Field(description="Requested resources", default=None)
    env: Optional[Dict[str, str]] = Field(description="Environment variables used for the job", default=None)
    pre_run: Optional[str] = Field(description="Script run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script run after the main command", default=None)
    pull_latest: bool = Field(description="Whether pull latest was enabled", default=False)
    cluster_job_id: Optional[str] = Field(description="Cluster-assigned job ID", default=None)
    created_at: datetime = Field(description="When the job was created")
    started_at: Optional[datetime] = Field(description="When the job started running", default=None)
    finished_at: Optional[datetime] = Field(description="When the job finished", default=None)
    files: Optional[Dict[str, JobFileInfo]] = Field(description="Job file paths and existence", default=None)


class JobSubmitRequest(BaseModel):
    """Request to submit a new job"""
    app_url: str = Field(description="URL of the app manifest")
    manifest_path: str = Field(description="Relative manifest path within the app repo", default="")
    entry_point_id: str = Field(description="Entry point to execute")
    parameters: Dict = Field(description="Parameter values keyed by parameter key")
    resources: Optional[AppResourceDefaults] = Field(description="Resource overrides", default=None)
    pull_latest: bool = Field(
        description="Pull latest code from GitHub before running",
        default=False,
    )
    env: Optional[Dict[str, str]] = Field(description="Environment variables to export", default=None)
    pre_run: Optional[str] = Field(description="Script to run before the main command", default=None)
    post_run: Optional[str] = Field(description="Script to run after the main command", default=None)


class PathValidationRequest(BaseModel):
    """Request to validate file/directory paths"""
    paths: Dict[str, str] = Field(description="Map of parameter key to path value")


class PathValidationResponse(BaseModel):
    """Response with path validation results"""
    errors: Dict[str, str] = Field(description="Map of parameter key to error message (empty if all valid)")


class JobResponse(BaseModel):
    """Response containing a list of jobs"""
    jobs: List[Job] = Field(description="A list of jobs")
