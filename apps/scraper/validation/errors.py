import time
from typing import Optional


class ValidationError(Exception):
    """Structured validation error with field-level details."""

    message: str
    field_errors: dict[str, list[str]]
    timestamp: float

    def __init__(self, message: str, field_errors: Optional[dict[str, list[str]]] = None):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}
        self.timestamp = time.time()

    def to_dict(self) -> dict[str, object]:
        return {
            "error": self.message,
            "field_errors": self.field_errors,
            "timestamp": self.timestamp,
            "remediation": self._get_remediation_hint(),
        }

    def _get_remediation_hint(self) -> str:
        # Return helpful hint based on error type
        if "price" in self.field_errors:
            return "Price must be a positive number"
        if "name" in self.field_errors:
            return "Product name is required"
        return "Check field values and try again"


def format_validation_error(error: Exception) -> dict[str, object]:
    """Format any validation error into structured dict."""
    if isinstance(error, ValidationError):
        return error.to_dict()
    return {
        "error": str(error),
        "field_errors": {},
        "timestamp": time.time(),
        "remediation": "Unexpected validation error",
    }
