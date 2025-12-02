import os
import pytest

def pytest_sessionstart(session):
    """
    Called after the Session object has been created and before performing collection
    and entering the run test loop.
    """
    os.environ['external_proxy_url'] = 'http://localhost/files'