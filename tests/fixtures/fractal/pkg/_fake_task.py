"""Shared logic for the fake Fractal task executables in this fixture package.

Each executable records the args it received in a ran_<name>.json marker next
to the --out-json file (one invocation appends one entry), then writes its out
JSON. Stdlib only, mirroring the real --args-json/--out-json task contract.
"""

import json
import sys
from pathlib import Path


def run(name: str, make_output):
    argv = sys.argv[1:]
    args_json = Path(argv[argv.index("--args-json") + 1])
    out_json = Path(argv[argv.index("--out-json") + 1])
    args = json.loads(args_json.read_text())

    marker = out_json.parent / f"ran_{name}.json"
    runs = json.loads(marker.read_text()) if marker.exists() else []
    runs.append({"args": args})
    marker.write_text(json.dumps(runs))

    out_json.write_text(json.dumps(make_output(args)))
