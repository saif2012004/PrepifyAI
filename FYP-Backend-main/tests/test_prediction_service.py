"""
Test script for DistilBERT Prediction Service.

Tests:
1. Model loading
2. Tokenization
3. Inference
4. Batch processing
5. API endpoints

Usage:
    pytest test_prediction_service.py -v
    # or
    python -m pytest test_prediction_service.py::test_single_prediction -v
"""

import pytest
from pathlib import Path
import json
import torch
from app.services.prediction_service import (
    TopicPredictionService,
    TopicSelectionService
)


class TestTopicPredictionService:
    """Test the prediction service"""
    
    @pytest.fixture
    def service(self):
        """Initialize prediction service"""
        service = TopicPredictionService(model_base_path="pretrained")
        if not service.is_ready():
            pytest.skip("Prediction models not loaded. Download from Colab first.")
        return service
    
    def test_service_ready(self, service):
        """Test if service is ready"""
        assert service.is_ready() is True
        assert len(service.get_available_classes()) > 0
    
    def test_available_classes(self, service):
        """Test available classes"""
        classes = service.get_available_classes()
        expected = {'9', '10', '11', '12'}
        assert set(classes).issubset(expected)
        assert len(classes) > 0