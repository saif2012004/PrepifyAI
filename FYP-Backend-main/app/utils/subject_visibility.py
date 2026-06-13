"""Which catalog subjects are hidden from students (still visible to admins)."""


def subject_board_hidden_from_students(board: str | None) -> bool:
    """
    True if this board label should not appear in student-facing subject lists.

    Matches app/catalog rules: non-canonical FBISE (e.g. lowercase fbise), or board
    containing the substring \"punjab\" in lowercase.
    """
    if not board:
        return False
    b = board.strip()
    lower = b.lower()
    non_canonical_fbise = lower == "fbise" and b != "FBISE"
    punjab_lowercase_substring = "punjab" in b
    return non_canonical_fbise or punjab_lowercase_substring
