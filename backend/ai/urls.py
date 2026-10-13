from django.urls import path
from .views import GenerateGuideTextView

urlpatterns = [
    path("guides/<int:guide_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_guide_text"),
]
