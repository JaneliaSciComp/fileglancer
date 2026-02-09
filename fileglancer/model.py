from datetime import datetime
from typing import Any, List, Literal, Optional, Dict

from pydantic import BaseModel, Field, HttpUrl


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


class NeuroglancerShortLinkResponse(BaseModel):
    links: List[NeuroglancerShortLink] = Field(
        description="A list of stored Neuroglancer short links"
    )


# --- App Manifest Models ---

class AppParameter(BaseModel):
    """A parameter definition for an app entry point"""
    id: str = Field(description="Unique identifier for the parameter")
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
    parameters: List[AppParameter] = Field(description="Parameters for this entry point", default=[])
    resources: Optional[AppResourceDefaults] = Field(description="Default resource requirements", default=None)


class AppManifest(BaseModel):
    """Top-level app manifest (fileglancer-app.json)"""
    name: str = Field(description="Display name of the app")
    description: Optional[str] = Field(description="Description of the app", default=None)
    version: Optional[str] = Field(description="Version of the app", default=None)
    entryPoints: List[AppEntryPoint] = Field(description="Available entry points for this app")


class UserApp(BaseModel):
    """A user's saved app reference"""
    url: str = Field(description="URL to the app manifest")
    name: str = Field(description="App name from manifest")
    description: Optional[str] = Field(description="App description from manifest", default=None)
    added_at: datetime = Field(description="When the app was added")
    manifest: Optional[AppManifest] = Field(description="Cached manifest data", default=None)


class ManifestFetchRequest(BaseModel):
    """Request to fetch an app manifest"""
    url: str = Field(description="URL to the app manifest or GitHub repo")


class AppAddRequest(BaseModel):
    """Request to add an app"""
    url: str = Field(description="URL to the app manifest or GitHub repo")


class AppRemoveRequest(BaseModel):
    """Request to remove an app"""
    url: str = Field(description="URL of the app to remove")


class Job(BaseModel):
    """A job record"""
    id: int = Field(description="Unique job identifier")
    app_url: str = Field(description="URL of the app manifest")
    app_name: str = Field(description="Name of the app")
    entry_point_id: str = Field(description="Entry point that was executed")
    entry_point_name: str = Field(description="Display name of the entry point")
    parameters: Dict = Field(description="Parameters used for the job")
    status: str = Field(description="Job status (PENDING, RUNNING, DONE, FAILED, KILLED)")
    exit_code: Optional[int] = Field(description="Exit code of the job", default=None)
    resources: Optional[Dict] = Field(description="Requested resources", default=None)
    cluster_job_id: Optional[str] = Field(description="Cluster-assigned job ID", default=None)
    created_at: datetime = Field(description="When the job was created")
    started_at: Optional[datetime] = Field(description="When the job started running", default=None)
    finished_at: Optional[datetime] = Field(description="When the job finished", default=None)


class JobSubmitRequest(BaseModel):
    """Request to submit a new job"""
    app_url: str = Field(description="URL of the app manifest")
    entry_point_id: str = Field(description="Entry point to execute")
    parameters: Dict = Field(description="Parameter values keyed by parameter ID")
    resources: Optional[AppResourceDefaults] = Field(description="Resource overrides", default=None)


class JobResponse(BaseModel):
    """Response containing a list of jobs"""
    jobs: List[Job] = Field(description="A list of jobs")
