import os
from typing import Any
from dotenv import load_dotenv
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import clerk_backend_api
from clerk_backend_api.security.types import AuthenticateRequestOptions, RequestState

load_dotenv()

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")

# HTTP Bearer scheme for Swagger UI and header parsing
security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security_bearer),
) -> dict[str, Any]:
    """
    Validates Clerk authentication token on FastAPI endpoints.
    Raises HTTPException 401 if missing or invalid.
    """
    if not CLERK_SECRET_KEY:
        # In test/dev mode without key configured, log or require key
        raise HTTPException(
            status_code=500,
            detail="Authentication service misconfigured: CLERK_SECRET_KEY missing.",
        )

    auth_header = request.headers.get("Authorization")
    if not auth_header and not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    options = AuthenticateRequestOptions(secret_key=CLERK_SECRET_KEY)

    try:
        # clerk_backend_api expects a Request-like object with headers and url
        request_state: RequestState = clerk_backend_api.authenticate_request(request, options)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Token verification failed: {str(exc)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not request_state.is_signed_in:
        reason_msg = str(request_state.reason) if request_state.reason else "Invalid or expired token."
        raise HTTPException(
            status_code=401,
            detail=f"Unauthorized: {reason_msg}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = request_state.payload or {}
    return {
        "user_id": payload.get("sub"),
        "session_id": payload.get("sid"),
        "payload": payload,
        "token": request_state.token,
    }
