#!/usr/bin/env python3
"""
This script stamps the database with a specific alembic revision without running migrations.
It uses the same configuration as the main application.
"""

import argparse
import sys
from pathlib import Path
from alembic.config import Config
from alembic import command
from fileglancer.settings import get_settings


def stamp_database(revision: str) -> None:
    """
    Stamp the database with the given alembic revision.
    
    Args:
        revision: The alembic revision to stamp (e.g., 'head', revision hash)
    """
    try:
        # Get the directory containing this script
        script_dir = Path(__file__).parent
        alembic_ini_path = script_dir / "alembic.ini"
        
        # Create alembic config
        alembic_cfg = Config(str(alembic_ini_path))
        
        # Override the database URL with the application settings
        settings = get_settings()
        alembic_cfg.set_main_option("sqlalchemy.url", settings.db_url)
        alembic_cfg.set_main_option("script_location", str(script_dir / "alembic"))
        
        print(f"Stamping database at {settings.db_url} with revision: {revision}")
        
        command.stamp(alembic_cfg, revision)

        print(f"Successfully stamped database with revision: {revision}")
        
    except Exception as e:
        print(f"Error stamping database: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python stamp_db.py <revision>", file=sys.stderr)
        print("Example: python stamp_db.py head", file=sys.stderr)
        print("Example: python stamp_db.py 9783bd3941f1", file=sys.stderr)
        sys.exit(1)
    
    revision = sys.argv[1]
    stamp_database(revision)