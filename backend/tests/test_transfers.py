import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.balance import calculate_group_balances
from app.models.base import Expense, Group, Transfer, User


def setup_debt_scenario(db_session: Session, test_group: Group, creditor: User, debtor: User, amount_cents: int = 4000):
    """
    Tworzy wydatek, w wyniku którego:
    creditor (User A) ma saldo +2000 groszy (+20.00 PLN)
    debtor (User B) ma saldo -2000 groszy (-20.00 PLN)
    w grupie 2-osobowej (creditor + debtor).
    """
    two_member_group = Group(name="Pair Group")
    two_member_group.members.extend([creditor, debtor])
    db_session.add(two_member_group)
    db_session.commit()
    db_session.refresh(two_member_group)

    expense = Expense(
        title="Shared Lunch",
        amount=amount_cents,
        payer_id=creditor.id,
        group_id=two_member_group.id,
    )
    db_session.add(expense)
    db_session.commit()
    return two_member_group


def test_transfer_lifecycle_pending_to_confirmed(
    client: TestClient,
    db_session: Session,
    user_a: User,
    user_b: User,
    auth_headers,
):
    """
    Maszyna stanów: Poprawne przejście z 'pending' na 'confirmed'.
    1. User B deklaruje spłatę 20 zł do User A -> status 'pending'.
    2. User A (odbiorca) zatwierdza przelew -> status 'confirmed'.
    3. Weryfikacja: salda obu użytkowników wynoszą 0.00 PLN (dług spłacony).
    """
    group = setup_debt_scenario(db_session, None, user_a, user_b, amount_cents=4000)

    # Przed transferem: User B jest winny 2000 groszy
    initial_balances = calculate_group_balances(group, db_session)
    assert initial_balances[user_a.id] == 2000
    assert initial_balances[user_b.id] == -2000

    # 1. Deklaracja spłaty przez dłużnika (User B)
    declare_payload = {"receiver_id": user_a.id, "amount": 2000}
    response_declare = client.post(
        f"/api/groups/{group.id}/transfers",
        json=declare_payload,
        headers=auth_headers(user_b),
    )
    assert response_declare.status_code == 200
    transfer_data = response_declare.json()
    assert transfer_data["status"] == "pending"
    assert transfer_data["amount"] == 2000
    assert transfer_data["sender_name"] == user_b.name
    assert transfer_data["receiver_name"] == user_a.name
    assert transfer_data["from_user_name"] == user_b.name
    assert transfer_data["to_user_name"] == user_a.name
    transfer_id = transfer_data["id"]

    # 1b. Pobranie listy transferów grupy
    response_list = client.get(f"/api/groups/{group.id}/transfers", headers=auth_headers(user_a))
    assert response_list.status_code == 200
    transfers_list = response_list.json()
    assert len(transfers_list) == 1
    assert transfers_list[0]["sender_name"] == user_b.name
    assert transfers_list[0]["receiver_name"] == user_a.name
    assert transfers_list[0]["from_user_name"] == user_b.name
    assert transfers_list[0]["to_user_name"] == user_a.name

    # 2. Zatwierdzenie przelewu przez odbiorcę (User A)
    response_confirm = client.post(
        f"/api/transfers/{transfer_id}/confirm",
        headers=auth_headers(user_a),
    )
    assert response_confirm.status_code == 200
    assert response_confirm.json()["status"] == "confirmed"
    assert response_confirm.json()["sender_name"] == user_b.name
    assert response_confirm.json()["receiver_name"] == user_a.name

    # 3. Weryfikacja bazy danych i salda końcowego
    db_session.expire_all()
    transfer = db_session.query(Transfer).filter(Transfer.id == transfer_id).first()
    assert transfer.status == "confirmed"

    final_balances = calculate_group_balances(group, db_session)
    assert final_balances[user_a.id] == 0
    assert final_balances[user_b.id] == 0


def test_transfer_rejection_restores_debt(
    client: TestClient,
    db_session: Session,
    user_a: User,
    user_b: User,
    auth_headers,
):
    """
    Maszyna stanów: Odrzucenie transferu 'rejected'.
    1. User B deklaruje spłatę 20 zł do User A.
    2. User A odrzuca transfer (np. pieniądze nie dotarły).
    3. Weryfikacja: status staje się 'rejected', a saldo długu User B pozostaje niezmienione (-20.00 PLN).
    """
    group = setup_debt_scenario(db_session, None, user_a, user_b, amount_cents=4000)

    # Deklaracja przelewu
    declare_response = client.post(
        f"/api/groups/{group.id}/transfers",
        json={"receiver_id": user_a.id, "amount": 2000},
        headers=auth_headers(user_b),
    )
    assert declare_response.status_code == 200
    transfer_id = declare_response.json()["id"]

    # Odrzucenie przelewu przez User A
    reject_response = client.post(
        f"/api/transfers/{transfer_id}/reject",
        headers=auth_headers(user_a),
    )
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"

    # Weryfikacja: transfer ze statusem 'rejected' jest ignorowany przy liczeniu bilansów
    db_session.expire_all()
    balances_after_rejection = calculate_group_balances(group, db_session)
    assert balances_after_rejection[user_a.id] == 2000
    assert balances_after_rejection[user_b.id] == -2000


def test_transfer_confirmation_unauthorized_user_forbidden(
    client: TestClient,
    db_session: Session,
    user_a: User,
    user_b: User,
    user_c: User,
    auth_headers,
):
    """
    Uprawnienia i bezpieczeństwo: Próba potwierdzenia przez inną osobę niż odbiorca.
    1. User B deklaruje spłatę do User A.
    2. User B (sam dłużnik) lub User C (osoba trzecia) próbuje wywołać confirm.
    3. Oczekujemy błędu HTTP 403 Forbidden, a transfer pozostaje w stanie 'pending'.
    """
    group = Group(name="Trio Group")
    group.members.extend([user_a, user_b, user_c])
    db_session.add(group)
    db_session.commit()

    expense = Expense(
        title="Trip Cost",
        amount=6000,
        payer_id=user_a.id,
        group_id=group.id,
    )
    db_session.add(expense)
    db_session.commit()

    declare_response = client.post(
        f"/api/groups/{group.id}/transfers",
        json={"receiver_id": user_a.id, "amount": 2000},
        headers=auth_headers(user_b),
    )
    assert declare_response.status_code == 200
    transfer_id = declare_response.json()["id"]

    # Próba zatwierdzenia przez dłużnika (User B próbuje sam sobie "potwierdzić" spłatę)
    fraudulent_response = client.post(
        f"/api/transfers/{transfer_id}/confirm",
        headers=auth_headers(user_b),
    )
    assert fraudulent_response.status_code == 403
    assert "Tylko odbiorca może zmienić status przelewu" in fraudulent_response.json()["detail"]

    # Próba zatwierdzenia przez osobę trzecią (User C)
    third_party_response = client.post(
        f"/api/transfers/{transfer_id}/confirm",
        headers=auth_headers(user_c),
    )
    assert third_party_response.status_code == 403

    # Status transferu w bazie nadal musi być 'pending'
    db_session.expire_all()
    transfer = db_session.query(Transfer).filter(Transfer.id == transfer_id).first()
    assert transfer.status == "pending"


def test_transfer_cannot_be_decided_twice(
    client: TestClient,
    db_session: Session,
    user_a: User,
    user_b: User,
    auth_headers,
):
    """
    Maszyna stanów: Transfer już rozpatrzony nie może zostać ponownie zmieniony.
    Zatwierdzenie potwierdzonego transferu zwraca błąd HTTP 400.
    """
    group = setup_debt_scenario(db_session, None, user_a, user_b, amount_cents=4000)

    declare_response = client.post(
        f"/api/groups/{group.id}/transfers",
        json={"receiver_id": user_a.id, "amount": 2000},
        headers=auth_headers(user_b),
    )
    transfer_id = declare_response.json()["id"]

    # Pierwsze potwierdzenie -> sukces
    confirm_1 = client.post(f"/api/transfers/{transfer_id}/confirm", headers=auth_headers(user_a))
    assert confirm_1.status_code == 200

    # Próba ponownego potwierdzenia -> 400 Bad Request
    confirm_2 = client.post(f"/api/transfers/{transfer_id}/confirm", headers=auth_headers(user_a))
    assert confirm_2.status_code == 400
    assert "został już rozpatrzony" in confirm_2.json()["detail"]


def test_cannot_declare_transfer_exceeding_debt(
    client: TestClient,
    db_session: Session,
    user_a: User,
    user_b: User,
    auth_headers,
):
    """
    Walidacja kwoty: Próba zadeklarowania kwoty wyższej niż rzeczywisty dług.
    Dług wynosi 20.00 PLN (2000 groszy). Deklaracja 50.00 PLN (5000 groszy) zwraca błąd HTTP 400.
    """
    group = setup_debt_scenario(db_session, None, user_a, user_b, amount_cents=4000)

    response = client.post(
        f"/api/groups/{group.id}/transfers",
        json={"receiver_id": user_a.id, "amount": 5000},
        headers=auth_headers(user_b),
    )
    assert response.status_code == 400
    assert "Kwota przekracza Twój aktualny dług" in response.json()["detail"]
