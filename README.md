# Fileglancer frontend extension

[![Github Actions Status](https://github.com/JaneliaSciComp/fileglancer/workflows/Build/badge.svg)](https://github.com/JaneliaSciComp/fileglancer/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/JaneliaSciComp/fileglancer/main?urlpath=lab)

React-based frontend extension for the Fileglancer app.

## Development install

Clone the repo to your local environment and change directory to the new repo folder.

```bash
git clone git@github.com:JaneliaSciComp/fileglancer.git
cd fileglancer
```

If this is your first time installing the extension in dev mode, install package in development mode.

```bash
pixi run dev-install
```

You can build the frontend extension in watch mode - it will automatically rebuild when there are file changes to the frontend:

```bash
pixi run dev-watch
```

In new terminal, run Jupyter Lab in autoreload mode - it will automatically rebuild when there are file changes to the backend:

```bash
pixi run dev-launch
```

Saved changes in your directory should now be automatically built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

If everything has worked so far, you should see the React Widget on the Launcher pane:

![Screenshot of the JupyterLab Launcher panel. In the bottom section, titled "Other", the square tile with the title "React Widget" is circled](./assets/img/JupyterLab-launcher.png)

### Troubleshooting the extension

If you run into any build issues, the first thing to try is to clear the build directories and start from scratch:

```bash
./clean.sh
```

If you're still having issues, try manually deleting the symlink at `.pixi/envs/share/jupyter/labextensions/fileglancer` inside the fileglancer repo directory. Then, reinstall the extension using `pixi run dev-install`, and follow the steps above from there.

## Configuration

By default, no [Fileglancer Central](https://github.com/JaneliaSciComp/fileglancer-central) server will be used.
You can configure the URL of a Fileglancer Central server with traitlets, in several ways:

### Command line

```bash
pixi run dev-launch --Fileglancer.central_url=http://0.0.0.0:7878
```

### Config file

You can create a file at `~/.jupyter/jupyter_server_config.py` (or in any of the paths reported by `pixi run jupyter --paths`) and add your configuration there, e.g.:

```python
c.Fileglancer.central_url='http://0.0.0.0:7878'
```

## Development Uninstall

```bash
pixi run pip-uninstall
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `fileglancer` within that folder.

## Testing

### Backend tests

To run backend tests using pytest:

```bash
pixi run test-backend
```

### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```bash
pixi run test-frontend
```

### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.
More information are provided within the [ui-tests](./ui-tests/README.md) README.

To execute the UI integration test, run:
```bash
pixi run ui-test
```

You can also run these in headed or debug mode using:
```bash
pixi run ui-test -- --headed --debug
```

or to run only a specific test:
```bash
pixi run ui-test -- --headed tests/fgzones.spec.ts
```

You can also use the name of the test:
```bash
pixi run ui-test -- -g "the test description"
```

## Packaging and Releases

See [RELEASE](RELEASE.md)
