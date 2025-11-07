import datetime

from abc import ABC, abstractmethod
from dataclasses import dataclass
from importlib.metadata import entry_points
from typing import Dict, List, Any, Optional


@dataclass
class TaskDefn:
    name: str
    task_env: Dict[str, Optional[str]]
    parameters: List[TaskParameterDefn]


@dataclass
class TaskParameterDefn:
    name: str
    description: str
    type: str
    required: bool
    arity: int
    valid_values: List[Any]
    default_value: Any


class TaskParameter:
    name: str
    value: Any


class Task(ABC):
    instance_id: str
    task_name: str
    # task owner
    task_owner: str
    # users with appropriate permissions can run tasks
    # for other users
    task_run_proxy: str
    task_env: Dict[str, str]
    parameters: List[TaskParameter]
    created_date: datetime.date

    @abstractmethod
    def error_log(self) -> str:
        pass

    @abstractmethod
    def output_log(self) -> str:
        pass

    @abstractmethod
    def execute(self, **kwargs):
        pass
    

class TaskRegistry:

    def __init__(self, entry_point_group: str = 'fileglancer.tasks'):
        self._entry_point_group = entry_point_group
        self._tasks : Dict[str, TaskDefn] = {}

    def discover_tasks(self) -> None:
        self._tasks.clear()

        # this only needs to work for python 3.10+
        eps = entry_points()
        group = eps.select(group=self._entry_point_group)

        for ep in group:
            try:
                task_class = ep.load()
                task = task_class()
                if not isinstance(task, TaskDefn):
                    print(f'Warning: {ep.name} is not a Task definition instance')
                    continue
                self._tasks[task.name] = task
                print(f'Registered task: {task.name}')
            except Exception as e:
                print(f'Error loading task {ep.name}: {e}')

    def list_tasks(self) -> List[str]:
        return list(self._tasks.keys())

    def get_task(self, name:str) -> Optional[TaskDefn]:
        return self._tasks.get(name)
