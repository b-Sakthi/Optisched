import os
import ssl
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

# Only load backend/.env if not executing in test mode
if os.getenv("TESTING") != "1":
    ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(ENV_FILE, override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

# Strict safety verification for test environments
if os.getenv("TESTING") == "1":
    if not DATABASE_URL or not DATABASE_URL.startswith("sqlite"):
        raise RuntimeError(
            f"CRITICAL SAFETY VIOLATION: Test environment attempted to connect to non-SQLite database: {DATABASE_URL}. "
            "Tests must strictly run against isolated SQLite databases to protect Neon production data."
        )

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

split_url = urlsplit(DATABASE_URL)
scheme = split_url.scheme

if scheme.startswith("sqlite"):
    # Isolated SQLite database configuration for testing
    connect_args = {"check_same_thread": False}
    engine_kwargs = {"connect_args": connect_args}
    if ":memory:" in DATABASE_URL or scheme == "sqlite":
        engine_kwargs["poolclass"] = StaticPool
    engine = create_engine(DATABASE_URL, **engine_kwargs)
elif scheme in ("postgresql", "postgres", "postgresql+pg8000"):
    # Adapt the driver scheme to postgresql+pg8000
    if scheme in ("postgresql", "postgres"):
        scheme = "postgresql+pg8000"

    # Filter query parameters that pg8000 does not accept as connection kwargs.
    # Libpq query parameters like sslmode and channel_binding cause pg8000 to raise TypeError.
    query_params = dict(parse_qsl(split_url.query))
    valid_pg8000_params = {
        "user", "host", "database", "port", "password", "source_address",
        "unix_sock", "ssl_context", "timeout", "tcp_keepalive",
        "application_name", "replication", "startup_params",
    }
    filtered_query = {k: v for k, v in query_params.items() if k in valid_pg8000_params}
    clean_url = urlunsplit((
        scheme,
        split_url.netloc,
        split_url.path,
        urlencode(filtered_query),
        split_url.fragment,
    ))

    # Configure secure SSL/TLS context for pg8000 when SSL is requested or connecting to a remote host
    connect_args = {}
    sslmode = query_params.get("sslmode", "").lower()
    is_remote = split_url.hostname not in ("localhost", "127.0.0.1", None)
    if sslmode != "disable" and (is_remote or sslmode in ("require", "verify-ca", "verify-full")):
        connect_args["ssl_context"] = ssl.create_default_context()

    engine = create_engine(clean_url, connect_args=connect_args, pool_pre_ping=True)
else:
    raise RuntimeError(
        "DATABASE_URL must start with postgresql+pg8000://, postgresql://, postgres://, or sqlite://"
    )


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def check_database_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
