#!/usr/bin/env python3
"""
Command-line interface for Fileglancer using Click.
"""
import click
import uvicorn
from pathlib import Path
from loguru import logger

@click.group()
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

    if ssl_keyfile:
        config_kwargs['ssl_keyfile'] = ssl_keyfile

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
    import json
    logger.trace(f"Starting Uvicorn with args:\n{json.dumps(config_kwargs, indent=2, sort_keys=True)}")
    uvicorn.run(**config_kwargs)


if __name__ == '__main__':
    cli()
