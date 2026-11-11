"""Fileglancer worker supervisor.

The only privileged component of a production deployment: spawns, pools and
reaps per-user workers, and hands the web app a lease socket per request.

Import hygiene: this package and everything it imports must be standard
library only (enforced by a test). The privileged code should be readable in
one sitting and not change when web dependencies do.
"""

PROTOCOL_VERSION = 1
