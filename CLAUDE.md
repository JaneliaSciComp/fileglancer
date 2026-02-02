# CLAUDE.md - Fileglancer Development Guide

This file provides guidance for working with the Fileglancer codebase.

## Critical Rule: Always Use Pixi

**NEVER use system tools directly.** Always run commands through pixi:

```bash
# WRONG - Never do this
npm install
pytest
npx playwright install

# CORRECT - Always use pixi
pixi run node-install
pixi run test-backend
cd frontend/ui-tests && pixi run npx playwright install
```

Pixi manages all dependencies (Python, Node.js, npm packages) in isolated environments. Using system tools bypasses this and can cause version conflicts.

## Project Overview

Fileglancer is a web application for browsing, sharing, and managing scientific imaging data using OME-NGFF (OME-Zarr). It has:

- **Backend**: FastAPI (Python) - located in `fileglancer/`
- **Frontend**: React/TypeScript with Vite - located in `frontend/`
- **UI Tests**: Playwright E2E tests - located in `frontend/ui-tests/`

## Quick Start

```bash
# Initial setup (builds frontend, installs Python package)
pixi run dev-install

# Start development server (port 7878, auto-reloads on backend changes)
pixi run dev-launch

# In another terminal, watch frontend for changes
pixi run dev-watch
```

View the app at http://localhost:7878

## Available Pixi Tasks

### Development

| Command | Description |
|---------|-------------|
| `pixi run dev-install` | Build frontend and install Python package |
| `pixi run dev-launch` | Start dev server on port 7878 with auto-reload |
| `pixi run dev-watch` | Watch frontend for changes and rebuild |
| `pixi run node-install` | Install frontend npm dependencies |
| `pixi run node-build` | Build frontend |
| `pixi run pip-install` | Reinstall Python package |

### Testing

| Command | Description |
|---------|-------------|
| `pixi run -e test test-backend` | Run backend tests with pytest and coverage |
| `pixi run test-frontend` | Run frontend unit tests with Vitest |
| `pixi run test-ui` | Run Playwright E2E tests |
| `pixi run test-ui -- --ui --debug` | Run E2E tests in debug UI mode |
| `pixi run test-ui -- tests/specific.spec.ts` | Run specific E2E test file |
| `pixi run test-ui -- -g "test description"` | Run E2E tests matching description |

### Code Quality

| Command | Description |
|---------|-------------|
| `pixi run node-check` | TypeScript type checking |
| `pixi run node-eslint-check` | Check ESLint rules |
| `pixi run node-eslint-write` | Fix ESLint issues |
| `pixi run node-prettier-check` | Check Prettier formatting |
| `pixi run node-prettier-write` | Fix Prettier formatting |

### Database

| Command | Description |
|---------|-------------|
| `pixi run migrate` | Run database migrations |
| `pixi run migrate-create` | Create new migration |

### Container Development

| Command | Description |
|---------|-------------|
| `pixi run container-rebuild` | Build/rebuild devcontainer |
| `pixi run container-shell` | Open shell in container |
| `pixi run container-claude` | Run Claude Code in container |

## Testing

### Backend Tests

```bash
pixi run -e test test-backend
```

Tests are in `tests/` directory. Uses pytest with coverage reporting.

### Frontend Unit Tests

```bash
pixi run test-frontend
```

Tests are in `frontend/src/__tests__/`. Uses Vitest with React Testing Library.

### UI Integration Tests (Playwright)

First-time setup - install Playwright browsers:

```bash
pixi run node-install-ui-tests
cd frontend/ui-tests && pixi run npx playwright install
```

Run tests:

```bash
pixi run test-ui
```

Tests are in `frontend/ui-tests/tests/`. The test server runs on port 7879.

## Project Structure

```
fileglancer/
├── fileglancer/           # Backend Python package
│   ├── app.py            # FastAPI application
│   ├── database.py       # SQLAlchemy models and queries
│   ├── filestore.py      # File system operations
│   ├── settings.py       # Configuration via pydantic-settings
│   ├── model.py          # Pydantic models
│   ├── auth.py           # Authentication
│   ├── cli.py            # CLI commands
│   └── alembic/          # Database migrations
├── frontend/              # React/TypeScript frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React Context providers
│   │   ├── queries/      # TanStack Query hooks
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Utility functions
│   │   └── __tests__/    # Unit tests
│   ├── ui-tests/         # Playwright E2E tests
│   └── package.json
├── tests/                 # Backend tests
├── docs/                  # Documentation
├── pyproject.toml         # Python config and pixi tasks
└── pixi.lock             # Pixi lockfile
```

## Configuration

Copy the template and customize:

```bash
cp docs/config.yaml.template config.yaml
```

Key settings:
- `file_share_mounts`: Directories to expose (default: `~/`)
- `db_url`: Database connection string
- SSL certificates for HTTPS mode

## Viewers Configuration

Fileglancer supports dynamic viewer configuration through `viewers.config.yaml`.

- **Configuration file**: `frontend/src/config/viewers.config.yaml`
- **Documentation**: See `docs/ViewersConfiguration.md`

To customize viewers:

1. Edit `frontend/src/config/viewers.config.yaml`
2. Rebuild application: `pixi run node-build`

The default configuration includes Neuroglancer, Avivator, OME-Zarr Validator, and Vol-E viewers. The config file is bundled at build time.

## Pixi Environments

- `default`: Standard development
- `test`: Includes test dependencies (pytest, coverage)
- `release`: Includes release tools (twine, hatch)

Use `-e` flag to specify environment:

```bash
pixi run -e test test-backend
pixi run -e release pypi-build
```

## Troubleshooting

### Build Issues

Clean all build artifacts and reinstall:

```bash
./clean.sh
pixi run dev-install
```

### Frontend Issues

```bash
# Clear node_modules and reinstall
rm -rf frontend/node_modules
pixi run node-install
```

### Playwright Issues

Install browser dependencies:

```bash
cd frontend/ui-tests && pixi run npx playwright install
```

## Technology Stack

### Backend
- Python 3.14+
- FastAPI
- SQLAlchemy (async with aiosqlite/psycopg2)
- Alembic (migrations)
- Pydantic (validation)
- Uvicorn (ASGI server)

### Frontend
- React 18
- TypeScript 5.8
- Vite (Rolldown)
- TanStack Query v5
- TanStack Table v8
- Material Tailwind v3
- Tailwind CSS

### Testing
- pytest (backend)
- Vitest (frontend unit)
- Playwright (E2E)

## Git Hooks

Pre-push hooks run Prettier and ESLint checks via Lefthook. These run automatically when pushing.

## Related Documentation

- [Development Guide](docs/Development.md)
- [DevContainer Guide](docs/DevContainer.md)
- [Release Process](docs/Release.md)
