"""
OptiSched ULID Utility Module.
Provides 26-character Universally Unique Lexicographically Sortable Identifier (ULID) generation,
validation, and timestamp parsing conforming to the ULID specification.

ULID binary layout:
- 48 bits (Unix timestamp in milliseconds) -> 10 Crockford Base32 characters
- 80 bits (Cryptographically secure randomness) -> 16 Crockford Base32 characters
Total: 128 bits -> 26 characters (0-9, A-Z excluding I, L, O, U)
"""

import re
import threading
from datetime import datetime, timezone

try:
    import ulid as _ulid_lib

    def _generate_from_lib() -> str:
        return str(_ulid_lib.ULID())

    def _validate_with_lib(ulid_str: str) -> bool:
        try:
            _ulid_lib.ULID.from_str(ulid_str)
            return True
        except Exception:
            return False

except ImportError:
    _ulid_lib = None


CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ULID_REGEX = re.compile(r"^[0-9A-HJ-KM-NP-TV-Z]{26}$", re.IGNORECASE)

_lock = threading.Lock()
_last_time_ms = 0
_last_random_bytes = bytearray(10)


def generate_ulid() -> str:
    """
    Generates a cryptographically strong, 26-character Crockford Base32 ULID.
    Uses python-ulid library if available, with a thread-safe specification fallback.
    """
    if _ulid_lib is not None:
        return str(_ulid_lib.ULID())

    # Pure Python RFC-compliant fallback with monotonic guard
    import time
    import secrets

    global _last_time_ms, _last_random_bytes

    with _lock:
        now_ms = int(time.time() * 1000)

        if now_ms > _last_time_ms:
            _last_time_ms = now_ms
            _last_random_bytes = bytearray(secrets.token_bytes(10))
        else:
            # Monotonic increment for IDs generated in the exact same millisecond
            for i in reversed(range(10)):
                if _last_random_bytes[i] < 255:
                    _last_random_bytes[i] += 1
                    break
                else:
                    _last_random_bytes[i] = 0

        timestamp_bytes = now_ms.to_bytes(6, byteorder="big")
        full_bytes = timestamp_bytes + _last_random_bytes
        val = int.from_bytes(full_bytes, byteorder="big")

        chars = []
        for _ in range(26):
            chars.append(CROCKFORD_BASE32[val & 0x1F])
            val >>= 5

        return "".join(reversed(chars))


def is_valid_ulid(val: str) -> bool:
    """
    Checks if a given string is a valid 26-character Crockford Base32 ULID.
    """
    if not isinstance(val, str) or len(val) != 26:
        return False
    if _ulid_lib is not None:
        try:
            _ulid_lib.ULID.from_str(val)
            return True
        except Exception:
            return False
    return bool(ULID_REGEX.match(val))
