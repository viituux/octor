from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GuideViewSet, StepViewSet

router = DefaultRouter()
router.register(r"", GuideViewSet, basename="guide")

step_router = DefaultRouter()
step_router.register(r"steps", StepViewSet, basename="step")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(step_router.urls)),
]
