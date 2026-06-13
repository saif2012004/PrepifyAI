
import os
import uuid
import aiofiles
from PIL import Image
import pytesseract
from typing import Optional
from fastapi import UploadFile
from app.core.config import settings

async def save_uploaded_file(file: UploadFile, directory: str = "uploads") -> str:
    os.makedirs(directory, exist_ok=True)
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(directory, unique_filename)

    async with aiofiles.open(file_path, 'wb') as buffer:
        content = await file.read()
        await buffer.write(content)

    return file_path

def extract_text_from_image(image_path: str) -> str:
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image, config='--psm 6')
        return text.strip()
    except Exception as e:
        raise ValueError(f"Error extracting text from image: {str(e)}")
