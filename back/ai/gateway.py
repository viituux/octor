"""Seleção server-side de provedores com contingência controlada e sem expor segredos."""
from dataclasses import dataclass
import logging

from django.conf import settings

from .credentials import reveal
from .models import AIProviderKey

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderCredential:
    provider: str
    secret: str
    model: str
    key_id: int | None = None


def provider_credentials(*, purpose="general"):
    """Retorna a principal e apenas reservas explicitamente autorizadas."""
    rows = list(AIProviderKey.objects.filter(active=True).order_by("priority", "id"))
    if rows:
        first = rows[0]
        allowed = [first, *(row for row in rows[1:] if row.backup_authorized)]
        result = []
        for row in allowed:
            try:
                result.append(ProviderCredential(row.provider, reveal(row.encrypted_secret), row.model, row.pk))
            except Exception:
                logger.exception("ai_key_unavailable key_id=%s provider=%s", row.pk, row.provider)
        return result

    provider = "gemini" if purpose == "manual" else settings.LLM_PROVIDER
    secret = settings.GEMINI_API_KEY if purpose == "manual" else settings.LLM_API_KEY
    model = settings.GEMINI_MODEL if purpose == "manual" else settings.LLM_MODEL
    return [ProviderCredential(provider, secret, model)] if provider in ("gemini", "openai") and secret else []


def can_failover(status_code):
    """Não alterna por cota (429/402) nem após timeout/resultado incerto."""
    return status_code in (401, 403, 500, 502, 503, 504)
