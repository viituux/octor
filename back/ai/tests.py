from django.test import TestCase, override_settings

from .credentials import protect
from .gateway import can_failover, provider_credentials
from .models import AIProviderKey


@override_settings(OCTOR_AI_ENCRYPTION_KEY="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=")
class ProviderPoolTests(TestCase):
    def test_primary_and_authorized_reserves_are_returned_in_priority_order(self):
        AIProviderKey.objects.create(name="gemini-main", provider="gemini", encrypted_secret=protect("g"), priority=0)
        AIProviderKey.objects.create(name="openai-disabled-backup", provider="openai", encrypted_secret=protect("x"), priority=1)
        AIProviderKey.objects.create(name="openai-backup", provider="openai", encrypted_secret=protect("o"), priority=2, backup_authorized=True)
        self.assertEqual([(c.provider, c.secret) for c in provider_credentials()], [("gemini", "g"), ("openai", "o")])

    def test_failover_does_not_bypass_quota(self):
        self.assertTrue(can_failover(401))
        self.assertTrue(can_failover(503))
        self.assertFalse(can_failover(429))
        self.assertFalse(can_failover(402))
