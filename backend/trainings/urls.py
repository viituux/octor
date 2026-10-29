from django.urls import path
from .views import CapabilitiesView,AdminTrainingsView,AdminTrainingView,AdminActionView,SuggestionsView,ParticipantInspectionView,DashboardView,MyTrainingsView,MyTrainingView,LearningActionView
urlpatterns=[
 path('capabilities/',CapabilitiesView.as_view()),
 path('admin/',AdminTrainingsView.as_view()),
 path('admin/dashboard/',DashboardView.as_view()),
 path('admin/<int:pk>/',AdminTrainingView.as_view()),
 path('admin/<int:pk>/suggestions/',SuggestionsView.as_view()),
 path('admin/<int:pk>/participants/<int:user_id>/',ParticipantInspectionView.as_view()),
 path('admin/<int:pk>/<str:action>/',AdminActionView.as_view()),
 path('',MyTrainingsView.as_view()),
 path('<int:pk>/',MyTrainingView.as_view()),
 path('<int:pk>/<str:action>/',LearningActionView.as_view()),
]
