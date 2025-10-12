# Fileglancer

[![Github Actions Status](https://github.com/JaneliaSciComp/fileglancer/workflows/Build/badge.svg)](https://github.com/JaneliaSciComp/fileglancer/actions/workflows/build.yml)
[![DOI](https://zenodo.org/badge/918344432.svg)](https://doi.org/10.5281/zenodo.17314767)

Fileglancer is a web application designed to allow researchers to easily browse, share, and manage large scientific imaging data using [OME-NGFF](https://github.com/ome/ngff) (i.e. OME-Zarr). Our goal is to reduce the friction experienced by users who want to easily share their data with their colleagues. Simply browse to your data, click on the Neuroglancer link, and send that link to your collaborator.

Core features:

- Browse and manage files on network file shares (NFS) using an intuitive web UI
- Create a "data link" for any file share path, allowing web-based anonymous access to your data
- Shareable links to Neuroglancer and other viewers
- Integration with our help desk (JIRA) for file conversion requests
- Integration with our [x2s3](https://github.com/JaneliaSciComp/x2s3) proxy service, to easily share data on the internet

See the [documentation](https://janeliascicomp.github.io/fileglancer-docs/) for more information.

<p align="center">
<img alt="Fileglancer screenshot" width="800" src="https://github.com/user-attachments/assets/e17079a6-66ca-4064-8568-7770c5af33d5" />
</p>

## Deployment @ Janelia Research Campus

If you are on the internal Janelia network navigate to "fileglancer.int.janelia.org" in your web browser and login with your Okta credentials. If you are outside of Janelia, you'll need to ask your System Administrator to install Fileglancer on a server on your institution's network.

## Software Architecture

Fileglancer is built on top of [JupyterHub](https://jupyter.org/hub), which provides the infrastructure for allowing users to login and interact directly with their files on mounted network file systems. JupyterHub runs a "single user server" for each user who logs in, in a process owned by that user. The Fileglancer plugin for JupyterHub replaces the UI with a new SPA webapp that connects back to a custom backend running inside the single user server. We also added a "central server" to serve shared data and to manage connections to a shared database for saving preferences, data links, and other persistent information.

<p align="center">
<img alt="Fileglancer architecture diagram" width="800" align="center" src="https://github.com/user-attachments/assets/fd39361d-ee62-422c-912a-5668c5ffdfb9" />
</p>

The current code base is geared towards a Janelia deployment, but we are working towards decoupling it. Please reach out to us if you are interested in deploying Fileglancer at your institution. We've be happy to consider pull requests (PRs) with the goal of making Fileglancer more useful outside of the Janelia.

## Documentation

- [User guide](https://janeliascicomp.github.io/fileglancer-docs/)
- [Developer guide](docs/Development.md)

## Related repositories

- [fileglancer-central](https://github.com/JaneliaSciComp/fileglancer-central) - Backend API managing access to shared resources
- [fileglancer-hub](https://github.com/JaneliaSciComp/fileglancer-hub) - Deployment of Fileglancer into JupyterHub
- [fileglancer-janelia](https://github.com/JaneliaSciComp/fileglancer-janelia) - Janelia-specific customizations
- [fileglancer-docs](https://github.com/JaneliaSciComp/fileglancer-docs) - Documentation website
