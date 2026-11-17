# Rotas do módulo: relacionam os caminhos HTTP às views; os prefixos são compostos pelas URLs centrais da aplicação.
# Dependência: registro e composição das rotas HTTP.
from django.urls import path
# Dependência: contratos e funções do módulo .views reutilizados neste fluxo.
from .views import CapabilitiesView,AdminTrainingsView,AdminTrainingView,AdminActionView,ParticipantInspectionView,DashboardView,MyTrainingsView,MyTrainingView,LearningActionView
from .views import QuizSuggestionsView, TrainingAccessView
from .archive_views import TrainingVersionDetailView,TrainingAssetView,TrainingLegacyMediaView
# list: contratos de caminhos HTTP; mudar sua ordem pode alterar a resolução de rotas.
urlpatterns=[
 path('admin/<int:pk>/versions/<int:number>/',TrainingVersionDetailView.as_view()),
 path('<int:pk>/versions/<int:number>/assets/<uuid:asset_id>/',TrainingAssetView.as_view()),
 path('<int:pk>/versions/<int:number>/legacy-media/<int:index>/<str:field>/',TrainingLegacyMediaView.as_view(),name='training-legacy-media'),
 path('capabilities/',CapabilitiesView.as_view()),
 path('admin/',AdminTrainingsView.as_view()),
 path('admin/dashboard/',DashboardView.as_view()),
 path('admin/quiz-suggestions/',QuizSuggestionsView.as_view()),
 path('admin/<int:pk>/',AdminTrainingView.as_view()),
 path('admin/<int:pk>/participants/<int:user_id>/',ParticipantInspectionView.as_view()),
 path('admin/<int:pk>/<str:action>/',AdminActionView.as_view()),
 path('',MyTrainingsView.as_view()),
 path('<int:pk>/access/',TrainingAccessView.as_view()),
 path('<int:pk>/',MyTrainingView.as_view()),
 path('<int:pk>/<str:action>/',LearningActionView.as_view()),
]
