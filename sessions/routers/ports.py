from __future__ import annotations
from fastapi import APIRouter
from ..ports import scan_ports
from ..models import Port

router = APIRouter()


@router.get("/ports", response_model=list[Port])
async def get_ports() -> list[Port]:
    return scan_ports()


@router.get("/ports/active", response_model=list[Port])
async def get_active_ports() -> list[Port]:
    all_ports = scan_ports()
    return [p for p in all_ports if p.pid is not None]
