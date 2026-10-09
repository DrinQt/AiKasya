import pytest
from app import database

@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """Keep test pantry and price updates out of the checked-in demo database."""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "aikasya-test.db")