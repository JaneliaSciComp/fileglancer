import sys

import _fake_task


def _output(args):
    if args.get("label") == "FAIL":
        sys.exit(3)
    return {}


_fake_task.run("thumbnail", _output)
