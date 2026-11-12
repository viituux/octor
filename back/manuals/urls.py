from django.urls import path
from .views import Runs,Detail,Capture,ImageView,Action
urlpatterns=[path('',Runs.as_view()),path('<uuid:pk>/',Detail.as_view()),path('<uuid:pk>/captures/',Capture.as_view()),path('<uuid:pk>/captures/<int:capture_id>/image/',ImageView.as_view()),path('<uuid:pk>/<str:action>/',Action.as_view())]
