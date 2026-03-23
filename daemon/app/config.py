"""
Configuration management — reads/writes settings from the database.
"""

import json
from sqlalchemy.orm import Session
from .database import Settings, SessionLocal


class ConfigManager:
    """Manages configuration stored in the database."""

    @staticmethod
    def get_all(db: Session) -> dict:
        """Get all settings grouped by category."""
        settings = db.query(Settings).all()
        result = {}
        for s in settings:
            if s.category not in result:
                result[s.category] = {}
            result[s.category][s.key] = ConfigManager._cast_value(s.value, s.value_type)
        return result

    @staticmethod
    def get_flat(db: Session) -> dict:
        """Get all settings as a flat dictionary (for the renewal engine)."""
        settings = db.query(Settings).all()
        result = {}
        for s in settings:
            result[s.key] = ConfigManager._cast_value(s.value, s.value_type)
        return result

    @staticmethod
    def get(db: Session, key: str, default=None):
        """Get a single setting value."""
        setting = db.query(Settings).filter(Settings.key == key).first()
        if setting:
            return ConfigManager._cast_value(setting.value, setting.value_type)
        return default

    @staticmethod
    def set(db: Session, key: str, value, category: str = None):
        """Set a single setting value."""
        setting = db.query(Settings).filter(Settings.key == key).first()
        if setting:
            if isinstance(value, (dict, list)):
                setting.value = json.dumps(value)
            else:
                setting.value = str(value)
            if category:
                setting.category = category
        else:
            value_type = "string"
            if isinstance(value, bool):
                value_type = "boolean"
            elif isinstance(value, int):
                value_type = "integer"
            elif isinstance(value, (dict, list)):
                value_type = "json"
                value = json.dumps(value)

            setting = Settings(
                key=key, value=str(value), value_type=value_type,
                category=category or "general"
            )
            db.add(setting)
        db.commit()

    @staticmethod
    def set_bulk(db: Session, settings_dict: dict, category: str):
        """Set multiple settings at once for a category."""
        for key, value in settings_dict.items():
            ConfigManager.set(db, key, value, category)

    @staticmethod
    def get_safe(db: Session) -> dict:
        """Get all settings with secrets masked."""
        settings = db.query(Settings).all()
        result = {}
        for s in settings:
            if s.category not in result:
                result[s.category] = {}
            if s.is_secret and s.value:
                result[s.category][s.key] = "••••••••"
            else:
                result[s.category][s.key] = ConfigManager._cast_value(s.value, s.value_type)
        return result

    @staticmethod
    def _cast_value(value: str, value_type: str):
        """Cast string value to appropriate Python type."""
        if value is None or value == "":
            return None
        try:
            if value_type == "integer":
                return int(value)
            elif value_type == "boolean":
                return value.lower() in ("true", "1", "yes")
            elif value_type == "json":
                return json.loads(value)
            elif value_type == "float":
                return float(value)
            else:
                return value
        except (ValueError, json.JSONDecodeError):
            return value
