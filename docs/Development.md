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

Now you can launch the server. It will automatically rebuild when there are file changes to the backend.

```bash
pixi run dev-launch
```

You can optionally also watch the frontend code in another terminal, to automatically rebuild it when there are changes:

```bash
pixi run dev-watch
```

View the app in the browser at localhost:7878.

## Configuration

Copy the configuration file and edit as desired.

```
cp docs/config.yaml.template config.yaml
```

### File Share Paths

By default, Fileglancer provides access to each user's home directory without requiring any configuration. The default configuration includes:

```yaml
file_share_mounts:
  - "~/"    # User's home directory (default)
```

You can add additional file share paths by editing your `config.yaml`:

```yaml
file_share_mounts:
  - "~/"                              # User's home directory
  - "/groups/scicomp/data"            # Shared data directory
  - "/opt/data"                       # Another shared directory
```

**How Home Directories Work:**

- The special path `~/` is automatically expanded to each user's home directory
- Expansion happens securely within each user's context (using `seteuid/setegid`)
- Each user sees their own home directory when accessing the "home" file share path
- The path name appears as "home" in the file browser

**Alternative: Database Configuration**

Instead of using the `file_share_mounts` setting, you can configure file share paths in the database. This is useful for production deployments where you want centralized management of file share paths. To use the paths in the database, set `file_share_mounts: []`. See [fileglancer-janelia](https://github.com/JaneliaSciComp/fileglancer-janelia) for an example of populating the file share paths in the database, using a private wiki source.

### Making changes to the database
If database changes are needed you first need to create a new alembic revision using:
```
pixi run migrate-create -m "enter what the migration is about"
```
Then run the actual up-migration
```
pixi run migrate
```
If database downgrade is required, so far there's no pixi task defined for it so that would have to be done in a `pixi shell`

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

### Troubleshooting

If you run into any build issues, the first thing to try is to clear the build directories and start from scratch:

```bash
./clean.sh
```

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

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka ui tests).

To execute the UI integration tests:

Install test dependencies (needed only once):

```bash
pixi run npm --prefix frontend/ui-tests npx playwright install
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
