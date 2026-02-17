# Fileglancer

[![Github Actions Status](https://github.com/JaneliaSciComp/fileglancer/actions/workflows/build.yml/badge.svg?branch%3Amain)](https://github.com/JaneliaSciComp/fileglancer/actions/workflows/build.yml?query=branch%3Amain)

Fileglancer is a web application designed to allow researchers to easily browse, share, and manage large scientific imaging data using [OME-NGFF](https://github.com/ome/ngff) (i.e. OME-Zarr). Our goal is to reduce the friction experienced by users who want to easily share their data with colleagues at their institution. Simply browse to your data, click on the Neuroglancer link, and send that link to your collaborator.

Core features:

- Browse and manage files on network file shares (NFS) using an intuitive web UI
- Create a "data link" for any file share path, allowing web-based anonymous access to your data
- Shareable links to Neuroglancer and other viewers
- Integration with our help desk (JIRA) for file conversion requests
- Integration with the [x2s3](https://github.com/JaneliaSciComp/x2s3) proxy service, to easily share data on the internet

See the [documentation](https://janeliascicomp.github.io/fileglancer-docs/) for more information.

<p align="center">
<img alt="Fileglancer screenshot" width="800" src="https://github.com/user-attachments/assets/e17079a6-66ca-4064-8568-7770c5af33d5" />
</p>

## Installation

### Personal Deployment

Fileglancer can be run in a manner similar to Jupyter notebooks, by starting a web server from the command-line:

```bash
# Install from PyPI
pip install fileglancer

# Start the server
fileglancer start
```

This will start your personal server locally and open a web browser with Fileglancer loaded. By default, only your home directory (`~/`) will be browsable. You can browse and view your own data this way, but links to data will only work as long as your server is running. To share data reliably with others, you will need a persistent shared deployment.

### Shared Deployments

Fileglancer is primarily intended for shared deployments on an intranet. This allows groups of users to share data easily. If you are on the internal Janelia network navigate to "fileglancer.int.janelia.org" in your web browser and login with your Okta credentials. If you are outside of Janelia, you'll need to ask your System Administrator to install Fileglancer on a server on your institution's network.

## Software Architecture

Fileglancer has a React front-end and a FastAPI backend. Uvicorn is used to manage the set of FastAPI workers. Inspired by JupyterHub's method of spinning up individual user servers using setuid, we use seteuid to change the effective user of each worker process as necessary to handling the incoming requests. This allows each logged in user to access their resources on the network file systems. The backend database access is managed by SQLAlchemy and supports many databases including Sqlite and Postgresql.

<p align="center">
<img alt="Fileglancer architecture diagram" width="800" align="center" src="https://github.com/user-attachments/assets/31b30b01-f313-4295-8536-bac8c3bdde73" />
</p>

## Documentation

- [User guide](https://janeliascicomp.github.io/fileglancer-docs/)
- [Developer guide](docs/Development.md)

## Related repositories

- [fileglancer-hub](https://github.com/JaneliaSciComp/fileglancer-hub) - Production deployment files
- [fileglancer-janelia](https://github.com/JaneliaSciComp/fileglancer-janelia) - Janelia-specific customizations
- [fileglancer-docs](https://github.com/JaneliaSciComp/fileglancer-docs) - Documentation website
