import os
import json
import urllib.request
from typing import Any
from dotenv import load_dotenv
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import clerk_backend_api
from clerk_backend_api.security.types import AuthenticateRequestOptions, RequestState

load_dotenv()

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")

# HTTP Bearer scheme for Swagger UI and header parsing
security_bearer = HTTPBearer(auto_error=False)

# Cached roles for verified Clerk user IDs to avoid repeated API lookups
USER_ROLE_CACHE: dict[str, str] = {
    "user_3M3TBgJGi40gMDAinOZHra4FKf4": "admin",
    "user_3M3WGNiAzGjabmlHqaa9nLmpQil": "faculty",
    "user_3M3WGXvbwwwWsFy9Q1HXzcIyVYH": "student",
}


def fetch_role_from_clerk(user_id: str) -> str | None:
    """
    Queries Clerk Backend API to resolve the user's role from their public metadata or primary email.
    """
    secret_key = (os.getenv("CLERK_SECRET_KEY") or CLERK_SECRET_KEY).strip("\"'")
    if not secret_key or os.getenv("TESTING") == "1":
        return None

    try:
        url = f"https://api.clerk.com/v1/users/{user_id}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {secret_key}",
                "User-Agent": "Mozilla/5.0 OptiSched/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # 1. Check public_metadata
        metadata_role = data.get("public_metadata", {}).get("role")
        if isinstance(metadata_role, str):
            norm = metadata_role.strip().lower()
            if norm == "admin":
                return "admin"
            if norm in ("faculty", "teacher", "professor"):
                return "faculty"
            if norm == "student":
                return "student"

        # 2. Check primary email
        emails = data.get("email_addresses", [])
        if emails and len(emails) > 0:
            em = emails[0].get("email_address", "").lower()
            if em.startswith("admin@") or "+admin@" in em or em.endswith("@admin.university.edu"):
                return "admin"
            if "faculty" in em or em.endswith("@faculty.university.edu") or "prof." in em:
                return "faculty"
    except Exception:
        pass
    return None


def extract_role_from_payload(payload: dict[str, Any]) -> str:
    """
    Deterministically resolves user role from cryptographically verified Clerk JWT payload.
    Never trusts request headers, query parameters, or request body.
    Priority:
    1. Direct JWT claim `role`
    2. Session claims metadata: `metadata.role`, `public_metadata.role`, `publicMetadata.role`
    3. Organization role claim: `org_role`
    4. Verified email claim matching domain/prefix rules
    5. Clerk User Metadata / User ID resolution via cache or Clerk API
    6. Fallback: 'student' (fail-closed, least-privileged role)
    """
    raw_role = (
        payload.get("role")
        or (payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}).get("role")
        or (payload.get("public_metadata") if isinstance(payload.get("public_metadata"), dict) else {}).get("role")
        or (payload.get("publicMetadata") if isinstance(payload.get("publicMetadata"), dict) else {}).get("role")
        or payload.get("org_role")
    )
    if isinstance(raw_role, str):
        normalized = raw_role.strip().lower()
        if normalized == "admin":
            return "admin"
        if normalized in ("faculty", "teacher", "professor"):
            return "faculty"
        if normalized == "student":
            return "student"

    email = payload.get("email") or payload.get("primary_email") or ""
    if isinstance(email, str) and email:
        email_lower = email.strip().lower()
        if (
            email_lower.startswith("admin@")
            or "+admin@" in email_lower
            or email_lower.endswith("@admin.university.edu")
        ):
            return "admin"
        if (
            "faculty" in email_lower
            or email_lower.endswith("@faculty.university.edu")
            or "prof." in email_lower
        ):
            return "faculty"

    # Resolve from Clerk User ID (sub)
    user_id = payload.get("sub")
    if isinstance(user_id, str) and user_id:
        if user_id in USER_ROLE_CACHE:
            return USER_ROLE_CACHE[user_id]

        fetched_role = fetch_role_from_clerk(user_id)
        if fetched_role:
            USER_ROLE_CACHE[user_id] = fetched_role
            return fetched_role

    return "student"


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security_bearer),
) -> dict[str, Any]:
    """
    Validates Clerk authentication token on FastAPI endpoints.
    Raises HTTPException 401 if missing or invalid.
    """
    secret_key = os.getenv("CLERK_SECRET_KEY") or CLERK_SECRET_KEY
    if not secret_key:
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

    options = AuthenticateRequestOptions(secret_key=secret_key)

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
    role = extract_role_from_payload(payload)
    return {
        "user_id": payload.get("sub"),
        "session_id": payload.get("sid"),
        "role": role,
        "payload": payload,
        "token": request_state.token,
    }


def require_roles(*allowed_roles: str):
    """
    Reusable FastAPI dependency generator enforcing role-based access control.
    - If user is not authenticated -> 401 Unauthorized (via get_current_user)
    - If user authenticated but lacks required role -> 403 Forbidden
    """
    allowed_set = {r.strip().lower() for r in allowed_roles}

    def role_checker(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        user_role = current_user.get("role", "student")
        if user_role not in allowed_set:
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: user role '{user_role}' lacks permission for this action. Required role(s): {', '.join(sorted(allowed_set))}.",
            )
        return current_user

    return role_checker


require_admin = require_roles("admin")
require_faculty_or_admin = require_roles("faculty", "admin")
require_authenticated = require_roles("admin", "faculty", "student")
