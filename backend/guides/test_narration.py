import tempfile
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .models import Guide, Step


class NarrationTests(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.media.name)
        self.override.enable()
        self.addCleanup(self.media.cleanup)
        self.addCleanup(self.override.disable)
        self.owner = User.objects.create_user(username="narrator", password="test-pass")
        self.other = User.objects.create_user(username="other", password="test-pass")
        self.step = Step.objects.create(guide=Guide.objects.create(owner=self.owner, title="Guide"))
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = f"/api/guides/steps/{self.step.id}/"

    def audio(self):
        return SimpleUploadedFile("voice.webm", b"\x1aE\xdf\xa3" + b"test-audio" * 4, content_type="audio/webm")

    def test_upload_persists_and_can_be_cleared(self):
        response = self.client.patch(self.url, {"narration": self.audio()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertIn("narrations/", response.data["narration_url"])
        self.step.refresh_from_db()
        self.assertTrue(self.step.narration.storage.exists(self.step.narration.name))
        self.assertEqual(self.client.patch(self.url, {"narration": None}, format="json").status_code, 200)
        self.step.refresh_from_db()
        self.assertFalse(self.step.narration)

    def test_other_user_cannot_replace_audio(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(self.url, {"narration": self.audio()}, format="multipart").status_code, 404)

    def test_invalid_file_does_not_replace_saved_audio(self):
        self.client.patch(self.url, {"narration": self.audio()}, format="multipart")
        self.step.refresh_from_db()
        original = self.step.narration.name
        invalid = SimpleUploadedFile("voice.webm", b"not audio", content_type="audio/webm")
        self.assertEqual(self.client.patch(self.url, {"narration": invalid}, format="multipart").status_code, 400)
        self.step.refresh_from_db()
        self.assertEqual(self.step.narration.name, original)

    def test_live_audio_is_shared_with_steps_and_ranges_remain_editable(self):
        self.step.annotations = [{"type": "live_narration", "start": 0, "end": 5}]
        self.step.save()
        guide_url = f"/api/guides/{self.step.guide_id}/"
        response = self.client.patch(guide_url, {"capture_audio": self.audio()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["capture_audio_url"])
        detail = self.client.get(self.url)
        self.assertEqual(detail.data["live_narration_url"], response.data["capture_audio_url"])
        response = self.client.patch(self.url, {"annotations": [{"type": "live_narration", "start": 1, "end": 4}]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["annotations"][0]["start"], 1)

    def test_other_user_cannot_upload_live_audio(self):
        self.client.force_authenticate(self.other)
        response = self.client.patch(f"/api/guides/{self.step.guide_id}/", {"capture_audio": self.audio()}, format="multipart")
        self.assertEqual(response.status_code, 404)
