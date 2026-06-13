"""
Utility functions for file handling and validation
"""

import os
import logging
from pathlib import Path
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


class FileValidator:
    """Utility class for file validation"""
    
    ALLOWED_EXTENSIONS = {'.pdf'}
    MAX_FILE_SIZE = settings.MAX_FILE_SIZE
    
    @staticmethod
    def validate_file_extension(filename: str) -> bool:
        """Validate if file has allowed extension"""
        ext = Path(filename).suffix.lower()
        return ext in FileValidator.ALLOWED_EXTENSIONS
    
    @staticmethod
    def validate_file_size(file_size: int) -> bool:
        """Validate if file size is within limit"""
        return file_size <= FileValidator.MAX_FILE_SIZE
    
    @staticmethod
    def get_file_extension(filename: str) -> str:
        """Get file extension"""
        return Path(filename).suffix.lower()


class PathManager:
    """Utility class for path management"""
    
    @staticmethod
    def get_upload_dir(base_dir: Optional[str] = None) -> str:
        """Get upload directory path"""
        if base_dir is None:
            import tempfile
            base_dir = tempfile.gettempdir()
        
        upload_dir = os.path.join(base_dir, "past_papers_uploads")
        os.makedirs(upload_dir, exist_ok=True)
        return upload_dir
    
    @staticmethod
    def get_safe_filename(filename: str) -> str:
        """Get safe filename by removing special characters"""
        import re
        # Remove special characters, keep only alphanumeric, dots, dashes, underscores
        safe_name = re.sub(r'[^\w\-\.]', '_', filename)
        return safe_name
    
    @staticmethod
    def ensure_directory_exists(directory: str) -> None:
        """Ensure directory exists"""
        try:
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Directory ensured: {directory}")
        except Exception as e:
            logger.error(f"Error ensuring directory {directory}: {str(e)}")
            raise
