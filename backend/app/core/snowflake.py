"""
Twitter Snowflake 64-bit Numeric ID Generator for OptiSched.

Bit layout (64 bits total):
- 1 bit : Unused sign bit (always 0 for positive IDs)
- 41 bits: Timestamp in milliseconds since custom epoch (2026-01-01T00:00:00Z)
- 10 bits: Machine / Worker ID (0 to 1023)
- 12 bits: Sequence counter (0 to 4095 per millisecond per worker)

Guarantees:
- Up to 4,096 unique IDs per millisecond per worker.
- Thread-safe synchronization preventing collision across concurrent requests.
- Monotonically increasing, time-sortable IDs.
- Stored safely as 64-bit integers (BIGINT in SQL, str/int in JSON).
"""

import threading
import time

# Custom epoch: 2026-01-01T00:00:00Z in milliseconds (1767225600000)
OPTISCHED_EPOCH = 1767225600000

WORKER_ID_BITS = 10
SEQUENCE_BITS = 12

MAX_WORKER_ID = (1 << WORKER_ID_BITS) - 1  # 1023
MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1    # 4095

WORKER_ID_SHIFT = SEQUENCE_BITS             # 12
TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS  # 22


class SnowflakeGenerator:
    def __init__(self, worker_id: int = 1, epoch: int = OPTISCHED_EPOCH):
        if not 0 <= worker_id <= MAX_WORKER_ID:
            raise ValueError(f"Worker ID must be between 0 and {MAX_WORKER_ID}, got {worker_id}")
        self.worker_id = worker_id
        self.epoch = epoch
        self.sequence = 0
        self.last_timestamp = -1
        self._lock = threading.Lock()

    def _current_timestamp_ms(self) -> int:
        return int(time.time() * 1000)

    def _wait_for_next_ms(self, last_ts: int) -> int:
        ts = self._current_timestamp_ms()
        while ts <= last_ts:
            time.sleep(0.0001)
            ts = self._current_timestamp_ms()
        return ts

    def generate_id(self) -> int:
        """
        Generate a collision-free 64-bit Snowflake ID.
        Thread-safe under concurrent multi-threaded execution.
        """
        with self._lock:
            ts = self._current_timestamp_ms()

            if ts < self.last_timestamp:
                # Handle clock skew / backward drift gracefully
                drift = self.last_timestamp - ts
                time.sleep(drift / 1000.0)
                ts = self._current_timestamp_ms()

            if ts == self.last_timestamp:
                # Same millisecond: increment 12-bit sequence counter
                self.sequence = (self.sequence + 1) & MAX_SEQUENCE
                if self.sequence == 0:
                    # Sequence exhausted for this millisecond: wait for next millisecond
                    ts = self._wait_for_next_ms(self.last_timestamp)
            else:
                self.sequence = 0

            self.last_timestamp = ts

            snowflake_id = (
                ((ts - self.epoch) << TIMESTAMP_SHIFT)
                | (self.worker_id << WORKER_ID_SHIFT)
                | self.sequence
            )
            return snowflake_id


# Default singleton generator for OptiSched services
_default_generator = SnowflakeGenerator(worker_id=1)


def get_snowflake_id() -> int:
    """Convenience helper to obtain a unique 64-bit Snowflake ID."""
    return _default_generator.generate_id()
