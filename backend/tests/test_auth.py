import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.base import User


def test_register_requires_phone_number(client: TestClient, db_session: Session):
    """Test that registration without phone_number fails validation (422)."""
    payload = {
        "name": "David",
        "email": "david@test.com",
        "password": "Password123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert any("phone_number" in err["loc"] for err in data["detail"])


def test_register_rejects_invalid_phone_number(client: TestClient, db_session: Session):
    """Test that registration with invalid phone_number format fails validation (422)."""
    # Too short
    res_short = client.post(
        "/api/auth/register",
        json={"name": "David", "email": "david1@test.com", "password": "Password123!", "phone_number": "12345"},
    )
    assert res_short.status_code == 422

    # Contains letters
    res_letters = client.post(
        "/api/auth/register",
        json={"name": "David", "email": "david2@test.com", "password": "Password123!", "phone_number": "12345678a"},
    )
    assert res_letters.status_code == 422

    # Too long
    res_long = client.post(
        "/api/auth/register",
        json={"name": "David", "email": "david3@test.com", "password": "Password123!", "phone_number": "1234567890"},
    )
    assert res_long.status_code == 422


def test_register_success_with_valid_phone_number(client: TestClient, db_session: Session):
    """Test that registration succeeds when a valid 9-digit phone_number is provided."""
    payload = {
        "name": "David",
        "email": "david@test.com",
        "password": "Password123!",
        "phone_number": "500600700",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200
    assert "Konto utworzone" in response.json()["message"]

    # Verify user in database
    user = db_session.query(User).filter(User.email == "david@test.com").first()
    assert user is not None
    assert user.phone_number == "500600700"
    assert user.is_verified is False

