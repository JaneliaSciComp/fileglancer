from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import os
import sys

# Add the project root to the path so we can import our models
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fileglancer.database import Base
from fileglancer.settings import get_settings

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    # The extra parameter here is crucial to prevent the access loggers from being disabled. 
    # See https://stackoverflow.com/questions/78780118/how-can-i-stop-the-alembic-logger-from-deactivating-my-own-loggers-after-using-a
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def get_database_url():
    """Get database URL from application settings or environment variable"""
    # Check if we have a migration override URL
    migration_url = os.environ.get("FILEGLANCER_MIGRATION_DB_URL")
    if migration_url:
        print(f"Using migration database URL from environment: {migration_url}")
        return migration_url
    
    try:
        settings = get_settings()
        # Use admin URL for migrations if available, otherwise use regular URL
        if hasattr(settings, 'db_admin_url') and settings.db_admin_url:
            return settings.db_admin_url
        return settings.db_url
    except Exception as e:
        fallback_url = "sqlite:///./database.db"
        print(f"Could not load application settings ({e}), using fallback database URL: {fallback_url}")
        return fallback_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Override the sqlalchemy.url from the alembic.ini file
    configuration = config.get_section(config.config_ini_section)
    configuration['sqlalchemy.url'] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()