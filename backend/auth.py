"""
Authentication: session-based with httpOnly cookies.
"""

import secrets
import logging
import time
from collections import defaultdict
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
MIN_PASSWORD_LENGTH = 8

# ── Rate limiter (in-memory) ──────────────────────────────────────────────

_rate_limits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX = 10      # max attempts per window


def _check_rate_limit(client_ip: str):
    now = time.time()
    attempts = _rate_limits[client_ip]
    # Prune old entries
    _rate_limits[client_ip] = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[client_ip]) >= RATE_LIMIT_MAX:
        logger.warning("Rate limit exceeded for IP %s", client_ip)
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    _rate_limits[client_ip].append(now)


def _get_client_ip(request: Request) -> str:
    return request.headers.get("X-Real-IP", request.client.host if request.client else "unknown")


# ── Password helpers ───────────────────────────────────────────────────────

_DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt()).decode()


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
        samesite="strict",
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
def register(body: AuthRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _check_rate_limit(_get_client_ip(request))

    if not body.username or len(body.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not body.password or len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        # Generic error to prevent user enumeration
        raise HTTPException(status_code=400, detail="Registration failed")

    user = User(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user.id)
    set_session_cookie(response, token)

    logger.info("User registered: %s (id=%d) from %s", user.username, user.id, _get_client_ip(request))
    return {"id": user.id, "username": user.username}


@router.post("/login")
def login(body: AuthRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _check_rate_limit(_get_client_ip(request))

    user = db.query(User).filter(User.username == body.username).first()
    if not user:
        # Constant-time: hash dummy password even if user doesn't exist
        verify_password("dummy", _DUMMY_HASH)
        logger.warning("Failed login: unknown user %r from %s", body.username, _get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, user.password_hash):
        logger.warning("Failed login: bad password for %r from %s", body.username, _get_client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session(db, user.id)
    set_session_cookie(response, token)

    logger.info("User logged in: %s (id=%d) from %s", user.username, user.id, _get_client_ip(request))
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
