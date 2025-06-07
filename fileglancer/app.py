from jupyter_server.extension.application import ExtensionApp
from fileglancer.handlers import (
    FileSharePathsHandler,
    FileMetadataHandler,
    FileContentHandler,
    VersionHandler,
    StaticHandler,
    PreferencesHandler,
    ProxiedPathHandler,
    ProfileHandler,
    TicketHandler,
)
from pathlib import Path, PurePath
from traitlets import (
    TraitType,
    Undefined,
    Unicode
)

class PathType(TraitType):
    """A pathlib traitlet type which allows string and undefined values."""

    @property
    def info_text(self):
        return 'a pathlib.PurePath object'

    def validate(self, obj, value):
        if isinstance(value, str):
            return Path(value).expanduser()
        if isinstance(value, PurePath):
            return value
        if value == Undefined:
            return value
        self.error(obj, value)


class Fileglancer(ExtensionApp):

    name = "fileglancer"
    app_name = "fileglancer-server"
    load_other_extensions = True
    default_url = "/fg/"

    ui_path = PathType(
        default_value=Path(__file__).parent / "ui",
        config=False,
        help="Path to the UI files.",
    )

    central_url = Unicode(
        None,
        allow_none=True,
        config=True,
        help="The URL of the central server",
    )
    
    def initialize_settings(self):
        """Update extension settings.

        Update the self.settings trait to pass extra settings to the underlying
        Tornado Web Application.

        self.settings.update({'<trait>':...})
        """
        super().initialize_settings()

        # startup messages
        self.log.info("Starting Fileglancer server...")
        self.log.info(f'Serving UI from: {self.ui_path}')
        self.log.debug(
            'FileGlancerServer config:\n' + '\n'.join(
                f'  * {key} = {repr(value)}'
                for key, value in self.config['Fileglancer'].items()
            )
        )

    def initialize_handlers(self):
        self.handlers.extend([
            (r"/api/fileglancer/file-share-paths", FileSharePathsHandler),
            (r"/api/fileglancer/proxied-path", ProxiedPathHandler),
            (r"/api/fileglancer/files/(.*)", FileMetadataHandler),
            (r"/api/fileglancer/files", FileMetadataHandler),
            (r"/api/fileglancer/content/(.*)", FileContentHandler),
            (r"/api/fileglancer/version", VersionHandler),
            (r"/api/fileglancer/preference", PreferencesHandler),
            (r"/api/fileglancer/profile", ProfileHandler),
            (r"/api/fileglancer/ticket", TicketHandler),
            (r"/fg/(.*)", StaticHandler, {
                "path": str(self.ui_path),
                "default_filename": "index.html",
            }),
        ])
