"""
Test script to verify question generation flow
Shows how the question generation works step-by-step
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

async def test_question_generation_flow():
    """
    Explains and tests the question generation process:
    
    1. Receives request: subject_id, topic_name, question_type, difficulty_level, count
    2. Fetches subject from database
    3. Fetches textbook chunks matching the topic
    4. Combines chunk content into context text
    5. Generates questions using rule-based algorithms (FastAPI-only, no LLM)
    6. Formats questions according to FBISE standards
    7. Validates questions
    8. Saves to database
    9. Returns formatted questions
    """
    
    print("=" * 70)
    print("QUESTION GENERATION FLOW EXPLANATION")
    print("=" * 70)
    
    print("\n[INFO] HOW IT WORKS:")
    print("-" * 70)
    print("""
    1. INPUT: API receives request with:
       - subject_id: Which subject (e.g., 1 for Biology)
       - topic_name: Topic/chapter name (e.g., "Cell Structure")
       - question_type: "MCQ" or "Short"
       - difficulty_level: "Easy", "Medium", or "Hard"
       - count: Number of questions (1-20)
    
    2. DATABASE QUERY:
       - Fetches Subject by subject_id (validates it exists)
       - Searches TextbookChunk table for chunks matching:
         * subject_id matches
         * topic_name/chapter_name/text_content contains the topic
    
    3. CONTEXT PREPARATION:
       - Combines all matching textbook chunks into a single context text
       - Format: "Chapter: X\nTopic: Y\nContent: Z\n---\n..."
    
    4. QUESTION GENERATION (FastAPI-only, Rule-based):
       For MCQ questions:
       - Extracts sentences and key terms from context
       - Creates questions based on difficulty:
         * Easy: Simple "What is X?" format
         * Medium: "According to the text, what is the primary aspect of X?"
         * Hard: "Which of the following best describes X?"
       - Generates 4 options (A, B, C, D)
       - Sets correct answer
       
       For Short questions:
       - Extracts key terms and definitions
       - Creates questions based on difficulty:
         * Easy: "Define X."
         * Medium: "Explain X and its importance."
         * Hard: "Explain the significance and role of X in detail."
       - Generates expected answer from context
    
    5. FORMATTING (FBISE Standards):
       - Formats questions according to FBISE board requirements
       - Validates question text length and format
       - Ensures MCQ has exactly 4 options (A-D)
       - Adds question marks if missing
    
    6. DATABASE SAVE:
       - Saves question to GeneratedQuestion table
       - Links question to source textbook chunks
       - Sets is_approved = "approved"
    
    7. RESPONSE:
       - Returns list of QuestionResponse objects
       - Includes question_id, question_text, options, correct_answer, etc.
    """)
    
    print("\n[TEST] TESTING DATABASE CONNECTION:")
    print("-" * 70)
    
    try:
        from app.database import AsyncSessionLocal, engine
        from app.models.subject import Subject
        from app.models.textbook_chunk import TextbookChunk
        from sqlalchemy import select, text
        
        # Test database connection
        print("Testing database connection...")
        async with AsyncSessionLocal() as session:
            # Test basic connection
            result = await session.execute(text("SELECT 1"))
            print("[OK] Database connection successful!")
            
            # Check for subjects
            result = await session.execute(select(Subject))
            subjects = result.scalars().all()
            print(f"[OK] Found {len(subjects)} subjects in database")
            if subjects:
                for subj in subjects[:3]:
                    print(f"  - Subject ID {subj.subject_id}: {subj.subject_name}")
            
            # Check for textbook chunks
            result = await session.execute(select(TextbookChunk))
            chunks = result.scalars().all()
            print(f"[OK] Found {len(chunks)} textbook chunks in database")
            if chunks:
                print(f"  - Sample topics: {', '.join(set([c.topic_name for c in chunks[:5]]))}")
            
            if not subjects:
                print("\n[WARNING] No subjects found in database!")
                print("   Question generation requires subjects to be set up first.")
            
            if not chunks:
                print("\n[WARNING] No textbook chunks found in database!")
                print("   Question generation requires textbook content to be loaded.")
                print("   Without chunks, questions cannot be generated.")
        
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        print("\n[TROUBLESHOOTING] TROUBLESHOOTING:")
        print("-" * 70)
        print("""
        The error suggests the database is not accessible. Check:
        
        1. Is PostgreSQL running?
        2. Check DATABASE_URL in app/.env file:
           DATABASE_URL=postgresql://username:password@localhost:5432/dbname
        
        3. Verify the database exists and is accessible
        4. Check if the database has the required tables:
           - subjects
           - textbook_chunks
           - generated_questions
        """)
        return
    
    print("\n[TEST] TESTING QUESTION GENERATION SERVICE:")
    print("-" * 70)
    
    try:
        from app.services.question_generation_service import QuestionGenerationService
        from app.schemas.generated_question import QuestionGenerationRequest
        
        async with AsyncSessionLocal() as session:
            service = QuestionGenerationService(session)
            
            # Check if we have data to test with
            if not subjects or not chunks:
                print("[WARNING] Cannot test generation - missing database data")
                print("   Please ensure subjects and textbook chunks are loaded first.")
                return
            
            # Try to generate a test question
            print("\nAttempting to generate test question...")
            print("Using first available subject and topic...")
            
            first_subject = subjects[0]
            first_chunk = chunks[0]
            
            test_request = QuestionGenerationRequest(
                subject_id=first_subject.subject_id,
                topic_name=first_chunk.topic_name,
                question_type="MCQ",
                difficulty_level="Medium",
                count=1
            )
            
            print(f"  Subject ID: {test_request.subject_id}")
            print(f"  Topic: {test_request.topic_name}")
            print(f"  Type: {test_request.question_type}")
            print(f"  Difficulty: {test_request.difficulty_level}")
            
            questions = await service.generate_questions(test_request)
            
            if questions:
                print(f"\n[SUCCESS] Generated {len(questions)} question(s)!\n")
                for i, q in enumerate(questions, 1):
                    print(f"Question {i}:")
                    print(f"  ID: {q.question_id}")
                    print(f"  Text: {q.question_text}")
                    print(f"  Type: {q.question_type}")
                    print(f"  Difficulty: {q.difficulty_level}")
                    if q.options:
                        print(f"  Options: {q.options}")
                    print(f"  Correct Answer: {q.correct_answer}")
                    print()
            else:
                print("✗ No questions were generated")
                
    except ValueError as e:
        print(f"✗ Generation failed (expected): {e}")
        print("   This usually means no textbook chunks match the topic.")
    except Exception as e:
        print(f"✗ Generation failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
    print("\n[INFO] To test via API:")
    print("   POST http://localhost:8000/api/v1/questions/generate")
    print("   Body: {")
    print('     "subject_id": 1,')
    print('     "topic_name": "Cell Structure",')
    print('     "question_type": "MCQ",')
    print('     "difficulty_level": "Medium",')
    print('     "count": 5')
    print("   }")


if __name__ == "__main__":
    asyncio.run(test_question_generation_flow())

