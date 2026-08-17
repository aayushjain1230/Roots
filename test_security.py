import io
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import api
from roots_security import LIMITER, validate_public_url


class SecurityApiTests(unittest.TestCase):
    def setUp(self):
        LIMITER._events.clear()
        self.client = TestClient(api.app)

    def test_security_headers_and_no_store(self):
        response = self.client.get("/ping")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertNotIn("*", response.headers.get("access-control-allow-origin", ""))

    def test_extra_fields_are_rejected(self):
        response = self.client.post("/v1/ai/question", json={"prompt": "hello", "unexpected": True})
        self.assertEqual(response.status_code, 422)

    def test_oversized_prompt_is_rejected_before_provider(self):
        response = self.client.post("/v1/ai/question", json={"prompt": "x" * 20001})
        self.assertEqual(response.status_code, 422)

    def test_bad_image_type_is_rejected(self):
        response = self.client.post(
            "/v1/ocr/label",
            files={"file": ("label.svg", io.BytesIO(b"<svg/>"), "image/svg+xml")},
        )
        self.assertEqual(response.status_code, 415)

    def test_signature_mismatch_is_rejected(self):
        response = self.client.post(
            "/v1/ocr/menu",
            files={"file": ("menu.jpg", io.BytesIO(b"not really a jpeg"), "image/jpeg")},
        )
        self.assertEqual(response.status_code, 415)

    def test_unreadable_label_null_fields_are_normalized_without_inventing_evidence(self):
        image = io.BytesIO()
        Image.new("RGB", (64, 64), "white").save(image, format="PNG")
        image.seek(0)
        provider_output = {
            "is_valid": False,
            "detected_language": None,
            "original_text": None,
            "translated_text": None,
            "ingredient_text_original": None,
            "ingredient_text_translated": None,
            "allergen_text_original": None,
            "allergen_text_translated": None,
            "product_name": None,
            "brand": None,
            "warnings": [],
        }
        with patch("roots_security._provider_call", return_value=json.dumps(provider_output)):
            response = self.client.post(
                "/v1/ocr/label",
                files={"file": ("label.png", image, "image/png")},
            )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["is_valid"])
        self.assertEqual(payload["ingredient_text_original"], "")
        self.assertEqual(payload["brand"], "")

    def test_private_and_credentialed_urls_are_blocked(self):
        for value in ("http://example.com/menu", "https://127.0.0.1/menu", "https://user:pass@example.com/menu"):
            with self.assertRaises(ValueError):
                validate_public_url(value)
        self.assertEqual(validate_public_url("https://example.com/menu"), "https://example.com/menu")

    def test_rate_limiter_returns_stable_error(self):
        for _ in range(15):
            LIMITER.check("test", 15)
        with self.assertRaises(Exception) as caught:
            LIMITER.check("test", 15)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.detail["code"], "rate_limited")

    def explanation_payload(self):
        reason = {
            "id": "milk-whey", "restrictionId": "milk_allergy", "restrictionLabel": "Milk Allergy",
            "category": "allergy", "severity": "avoid", "text": "Whey is derived from milk.",
            "evidenceType": "direct_ingredient", "evidenceKind": "direct", "evidenceLevel": "confirmed",
            "ruleVersion": 1, "userSettings": {}, "evidenceValue": None,
        }
        return {
            "mode": "detailed", "language": "en",
            "context": {
                "schemaVersion": 1, "contextType": "ingredient",
                "subject": {"id": "whey", "displayName": "Whey", "canonicalName": "whey", "originalTerm": "whey concentrate"},
                "verdict": "AVOID",
                "profile": {"profileId": "p1", "displayName": "Aayush", "relevantRestrictions": [{"id": "milk_allergy", "label": "Milk Allergy", "settings": {}}]},
                "reasons": [reason],
                "evidence": [{"id": "milk-whey", "text": "Whey is derived from milk.", "source": "direct_ingredient", "level": "confirmed", "kind": "direct"}],
                "aliases": ["caseinate"], "regionalTerms": [], "sourceStatus": "not_applicable",
                "quantityStatus": "not_applicable", "preparationStatus": "not_applicable",
                "crossContact": [], "certification": [], "verificationQuestions": [], "ruleTrace": [],
                "engine": {"dietaryVersion": 2, "ingredientKnowledgeVersion": 4, "restrictionVersion": 1},
                "evaluatedAt": "2026-01-01T00:00:00Z", "metadata": {},
            },
        }

    def test_explanation_endpoint_accepts_only_grounded_structured_output(self):
        output = {
            "schemaVersion": 1, "verdict": "AVOID", "title": "Why whey was flagged",
            "summary": "Whey conflicts with the Milk Allergy profile.",
            "sections": [{"id": "why", "title": "Why", "body": "The supplied evidence lists whey."}],
            "importantWarnings": ["Milk Allergy conflict."], "suggestedActions": [],
            "grounding": {"usedRestrictionIds": ["milk_allergy"], "usedEvidenceIds": ["milk-whey"], "didNotChangeVerdict": True},
        }
        with patch("roots_security._provider_call", return_value=json.dumps(output)):
            response = self.client.post("/v1/ai/explain", json=self.explanation_payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["verdict"], "AVOID")

    def test_explanation_endpoint_rejects_unknown_context_fields_before_provider(self):
        payload = self.explanation_payload()
        payload["context"]["history"] = ["private"]
        response = self.client.post("/v1/ai/explain", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_explanation_endpoint_rejects_changed_verdict_after_one_repair(self):
        output = {
            "schemaVersion": 1, "verdict": "SAFE", "title": "Unsafe rewrite",
            "summary": "The model changed the verdict.",
            "sections": [{"id": "why", "title": "Why", "body": "Unsupported."}],
            "importantWarnings": ["Milk Allergy conflict."], "suggestedActions": [],
            "grounding": {"usedRestrictionIds": ["milk_allergy"], "usedEvidenceIds": ["milk-whey"], "didNotChangeVerdict": True},
        }
        with patch("roots_security._provider_call", return_value=json.dumps(output)) as provider:
            response = self.client.post("/v1/ai/explain", json=self.explanation_payload())
        self.assertEqual(response.status_code, 502)
        self.assertEqual(provider.call_count, 2)


if __name__ == "__main__":
    unittest.main()
