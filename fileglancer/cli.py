#!/usr/bin/env python3
"""
Command-line interface for Fileglancer using Click.
"""
import os
import click
import uvicorn
import json
from pathlib import Path
from loguru import logger

@click.group(epilog="Run 'fileglancer COMMAND --help' for more information on a command.")
@click.version_option()
def cli():
    """Fileglancer - File browsing and sharing platform"""
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
def start(host, port, reload, workers, ssl_keyfile, ssl_certfile,
          ssl_ca_certs, ssl_version, ssl_cert_reqs, ssl_ciphers, timeout_keep_alive):
    """Start the Fileglancer server using uvicorn."""

    # Configure loguru logger based on settings (if present)
    from fileglancer.settings import get_settings
    settings = get_settings()
    log_level = settings.log_level
    logger.remove()
    logger.add(lambda msg: click.echo(msg, nl=False), level=log_level, colorize=True)

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

    # Run uvicorn
    logger.info(f"Starting Fileglancer server on {host}:{port}")
    logger.trace(f"Starting Uvicorn with args:\n{json.dumps(config_kwargs, indent=2, sort_keys=True)}")
    uvicorn.run(**config_kwargs)


if __name__ == '__main__':
    cli()
