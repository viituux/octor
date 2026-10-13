from django.urls import path
from .views import CreateVideoJobView, VideoJobDetailView

urlpatterns = [
    path("guides/<int:guide_id>/video/", CreateVideoJobView.as_view(), name="create_video_job"),
    path("video-jobs/<int:pk>/", VideoJobDetailView.as_view(), name="video_job_detail"),
]
