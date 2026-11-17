import bcrypt

BCRYPT_PREFIXES = ("$2b$", "$2a$", "$2y$")
MIN_PASSWORD_LENGTH = 8


def validate_password_policy(password: str, role: str = "user") -> None:
    """
    Enforces minimum 8-character password policy across all roles and user accounts.
    Raises ValueError with descriptive detail if violated.
    """
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long (received {len(password)})."
        )


def hash_password(password: str) -> str:
    """
    Generate a fresh bcrypt salt and hash for the plaintext password.
    Enforces minimum 8-character password policy.
    Returns the string representation of the bcrypt hash ($2b$...).
    """
    validate_password_policy(password)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a stored bcrypt hash.
    Rejects empty strings and non-bcrypt/plaintext stored hashes.
    """
    if not isinstance(plain_password, str) or not plain_password:
        return False
    if not isinstance(hashed_password, str) or not hashed_password.startswith(BCRYPT_PREFIXES):
        return False

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False
