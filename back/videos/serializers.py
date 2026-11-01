# Representação da tarefa de vídeo e da URL de saída quando existe arquivo associado.
# Dependência: serialização, respostas, permissões e contratos HTTP da API REST.
from rest_framework import serializers
# Dependência: contratos e funções do módulo .models reutilizados neste fluxo.
from .models import VideoJob


class VideoJobSerializer(serializers.ModelSerializer):
    video_url = serializers.SerializerMethodField()

    class Meta:
        model = VideoJob
        fields = [
            "id",
            "guide",
            "status",
            "voice",
            "language",
            "avatar",
            "video_file",
            "video_url",
            "progress",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "video_file", "progress", "error_message", "created_at", "updated_at"]

    # Calcula o campo `video_url` de VideoJobSerializer usando o objeto e o contexto disponíveis.
    # Parâmetros — obj: registro que está sendo serializado.
    # Retorno: resultado de request.build_absolute_uri(...); obj.video_file.url; None.
    def get_video_url(self, obj):
        if obj.video_file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.video_file.url)
            return obj.video_file.url
        return None
