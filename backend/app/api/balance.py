from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, send_expo_push
from app.core.config import settings
from app.core.database import get_db
from app.models.base import Expense, Group, Notification, Transfer, User
from app.schemas import BalanceOut, MonthlySummaryOut
from app.services.email_service import (
    send_monthly_creditor_settlement_email,
    send_monthly_settlement_email,
)

router = APIRouter()


def previous_month(now: datetime | None = None) -> tuple[int, int]:
    current = now or datetime.now(timezone.utc)
    if current.month == 1:
        return current.year - 1, 12
    return current.year, current.month - 1


def simplify_debts(net_balances: dict[int, int], members: list[User]) -> list[dict]:
    member_map = {m.id: m for m in members}

    debtors = []
    creditors = []

    for user_id, bal in net_balances.items():
        if bal < 0:
            debtors.append([user_id, -bal])
        elif bal > 0:
            creditors.append([user_id, bal])

    debtors.sort(key=lambda x: x[1], reverse=True)
    creditors.sort(key=lambda x: x[1], reverse=True)

    settlements = []
    i = 0
    j = 0

    while i < len(debtors) and j < len(creditors):
        debtor_id, debt_amt = debtors[i]
        creditor_id, cred_amt = creditors[j]

        settled = min(debt_amt, cred_amt)
        if settled > 0:
            debtor = member_map.get(debtor_id)
            creditor = member_map.get(creditor_id)
            settlements.append({
                "from_user_id": debtor_id,
                "from_user_name": debtor.name if debtor else f"User {debtor_id}",
                "to_user_id": creditor_id,
                "to_user_name": creditor.name if creditor else f"User {creditor_id}",
                "to_user_phone": creditor.phone_number if creditor else None,
                "amount_cents": settled,
                "amount_pln": f"{settled / 100:.2f} PLN",
            })

        debtors[i][1] -= settled
        creditors[j][1] -= settled

        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1

    return settlements


def calculate_group_balances(
    group: Group,
    db: Session,
    as_of: datetime | None = None,
) -> dict[int, int]:
    members = group.members
    num_members = len(members)
    net_balances = {member.id: 0 for member in members}

    if num_members == 0:
        return net_balances

    sorted_members = sorted(members, key=lambda m: m.id)

    expense_query = db.query(Expense).filter(Expense.group_id == group.id)
    if as_of is not None:
        expense_query = expense_query.filter(Expense.created_at <= as_of)
    expenses = expense_query.all()
    for expense in expenses:
        base_share = expense.amount // num_members
        remainder = expense.amount % num_members
        for i, member in enumerate(sorted_members):
            extra = 1 if i < remainder else 0
            net_balances[member.id] -= (base_share + extra)
        if expense.payer_id in net_balances:
            net_balances[expense.payer_id] += expense.amount

    transfer_query = db.query(Transfer).filter(
        Transfer.group_id == group.id,
        Transfer.status != "rejected",
    )
    if as_of is not None:
        transfer_query = transfer_query.filter(Transfer.created_at <= as_of)
    active_transfers = transfer_query.all()
    for transfer in active_transfers:
        if transfer.sender_id in net_balances:
            net_balances[transfer.sender_id] += transfer.amount
        if transfer.receiver_id in net_balances:
            net_balances[transfer.receiver_id] -= transfer.amount

    return net_balances


@router.get("/groups/{group_id}/balance", response_model=BalanceOut)
def get_group_balance(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    members = group.members
    if len(members) < 2:
        return {
            "summary": "Zaproś drugą osobę do lobby, aby widzieć rozliczenia.",
            "my_net_balance": 0,
            "all_balances": {},
            "suggested_settlements": [],
        }

    net_balances = calculate_group_balances(group, db)
    suggested = simplify_debts(net_balances, members)

    my_balance_cents = net_balances.get(current_user.id, 0)
    my_balance_pln = my_balance_cents / 100

    if my_balance_pln > 0:
        summary = f"Grupa jest Ci winna: {my_balance_pln:.2f} PLN"
    elif my_balance_pln < 0:
        summary = f"Jesteś winny grupie: {abs(my_balance_pln):.2f} PLN"
    else:
        summary = "Wszystko rozliczone na czysto (0.00 PLN)"

    return {
        "summary": summary,
        "my_net_balance": my_balance_cents,
        "all_balances": net_balances,
        "suggested_settlements": suggested,
    }


@router.get("/groups/{group_id}/monthly-summary", response_model=MonthlySummaryOut)
def get_group_monthly_summary(
    group_id: int,
    year: int = Query(..., ge=2020, le=2100, description="Rok podsumowania"),
    month: int = Query(..., ge=1, le=12, description="Miesiąc podsumowania (1-12)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    monthly_expenses = (
        db.query(Expense)
        .filter(
            Expense.group_id == group_id,
            extract("year", Expense.created_at) == year,
            extract("month", Expense.created_at) == month,
        )
        .all()
    )

    total_group_spent = sum(e.amount for e in monthly_expenses)
    spending_by_user = {member.id: {"name": member.name, "amount": 0} for member in group.members}

    for exp in monthly_expenses:
        if exp.payer_id in spending_by_user:
            spending_by_user[exp.payer_id]["amount"] += exp.amount

    my_spent = spending_by_user.get(current_user.id, {}).get("amount", 0)

    return {
        "year": year,
        "month": month,
        "total_group_spent": total_group_spent,
        "total_group_spent_pln": f"{total_group_spent / 100:.2f} PLN",
        "my_spent": my_spent,
        "my_spent_pln": f"{my_spent / 100:.2f} PLN",
        "expense_count": len(monthly_expenses),
        "members_breakdown": list(spending_by_user.values()),
    }


def dispatch_monthly_settlements(
    db: Session,
    background_tasks: BackgroundTasks | None = None,
    force: bool = False,
    year: int | None = None,
    month: int | None = None,
) -> dict:
    if year is None or month is None:
        year, month = previous_month()

    groups = db.query(Group).all()
    notified_users_count = 0

    for group in groups:
        if len(group.members) < 2:
            continue

        net_balances = calculate_group_balances(group, db)
        settlements = simplify_debts(net_balances, group.members)

        # 1. Grupujemy długi według dłużnika: debtor_id -> list of settlements
        debts_by_user: dict[int, list[dict]] = {}
        for s in settlements:
            debts_by_user.setdefault(s["from_user_id"], []).append(s)

        # 2. Grupujemy należności według wierzyciela: creditor_id -> list of settlements
        credits_by_user: dict[int, list[dict]] = {}
        for s in settlements:
            credits_by_user.setdefault(s["to_user_id"], []).append(s)

        member_map = {m.id: m for m in group.members}

        # 1. Powiadomienia dla dłużników
        for user_id, user_settlements in debts_by_user.items():
            user = member_map.get(user_id)
            if not user or not user.email:
                continue

            # Zapobieganie podwójnemu wysłaniu w tym samym miesiącu
            if not force:
                already_sent = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == user.id,
                        Notification.group_id == group.id,
                        Notification.year == year,
                        Notification.month == month,
                        Notification.message.like("Miesięczne rozliczenie email:%"),
                    )
                    .first()
                )
                if already_sent:
                    continue

            notified_users_count += 1

            # Push
            if user.expo_push_token:
                if background_tasks:
                    background_tasks.add_task(
                        send_expo_push,
                        token=user.expo_push_token,
                        title=f"Miesięczne rozliczenie: {group.name}",
                        body="Sprawdź swoje saldo i spłać zobowiązania w grupie.",
                        data={"group_id": group.id, "type": "monthly_settlement"},
                    )
                else:
                    send_expo_push(
                        token=user.expo_push_token,
                        title=f"Miesięczne rozliczenie: {group.name}",
                        body="Sprawdź swoje saldo i spłać zobowiązania w grupie.",
                        data={"group_id": group.id, "type": "monthly_settlement"},
                    )

            # Email
            if background_tasks:
                background_tasks.add_task(
                    send_monthly_settlement_email,
                    recipient_email=user.email,
                    recipient_name=user.name,
                    group_name=group.name,
                    settlements=user_settlements,
                )
            else:
                send_monthly_settlement_email(
                    recipient_email=user.email,
                    recipient_name=user.name,
                    group_name=group.name,
                    settlements=user_settlements,
                )

            # Zapisz znacznik wysłania maila rozliczeniowego
            db.add(
                Notification(
                    user_id=user.id,
                    group_id=group.id,
                    year=year,
                    month=month,
                    message=f"Miesięczne rozliczenie email: wysłano {datetime.now(timezone.utc).isoformat()}",
                )
            )

        # 2. Powiadomienia dla wierzycieli (ludzi na plusie)
        for user_id, user_credits in credits_by_user.items():
            user = member_map.get(user_id)
            if not user or not user.email:
                continue

            # Zapobieganie podwójnemu wysłaniu w tym samym miesiącu
            if not force:
                already_sent = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == user.id,
                        Notification.group_id == group.id,
                        Notification.year == year,
                        Notification.month == month,
                        Notification.message.like("Miesięczne rozliczenie email:%"),
                    )
                    .first()
                )
                if already_sent:
                    continue

            notified_users_count += 1
            total_cents = sum(c.get("amount_cents", 0) for c in user_credits)
            total_pln = f"{total_cents / 100:.2f} PLN"

            # Push
            if user.expo_push_token:
                if background_tasks:
                    background_tasks.add_task(
                        send_expo_push,
                        token=user.expo_push_token,
                        title=f"Miesięczne rozliczenie: {group.name}",
                        body=f"Jesteś na plusie! Członkowie grupy wiszą Ci łącznie {total_pln}.",
                        data={"group_id": group.id, "type": "monthly_settlement"},
                    )
                else:
                    send_expo_push(
                        token=user.expo_push_token,
                        title=f"Miesięczne rozliczenie: {group.name}",
                        body=f"Jesteś na plusie! Członkowie grupy wiszą Ci łącznie {total_pln}.",
                        data={"group_id": group.id, "type": "monthly_settlement"},
                    )

            # Email
            if background_tasks:
                background_tasks.add_task(
                    send_monthly_creditor_settlement_email,
                    recipient_email=user.email,
                    recipient_name=user.name,
                    group_name=group.name,
                    credits=user_credits,
                )
            else:
                send_monthly_creditor_settlement_email(
                    recipient_email=user.email,
                    recipient_name=user.name,
                    group_name=group.name,
                    credits=user_credits,
                )

            # Zapisz znacznik wysłania maila rozliczeniowego
            db.add(
                Notification(
                    user_id=user.id,
                    group_id=group.id,
                    year=year,
                    month=month,
                    message=f"Miesięczne rozliczenie email: wysłano {datetime.now(timezone.utc).isoformat()}",
                )
            )

    db.commit()

    return {
        "status": "success",
        "processed_groups": len(groups),
        "notified_users": notified_users_count,
        "year": year,
        "month": month,
    }


@router.post("/settlements/monthly-trigger")
def trigger_monthly_settlement(
    background_tasks: BackgroundTasks,
    x_cron_key: str | None = Header(None, alias="X-Cron-Key"),
    force: bool = Query(False, description="Wymuś wysyłkę nawet jeśli już wysłano w tym miesiącu"),
    db: Session = Depends(get_db),
):
    """
    Endpoint wywoływany 1. dnia miesiąca o 10:00 przez crona.
    Wymaga nagłówka X-Cron-Key zgodnego z CRON_SECRET w ustawieniach.
    """
    expected_secret = getattr(settings, "CRON_SECRET", "settleapp-secret-cron-key")
    if x_cron_key != expected_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieautoryzowane wywołanie crona.",
        )

    return dispatch_monthly_settlements(
        db=db,
        background_tasks=background_tasks,
        force=force,
    )