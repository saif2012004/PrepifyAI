
import re
from typing import Any, Dict, List
from email_validator import validate_email, EmailNotValidError

def validate_email_format(email: str) -> str:
    try:
        valid = validate_email(email)
        return valid.email
    except EmailNotValidError:
        raise ValueError("Invalid email format")

def validate_password_strength(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r'[A-Za-z]', password):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r'\d', password):
        raise ValueError("Password must contain at least one number")
    return password

def validate_class_level(class_level: str) -> str:
    valid_levels = ['9', '10', '11', '12']
    if class_level not in valid_levels:
        raise ValueError(f"Class level must be one of: {', '.join(valid_levels)}")
    return class_level
