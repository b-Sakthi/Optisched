import bcrypt

BCRYPT_PREFIXES = ("$2b$", "$2a$", "$2y$")


def hash_password(password: str) -> str:
    """
    Generate a fresh bcrypt salt and hash for the plaintext password.
    Returns the string representation of the bcrypt hash ($2b$...).
    """
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string.")
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
