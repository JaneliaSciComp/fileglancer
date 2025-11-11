import asyncio

from argparse import ArgumentParser
from loguru import logger
from typing import Optional, List
from .fgtasks import TaskData, TaskDefn


class NextflowTaskDefn(TaskDefn):
    def __init__(self, name):
        super().__init__(name)
        self._process = None

    def define_args(self) -> ArgumentParser:
        parser = ArgumentParser()

        parser.add_argument('--pipeline', type=str, required=True, help='Nextflow pipeline')
        parser.add_argument('--params-file', '--params_file', type=str, help='Nextflow pipeline json params file')
        parser.add_argument('--compute-profile', type=str, help='Nextflow compute profile')
        parser.add_argument('--configs', nargs='*', help='Nextflow configuration files')
        parser.add_argument('--workdir', type=str, help='Nextflow compute profile')
        return parser

    def create_task_cmd(self, task_data: TaskData,
                        pipeline:str='',
                        configs:List[str]=[],
                        params_file:Optional[str]=None,
                        compute_profile:Optional[str]=None,
                        workdir:Optional[str]=None,
                        **kwargs) -> List[str]:
        if not pipeline:
            raise ValueError('Pipeline must be defined')
        nextflow_configs_arg = [config_arg for c in configs 
                                for config_arg in ('-c', c) if c ] if configs is not None else []
        params_file_arg = ['-params-file', params_file] if params_file else []
        profile_arg = ['-profile', compute_profile] if compute_profile else []
        workdir_arg = ['-w', workdir] if workdir else []
        extra_args = kwargs.get('extra_args', [])

        cmdline = ([ 'nextflow', 'run', pipeline ]
                   + nextflow_configs_arg
                   + params_file_arg
                   + profile_arg
                   + workdir_arg
                   + extra_args)
        logger.debug('Nextflow cmd', cmdline)
        return cmdline
