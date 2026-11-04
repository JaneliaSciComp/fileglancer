import _fake_task

def _output(args):
    if args.get("plate_glob") == "NONE":
        return {}
    return {
        "parallelization_list": [
            {"zarr_url": f"{args['zarr_dir']}/a", "init_args": {"n": 1}},
            {"zarr_url": f"{args['zarr_dir']}/b", "init_args": {"n": 2}},
        ]
    }


_fake_task.run("init_convert", _output)
