"""
Authentication: session-based with httpOnly cookies.
"""

import secrets
import logging
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")

SESSION_COOKIE = "session_token"
SESSION_LIFETIME_DAYS = 30


# ── Password helpers ───────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ── Session helpers ────────────────────────────────────────────────────────

def create_session(db: Session, user_id: int) -> str:
    token = secrets.token_hex(32)
    session = UserSession(
        token=token,
        user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(days=SESSION_LIFETIME_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_LIFETIME_DAYS * 86400,
        path="/",
    )


def clear_session_cookie(response: Response):
    response.delete_cookie(key=SESSION_COOKIE, path="/")


# ── Dependency: get current user ───────────────────────────────────────────

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = (
        db.query(UserSession)
        .filter(UserSession.token == token, UserSession.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")

    user = db.query(User).filter(User.id == session.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# ── Schemas ────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    username: str
    password: str


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/register")
def register(body: AuthRequest, response: Response, db: Session = Depends(get_db)):
    if not body.username or len(body.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not body.password or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user.id)
    set_session_cookie(response, token)

    logger.info("User registered: %s (id=%d)", user.username, user.id)
    return {"id": user.id, "username": user.username}


@router.post("/login")
def login(body: AuthRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_session(db, user.id)
    set_session_cookie(response, token)

    return {"id": user.id, "username": user.username}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username}
