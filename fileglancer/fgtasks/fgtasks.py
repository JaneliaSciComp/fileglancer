import argparse, asyncio, json

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from importlib.metadata import entry_points
from typing import Dict, List, Any, Optional, Sequence
from loguru import logger


@dataclass
class TaskData:
    """
    This task data that can be used to get information about the task
    """
    id: str | None
    name: str
    # task owner
    owner: str | None
    # users with appropriate permissions can run tasks
    # for other users
    proxy: str | None
    env: Dict[str, str]
    parameters: List[str]
    # task compute resources
    compute_resources: Dict[str, Any]
    monitor_url: str | None
    output_log: str | None
    error_log: str | None
    status: str
    created_date: datetime
    start_time: datetime | None
    end_time: datetime | None


class TaskDefn(ABC):
    """
    Task definition
    """
    def __init__(self, name:str):
        self._name = name
        self._executor = None

    # parameter definition
    @property
    def parameter_defns(self) -> List[TaskParameterDefn]:
        """List of parameters accepted by this task"""
        args_meta = []
        argparser = self.define_args()
        for action in argparser._actions:
            if action.dest == 'help':
                continue
            args_meta.append(TaskParameterDefn(
                action.dest,
                action.option_strings,
                action.required,
                action.default,
                action.help,
                action.nargs,
                action.choices,
            ))
        return args_meta

    async def launch_task(self, task_data:TaskData):
        # the default launcher parses the task arguments and invokes the execute method
        logger.info(f'Parse task args: {task_data.parameters}')
        args, additional_args = self.define_args().parse_known_args(task_data.parameters)
        task_args = {tp.name: getattr(args, tp.name) for tp in self.parameter_defns}
        task_args['extra_args'] = additional_args

        logger.info(f'Task arguments: {task_args}')
        # not awaiting for the result here is intentional
        # I don't know yet how this is going to work

        self._executor = TaskExecutor(task_data.name)

        await self._executor.execute(self.create_task_cmd(task_data, **task_args))

    @abstractmethod
    def create_task_cmd(self, task_data: TaskData, **kwargs) -> List[str]:
        pass

    @abstractmethod
    def define_args(self) -> argparse.ArgumentParser:
        pass


@dataclass
class TaskParameterDefn:
    name: str
    flags: Sequence[str]
    required: bool
    default: Any
    help: Optional[str]
    nargs: Any
    choices: Any

    def to_json(self) -> str:
        return json.dumps({
            "name": self.name,
            "flags": list(self.flags),  # convert Sequence to list
            "required": self.required,
            "default": _as_json_type(self.default),
            "help": self.help,
            "nargs": _as_json_type(self.nargs),
            "choices": _as_json_type(self.choices),            
        })



class TaskExecutor:
    def __init__(self, task_name):
        self._task_name = task_name
        self._process = None
        self._process_stdout_reader = None
        self._process_stderr_reader = None

    async def execute(self, cmd:List[str]):
        logger.info(f'Run: {cmd}')
        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        logger.info(f'Task {self._task_name} PID: {self._process.pid}')
        # Start background tasks to read the output output
        self._process_stdout_reader = asyncio.create_task(self._read_stream(self._process.stdout, "STDOUT"))
        self._process_stderr_reader = asyncio.create_task(self._read_stream(self._process.stderr, "STDERR"))

    async def _read_stream(self, stream: asyncio.StreamReader | None, label: str):
        """Read and log process output lines as they arrive."""
        try:
            if stream is not None:
                async for line in stream:
                    text = line.decode().rstrip()
                    logger.info(f"[{label}] {text}")
        except Exception as e:
            logger.error(f"Error reading {label}: {e}")



class TaskRegistry:

    def __init__(self, entry_point_group: str = 'fileglancer.tasks'):
        self._entry_point_group = entry_point_group
        self._tasks : Dict[str, TaskDefn] = {}

    def discover_tasks(self) -> None:
        self._tasks.clear()

        # this only needs to work for python 3.10+
        logger.info(f'Discover {self._entry_point_group}')
        eps = entry_points()
        group = eps.select(group=self._entry_point_group)

        for ep in group:
            try:
                task_class = ep.load()
                task = task_class(ep.name)
                if not isinstance(task, TaskDefn):
                    logger.warning(f'Warning: {ep.name} is not a Task definition instance')
                    continue
                logger.info(f'Found registered task: {ep.name}')
                self._tasks[ep.name] = task
            except Exception as e:
                print(f'Error loading task {ep.name}: {e}')

    def list_tasks(self) -> List[str]:
        return list(self._tasks.keys())

    def get_task(self, name:str | None) -> Optional[TaskDefn]:
        logger.debug(f'Get {name}')
        return self._tasks.get(name) if name else None


def create_taskdata(task_name: str,
                    parameters: List[str] = [],
                    run_env: Dict[str, str] = {},
                    task_resources: Dict[str, Any] = {}) -> TaskData:
    """
    Create task data - this is information that can be persisted
    and then later used to 
    """
    # populate task_data both from current paramenters and 
    # the default parameter definitions
    return TaskData(
        None,
        task_name,
        None,
        None,
        run_env,
        parameters,
        task_resources,
        None, # monitor_url
        None, # output log
        None, # error log
        'CREATED',
        datetime.now(),
        None,
        None,
    )

tasks_registry : Optional[TaskRegistry] = None


def get_tasks_registry():
    global tasks_registry
    if tasks_registry is None:
        logger.info('Initialize task registry')
        tasks_registry = TaskRegistry()
        tasks_registry.discover_tasks()
    
    return tasks_registry


def _as_json_type(value):
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool, list, dict)):
        return value
    if isinstance(value, (set, tuple)):
        return list(value)
    return str(value)