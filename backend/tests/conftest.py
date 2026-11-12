import os
import sys
from pathlib import Path

# Guarantee isolated SQLite in-memory database is used for all test executions,
# preventing tests from connecting to or modifying Neon production databases.
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if "CLERK_SECRET_KEY" not in os.environ:
    os.environ["CLERK_SECRET_KEY"] = "sk_test_mock_test_key_for_testing"

# Ensure clerk_backend_api from .venv is discoverable if not in main site-packages
venv_site = Path(__file__).resolve().parents[1] / ".venv" / "Lib" / "site-packages"
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.append(str(venv_site))

