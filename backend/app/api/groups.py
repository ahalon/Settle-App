from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.base import Group, User
from app.schemas import GroupCreate, GroupJoin, GroupOut

router = APIRouter()


@router.post("/groups", response_model=GroupOut)
def create_group(
    payload: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = Group(name=payload.name)
    group.members.append(current_user)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.post("/groups/join", response_model=GroupOut)
def join_group(
    payload: GroupJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.join_code == payload.join_code.strip().upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Nie znaleziono grupy o takim kodzie.")

    if current_user in group.members:
        raise HTTPException(status_code=400, detail="Już należysz do tej grupy.")

    group.members.append(current_user)
    db.commit()
    db.refresh(group)
    return group


@router.get("/groups/my", response_model=List[GroupOut])
def get_my_groups(current_user: User = Depends(get_current_user)):
    return current_user.groups


@router.get("/groups/{group_id}", response_model=GroupOut)
def get_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")
    return group