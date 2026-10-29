from django.urls import path, include
from rest_framework.routers import DefaultRouter, SimpleRouter
from .views import GuideViewSet, StepViewSet

router = DefaultRouter()
router.register(r"", GuideViewSet, basename="guide")

step_router = SimpleRouter()
step_router.register(r"steps", StepViewSet, basename="step")

urlpatterns = [
    path("", include(step_router.urls)),
    path("", include(router.urls)),
]
