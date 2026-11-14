from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User, UserRole
from app.core.security import create_access_token, _TOKEN_TTL_SECONDS

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class AuthTokenRequest(BaseModel):
    user_id: Optional[str] = None
    role: Optional[UserRole] = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    full_name: str
    expires_in: int = _TOKEN_TTL_SECONDS


@router.post("/login", response_model=AuthTokenResponse)
@router.post("/token", response_model=AuthTokenResponse)
def issue_session_token(
    payload: AuthTokenRequest,
    db: Session = Depends(get_db),
):
    """
    Issue an HMAC-SHA256 signed expiring Bearer token for a valid project user.
    Strictly rejects non-existent users or role elevation attempts.
    """
    user: Optional[User] = None

    if payload.user_id:
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
            detail="Must specify either 'user_id' or 'role'.",
        )

    token = create_access_token(user_id=user.id, role=user.role)
    return AuthTokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role.value,
        full_name=user.full_name,
    )

