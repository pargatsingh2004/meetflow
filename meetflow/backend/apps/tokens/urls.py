from django.urls import path

from .views import LiveKitTokenView

urlpatterns = [path("", LiveKitTokenView.as_view())]
