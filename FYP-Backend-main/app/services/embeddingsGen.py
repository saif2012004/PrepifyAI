"""
Robust OCR-Based Past Paper Question Extractor with all-MiniLM-L6-v2 Embeddings
Handles scanned PDFs with OCR errors, inconsistent formatting, and missing sections
"""

import os
import re
import json
import PyPDF2
import pytesseract
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError
from sentence_transformers import SentenceTransformer
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import unicodedata

from app.core.config import settings

class RobustPastPaperProcessor:
    def __init__(self):
        print("Loading all-MiniLM-L6-v2 model...")
        self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
        print("Model loaded successfully!")
        self._configure_tesseract()
        self.poppler_path = self._resolve_poppler_path()
        
        # OCR-friendly section patterns (flexible matching)
        self.section_patterns = {
            'A': r'SECTION\s*[—\-–_]*\s*[A&@]\b',
            'B': r'SECTION\s*[—\-–_]*\s*[B8]\b',
            'C': r'SECTION\s*[—\-–_]*\s*[C€]\b'
        }

    def _configure_tesseract(self) -> None:
        """Configure tesseract path from settings if provided."""
        if getattr(settings, "TESSERACT_PATH", None):
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_PATH

    def _resolve_poppler_path(self) -> Optional[str]:
        """Resolve poppler path from settings or environment for pdf2image."""
        candidate = getattr(settings, "POPPLER_PATH", None) or os.getenv("POPPLER_PATH")
        if candidate:
            expanded = Path(candidate).expanduser()
            if expanded.exists():
                print(f"Using poppler from: {expanded}")
                return str(expanded)
            print(f"POPPLER_PATH is set but does not exist: {expanded}")
        return None
        
    def extract_english_only(self, text: str) -> str:
        """Remove Urdu text and clean English content"""
        # Remove Urdu Unicode ranges
        text = re.sub(r'[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+', '', text)
        # Remove Arabic presentation forms
        text = re.sub(r'[\uFE70-\uFEFF]+', '', text)
        return text
    
    def clean_ocr_artifacts(self, text: str) -> str:
        """Clean common OCR errors and artifacts"""
        # Fix common OCR mistakes
        replacements = {
            r'[|!l1]{2,}': '||',  # Multiple pipes/ones
            r'[@&]': 'A',  # Common A replacements
            r'[€]': 'C',  # Common C replacements
            r'[8](?=\s*\(|$)': 'B',  # 8 to B in section headers
            r'[—–_]{2,}': '—',  # Multiple dashes to single
            r'\s+': ' ',  # Multiple spaces to single
        }
        
        for pattern, replacement in replacements.items():
            text = re.sub(pattern, replacement, text)
        
        return text.strip()
    
    def remove_instructions(self, text: str) -> str:
      """Remove all instructions, headers, admin boilerplate, and section metadata from text."""
      patterns = [
          r'is compulsory\.*.*?(?:\.|$)',   # is compulsory...
          r'a\|\| parts of this section.*?(?:\.|$)', # All parts...
          r'handed over to the Centre Superintendent.*?(?:\.|$)', # handed over...
          r'Deleting/overwriting is not a\|\|owed.*?(?:\.|$)', # Deleting...
          r'Do not use lead pencil.*?(?:\.|$)',
          r'Fi\|\| the relevant bubble.*?(?:\.|$)',
          r'ROLL NUMBER.*',                   # ROLL NUMBER and whatever after
          r'Answer Sheet No\..*',
          r'Sign\.? of Candidate.*',
          r'Sign\.? of Invigilator.*',
          r'SECTION\s*[—\-–_]*\s*[A-Za-z0-9]+.*\(Marks.*\)', # Section — A (Marks 12) etc.
          r'Time a\|\|owed.*?(?:\.|$)',
          r'LiL Sy Pt.*?(?:\.|$)',              # Random gibberish often before 1st real MCQ
          r'[©®¢]+',                           # Remove random copyright chars
          r'\(\d{2} marks?\)',                 # e.g. (12 marks)
          r'BIOLOGY SSC-I',                    # Remove subject/class line too
          r'eS WE EA.*?(?:\.|$)',              # Remove any gibberish line at start
          r'\s{2,}',                           # Remove multiple spaces
          r'^\s+',                             # Remove line-leading spaces
          r'[|]{2,}',                          # Consecutive pipes
      ]
      out = text
      for pat in patterns:
          out = re.sub(pat, '', out, flags=re.IGNORECASE)
      return out.strip()



    def clean_mcq_text(self, text: str) -> str:
      """Clean MCQ section text by removing strictly admin/instruction lines, but preserve questions/options."""
      mcq_noise = [
          r'is compulsory',
          r'parts of this section',
          r'Superintendent',
          r'Deleting/overwriting',
          r'use lead pencil',
          r'relevant bubble',
          r'ROLL NUMBER',
          r'Answer Sheet No',
          r'Sign\.? of Candidate',
          r'Sign\.? of Invigilator',
          r'SECTION\s*[—\-–_]*\s*[A-Z0-9]+',
          r'\(Marks.*?\)',
          r'Time allowed',
          r'Marks?[:=]?\s*\d+',
          r'BIOLOGY SSC-I',
          r'^[\s\W]*$',          # Blank or symbol-only lines
          r'^[©®¢]+$',           # Only symbol lines
      ]
      lines = text.split('\n')
      filtered = []
      for line in lines:
          # Only remove if the line matches noise AND contains NO MCQ option "O "
          if not (any(re.search(pat, line, re.IGNORECASE) for pat in mcq_noise) and "O " not in line):
              filtered.append(line)
      # Join lines, strip leftover symbols/spaces if needed
      out = '\n'.join(filtered)
      out = re.sub(r'[|]+', '', out)
      out = re.sub(r'\s+', ' ', out)
      return out.strip()


    
    def extract_text_with_ocr(self, pdf_path: str) -> str:
        """Extract text from PDF using OCR for scanned documents"""
        print(f"Converting PDF to images for OCR...")
        try:
            # First try regular text extraction
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                
                # If text is too short, likely scanned - use OCR
                if len(text.strip()) < 100:
                    print("PDF appears to be scanned. Using OCR...")
                    text = self._ocr_pdf(pdf_path)
                
                return text
        except Exception as e:
            print(f"Error reading {pdf_path}: {e}")
            print("Attempting OCR...")
            return self._ocr_pdf(pdf_path)
    
    def _ocr_pdf(self, pdf_path: str) -> str:
        """Perform OCR on PDF images"""
        try:
            poppler_args = {"poppler_path": self.poppler_path} if self.poppler_path else {}
            images = convert_from_path(pdf_path, dpi=300, **poppler_args)
            full_text = ""
            
            for i, image in enumerate(images):
                print(f"  OCR processing page {i+1}/{len(images)}...")
                page_text = pytesseract.image_to_string(image, lang='eng')
                full_text += page_text + "\n\n"
            
            return full_text
        except (PDFInfoNotInstalledError, PDFPageCountError) as e:
            print(f"OCR failed: {e}")
            if not self.poppler_path:
                print("Hint: set POPPLER_PATH to the poppler 'bin' directory (e.g. C:/poppler/Library/bin).")
            return ""
        except Exception as e:
            print(f"OCR failed: {e}")
            return ""
    
    def extract_metadata_from_filename(self, filename: str) -> Dict:
        """Extract metadata from filename patterns"""
        metadata = {
            "year": "Unknown",
            "board": "Unknown",
            "subject": "Unknown",
            "class": "Unknown"
        }
        
        # Extract year
        year_match = re.search(r'20\d{2}', filename)
        if year_match:
            metadata["year"] = year_match.group(0)
        
        # Extract board
        filename_upper = filename.upper()
        if any(x in filename_upper for x in ['PUNJAB', 'PB', 'LHR', 'LAHORE']):
            metadata["board"] = "Punjab"
        elif any(x in filename_upper for x in ['SINDH', 'SD', 'KHI', 'KARACHI']):
            metadata["board"] = "Sindh"
        elif any(x in filename_upper for x in ['FEDERAL', 'FED', 'FB', 'ISB']):
            metadata["board"] = "Federal"
        
        # Extract subject
        if 'BIO' in filename_upper:
            metadata["subject"] = "Biology"
        elif 'CHEM' in filename_upper:
            metadata["subject"] = "Chemistry"
        elif 'PHY' in filename_upper:
            metadata["subject"] = "Physics"
        elif 'MATH' in filename_upper:
            metadata["subject"] = "Mathematics"
        
        # Extract class
        if 'SSC' in filename_upper:
            if 'II' in filename_upper or '2' in filename_upper:
                metadata["class"] = "SSC-II"
            else:
                metadata["class"] = "SSC-I"
        elif 'HSSC' in filename_upper:
            if 'II' in filename_upper or '2' in filename_upper:
                metadata["class"] = "HSSC-II"
            else:
                metadata["class"] = "HSSC-I"
        
        return metadata
    
    def extract_metadata_from_content(self, content: str, filename_metadata: Dict) -> Dict:
        """Extract or refine metadata from document content"""
        metadata = filename_metadata.copy()
        content_upper = content.upper()
        
        # Update year if found in content
        year_match = re.search(r'20\d{2}', content[:500])
        if year_match and metadata["year"] == "Unknown":
            metadata["year"] = year_match.group(0)
        
        # Update board
        if metadata["board"] == "Unknown":
            if "PUNJAB" in content_upper[:1000]:
                metadata["board"] = "Punjab"
            elif "SINDH" in content_upper[:1000]:
                metadata["board"] = "Sindh"
            elif "FEDERAL" in content_upper[:1000]:
                metadata["board"] = "Federal"
        
        # Update subject
        if metadata["subject"] == "Unknown":
            if "BIOLOGY" in content_upper[:1000]:
                metadata["subject"] = "Biology"
            elif "CHEMISTRY" in content_upper[:1000]:
                metadata["subject"] = "Chemistry"
            elif "PHYSICS" in content_upper[:1000]:
                metadata["subject"] = "Physics"
        
        # Update class
        if metadata["class"] == "Unknown":
            class_match = re.search(r'(SSC|HSSC)[–\-\s]*(I+|II|1|2)', content[:1000])
            if class_match:
                level = class_match.group(1)
                num = class_match.group(2)
                if num in ['II', '2']:
                    metadata["class"] = f"{level}-II"
                else:
                    metadata["class"] = f"{level}-I"
        
        return metadata
    
    def find_section(self, content: str, section_letter: str) -> Optional[str]:
        """Find section content with OCR-robust pattern matching"""
        pattern = self.section_patterns.get(section_letter)
        if not pattern:
            return None
        
        # Find section start
        section_match = re.search(pattern, content, re.IGNORECASE)
        if not section_match:
            return None
        
        start_pos = section_match.end()
        
        # Find next section or end
        next_sections = []
        for other_letter, other_pattern in self.section_patterns.items():
            if other_letter != section_letter:
                next_match = re.search(other_pattern, content[start_pos:], re.IGNORECASE)
                if next_match:
                    next_sections.append(start_pos + next_match.start())
        
        if next_sections:
            end_pos = min(next_sections)
        else:
            end_pos = len(content)
        
        return content[start_pos:end_pos]
    
    def extract_mcqs(self, section_text: str) -> List[Dict]:
      # Basic cleaning steps
      section_text = self.clean_ocr_artifacts(section_text)
      section_text = self.extract_english_only(section_text)
      
      print("Extracted Text before cleaning: \n", section_text)

      section_text = self.clean_mcq_text(section_text)

      # Pattern to find MCQ blocks (greedy from a question phrase, followed by at least 3 O options)
      # Accepts question phrases ending with '?', ':', or nothing (since OCR may lose punctuation)
      pattern = r'([A-Za-z0-9\,\'\"\(\)\-\s]{8,100}(?:\?|\:)?\s*)((?:O [^O]+?){3,6})'
      matches = re.findall(pattern, section_text)

      questions = []
      for stem, opts in matches:
          qtext = stem + " " + opts
          qtext = re.sub(r'\s+', ' ', qtext)
          # Filter out weird/junk blocks
          if qtext.count('O ') >= 3 and len(qtext) < 300 and not qtext.lower().startswith(('answer', 'roll', 'sign', 'bio', 'section', 'marks', 'time')):
              questions.append({
                  "question_text": qtext.strip(),
                  "question_type": "mcq",
                  "marks": 1
              })
      return questions


    def split_questions_on_or(self, questions: List[Dict]) -> List[Dict]:
      """Split questions on 'OR' (always capital, spaces optional) and generate new embeddings for each part."""
      split_questions = []
      for q in questions:
          # Split on "OR" only, spaces optional
          parts = re.split(r'\s*OR\s*|\s*\(it\)\s*', q["question_text"])
          parts = [p.strip() for p in parts if len(p.strip()) >= 10]
          if len(parts) > 1:
              # Generate embeddings for split parts
              embeddings = self.model.encode(parts, show_progress_bar=False)
              for i, part in enumerate(parts):
                  split_questions.append({
                      "question_text": part,
                      "question_type": q["question_type"],
                      "marks": q.get("marks", 1),
                      "embedding": embeddings[i].tolist() if i < len(embeddings) else q["embedding"]
                  })
          else:
              split_questions.append(q)
      return split_questions

    
    def extract_short_questions(self, section_text: str) -> List[Dict]:
      """Extract short questions, handling OR alternatives as separate questions"""
      questions = []

      # Clean section text
      section_text = self.clean_ocr_artifacts(section_text)
      section_text = self.extract_english_only(section_text)
      section_text = self.remove_instructions(section_text)

      # Pattern to match numbered questions (i), ii), etc.)
      main_pattern = r'\(([ivxIVX\d]+(?:\|*)?)\)\s*(.+?)(?=\([ivxIVX\d]+(?:\|*)?\)|$)'
      matches = re.findall(main_pattern, section_text, re.IGNORECASE | re.DOTALL)

      for num, full_question_block in matches:
          # Split by OR: space before OR required, space after optional
          or_alternatives = re.split(r'\s+OR\s*', full_question_block, flags=re.IGNORECASE)

          for question_text in or_alternatives:
              question_text = question_text.strip()
              if len(question_text) < 20:
                  continue

              # Check for sub-parts (a, b, c)
              sub_parts = self.extract_sub_parts(question_text)

              if sub_parts:
                  main_text = sub_parts['main']
                  for sub_label, sub_text in sub_parts['parts']:
                      combined = f"{main_text} {sub_label} {sub_text}".strip()
                      combined = self.remove_instructions(combined)
                      combined = re.sub(r'\s+', ' ', combined).strip()
                      marks = self.extract_marks(combined)
                      combined = re.sub(
                          r'\d+\.?\d*\s*[\+x×]\s*\d+\.?\d*|Marks?\s*[:=]?\s*\d+',
                          '',
                          combined,
                          flags=re.IGNORECASE
                      ).strip()
                      if len(combined) >= 15:
                          questions.append({
                              "question_text": combined,
                              "question_type": "short",
                              "marks": marks if marks else 1.5
                          })
              else:
                  # No sub-parts
                  question_text = self.remove_instructions(question_text)
                  question_text = re.sub(r'\s+', ' ', question_text).strip()
                  marks = self.extract_marks(question_text)
                  question_text = re.sub(
                      r'\d+\.?\d*\s*[\+x×]\s*\d+\.?\d*|Marks?\s*[:=]?\s*\d+',
                      '',
                      question_text,
                      flags=re.IGNORECASE
                  ).strip()
                  if len(question_text) >= 20:
                      questions.append({
                          "question_text": question_text,
                          "question_type": "short",
                          "marks": marks if marks else 3
                      })

      return questions

    
    def extract_sub_parts(self, text: str) -> Optional[Dict]:
        """Extract sub-parts (a, b, c) from a question"""
        # Pattern to find sub-parts like "a Green leaves b Heredity"
        sub_pattern = r'\b([a-d])\s+([A-Z][^\n]+?)(?=\s+[a-d]\s+[A-Z]|$)'
        sub_matches = re.findall(sub_pattern, text)
        
        if len(sub_matches) >= 2:  # At least 2 sub-parts
            # Extract main question (text before first sub-part)
            first_sub_pos = text.find(sub_matches[0][0] + ' ')
            main_question = text[:first_sub_pos].strip()
            
            return {
                'main': main_question,
                'parts': sub_matches
            }
        
        return None
    
    def extract_long_questions(self, section_text: str) -> List[Dict]:
      """Extract long questions, each possibly with sub-parts, from Section C."""
      questions = []
      section_text = self.clean_ocr_artifacts(section_text)
      section_text = self.extract_english_only(section_text)
      section_text = self.remove_instructions(section_text)

      # Pattern for Q.x or Q.x ...
      pattern = r'Q[\.\s]*(\d+)[\s0]*([abc\.\s]*.+?)(?=(?:Q[\.\s]*\d+)|$)'
      matches = re.findall(pattern, section_text, re.IGNORECASE | re.DOTALL)

      for num, full_question_block in matches:
          full_question_block = full_question_block.strip()
          # Split subparts: look for a. ... b. ..., etc.
          sub_match = re.split(r'\b([a-z]\.)\s*', full_question_block)
          if len(sub_match) > 2:
              # There are subparts; group label+body
              for i in range(1, len(sub_match), 2):
                  label = sub_match[i].strip()
                  qtext = sub_match[i+1].strip()
                  # Filter garbage
                  if len(qtext) < 15: continue
                  full = f"{label} {qtext}"
                  questions.append({
                      "question_text": full,
                      "question_type": "long",
                      "marks": 5
                  })
          else:
              # No subparts, just get main text
              qtext = full_question_block
              if len(qtext) >= 20:
                  questions.append({
                      "question_text": qtext.strip(),
                      "question_type": "long",
                      "marks": 5
                  })
      return questions

    
    def extract_marks(self, text: str) -> Optional[float]:
        """Extract marks from question text"""
        # Pattern: "3x11", "2+3", "1.5+1.5", "Marks: 5", "5 marks", etc.
        patterns = [
            r'(\d+\.?\d*)\s*[x×]\s*(\d+)',  # 3x11
            r'(\d+\.?\d*)\s*\+\s*(\d+\.?\d*)',  # 2+3 or 1.5+1.5
            r'Marks?\s*[:=]?\s*(\d+\.?\d*)',  # Marks: 5 or Marks 5
            r'\(\s*(\d+\.?\d*)\s*marks?\s*\)',  # (5 marks)
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    # Multiplication or addition
                    if 'x' in pattern or '×' in pattern:
                        return float(match.group(1)) * float(match.group(2))
                    else:
                        return float(match.group(1)) + float(match.group(2))
                else:
                    return float(match.group(1))
        
        return None
    
    def parse_questions(self, content: str) -> List[Dict]:
        """Parse all questions from content"""
        all_questions = []
        
        # Try to find each section
        sections = {
            'A': ('mcq', self.extract_mcqs),
            'B': ('short', self.extract_short_questions),
            'C': ('long', self.extract_long_questions)
        }
        
        for section_letter, (q_type, extractor_func) in sections.items():
            section_content = self.find_section(content, section_letter)
            
            if section_content:
                print(f"  Found Section {section_letter}")
                questions = extractor_func(section_content)
                print(f"  Extracted {len(questions)} {q_type} questions")
                all_questions.extend(questions)
            else:
                print(f"  Section {section_letter} not found or empty")
        
        return all_questions
    
    def generate_embeddings(self, questions: List[Dict]) -> List[Dict]:
        """Generate embeddings for all questions"""
        if not questions:
            return []
        
        question_texts = [q["question_text"] for q in questions]
        print(f"  Generating embeddings for {len(question_texts)} questions...")
        
        # Generate embeddings in batch
        embeddings = self.model.encode(question_texts, show_progress_bar=True)
        
        # Add embeddings to questions
        for i, question in enumerate(questions):
            question["embedding"] = embeddings[i].tolist()
        
        return questions
    
    def process_single_paper(self, pdf_path: str, paper_id: int, output_dir: str = "output"):
        """Process a single paper and save to individual JSON file"""
        filename = Path(pdf_path).stem
        print(f"\n{'='*70}")
        print(f"Processing: {filename}")
        print(f"{'='*70}")
        
        # Extract text with OCR
        content = self.extract_text_with_ocr(pdf_path)
        if not content or len(content.strip()) < 50:
            print(f"❌ Could not extract meaningful text from {pdf_path}")
            return None
        
        print(f"✓ Extracted {len(content)} characters")
        
        # Extract metadata
        filename_metadata = self.extract_metadata_from_filename(filename)
        metadata = self.extract_metadata_from_content(content, filename_metadata)
        metadata["paper_id"] = paper_id
        metadata["filename"] = filename
        
        print(f"✓ Metadata: {metadata['year']} | {metadata['board']} | {metadata['subject']} | {metadata['class']}")
        
        # Parse questions
        questions = self.parse_questions(content)
        
        if not questions:
            print(f"  No questions extracted from {pdf_path}")
            return None
        
        print(f"✓ Total questions found: {len(questions)}")
        
        # Generate embeddings
        questions = self.generate_embeddings(questions)
        questions = self.split_questions_on_or(questions)
        
        # Add IDs to questions
        for idx, question in enumerate(questions, start=1):
            question["question_id"] = f"{paper_id}_{idx}"
            question["paper_id"] = paper_id
        
        # Prepare output
        output_data = {
            "metadata": metadata,
            "questions": questions,
            "stats": {
                "total_questions": len(questions),
                "mcqs": sum(1 for q in questions if q['question_type'] == 'mcq'),
                "short_questions": sum(1 for q in questions if q['question_type'] == 'short'),
                "long_questions": sum(1 for q in questions if q['question_type'] == 'long'),
            }
        }
        
        # Save to JSON only if output_dir is provided
        if output_dir is not None:
            Path(output_dir).mkdir(exist_ok=True)
            output_file = Path(output_dir) / f"{filename}.json"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2, ensure_ascii=False)
            
            print(f"✓ Saved to {output_file}")
            print(f"  MCQs: {output_data['stats']['mcqs']}")
            print(f"  Short: {output_data['stats']['short_questions']}")
            print(f"  Long: {output_data['stats']['long_questions']}")
        else:
            print(f"✓ Processed (no file output)")
            print(f"  MCQs: {output_data['stats']['mcqs']}")
            print(f"  Short: {output_data['stats']['short_questions']}")
            print(f"  Long: {output_data['stats']['long_questions']}")
        
        return output_data
    
    def process_all_papers(self, pdf_paths: List[str], output_dir: str = "output"):
        """Process all papers and save individually"""
        results = []
        
        for paper_id, pdf_path in enumerate(pdf_paths, start=1):
            result = self.process_single_paper(pdf_path, paper_id, output_dir)
            if result:
                results.append(result)
        
        # Save summary
        summary = {
            "total_papers": len(results),
            "total_questions": sum(r["stats"]["total_questions"] for r in results),
            "papers": [
                {
                    "paper_id": r["metadata"]["paper_id"],
                    "filename": r["metadata"]["filename"],
                    "year": r["metadata"]["year"],
                    "board": r["metadata"]["board"],
                    "subject": r["metadata"]["subject"],
                    "class": r["metadata"]["class"],
                    "questions_count": r["stats"]["total_questions"]
                }
                for r in results
            ]
        }
        
        summary_file = Path(output_dir) / "summary.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print("PROCESSING COMPLETE")
        print(f"{'='*70}")
        print(f"✓ Total Papers: {summary['total_papers']}")
        print(f"✓ Total Questions: {summary['total_questions']}")
        print(f"✓ Summary saved to: {summary_file}")
        print(f"{'='*70}")
        
        return results


def main():
    """Main execution function"""
    print("="*70)
    print("Robust OCR-Based Past Paper Question Extractor")
    print("Using: pytesseract OCR + all-MiniLM-L6-v2 embeddings")
    print("="*70)
    
    # Initialize processor
    processor = RobustPastPaperProcessor()
    
    # List  PDF files here
    pdf_files = [
        "2022.pdf"
    ]
    
    # Process all papers
    processor.process_all_papers(pdf_files, output_dir="output")


if __name__ == "__main__":
    main()