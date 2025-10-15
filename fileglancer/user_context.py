import os
import pwd
from contextlib import AbstractContextManager

from loguru import logger


class UserContext(AbstractContextManager):
    """
    Base no-op proxy context that does nothing.
    """
    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


class CurrentUserContext(UserContext):
    """
    A context manager the keeps the current user context.
    """
    pass


class EffectiveUserContext(UserContext):
    """
    A context manager for setting the user and group context for a process using seteuid/setegid access flags.
    """
    def __init__(self, username: str):
        self.username = username
        self._uid = os.getuid()
        self._gid = os.getgid()
        self._gids = os.getgrouplist(pwd.getpwuid(self._uid).pw_name, self._gid)
        self._user = None

    def __enter__(self):
        logger.debug(f"Prepare user context for {self.username}")
        user = pwd.getpwnam(self.username)

        uid = user.pw_uid
        gid = user.pw_gid
        gids = os.getgrouplist(self.username, gid)
        try:
            os.setegid(gid)
        except Exception as e:
            logger.error(f"Failed to set the effective gid: {e}")
            raise e

        try:
            # the maximum number of groups that could be set is os.sysconf("SC_NGROUPS_MAX")
            # so if the current user has more than that an exception will be raised
            # for now I don't limit this because I want to see if this will happen 
            if len(gids) > os.sysconf("SC_NGROUPS_MAX"):
                logger.warning((
                    f"User {self.username} is part of {len(gids)} groups "
                    f"which is greater than {os.sysconf("SC_NGROUPS_MAX")} "
                    "so this may result in an error"
                ))
            os.setgroups(gids)
        except Exception as e:
            logger.error(f"Failed to set the user groups: {e}")
            # reset egid first
            os.setegid(self._gid)
            raise e

        try:
            os.seteuid(uid)
        except Exception as e:
            logger.error(f"Failed to set euid: {e}")
            # reset egid
            os.setegid(self._gid)
            raise e

        self._user = user

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        logger.debug("Release user context")
        os.seteuid(self._uid)
        os.setegid(self._gid)
        if len(self._gids) > os.sysconf("SC_NGROUPS_MAX"):
            logger.info(f"Truncate original {len(self._gids)} groups to max allowed to set: {os.sysconf("SC_NGROUPS_MAX")}")
            os.setgroups(self._gids[:os.sysconf("SC_NGROUPS_MAX")])
        else:
            os.setgroups(self._gids)
        self._user = None
        return False
