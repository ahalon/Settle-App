from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import engine
from app.core.database import SessionLocal
from app.models.base import Base
from app.api.notifications import generate_monthly_notifications
from app.api.router import router as api_router

# Automatyczne utworzenie wszystkich tabel zdefiniowanych w Base (users, groups, group_members, expenses)
Base.metadata.create_all(bind=engine)

scheduler = BackgroundScheduler(timezone="Europe/Warsaw")


def run_monthly_notifications() -> None:
    db = SessionLocal()
    try:
        generate_monthly_notifications(db)
    finally:
        db.close()

origins = [
    "https://ahalon.github.io",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:8081",
]

app = FastAPI(title="SettleApp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.github\.io",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.on_event("startup")
def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(
            run_monthly_notifications,
            CronTrigger(day=1, hour=9, minute=0, timezone="Europe/Warsaw"),
            id="monthly-balance-notifications",
            replace_existing=True,
        )
        scheduler.start()


@app.on_event("shutdown")
def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/")
def root():
    return {"message": "SettleApp API działa"}