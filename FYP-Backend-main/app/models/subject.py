
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import Base

class Subject(Base):
    __tablename__ = "subjects"

    subject_id = Column(Integer, primary_key=True, index=True)
    class_level = Column(String(10), nullable=False)  # 9, 10, 11, 12
    board = Column(String(50), nullable=False)  # FBISE, Punjab Board, etc.
    subject_name = Column(String(100), nullable=False)  # Biology, Physics, etc.
    book_version = Column(String(20), nullable=False)  # 2023, 2024, etc.

    # Relationships
    textbook_chunks = relationship("TextbookChunk", back_populates="subject")
    generated_questions = relationship("GeneratedQuestion", back_populates="subject")
    past_papers = relationship("PastPaper", back_populates="subject")
    performance_records = relationship("StudentPerformance", back_populates="subject")
    predictions = relationship("Prediction", back_populates="subject")
    library_pdfs = relationship("SubjectBookPdf", back_populates="subject")
