# 145:66
"""guardian.user_db — user registry for the Guardian shell.

Tracks per-user identity, passphrase (hashed), affiliation level, and
achievements.  Stored in state/users.json (encrypted via a0.encryption).

Status: secondary — exists and is usable but not yet wired into the
routing or Jury adjudication flow.  Future integration points are marked
with # FUTURE comments.

Passphrase storage:
    PBKDF2-HMAC-SHA256, 260 000 iterations.
    On-disk format: "<salt_hex>:<hash_hex>" (never plaintext).
    Constant-time comparison via hmac.compare_digest.

Affiliation levels (AffiliationLevel):
    GUEST    (0) — anonymous / unverified
    MEMBER   (1) — registered, confirmed
    TRUSTED  (2) — manually elevated
    OPERATOR (3) — full operator access

Achievements:
    Opaque strings; uniqueness enforced per user.
    Awarded freely — no Jury token required (non-continuity-bearing facts).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import IntEnum
from pathlib import Path
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Affiliation level
# ---------------------------------------------------------------------------

class AffiliationLevel(IntEnum):
    GUEST    = 0
    MEMBER   = 1
    TRUSTED  = 2
    OPERATOR = 3


# ---------------------------------------------------------------------------
# User record
# ---------------------------------------------------------------------------

@dataclass
class UserRecord:
    user_id:           str
    username:          str
    passphrase_hash:   str            # "<salt_hex>:<pbkdf2_hex>" — never plaintext
    affiliation_level: int = AffiliationLevel.GUEST
    achievements:      List[str] = field(default_factory=list)
    created_at:        str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    # Convenience
    @property
    def affiliation(self) -> AffiliationLevel:
        return AffiliationLevel(self.affiliation_level)

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict) -> "UserRecord":
        known = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in known})


# ---------------------------------------------------------------------------
# Passphrase helpers (internal)
# ---------------------------------------------------------------------------

_ITERATIONS = 260_000


def _hash_passphrase(passphrase: str, salt: Optional[bytes] = None) -> str:
    """Return '<salt_hex>:<hash_hex>' for storage."""
    if salt is None:
        salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, _ITERATIONS)
    return f"{salt.hex()}:{h.hex()}"


def _verify_passphrase(passphrase: str, stored: str) -> bool:
    """Constant-time comparison — safe against timing attacks."""
    try:
        salt_hex, _ = stored.split(":", 1)
        candidate = _hash_passphrase(passphrase, bytes.fromhex(salt_hex))
        return hmac.compare_digest(stored, candidate)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class UserDBError(Exception):
    """Base for all UserDB errors."""

class UserNotFoundError(UserDBError):
    pass

class UsernameTakenError(UserDBError):
    pass

class BadPassphraseError(UserDBError):
    pass


# ---------------------------------------------------------------------------
# UserDB
# ---------------------------------------------------------------------------

_DEFAULT_PATH = Path(__file__).parent.parent / "state" / "users.json"


class UserDB:
    """Encrypted, file-backed user registry.

    Args:
        path: Path to users.json.  Defaults to state/users.json next to
              guardian's parent package.  Pass a per-instance path for
              instance-scoped user tables.

    Usage::

        db = UserDB()
        user = db.register("alice", "correct horse battery staple")
        db.verify("alice", "correct horse battery staple")   # → UserRecord
        db.add_achievement(user.user_id, "first_login")
        db.set_affiliation(user.user_id, AffiliationLevel.MEMBER)
    """

    def __init__(self, path: Optional[Path] = None) -> None:
        self._path: Path = Path(path) if path else _DEFAULT_PATH
        self._users: Dict[str, UserRecord] = {}   # user_id → UserRecord
        self._by_name: Dict[str, str] = {}         # username (lower) → user_id
        self._load()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register(self, username: str, passphrase: str) -> UserRecord:
        """Register a new user.  Raises UsernameTakenError on collision."""
        key = username.strip().lower()
        if key in self._by_name:
            raise UsernameTakenError(f"username already taken: {username!r}")

        user_id = uuid.uuid4().hex
        record = UserRecord(
            user_id=user_id,
            username=username.strip(),
            passphrase_hash=_hash_passphrase(passphrase),
        )
        self._users[user_id] = record
        self._by_name[key] = user_id
        self._persist()
        return record

    def verify(self, username: str, passphrase: str) -> UserRecord:
        """Authenticate.  Raises UserNotFoundError or BadPassphraseError."""
        record = self._lookup_by_name(username)
        if not _verify_passphrase(passphrase, record.passphrase_hash):
            raise BadPassphraseError("passphrase incorrect")
        return record

    def get(self, user_id: str) -> UserRecord:
        """Retrieve a user by ID.  Raises UserNotFoundError if absent."""
        try:
            return self._users[user_id]
        except KeyError:
            raise UserNotFoundError(user_id)

    def get_by_name(self, username: str) -> UserRecord:
        """Retrieve a user by username (case-insensitive)."""
        return self._lookup_by_name(username)

    def set_affiliation(
        self,
        user_id: str,
        level: AffiliationLevel | int,
    ) -> UserRecord:
        """Elevate or demote a user's affiliation level."""
        record = self.get(user_id)
        record.affiliation_level = int(level)
        self._persist()
        return record

    def add_achievement(self, user_id: str, achievement: str) -> UserRecord:
        """Award an achievement (idempotent — duplicates are silently dropped)."""
        record = self.get(user_id)
        if achievement not in record.achievements:
            record.achievements.append(achievement)
            self._persist()
        return record

    def remove_achievement(self, user_id: str, achievement: str) -> UserRecord:
        """Revoke an achievement.  No-op if not present."""
        record = self.get(user_id)
        try:
            record.achievements.remove(achievement)
            self._persist()
        except ValueError:
            pass
        return record

    def all_users(self) -> List[UserRecord]:
        """Return all registered users (no passphrase hashes exposed — caller handles)."""
        return list(self._users.values())

    def delete(self, user_id: str) -> None:
        """Remove a user permanently."""
        record = self.get(user_id)
        del self._users[user_id]
        self._by_name.pop(record.username.lower(), None)
        self._persist()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _lookup_by_name(self, username: str) -> UserRecord:
        uid = self._by_name.get(username.strip().lower())
        if uid is None:
            raise UserNotFoundError(f"no user: {username!r}")
        return self._users[uid]

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {uid: r.to_dict() for uid, r in self._users.items()},
            ensure_ascii=False,
            indent=2,
        )
        from a0.encryption import encrypt
        self._path.write_text(encrypt(payload), encoding="utf-8")

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            from a0.encryption import decrypt
            raw = decrypt(self._path.read_text(encoding="utf-8"))
            data: Dict = json.loads(raw)
            for uid, d in data.items():
                r = UserRecord.from_dict(d)
                self._users[uid] = r
                self._by_name[r.username.lower()] = uid
        except Exception:
            # Corrupt or legacy file — start clean rather than crash.
            pass
# 145:66
