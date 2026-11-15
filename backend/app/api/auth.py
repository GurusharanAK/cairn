import hashlib
import hmac
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User, UserRole
from app.core.security import create_access_token, _TOKEN_TTL_SECONDS

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_PASSWORD_SALT = b"cairn-continuity-role-auth-v1"


def _hash_password(raw_password: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", raw_password.encode("utf-8"), _PASSWORD_SALT, 100_000)


# Seeded workspace credential digests (verified via constant-time comparison)
_USER_PASSWORD_DIGESTS: Dict[str, bytes] = {
    "usr-dev-b": _hash_password("cairn-successor"),
    "usr-dev-a": _hash_password("cairn-departing"),
    "usr-mgr-01": _hash_password("cairn-manager"),
    "usr-dev-c": _hash_password("cairn-frontend"),
}

_USERNAME_ALIASES: Dict[str, str] = {
    "successor": "usr-dev-b",
    "successor.member": "usr-dev-b",
    "successor.member@cairn.local": "usr-dev-b",
    "departing": "usr-dev-a",
    "departing.member": "usr-dev-a",
    "departing.member@cairn.local": "usr-dev-a",
    "manager": "usr-mgr-01",
    "manager@cairn.local": "usr-mgr-01",
    "frontend": "usr-dev-c",
    "frontend.lead": "usr-dev-c",
    "frontend.lead@cairn.local": "usr-dev-c",
}


def _resolve_user_by_identifier(identifier: str, db: Session) -> Optional[User]:
    norm = identifier.strip().lower()
    if not norm:
        return None
    mapped_id = _USERNAME_ALIASES.get(norm)
    if mapped_id:
        user = db.query(User).filter(User.id == mapped_id, User.is_active == True).first()
        if user:
            return user

    users = db.query(User).filter(User.is_active == True).all()
    for candidate in users:
        email_lower = (candidate.email or "").lower()
        local_part = email_lower.split("@", 1)[0] if "@" in email_lower else email_lower
        if norm in (candidate.id.lower(), email_lower, local_part):
            return candidate
    return None


def _verify_user_password(user_id: str, raw_password: str) -> bool:
    expected = _USER_PASSWORD_DIGESTS.get(user_id)
    if not expected:
        return False
    provided = _hash_password(raw_password)
    return hmac.compare_digest(expected, provided)


class AuthTokenRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    user_id: Optional[str] = None
    role: Optional[UserRole] = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    full_name: str
    username: Optional[str] = None
    email: Optional[str] = None
    expires_in: int = _TOKEN_TTL_SECONDS


@router.post("/login", response_model=AuthTokenResponse)
@router.post("/token", response_model=AuthTokenResponse)
def issue_session_token(
    payload: AuthTokenRequest,
    db: Session = Depends(get_db),
):
    """
    Issue an HMAC-SHA256 signed expiring Bearer token for a valid project user.
    When username/email or password are supplied, strictly enforces username + password + role checks.
    Preserves programmatic user_id/role token issuance for automated fixture callers.
    """
    user: Optional[User] = None
    using_credentials = any(
        val is not None for val in (payload.username, payload.email, payload.password)
    )

    if using_credentials:
        identifier = (payload.username or payload.email or payload.user_id or "").strip()
        if not identifier or not payload.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Username and password are required.",
            )
        user = _resolve_user_by_identifier(identifier, db)
        if not user or not _verify_user_password(user.id, payload.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            )
        if payload.role is not None and user.role != payload.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role mismatch: account '{identifier}' has role '{user.role.value}', not '{payload.role.value}'.",
            )
    elif payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id, User.is_active == True).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid credentials: user '{payload.user_id}' not found or inactive.",
            )
        if payload.role is not None and user.role != payload.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role mismatch for user '{payload.user_id}'.",
            )
    elif payload.role is not None:
        user = (
            db.query(User)
            .filter(User.role == payload.role, User.is_active == True)
            .order_by(User.id.asc())
            .first()
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"No active user found for role '{payload.role.value}'.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify credentials ('username' and 'password') or 'user_id'/'role'.",
        )

    token = create_access_token(user_id=user.id, role=user.role)
    username_display = user.email.split("@", 1)[0] if user.email and "@" in user.email else user.id
    return AuthTokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role.value,
        full_name=user.full_name,
        username=username_display,
        email=user.email,
    )

