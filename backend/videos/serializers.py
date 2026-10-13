from rest_framework import serializers
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

    def get_video_url(self, obj):
        if obj.video_file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.video_file.url)
            return obj.video_file.url
        return None
