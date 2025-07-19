from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimeEntryViewSet

router = DefaultRouter()
router.register(r'timeentries', TimeEntryViewSet)

urlpatterns = [
    path('', include(router.urls)),
]