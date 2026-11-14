import os
import hmac
import hashlib
import base64
import json
import time
from typing import List, Optional, Set, Dict, Any
from fastapi import Header, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import User, UserRole, Project, SourceDocument, AccessLevel

_SECRET_KEY = os.getenv("CAIRN_SECRET_KEY", "cairn-dev-hmac-secret-2026").encode("utf-8")
_TOKEN_TTL_SECONDS = int(os.getenv("CAIRN_TOKEN_TTL_SECONDS", "86400"))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(user_id: str, role: UserRole, expires_in_seconds: int = _TOKEN_TTL_SECONDS) -> str:
    """Create an HMAC-SHA256 signed, expiring session token."""
    payload = {
        "sub": user_id,
        "role": role.value if isinstance(role, UserRole) else str(role),
        "exp": int(time.time()) + expires_in_seconds,
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    sig = hmac.new(_SECRET_KEY, payload_b64.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)
    return f"{payload_b64}.{sig_b64}"


def verify_access_token(token: str) -> Dict[str, Any]:
    """Verify HMAC-SHA256 signature and expiration of a session token."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("Malformed token")
        payload_b64, sig_b64 = parts
        expected_sig = hmac.new(_SECRET_KEY, payload_b64.encode("ascii"), hashlib.sha256).digest()
        provided_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, provided_sig):
            raise ValueError("Invalid token signature")
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("Token expired")
        if not payload.get("sub"):
            raise ValueError("Missing subject")
        return payload
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {exc}",
        )


def get_current_user(
    authorization: Optional[str] = Header(None, description="Bearer <signed-session-token>"),
    x_user_id: Optional[str] = Header(None, description="Current authenticated User ID"),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the authenticated Cairn user.
    1. Prefers signed `Authorization: Bearer <token>` (rejects any invalid/tampered/expired token with 401).
    2. Supports valid existing `X-User-ID` for backward-compatible test fixtures/demo tools; strictly rejects
       forged or unknown user IDs with 401 Unauthorized.
    3. Rejects unauthenticated requests lacking credentials with 401 Unauthorized unless empty fallback is omitted.
    """
    if authorization is not None:
        parts = authorization.strip().split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header must use Bearer <token> format.",
            )
        claims = verify_access_token(parts[1].strip())
        user = db.query(User).filter(User.id == claims["sub"], User.is_active == True).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user no longer exists or is inactive.",
            )
        return user

    if x_user_id is not None:
        cleaned_id = x_user_id.strip()
        if not cleaned_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Empty X-User-ID header is invalid.",
            )
        user = db.query(User).filter(User.id == cleaned_id, User.is_active == True).first()
        if not user:
            # Only auto-seed if database has literally no users yet AND ID is a canonical seeded actor
            if db.query(User).count() == 0 and cleaned_id in {"usr-mgr-01", "usr-dev-a", "usr-dev-b"}:
                from app.seeds.seed_demo_data import seed_synthetic_project
                seed_synthetic_project(db)
                user = db.query(User).filter(User.id == cleaned_id, User.is_active == True).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"User with ID '{cleaned_id}' not found or deactivated.",
            )
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials required (Bearer token or valid X-User-ID).",
    )


def get_accessible_access_levels(user: User) -> List[AccessLevel]:
    """Return document AccessLevels permitted for the given user role."""
    levels = [AccessLevel.PUBLIC, AccessLevel.RESTRICTED_TEAM]
    if user.role == UserRole.MANAGER:
        levels.append(AccessLevel.RESTRICTED_MANAGER)
    return levels


def get_allowed_source_ids(db: Session, project_id: str, user: User) -> Set[str]:
    """Return the set of SourceDocument IDs the user is cleared to inspect for a project."""
    levels = get_accessible_access_levels(user)
    rows = (
        db.query(SourceDocument.id)
        .filter(
            SourceDocument.project_id == project_id,
            SourceDocument.access_level.in_(levels),
        )
        .all()
    )
    return {row[0] for row in rows}


def require_role(allowed_roles: List[UserRole]):
    """RBAC Dependency factory enforcing Role-Based Access Control on critical endpoints."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation forbidden for role '{current_user.role.value}'. Requires one of {[r.value for r in allowed_roles]}."
            )
        return current_user
    return role_checker


def verify_project_access(
    project_id: str,
    current_user: User,
    db: Session
) -> Project:
    """Verify the project exists and the user is authorized to inspect or mutate it."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found."
        )

    is_assigned = (
        current_user.role == UserRole.MANAGER
        or current_user.id in {project.manager_id, project.departing_member_id, project.incoming_member_id}
    )
    if not is_assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission boundaries configured for this project."
        )
    return project
