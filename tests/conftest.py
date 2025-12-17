import os
import pytest

def pytest_sessionstart(session):
    """
    Called after the Session object has been created and before performing collection
    and entering the run test loop.
    """
    os.environ['FGC_EXTERNAL_PROXY_URL'] = 'http://localhost/files'
    os.environ['FGC_USE_ACCESS_FLAGS'] = 'false'