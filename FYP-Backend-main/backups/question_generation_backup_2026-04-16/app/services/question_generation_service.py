"""
Question Generation Service
Generates MCQs and Short questions from textbook content using FastAPI-only algorithms.
Formatted according to FBISE board standards.
No external AI/LLM APIs required - uses built-in FastAPI question generation.
"""

import json
import logging
import os
import random
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, insert, func

# Initialize logger first
logger = logging.getLogger(__name__)

# Try to import spellchecker, use fallback if not available
try:
    from spellchecker import SpellChecker
    SPELLCHECKER_AVAILABLE = True
except ImportError:
    SPELLCHECKER_AVAILABLE = False
    logger.warning("spellchecker library not available. Install with: pip install pyspellchecker")

from app.models.generated_question import GeneratedQuestion, question_chunks
from app.models.textbook_chunk import TextbookChunk
from app.models.subject import Subject
from app.schemas.generated_question import (
    QuestionGenerationRequest,
    QuestionCreate,
    QuestionResponse,
    ExamGenerationRequest,
    ExamGenerationResponse,
    ExamSectionResponse,
    ExamQuestionItem,
)
from app.utils.question_generator import (
    FBISEQuestionFormatter
)


class QuestionGenerationService:
    """Service for generating questions from textbook content"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.formatter = FBISEQuestionFormatter()
        # Initialize spell checker if available
        if SPELLCHECKER_AVAILABLE:
            self.spell_checker = SpellChecker()
            # Add common scientific/technical terms to dictionary
            self._add_technical_terms()
        else:
            self.spell_checker = None
        # FastAPI-only generation - no external APIs required
        logger.info("Question generation service initialized with FastAPI-only mode")
    
    def _add_technical_terms(self):
        """Add common scientific and technical terms to spell checker dictionary"""
        if not self.spell_checker:
            return
        
        # Common biology terms
        biology_terms = [
            'mitochondria', 'chloroplast', 'nucleus', 'ribosome', 'endoplasmic', 'reticulum',
            'golgi', 'lysosome', 'vacuole', 'cellulose', 'chitin', 'phospholipid',
            'chromosome', 'chromatin', 'dna', 'rna', 'atp', 'adp', 'nad', 'fad',
            'photosynthesis', 'respiration', 'glycolysis', 'krebs', 'calvin', 'cycle',
            'enzyme', 'substrate', 'catalyst', 'metabolism', 'homeostasis', 'osmosis',
            'diffusion', 'active', 'transport', 'passive', 'membrane', 'cytoplasm',
            'organelle', 'prokaryotic', 'eukaryotic', 'bacteria', 'virus', 'fungi',
            'protist', 'plantae', 'animalia', 'taxonomy', 'phylogeny', 'evolution',
            'mutation', 'gene', 'allele', 'genotype', 'phenotype', 'homozygous',
            'heterozygous', 'dominant', 'recessive', 'meiosis', 'mitosis'
        ]
        
        # Common chemistry terms
        chemistry_terms = [
            'atom', 'molecule', 'compound', 'element', 'ion', 'cation', 'anion',
            'proton', 'neutron', 'electron', 'isotope', 'valence', 'bonding',
            'covalent', 'ionic', 'metallic', 'hydrogen', 'bond', 'reaction',
            'reactant', 'product', 'catalyst', 'equilibrium', 'ph', 'acid',
            'base', 'salt', 'buffer', 'oxidation', 'reduction', 'redox',
            'molarity', 'mole', 'stoichiometry', 'thermodynamics', 'enthalpy',
            'entropy', 'gibbs', 'kinetics', 'rate', 'mechanism', 'organic',
            'inorganic', 'hydrocarbon', 'alkane', 'alkene', 'alkyne', 'alcohol',
            'aldehyde', 'ketone', 'carboxylic', 'ester', 'amine', 'amide'
        ]
        
        # Common physics terms
        physics_terms = [
            'force', 'velocity', 'acceleration', 'momentum', 'energy', 'kinetic',
            'potential', 'work', 'power', 'pressure', 'density', 'mass', 'weight',
            'gravity', 'friction', 'tension', 'normal', 'electric', 'magnetic',
            'field', 'charge', 'current', 'voltage', 'resistance', 'capacitance',
            'inductance', 'circuit', 'wave', 'frequency', 'wavelength', 'amplitude',
            'reflection', 'refraction', 'diffraction', 'interference', 'quantum',
            'photon', 'electron', 'proton', 'neutron', 'nucleus', 'atom'
        ]
        
        # Common mathematics/computer terms
        math_terms = [
            'algorithm', 'variable', 'function', 'equation', 'derivative', 'integral',
            'matrix', 'vector', 'scalar', 'polynomial', 'quadratic', 'linear',
            'exponential', 'logarithm', 'trigonometry', 'sine', 'cosine', 'tangent',
            'geometry', 'algebra', 'calculus', 'statistics', 'probability', 'permutation',
            'combination', 'factorial', 'binomial', 'theorem', 'proof', 'axiom'
        ]
        
        # Add all terms to spell checker
        all_terms = biology_terms + chemistry_terms + physics_terms + math_terms
        for term in all_terms:
            self.spell_checker.word_frequency.load_words([term])
    
    def _correct_spelling(self, text: str) -> str:
        """Correct spelling in text while preserving technical terms and spaces"""
        if not text:
            return text
        
        # FIRST: Fix text that already has spaces between letters (like "H e l l o")
        # Detect pattern: single letter followed by space followed by single letter
        # This fixes corrupted text where spaces were inserted between letters
        text = re.sub(r'\b([a-zA-Z])\s+([a-zA-Z])\s+', r'\1\2', text)
        # Handle remaining single-letter spaces (more aggressive fix)
        while re.search(r'\b([a-zA-Z])\s+([a-zA-Z])\b', text):
            text = re.sub(r'\b([a-zA-Z])\s+([a-zA-Z])\b', r'\1\2', text)
        
        # Normalize spaces - ensure single space between words
        text = re.sub(r'\s+', ' ', text).strip()
        
        if not self.spell_checker:
            return text
        
        # Split text into words, preserving spaces and punctuation
        # Use word boundaries to properly split words
        words = re.findall(r'\b\w+\b', text)
        non_words = re.findall(r'\s+|[^\w\s]', text)
        
        # Correct spelling of each word
        corrected_words = []
        for word in words:
            if word.lower() in self.spell_checker:
                # Word is correct
                corrected_words.append(word)
            else:
                # Try to get correction
                correction = self.spell_checker.correction(word.lower())
                if correction and correction != word.lower():
                    # Preserve original capitalization
                    if word[0].isupper():
                        correction = correction.capitalize()
                    if word.isupper():
                        correction = correction.upper()
                    corrected_words.append(correction)
                    logger.debug(f"Corrected spelling: '{word}' -> '{correction}'")
                else:
                    # No correction found, keep original (might be a technical term)
                    corrected_words.append(word)
        
        # Reconstruct text with proper spacing
        # Simple approach: join words with single spaces
        result = ' '.join(corrected_words)
        
        # Restore punctuation and spacing structure
        # Add spaces after punctuation if missing
        result = re.sub(r'([.,!?;:])([A-Za-z])', r'\1 \2', result)
        
        # Ensure single space between words
        result = re.sub(r'\s+', ' ', result).strip()
        
        return result
    
    def _fix_spacing_issues(self, text: str) -> str:
        """Fix spacing issues where spaces are inserted between letters within words"""
        if not text:
            return text
        
        # First, normalize all whitespace to single spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Split into tokens (words and punctuation)
        tokens = text.split()
        fixed_tokens = []
        i = 0
        
        while i < len(tokens):
            token = tokens[i]
            
            # If token is a single letter, check if it's part of a word broken by spaces
            if len(token) == 1 and token.isalpha():
                # Collect consecutive single letters that should form a word
                word_parts = [token]
                j = i + 1
                
                # Look ahead for consecutive single letters
                while j < len(tokens) and len(tokens[j]) == 1 and tokens[j].isalpha():
                    word_parts.append(tokens[j])
                    j += 1
                
                # If we found multiple single letters, join them into a word
                if len(word_parts) > 1:
                    fixed_word = ''.join(word_parts)
                    fixed_tokens.append(fixed_word)
                    i = j
                    continue
                else:
                    # Single letter that's not part of a broken word (like "a" or "I")
                    fixed_tokens.append(token)
                    i += 1
            else:
                # Regular word or punctuation - check if it has internal spaces
                if ' ' in token:
                    # Remove internal spaces (shouldn't happen after split, but just in case)
                    token = token.replace(' ', '')
                fixed_tokens.append(token)
                i += 1
        
        # Rejoin with single spaces
        result = ' '.join(fixed_tokens)
        
        # Ensure proper spacing after punctuation
        result = re.sub(r'([.,!?;:])([A-Za-z])', r'\1 \2', result)
        
        # Final normalization - ensure single space between words
        result = re.sub(r'\s+', ' ', result).strip()
        
        return result

    def _is_clean_text(self, text: str) -> bool:
        """
        Heuristic filter to reject obviously noisy/OCR-corrupted text.
        This is intentionally strict: we prefer fewer questions over low-quality ones.
        """
        if not text:
            return False
        t = str(text).strip()
        # Length bounds for good answers/sentences
        if len(t) < 25 or len(t) > 260:
            return False
        # Percentage of "weird" characters (not letter, digit, space, basic punctuation)
        import string
        allowed = set(string.ascii_letters + string.digits + " .,!?:;-'()[]/%")
        weird = sum(1 for ch in t if ch not in allowed)
        if weird / len(t) > 0.12:
            return False
        # Reject if too many tokens look like noise (more non-letters than letters)
        noisy_tokens = 0
        for token in t.split():
            letters = sum(1 for ch in token if ch.isalpha())
            non_letters = len(token) - letters
            if len(token) > 4 and non_letters > letters:
                noisy_tokens += 1
        if noisy_tokens >= 3:
            return False
        return True
    
    async def generate_questions(
        self,
        request: QuestionGenerationRequest
    ) -> List[QuestionResponse]:
        """
        Generate questions based on subject, topic, and requirements.
        
        Args:
            request: QuestionGenerationRequest with subject_id or subject_name, topic_name, etc.
        
        Returns:
            List of generated questions
        """
        try:
            # Get subject information - either by ID or by name
            subject = None
            if request.subject_id:
                subject = await self._get_subject(request.subject_id)
                if not subject:
                    raise ValueError(f"Subject with ID {request.subject_id} not found")
            elif request.subject_name:
                # Use board_name and class_level if provided for precise matching
                if request.board_name or request.class_level:
                    subject = await self._get_subject_by_name_and_board(
                        request.subject_name,
                        request.board_name,
                        request.class_level
                    )
                    if not subject:
                        board_info = f" (Board: {request.board_name})" if request.board_name else ""
                        class_info = f" (Class: {request.class_level})" if request.class_level else ""
                        raise ValueError(
                            f"Subject with name '{request.subject_name}'{board_info}{class_info} not found. "
                            f"Available subjects include: Biology, Chemistry, Physics, Mathematics, Computer Science, "
                            f"and entry-test subjects like ECAT (...), MDCAT (...). "
                            f"Please check board_name and class_level values."
                        )
                else:
                    # Fallback to name-only search
                    subject = await self._get_subject_by_name(request.subject_name)
                    if not subject:
                        raise ValueError(
                            f"Subject with name '{request.subject_name}' not found. "
                            f"Available subjects include: Biology, Chemistry, Physics, Mathematics, Computer Science, "
                            f"and entry-test subjects like ECAT (...), MDCAT (...). "
                            f"Tip: Provide board_name and class_level for precise matching."
                        )
            else:
                raise ValueError("Either subject_id or subject_name must be provided")
            
            # Use the resolved subject_id (from either ID or name lookup)
            resolved_subject_id = subject.subject_id
            
            # Get relevant textbook chunks for the topic
            chunks = await self._get_textbook_chunks(
                resolved_subject_id,
                request.topic_name
            )
            
            if not chunks:
                # Check if subject exists and has any chunks at all
                count_result = await self.db.execute(
                    select(func.count(TextbookChunk.chunk_id)).where(
                        TextbookChunk.subject_id == resolved_subject_id
                    )
                )
                total_chunks = count_result.scalar() or 0
                
                if total_chunks == 0:
                    raise ValueError(
                        f"Subject '{subject.subject_name}' (ID: {resolved_subject_id}, {subject.board}, Class {subject.class_level}) "
                        f"has no textbook content loaded. Please load textbook data for this subject first."
                    )
                else:
                    raise ValueError(
                        f"No textbook chunks found matching topic '{request.topic_name}' "
                        f"in subject '{subject.subject_name}' (ID: {resolved_subject_id}). "
                        f"Subject has {total_chunks} chunks total. "
                        f"Try a different topic name or check available topics."
                    )
            
            # Combine chunk content for context
            context_text = self._combine_chunks(chunks)
            
            # Generate questions using FastAPI-only generation (no external APIs)
            # Generate more questions than needed to account for validation failures
            # Optimized: Reduced from 3x to 2x and lower minimum to improve performance
            questions_to_generate = max(request.count * 2, request.count + 3)  # Generate 2x the requested count or count+3, whichever is higher
            raw_questions = self._generate_fastapi_questions(
                context_text=context_text,
                topic_name=request.topic_name,
                question_type=request.question_type,
                difficulty_level=request.difficulty_level,
                count=questions_to_generate,
                chunks=chunks  # Pass chunks for long questions
            )
            logger.info(f"Generated {len(raw_questions)} raw questions using FastAPI-only generation (requested {questions_to_generate})")
            
            if not raw_questions:
                raise ValueError(
                    f"Could not generate any raw questions for '{subject.subject_name}' (ID: {resolved_subject_id}), topic '{request.topic_name}'. "
                    f"Please check if the textbook content contains sufficient information for question generation."
                )
            
            # Format and validate questions
            formatted_questions = []
            chunk_ids = [chunk.chunk_id for chunk in chunks]
            
            # Extract topic names from chunks for validation
            chunk_topics = set(chunk.topic_name.lower() for chunk in chunks)
            requested_topic_normalized = request.topic_name.strip().lower()
            
            logger.info(f"Processing {len(raw_questions)} raw questions, need {request.count} valid questions")
            logger.info(f"Validating questions against topic '{request.topic_name}' (chunk topics: {chunk_topics})")
            
            # Try all generated questions, not just 5x count
            for raw_q in raw_questions:
                try:
                    # Pre-validate and FIX question text - NEVER skip, always fix
                    question_text = raw_q.get("question_text", "")
                    if not question_text or len(question_text.strip()) < 3:
                        logger.warning(f"Question text too short, fixing: {question_text[:50]}")
                        question_text = f"What does the textbook say about {request.topic_name}?"
                        raw_q["question_text"] = question_text
                    
                    # Correct spelling in question text
                    question_text = self._correct_spelling(question_text)
                    raw_q["question_text"] = question_text

                    # Hard filter: drop obviously noisy questions/answers instead of saving bad quality
                    if not self._is_clean_text(question_text):
                        logger.debug(f"Dropping question due to noisy text: {question_text[:80]}")
                        continue
                    
                    # Note: Topic relevance is checked during generation, not here
                    # We trust that generated questions are relevant since they come from topic-matched chunks
                    
                    # Ensure question has options for MCQ - FIX instead of skip
                    if request.question_type == "MCQ":
                        options = raw_q.get("options", {})
                        if not options or not isinstance(options, dict) or len(options) < 4:
                            logger.warning(f"MCQ missing options, fixing: {len(options) if options else 0} options")
                            # Create default options
                            raw_q["options"] = {
                                "A": "The correct answer based on textbook content",
                                "B": "An alternative option",
                                "C": "Another option",
                                "D": "None of the above"
                            }
                        else:
                            # Correct spelling in all options
                            corrected_options = {}
                            for key, value in options.items():
                                corrected_options[key] = self._correct_spelling(str(value))
                            raw_q["options"] = corrected_options
                    
                    # Ensure correct_answer exists
                    if "correct_answer" not in raw_q or not raw_q.get("correct_answer"):
                        raw_q["correct_answer"] = "A"
                    elif request.question_type == "Short":
                        # Correct spelling in short answer questions
                        raw_q["correct_answer"] = self._correct_spelling(raw_q["correct_answer"])

                    # Validate correct_answer quality where available
                    if raw_q.get("correct_answer") and not self._is_clean_text(raw_q["correct_answer"]):
                        logger.debug(f"Dropping question due to noisy answer: {str(raw_q['correct_answer'])[:80]}")
                        continue
                    
                    # Ensure explanation exists - use the correct answer or question content
                    if "explanation" not in raw_q or not raw_q.get("explanation"):
                        # Use the correct answer or question text as explanation
                        if raw_q.get("correct_answer") and len(str(raw_q["correct_answer"])) > 10:
                            raw_q["explanation"] = str(raw_q["correct_answer"])[:200]
                        elif request.question_type == "MCQ" and raw_q.get("options", {}).get("A"):
                            raw_q["explanation"] = str(raw_q["options"]["A"])[:200]
                        elif question_text and len(question_text) > 20:
                            raw_q["explanation"] = question_text[:200]
                        else:
                            raw_q["explanation"] = "This answer explains the concept based on the textbook material."
                    else:
                        # Correct spelling in explanation and remove "Based on textbook content" if present
                        explanation = raw_q["explanation"]
                        explanation = re.sub(r'^(Based on (the )?textbook content[^.]*\.?\s*)', '', explanation, flags=re.IGNORECASE)
                        explanation = re.sub(r'^(Generated from textbook content[^.]*\.?\s*)', '', explanation, flags=re.IGNORECASE)
                        raw_q["explanation"] = self._correct_spelling(explanation)
                    
                    # Log the raw question for debugging
                    logger.info(f"Processing raw question: {question_text[:100]}")
                    
                    formatted_q = self._format_question(
                        raw_q,
                        request.question_type,
                        request.difficulty_level,
                        resolved_subject_id,
                        chunk_ids,
                        request.topic_name  # Pass topic name for validation
                    )
                    
                    if formatted_q:
                        try:
                            # Save to database
                            db_question = await self._save_question(formatted_q)
                            try:
                                question_response = QuestionResponse.model_validate(db_question)
                                formatted_questions.append(question_response)
                                logger.info(f"Successfully formatted and saved question {len(formatted_questions)}/{request.count}")
                                
                                # Stop if we have enough questions
                                if len(formatted_questions) >= request.count:
                                    break
                            except Exception as validation_error:
                                logger.error(f"Failed to validate question response: {validation_error}")
                                # Still add the question even if validation fails
                                # Create response manually
                                import json
                                options_dict = None
                                if db_question.options:
                                    try:
                                        options_dict = json.loads(db_question.options)
                                    except:
                                        options_dict = {}
                                formatted_questions.append(QuestionResponse(
                                    question_id=db_question.question_id,
                                    subject_id=db_question.subject_id,
                                    question_text=db_question.question_text,
                                    question_type=db_question.question_type,
                                    difficulty_level=db_question.difficulty_level,
                                    correct_answer=db_question.correct_answer,
                                    explanation=db_question.explanation,
                                    options=options_dict,
                                    is_approved=db_question.is_approved,
                                    created_at=db_question.created_at
                                ))
                                logger.info(f"Successfully saved question (manual validation) {len(formatted_questions)}/{request.count}")
                                if len(formatted_questions) >= request.count:
                                    break
                        except Exception as save_error:
                            logger.error(f"Failed to save question to database: {save_error}")
                            import traceback
                            logger.error(f"Save error traceback: {traceback.format_exc()}")
                            # Don't continue - try to create a fallback question instead
                            pass
                    else:
                        # This should NEVER happen since _format_question always returns a valid question
                        logger.error(f"CRITICAL: Question formatting returned None. This should not happen!")
                        logger.error(f"Raw question data: question_text={raw_q.get('question_text', '')[:100]}, options={raw_q.get('options', {})}, correct_answer={raw_q.get('correct_answer', '')}")
                        # Force create a question - this is a last resort
                        try:
                            # Create a guaranteed valid question
                            forced_q = {
                                "question_text": f"What does the textbook say about {request.topic_name}?",
                                "options": {
                                    "A": "The correct answer based on textbook content",
                                    "B": "An alternative option",
                                    "C": "Another option",
                                    "D": "None of the above"
                                },
                                "correct_answer": "A",
                                "explanation": f"Generated from textbook content about {request.topic_name}"
                            }
                            # Format it directly without going through _format_question
                            forced_formatted = QuestionCreate(
                                subject_id=resolved_subject_id,
                                question_text=forced_q["question_text"],
                                question_type=request.question_type,
                                difficulty_level=request.difficulty_level,
                                options=forced_q["options"] if request.question_type == "MCQ" else None,
                                correct_answer=forced_q["correct_answer"],
                                explanation=forced_q["explanation"],
                                source_chunk_ids=chunk_ids
                            )
                            db_question = await self._save_question(forced_formatted)
                            formatted_questions.append(
                                QuestionResponse.model_validate(db_question)
                            )
                            logger.warning(f"Created forced question {len(formatted_questions)}/{request.count} due to formatting failure")
                            if len(formatted_questions) >= request.count:
                                break
                        except Exception as forced_error:
                            logger.error(f"Even forced question creation failed: {forced_error}")
                            import traceback
                            logger.error(f"Forced question error traceback: {traceback.format_exc()}")
                            # Don't continue - we've exhausted all options
                            pass
                except Exception as e:
                    logger.error(f"Failed to process question: {e}. Question text: {raw_q.get('question_text', '')[:50]}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    # Try to create a fallback question even if processing failed
                    try:
                        topic_display = request.topic_name if request.topic_name.lower() != "any" else "this subject"
                        emergency_q = QuestionCreate(
                            subject_id=resolved_subject_id,
                            question_text=f"What does the textbook say about {topic_display}?",
                            question_type=request.question_type,
                            difficulty_level=request.difficulty_level,
                            options={
                                "A": f"Information about {topic_display}",
                                "B": "An alternative option",
                                "C": "Another option",
                                "D": "None of the above"
                            } if request.question_type == "MCQ" else None,
                            correct_answer="A" if request.question_type == "MCQ" else f"{topic_display} is discussed in the textbook.",
                            explanation=f"Generated from textbook content about {topic_display}",
                            source_chunk_ids=chunk_ids[:1] if chunk_ids else []
                        )
                        db_q = await self._save_question(emergency_q)
                        import json
                        opts = json.loads(db_q.options) if db_q.options else {}
                        formatted_questions.append(QuestionResponse(
                            question_id=db_q.question_id,
                            subject_id=db_q.subject_id,
                            question_text=db_q.question_text,
                            question_type=db_q.question_type,
                            difficulty_level=db_q.difficulty_level,
                            correct_answer=db_q.correct_answer,
                            explanation=db_q.explanation,
                            options=opts,
                            is_approved=db_q.is_approved,
                            created_at=db_q.created_at
                        ))
                        logger.info(f"Created emergency question from exception handler: {len(formatted_questions)}/{request.count}")
                        if len(formatted_questions) >= request.count:
                            break
                    except Exception as emergency_ex:
                        logger.error(f"Emergency question creation also failed: {emergency_ex}")
                    continue
            
            # If we still don't have enough questions, create minimal valid questions as last resort
            if len(formatted_questions) < request.count:
                logger.warning(f"Only generated {len(formatted_questions)}/{request.count} questions. Creating fallback questions...")
                questions_needed = request.count - len(formatted_questions)
                
                for i in range(questions_needed):
                    try:
                        # Create a simple but valid question
                        topic_display = request.topic_name if request.topic_name.lower() != "any" else "this subject"
                        fallback_question = QuestionCreate(
                            subject_id=resolved_subject_id,
                            question_text=f"What does the textbook say about {topic_display}?",
                            question_type=request.question_type,
                            difficulty_level=request.difficulty_level,
                            options={
                                "A": f"Information about {topic_display} as described in the textbook",
                                "B": "An alternative explanation",
                                "C": "A different concept",
                                "D": "None of the above"
                            } if request.question_type == "MCQ" else None,
                            correct_answer="A" if request.question_type == "MCQ" else f"{topic_display} is discussed in the textbook with specific characteristics and functions.",
                            explanation=f"Generated from textbook content about {topic_display}",
                            source_chunk_ids=chunk_ids[:1] if chunk_ids else []  # Use at least one chunk
                        )
                        db_question = await self._save_question(fallback_question)
                        try:
                            formatted_questions.append(
                                QuestionResponse.model_validate(db_question)
                            )
                        except:
                            # Manual validation if model_validate fails
                            import json
                            options_dict = None
                            if db_question.options:
                                try:
                                    options_dict = json.loads(db_question.options)
                                except:
                                    options_dict = {}
                            formatted_questions.append(QuestionResponse(
                                question_id=db_question.question_id,
                                subject_id=db_question.subject_id,
                                question_text=db_question.question_text,
                                question_type=db_question.question_type,
                                difficulty_level=db_question.difficulty_level,
                                correct_answer=db_question.correct_answer,
                                explanation=db_question.explanation,
                                options=options_dict,
                                is_approved=db_question.is_approved,
                                created_at=db_question.created_at
                            ))
                        logger.info(f"Created fallback question {len(formatted_questions)}/{request.count}")
                    except Exception as fallback_error:
                        logger.error(f"Failed to create fallback question {i+1}: {fallback_error}")
                        import traceback
                        logger.error(f"Fallback error traceback: {traceback.format_exc()}")
                        # Continue trying to create more fallback questions
                        continue
            
            # Final check - if we still have no questions, create at least one guaranteed question
            if not formatted_questions:
                logger.error(f"CRITICAL: No questions created after all attempts. Creating emergency question...")
                try:
                    topic_display = request.topic_name if request.topic_name.lower() != "any" else subject.subject_name
                    emergency_question = QuestionCreate(
                        subject_id=resolved_subject_id,
                        question_text=f"What is {topic_display}?",
                        question_type=request.question_type,
                        difficulty_level=request.difficulty_level,
                        options={
                            "A": f"{topic_display} is a topic covered in the textbook",
                            "B": "An alternative topic",
                            "C": "A different subject",
                            "D": "None of the above"
                        } if request.question_type == "MCQ" else None,
                        correct_answer="A" if request.question_type == "MCQ" else f"{topic_display} is an important topic in the curriculum.",
                        explanation=f"Question generated for {topic_display}",
                        source_chunk_ids=chunk_ids[:1] if chunk_ids else []
                    )
                    db_question = await self._save_question(emergency_question)
                    import json
                    options_dict = None
                    if db_question.options:
                        try:
                            options_dict = json.loads(db_question.options)
                        except:
                            options_dict = {}
                    formatted_questions.append(QuestionResponse(
                        question_id=db_question.question_id,
                        subject_id=db_question.subject_id,
                        question_text=db_question.question_text,
                        question_type=db_question.question_type,
                        difficulty_level=db_question.difficulty_level,
                        correct_answer=db_question.correct_answer,
                        explanation=db_question.explanation,
                        options=options_dict,
                        is_approved=db_question.is_approved,
                        created_at=db_question.created_at
                    ))
                    logger.warning(f"Created emergency question: {len(formatted_questions)} question(s)")
                except Exception as emergency_error:
                    logger.error(f"Even emergency question creation failed: {emergency_error}")
                    import traceback
                    logger.error(f"Emergency error traceback: {traceback.format_exc()}")
            
            if not formatted_questions:
                logger.error(f"No questions could be formatted from {len(raw_questions)} raw questions. Subject: {subject.subject_name} (ID: {resolved_subject_id}), Topic: {request.topic_name}")
                raise ValueError(
                    f"Could not generate valid questions for '{subject.subject_name}' (ID: {resolved_subject_id}, {subject.board}, Class {subject.class_level}), topic '{request.topic_name}'. "
                    f"Generated {len(raw_questions)} raw questions but none passed validation. "
                    f"Please check if the textbook content is suitable for question generation."
                )
            
            logger.info(f"Successfully generated {len(formatted_questions)} questions for {subject.subject_name}, topic '{request.topic_name}'")
            return formatted_questions
            
        except ValueError as e:
            logger.error(f"Validation error generating questions: {e}")
            raise
        except Exception as e:
            logger.error(f"Error generating questions: {e}", exc_info=True)
            raise

    # Exam-style (past paper) section presets for preparation
    EXAM_PRESETS = {
        "FBISE_Matric": [
            {"section_name": "Section A", "instruction": "Choose the correct option. Each question carries 1 mark.", "question_type": "MCQ", "count": 12, "marks_per_question": 1.0, "difficulty_level": "Medium"},
            {"section_name": "Section B", "instruction": "Answer the following short questions. Each question carries 2 marks.", "question_type": "Short", "count": 8, "marks_per_question": 2.0, "difficulty_level": "Medium"},
            {"section_name": "Section C", "instruction": "Answer the following long questions. Each question carries 5 marks.", "question_type": "Long", "count": 2, "marks_per_question": 5.0, "difficulty_level": "Hard"},
        ],
        "FBISE_FSc": [
            {"section_name": "Section A", "instruction": "Choose the correct option. Each question carries 1 mark.", "question_type": "MCQ", "count": 17, "marks_per_question": 1.0, "difficulty_level": "Medium"},
            {"section_name": "Section B", "instruction": "Answer the following short questions. Each question carries 2 marks.", "question_type": "Short", "count": 8, "marks_per_question": 2.0, "difficulty_level": "Medium"},
            {"section_name": "Section C", "instruction": "Answer the following long questions. Each question carries 5 marks.", "question_type": "Long", "count": 3, "marks_per_question": 5.0, "difficulty_level": "Hard"},
        ],
        "MDCAT": [
            {"section_name": "Section A", "instruction": "Choose the correct option. Each question carries 1 mark.", "question_type": "MCQ", "count": 20, "marks_per_question": 1.0, "difficulty_level": "Medium"},
            {"section_name": "Section B", "instruction": "Short questions. Each carries 2 marks.", "question_type": "Short", "count": 5, "marks_per_question": 2.0, "difficulty_level": "Medium"},
        ],
        "ECAT": [
            {"section_name": "Section A", "instruction": "Choose the correct option. Each question carries 1 mark.", "question_type": "MCQ", "count": 18, "marks_per_question": 1.0, "difficulty_level": "Medium"},
            {"section_name": "Section B", "instruction": "Short questions. Each carries 2 marks.", "question_type": "Short", "count": 6, "marks_per_question": 2.0, "difficulty_level": "Medium"},
        ],
    }

    async def generate_exam(self, request: ExamGenerationRequest) -> ExamGenerationResponse:
        """Generate a full practice exam in past-paper style (e.g. 2022 board format)."""
        preset = self.EXAM_PRESETS.get(request.exam_type) or self.EXAM_PRESETS["FBISE_Matric"]
        board = (request.board_name or "FBISE").strip() or "FBISE"
        class_level = (request.class_level or "10").strip() or "10"
        subject_name = request.subject_name.strip()
        topic_name = (request.topic_name or "any").strip() or "any"

        sections_out: List[ExamSectionResponse] = []
        total_marks = 0.0

        for spec in preset:
            section_name = spec["section_name"]
            instruction = spec["instruction"]
            question_type = spec["question_type"]
            count = spec["count"]
            marks_per = spec["marks_per_question"]
            difficulty = spec["difficulty_level"]

            gen_req = QuestionGenerationRequest(
                subject_name=subject_name,
                board_name=board,
                class_level=class_level,
                topic_name=topic_name,
                question_type=question_type,
                difficulty_level=difficulty,
                count=min(count, 20),
            )
            try:
                questions_list = await self.generate_questions(gen_req)
            except Exception as e:
                logger.warning(f"Exam section {section_name}: generated fewer questions: {e}")
                questions_list = []

            items = []
            for i, q in enumerate(questions_list, 1):
                items.append(ExamQuestionItem(
                    question_number=i,
                    question_text=q.question_text,
                    question_type=q.question_type,
                    marks=marks_per,
                    options=q.options,
                    correct_answer=q.correct_answer,
                ))
            section_marks = len(items) * marks_per
            total_marks += section_marks
            sections_out.append(ExamSectionResponse(
                section_name=section_name,
                instruction=instruction,
                question_type=question_type,
                marks_per_question=marks_per,
                questions=items,
            ))

        title = f"{board} {subject_name} – Class {class_level} – Practice Exam"
        if topic_name != "any":
            title += f" ({topic_name})"

        return ExamGenerationResponse(
            title=title,
            board=board,
            subject_name=subject_name,
            class_level=class_level,
            topic_name=topic_name,
            total_marks=total_marks,
            sections=sections_out,
        )

    async def _get_subject(self, subject_id: int) -> Optional[Subject]:
        """Get subject by ID"""
        result = await self.db.execute(
            select(Subject).where(Subject.subject_id == subject_id)
        )
        return result.scalar_one_or_none()
    
    async def _get_subject_by_name(self, subject_name: str) -> Optional[Subject]:
        """Resolve by subject name only (ambiguous if multiple boards/classes exist)."""
        normalized_name = subject_name.strip().title()
        result = await self.db.execute(
            select(Subject)
            .where(Subject.subject_name.ilike(normalized_name))
            .order_by(Subject.subject_id.asc())
        )
        rows = list(result.scalars().all())
        logger.info(
            "subject_query name-only (exact ilike): subject_name=%r -> %d row(s)",
            subject_name,
            len(rows),
        )
        if len(rows) == 0:
            result = await self.db.execute(
                select(Subject)
                .where(Subject.subject_name.ilike(f"%{normalized_name}%"))
                .order_by(Subject.subject_id.asc())
                .limit(40)
            )
            rows = list(result.scalars().all())
            logger.info(
                "subject_query name-only (partial ilike): subject_name=%r -> %d row(s)",
                subject_name,
                len(rows),
            )
        if len(rows) == 0:
            return None
        if len(rows) > 1:
            logger.error(
                "Duplicate subject entries detected for name-only lookup subject=%r ids=%s",
                subject_name,
                [r.subject_id for r in rows],
            )
            raise ValueError(
                f"Duplicate subject entries detected for board=(unspecified), class=(unspecified), subject={subject_name!r}. "
                f"Provide board_name and class_level. Matched subject_ids: {[r.subject_id for r in rows]}"
            )
        return rows[0]

    async def _get_subject_by_name_and_board(
        self,
        subject_name: str,
        board_name: Optional[str] = None,
        class_level: Optional[str] = None,
    ) -> Optional[Subject]:
        """Match by board + class + subject name when possible; avoids scalar_one multi-row crashes."""
        from app.utils.subject_query import resolve_subject_triple

        normalized_name = subject_name.strip().title()
        normalized_board = board_name.strip() if board_name else None

        normalized_class: Optional[str] = None
        if class_level:
            class_str = str(class_level).strip().lower()
            match = re.search(r"\d+", class_str)
            if match:
                normalized_class = match.group(0)

        if normalized_board and normalized_class and normalized_name:
            sub = await resolve_subject_triple(
                self.db,
                board=normalized_board,
                class_level=normalized_class,
                subject_name=normalized_name,
            )
            if sub:
                return sub
            # Fall through to ilike-based search (board casing / spacing in DB)
            conditions = [
                Subject.subject_name.ilike(normalized_name),
                Subject.board.ilike(normalized_board.strip()),
                or_(
                    Subject.class_level == normalized_class,
                    Subject.class_level.ilike(f"%{normalized_class}%"),
                    Subject.class_level == f"class{normalized_class}",
                    Subject.class_level == f"Class {normalized_class}",
                ),
            ]
            result = await self.db.execute(
                select(Subject).where(and_(*conditions)).order_by(Subject.subject_id.asc())
            )
            rows = list(result.scalars().all())
            logger.info(
                "subject_query ilike triple: name=%r board=%r class=%r -> %d row(s)",
                subject_name,
                board_name,
                class_level,
                len(rows),
            )
            if len(rows) == 1:
                return rows[0]
            if len(rows) > 1:
                logger.error(
                    "Duplicate subject entries detected for board=%r, class=%r, subject=%r ids=%s",
                    board_name,
                    class_level,
                    subject_name,
                    [r.subject_id for r in rows],
                )
                raise ValueError(
                    f"Duplicate subject entries detected for board={board_name!r}, class={class_level!r}, "
                    f"subject={subject_name!r}. Matched subject_ids: {[r.subject_id for r in rows]}"
                )
            return None

        # Board + name (no class): narrow list; multiple rows => ask for class
        if normalized_board and normalized_name and not normalized_class:
            result = await self.db.execute(
                select(Subject)
                .where(
                    Subject.subject_name.ilike(normalized_name),
                    Subject.board.ilike(normalized_board.strip()),
                )
                .order_by(Subject.subject_id.asc())
            )
            rows = list(result.scalars().all())
            logger.info(
                "subject_query board+name: name=%r board=%r -> %d row(s)",
                subject_name,
                board_name,
                len(rows),
            )
            if len(rows) == 1:
                return rows[0]
            if len(rows) > 1:
                raise ValueError(
                    f"Multiple subject catalog rows for board={board_name!r} and subject={subject_name!r}. "
                    f"Provide class_level. subject_ids: {[r.subject_id for r in rows]}"
                )
            return None

        return None
    
    async def _get_textbook_chunks(
        self,
        subject_id: int,
        topic_name: str
    ) -> List[TextbookChunk]:
        """Get textbook chunks for a specific topic with improved matching"""
        # First, check if any chunks exist for this subject at all
        count_result = await self.db.execute(
            select(func.count(TextbookChunk.chunk_id)).where(
                TextbookChunk.subject_id == subject_id
            )
        )
        total_chunks = count_result.scalar() or 0
        
        if total_chunks == 0:
            logger.warning(f"No chunks found for subject_id {subject_id} at all")
            return []
        
        logger.info(f"Found {total_chunks} total chunks for subject_id {subject_id}, searching for '{topic_name}'")
        
        # Normalize topic name for matching
        topic_normalized = topic_name.strip().lower()
        
        # If topic is "any", get random chunks from the subject
        if topic_normalized == "any":
            logger.info(f"Topic is 'any', getting random chunks from subject {subject_id}")
            result = await self.db.execute(
                select(TextbookChunk).where(
                    TextbookChunk.subject_id == subject_id
                ).limit(30)
            )
            chunks = result.scalars().all()
            logger.info(f"Found {len(chunks)} chunks for 'any' topic")
            chunks_list = list(chunks)
            random.shuffle(chunks_list)
            return chunks_list[:30]
        
        # Priority-based matching: Try exact matches first, then partial matches
        # Priority 1: Exact topic_name match (case-insensitive)
        result = await self.db.execute(
            select(TextbookChunk).where(
                and_(
                    TextbookChunk.subject_id == subject_id,
                    TextbookChunk.topic_name.ilike(topic_name)
                    )
            ).limit(30)
        )
        chunks = result.scalars().all()
        
        if chunks:
            logger.info(f"Found {len(chunks)} chunks with exact topic_name match for '{topic_name}'")
            chunks_list = list(chunks)
            random.shuffle(chunks_list)
            return chunks_list[:30]
        
        # Priority 2: Topic name contains the search term (more specific)
        result = await self.db.execute(
            select(TextbookChunk).where(
                and_(
                    TextbookChunk.subject_id == subject_id,
                    TextbookChunk.topic_name.ilike(f"%{topic_name}%")
                )
            ).limit(30)
        )
        chunks = result.scalars().all()
        
        if chunks:
            logger.info(f"Found {len(chunks)} chunks with topic_name containing '{topic_name}'")
            chunks_list = list(chunks)
            random.shuffle(chunks_list)
            return chunks_list[:30]
        
        # Priority 3: Chapter name contains the search term
        result = await self.db.execute(
            select(TextbookChunk).where(
                and_(
                    TextbookChunk.subject_id == subject_id,
                    TextbookChunk.chapter_name.ilike(f"%{topic_name}%")
                )
            ).limit(30)
        )
        chunks = result.scalars().all()
        
        if chunks:
            logger.info(f"Found {len(chunks)} chunks with chapter_name containing '{topic_name}'")
            chunks_list = list(chunks)
            random.shuffle(chunks_list)
            return chunks_list[:30]
        
        # Priority 4: Text content contains the topic (but prioritize chunks where topic appears early)
        # Split topic into words for better matching
        topic_words = [w.strip() for w in topic_name.split() if len(w.strip()) > 2]
        
        if topic_words:
            # Build conditions for each word
            word_conditions = []
            for word in topic_words:
                word_conditions.append(TextbookChunk.text_content.ilike(f"%{word}%"))
            
            result = await self.db.execute(
                select(TextbookChunk).where(
                    and_(
                        TextbookChunk.subject_id == subject_id,
                        or_(*word_conditions)
                    )
                ).limit(50)  # Get more to filter by relevance
            )
            all_chunks = result.scalars().all()
            
            # Score chunks by how many topic words they contain
            scored_chunks = []
            for chunk in all_chunks:
                content_lower = chunk.text_content.lower()
                score = sum(1 for word in topic_words if word.lower() in content_lower)
                # Bonus if topic appears in topic_name or chapter_name
                if chunk.topic_name.lower().find(topic_normalized) != -1:
                    score += 3
                if chunk.chapter_name.lower().find(topic_normalized) != -1:
                    score += 2
                scored_chunks.append((score, chunk))
            
            # Sort by score (highest first) and take top 30
            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            chunks = [chunk for score, chunk in scored_chunks if score > 0][:30]
            
            if chunks:
                logger.info(f"Found {len(chunks)} chunks with text_content matching topic words '{topic_words}'")
                chunks_list = list(chunks)
                random.shuffle(chunks_list)
                return chunks_list[:30]
        
        # If still no matches, log warning and return empty
        logger.warning(f"No chunks found matching topic '{topic_name}' for subject_id {subject_id}")
        return []
    
    def _combine_chunks(self, chunks: List[TextbookChunk]) -> str:
        """Combine multiple chunks into context text with topic information preserved"""
        combined = []
        for chunk in chunks:
            # Include topic and chapter information prominently
            combined.append(
                f"Chapter: {chunk.chapter_name}\n"
                f"Topic: {chunk.topic_name}\n"
                f"Content: {chunk.text_content}\n"
            )
        # Add a header with topic information if all chunks share the same topic
        if chunks:
            unique_topics = set(chunk.topic_name for chunk in chunks)
            if len(unique_topics) == 1:
                topic_header = f"Topic: {chunks[0].topic_name}\n"
                return topic_header + "\n---\n".join(combined)
        return "\n---\n".join(combined)
    
    def _generate_fastapi_questions(
        self,
        context_text: str,
        topic_name: str,
        question_type: str,
        difficulty_level: str,
        count: int,
        chunks: Optional[List] = None
    ) -> List[Dict[str, Any]]:
        """
        FastAPI-only question generation (no external API required).
        Uses rule-based algorithms to generate FBISE-compliant questions.
        Strongly tied to topic and subject with improved relevance filtering.
        """
        import re
        
        questions = []
        used_sentences = set()  # Track used sentences to avoid duplicates
        
        # Extract meaningful sentences (cap for efficiency)
        raw_sentences = [s.strip() for s in re.split(r'[.!?]\s+', context_text) if len(s.strip()) > 30 and len(s.strip()) < 300]
        all_sentences = raw_sentences[:150]  # Score at most 150 sentences for speed
        
        # Build comprehensive topic keywords for better matching
        topic_keywords = []
        topic_normalized = topic_name.strip().lower()
        
        if topic_normalized != "any":
            # Add the full topic name
            topic_keywords.append(topic_normalized)
            
            # Split into words and add variations
            words = topic_normalized.split()
            for word in words:
                if len(word) > 2:  # Only meaningful words
                    topic_keywords.append(word)
                    # Handle plurals
                    if word.endswith('s') and len(word) > 3:
                        topic_keywords.append(word[:-1])  # Remove plural
                    elif len(word) > 3:
                        topic_keywords.append(word + 's')  # Add plural
                    # Handle common variations
                    if word.endswith('y'):
                        topic_keywords.append(word[:-1] + 'ies')  # e.g., "theory" -> "theories"
                    if word.endswith('ion'):
                        topic_keywords.append(word[:-3] + 'ions')  # e.g., "function" -> "functions"
            
            # Remove duplicates while preserving order
            seen = set()
            topic_keywords = [kw for kw in topic_keywords if kw not in seen and not seen.add(kw)]
        
        # Score and separate sentences by topic relevance
        scored_sentences = []
        
        for sentence in all_sentences:
            sentence_lower = sentence.lower()
            score = 0
            
            # Check topic keyword matches
            if topic_keywords:
                for keyword in topic_keywords:
                    if keyword in sentence_lower and len(keyword) > 2:
                        # Higher score for longer/more specific keywords
                        score += len(keyword) * 2
                        # Bonus if keyword appears early in sentence
                        if sentence_lower.find(keyword) < 50:
                            score += 5
            
            # Check for educational content indicators
            educational_indicators = ['is', 'are', 'means', 'refers to', 'defined as', 
                                     'consists of', 'contains', 'explain', 'describe', 
                                     'function', 'structure', 'process', 'type', 'form',
                                     'characteristic', 'property', 'component', 'feature']
            has_educational_content = any(word in sentence_lower[:100] for word in educational_indicators)
            
            if has_educational_content:
                score += 2
            
            # Strongly prefer definitional sentences (best for clear MCQs/short answers)
            has_definition_pattern = (
                re.search(r'^[A-Za-z][a-z]*\s+(is|are|means|refers to|defined as|consists of)\s+', sentence_lower)
                or ' is ' in sentence_lower[:70] or ' are ' in sentence_lower[:70] or ' means ' in sentence_lower[:70]
            )
            if has_definition_pattern:
                score += 8
            
            # Penalize sentences that are too short or too long (not good for questions)
            word_count = len(sentence.split())
            if word_count < 5:
                score -= 5  # Too short
            elif word_count > 50:
                score -= 2  # Too long, harder to extract concepts
            elif 8 <= word_count <= 25:
                score += 3  # Ideal length for questions
            
            # Penalize sentences with metadata patterns (Chapter, Topic, Content)
            if re.search(r'^Chapter\s+|^Topic\s+|^Content\s+', sentence, re.IGNORECASE):
                score -= 3
            
            # Bonus for sentences with proper nouns (likely concepts)
            proper_nouns = re.findall(r'\b[A-Z][a-z]+\b', sentence)
            if len(proper_nouns) >= 1 and len(proper_nouns) <= 5:
                score += 2  # Good number of concepts
            
            # Only include sentences that are relevant to the topic (unless topic is "any")
            if topic_normalized == "any":
                # For "any" topic, be more lenient - include sentences with educational content OR reasonable length
                # This ensures we have sentences to work with even if they don't match specific indicators
                if has_educational_content or (word_count >= 5 and word_count <= 50 and score >= -2):
                    scored_sentences.append((score, sentence))
            else:
                # Must have some topic relevance
                if score > 0:
                    scored_sentences.append((score, sentence))
        
        # Sort by relevance score (highest first)
        scored_sentences.sort(key=lambda x: x[0], reverse=True)
        
        # Extract top sentences (prioritize topic-relevant ones)
        # For "any" topic, get more sentences to ensure we have enough to work with
        if topic_normalized == "any":
            sentences = [sentence for score, sentence in scored_sentences[:max(count * 3, 20)]]
        else:
            # Optimized: Reduced from count * 3 to count * 2 for better performance
            sentences = [sentence for score, sentence in scored_sentences[:max(count * 2, 15)]]
        
        # Shuffle to add variety while maintaining relevance
        random.shuffle(sentences)
        
        # Ensure we have sentences to work with
        if not sentences:
            # Fallback: create sentences from chunks of the context
            sentences = [context_text[i:i+200] for i in range(0, min(len(context_text), 1000), 200) if context_text[i:i+200].strip()]
            random.shuffle(sentences)
        
        # Extract key terms (capitalized words, technical terms) - prioritize topic-related
        all_key_terms = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', context_text)
        all_key_terms = list(set([term for term in all_key_terms if len(term) > 3]))
        
        # Score key terms by topic relevance
        scored_terms = []
        for term in all_key_terms:
            term_lower = term.lower()
            score = 0
            if topic_keywords:
                for keyword in topic_keywords:
                    if keyword in term_lower or term_lower in keyword:
                        score += 10
            scored_terms.append((score, term))
        
        # Sort by relevance and take top terms
        scored_terms.sort(key=lambda x: x[0], reverse=True)
        key_terms = [term for score, term in scored_terms[:20]]
        
        # If we don't have enough topic-related terms, add more general ones
        if len(key_terms) < 10:
            remaining_terms = [term for score, term in scored_terms[20:] if score == 0]
            random.shuffle(remaining_terms)
            key_terms.extend(remaining_terms[:10])
        
        random.shuffle(key_terms)
        
        # Extract definitions (sentences with "is", "are", "means", etc.) - prioritize topic-related
        definitions = [s for score, s in scored_sentences if any(word in s.lower()[:50] for word in ['is', 'are', 'means', 'refers to', 'defined as', 'consists of'])][:10]
        random.shuffle(definitions)
        
        # Generate questions - ensure we have at least 1 iteration even if no sentences
        if not sentences:
            # Split context into chunks if no sentences found
            sentences = [context_text[i:i+200] for i in range(0, min(len(context_text), 2000), 200) if context_text[i:i+200].strip()]
        if not sentences:
            sentences = [context_text[:300] if len(context_text) > 300 else context_text]
        
        questions_generated = 0
        sentence_index = 0
        max_iterations = min(count * 6, 60)  # Enough iterations for quality; cap to avoid timeouts
        iterations = 0
        # Track generated question texts to prevent duplicates
        generated_question_texts = set()  # Store normalized question texts to avoid duplicates
        
        # Generate questions until we have enough
        while questions_generated < count and iterations < max_iterations:
            iterations += 1
            
            # Cycle through sentences if we've gone through all of them
            if sentence_index >= len(sentences):
                sentence_index = 0
                # Optimized: Early exit if we've cycled through all sentences multiple times
                # Be more lenient - allow more iterations before giving up
                if iterations > max(len(sentences) * 3, 20):
                    # If we have some questions, return them; otherwise continue trying
                    if questions_generated > 0:
                        break
                    # If no questions yet, try a few more iterations with different sentences
                    if iterations > max(len(sentences) * 5, 30):
                        break
            
            sentence = sentences[sentence_index]
            sentence_index += 1
            
            # Skip if we've already used this sentence (avoid duplicates) - but allow reuse after many iterations
            sentence_hash = hash(sentence[:100])  # Use first 100 chars as hash
            # Optimized: Allow reuse earlier to prevent getting stuck
            if sentence_hash in used_sentences and iterations < len(sentences):
                continue
            used_sentences.add(sentence_hash)
            
            if question_type == "MCQ":
                # Generate MCQ based on sentence content with improved quality
                words = sentence.split()
                
                # Skip very short sentences
                if len(words) < 5:
                    continue
                
                # Improved concept extraction using better NLP-like techniques
                main_concept = self._extract_main_concept(sentence, topic_keywords)
                
                # Validate main_concept is meaningful and not generic
                invalid_concept_words = {'chapter', 'chapters', 'section', 'sections', 'page', 'pages', 
                                        'part', 'parts', 'book', 'books', 'textbook', 'textbooks', 
                                        'content', 'contents', 'topic', 'topics', 'subject', 'subjects',
                                        'material', 'materials', 'information', 'data', 'text', 'process',
                                        'function', 'system', 'concept', 'concepts', 'this concept',
                                        # Conjunctions and transition words
                                        'thus', 'however', 'therefore', 'moreover', 'furthermore', 
                                        'additionally', 'also', 'hence', 'consequently', 'accordingly',
                                        'meanwhile', 'nevertheless', 'nonetheless', 'similarly', 'likewise',
                                        'instead', 'rather', 'indeed', 'actually', 'basically', 'essentially',
                                        # Adverbs and sentence starters
                                        'very', 'quite', 'really', 'usually', 'often', 'sometimes',
                                        'rarely', 'always', 'never', 'first', 'second', 'third', 'finally',
                                        'initially', 'subsequently', 'previously', 'recently', 'currently'}
                
                concept_lower = main_concept.lower().strip() if main_concept else ""
                
                # Ensure main_concept is meaningful and not generic
                if (not main_concept or len(main_concept.strip()) < 3 or 
                    concept_lower in invalid_concept_words or
                    concept_lower.startswith(('the ', 'a ', 'an ')) or
                    # Reject single-word concepts that are too short
                    (len(main_concept.split()) == 1 and len(main_concept.strip()) < 4)):
                    logger.debug(f"Skipping sentence with invalid concept: {main_concept}")
                    continue  # Skip this sentence if concept is invalid
                
                # Include topic name in question when appropriate (if topic is not "any" and concept is related)
                topic_reference = ""
                if topic_normalized != "any" and topic_keywords:
                    # Check if main_concept relates to topic
                    concept_lower = main_concept.lower()
                    if any(kw in concept_lower or concept_lower in kw for kw in topic_keywords if len(kw) > 3):
                        # Topic is already in the concept, don't repeat
                        topic_reference = ""
                else:
                        # Add topic context to make question more specific
                        topic_reference = f" in the context of {topic_name}"
                
                # Generate high-quality question text based on sentence type and difficulty
                question_text, option_a = self._generate_quality_question(
                    sentence, main_concept, topic_reference, difficulty_level, topic_name, topic_normalized
                )
                
                # Final validation: Reject malformed questions
                question_lower = question_text.lower()
                
                # Check for malformed patterns like "how typically starts with functions functions"
                malformed_patterns = [
                    r'how\s+\w+\s+typically\s+',
                    r'how\s+\w+\s+usually\s+',
                    r'how\s+\w+\s+starts\s+with\s+\w+\s+functions',
                    r'how\s+\w+\s+functions\s+functions',  # Double "functions"
                    r'how\s+\w+ly\s+\w+\s+functions',  # Adverb + verb + functions
                    r'how\s+found\s+',  # "how found either free functions"
                    r'how\s+\w+\s+found\s+',  # "how [word] found"
                    r'how\s+\w+\s+\w+\s+functions',  # "how [word] [word] functions" (likely malformed)
                ]
                
                is_malformed = any(re.search(pattern, question_lower) for pattern in malformed_patterns)
                
                if is_malformed:
                    # Re-generate with a simpler, safer pattern
                    logger.debug(f"Rejecting malformed question: {question_text[:100]}")
                    # Extract a better concept or use topic name
                    if topic_normalized != "any":
                        safe_concept = topic_name
                    elif main_concept and len(main_concept.split()) == 1:
                        safe_concept = main_concept
                    else:
                        # Extract first capitalized word from sentence
                        capitalized = re.findall(r'\b[A-Z][a-z]+\b', sentence)
                        safe_concept = capitalized[0] if capitalized else "this concept"
                    
                    # Generate simple, safe question
                    if difficulty_level == "Easy":
                        question_text = f"What is {safe_concept}{topic_reference}?"
                    elif difficulty_level == "Hard":
                        question_text = f"Which statement best describes {safe_concept}{topic_reference}?"
                    else:
                        question_text = f"Which statement best explains {safe_concept}{topic_reference}?"
                
                # Validate that question text contains the main concept (ensures relevance)
                if main_concept and main_concept.lower() not in question_lower:
                    # Concept not in question - this might be a problem, but continue
                    logger.debug(f"Warning: Main concept '{main_concept}' not found in question text")
                
                # Clean option_a to remove metadata and ensure it comes from the sentence
                option_a_clean = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', option_a, flags=re.IGNORECASE)
                option_a_clean = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', option_a_clean, flags=re.IGNORECASE)
                option_a_clean = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', option_a_clean, flags=re.IGNORECASE)
                option_a = option_a_clean.strip()
                
                # Ensure option_a comes from the sentence (validate relevance)
                sentence_clean = sentence.strip()
                sentence_clean = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', sentence_clean, flags=re.IGNORECASE)
                sentence_clean = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', sentence_clean, flags=re.IGNORECASE)
                sentence_clean = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', sentence_clean, flags=re.IGNORECASE)
                
                # If option_a doesn't match sentence well, use sentence directly
                if option_a.lower() not in sentence_clean.lower()[:200] and len(sentence_clean) > 20:
                    # Use a portion of the sentence that contains the concept
                    if main_concept and main_concept.lower() in sentence_clean.lower():
                        # Find the part of sentence with the concept
                        concept_idx = sentence_clean.lower().find(main_concept.lower())
                        if concept_idx >= 0:
                            option_a = sentence_clean[concept_idx:concept_idx+100].strip()
                        else:
                            option_a = sentence_clean[:85].strip()
                    else:
                        option_a = sentence_clean[:85].strip()
                
                # Generate high-quality distractors with randomized correct answer position
                # Pass topic_keywords to ensure distractors come from same topic
                options, correct_answer_letter = self._generate_quality_options(
                    sentence, main_concept, option_a, difficulty_level, context_text, topic_keywords
                )
                
                # Ensure question ends with ?
                if not question_text.strip().endswith('?'):
                    question_text = question_text.strip() + '?'
                
                # Final validation - ensure question is complete, logical, and meaningful
                question_text_clean = question_text.strip()
                
                # Check if question is too short
                if len(question_text_clean) < 10:
                    # Re-generate with proper template
                    if difficulty_level == "Easy":
                        question_text = f"What is {main_concept}{topic_reference}?"
                    elif difficulty_level == "Hard":
                        question_text = f"Which statement best describes {main_concept}{topic_reference}?"
                    else:
                        question_text = f"Which statement best explains {main_concept}{topic_reference}?"
                    logger.debug(f"Re-generated question due to short length")
                
                # Validate question has a question word
                question_lower = question_text.lower()
                if not any(word in question_lower for word in ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'define', 'analyze', 'evaluate']):
                    # Missing question word, fix it
                    if difficulty_level == "Easy":
                        question_text = f"What is {main_concept}{topic_reference}?"
                    elif difficulty_level == "Hard":
                        question_text = f"Which statement best describes {main_concept}{topic_reference}?"
                    else:
                        question_text = f"Which statement best explains {main_concept}{topic_reference}?"
                    logger.debug(f"Fixed question missing question word")
                
                # Validate concept is present in question
                if main_concept and main_concept.lower() not in question_lower and main_concept.lower() not in ['this concept', 'this biological structure']:
                    # Concept missing, add it
                    if 'which statement' in question_lower:
                        question_text = f"Which statement best describes {main_concept}{topic_reference}?"
                    elif 'what' in question_lower:
                        question_text = f"What is {main_concept}{topic_reference}?"
                    else:
                        question_text = f"Which statement best explains {main_concept}{topic_reference}?"
                    logger.debug(f"Added missing concept to question")
                
                # Create meaningful explanation from the SAME sentence that generated the question
                explanation_sentence = sentence.strip()
                # Remove metadata patterns first
                explanation_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', explanation_sentence, flags=re.IGNORECASE)
                explanation_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', explanation_sentence, flags=re.IGNORECASE)
                explanation_sentence = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', explanation_sentence, flags=re.IGNORECASE)
                explanation_sentence = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', explanation_sentence, flags=re.IGNORECASE)
                # Clean up the explanation - remove leading articles, ensure it's a complete thought
                explanation_sentence = re.sub(r'^(The|A|An|This|That)\s+', '', explanation_sentence, flags=re.IGNORECASE)
                # Ensure it ends properly
                if not explanation_sentence.endswith(('.', '!', '?')):
                    explanation_sentence = explanation_sentence.rstrip(',;:') + '.'
                # Limit length but keep it meaningful
                if len(explanation_sentence) > 200:
                    # Try to cut at a sentence boundary
                    sentences_split = re.split(r'[.!?]\s+', explanation_sentence)
                    explanation_sentence = '. '.join(sentences_split[:2]) + '.' if len(sentences_split) > 1 else explanation_sentence[:200] + '...'
                explanation = explanation_sentence
                
                # Final validation before adding question
                # Ensure question is complete and logical
                question_text_final = question_text.strip()
                
                # Skip if question is too short or incomplete
                if len(question_text_final) < 8:
                    logger.debug(f"Skipping MCQ question - too short: {question_text_final[:50]}")
                    continue
                
                # Skip if question doesn't have a question word
                question_lower_final = question_text_final.lower()
                if not any(word in question_lower_final for word in ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'define', 'analyze', 'evaluate']):
                    logger.debug(f"Skipping MCQ question - missing question word: {question_text_final[:50]}")
                    continue
                
                # Skip if question has invalid patterns
                if re.search(r'\b(thus|however|therefore|moreover)\s+functions', question_lower_final):
                    logger.debug(f"Skipping MCQ question - invalid pattern: {question_text_final[:50]}")
                    continue
                
                # Skip if question contains metadata words (chapter, topic, section, content, etc.)
                invalid_metadata_words = ['chapter', 'chapters', 'topic', 'topics', 'section', 'sections', 
                                         'content', 'contents', 'page', 'pages', 'part', 'parts', 
                                         'book', 'books', 'textbook', 'textbooks', 'subject', 'subjects']
                if any(word in question_lower_final for word in invalid_metadata_words):
                    logger.debug(f"Skipping MCQ question - contains metadata word: {question_text_final[:50]}")
                    continue
                
                # Skip if question ends with a pronoun (They?, It?, We?, etc.)
                question_ending = question_text_final.rstrip('?.').strip()
                question_ending_words = question_ending.split()
                if question_ending_words:
                    last_word = question_ending_words[-1].rstrip('?.,!;:').lower()
                    pronouns = ['they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me', 
                               'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its', 'this', 'that', 'these', 'those']
                    if last_word in pronouns:
                        logger.debug(f"Skipping MCQ question - ends with pronoun '{last_word}': {question_text_final[:50]}")
                        continue
                
                # Skip if question contains malformed patterns like "how found either free functions"
                malformed_question_patterns = [
                    r'how\s+found\s+',
                    r'how\s+\w+\s+found\s+',
                    r'how\s+\w+\s+\w+\s+functions\s+and\s+why',  # "how [word] [word] functions and why"
                ]
                if any(re.search(pattern, question_lower_final) for pattern in malformed_question_patterns):
                    logger.debug(f"Skipping MCQ question - malformed pattern: {question_text_final[:50]}")
                    continue
                
                # Validate main concept is present and not a pronoun
                if main_concept:
                    main_concept_lower = main_concept.lower().strip()
                    # Reject if main_concept is a pronoun or invalid word
                    pronouns = ['they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me', 
                               'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its', 'this', 'that', 'these', 'those',
                               'this concept']
                    if main_concept_lower in pronouns:
                        logger.debug(f"Skipping MCQ question - main_concept is pronoun/invalid: {main_concept}")
                        continue
                    
                    # Check if concept appears in question (allowing for variations)
                    if main_concept_lower not in ['this concept']:
                        concept_in_question = (
                            main_concept.lower() in question_lower_final or
                            any(word in question_lower_final for word in main_concept.lower().split() if len(word) > 3)
                        )
                        if not concept_in_question and len(main_concept) > 3:
                            # Try to add concept to question
                            if 'which statement' in question_lower_final:
                                question_text_final = f"Which statement best describes {main_concept}{topic_reference}?"
                            elif 'what' in question_lower_final:
                                question_text_final = f"What is {main_concept}{topic_reference}?"
                            else:
                                question_text_final = f"Which statement best explains {main_concept}{topic_reference}?"
                
                # Check for duplicate questions (normalize text for comparison)
                question_normalized = question_text_final.lower().strip()
                question_normalized = re.sub(r'[^\w\s]', '', question_normalized)  # Remove punctuation
                question_normalized = re.sub(r'\s+', ' ', question_normalized)  # Normalize whitespace
                
                if question_normalized in generated_question_texts:
                    logger.debug(f"Skipping duplicate MCQ question: {question_text_final[:50]}")
                    continue
                
                # Add to tracking set
                generated_question_texts.add(question_normalized)
                
                questions.append({
                    "question_text": question_text_final,
                    "options": options,
                    "correct_answer": correct_answer_letter,  # Use randomized correct answer
                    "explanation": explanation
                })
                questions_generated += 1
            
            elif question_type == "Short":
                # Extract concept for short questions
                main_concept_short = self._extract_main_concept(sentence, topic_keywords)
                
                # Validate concept is not generic/invalid
                invalid_concept_words = {'chapter', 'chapters', 'section', 'sections', 'page', 'pages', 
                                        'part', 'parts', 'book', 'books', 'textbook', 'textbooks', 
                                        'content', 'contents', 'topic', 'topics', 'subject', 'subjects',
                                        'material', 'materials', 'information', 'data', 'text', 'process',
                                        'function', 'system', 'concept', 'concepts', 'this concept'}
                
                concept_lower = main_concept_short.lower().strip() if main_concept_short else ""
                
                # Skip if concept is invalid
                if (not main_concept_short or len(main_concept_short.strip()) < 3 or 
                    concept_lower in invalid_concept_words):
                    logger.debug(f"Skipping sentence with invalid concept for short question: {main_concept_short}")
                    continue
                
                # Generate high-quality short answer question - use the SAME sentence for answer
                question_text, correct_answer = self._generate_quality_short_question(
                    sentence, key_terms, questions_generated, topic_name, 
                    topic_normalized, difficulty_level, main_concept_short
                )
                
                # ALWAYS use the same sentence that generated the question for the answer
                # Clean the sentence to use as answer
                clean_sentence = sentence.strip()
                # Remove metadata patterns
                clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                clean_sentence = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                clean_sentence = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', clean_sentence, flags=re.IGNORECASE)
                
                # Validate that the answer matches the question concept
                # If the generated answer doesn't contain the concept, use the cleaned sentence
                answer_has_concept = main_concept_short.lower() in correct_answer.lower() if main_concept_short else True
                sentence_has_concept = main_concept_short.lower() in clean_sentence.lower() if main_concept_short else True
                
                # Always prefer the sentence if it's meaningful and contains the concept
                if len(clean_sentence) > 30 and (sentence_has_concept or not answer_has_concept):
                    correct_answer = clean_sentence[:200]
                elif not answer_has_concept and len(clean_sentence) > 20:
                    # If generated answer doesn't match, use sentence
                    correct_answer = clean_sentence[:200]
                
                # Create meaningful explanation from the answer - clean metadata
                explanation = correct_answer[:250].strip()
                # Remove metadata patterns from explanation too
                explanation = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', explanation, flags=re.IGNORECASE)
                
                if len(explanation) < 30:
                    # Use the cleaned sentence itself if answer is too short
                    explanation = clean_sentence[:200].strip() if clean_sentence else explanation
                # Ensure it ends properly
                if not explanation.endswith(('.', '!', '?')):
                    explanation = explanation.rstrip(',;:') + '.'
                
                # Final validation before adding question
                question_text_final = question_text.strip()
                
                # Skip if question is too short or incomplete
                if len(question_text_final) < 8:
                    logger.debug(f"Skipping short question - too short: {question_text_final[:50]}")
                    continue
                
                # Skip if question doesn't have a question word or command
                question_lower_final = question_text_final.lower()
                if not any(word in question_lower_final for word in ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'define', 'analyze', 'evaluate', 'compare']):
                    logger.debug(f"Skipping short question - missing question word: {question_text_final[:50]}")
                    continue
                
                # Skip if question contains metadata words (chapter, topic, section, content, etc.)
                invalid_metadata_words = ['chapter', 'chapters', 'topic', 'topics', 'section', 'sections', 
                                         'content', 'contents', 'page', 'pages', 'part', 'parts', 
                                         'book', 'books', 'textbook', 'textbooks', 'subject', 'subjects']
                if any(word in question_lower_final for word in invalid_metadata_words):
                    logger.debug(f"Skipping short question - contains metadata word: {question_text_final[:50]}")
                    continue
                
                # Check for duplicate questions (normalize text for comparison)
                question_normalized = question_text_final.lower().strip()
                question_normalized = re.sub(r'[^\w\s]', '', question_normalized)  # Remove punctuation
                question_normalized = re.sub(r'\s+', ' ', question_normalized)  # Normalize whitespace
                
                if question_normalized in generated_question_texts:
                    logger.debug(f"Skipping duplicate short question: {question_text_final[:50]}")
                    continue
                
                # Add to tracking set
                generated_question_texts.add(question_normalized)
                
                questions.append({
                    "question_text": question_text_final,
                    "correct_answer": correct_answer[:200],
                    "explanation": explanation
                })
                questions_generated += 1
            
            else:  # Long question
                # Extract concept for long questions
                main_concept_long = self._extract_main_concept(sentence, topic_keywords)
                
                # Validate concept is not generic/invalid
                invalid_concept_words = {'chapter', 'chapters', 'section', 'sections', 'page', 'pages', 
                                        'part', 'parts', 'book', 'books', 'textbook', 'textbooks', 
                                        'content', 'contents', 'topic', 'topics', 'subject', 'subjects',
                                        'material', 'materials', 'information', 'data', 'text', 'process',
                                        'function', 'system', 'concept', 'concepts', 'this concept'}
                
                concept_lower = main_concept_long.lower().strip() if main_concept_long else ""
                
                # Skip if concept is invalid
                if (not main_concept_long or len(main_concept_long.strip()) < 3 or 
                    concept_lower in invalid_concept_words):
                    logger.debug(f"Skipping sentence with invalid concept for long question: {main_concept_long}")
                    continue
                
                # Generate high-quality long answer question
                # Pass chunks if available, otherwise None
                chunks_for_long = chunks if chunks else None
                question_text, correct_answer = self._generate_quality_long_question(
                    sentence, context_text, key_terms, questions_generated, topic_name,
                    topic_normalized, difficulty_level, main_concept_long, chunks_for_long
                )
                
                # Clean answer to remove metadata patterns (same as Short questions)
                clean_answer = correct_answer.strip() if correct_answer else sentence.strip()
                # Remove metadata patterns
                clean_answer = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', clean_answer, flags=re.IGNORECASE)
                clean_answer = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', clean_answer, flags=re.IGNORECASE)
                clean_answer = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', clean_answer, flags=re.IGNORECASE)
                clean_answer = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', clean_answer, flags=re.IGNORECASE)
                
                # Use cleaned sentence if answer is too short or doesn't contain concept
                clean_sentence = sentence.strip()
                clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                clean_sentence = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
                
                # Validate that the answer matches the question concept
                answer_has_concept = main_concept_long.lower() in clean_answer.lower() if main_concept_long else True
                sentence_has_concept = main_concept_long.lower() in clean_sentence.lower() if main_concept_long else True
                
                # Always prefer the sentence if it's meaningful and contains the concept
                if len(clean_sentence) > 50 and (sentence_has_concept or not answer_has_concept):
                    correct_answer = clean_sentence[:400]  # Longer for long questions
                elif not answer_has_concept and len(clean_sentence) > 30:
                    correct_answer = clean_sentence[:400]
                else:
                    correct_answer = clean_answer[:400]
                
                # Create detailed explanation for long questions - clean metadata
                explanation = correct_answer[:300].strip() if len(correct_answer) > 50 else clean_sentence[:300].strip()
                # Remove metadata patterns from explanation too
                explanation = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', explanation, flags=re.IGNORECASE)
                explanation = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', explanation, flags=re.IGNORECASE)
                
                if len(explanation) < 50:
                    # Use the cleaned sentence itself if answer is too short
                    explanation = clean_sentence[:300].strip() if clean_sentence else explanation
                # Ensure it ends properly
                if not explanation.endswith(('.', '!', '?')):
                    explanation = explanation.rstrip(',;:') + '.'
                
                # Final validation before adding question
                question_text_final = question_text.strip()
                
                # Skip if question is too short or incomplete
                if len(question_text_final) < 10:
                    logger.debug(f"Skipping long question - too short: {question_text_final[:50]}")
                    continue
                
                # Skip if question doesn't have a question word or command
                question_lower_final = question_text_final.lower()
                if not any(word in question_lower_final for word in ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'define', 'analyze', 'evaluate', 'compare', 'discuss']):
                    logger.debug(f"Skipping long question - missing question word: {question_text_final[:50]}")
                    continue
                
                # Skip if question contains metadata words (chapter, topic, section, content, etc.)
                invalid_metadata_words = ['chapter', 'chapters', 'topic', 'topics', 'section', 'sections', 
                                         'content', 'contents', 'page', 'pages', 'part', 'parts', 
                                         'book', 'books', 'textbook', 'textbooks', 'subject', 'subjects']
                if any(word in question_lower_final for word in invalid_metadata_words):
                    logger.debug(f"Skipping long question - contains metadata word: {question_text_final[:50]}")
                    continue
                
                # Skip if question ends with a pronoun (They?, It?, We?, etc.)
                question_ending = question_text_final.rstrip('?.').strip()
                question_ending_words = question_ending.split()
                if question_ending_words:
                    last_word = question_ending_words[-1].rstrip('?.,!;:').lower()
                    pronouns = ['they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me', 
                               'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its', 'this', 'that', 'these', 'those']
                    if last_word in pronouns:
                        logger.debug(f"Skipping long question - ends with pronoun '{last_word}': {question_text_final[:50]}")
                        continue
                
                # Skip if question contains malformed patterns
                malformed_question_patterns = [
                    r'how\s+found\s+',
                    r'how\s+\w+\s+found\s+',
                    r'how\s+\w+\s+\w+\s+functions\s+and\s+why',  # "how [word] [word] functions and why"
                ]
                if any(re.search(pattern, question_lower_final) for pattern in malformed_question_patterns):
                    logger.debug(f"Skipping long question - malformed pattern: {question_text_final[:50]}")
                    continue
                
                # Validate main concept is present and not a pronoun
                if main_concept_long:
                    main_concept_lower = main_concept_long.lower().strip()
                    # Reject if main_concept is a pronoun or invalid word
                    pronouns = ['they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me', 
                               'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its', 'this', 'that', 'these', 'those',
                               'this concept']
                    if main_concept_lower in pronouns:
                        logger.debug(f"Skipping long question - main_concept is pronoun/invalid: {main_concept_long}")
                        continue
                
                # Check for duplicate questions (normalize text for comparison)
                question_normalized = question_text_final.lower().strip()
                question_normalized = re.sub(r'[^\w\s]', '', question_normalized)  # Remove punctuation
                question_normalized = re.sub(r'\s+', ' ', question_normalized)  # Normalize whitespace
                
                if question_normalized in generated_question_texts:
                    logger.debug(f"Skipping duplicate long question: {question_text_final[:50]}")
                    continue
                
                # Add to tracking set
                generated_question_texts.add(question_normalized)
                
                questions.append({
                    "question_text": question_text_final,
                    "correct_answer": correct_answer,
                    "explanation": explanation
                })
                questions_generated += 1
        
        # Shuffle final questions to ensure randomness
        random.shuffle(questions)
        return questions[:count]
    
    def _extract_main_concept(self, sentence: str, topic_keywords: List[str]) -> str:
        """Extract the main concept from a sentence - returns a proper noun phrase (max 3 words), not a full sentence"""
        import re
        
        # Define stop_words first (before it's used)
        stop_words = {'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'they', 'we', 'you', 
                     'is', 'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did', 'can', 'could',
                     'will', 'would', 'should', 'may', 'might', 'must', 'process', 'function', 'system', 
                     'essential', 'important', 'chapter', 'chapters', 'section', 'sections', 'page', 'pages',
                     'part', 'parts', 'book', 'books', 'textbook', 'textbooks', 'content', 'contents',
                     'topic', 'topics', 'subject', 'subjects', 'material', 'materials', 'information', 'data', 'text',
                     # Conjunctions and transition words
                     'thus', 'however', 'therefore', 'moreover', 'furthermore', 'additionally', 'also',
                     'hence', 'consequently', 'accordingly', 'meanwhile', 'nevertheless', 'nonetheless',
                     'similarly', 'likewise', 'instead', 'rather', 'indeed', 'actually', 'basically',
                     'essentially', 'generally', 'specifically', 'particularly', 'especially'}
        
        # Invalid/generic words that should never be used as concepts
        invalid_concepts = {
            'Chapter', 'Chapters', 'Section', 'Sections', 'Page', 'Pages', 'Part', 'Parts',
            'Book', 'Books', 'Textbook', 'Textbooks', 'Content', 'Contents', 'Topic', 'Topics',
            'Subject', 'Subjects', 'Material', 'Materials', 'Information', 'Data', 'Text',
            'The', 'This', 'That', 'These', 'Those', 'During', 'Through', 'Which', 'What', 
            'When', 'Where', 'Why', 'How', 'Process', 'Function', 'System', 'Concept', 'Concepts',
            # Pronouns (capitalized at sentence start but not concepts)
            'They', 'It', 'We', 'You', 'I', 'He', 'She', 'Him', 'Her', 'Them', 'Us', 'Me',
            'His', 'Hers', 'Theirs', 'Ours', 'Yours', 'Mine', 'Its',
            # Conjunctions and transition words
            'Thus', 'However', 'Therefore', 'Moreover', 'Furthermore', 'Additionally', 'Also',
            'Hence', 'Consequently', 'Accordingly', 'Meanwhile', 'Nevertheless', 'Nonetheless',
            'Similarly', 'Likewise', 'Instead', 'Rather', 'Indeed', 'Actually', 'Basically',
            'Essentially', 'Generally', 'Specifically', 'Particularly', 'Especially',
            # Adverbs and other function words
            'Very', 'Quite', 'Rather', 'Really', 'Actually', 'Basically', 'Essentially',
            'Usually', 'Often', 'Sometimes', 'Rarely', 'Always', 'Never', 'Sometimes',
            # Sentence starters that are capitalized but not concepts
            'First', 'Second', 'Third', 'Finally', 'Initially', 'Subsequently', 'Previously',
            'Recently', 'Currently', 'Previously', 'Earlier', 'Later', 'Now', 'Then'
        }
        
        # Remove common prefixes and clean sentence
        sentence_clean = sentence.strip()
        sentence_clean = re.sub(r'^(The|A|An|This|That|These|Those)\s+', '', sentence_clean, flags=re.IGNORECASE)
        
        # Extract capitalized terms (likely important concepts) - these are usually the main concepts
        capitalized_terms = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', sentence_clean)
        # Filter out invalid/generic concepts, pronouns, and words like "Content" that appear after concepts
        capitalized_terms = [t for t in capitalized_terms if len(t) > 2 and t not in invalid_concepts and t.lower() != 'content' and t.lower() not in ['they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me', 'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its']]
        
        # Remove "Content" from any multi-word terms (e.g., "Nucleus Content" -> "Nucleus")
        cleaned_terms = []
        for term in capitalized_terms:
            words = term.split()
            # Remove "Content" from the term
            words = [w for w in words if w.lower() != 'content']
            if words:
                cleaned_terms.append(' '.join(words))
        capitalized_terms = cleaned_terms
        
        # Look for definition patterns: "X is Y" or "X are Y" - extract X only (the subject)
        definition_patterns = [
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+is\s+',
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+are\s+',
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+means\s+',
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+refers\s+to\s+',
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+consists\s+of',
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+contains',
        ]
        
        for pattern in definition_patterns:
            match = re.search(pattern, sentence_clean, re.IGNORECASE)
            if match:
                concept = match.group(1).strip()
                # Limit to reasonable length (max 3 words for a concept)
                words = concept.split()
                if len(words) <= 3 and len(concept) > 3 and len(concept) < 40:
                    return concept
        
        # If topic keywords exist, prioritize concepts containing them
        if topic_keywords:
            for term in capitalized_terms:
                term_lower = term.lower()
                words = term.split()
                # Only use if it's a reasonable length (1-3 words)
                if len(words) <= 3 and any(kw in term_lower or term_lower in kw for kw in topic_keywords if len(kw) > 3):
                    return term
        
        # Use first capitalized term if available and reasonable length
        # But validate it's not an invalid word
        if capitalized_terms:
            for term in capitalized_terms:
                # Check if term is in invalid concepts
                if term in invalid_concepts or term.lower() in stop_words:
                    continue
                words = term.split()
                # Prefer shorter, more specific terms (1-3 words)
                if len(words) <= 3:
                    # Additional validation: reject if it's a single word that's too short or common
                    if len(words) == 1 and len(term) < 4:
                        continue
                    return term
            # If all are long, use the first one but limit it (if valid)
            for first_term in capitalized_terms:
                if first_term not in invalid_concepts and first_term.lower() not in stop_words:
                    words = first_term.split()
                    if len(words) > 3:
                        return " ".join(words[:3])  # Limit to first 3 words
                    return first_term
        
        # Fallback: extract meaningful noun phrases (max 3 words)
        # Reject verbs, adverbs, and function words
        # (stop_words already defined at the top of the function)
        
        # Common verbs and adverbs to reject
        invalid_verbs = {'starts', 'start', 'begins', 'begin', 'ends', 'end', 'occurs', 'occur', 'happens', 'happen',
                        'takes', 'take', 'makes', 'make', 'does', 'do', 'goes', 'go', 'comes', 'come',
                        'works', 'work', 'functions', 'function', 'operates', 'operate', 'runs', 'run',
                        'typically', 'usually', 'often', 'sometimes', 'rarely', 'always', 'never',
                        'very', 'quite', 'rather', 'really', 'actually', 'basically', 'essentially',
                        'first', 'second', 'third', 'finally', 'initially', 'subsequently', 'previously',
                        'recently', 'currently', 'earlier', 'later', 'now', 'then'}
        
        words = sentence_clean.split()
        meaningful_words = []
        
        for w in words[:8]:  # Check first 8 words only
            w_clean = re.sub(r'[^\w]', '', w.lower())
            # Reject if it's a stop word, verb, adverb, or too short
            if (w_clean and w_clean not in stop_words and w_clean not in invalid_verbs and 
                len(w_clean) > 3 and not w_clean.endswith(('ly', 'ing', 'ed', 's'))):
                # Check if it's likely a noun (capitalized or common noun patterns)
                if w[0].isupper() or w_clean not in invalid_verbs:
                    meaningful_words.append(w)
                    if len(meaningful_words) >= 3:  # Max 3 words for a concept
                        break
        
        if meaningful_words:
            concept = " ".join(meaningful_words[:3])
            # Clean up
            concept = re.sub(r'^[^\w]+', '', concept)
            concept = re.sub(r'[^\w\s]+$', '', concept)
            concept = re.sub(r'\s+', ' ', concept).strip()
            # Validate concept is not generic and doesn't contain verbs/adverbs
            concept_lower = concept.lower()
            concept_words = concept_lower.split()
            # Reject if any word is a verb/adverb
            if any(word in invalid_verbs or word.endswith(('ly', 'ing', 'ed')) for word in concept_words):
                # Don't return this invalid concept
                pass
            elif len(concept) > 3 and len(concept) < 40 and concept_lower not in stop_words:
                return concept
        
        # Last resort: use topic name if available
        if topic_keywords and topic_keywords[0] and topic_keywords[0] != "any":
            return topic_keywords[0].title()
        
        # Very last resort: first meaningful capitalized word (but validate it's not generic)
        for w in sentence_clean.split()[:15]:
            if w and w[0].isupper() and len(w) > 3:
                w_clean = re.sub(r'[^\w]', '', w)
                w_lower = w_clean.lower()
                # Reject invalid words (pronouns, stop words, invalid concepts)
                if (w_lower not in stop_words and w_clean not in invalid_concepts and
                    w_lower not in ['thus', 'however', 'therefore', 'moreover', 'furthermore',
                                   'first', 'second', 'third', 'finally', 'initially', 'subsequently',
                                   'recently', 'currently', 'earlier', 'later', 'now', 'then',
                                   'very', 'quite', 'rather', 'really', 'actually', 'basically',
                                   # Pronouns
                                   'they', 'it', 'we', 'you', 'i', 'he', 'she', 'him', 'her', 'them', 'us', 'me',
                                   'his', 'hers', 'theirs', 'ours', 'yours', 'mine', 'its']):
                    return w_clean
        
        # Very last resort - use topic name if available
        if topic_keywords and topic_keywords[0] and topic_keywords[0] != "any":
            return topic_keywords[0].title()
        
        return "this concept"
    
    def _generate_quality_question(
        self, sentence: str, main_concept: str, topic_reference: str, 
        difficulty_level: str, topic_name: str, topic_normalized: str
    ) -> tuple:
        """Generate high-quality question text and correct answer option"""
        import re
        
        # Validate and clean main_concept - reject generic/invalid concepts
        invalid_concept_words = {'chapter', 'chapters', 'section', 'sections', 'page', 'pages', 
                                'part', 'parts', 'book', 'books', 'textbook', 'textbooks', 
                                'content', 'contents', 'topic', 'topics', 'subject', 'subjects',
                                'material', 'materials', 'information', 'data', 'text', 'process',
                                'function', 'system', 'concept', 'concepts', 'this concept'}
        
        main_concept_clean = main_concept.strip()
        
        # If concept is invalid, try to extract a better one from the sentence
        if main_concept_clean.lower() in invalid_concept_words:
            # Extract capitalized terms from sentence
            capitalized = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', sentence)
            capitalized = [c for c in capitalized if c.lower() not in invalid_concept_words and len(c) > 3]
            if capitalized:
                main_concept_clean = capitalized[0]
            elif topic_normalized != "any":
                main_concept_clean = topic_name
            else:
                # Last resort: use a generic but valid placeholder
                main_concept_clean = "this concept"
        
        # Validate concept doesn't contain verbs/adverbs/invalid patterns
        invalid_verbs = {'starts', 'start', 'begins', 'begin', 'ends', 'end', 'occurs', 'occur', 'happens', 'happen',
                        'takes', 'take', 'makes', 'make', 'does', 'do', 'goes', 'go', 'comes', 'come',
                        'works', 'work', 'functions', 'function', 'operates', 'operate', 'runs', 'run',
                        'typically', 'usually', 'often', 'sometimes', 'rarely', 'always', 'never',
                        'very', 'quite', 'rather', 'really', 'actually', 'basically', 'essentially'}
        
        concept_words = main_concept_clean.lower().split()
        # Check if concept contains verbs/adverbs
        if any(word in invalid_verbs or word.endswith(('ly', 'ing', 'ed')) for word in concept_words):
            # Try to extract a better concept from sentence
            capitalized = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', sentence)
            capitalized = [c for c in capitalized if c.lower() not in invalid_concept_words and len(c) > 3]
            if capitalized:
                main_concept_clean = capitalized[0]
            elif topic_normalized != "any":
                main_concept_clean = topic_name
            else:
                main_concept_clean = "this biological structure"
        
        # If main_concept is too long (more than 50 chars or 5 words), extract just the key term
        if len(main_concept_clean) > 50 or len(main_concept_clean.split()) > 5:
            # Try to extract just the first capitalized term
            capitalized = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', main_concept_clean)
            capitalized = [c for c in capitalized if c.lower() not in invalid_concept_words]
            if capitalized:
                main_concept_clean = capitalized[0]
            else:
                # Use first 2-3 words, but validate they're not verbs
                words = main_concept_clean.split()[:3]
                words_clean = [w for w in words if w.lower() not in invalid_verbs and not w.lower().endswith(('ly', 'ing', 'ed'))]
                if words_clean:
                    main_concept_clean = " ".join(words_clean[:2])
                else:
                    # Last resort
                    if topic_normalized != "any":
                        main_concept_clean = topic_name
                    else:
                        main_concept_clean = "this biological structure"
        
        sentence_lower = sentence.lower()
        
        # Detect sentence type for better question generation
        is_definition = any(word in sentence_lower[:50] for word in ['is', 'are', 'means', 'refers to', 'defined as'])
        is_process = any(word in sentence_lower for word in ['process', 'steps', 'occurs', 'happens', 'takes place'])
        is_function = any(word in sentence_lower for word in ['function', 'purpose', 'role', 'responsibility'])
        is_comparison = any(word in sentence_lower for word in ['than', 'compared', 'different', 'similar', 'unlike'])
        
        # Build correct answer: prefer full definitional sentence (clear and high quality)
        def _clean_option(text):
            text = re.sub(r'\s+', ' ', text).strip()
            text = re.sub(r'^(The|A|An)\s+', '', text, flags=re.IGNORECASE)
            return text.strip()
        
        if is_definition and len(sentence) <= 200:
            option_a = _clean_option(sentence)
        else:
            option_a = _clean_option(sentence[:100])
        if len(option_a) < 20:
            option_a = _clean_option(sentence)
        
        # Varied question templates by difficulty and type (better quality and variety)
        if difficulty_level == "Easy":
            if is_definition:
                templates = [
                    f"What is {main_concept_clean}{topic_reference}?",
                    f"Which option correctly defines {main_concept_clean}{topic_reference}?",
                    f"Define {main_concept_clean}{topic_reference}.",
                ]
            elif is_function:
                templates = [
                    f"What is the function of {main_concept_clean}{topic_reference}?",
                    f"Which describes the role of {main_concept_clean}{topic_reference}?",
                ]
            elif is_process:
                templates = [
                    f"What happens during {main_concept_clean}{topic_reference}?",
                    f"Which statement describes the process of {main_concept_clean}{topic_reference}?",
                ]
            else:
                templates = [
                    f"What is {main_concept_clean}{topic_reference}?",
                    f"Which best describes {main_concept_clean}{topic_reference}?",
                ]
            question_text = random.choice(templates)
            
        elif difficulty_level == "Hard":
            if is_comparison:
                templates = [
                    f"Which statement accurately compares {main_concept_clean}{topic_reference} with related concepts?",
                    f"Which option correctly contrasts {main_concept_clean}{topic_reference}?",
                ]
            elif is_process:
                templates = [
                    f"Which of the following best explains the mechanism and significance of {main_concept_clean}{topic_reference}?",
                    f"Which statement correctly describes the process and importance of {main_concept_clean}{topic_reference}?",
                ]
            elif is_function:
                templates = [
                    f"Which statement correctly evaluates the role and importance of {main_concept_clean}{topic_reference}?",
                    f"Which option best explains the function and significance of {main_concept_clean}{topic_reference}?",
                ]
            elif is_definition:
                templates = [
                    f"Which statement best describes the structure and function of {main_concept_clean}{topic_reference}?",
                    f"Which option correctly characterizes {main_concept_clean}{topic_reference}?",
                ]
            else:
                templates = [
                    f"Which statement accurately explains how {main_concept_clean}{topic_reference} relates to its function and significance?",
                    f"Which option best describes {main_concept_clean}{topic_reference}?",
                ]
            question_text = random.choice(templates)
            if len(option_a) < 25:
                option_a = _clean_option(sentence)
                
        else:  # Medium
            if is_function:
                templates = [
                    f"Which statement best explains the role and importance of {main_concept_clean}{topic_reference}?",
                    f"Which option describes the function of {main_concept_clean}{topic_reference}?",
                ]
            elif is_process:
                templates = [
                    f"Which of the following accurately describes the process and steps involved in {main_concept_clean}{topic_reference}?",
                    f"Which statement best describes the process of {main_concept_clean}{topic_reference}?",
                ]
            elif is_definition:
                templates = [
                    f"Which statement correctly describes the structure and characteristics of {main_concept_clean}{topic_reference}?",
                    f"Which option best defines or describes {main_concept_clean}{topic_reference}?",
                ]
            else:
                concept_words = main_concept_clean.lower().split()
                invalid_patterns = ['starts', 'begins', 'ends', 'occurs', 'happens', 'functions', 'works',
                                   'typically', 'usually', 'often', 'sometimes', 'rarely', 'always', 'never']
                if any(word in invalid_patterns or word.endswith(('ly', 'ing', 'ed')) for word in concept_words):
                    templates = [f"Which statement best describes {main_concept_clean}{topic_reference}?"]
                else:
                    templates = [
                        f"Which statement best explains how {main_concept_clean}{topic_reference} functions and why it is important?",
                        f"Which option best describes {main_concept_clean}{topic_reference}?",
                    ]
            question_text = random.choice(templates)
            if len(option_a) < 20:
                option_a = _clean_option(sentence)
        
        # Normalize and cap option length for MCQ readability
        option_a = re.sub(r'\s+', ' ', option_a).strip()
        if len(option_a) > 120:
            option_a = option_a[:117].rsplit(' ', 1)[0] + '...' if ' ' in option_a[:117] else option_a[:117] + '...'
        
        # Ensure minimum length
        if len(option_a) < 15:
            option_a = f"{main_concept_clean} is an important concept with specific characteristics as described in the textbook."
        
        # Final validation: Check if question makes grammatical sense and is complete
        question_lower = question_text.lower()
        
        # Validate main_concept_clean is not empty or invalid
        if not main_concept_clean or main_concept_clean.strip() == "" or main_concept_clean.lower() in ['this concept', 'this biological structure', 'thus', 'however']:
            # Use topic name as fallback
            if topic_normalized != "any" and topic_name:
                main_concept_clean = topic_name
            else:
                # Extract first meaningful capitalized word from sentence
                capitalized = re.findall(r'\b[A-Z][a-z]{3,}\b', sentence)
                capitalized = [c for c in capitalized if c.lower() not in invalid_concept_words and len(c) > 3]
                if capitalized:
                    main_concept_clean = capitalized[0]
                else:
                    main_concept_clean = "this concept"
            # Re-generate question with valid concept
            if difficulty_level == "Easy":
                question_text = f"What is {main_concept_clean}{topic_reference}?"
            elif difficulty_level == "Hard":
                question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
            else:
                question_text = f"Which statement best explains {main_concept_clean}{topic_reference}?"
        
        # Pattern 1: "how [invalid phrase] functions" - malformed
        if re.search(r'how\s+(\w+\s+)*(typically|usually|often|starts|begins|ends|occurs|happens)\s+.*functions', question_lower):
            # Re-generate with simpler pattern
            question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
        
        # Pattern 2: "how [adverb] [verb] functions" - malformed
        if re.search(r'how\s+\w+ly\s+\w+\s+functions', question_lower):
            question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
        
        # Pattern 3: Check for repeated words or nonsensical patterns
        words = question_text.lower().split()
        # Check for patterns like "how typically starts with functions functions"
        if 'functions' in words and words.count('functions') > 1:
            question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
        
        # Pattern 4: Check if question contains invalid verb patterns
        invalid_question_patterns = [
            r'how\s+\w+\s+starts\s+with',
            r'how\s+\w+\s+typically\s+',
            r'how\s+\w+\s+usually\s+',
            r'how\s+\w+\s+often\s+',
        ]
        for pattern in invalid_question_patterns:
            if re.search(pattern, question_lower):
                question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
                break
        
        # Validate question is complete (has subject and verb)
        question_words = question_text.split()
        # Check if question is too short or missing key words
        if len(question_words) < 4:
            # Re-generate with complete question
            if difficulty_level == "Easy":
                question_text = f"What is {main_concept_clean}{topic_reference}?"
            elif difficulty_level == "Hard":
                question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
            else:
                question_text = f"Which statement best explains {main_concept_clean}{topic_reference}?"
        
        # Check for missing words - ensure question has proper structure
        if not any(word in question_lower for word in ['what', 'which', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe', 'define']):
            # Question is missing a question word, fix it
            if difficulty_level == "Easy":
                question_text = f"What is {main_concept_clean}{topic_reference}?"
            elif difficulty_level == "Hard":
                question_text = f"Which statement best describes {main_concept_clean}{topic_reference}?"
            else:
                question_text = f"Which statement best explains {main_concept_clean}{topic_reference}?"
        
        # Correct spelling in option
        option_a = self._correct_spelling(option_a)
        
        return question_text, option_a
    
    def _generate_quality_options(
        self, correct_sentence: str, main_concept: str, correct_option: str,
        difficulty_level: str, context_text: str, topic_keywords: Optional[List[str]] = None
    ) -> Dict[str, str]:
        """Generate high-quality, plausible distractors from same topic context"""
        import re
        
        # Extract other sentences from context for meaningful, same-style distractors
        all_sentences = [s.strip() for s in re.split(r'[.!?]\s+', context_text) if len(s.strip()) > 25 and len(s.strip()) < 180]
        
        # Prefer distractors similar in length to correct option (plausible MCQs)
        correct_len = len(correct_option)
        len_tolerance = (correct_len * 0.5, correct_len * 1.8)
        
        other_sentences = []
        for s in all_sentences:
            s_lower = s.lower()
            if s_lower == correct_sentence.lower()[:50]:
                continue
            if main_concept and main_concept.lower() in s_lower:
                continue
            # Prefer similar-length sentences (more plausible distractors)
            if len_tolerance[0] <= len(s) <= len_tolerance[1]:
                other_sentences.insert(0, s)
            elif topic_keywords and any(kw in s_lower for kw in topic_keywords if len(kw) > 3):
                other_sentences.append(s)
            else:
                other_sentences.append(s)
        
        other_sentences = other_sentences[:12]
        
        # Extract other concepts from context (excluding main concept)
        other_concepts = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', context_text)
        other_concepts = [c for c in other_concepts 
                         if c.lower() != main_concept.lower() 
                         and len(c.split()) <= 3 
                         and c.lower() not in {'chapter', 'section', 'content', 'topic', 'subject'}][:8]
        
        # Generate meaningful distractors from actual content
        distractors = []
        
        def _strip_metadata(t):
            t = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', t, flags=re.IGNORECASE)
            t = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', t, flags=re.IGNORECASE)
            t = re.sub(r'^(The|A|An)\s+', '', t, flags=re.IGNORECASE)
            return re.sub(r'\s+', ' ', t).strip()
        
        if other_sentences:
            for sent in other_sentences:
                if len(distractors) >= 3:
                    break
                distractor = _strip_metadata(sent[:100] if len(sent) > 100 else sent)
                if len(distractor) < 15:
                    continue
                if distractor.lower() == correct_option.lower()[:60]:
                    continue
                if any(distractor.lower() == d.lower()[:60] for d in distractors):
                    continue
                if len(distractor) > 100:
                    distractor = distractor[:97].rsplit(' ', 1)[0] + '...' if ' ' in distractor[:97] else distractor[:97] + '...'
                distractors.append(distractor)
        
        # Fallback: use other concepts from context (plausible wrong answers)
        while len(distractors) < 3 and other_concepts:
            c = other_concepts[len(distractors) % len(other_concepts)]
            stub = f"Describes {c} rather than {main_concept}." if main_concept else f"Describes {c}."
            if stub not in [d.lower() for d in distractors]:
                distractors.append(stub)
        
        while len(distractors) < 3:
            stubs = [
                "A related but different concept or process.",
                "Incorrect; does not match the definition.",
                "Partially correct but not the best description.",
            ]
            for s in stubs:
                if len(distractors) >= 3:
                    break
                if s not in distractors:
                    distractors.append(s)
        
        # Ensure all distractors are different and meaningful
        distractors = list(dict.fromkeys(distractors))  # Remove duplicates while preserving order
        while len(distractors) < 3:
            distractors.append("None of the above")
        
        # Combine correct option with distractors
        all_options = [correct_option] + distractors[:3]
        
        # Randomly shuffle the options
        random.shuffle(all_options)
        
        # Find which position the correct answer is now in
        correct_position = all_options.index(correct_option)
        option_letters = ["A", "B", "C", "D"]
        correct_answer_letter = option_letters[correct_position]
        
        # Clean all options to remove metadata before creating dict
        cleaned_options = []
        for opt in all_options:
            cleaned = str(opt).strip()
            # Remove metadata patterns
            cleaned = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'^(Chapter|Topic|Content|Section|Page)\s+[^:]*?:\s*', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'\b(Chapter|Topic|Content|Section|Page)\s+[^.]*?\s+', '', cleaned, flags=re.IGNORECASE)
            # Limit length to 100 chars
            if len(cleaned) > 100:
                cleaned = cleaned[:97] + "..."
            cleaned_options.append(cleaned)
        
        # Create options dict with cleaned options
        options = {
            "A": cleaned_options[0] if len(cleaned_options) > 0 else "Option A",
            "B": cleaned_options[1] if len(cleaned_options) > 1 else "Option B",
            "C": cleaned_options[2] if len(cleaned_options) > 2 else "Option C",
            "D": cleaned_options[3] if len(cleaned_options) > 3 else "None of the above"
        }
        
        return options, correct_answer_letter
    
    def _generate_quality_short_question(
        self, sentence: str, key_terms: List[str], question_index: int,
        topic_name: str, topic_normalized: str, difficulty_level: str, main_concept: Optional[str] = None
    ) -> tuple:
        """Generate high-quality short answer questions"""
        import re
        
        sentence_lower = sentence.lower()
        topic_context = f" in {topic_name}" if topic_normalized != "any" else ""
        
        # Detect sentence type
        is_definition = any(word in sentence_lower[:50] for word in ['is', 'are', 'means', 'defined as'])
        is_process = any(word in sentence_lower for word in ['process', 'steps', 'occurs', 'happens'])
        is_function = any(word in sentence_lower for word in ['function', 'purpose', 'role'])
        is_comparison = any(word in sentence_lower for word in ['than', 'compared', 'different', 'similar'])
        
        # Use key term if available
        if key_terms and question_index < len(key_terms):
            term = key_terms[question_index % len(key_terms)]
            
            if difficulty_level == "Easy":
                if is_definition:
                    question_text = f"What is {term}{topic_context}?"
                else:
                    question_text = f"Define {term}{topic_context}."
            elif difficulty_level == "Hard":
                if is_function:
                    question_text = f"Explain the function and significance of {term}{topic_context} in detail."
                elif is_process:
                    question_text = f"Describe the process involving {term}{topic_context} and its importance."
                else:
                    question_text = f"Analyze the role and significance of {term}{topic_context}."
            else:  # Medium
                # Medium questions: Conceptual, require understanding
                if is_function:
                    question_text = f"Explain the function and significance of {term}{topic_context}. How does it work and why is it important?"
                elif is_process:
                    question_text = f"Explain the mechanism and process of {term}{topic_context}. What are the key steps involved?"
                else:
                    question_text = f"Evaluate {term}{topic_context} and its role. What is its structure, function, and importance?"
            
            # Generate answer from sentence or create one - clean it first
            if sentence and len(sentence.strip()) > 20:
                correct_answer = sentence.strip()
                # Remove metadata patterns like "Chapter X Topic Y Content"
                correct_answer = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
                correct_answer = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
                correct_answer = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
                # Remove any remaining metadata patterns
                correct_answer = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', correct_answer, flags=re.IGNORECASE)
            else:
                correct_answer = f"{term} is an important concept{topic_context} with specific characteristics and functions."
        else:
            # Generate from sentence
            concept = main_concept if main_concept else self._extract_main_concept(sentence, [])
            
            if difficulty_level == "Easy":
                question_starters = ["What is", "What are", "Define"]
                starter = question_starters[question_index % len(question_starters)]
                question_text = f"{starter} {concept}{topic_context}?"
            elif difficulty_level == "Hard":
                question_starters = ["Analyze", "Evaluate", "Compare and contrast"]
                starter = question_starters[question_index % len(question_starters)]
                question_text = f"{starter} {concept}{topic_context}."
            else:  # Medium
                question_starters = ["Explain", "Describe", "What is the function of"]
                starter = question_starters[question_index % len(question_starters)]
                question_text = f"{starter} {concept}{topic_context}?"
            
            # Use sentence as answer, cleaned up
            correct_answer = sentence.strip() if sentence and len(sentence.strip()) > 15 else f"{concept} is an important concept{topic_context}."
        
        # Clean up answer - remove metadata and normalize
        # Remove metadata patterns like "Chapter X Topic Y Content"
        correct_answer = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        correct_answer = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        correct_answer = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        # Remove any remaining metadata patterns
        correct_answer = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', correct_answer, flags=re.IGNORECASE)
        
        # Normalize spaces but preserve word boundaries
        correct_answer = re.sub(r'\s+', ' ', correct_answer).strip()
        if len(correct_answer) < 10:
            correct_answer = f"This concept is important{topic_context} and has specific characteristics and functions."
        
        # Correct spelling in answer (this will preserve spaces)
        correct_answer = self._correct_spelling(correct_answer)
        
        # Final cleanup - normalize spaces (fix any corrupted spacing)
        # First fix text with spaces between letters
        correct_answer = self._fix_spacing_issues(correct_answer)
        
        return question_text, correct_answer[:250]  # Limit answer length
    
    def _generate_quality_long_question(
        self, sentence: str, context_text: str, key_terms: List[str], question_index: int,
        topic_name: str, topic_normalized: str, difficulty_level: str, main_concept: Optional[str] = None,
        chunks: Optional[List] = None
    ) -> tuple:
        """Generate high-quality long answer questions (typically 5-10 marks)"""
        import re
        
        sentence_lower = sentence.lower()
        topic_context = f" in {topic_name}" if topic_normalized != "any" else ""
        
        # Detect sentence type for better question generation
        is_definition = any(word in sentence_lower[:50] for word in ['is', 'are', 'means', 'defined as'])
        is_process = any(word in sentence_lower for word in ['process', 'steps', 'occurs', 'happens', 'mechanism'])
        is_function = any(word in sentence_lower for word in ['function', 'purpose', 'role', 'significance'])
        is_comparison = any(word in sentence_lower for word in ['than', 'compared', 'different', 'similar', 'unlike', 'versus'])
        is_explanation = any(word in sentence_lower for word in ['explain', 'describe', 'discuss', 'analyze'])
        
        # Generate question based on sentence type and difficulty
        if difficulty_level == "Easy":
            if is_process:
                question_text = f"Describe the process of {main_concept}{topic_context} in detail."
            elif is_function:
                question_text = f"Explain the function and importance of {main_concept}{topic_context}."
            elif is_definition:
                question_text = f"Define {main_concept}{topic_context} and explain its key characteristics."
            else:
                question_text = f"Explain {main_concept}{topic_context} in detail."
        
        elif difficulty_level == "Hard":
            if is_comparison:
                question_text = f"Compare and contrast {main_concept}{topic_context} with related concepts. Discuss similarities and differences."
            elif is_process:
                question_text = f"Analyze the mechanism and significance of {main_concept}{topic_context}. Explain each step in detail."
            elif is_function:
                question_text = f"Evaluate the role and significance of {main_concept}{topic_context}. Discuss its importance and implications."
            else:
                question_text = f"Critically analyze {main_concept}{topic_context}. Discuss its characteristics, functions, and significance in detail."
        
        else:  # Medium
            # Medium questions: Conceptual, require understanding and application
            if is_process:
                question_text = f"Analyze the process of {main_concept}{topic_context}. Explain the mechanism, key steps involved, and its significance."
            elif is_function:
                question_text = f"Evaluate the function and role of {main_concept}{topic_context}. Discuss how it works and why it is important in the overall system."
            elif is_explanation:
                question_text = f"Critically examine {main_concept}{topic_context}. Explain its structure, characteristics, functions, and significance in detail."
            else:
                question_text = f"Analyze {main_concept}{topic_context} comprehensively. Discuss its structure, how it functions, and its importance."
        
        # Ensure question text has proper spacing (fix any corrupted spacing)
        question_text = self._fix_spacing_issues(question_text)
        
        # Generate comprehensive answer for long questions
        # Combine multiple sentences from context for a detailed answer
        answer_parts = []
        
        # Start with the main sentence - clean metadata first
        # ALWAYS use the sentence that generated the question as the primary answer
        if sentence and len(sentence.strip()) > 20:
            clean_sentence = sentence.strip()
            # Remove metadata patterns
            clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
            clean_sentence = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
            clean_sentence = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', clean_sentence, flags=re.IGNORECASE)
            clean_sentence = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', clean_sentence, flags=re.IGNORECASE)
            answer_parts.append(clean_sentence)
        
        # Add related sentences from context - ONLY from same topic/chunk
        if chunks:
            # Get additional context from chunks - prioritize chunks with same topic/concept
            related_sentences = []
            for chunk in chunks[:3]:  # Use up to 3 chunks
                # Check if chunk is related to the main concept
                chunk_text_lower = chunk.text_content.lower()
                is_related = False
                
                # Check if chunk contains the main concept
                if main_concept and main_concept.lower() in chunk_text_lower:
                    is_related = True
                # Check if chunk contains key terms from the question sentence
                elif any(term.lower() in chunk_text_lower for term in key_terms[:5] if term):
                    is_related = True
                
                # Only use chunks that are related to the question
                if is_related:
                    chunk_sentences = [s.strip() for s in re.split(r'[.!?]\s+', chunk.text_content) 
                                     if len(s.strip()) > 30 and len(s.strip()) < 200]
                    # Filter sentences related to the concept - must contain concept or key terms
                    for cs in chunk_sentences[:2]:  # Take up to 2 sentences per chunk
                        cs_lower = cs.lower()
                        # Only include if it's related to the main concept or key terms
                        if (main_concept and main_concept.lower() in cs_lower) or \
                           any(term.lower() in cs_lower for term in key_terms[:5] if term):
                            # Don't add if it's the same as the main sentence
                            if cs_lower != sentence.lower()[:100]:
                                related_sentences.append(cs)
            
            # Add unique related sentences - clean metadata from each
            seen = set()
            for rs in related_sentences[:4]:  # Add up to 4 related sentences
                rs_hash = hash(rs[:50])
                if rs_hash not in seen:
                    # Clean metadata from related sentences
                    clean_rs = re.sub(r'^Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', rs, flags=re.IGNORECASE)
                    clean_rs = re.sub(r'^Chapter\s+[^.]*?\s+Content\s+', '', clean_rs, flags=re.IGNORECASE)
                    clean_rs = re.sub(r'^Topic\s+[^.]*?\s+Content\s+', '', clean_rs, flags=re.IGNORECASE)
                    clean_rs = re.sub(r'^(Chapter|Topic|Content)\s+[^:]*?:\s*', '', clean_rs, flags=re.IGNORECASE)
                    answer_parts.append(clean_rs)
                    seen.add(rs_hash)
        
        # If we don't have enough content, generate a comprehensive answer
        if len(answer_parts) < 2:
            # Create a detailed answer based on the concept
            if is_process:
                answer_parts.append(f"The process involves several key steps that work together to achieve the desired outcome.")
            if is_function:
                answer_parts.append(f"This plays a crucial role in maintaining proper functioning and balance.")
            answer_parts.append(f"Understanding {main_concept}{topic_context} is essential for comprehending the broader concepts in this subject.")
        
        # Combine answer parts into a comprehensive answer with proper spacing
        correct_answer = " ".join(answer_parts)
        
        # Remove metadata patterns from the combined answer
        correct_answer = re.sub(r'Chapter\s+[^.]*?\s+Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        correct_answer = re.sub(r'Chapter\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        correct_answer = re.sub(r'Topic\s+[^.]*?\s+Content\s+', '', correct_answer, flags=re.IGNORECASE)
        correct_answer = re.sub(r'(Chapter|Topic|Content)\s+[^:]*?:\s*', '', correct_answer, flags=re.IGNORECASE)
        
        # Ensure answer is comprehensive (at least 100 words for long questions)
        if len(correct_answer.split()) < 100:
            # Add more detail with proper spacing
            main_concept_spaced = main_concept if main_concept else "this concept"
            additional_info = f" {main_concept_spaced}{topic_context} is an important concept that requires detailed understanding. "
            additional_info += f"It involves various aspects and characteristics that are fundamental to the subject. "
            additional_info += f"Students should be able to explain this concept thoroughly, including its key features, "
            additional_info += f"functions, and significance in the broader context of the curriculum."
            correct_answer += additional_info
        
        # Clean up answer - normalize spaces but preserve word boundaries
        correct_answer = re.sub(r'\s+', ' ', correct_answer).strip()
        
        # Fix spacing issues first (remove spaces between letters)
        correct_answer = self._fix_spacing_issues(correct_answer)
        
        # Then correct spelling (this will preserve proper spacing)
        correct_answer = self._correct_spelling(correct_answer)
        
        # Final spacing fix after spell check (in case spell check introduced issues)
        correct_answer = self._fix_spacing_issues(correct_answer)
        
        # Ensure minimum length for long questions (at least 150 words)
        word_count = len(correct_answer.split())
        if word_count < 150:
            # Add concluding statement with proper spacing
            main_concept_spaced = main_concept if main_concept else "this concept"
            correct_answer += f" In conclusion, {main_concept_spaced}{topic_context} represents a fundamental concept that "
            correct_answer += f"students must understand thoroughly. Mastery of this topic is essential for success "
            correct_answer += f"in examinations and for building a strong foundation in the subject."
        
        # Final cleanup - fix spacing issues (remove spaces between letters within words)
        correct_answer = self._fix_spacing_issues(correct_answer)
        
        return question_text, correct_answer[:1000]  # Limit to 1000 chars for long answers
    
    def _generate_distractor(self, correct_sentence: str, main_concept: str, distractor_type: str) -> str:
        """Generate realistic distractors for MCQ options"""
        try:
            # Extract some words from the correct sentence to create plausible distractors
            words = correct_sentence.split()
            if len(words) > 5:
                # Create a distractor by modifying the sentence slightly
                if distractor_type == "related":
                    return f"A concept related to {main_concept} with similar characteristics"
                elif distractor_type == "secondary":
                    return f"A secondary aspect of {main_concept}"
                elif distractor_type == "alternative":
                    return f"An alternative explanation for {main_concept}"
                elif distractor_type == "different":
                    return f"A different interpretation of {main_concept}"
                else:  # unrelated
                    return f"An unrelated concept not associated with {main_concept}"
            else:
                # Fallback generic distractors
                if distractor_type == "related":
                    return f"A related concept to {main_concept}"
                elif distractor_type == "secondary":
                    return f"A secondary aspect of {main_concept}"
                elif distractor_type == "alternative":
                    return f"An alternative view of {main_concept}"
                elif distractor_type == "different":
                    return f"A different perspective on {main_concept}"
                else:  # unrelated
                    return f"An unrelated concept to {main_concept}"
        except Exception as e:
            logger.warning(f"Error generating distractor: {e}, using fallback")
            return f"An option related to {main_concept if main_concept else 'this concept'}"
    
    def _format_question(
        self,
        raw_question: Dict[str, Any],
        question_type: str,
        difficulty_level: str,
        subject_id: int,
        chunk_ids: List[str],
        topic_name: Optional[str] = None
    ) -> Optional[QuestionCreate]:
        """Format and validate a single question with topic validation"""
        try:
            difficulty = self.formatter.validate_difficulty_level(difficulty_level)
            
            if question_type == "MCQ":
                # Get raw question components
                raw_question_text = raw_question.get("question_text", "")
                raw_options = raw_question.get("options", {})
                raw_answer = raw_question.get("correct_answer", "A")
                
                # Validate and fix question text
                if not raw_question_text or len(raw_question_text.strip()) < 3:
                    logger.warning(f"Question text too short or empty: '{raw_question_text}', using fallback")
                    raw_question_text = "What does the textbook say about this concept?"
                
                # Ensure question ends with ?
                if not raw_question_text.strip().endswith('?'):
                    raw_question_text = raw_question_text.strip() + '?'
                
                # Format MCQ
                formatted = self.formatter.format_mcq(
                    raw_question_text,
                    raw_options,
                    raw_answer
                )
                
                # Get formatted components
                final_question_text = formatted.get("question_text", raw_question_text)
                final_options = formatted.get("options", {})
                final_answer = formatted.get("correct_answer", raw_answer)
                
                # Ensure question text is valid
                if not final_question_text or len(final_question_text.strip()) < 3:
                    final_question_text = "What does the textbook say about this concept?"
                
                # Ensure question ends with ?
                if not final_question_text.strip().endswith('?'):
                    final_question_text = final_question_text.strip() + '?'
                
                # Validate and fix options - ensure all 4 are present
                if not final_options or not isinstance(final_options, dict):
                    final_options = {}
                
                required_opts = ['A', 'B', 'C', 'D']
                for opt in required_opts:
                    if opt not in final_options or not final_options[opt] or len(str(final_options[opt]).strip()) < 1:
                        # Generate a default option
                        if opt == 'A':
                            final_options[opt] = "The correct answer based on textbook content"
                        else:
                            final_options[opt] = f"Option {opt}"
                
                # Ensure correct answer is valid
                if final_answer not in required_opts:
                    final_answer = "A"
                
                logger.info(f"Creating MCQ: '{final_question_text[:60]}...' (length: {len(final_question_text)}, options: {len(final_options)}, answer: {final_answer})")
                
                return QuestionCreate(
                    subject_id=subject_id,
                    question_text=final_question_text,
                    question_type="MCQ",
                    difficulty_level=difficulty,
                    options=final_options,
                    correct_answer=final_answer,
                    explanation=raw_question.get("explanation", "Generated from textbook content"),
                    source_chunk_ids=chunk_ids
                )
            
            elif question_type == "Short":
                raw_question_text = raw_question.get("question_text", "")
                raw_answer = raw_question.get("correct_answer", "")
                
                # Validate question text
                if not raw_question_text or len(raw_question_text.strip()) < 3:
                    logger.warning(f"Short question text too short: '{raw_question_text}', using fallback")
                    raw_question_text = "Explain this concept."
                
                # Ensure question ends with ?
                if not raw_question_text.strip().endswith('?'):
                    raw_question_text = raw_question_text.strip() + '?'
                
                # Validate answer
                if not raw_answer or len(raw_answer.strip()) < 3:
                    logger.warning(f"Short question answer too short: '{raw_answer}', using fallback")
                    raw_answer = "This concept is discussed in the textbook."
                
                formatted = self.formatter.format_short_question(
                    raw_question_text,
                    raw_answer
                )
                
                # Validate question text - be lenient
                formatted_question_text = formatted.get("question_text", raw_question_text)
                formatted_answer = formatted.get("correct_answer", raw_answer)
                
                if not self.formatter.validate_question_text(formatted_question_text, "Short"):
                    logger.warning(f"Short question failed validation, fixing: {formatted_question_text[:50]}")
                    if len(formatted_question_text.strip()) < 5:
                        formatted_question_text = formatted_question_text.strip() + "?"
                    # If still invalid, use fallback
                    if not self.formatter.validate_question_text(formatted_question_text, "Short"):
                        formatted_question_text = "Explain this concept."
                
                return QuestionCreate(
                    subject_id=subject_id,
                    question_text=formatted_question_text,
                    question_type="Short",
                    difficulty_level=difficulty,
                    correct_answer=formatted_answer,
                    explanation=raw_question.get("explanation", "Generated from textbook content"),
                    source_chunk_ids=chunk_ids
                )
            
            else:  # Long question
                raw_question_text = raw_question.get("question_text", "")
                raw_answer = raw_question.get("correct_answer", "")
                
                # Validate question text
                if not raw_question_text or len(raw_question_text.strip()) < 5:
                    logger.warning(f"Long question text too short: '{raw_question_text}', using fallback")
                    raw_question_text = "Explain this concept in detail."
                
                # Validate answer - Long questions need comprehensive answers
                if not raw_answer or len(raw_answer.strip()) < 50:
                    logger.warning(f"Long question answer too short: '{raw_answer[:50]}', using fallback")
                    raw_answer = "This concept requires a detailed explanation covering its key characteristics, functions, and significance as discussed in the textbook."
                
                # Ensure answer is comprehensive (at least 100 words)
                word_count = len(raw_answer.split())
                if word_count < 100:
                    raw_answer += " Additional details include various aspects and implications that are important for a complete understanding of this topic."
                
                # Format long question using formatter
                formatted = self.formatter.format_long_question(
                    raw_question_text,
                    raw_answer
                )
                
                # Get formatted components
                formatted_question_text = formatted.get("question_text", raw_question_text)
                formatted_answer = formatted.get("correct_answer", raw_answer)
                
                # Validate question text
                if not self.formatter.validate_question_text(formatted_question_text, "Long"):
                    logger.warning(f"Long question failed validation, fixing: {formatted_question_text[:50]}")
                    if len(formatted_question_text.strip()) < 10:
                        formatted_question_text = "Explain this concept in detail."
                    # If still invalid, use fallback
                    if not self.formatter.validate_question_text(formatted_question_text, "Long"):
                        formatted_question_text = "Explain this concept in detail."
                
                logger.info(f"Creating Long question: '{formatted_question_text[:60]}...' (answer length: {len(formatted_answer.split())} words)")
                
                return QuestionCreate(
                    subject_id=subject_id,
                    question_text=formatted_question_text,
                    question_type="Long",
                    difficulty_level=difficulty,
                    correct_answer=formatted_answer,
                    explanation=raw_question.get("explanation", "Generated from textbook content"),
                    source_chunk_ids=chunk_ids
                )
        
        except Exception as e:
            logger.error(f"Error formatting question: {e}")
            import traceback
            logger.error(f"Format error traceback: {traceback.format_exc()}")
            # NEVER return None - always return a valid fallback question
            try:
                # Create a minimal valid question as fallback
                fallback_question_text = raw_question.get("question_text", "What does the textbook say about this concept?")
                if not fallback_question_text or len(fallback_question_text.strip()) < 5:
                    fallback_question_text = "What does the textbook say about this concept?"
                if not fallback_question_text.strip().endswith('?'):
                    fallback_question_text = fallback_question_text.strip() + '?'
                
                if question_type == "MCQ":
                    fallback_options = raw_question.get("options", {})
                    if not fallback_options or len(fallback_options) < 4:
                        fallback_options = {
                            "A": "The correct answer based on textbook content",
                            "B": "An alternative option",
                            "C": "Another option",
                            "D": "None of the above"
                        }
                    return QuestionCreate(
                        subject_id=subject_id,
                        question_text=fallback_question_text,
                        question_type="MCQ",
                        difficulty_level=difficulty_level,
                        options=fallback_options,
                        correct_answer=raw_question.get("correct_answer", "A"),
                        explanation=raw_question.get("explanation", "Generated from textbook content"),
                        source_chunk_ids=chunk_ids
                    )
                else:
                    return QuestionCreate(
                        subject_id=subject_id,
                        question_text=fallback_question_text,
                        question_type="Short",
                        difficulty_level=difficulty_level,
                        correct_answer=raw_question.get("correct_answer", "This concept is discussed in the textbook."),
                        explanation=raw_question.get("explanation", "Generated from textbook content"),
                        source_chunk_ids=chunk_ids
                    )
            except Exception as fallback_error:
                logger.error(f"Even fallback question creation failed: {fallback_error}")
                # Last resort - create absolute minimal question
                return QuestionCreate(
                    subject_id=subject_id,
                    question_text="What does the textbook say about this concept?",
                    question_type=question_type,
                    difficulty_level=difficulty_level,
                    options={"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"} if question_type == "MCQ" else None,
                    correct_answer="A" if question_type == "MCQ" else "This concept is discussed in the textbook.",
                    explanation="Generated from textbook content",
                    source_chunk_ids=chunk_ids
                )
    
    async def _save_question(self, question_data: QuestionCreate) -> GeneratedQuestion:
        """Save generated question to database"""
        # Convert options dict to JSON string
        options_json = json.dumps(question_data.options) if question_data.options else None
        
        # Create question
        from app.core.config import settings

        _ap = (
            "pending"
            if getattr(settings, "REQUIRE_GENERATED_QUESTION_APPROVAL", False)
            else "approved"
        )
        db_question = GeneratedQuestion(
            subject_id=question_data.subject_id,
            question_text=question_data.question_text,
            question_type=question_data.question_type,
            difficulty_level=question_data.difficulty_level,
            options=options_json,
            correct_answer=question_data.correct_answer,
            explanation=question_data.explanation,
            is_approved=_ap,
        )
        
        self.db.add(db_question)
        await self.db.flush()  # Flush to get question_id
        
        # Associate with source chunks
        if question_data.source_chunk_ids:
            chunk_associations = [
                {"question_id": db_question.question_id, "chunk_id": chunk_id}
                for chunk_id in question_data.source_chunk_ids
            ]
            await self.db.execute(
                insert(question_chunks).values(chunk_associations)
            )
        
        await self.db.commit()
        await self.db.refresh(db_question)
        
        return db_question

