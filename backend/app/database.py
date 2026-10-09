import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.optimization.calculator import normalize_unit_and_quantity, decimal_round
from data.seed_data import INGREDIENTS_SEED, PRICES_SEED, RECIPES_SEED

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "aikasya.db"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS ingredients (
        ingredient_id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        aliases TEXT NOT NULL,
        category TEXT NOT NULL,
        base_unit TEXT NOT NULL,
        default_purchase_increment REAL DEFAULT 0,
        storage_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS prices (
        price_id TEXT PRIMARY KEY,
        ingredient_id TEXT NOT NULL,
        amount_php REAL NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        normalized_price_per_base_unit REAL NOT NULL,
        minimum_purchase_quantity REAL DEFAULT 0,
        market_or_area TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_reference TEXT,
        is_user_confirmed INTEGER DEFAULT 0,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients (ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS recipes (
        recipe_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        base_servings INTEGER NOT NULL,
        prep_minutes INTEGER NOT NULL,
        cook_minutes INTEGER NOT NULL,
        steps TEXT NOT NULL,
        ingredients_json TEXT NOT NULL,
        source_title TEXT,
        source_url_or_note TEXT,
        rights_status TEXT
    );

    CREATE TABLE IF NOT EXISTS pantry (
        ingredient_id TEXT PRIMARY KEY,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expiry_date TEXT,
        storage_condition TEXT,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients (ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS plans (
        plan_id TEXT PRIMARY KEY,
        budget_php REAL NOT NULL,
        servings INTEGER NOT NULL,
        meal_scope TEXT NOT NULL,
        recipe_ids TEXT NOT NULL,
        price_snapshot_timestamp TEXT NOT NULL,
        ingredients_to_buy TEXT NOT NULL,
        estimated_total_php REAL NOT NULL,
        budget_remaining_php REAL NOT NULL,
        warnings TEXT NOT NULL,
        created_at TEXT NOT NULL,
        shopping_status TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()

    seed_if_empty()


def seed_if_empty():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM ingredients")
    if cursor.fetchone()[0] == 0:
        for ing in INGREDIENTS_SEED:
            cursor.execute(
                """
                INSERT INTO ingredients (ingredient_id, canonical_name, aliases, category, base_unit, default_purchase_increment, storage_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ing["ingredient_id"],
                    ing["canonical_name"],
                    json.dumps(ing.get("aliases", [])),
                    ing["category"],
                    ing["base_unit"],
                    ing.get("default_purchase_increment", 0.0),
                    ing.get("storage_notes", ""),
                ),
            )

    cursor.execute("SELECT COUNT(*) FROM prices")
    if cursor.fetchone()[0] == 0:
        for pr in PRICES_SEED:
            qty = float(pr["quantity"])
            unit = pr["unit"]
            base_qty, base_unit = normalize_unit_and_quantity(qty, unit)
            norm_price = (float(pr["amount_php"]) / base_qty) if base_qty > 0 else 0.0

            cursor.execute(
                """
                INSERT INTO prices (
                    price_id, ingredient_id, amount_php, quantity, unit,
                    normalized_price_per_base_unit, minimum_purchase_quantity,
                    market_or_area, observed_at, source_type, source_reference, is_user_confirmed
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"pr-{uuid.uuid4().hex[:8]}",
                    pr["ingredient_id"],
                    pr["amount_php"],
                    pr["quantity"],
                    pr["unit"],
                    norm_price,
                    pr.get("minimum_purchase_quantity", 0.0),
                    pr["market_or_area"],
                    "2026-10-09",
                    pr["source_type"],
                    pr.get("source_reference", ""),
                    1 if pr["source_type"] == "official_reference" else 0,
                ),
            )

    cursor.execute("SELECT COUNT(*) FROM recipes")
    if cursor.fetchone()[0] == 0:
        for rc in RECIPES_SEED:
            cursor.execute(
                """
                INSERT INTO recipes (
                    recipe_id, name, category, base_servings, prep_minutes, cook_minutes,
                    steps, ingredients_json, source_title, source_url_or_note, rights_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rc["recipe_id"],
                    rc["name"],
                    rc["category"],
                    rc["base_servings"],
                    rc["prep_minutes"],
                    rc["cook_minutes"],
                    json.dumps(rc["steps"]),
                    json.dumps(rc["ingredients"]),
                    rc.get("source_title", "Filipino Recipe"),
                    rc.get("source_url_or_note", ""),
                    rc.get("rights_status", "curated_original"),
                ),
            )

    conn.commit()
    conn.close()


def get_all_recipes_db() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recipes")
    rows = cursor.fetchall()
    recipes = []
    for r in rows:
        recipes.append({
            "recipe_id": r["recipe_id"],
            "name": r["name"],
            "category": r["category"],
            "base_servings": r["base_servings"],
            "prep_minutes": r["prep_minutes"],
            "cook_minutes": r["cook_minutes"],
            "steps": json.loads(r["steps"]),
            "ingredients": json.loads(r["ingredients_json"]),
            "source_title": r["source_title"],
            "source_url_or_note": r["source_url_or_note"],
        })
    conn.close()
    return recipes


def get_recipe_by_id_db(recipe_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recipes WHERE recipe_id = ?", (recipe_id,))
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    return {
        "recipe_id": r["recipe_id"],
        "name": r["name"],
        "category": r["category"],
        "base_servings": r["base_servings"],
        "prep_minutes": r["prep_minutes"],
        "cook_minutes": r["cook_minutes"],
        "steps": json.loads(r["steps"]),
        "ingredients": json.loads(r["ingredients_json"]),
        "source_title": r["source_title"],
        "source_url_or_note": r["source_url_or_note"],
    }


def get_latest_prices_map() -> Dict[str, Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.*, i.canonical_name 
        FROM prices p
        JOIN ingredients i ON p.ingredient_id = i.ingredient_id
        ORDER BY p.observed_at DESC
    """)
    rows = cursor.fetchall()
    prices_map = {}
    for r in rows:
        ing_id = r["ingredient_id"]
        if ing_id not in prices_map:
            prices_map[ing_id] = {
                "price_id": r["price_id"],
                "ingredient_id": ing_id,
                "amount_php": r["amount_php"],
                "quantity": r["quantity"],
                "unit": r["unit"],
                "normalized_price_per_base_unit": r["normalized_price_per_base_unit"],
                "minimum_purchase_quantity": r["minimum_purchase_quantity"],
                "market_or_area": r["market_or_area"],
                "observed_at": r["observed_at"],
                "source_type": r["source_type"],
                "source_reference": r["source_reference"],
                "is_user_confirmed": bool(r["is_user_confirmed"]),
            }
    conn.close()
    return prices_map


def upsert_price_db(
    ingredient_id: str,
    amount_php: float,
    quantity: float,
    unit: str,
    market_or_area: str,
    source_type: str = "user_entered",
) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    base_qty, base_unit = normalize_unit_and_quantity(quantity, unit)
    norm_price = (amount_php / base_qty) if base_qty > 0 else 0.0
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    price_id = f"pr-{uuid.uuid4().hex[:8]}"

    cursor.execute(
        """
        INSERT INTO prices (
            price_id, ingredient_id, amount_php, quantity, unit,
            normalized_price_per_base_unit, minimum_purchase_quantity,
            market_or_area, observed_at, source_type, source_reference, is_user_confirmed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            price_id,
            ingredient_id,
            amount_php,
            quantity,
            unit,
            norm_price,
            0.0,
            market_or_area,
            now_str,
            source_type,
            "User market update",
            1,
        ),
    )
    conn.commit()
    conn.close()

    return {
        "price_id": price_id,
        "ingredient_id": ingredient_id,
        "amount_php": amount_php,
        "quantity": quantity,
        "unit": unit,
        "normalized_price_per_base_unit": norm_price,
        "base_unit": base_unit,
        "market_or_area": market_or_area,
        "observed_at": now_str,
        "source_type": source_type,
        "is_user_confirmed": True,
    }


def get_all_ingredients_db() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ingredients")
    rows = cursor.fetchall()
    prices_map = get_latest_prices_map()

    ingredients = []
    for r in rows:
        ing_id = r["ingredient_id"]
        pr = prices_map.get(ing_id)
        ingredients.append({
            "ingredient_id": ing_id,
            "canonical_name": r["canonical_name"],
            "aliases": json.loads(r["aliases"]),
            "category": r["category"],
            "base_unit": r["base_unit"],
            "default_purchase_increment": r["default_purchase_increment"],
            "current_price_php": pr["amount_php"] if pr else None,
            "price_unit": f"{pr['quantity']}{pr['unit']}" if pr else None,
            "price_source_type": pr["source_type"] if pr else None,
            "price_observed_at": pr["observed_at"] if pr else None,
        })
    conn.close()
    return ingredients


def get_all_pantry_db() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.*, i.canonical_name 
        FROM pantry p
        JOIN ingredients i ON p.ingredient_id = i.ingredient_id
    """)
    rows = cursor.fetchall()
    pantry = []
    for r in rows:
        pantry.append({
            "ingredient_id": r["ingredient_id"],
            "name": r["canonical_name"],
            "quantity": r["quantity"],
            "unit": r["unit"],
            "updated_at": r["updated_at"],
        })
    conn.close()
    return pantry


def upsert_pantry_db(ingredient_id: str, quantity: float, unit: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    cursor.execute(
        """
        INSERT INTO pantry (ingredient_id, quantity, unit, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ingredient_id) DO UPDATE SET
            quantity = excluded.quantity,
            unit = excluded.unit,
            updated_at = excluded.updated_at
        """,
        (ingredient_id, quantity, unit, now_str),
    )
    conn.commit()

    cursor.execute("SELECT canonical_name FROM ingredients WHERE ingredient_id = ?", (ingredient_id,))
    row = cursor.fetchone()
    name = row["canonical_name"] if row else ingredient_id
    conn.close()

    return {
        "ingredient_id": ingredient_id,
        "name": name,
        "quantity": quantity,
        "unit": unit,
        "updated_at": now_str,
    }
