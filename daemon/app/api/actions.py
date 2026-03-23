"""
Manual action API endpoints.
"""

import threading
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db, DaemonStatus, DaemonState
from ..models import ActionRequest, ActionResponse, ActionType
from ..services.acme_renewal import ACMERenewalEngine

router = APIRouter(prefix="/api/v1/actions", tags=["Actions"])
renewal_engine = ACMERenewalEngine()


@router.post("/run", response_model=ActionResponse)
def trigger_action(request: ActionRequest, db: Session = Depends(get_db)):
    """Trigger a manual renewal action."""
    status = db.query(DaemonStatus).first()
    if status and status.state == DaemonState.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="A renewal is already in progress"
        )

    mode_override = request.mode_override.value if request.mode_override else None
    force = request.action == ActionType.FORCE_RENEW

    if request.action == ActionType.CHECK:
        # Synchronous check
        from ..config import ConfigManager
        from ..services.ise_client import ISEClient
        from ..database import ISENode

        config = ConfigManager.get_flat(db)
        ise = ISEClient(config)
        nodes = db.query(ISENode).filter(ISENode.enabled == True).all()

        results = {}
        for node in nodes:
            try:
                result = ise.check_certificate_expiry(
                    config.get("common_name", ""),
                    config.get("renewal_threshold_days", 30),
                    node.name
                )
                results[node.name] = result

                # Update node status
                node.last_cert_check = __import__("datetime").datetime.utcnow()
                node.cert_days_remaining = result.get("days_remaining")
                node.cert_status = "ok" if not result.get("needs_renewal") else "expiring"
            except Exception as e:
                results[node.name] = {"error": str(e)}
                node.cert_status = "error"

        db.commit()
        return ActionResponse(
            message="Certificate check completed",
            status="completed"
        )

    # Async renewal (run in background thread)
    def run_renewal():
        try:
            renewal_engine.run(
                trigger="manual",
                mode_override=mode_override,
                force=force
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Manual renewal failed: {e}")

    thread = threading.Thread(target=run_renewal, daemon=True)
    thread.start()

    action_label = "Force renewal" if force else "Renewal"
    return ActionResponse(
        message=f"{action_label} triggered in background",
        status="started"
    )
