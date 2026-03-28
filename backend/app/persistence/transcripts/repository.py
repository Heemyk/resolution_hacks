"""File-backed transcript store with monotonic version per session."""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.persistence.transcripts.versioning import MiniVersionRecord


class TranscriptRepository:
    def __init__(self, base: Path | None = None) -> None:
        self._base = (base or settings.data_dir).resolve()
        self._base.mkdir(parents=True, exist_ok=True)

    def _session_dir(self, session_id: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_id)
        d = self._base / "transcripts" / safe
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _version_path(self, session_id: str) -> Path:
        return self._session_dir(session_id) / "version.txt"

    def _log_path(self, session_id: str) -> Path:
        return self._session_dir(session_id) / "versions.jsonl"

    def next_version(self, session_id: str) -> int:
        p = self._version_path(session_id)
        if not p.exists():
            return 1
        try:
            return int(p.read_text(encoding="utf-8").strip()) + 1
        except (ValueError, OSError):
            return 1

    def commit(self, session_id: str, text: str, source: str = "live", meta: dict | None = None) -> MiniVersionRecord:
        session_dir = self._session_dir(session_id)
        ver = self.next_version(session_id)
        rec = MiniVersionRecord(version=ver, session_id=session_id, text=text, source=source, meta=meta or {})
        log = session_dir / "versions.jsonl"
        with log.open("a", encoding="utf-8") as f:
            f.write(rec.model_dump_json() + "\n")
        (session_dir / "version.txt").write_text(str(ver), encoding="utf-8")
        (session_dir / "latest.txt").write_text(text, encoding="utf-8")
        return rec

    def read_tail(self, session_id: str, max_lines: int = 50) -> list[MiniVersionRecord]:
        log = self._log_path(session_id)
        if not log.exists():
            return []
        lines = log.read_text(encoding="utf-8").strip().splitlines()
        out: list[MiniVersionRecord] = []
        for line in lines[-max_lines:]:
            try:
                out.append(MiniVersionRecord.model_validate(json.loads(line)))
            except (json.JSONDecodeError, ValueError):
                continue
        return out
