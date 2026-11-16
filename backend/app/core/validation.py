import re
from fastapi import HTTPException, status


def validate_meaningful_text(
    raw_value: str,
    field_name: str,
    min_alnum: int = 3,
) -> str:
    """
    Ensure user-submitted text contains meaningful content rather than empty spaces,
    punctuation/symbol noise, digits-only strings, or single-character repetition.
    Raises HTTP 400 with a clear user-facing error message when invalid.
    """
    cleaned = (raw_value or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be empty.",
        )

    alnum_chars = re.findall(r"[A-Za-z0-9]", cleaned)
    if not alnum_chars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must contain meaningful words, not only punctuation or symbols.",
        )

    if len(alnum_chars) < min_alnum:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is too short; please provide at least {min_alnum} alphanumeric characters.",
        )

    if not re.search(r"[A-Za-z]{2,}", cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must include at least one alphabetic word rather than numbers or isolated characters.",
        )

    if len(set(ch.lower() for ch in alnum_chars)) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} appears to be repetitive junk input; please enter meaningful text.",
        )

    return cleaned
