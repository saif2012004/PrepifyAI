#!/usr/bin/env python3
"""Run from project root: python -m app.run"""
import socket
import uvicorn

def _free_port(start=8001):
    """Try start port, then 8002, 8003 if in use."""
    for p in range(start, start + 5):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", p))
                return p
        except OSError:
            continue
    return start

if __name__ == "__main__":
    port = _free_port(8001)
    if port != 8001:
        print(f"Port 8001 in use, using http://127.0.0.1:{port}")
    print(f"Docs: http://127.0.0.1:{port}/docs")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        reload=True,
        log_level="info",
    )
