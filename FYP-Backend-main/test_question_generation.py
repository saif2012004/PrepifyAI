"""
Simple test script to verify question generation is working.
Run this after starting the server.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000/api/v1"

def test_question_generation():
    """Test question generation endpoint"""
    
    print("=" * 60)
    print("Question Generation API Test")
    print("=" * 60)
    
    # Step 1: Login (replace with your credentials)
    print("\n1. Testing login...")
    login_data = {
        "email": "admin@example.com",  # Replace with actual email
        "password": "admin123"  # Replace with actual password
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        
        if response.status_code == 200:
            token = response.json().get("access_token")
            print(f"✓ Login successful!")
        else:
            print(f"✗ Login failed: {response.status_code}")
            print(f"  Response: {response.text}")
            print("\nNote: You may need to register a user first or use existing credentials")
            return
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to server. Is it running on http://localhost:8000?")
        print("  Start the server with: python app/run.py")
        return
    except Exception as e:
        print(f"✗ Login error: {e}")
        return
    
    # Step 2: Generate Questions
    print("\n2. Testing question generation...")
    headers = {"Authorization": f"Bearer {token}"}
    
    question_request = {
        "subject_id": 1,  # Replace with actual subject ID from your database
        "topic_name": "Cell Structure",  # Replace with actual topic
        "question_type": "MCQ",
        "difficulty_level": "Medium",
        "count": 2
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/questions/generate",
            json=question_request,
            headers=headers
        )
        
        if response.status_code == 201:
            questions = response.json()
            print(f"✓ Successfully generated {len(questions)} questions!")
            print("\nGenerated Questions:")
            print("-" * 60)
            
            for i, q in enumerate(questions, 1):
                print(f"\nQuestion {i}:")
                print(f"  ID: {q.get('question_id')}")
                print(f"  Type: {q.get('question_type')}")
                print(f"  Difficulty: {q.get('difficulty_level')}")
                print(f"  Text: {q.get('question_text')[:100]}...")
                
                if q.get('options'):
                    print(f"  Options: {json.dumps(q.get('options'), indent=4)}")
                
                print(f"  Correct Answer: {q.get('correct_answer')}")
        else:
            print(f"✗ Question generation failed: {response.status_code}")
            print(f"  Response: {response.text}")
            
    except Exception as e:
        print(f"✗ Error generating questions: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 3: List Questions
    print("\n3. Testing get questions endpoint...")
    try:
        response = requests.get(
            f"{BASE_URL}/questions/?subject_id=1",
            headers=headers
        )
        
        if response.status_code == 200:
            questions = response.json()
            print(f"✓ Retrieved {len(questions)} questions from database")
        else:
            print(f"✗ Failed to retrieve questions: {response.status_code}")
    except Exception as e:
        print(f"✗ Error retrieving questions: {e}")
    
    print("\n" + "=" * 60)
    print("Test Complete!")
    print("=" * 60)

if __name__ == "__main__":
    print("\nBefore running this test:")
    print("1. Start the server: python app/run.py")
    print("2. Make sure you have a registered user")
    print("3. Update email/password in this script")
    print("4. Ensure subject_id and topic_name exist in your database\n")
    
    input("Press Enter to continue...")
    test_question_generation()

