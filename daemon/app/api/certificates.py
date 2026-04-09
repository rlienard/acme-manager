"""
Managed Certificates API — CRUD for multi-certificate management.
"""

import json
import logging
import queue
import threading
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List

from ..database import (
    get_db, SessionLocal,
    ManagedCertificate, ISENode, ACMEProvider,
)
from ..models import (
    ManagedCertificateCreate,
    ManagedCertificateUpdate,
    ManagedCertificateResponse,
    CertificateRequestPayload,
)
from ..services.cert_request import CertificateRequestRunner, CertificateRequestError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/certificates", tags=["certificates"])


def _get_cert_or_404(cert_id: int, db: Session) -> ManagedCertificate:
    cert = db.query(ManagedCertificate).filter(ManagedCertificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Managed certificate not found")
    return cert


def _assign_nodes(cert: ManagedCertificate, node_ids: List[int], db: Session):
    if node_ids is not None:
        nodes = db.query(ISENode).filter(ISENode.id.in_(node_ids)).all() if node_ids else []
        cert.nodes = nodes


def _validate_provider(provider_id: int, db: Session):
    if provider_id is None:
        return
    exists = db.query(ACMEProvider).filter(ACMEProvider.id == provider_id).first()
    if not exists:
        raise HTTPException(status_code=400, detail=f"ACME provider id {provider_id} not found")


def _serialize_cert(cert: ManagedCertificate) -> dict:
    return {
        "id": cert.id,
        "common_name": cert.common_name,
        "san_names": cert.san_names or [],
        "key_type": cert.key_type,
        "subject": cert.subject or {},
        "portal_group_tag": cert.portal_group_tag,
        "certificate_mode": cert.certificate_mode,
        "renewal_threshold_days": cert.renewal_threshold_days,
        "enabled": cert.enabled,
        "acme_provider_id": cert.acme_provider_id,
        "acme_provider_name": cert.acme_provider.name if cert.acme_provider else None,
        "last_renewal_at": cert.last_renewal_at,
        "last_renewal_status": cert.last_renewal_status,
        "created_at": cert.created_at,
        "updated_at": cert.updated_at,
        "nodes": cert.nodes,
    }


@router.get("", response_model=List[ManagedCertificateResponse])
def list_certificates(db: Session = Depends(get_db)):
    certs = db.query(ManagedCertificate).all()
    return [_serialize_cert(c) for c in certs]


@router.get("/{cert_id}", response_model=ManagedCertificateResponse)
def get_certificate(cert_id: int, db: Session = Depends(get_db)):
    return _serialize_cert(_get_cert_or_404(cert_id, db))


@router.post("", response_model=ManagedCertificateResponse, status_code=201)
def create_certificate(data: ManagedCertificateCreate, db: Session = Depends(get_db)):
    _validate_provider(data.acme_provider_id, db)

    cert = ManagedCertificate(
        common_name=data.common_name,
        san_names=data.san_names,
        key_type=data.key_type,
        subject=data.subject or {},
        portal_group_tag=data.portal_group_tag,
        certificate_mode=data.certificate_mode.value,
        renewal_threshold_days=data.renewal_threshold_days,
        enabled=data.enabled,
        acme_provider_id=data.acme_provider_id,
    )
    db.add(cert)
    db.flush()
    _assign_nodes(cert, data.node_ids, db)
    db.commit()
    db.refresh(cert)
    return _serialize_cert(cert)


@router.put("/{cert_id}", response_model=ManagedCertificateResponse)
def update_certificate(cert_id: int, data: ManagedCertificateUpdate, db: Session = Depends(get_db)):
    cert = _get_cert_or_404(cert_id, db)

    if data.common_name is not None:
        cert.common_name = data.common_name
    if data.san_names is not None:
        cert.san_names = data.san_names
    if data.key_type is not None:
        cert.key_type = data.key_type
    if data.subject is not None:
        cert.subject = data.subject
    if data.portal_group_tag is not None:
        cert.portal_group_tag = data.portal_group_tag
    if data.certificate_mode is not None:
        cert.certificate_mode = data.certificate_mode.value
    if data.renewal_threshold_days is not None:
        cert.renewal_threshold_days = data.renewal_threshold_days
    if data.enabled is not None:
        cert.enabled = data.enabled
    if data.acme_provider_id is not None:
        _validate_provider(data.acme_provider_id, db)
        cert.acme_provider_id = data.acme_provider_id
    if data.node_ids is not None:
        _assign_nodes(cert, data.node_ids, db)

    db.commit()
    db.refresh(cert)
    return _serialize_cert(cert)


@router.delete("/{cert_id}", status_code=204)
def delete_certificate(cert_id: int, db: Session = Depends(get_db)):
    cert = _get_cert_or_404(cert_id, db)
    db.delete(cert)
    db.commit()


# ──────────────────────────────────────────────────────────
# Live "request + push" flow with Server-Sent Events
# ──────────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """Format a Server-Sent Events frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/request")
def request_certificate_stream(payload: CertificateRequestPayload):
    """
    Request a new certificate from the configured ACME provider and push it
    to the selected ISE nodes, streaming progress events back over
    Server-Sent Events so the dashboard overlay can show a live action log.

    This endpoint does NOT create a managed-certificate row — it just runs
    the full request-and-install flow once against whatever payload the UI
    supplies. Use ``POST /api/v1/certificates`` if you also want recurring
    auto-renewal for the new certificate.
    """
    events: queue.Queue = queue.Queue()

    def emit(phase: str, level: str, payload_data: dict):
        events.put({
            "event": "log",
            "data": {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "phase": phase,
                "level": level,
                **payload_data,
            },
        })

    def worker():
        db = SessionLocal()
        try:
            runner = CertificateRequestRunner(db, payload, emit)
            runner.run()
            events.put({
                "event": "complete",
                "data": {"success": True, "message": "Certificate request completed"},
            })
        except CertificateRequestError as e:
            logger.warning(f"Certificate request failed: {e}")
            events.put({
                "event": "complete",
                "data": {"success": False, "message": str(e)},
            })
        except Exception as e:
            logger.exception("Certificate request crashed")
            events.put({
                "event": "complete",
                "data": {"success": False, "message": f"Unexpected error: {e}"},
            })
        finally:
            db.close()
            events.put(None)  # sentinel

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        # Kick the client with an initial ack so it can render the overlay
        # even if the first real event takes a few seconds to arrive.
        yield _sse("log", {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "phase": "connect",
            "level": "info",
            "message": "Connected to certificate request stream",
            "data": {},
        })
        while True:
            item = events.get()
            if item is None:
                break
            yield _sse(item["event"], item["data"])
            if item["event"] == "complete":
                break

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx proxy buffering
        },
    )
