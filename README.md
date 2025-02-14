# fileglancer_server

[![Github Actions Status](https://github.com/JaneliaSciComp/fileglancer/workflows/Build/badge.svg)](https://github.com/JaneliaSciComp/fileglancer/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/JaneliaSciComp/fileglancer/main?urlpath=lab)


Browse, share, and publish files on the Janelia file system

This extension is composed of a Python package named `fileglancer_server`
for the server extension and a NPM package named `fileglancer-server`
for the frontend extension.

## Development install

<<<<<<< HEAD
- JupyterLab >= 4.0.0

## Install

To install the extension, execute:

```bash
pip install fileglancer_server
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall fileglancer_server
```

## Troubleshoot

If you are seeing the frontend extension, but it is not working, check
that the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled, but you are not seeing
the frontend extension, check the frontend extension is installed:

```bash
jupyter labextension list
=======
Clone the repo to your local environment and change directory to the new repo folder.

```bash
git clone git@github.com:JaneliaSciComp/fileglancer.git
cd fileglancer
```

Create and activate the Conda environment.

```bash
# This will use the environment.yml file in the repo
conda env create
conda activate fileglancer-extension
```

Install package in development mode.

```bash
pip install -e "."
```

Link your development version of the extension with JupyterLab

```bash
jupyter labextension develop . --overwrite
>>>>>>> main
```

Rebuild extension Typescript source after making changes.

```bash
<<<<<<< HEAD
# Clone the repo to your local environment
# Change directory to the fileglancer_server directory
# Install package in development mode
pip install -e ".[test]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable fileglancer_server
# Rebuild extension Typescript source after making changes
=======
>>>>>>> main
jlpm build
```

_Note:_ The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension. With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
```

```bash
# Run JupyterLab in another terminal
jupyter lab
```

If everything has worked so far, you should see the React Widget on the Launcher pane:

![Screenshot of the JupyterLab Launcher panel. In the bottom section, titled "Other", the square tile with the title "React Widget" is circled](./assets/img/JupyterLab-launcher.png)

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
# Server extension must be manually disabled in develop mode
jupyter server extension disable fileglancer_server
pip uninstall fileglancer_server
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `fileglancer-server` within that folder.

### Testing the extension

#### Server tests

This extension is using [Pytest](https://docs.pytest.org/) for Python code testing.

Install test dependencies (needed only once):

```sh
pip install -e ".[test]"
# Each time you install the Python package, you need to restore the front-end extension link
jupyter labextension develop . --overwrite
```

To execute them, run:

```sh
pytest -vv -r ap --cov fileglancer_server
```

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm
jlpm test
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

### Packaging the extension

See [RELEASE](RELEASE.md)
