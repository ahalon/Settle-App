from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user, send_expo_push
from app.api.balance import calculate_group_balances
from app.core.database import get_db
from app.models.base import Group, Transfer, User
from app.schemas import TransferCreate, TransferOut
from app.services.email_service import (
    send_transfer_notification_email,
    send_transfer_rejected_email,
)

router = APIRouter()


@router.post("/groups/{group_id}/transfers", response_model=TransferOut)
def declare_transfer(
    group_id: int,
    payload: TransferCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    receiver = db.query(User).filter(User.id == payload.receiver_id).first()
    if not receiver or receiver not in group.members or receiver.id == current_user.id:
        raise HTTPException(status_code=400, detail="Nieprawidłowy odbiorca przelewu.")

    balances = calculate_group_balances(group, db)
    sender_balance = balances.get(current_user.id, 0)
    receiver_balance = balances.get(receiver.id, 0)
    if sender_balance >= 0:
        raise HTTPException(status_code=400, detail="Nie masz ujemnego salda do spłaty.")
    if receiver_balance <= 0:
        raise HTTPException(status_code=400, detail="Wybrany użytkownik nie ma dodatniego salda do odebrania.")

    available_to_send = -sender_balance
    available_for_receiver = receiver_balance

    if payload.amount > available_to_send:
        raise HTTPException(
            status_code=400,
            detail=f"Kwota przekracza Twój aktualny dług ({available_to_send / 100:.2f} PLN).",
        )
    if payload.amount > available_for_receiver:
        raise HTTPException(
            status_code=400,
            detail=f"Kwota przekracza aktualną należność odbiorcy ({available_for_receiver / 100:.2f} PLN).",
        )

    transfer = Transfer(
        group_id=group_id,
        sender_id=current_user.id,
        receiver_id=receiver.id,
        amount=payload.amount,
        status="pending",
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    # 1. Powiadomienie push do odbiorcy przelewu
    if receiver.expo_push_token:
        amount_pln = f"{payload.amount / 100:.2f} PLN"
        background_tasks.add_task(
            send_expo_push,
            token=receiver.expo_push_token,
            title="Nowa deklaracja przelewu",
            body=f"{current_user.name} zadeklarował spłatę {amount_pln}. Sprawdź konto i potwierdź.",
            data={"group_id": group_id, "transfer_id": transfer.id, "type": "transfer_declared"},
        )
    else:
        print(f"[Push] Brak expo_push_token dla odbiorcy {receiver.id} ({receiver.name}) - pomijam push, wysyłam e-mail.")

    # 2. Powiadomienie e-mail do odbiorcy przelewu
    background_tasks.add_task(
        send_transfer_notification_email,
        recipient_email=receiver.email,
        sender_name=current_user.name,
        amount_cents=payload.amount,
    )

    return transfer


@router.get("/groups/{group_id}/transfers", response_model=List[TransferOut])
def get_group_transfers(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    return (
        db.query(Transfer)
        .options(joinedload(Transfer.sender), joinedload(Transfer.receiver))
        .filter(Transfer.group_id == group_id)
        .order_by(Transfer.created_at.desc())
        .all()
    )


def update_transfer_status(
    transfer_id: int,
    new_status: str,
    current_user: User,
    db: Session,
    background_tasks: BackgroundTasks | None = None,
):
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Przelew nie istnieje.")
    if transfer.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Tylko odbiorca może zmienić status przelewu.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Ten przelew został już rozpatrzony.")

    transfer.status = new_status
    db.commit()
    db.refresh(transfer)

    # Powiadomienia do nadawcy po decyzji odbiorcy
    if background_tasks:
        sender = db.query(User).filter(User.id == transfer.sender_id).first()
        if sender:
            amount_pln = f"{transfer.amount / 100:.2f} PLN"
            if sender.expo_push_token:
                if new_status == "confirmed":
                    background_tasks.add_task(
                        send_expo_push,
                        token=sender.expo_push_token,
                        title="Przelew potwierdzony",
                        body=f"{current_user.name} potwierdził odbiór {amount_pln}.",
                        data={"transfer_id": transfer.id, "type": "transfer_confirmed"},
                    )
                elif new_status == "rejected":
                    background_tasks.add_task(
                        send_expo_push,
                        token=sender.expo_push_token,
                        title="Przelew odrzucony",
                        body=f"{current_user.name} odrzucił deklarację przelewu na kwotę {amount_pln}. Twój dług został przywrócony.",
                        data={"transfer_id": transfer.id, "type": "transfer_rejected"},
                    )
            else:
                print(f"[Push] Brak expo_push_token dla nadawcy {sender.id} ({sender.name}) - pomijam push.")

            # E-mail w przypadku odrzucenia deklaracji przelewu
            if new_status == "rejected" and sender.email:
                background_tasks.add_task(
                    send_transfer_rejected_email,
                    recipient_email=sender.email,
                    sender_name=sender.name,
                    receiver_name=current_user.name,
                    amount_cents=transfer.amount,
                )

    return transfer


@router.post("/transfers/{transfer_id}/confirm", response_model=TransferOut)
def confirm_transfer(
    transfer_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_transfer_status(transfer_id, "confirmed", current_user, db, background_tasks)


@router.post("/transfers/{transfer_id}/reject", response_model=TransferOut)
def reject_transfer(
    transfer_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_transfer_status(transfer_id, "rejected", current_user, db, background_tasks)


@router.delete("/transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Przelew nie istnieje.")
    if transfer.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Możesz usuwać tylko własne deklaracje.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Można usuwać tylko oczekujące deklaracje.")

    db.delete(transfer)
    db.commit()
    return None