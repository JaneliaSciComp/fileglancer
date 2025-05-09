import os
from pathlib import Path

from jupyterhub.app import JupyterHub

def main(*args):
    config_file = Path(__file__).parent / 'jupyterhub_config.py'
    print (f"Starting JupyterHub with config file: {config_file}")
    args = (f'--config={config_file}',)
    # set an env var flag to help load the config
    os.environ['CYLC_HUB_VERSION'] = '0.0.1'
    try:
        JupyterHub.launch_instance(args)
    finally:
        del os.environ['CYLC_HUB_VERSION']

if __name__ == '__main__':
    main()

