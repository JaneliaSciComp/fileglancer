"""Fileglancer: NGFF browsing and sharing platform."""

__all__ = ["Fileglancer", "FileglancerError", "NEUROGLANCER_URL"]


def __getattr__(name):
    # Lazy so that `import fileglancer.supervisor` (the privileged process)
    # pulls in nothing outside the standard library; the client drags in
    # httpx/pydantic.
    if name in __all__:
        from fileglancer import client
        return getattr(client, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
