#leaned up CLI auto-login session
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
from pathlib import Path
from datetime import datetime, timedelta, UTC
from loguru import logger

from fileglancer import database as db


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
def start(host, port, reload, workers, ssl_keyfile, ssl_certfile,
          ssl_ca_certs, ssl_version, ssl_cert_reqs, ssl_ciphers, timeout_keep_alive, auto_port, no_browser):
    """Start the Fileglancer server using uvicorn."""

    # Set up default external proxy URL if not already configured
    # Need to set this before loading settings as it is required in the Settings model
    if 'FGC_EXTERNAL_PROXY_URL' not in os.environ:
        protocol = 'https' if ssl_keyfile else 'http'
        external_proxy_url = f"{protocol}://{host}:{port}/files"
        os.environ['FGC_EXTERNAL_PROXY_URL'] = external_proxy_url
        logger.debug(f"Setting FGC_EXTERNAL_PROXY_URL={external_proxy_url}")

    # Configure loguru logger based on settings (if present)
    from fileglancer.settings import get_settings, reload_settings
    settings = get_settings()
    log_level = settings.log_level
    logger.remove()
    logger.add(lambda msg: click.echo(msg, nl=False), level=log_level, colorize=True)

    # Set up default database location if not already configured
    if 'FGC_DB_URL' not in os.environ:
        # Create data directory in user's home
        data_dir = Path.home() / '.local' / 'share' / 'fileglancer'
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = data_dir / 'fileglancer.db'
        os.environ['FGC_DB_URL'] = f'sqlite:///{db_path}'
        logger.debug(f"Setting FGC_DB_URL=sqlite:///{db_path}")

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
        'app': 'fileglancer.app:app',
        'host': host,
        'port': port,
        'access_log': False,
        'proxy_headers': True,
        'forwarded_allow_ips': '*',
        'timeout_keep_alive': timeout_keep_alive
    }

    # Add optional parameters only if they're set
    if reload:
        config_kwargs['reload'] = True

    if workers is not None:
        config_kwargs['workers'] = workers

    # Set up external proxy URL based on host/port/SSL configuration
    # This is only set if not already configured in the environment
    if 'FGC_EXTERNAL_PROXY_URL' not in os.environ:
        protocol = 'https' if ssl_keyfile else 'http'
        external_proxy_url = f"{protocol}://{host}:{port}/files"
        os.environ['FGC_EXTERNAL_PROXY_URL'] = external_proxy_url
        logger.debug(f"Setting FGC_EXTERNAL_PROXY_URL={external_proxy_url}")

    if ssl_keyfile:
        config_kwargs['ssl_keyfile'] = ssl_keyfile
    else:
        # If there is no SSL, we need to set FGC_SESSION_COOKIE_SECURE=false
        # in the environment so that the session cookie is not marked as secure
        os.environ['FGC_SESSION_COOKIE_SECURE'] = 'false'
        logger.debug("No SSL keyfile provided, setting FGC_SESSION_COOKIE_SECURE=false in environment")

    # Reload settings to pick up environment variables we set above
    # This ensures the app will see the updated FGC_DB_URL, FGC_EXTERNAL_PROXY_URL, etc.
    settings = reload_settings()

    # Re-apply CLI mode and session secret key after reload
    settings.cli_mode = True
    if settings.session_secret_key is None:
        settings.session_secret_key = secrets.token_urlsafe(32)

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
        # Create auto-login session for the system user
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


if __name__ == '__main__':
    cli()
