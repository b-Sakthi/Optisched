import os

# Guarantee isolated SQLite in-memory database is used for all test executions,
# preventing tests from connecting to or modifying Neon production databases.
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
