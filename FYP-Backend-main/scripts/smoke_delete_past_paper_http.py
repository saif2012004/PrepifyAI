"""HTTP smoke test against running API (default http://127.0.0.1:8765)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SMOKE_API_BASE", "http://127.0.0.1:8765").rstrip("/")


def req(method: str, path: str, *, headers: dict | None = None, data: bytes | None = None) -> tuple[int, str]:
    url = f"{BASE}{path}"
    h = dict(headers or {})
    if data is not None and "Content-Type" not in h and method in ("POST", "PUT", "PATCH"):
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def multipart_body(boundary: str, fields: list[tuple[str, str]], file_field: tuple[str, str, bytes]) -> bytes:
    name, filename, content = file_field
    crlf = b"\r\n"
    chunks: list[bytes] = []
    for k, v in fields:
        chunks.append(f"--{boundary}".encode() + crlf)
        chunks.append(f'Content-Disposition: form-data; name="{k}"'.encode() + crlf + crlf)
        chunks.append(v.encode() + crlf)
    chunks.append(f"--{boundary}".encode() + crlf)
    chunks.append(
        f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode()
        + crlf
        + b"Content-Type: application/pdf"
        + crlf
        + crlf
        + content
        + crlf
    )
    chunks.append(f"--{boundary}--".encode() + crlf)
    return b"".join(chunks)


def main() -> int:
    code, body = req(
        "POST",
        "/api/v1/auth/login",
        data=json.dumps({"email": "admin@prepifyai.com", "password": "admin123"}).encode(),
    )
    if code != 200:
        print("LOGIN", code, body[:500])
        return 1
    token = json.loads(body).get("access_token")
    h = {"Authorization": f"Bearer {token}"}

    code, body = req("GET", "/api/v1/subjects", headers=h)
    if code != 200 or not json.loads(body):
        print("SUBJECTS", code, body[:400])
        return 1
    sub = json.loads(body)[0]
    sid = sub["subject_id"]

    code, body = req("GET", f"/api/v1/past-papers/manage?subject_id={sid}", headers=h)
    if code != 200:
        print("LIST", code, body[:500])
        return 1
    papers = json.loads(body)
    if papers:
        pid = papers[0]["paper_id"]
        print("existing paper", pid)
    else:
        boundary = "smokeboundary98765"
        pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
        fields = [
            ("class_level", str(sub.get("class_level") or "10")),
            ("board", str(sub.get("board") or "FBISE")),
            ("subject_name", str(sub.get("subject_name") or "Biology")),
            ("year", "2099"),
            ("publish_for_students", "false"),
        ]
        body_b = multipart_body(boundary, fields, ("file", "smoke.pdf", pdf))
        up_h = {**h, "Content-Type": f"multipart/form-data; boundary={boundary}"}
        code, body = req(
            "POST",
            "/api/v1/past-papers/library/upload",
            headers=up_h,
            data=body_b,
        )
        if code not in (200, 201):
            print("UPLOAD", code, body[:800])
            return 1
        pid = json.loads(body).get("paper_id")
        if not pid:
            print("no paper_id", body[:400])
            return 1
        print("uploaded paper", pid)

    code, body = req(
        "POST",
        f"/api/v1/past-papers/manage/{pid}/delete",
        headers=h,
        data=json.dumps({}).encode(),
    )
    print("POST delete", code, body[:300])

    code, body = req("GET", f"/api/v1/past-papers/manage?subject_id={sid}", headers=h)
    still = [p for p in json.loads(body) if p["paper_id"] == pid]
    if not still:
        print("OK gone after POST")
        return 0

    code, body = req("DELETE", f"/api/v1/past-papers/manage/{pid}", headers=h)
    print("DELETE", code, body[:300])
    code, body = req("GET", f"/api/v1/past-papers/manage?subject_id={sid}", headers=h)
    still2 = [p for p in json.loads(body) if p["paper_id"] == pid]
    if still2:
        print("FAIL still there", still2, body[:400])
        return 1
    print("OK gone after DELETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
