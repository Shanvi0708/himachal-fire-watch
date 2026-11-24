import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./himachal_fire.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                external_id VARCHAR(100) UNIQUE,
                lat DOUBLE PRECISION NOT NULL,
                lon DOUBLE PRECISION NOT NULL,
                district VARCHAR(100) DEFAULT 'Himachal Pradesh',
                detected_time TIMESTAMP NOT NULL,
                severity VARCHAR(50) DEFAULT 'Moderate',
                area_ha DOUBLE PRECISION DEFAULT 0.0,
                confidence VARCHAR(20),
                frp DOUBLE PRECISION,
                source VARCHAR(50) DEFAULT 'NASA_FIRMS_VIIRS',
                status VARCHAR(30) DEFAULT 'Active'
            );
        """))