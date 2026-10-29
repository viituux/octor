from .account_settings import ProfileView, SecurityView, RevokeOtherSessionsView
from .sessions import AccountRefreshView
from .google_auth import GoogleConfigView, GoogleChallengeView, GoogleLoginView, GoogleLinkView
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import CustomLoginView, RegisterView, MeView, UserSettingsView

urlpatterns = [
    path("profile/", ProfileView.as_view()),
    path("password/", SecurityView.as_view()),
    path("sessions/revoke/", RevokeOtherSessionsView.as_view()),
    path("google/config/", GoogleConfigView.as_view()),
    path("google/challenge/", GoogleChallengeView.as_view()),
    path("google/login/", GoogleLoginView.as_view()),
    path("google/link/", GoogleLinkView.as_view()),
    path("login/", CustomLoginView.as_view(), name="token_obtain_pair"),
    path("refresh/", AccountRefreshView.as_view(), name="token_refresh"),
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("me/", MeView.as_view(), name="auth_me"),
    path("settings/", UserSettingsView.as_view(), name="user_settings"),
]
