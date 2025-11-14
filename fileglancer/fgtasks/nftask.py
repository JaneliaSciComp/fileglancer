import json

from argparse import ArgumentParser
from loguru import logger
from pathlib import Path
from typing import Any, Dict, List, Optional
from .fgtasks import TaskData, TaskDefn, TaskParameterDefn


class NextflowTaskDefn(TaskDefn):
    def __init__(self, name, settings):
        super().__init__(name, settings)
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

    def parameter_defns_for_context(self, task_context:Dict[str, Any])-> List[TaskParameterDefn]:
        """
        task_context: dictionary containing pipeline path and a flag whether to include hidden parameters, e.g.,
                      {'pipeline': '/location/of/the/pipeline', 'include_hidden': True}
        """
        pipeline_path = task_context.get('pipeline')
        if not pipeline_path:
            return []
        p = Path(pipeline_path)
        if p.is_dir():
            p = p / 'nextflow_schema.json'
        if not p.exists():
            raise ValueError(f'No schema found at {pipeline_path}')

        with open(p, "r", encoding="utf-8") as nf_schema_file:
            nf_schema = json.load(nf_schema_file)

        include_hidden = task_context.get('include_hidden', False)            
        return self._extract_parameter_defns_from_section(nf_schema, include_hidden)

    def _extract_parameter_defns_from_section(self, section: Dict[str, Any], include_hidden):
        param_defs = []
        if 'properties' in section:
            props = section['properties']
            required_fields = set(section.get("required", []))
            for name, attr in props.items():
                is_hidden = attr.get('hidden', False)
                if not is_hidden or include_hidden:
                    param = TaskParameterDefn(
                        name=name,
                        flags=[f'--{name}'],
                        required=name in required_fields,
                        default=attr.get('default'),
                        help=attr.get('description'),
                        nargs='+' if attr.get('type') == 'array' else None,
                        choices=attr.get('enum')
                    )
                    param_defs.append(param)
        
        for key, value in section.items():
            if isinstance(value, dict):
                logger.debug(f'Extract {key} parmeters')
                param_defs.extend(self._extract_parameter_defns_from_section(value, include_hidden))


        return param_defs
        
        
        return [] # !!!!! FIXME