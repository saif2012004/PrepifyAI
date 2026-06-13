"""
Smoke-test past paper delete (POST …/delete and DELETE) against the real app + DB.
Run from repo root:  python scripts/smoke_delete_past_paper.py
Requires app/.env with DATABASE_URL and a running Postgres (e.g. docker compose).
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from starlette.testclient import TestClient


def main() -> int:
    from app.main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@prepifyai.com", "password": "admin123"},
        )
        if r.status_code != 200:
            print("LOGIN FAIL", r.status_code, r.text[:500])
            return 1
        token = r.json().get("access_token")
        if not token:
            print("NO TOKEN", r.text[:500])
            return 1
        h = {"Authorization": f"Bearer {token}"}

        subs = client.get("/api/v1/subjects", headers=h)
        if subs.status_code != 200 or not subs.json():
            print("NO SUBJECTS", subs.status_code, subs.text[:300])
            return 1
        sub = subs.json()[0]
        subject_id = sub["subject_id"]

        lst = client.get(
            "/api/v1/past-papers/manage",
            headers=h,
            params={"subject_id": subject_id},
        )
        if lst.status_code != 200:
            print("LIST FAIL", lst.status_code, lst.text[:500])
            return 1
        papers = lst.json()
        paper_id = None
        if papers:
            paper_id = papers[0]["paper_id"]
            print("Using existing paper_id", paper_id)
        else:
            pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
            files = {"file": ("smoke.pdf", io.BytesIO(pdf), "application/pdf")}
            data = {
                "class_level": str(sub.get("class_level") or "10"),
                "board": str(sub.get("board") or "FBISE"),
                "subject_name": str(sub.get("subject_name") or "Biology"),
                "year": "2099",
                "publish_for_students": "false",
            }
            up = client.post(
                "/api/v1/past-papers/library/upload",
                headers=h,
                files=files,
                data=data,
            )
            if up.status_code not in (200, 201):
                print("UPLOAD FAIL", up.status_code, up.text[:800])
                return 1
            paper_id = up.json().get("paper_id")
            if not paper_id:
                print("NO paper_id from upload", up.text[:500])
                return 1
            print("Uploaded draft paper_id", paper_id)

        post_del = client.post(f"/api/v1/past-papers/manage/{paper_id}/delete", headers=h, json={})
        print("POST /delete status", post_del.status_code, post_del.text[:300])

        chk = client.get(
            "/api/v1/past-papers/manage",
            headers=h,
            params={"subject_id": subject_id},
        )
        still = [p for p in chk.json() if p["paper_id"] == paper_id]
        if not still and post_del.status_code < 400:
            print("OK removed via POST")
            return 0

        if still:
            print("Paper still listed after POST; trying DELETE")
        d2 = client.delete(f"/api/v1/past-papers/manage/{paper_id}", headers=h)
        print("DELETE status", d2.status_code, d2.text[:300])

        chk2 = client.get(
            "/api/v1/past-papers/manage",
            headers=h,
            params={"subject_id": subject_id},
        )
        still2 = [p for p in chk2.json() if p["paper_id"] == paper_id]
        if still2:
            print("FAIL paper still in DB", still2)
            return 1

        print("OK delete smoke passed")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
