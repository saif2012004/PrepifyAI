"""
Quick verification script to check database and server status
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import asyncio

async def check_database():
    """Check database connection"""
    try:
        from app.database import AsyncSessionLocal
        from sqlalchemy import text
        
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            print("[OK] Database connection: WORKING")
            return True
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return False

def check_server():
    """Check if server is responding"""
    try:
        import requests
        response = requests.get("http://localhost:8000/api/v1", timeout=3)
        if response.status_code < 500:
            print("[OK] Server is RUNNING and responding")
            print(f"[OK] Status code: {response.status_code}")
            return True
        else:
            print(f"[WARNING] Server returned error: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("[WARNING] Server is not responding (might still be starting)")
        return False
    except Exception as e:
        print(f"[ERROR] Could not check server: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("SETUP VERIFICATION")
    print("=" * 60)
    print()
    
    print("1. Checking Database Connection...")
    db_ok = asyncio.run(check_database())
    print()
    
    print("2. Checking Server Status...")
    try:
        import requests
        server_ok = check_server()
    except ImportError:
        print("[INFO] 'requests' library not installed - skipping server check")
        server_ok = None
    print()
    
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    if db_ok:
        print("[OK] Database: CONNECTED")
    else:
        print("[ERROR] Database: NOT CONNECTED")
        print("   - Check if Docker PostgreSQL is running: docker ps")
        print("   - Check DATABASE_URL in app/.env")
    
    if server_ok is True:
        print("[OK] Server: RUNNING")
        print("[OK] Access Swagger UI at: http://localhost:8000/docs")
    elif server_ok is False:
        print("[WARNING] Server: NOT RESPONDING")
        print("   - The server might still be starting")
        print("   - Wait 10 seconds and try: http://localhost:8000/docs")
    else:
        print("[INFO] Server: Status unknown (requests library needed)")
    
    print()
    if db_ok and server_ok:
        print("[SUCCESS] Everything is ready!")
    elif db_ok:
        print("[INFO] Database is ready. Start the server with:")
        print("   .\\venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
    print("=" * 60)

