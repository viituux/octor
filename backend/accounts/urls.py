from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import CustomLoginView, RegisterView, MeView, UserSettingsView

urlpatterns = [
    path("login/", CustomLoginView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("me/", MeView.as_view(), name="auth_me"),
    path("settings/", UserSettingsView.as_view(), name="user_settings"),
]
