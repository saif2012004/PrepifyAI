"""
Verify that textbook data was loaded into the database
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.database import AsyncSessionLocal
from app.models.subject import Subject
from app.models.textbook_chunk import TextbookChunk
from sqlalchemy import select, func

async def verify_data():
    """Verify textbook data is in the database"""
    print("=" * 70)
    print("VERIFYING DATABASE CONTENT")
    print("=" * 70)
    print()
    
    async with AsyncSessionLocal() as session:
        # Check subjects
        result = await session.execute(select(func.count(Subject.subject_id)))
        total_subjects = result.scalar() or 0
        print(f"Total Subjects in Database: {total_subjects}")
        
        if total_subjects > 0:
            result = await session.execute(select(Subject).limit(10))
            subjects = result.scalars().all()
            print("\nSample Subjects:")
            for subj in subjects:
                print(f"  ID {subj.subject_id}: {subj.subject_name} ({subj.board}, Class {subj.class_level})")
        print()
        
        # Check chunks
        result = await session.execute(select(func.count(TextbookChunk.chunk_id)))
        total_chunks = result.scalar() or 0
        print(f"Total Textbook Chunks in Database: {total_chunks}")
        
        if total_chunks > 0:
            # Group by subject
            result = await session.execute(
                select(
                    TextbookChunk.subject_id,
                    func.count(TextbookChunk.chunk_id).label('chunk_count')
                ).group_by(TextbookChunk.subject_id)
            )
            chunk_counts = result.all()
            
            print("\nChunks per Subject:")
            for subj_id, count in chunk_counts[:10]:
                result = await session.execute(
                    select(Subject).where(Subject.subject_id == subj_id)
                )
                subj = result.scalar_one_or_none()
                subj_name = subj.subject_name if subj else f"ID {subj_id}"
                print(f"  {subj_name} (ID {subj_id}): {count} chunks")
            
            # Sample chunks
            result = await session.execute(select(TextbookChunk).limit(3))
            sample_chunks = result.scalars().all()
            
            print("\nSample Chunks:")
            for chunk in sample_chunks:
                print(f"  Subject ID {chunk.subject_id}:")
                print(f"    Topic: '{chunk.topic_name}'")
                print(f"    Chapter: '{chunk.chapter_name}'")
                print(f"    Content length: {len(chunk.text_content)} chars")
                print()
        else:
            print("\n[WARNING] No chunks found in database!")
            print("The textbook data may not have been loaded correctly.")
        
        print("=" * 70)
        
        if total_chunks > 0 and total_subjects > 0:
            print("\n[SUCCESS] Database has content!")
            print("Question generation should work.")
            print("\nTry generating questions with:")
            print('  {"subject_name": "Biology", "topic_name": "any", "question_type": "MCQ", "difficulty_level": "Easy", "count": 2}')
        else:
            print("\n[ERROR] Database is empty or incomplete!")
            print("Please run: python load_textbooks.py")

if __name__ == "__main__":
    asyncio.run(verify_data())

