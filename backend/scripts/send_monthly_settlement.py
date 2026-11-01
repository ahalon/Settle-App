#!/usr/bin/env python3
"""
Skrypt do ręcznego lub cyklicznego wysyłania miesięcznych podsumowań:
- E-maile i powiadomienia push dla dłużników (ile mają do spłaty, komu i z jakim numerem BLIK).
- E-maile i powiadomienia push dla wierzycieli (ludzi na plusie - ile im się należy i od kogo).

Użycie:
  python backend/scripts/send_monthly_settlement.py --dry-run   # Tylko podgląd, bez wysyłki
  python backend/scripts/send_monthly_settlement.py --send      # Rzeczywista wysyłka maili i pushy
"""

import argparse
import os
import sys

# Ustawienie ścieżki do importów z backendu
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.core.database import SessionLocal
from app.models.base import Group, Notification, User
from app.api.balance import calculate_group_balances, simplify_debts
from app.api.auth import send_expo_push
from app.api.notifications import previous_month
from app.services.email_service import (
    send_monthly_settlement_email,
    send_monthly_creditor_settlement_email,
)
from datetime import datetime, timezone


def run(dry_run: bool = True, force: bool = False):
    year, month = previous_month()
    mode_str = "TRYB TESTOWY (DRY-RUN - bez wysyłki)" if dry_run else ("TRYB WYSYŁKI RZECZYWISTEJ (WYMUSZONY)" if force else "TRYB WYSYŁKI RZECZYWISTEJ")
    print(f"\n=======================================================")
    print(f"  SettleApp - Miesięczne Rozliczenie ({mode_str})")
    print(f"  Rozliczenie za okres: {month:02d}/{year}")
    print(f"=======================================================\n")

    db = SessionLocal()
    try:
        groups = db.query(Group).all()
        if not groups:
            print("Brak grup w bazie danych.")
            return

        total_debtors_count = 0
        total_creditors_count = 0

        for group in groups:
            if len(group.members) < 2:
                print(f"[Grupa \"{group.name}\" (ID: {group.id})] Mniej niż 2 członków - pomijam.")
                continue

            net_balances = calculate_group_balances(group, db)
            settlements = simplify_debts(net_balances, group.members)

            if not settlements:
                print(f"[Grupa \"{group.name}\" (ID: {group.id})] Wszystkie salda wynoszą 0 PLN - brak rozliczeń.")
                continue

            print(f"\n📁 Grupa: \"{group.name}\" (ID: {group.id}, liczba członków: {len(group.members)})")
            print("   Aktualne salda:")
            for m in group.members:
                bal = net_balances.get(m.id, 0)
                status = "🟢 +" if bal > 0 else ("🔴 " if bal < 0 else "⚪ ")
                print(f"     {status}{m.name}: {bal / 100:.2f} PLN")

            # Grupujemy długi według dłużnika
            debts_by_user: dict[int, list[dict]] = {}
            for s in settlements:
                debts_by_user.setdefault(s["from_user_id"], []).append(s)

            # Grupujemy należności według wierzyciela
            credits_by_user: dict[int, list[dict]] = {}
            for s in settlements:
                credits_by_user.setdefault(s["to_user_id"], []).append(s)

            member_map = {m.id: m for m in group.members}

            # 1. Dłużnicy
            print("\n   --- 🔴 DŁUŻNICY (do spłaty) ---")
            for user_id, user_settlements in debts_by_user.items():
                user = member_map.get(user_id)
                if not user:
                    continue

                total_debt_cents = sum(s["amount_cents"] for s in user_settlements)
                total_debt_pln = f"{total_debt_cents / 100:.2f} PLN"
                total_debtors_count += 1

                print(f"   👤 {user.name} ({user.email}): łącznie do spłaty {total_debt_pln}")
                for s in user_settlements:
                    blik_str = f" [BLIK: {s['to_user_phone']}]" if s.get('to_user_phone') else ""
                    print(f"      -> Przelej {s['amount_pln']} do {s['to_user_name']}{blik_str}")

                # Sprawdzenie czy już wysłano
                if not force:
                    already_sent = db.query(Notification).filter(
                        Notification.user_id == user.id,
                        Notification.group_id == group.id,
                        Notification.year == year,
                        Notification.month == month,
                        Notification.message.like("Miesięczne rozliczenie email:%"),
                    ).first()
                    if already_sent:
                        print(f"      [POMINIĘTO] Mail do {user.name} za {month:02d}/{year} został już wysłany (użyj --force, aby wysłać ponownie).")
                        continue

                if not dry_run:
                    print(f"      [WYSYŁANIE] E-mail do {user.email}...")
                    send_monthly_settlement_email(
                        recipient_email=user.email,
                        recipient_name=user.name,
                        group_name=group.name,
                        settlements=user_settlements,
                    )
                    if user.expo_push_token:
                        print(f"      [WYSYŁANIE] Push do {user.name}...")
                        send_expo_push(
                            token=user.expo_push_token,
                            title=f"Miesięczne rozliczenie: {group.name}",
                            body="Sprawdź swoje saldo i spłać zobowiązania w grupie.",
                            data={"group_id": group.id, "type": "monthly_settlement"},
                        )
                    db.add(Notification(
                        user_id=user.id,
                        group_id=group.id,
                        year=year,
                        month=month,
                        message=f"Miesięczne rozliczenie email: wysłano {datetime.now(timezone.utc).isoformat()}",
                    ))
                    db.commit()

            # 2. Wierzyciele (ludzie na plusie)
            print("\n   --- 🟢 WIERZYCIELE (należności do odebrania) ---")
            for user_id, user_credits in credits_by_user.items():
                user = member_map.get(user_id)
                if not user:
                    continue

                total_credit_cents = sum(c["amount_cents"] for c in user_credits)
                total_credit_pln = f"{total_credit_cents / 100:.2f} PLN"
                total_creditors_count += 1

                print(f"   👤 {user.name} ({user.email}): łącznie do odebrania {total_credit_pln}")
                for c in user_credits:
                    print(f"      <- {c['from_user_name']} powinien przelać {c['amount_pln']}")

                # Sprawdzenie czy już wysłano
                if not force:
                    already_sent = db.query(Notification).filter(
                        Notification.user_id == user.id,
                        Notification.group_id == group.id,
                        Notification.year == year,
                        Notification.month == month,
                        Notification.message.like("Miesięczne rozliczenie email:%"),
                    ).first()
                    if already_sent:
                        print(f"      [POMINIĘTO] Mail do {user.name} za {month:02d}/{year} został już wysłany (użyj --force, aby wysłać ponownie).")
                        continue

                if not dry_run:
                    print(f"      [WYSYŁANIE] E-mail do {user.email}...")
                    send_monthly_creditor_settlement_email(
                        recipient_email=user.email,
                        recipient_name=user.name,
                        group_name=group.name,
                        credits=user_credits,
                    )
                    if user.expo_push_token:
                        print(f"      [WYSYŁANIE] Push do {user.name}...")
                        send_expo_push(
                            token=user.expo_push_token,
                            title=f"Miesięczne rozliczenie: {group.name}",
                            body=f"Jesteś na plusie! Członkowie grupy wiszą Ci łącznie {total_credit_pln}.",
                            data={"group_id": group.id, "type": "monthly_settlement"},
                        )
                    db.add(Notification(
                        user_id=user.id,
                        group_id=group.id,
                        year=year,
                        month=month,
                        message=f"Miesięczne rozliczenie email: wysłano {datetime.now(timezone.utc).isoformat()}",
                    ))
                    db.commit()

        print("\n-------------------------------------------------------")
        print(f"Podsumowanie: {total_debtors_count} dłużników, {total_creditors_count} wierzycieli.")
        if dry_run:
            print("UWAGA: Uruchomiono w trybie --dry-run. Żadne maile nie zostały wysłane.")
            print("Aby rzeczywiście wysłać maile, uruchom z flagą: --send")
        else:
            print("Wszystkie wiadomości zostały wysłane pomyślnie!")
        print("-------------------------------------------------------\n")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wysyłka miesięcznego rozliczenia SettleApp")
    parser.add_argument("--send", action="store_true", help="Wyślij maile i powiadomienia push")
    parser.add_argument("--force", action="store_true", help="Wymuś wysyłkę nawet jeśli wysłano już w tym miesiącu")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Tylko podgląd bez wysyłki")
    args = parser.parse_args()

    # Domyślnie bezpieczny dry-run, chyba że jawnie podano --send
    is_dry = not args.send
    run(dry_run=is_dry, force=args.force)

