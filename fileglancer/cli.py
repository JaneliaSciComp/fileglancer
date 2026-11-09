"""
Command-line interface for Fileglancer
"""
import os
import getpass
import secrets
import signal
import sys
import asyncio
import click
import uvicorn
import json
import webbrowser
import threading
import time
import socket
from importlib import resources
from pathlib import Path
from datetime import datetime, timedelta, UTC
from loguru import logger

from fileglancer import database as db
from fileglancer.settings import CONFIG_FILE_ENV, get_settings, reload_settings


def user_config_path() -> Path:
    """The personal server's config: $XDG_CONFIG_HOME/fileglancer/config.yaml."""
    base = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    return base / 'fileglancer' / 'config.yaml'


def user_data_dir() -> Path:
    """Where the personal server keeps its database and generated secrets."""
    return Path.home() / '.local' / 'share' / 'fileglancer'


def ensure_config_file(path: Path) -> bool:
    """Write the packaged default config at path if nothing is there yet.

    The default sets nothing: it is the list of settings a personal server
    user might want, commented, so there is always a file to edit. It is
    private because simple_auth_password may end up in it. Returns True
    when the file was created.
    """
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(mode=0o600)
    path.write_text(resources.files('fileglancer').joinpath('personal-config.yaml').read_text())
    return True


def persistent_session_key(data_dir: Path) -> str:
    """A session signing key that survives restarts, so the browser stays
    logged in across them. Generated once, kept private next to the database."""
    key_file = data_dir / 'session_secret_key'
    if not key_file.exists():
        key_file.touch(mode=0o600)
        key_file.write_text(secrets.token_urlsafe(32))
    return key_file.read_text().strip()


def run_server_with_interrupt_handler(config, url, cleanup_callback=None):
    """Run uvicorn server in a thread with custom interrupt handling in main thread"""

    server = uvicorn.Server(config)
    server_thread = None
    interrupted = False
    in_prompt = False

    def run_server():
        """Run server in thread - this disables signal handlers in the thread"""
        # Disable signal handlers in this thread - they'll be handled in main thread
        server.install_signal_handlers = lambda: None
        server.run()

    def handle_interrupt(signum, frame):
        """Handle Ctrl-C with confirmation prompt"""
        nonlocal interrupted, in_prompt

        if interrupted and in_prompt:
            # Second Ctrl-C during prompt - graceful shutdown
            # Write newline to stderr to break out of input()
            sys.stderr.write("\n")
            sys.stderr.flush()
            if cleanup_callback:
                cleanup_callback()
            server.should_exit = True
            # Raise KeyboardInterrupt to break out of input()
            raise KeyboardInterrupt

        if interrupted:
            # Second Ctrl-C not during prompt
            if cleanup_callback:
                cleanup_callback()
            server.should_exit = True
            return

        interrupted = True

        print(f"\n\nTo access the server, open this URL in a web browser:\n\n        {url}\n")

        # Prompt for confirmation
        in_prompt = True
        try:
            response = input("Shut down this Fileglancer server (y/[n])? ")
            in_prompt = False

            if response.lower() in ['y', 'yes', '']:
                if cleanup_callback:
                    cleanup_callback()
                server.should_exit = True
            else:
                print("Resuming server...")
                interrupted = False
        except (KeyboardInterrupt, EOFError):
            # Ctrl-C during prompt or just Enter
            in_prompt = False
            # Only print if we haven't already printed above
            if not server.should_exit:
                if cleanup_callback:
                    cleanup_callback()
                server.should_exit = True

    # Install signal handlers in main thread
    signal.signal(signal.SIGINT, handle_interrupt)
    signal.signal(signal.SIGTERM, handle_interrupt)

    # Start server in background thread
    server_thread = threading.Thread(target=run_server, daemon=False)
    server_thread.start()

    # Wait for server thread to finish
    server_thread.join()


@click.group(epilog="Run 'fileglancer COMMAND --help' for more information on a command.")
@click.version_option()
def cli():
    """Fileglancer - NGFF browsing and sharing platform"""
    pass


@cli.command()
@click.option('--host', default='127.0.0.1', show_default=True,
              help='Bind socket to this host.')
@click.option('--port', default=8000, show_default=True, type=int,
              help='Bind socket to this port.')
@click.option('--reload', is_flag=True, default=False,
              help='Enable auto-reload.')
@click.option('--workers', default=None, type=int,
              help='Number of worker processes.')
@click.option('--file-share-mounts', '-f', multiple=True,
              help='File share path to mount (can be specified multiple times). '
                   'If you have many mounts, it is easier to set these via the config file. '
                   'File share paths specified here will override the config file setting. '
                   'Use ~/ prefix for home directory.'
                   )
@click.option('--ssl-keyfile', type=click.Path(exists=True),
              help='SSL key file path.')
@click.option('--ssl-certfile', type=click.Path(exists=True),
              help='SSL certificate file path.')
@click.option('--ssl-ca-certs', type=click.Path(exists=True),
              help='CA certificates file path.')
@click.option('--ssl-version', default=None, type=int,
              help='SSL version to use.')
@click.option('--ssl-cert-reqs', default=None, type=int,
              help='Whether client certificate is required.')
@click.option('--ssl-ciphers', default='TLSv3', show_default=True,
              help='Ciphers to use.')
@click.option('--timeout-keep-alive', default=5, show_default=True, type=int,
              help='Close Keep-Alive connections if no new data is received within this timeout.')
@click.option('--auto-port', default=True,
              help='Automatically find an available port if the specified port is in use.')
@click.option('--no-browser', is_flag=True, default=False,
              help='Do not open web browser automatically.')
@click.option('--config', 'config', default=None, type=click.Path(dir_okay=False),
              help='Config file to read. Defaults to FGC_CONFIG_FILE, then '
                   '~/.config/fileglancer/config.yaml, which is created on first run.')

def start(host, port, reload, workers, ssl_keyfile, ssl_certfile,
          ssl_ca_certs, ssl_version, ssl_cert_reqs, ssl_ciphers, timeout_keep_alive, auto_port, no_browser,
          file_share_mounts, config):
    """Start the Fileglancer server using uvicorn."""

    # Which config to read: --config, then FGC_CONFIG_FILE, then the user's
    # own file, created from the packaged default on first run so there is
    # always something to edit. The choice is exported so server processes
    # that uvicorn starts (--reload, --workers) read the same file.
    explicit = config or os.environ.get(CONFIG_FILE_ENV)
    config_path = Path(explicit or user_config_path()).expanduser()
    created = False
    if explicit:
        if not config_path.is_file():
            raise click.ClickException(f"Config file not found: {config_path}")
    else:
        created = ensure_config_file(config_path)
    os.environ[CONFIG_FILE_ENV] = str(config_path)

    # Set file share mounts from CLI if provided
    if file_share_mounts:
        os.environ['FGC_FILE_SHARE_MOUNTS'] = json.dumps(list(file_share_mounts))
        logger.debug(f"Setting FGC_FILE_SHARE_MOUNTS={os.environ['FGC_FILE_SHARE_MOUNTS']}")

    settings = get_settings()
    from fileglancer.logconf import configure_logging
    configure_logging(settings.log_level, settings.log_format,
                      text_sink=lambda msg: click.echo(msg, nl=False), colorize=True)
    if created:
        logger.info(f"Created default config at {config_path}")
    logger.info(f"Reading config from {config_path}")

    # Fill in the personal server's defaults for whatever the config leaves
    # unset. They go through the environment, which beats the config file,
    # so only fields the user did not set are touched.
    configured = settings.model_fields_set

    # The data directory holds the database (session ids and service URLs,
    # which are live credentials) and the session signing key, so it must
    # not be readable by other users on a shared home. The directory mode
    # also covers SQLite's -wal and -shm sidecars. Both modes are set
    # unconditionally, to fix an install created under a laxer umask.
    data_dir = user_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(data_dir, 0o700)

    if 'db_url' not in configured:
        db_path = data_dir / 'fileglancer.db'
        db_path.touch(mode=0o600, exist_ok=True)
        os.chmod(db_path, 0o600)
        os.environ['FGC_DB_URL'] = f'sqlite:///{db_path}'
        logger.debug(f"Setting FGC_DB_URL=sqlite:///{db_path}")

    if 'session_secret_key' not in configured:
        os.environ['FGC_SESSION_SECRET_KEY'] = persistent_session_key(data_dir)

    # In-process job execution and the auto-login endpoint.
    os.environ['FGC_CLI_MODE'] = 'true'

    if (workers or 0) > 1 and not settings.enable_okta_auth \
            and 'simple_auth_password' not in configured:
        raise click.ClickException(
            f"--workers needs simple_auth_password set in {config_path}: "
            f"each worker would otherwise print its own login password")

    # Find available port if auto_port is enabled
    if auto_port:
        import socket
        original_port = port
        max_attempts = 100
        for attempt in range(max_attempts):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind((host, port))
                    if port != original_port:
                        logger.info(f"Port {original_port} in use, trying port {port} instead")
                    break
                except OSError:
                    port += 1
        else:
            logger.error(f"Could not find an available port after {max_attempts} attempts starting from {original_port}")
            return

    # Build uvicorn config
    config_kwargs = {
        'app': 'fileglancer.server:app',
        'host': host,
        'port': port,
        'proxy_headers': True,
        'forwarded_allow_ips': '*',
        'timeout_keep_alive': timeout_keep_alive
    }

    # Add optional parameters only if they're set
    if reload:
        config_kwargs['reload'] = True

    if workers is not None:
        config_kwargs['workers'] = workers

    if ssl_keyfile:
        config_kwargs['ssl_keyfile'] = ssl_keyfile

    # Reload settings to pick up the environment variables set above.
    settings = reload_settings()

    # Initialize database (run migrations) before creating session
    # This is normally done in app.py lifespan, but we need it earlier for CLI session
    db.initialize_database(settings.db_url)
    logger.debug("Database initialized")

    if ssl_certfile:
        config_kwargs['ssl_certfile'] = ssl_certfile

    if ssl_ca_certs:
        config_kwargs['ssl_ca_certs'] = ssl_ca_certs

    if ssl_version is not None:
        config_kwargs['ssl_version'] = ssl_version

    if ssl_cert_reqs is not None:
        config_kwargs['ssl_cert_reqs'] = ssl_cert_reqs

    if ssl_ciphers:
        config_kwargs['ssl_ciphers'] = ssl_ciphers

    def wait_for_server_and_open_browser(url, host, port, max_attempts=30, check_interval=0.5):
        """Wait for server to be ready, then open browser"""
        for attempt in range(max_attempts):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    result = s.connect_ex((host if host != '0.0.0.0' else '127.0.0.1', port))
                    if result == 0:
                        # Server is ready, open browser
                        webbrowser.open(url)
                        logger.info(f"\nTo access the server, open this URL in a web browser:\n\n        {url}\n")
                        return
            except Exception:
                pass
            time.sleep(check_interval)

        logger.warning(f"Server did not become ready after {max_attempts * check_interval:.1f}s, could not open browser")

    # Set up browser opening if not disabled
    cli_session_id = None
    protocol = 'https' if ssl_keyfile else 'http'
    browser_host = '127.0.0.1' if host == '0.0.0.0' else host

    if not no_browser:
        # Create auto-login session for the system user. The session id in the
        # URL is what lets the browser we open skip the password prompt; any
        # other browser logs in with the password the server prints at startup.
        system_username = getpass.getuser()
        expires_at = datetime.now(UTC) + timedelta(hours=settings.session_expiry_hours)

        with db.get_db_session(settings.db_url) as session:
            user_session = db.create_session(
                session=session,
                username=system_username,
                email=None,
                expires_at=expires_at,
                session_secret_key=settings.session_secret_key
            )
            cli_session_id = user_session.session_id

        # Create URL with session_id for auto-login
        url = f"{protocol}://{browser_host}:{port}/api/auth/cli-login?session_id={cli_session_id}"

        # Start browser opening in background thread
        threading.Thread(
            target=wait_for_server_and_open_browser,
            args=(url, host, port),
            daemon=True
        ).start()

        logger.info(f"Starting Fileglancer server on {host}:{port} (opening browser)")
    else:
        # Create URL without session_id for display
        url = f"{protocol}://{browser_host}:{port}"
        logger.info(f"Starting Fileglancer server on {host}:{port}")

    logger.trace(f"Starting Uvicorn with args:\n{json.dumps(config_kwargs, indent=2, sort_keys=True)}")

    def cleanup_session():
        """Clean up CLI session when server is terminated"""
        if cli_session_id:
            try:
                with db.get_db_session(settings.db_url) as session:
                    db.delete_session(session, cli_session_id)
                    logger.trace(f"Cleaned up CLI auto-login session")
            except Exception as e:
                logger.warning(f"Failed to clean up CLI session: {e}")

    # Create uvicorn config and run server with custom interrupt handling
    config = uvicorn.Config(**config_kwargs)

    try:
        run_server_with_interrupt_handler(config, url, cleanup_callback=cleanup_session)
    finally:
        cleanup_session()


@cli.command()
@click.option('--db-url', default=None,
              help='Database URL. Defaults to FGC_DB_URL/config.yaml, then '
                   'the standard CLI database location.')
@click.option('--refresh', default=1.0, show_default=True, type=float,
              help='Database refresh interval in seconds.')
@click.option('--poll-lock', default=None, type=click.Path(),
              help='Path to the poll lock file, if the server runs with a '
                   'non-default TMPDIR.')
@click.option('--all-jobs', is_flag=True, default=False,
              help='Start with terminal jobs shown as well as active ones.')
@click.option('--log', 'log_file', default=None, type=click.Path(),
              help='Also append the event feed to this file for later analysis.')
def debug(db_url, refresh, poll_lock, all_jobs, log_file):
    """Real-time TUI for debugging the job system.

    Shows all users' jobs and their statuses, the per-user worker
    subprocesses, which server process holds the poll lock (i.e. which one
    is polling), live scheduler commands (bsub/bjobs/bkill), and an event
    feed of status transitions. Read-only: it never modifies the database
    or signals any process.
    """
    from fileglancer.debug import run_debug
    run_debug(db_url=db_url, refresh=refresh, poll_lock_path=poll_lock,
              show_all=all_jobs, log_file=log_file)


if __name__ == '__main__':
    cli()
