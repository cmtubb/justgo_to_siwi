__all__ = ["JustGoToSiwi"]


def __getattr__(name: str):
    """
    Lazy-import to avoid importing pandas at package import time.
    """
    if name == "JustGoToSiwi":
        from .justgo_to_siwi import JustGoToSiwi

        return JustGoToSiwi
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

