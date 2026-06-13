"""
Test script to run question_generator.py utilities directly
Tests the FastAPI-only question generation without running the full server
"""

import sys
from pathlib import Path

# Add app directory to path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir.parent))

from app.utils.question_generator import FBISEQuestionFormatter

def test_question_formatter():
    """Test the FBISEQuestionFormatter class"""
    print("=" * 60)
    print("Testing FBISE Question Formatter")
    print("=" * 60)
    
    formatter = FBISEQuestionFormatter()
    
    # Test MCQ formatting
    print("\n1. Testing MCQ Formatting:")
    print("-" * 60)
    mcq = formatter.format_mcq(
        question_text="What is the basic unit of life?",
        options={"A": "Cell", "B": "Tissue", "C": "Organ", "D": "Organism"},
        correct_answer="A"
    )
    print(f"Question: {mcq['question_text']}")
    print(f"Options: {mcq['options']}")
    print(f"Correct Answer: {mcq['correct_answer']}")
    
    # Test Short Question formatting
    print("\n2. Testing Short Question Formatting:")
    print("-" * 60)
    short_q = formatter.format_short_question(
        question_text="Explain the structure of a cell",
        correct_answer="A cell consists of a cell membrane, cytoplasm, and nucleus."
    )
    print(f"Question: {short_q['question_text']}")
    print(f"Answer: {short_q['correct_answer']}")
    
    # Test validation
    print("\n3. Testing Validation:")
    print("-" * 60)
    valid = formatter.validate_question_text("What is photosynthesis?", "MCQ")
    print(f"Question validation: {valid}")
    
    difficulty = formatter.validate_difficulty_level("medium")
    print(f"Difficulty normalization: {difficulty}")
    
    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    test_question_formatter()



