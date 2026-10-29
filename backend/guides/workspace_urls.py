from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .teamwork import WorkspaceViewSet, AcceptInvitationView
router=DefaultRouter()
router.register('',WorkspaceViewSet,basename='workspace')
urlpatterns=[path('invitations/<str:token>/',AcceptInvitationView.as_view()),path('',include(router.urls))]
