from django.urls import path
from .views import GenerateGuideTextView, PrepareNarrationView

urlpatterns = [
    path("guides/<int:guide_id>/prepare-narration/", PrepareNarrationView.as_view(), name="prepare_narration"),
    path("guides/<int:guide_id>/steps/<int:step_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_step_text"),
    path("guides/<int:guide_id>/generate-text/", GenerateGuideTextView.as_view(), name="generate_guide_text"),
]
