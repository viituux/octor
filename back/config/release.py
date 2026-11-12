"""Versão do produto é independente dos números dos treinamentos e da extensão."""
import json
from pathlib import Path
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def release_info():
    return json.loads(Path(__file__).with_name('release.json').read_text(encoding='utf-8'))


class ReleaseInfoView(APIView):
    permission_classes=[AllowAny]
    authentication_classes=[]
    def get(self,request):return Response(release_info(),headers={'Cache-Control':'no-cache'})
