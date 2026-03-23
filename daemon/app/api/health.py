"""
Health check API endpoint.
"""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db, DaemonStatus
from ..models import HealthResponse
from ..scheduler import scheduler
from .. import __version__

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint."""
    status = db.query(DaemonStatus).first()

    uptime = 0
    if status and status.uptime_since:
        uptime = (datetime.utcnow() - status.uptime_since).total_seconds()

    return HealthResponse(
        status="healthy",
        version=__version__,
        uptime_seconds=uptime,
        database="connected",
        scheduler="running" if scheduler.running else "stopped"
    )
