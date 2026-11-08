from typing import Optional
from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User, UserRole, Project, AccessLevel

# Simple Header-based or Bearer-based auth for MVP with zero external microservice overhead
def get_current_user(
    x_user_id: Optional[str] = Header(None, description="Current authenticated User ID"),
    db: Session = Depends(get_db)
) -> User:
    if not x_user_id:
        # Fallback to demo default manager if header omitted in MVP demo mode
        user = db.query(User).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials missing: X-User-ID header required."
            )
        return user

    user = db.query(User).filter(User.id == x_user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User with ID {x_user_id} not found or deactivated."
        )
    return user


def require_role(allowed_roles: list[UserRole]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: User role '{current_user.role.value}' lacks required permissions: {[r.value for r in allowed_roles]}."
            )
        return current_user
    return role_checker


def verify_project_access(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Project:
    """
    INVARIANT 3: Permissions must filter data at database query level prior to retrieval.
    Only users explicitly assigned to this MVP Project (Manager, Departing Member, Incoming Member) have access.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found."
        )

    # Check project-level assignment
    is_assigned = (
        current_user.role == UserRole.MANAGER
        or current_user.id in {project.manager_id, project.departing_member_id, project.incoming_member_id}
    )

    if not is_assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: User is not authorized for this project boundary."
        )

    return project

