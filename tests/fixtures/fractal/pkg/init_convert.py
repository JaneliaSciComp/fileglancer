import _fake_task

_fake_task.run(
    "init_convert",
    lambda args: {
        "parallelization_list": [
            {"zarr_url": f"{args['zarr_dir']}/a", "init_args": {"n": 1}},
            {"zarr_url": f"{args['zarr_dir']}/b", "init_args": {"n": 2}},
        ]
    },
)
