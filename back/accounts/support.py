import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .models import SupportReport

logger = logging.getLogger(__name__)


def email_report(report):
    if not (settings.EMAIL_HOST and settings.DEFAULT_FROM_EMAIL and settings.SUPPORT_EMAIL):
        return
    try:
        send_mail(
            subject=f"OCTOR · Novo relato #{report.pk}",
            message=f"Assunto: {report.subject}\n\n{report.description}\n\nProtocolo: #{report.pk}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[settings.SUPPORT_EMAIL],
        )
    except Exception:
        # O relato segue disponível no painel administrativo se o SMTP falhar.
        logger.warning("Falha no envio do relato de suporte %s por e-mail.", report.pk)


class ReportThrottle(UserRateThrottle):
    scope = "support_report"
    rate = "5/hour"


class ReportInput(serializers.ModelSerializer):
    class Meta:
        model = SupportReport
        fields = ("subject", "description")


class SupportReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReportThrottle]

    def post(self, request):
        form = ReportInput(data=request.data)
        form.is_valid(raise_exception=True)
        report = form.save(reporter=request.user)
        transaction.on_commit(lambda: email_report(report))
        return Response({"id": report.pk}, status=status.HTTP_201_CREATED)
