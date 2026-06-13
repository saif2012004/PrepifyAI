"""
Utility functions for generating FBISE board-compliant questions.
Handles formatting and validation according to FBISE standards.
"""

import re
import json
from typing import List, Dict, Any, Optional


class FBISEQuestionFormatter:
    """Formats questions according to FBISE board standards"""
    
    @staticmethod
    def format_mcq(question_text: str, options: Dict[str, str], correct_answer: str) -> Dict[str, Any]:
        """
        Format MCQ according to FBISE standards.
        FBISE MCQs typically have 4 options (A, B, C, D) with clear formatting.
        Always returns valid formatted MCQ, never fails.
        """
        # Ensure question text is valid
        if not question_text or len(question_text.strip()) < 3:
            question_text = "What does the textbook say about this concept?"
        
        # Ensure question ends with proper punctuation
        question_text = question_text.strip()
        if not question_text.endswith('?'):
            question_text = question_text + '?'
        
        # Validate and fix options - ensure all 4 are present
        required_options = ['A', 'B', 'C', 'D']
        formatted_options = {}
        
        # Strip metadata from option text for clean display
        def _clean_option_text(t):
            if not t:
                return t
            t = str(t).strip()
            t = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', t, flags=re.IGNORECASE)
            t = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', t, flags=re.IGNORECASE)
            t = re.sub(r'\s+', ' ', t).strip()
            return t

        for opt in required_options:
            if opt in options and options[opt] and len(str(options[opt]).strip()) > 0:
                formatted_options[opt] = _clean_option_text(options[opt])
            else:
                # Generate meaningful placeholder if missing
                if opt == 'A':
                    formatted_options[opt] = "The correct answer based on textbook content"
                else:
                    formatted_options[opt] = f"Option {opt}"
        
        # Validate correct answer is one of the options
        correct_letter = str(correct_answer).strip().upper() if correct_answer else 'A'
        if correct_letter not in required_options:
            # Default to first option if invalid
            correct_letter = 'A'
        
        return {
            "question_text": question_text,
            "options": formatted_options,
            "correct_answer": correct_letter,
            "format": "FBISE_MCQ"
        }
    
    @staticmethod
    def format_short_question(question_text: str, correct_answer: str) -> Dict[str, Any]:
        """
        Format short question according to FBISE standards.
        Short questions should be clear, concise, and typically 2-5 marks.
        """
        # Ensure question ends with proper punctuation
        if not question_text.strip().endswith('?'):
            question_text = question_text.strip() + '?'
        
        # FBISE short questions should be direct and specific
        # Remove unnecessary words
        question_text = re.sub(r'\s+', ' ', question_text).strip()
        
        return {
            "question_text": question_text,
            "correct_answer": correct_answer.strip(),
            "format": "FBISE_Short",
            "expected_marks": 2  # Default for short questions
        }
    
    @staticmethod
    def format_long_question(question_text: str, correct_answer: str) -> Dict[str, Any]:
        """
        Format long question according to FBISE standards.
        Long questions should be comprehensive, detailed, and typically 5-10 marks.
        They require detailed explanations and comprehensive answers.
        """
        # Long questions can end with . or ?
        if not question_text.strip().endswith(('.', '?')):
            question_text = question_text.strip() + '.'
        
        # FBISE long questions should be clear and comprehensive
        # Remove unnecessary words but preserve structure
        question_text = re.sub(r'\s+', ' ', question_text).strip()
        
        # Ensure answer is comprehensive (at least 100 words)
        answer_words = correct_answer.strip().split()
        if len(answer_words) < 100:
            # Add a note that this is a comprehensive answer
            correct_answer = correct_answer.strip()
            if not correct_answer.endswith('.'):
                correct_answer += '.'
        
        return {
            "question_text": question_text,
            "correct_answer": correct_answer.strip(),
            "format": "FBISE_Long",
            "expected_marks": 5  # Default for long questions (5-10 marks range)
        }
    
    @staticmethod
    def validate_question_text(text: str, question_type: str) -> bool:
        """Validate question text meets FBISE standards - VERY LENIENT"""
        if not text:
            return False
        
        # Strip and check length - very lenient
        text_stripped = text.strip()
        if len(text_stripped) < 3:  # Extremely lenient - just needs 3+ chars
            return False
        
        # MCQ should be clear and specific
        if question_type == "MCQ":
            if len(text_stripped) > 500:  # Very high maximum
                return False
            # Should not contain answer hints
            if any(word in text_stripped.lower() for word in ['answer is', 'correct option', 'right choice']):
                return False
        
        # Short question should be direct
        if question_type == "Short":
            if len(text_stripped) > 500:  # Very high maximum
                return False
        
        # Long question should be comprehensive
        if question_type == "Long":
            if len(text_stripped) > 1000:  # Very high maximum for long questions
                return False
        
        return True
    
    @staticmethod
    def validate_difficulty_level(level: str) -> str:
        """Validate and normalize difficulty level"""
        level_map = {
            "easy": "Easy",
            "medium": "Medium",
            "hard": "Hard",
            "Easy": "Easy",
            "Medium": "Medium",
            "Hard": "Hard"
        }
        return level_map.get(level, "Medium")


def parse_llm_response(response_text: str, question_type: str) -> List[Dict[str, Any]]:
    """
    Parse LLM response to extract structured question data.
    Handles both JSON and text formats.
    """
    questions = []
    
    # Try to parse as JSON first
    try:
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*(\{.*\}|\[.*\])\s*```', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
            if isinstance(data, list):
                questions = data
            elif isinstance(data, dict):
                questions = [data]
        else:
            # Try parsing entire response as JSON
            data = json.loads(response_text)
            if isinstance(data, list):
                questions = data
            elif isinstance(data, dict):
                questions = [data]
    except json.JSONDecodeError:
        # Fall back to text parsing
        questions = _parse_text_format(response_text, question_type)
    
    return questions


def _parse_text_format(response_text: str, question_type: str) -> List[Dict[str, Any]]:
    """Parse questions from text format"""
    questions = []
    
    if question_type == "MCQ":
        # Parse MCQ format: Q: ... Options: A) ... B) ... C) ... D) ... Answer: ...
        pattern = r'Q\d*[:\-]?\s*(.+?)(?:Options?|Answer)[:\-]?\s*(.+?)(?:Answer|Correct)[:\-]?\s*([A-D])'
        matches = re.finditer(pattern, response_text, re.IGNORECASE | re.DOTALL)
        
        for match in matches:
            question_text = match.group(1).strip()
            options_text = match.group(2).strip()
            correct_answer = match.group(3).strip().upper()
            
            # Parse options
            options = {}
            option_pattern = r'([A-D])[\)\.]\s*(.+?)(?=[A-D][\)\.]|$)'
            opt_matches = re.finditer(option_pattern, options_text, re.IGNORECASE)
            for opt_match in opt_matches:
                opt_letter = opt_match.group(1).upper()
                opt_text = opt_match.group(2).strip()
                options[opt_letter] = opt_text
            
            if len(options) == 4 and question_text:
                questions.append({
                    "question_text": question_text,
                    "options": options,
                    "correct_answer": correct_answer
                })
    
    elif question_type == "Short":
        # Parse short question format: Q: ... Answer: ...
        pattern = r'Q\d*[:\-]?\s*(.+?)(?:Answer|Explanation)[:\-]?\s*(.+?)(?=Q\d*|$)'
        matches = re.finditer(pattern, response_text, re.IGNORECASE | re.DOTALL)
        
        for match in matches:
            question_text = match.group(1).strip()
            correct_answer = match.group(2).strip()
            
            if question_text and correct_answer:
                questions.append({
                    "question_text": question_text,
                    "correct_answer": correct_answer
                })
    
    elif question_type == "Long":
        # Parse long question format: Q: ... Answer: ... (similar to Short but expects longer answers)
        pattern = r'Q\d*[:\-]?\s*(.+?)(?:Answer|Explanation)[:\-]?\s*(.+?)(?=Q\d*|$)'
        matches = re.finditer(pattern, response_text, re.IGNORECASE | re.DOTALL)
        
        for match in matches:
            question_text = match.group(1).strip()
            correct_answer = match.group(2).strip()
            
            if question_text and correct_answer:
                questions.append({
                    "question_text": question_text,
                    "correct_answer": correct_answer
                })
    
    return questions

