"""
Quick test script for question generation API (no auth required)
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

print("=" * 70)
print("Testing Question Generation API (No Auth Required)")
print("=" * 70)

# Test 1: Generate Questions
print("\n[TEST 1] Generating Questions...")
print("-" * 70)

question_data = {
    "subject_id": 1,
    "topic_name": "Cell Structure",
    "question_type": "MCQ",
    "difficulty_level": "Medium",
    "count": 2
}

try:
    response = requests.post(
        f"{BASE_URL}/questions/generate",
        json=question_data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 201:
        questions = response.json()
        print(f"✓ Successfully generated {len(questions)} questions!\n")
        
        for i, q in enumerate(questions, 1):
            print(f"Question {i}:")
            print(f"  ID: {q.get('question_id')}")
            print(f"  Type: {q.get('question_type')}")
            print(f"  Difficulty: {q.get('difficulty_level')}")
            print(f"  Text: {q.get('question_text')[:80]}...")
            if q.get('options'):
                print(f"  Options: {list(q.get('options', {}).keys())}")
            print(f"  Correct Answer: {q.get('correct_answer')}")
            print()
    else:
        print(f"✗ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("✗ Cannot connect to server. Is it running on http://localhost:8000?")
    print("  Start the server with: venv\\Scripts\\python.exe app\\run.py")
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()

# Test 2: Get All Questions
print("\n[TEST 2] Getting All Questions...")
print("-" * 70)

try:
    response = requests.get(f"{BASE_URL}/questions/")
    
    if response.status_code == 200:
        questions = response.json()
        print(f"✓ Retrieved {len(questions)} questions from database")
        if questions:
            print(f"  First question ID: {questions[0].get('question_id')}")
    else:
        print(f"✗ Error: {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"✗ Error: {e}")

print("\n" + "=" * 70)
print("Test Complete!")
print("=" * 70)


