# Fileglancer Development

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

In new terminal, run JupyterLab in autoreload mode - it will automatically rebuild when there are file changes to the backend:

```bash
pixi run dev-launch
```

Saved changes in your directory should now be automatically built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

If everything has worked so far, you should see the Fileglancer widget on the Launcher pane:

![Screenshot of the JupyterLab Launcher panel. In the bottom section, titled "Other", the square tile with the title "Fileglancer" is circled](../assets/img/launcher.png)

### Running with SSL/HTTPS (Secure Mode)

By default, `pixi run dev-launch` runs the server in insecure HTTP mode on port 7878. This is suitable for most local development scenarios.

If you need to run the server with SSL/HTTPS (for example, to test CORS, OAuth callbacks, or secure cookies), you can use `pixi run dev-launch-secure`. This requires valid SSL certificates to be installed.

#### Installing SSL Certificates

The secure launch mode expects SSL certificates to be located at:

- Private key: `/opt/certs/cert.key`
- Certificate: `/opt/certs/cert.crt`

**Important:** Do not use self-signed certificates, as they don't work properly with CORS and JavaScript fetch operations. You should obtain valid SSL certificates from your organization's certificate authority.

To install your certificates:

```bash
# Create the certs directory (requires sudo)
sudo mkdir -p /opt/certs

# Copy your certificate files
sudo cp /path/to/your/cert.key /opt/certs/cert.key
sudo cp /path/to/your/cert.crt /opt/certs/cert.crt

# Set appropriate permissions
sudo chmod 600 /opt/certs/cert.key
sudo chmod 644 /opt/certs/cert.crt
```

Once the certificates are installed, you can launch in secure mode:

```bash
# Launch with HTTPS on port 443 (requires sudo for privileged port)
sudo pixi run dev-launch-secure
```

**Note:** Running on port 443 requires root privileges. Make sure your certificates match the hostname you'll be accessing the server from.

#### Spoofing the Domain Name for Testing

If your SSL certificate is issued for a specific domain name (e.g., `fileglancer-dev.int.janelia.org`), you'll need to configure your local machine to resolve that domain to your development server's IP address. This is done by modifying the `/etc/hosts` file.

On the machine where you're running your web browser (the test host):

```bash
# Edit the hosts file (requires sudo)
sudo nano /etc/hosts

# Add an entry mapping the domain to your server's IP address
# For local development on the same machine:
127.0.0.1    fileglancer-dev.int.janelia.org

# Or if the dev server is on a different machine:
192.168.1.100    fileglancer-dev.int.janelia.org
```

After saving the file, you can verify the configuration:

```bash
# Test that the domain resolves correctly
ping fileglancer-dev.int.janelia.org
```

Now you can access your development server using the certificate's domain name in your browser:

```
https://fileglancer-dev.int.janelia.org/
```

**Important:** Remember to remove or comment out this entry from `/etc/hosts` when you're done testing, especially if the domain is used in production.

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

### Frontend unit tests

This extension is using [Vitest](https://vitest.dev/) for JavaScript code testing.

To execute the unit tests:

```bash
pixi run test-frontend
```

### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

To execute the UI integration tests:

Install test dependencies (needed only once):

```bash
pixi run npm --prefix ui-tests npx playwright install
```

Then run the tests with:

```bash
pixi run test-ui
```

You can also run these in UI debug mode using:

```bash
pixi run test-ui -- --ui --debug
```

If you are unable to use the UI mode, record a trace for inspecting in the [Playwright trace viewer](https://trace.playwright.dev):

```bash
pixi run test-ui -- --trace on
```

To run only a specific test:

```bash
pixi run test-ui -- --<optional-flag> tests/fgzones.spec.ts
```

You can also use the name of the test:

```bash
pixi run test-ui -- -g "the test description"
```

## Other documentation

- [How to release a new version](Release.md)
