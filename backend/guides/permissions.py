from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS


def accessible_guides(user):
    from .models import Guide
    return Guide.objects.filter(Q(owner=user) | Q(shares__user=user) | Q(workspace__members=user, status='published')).distinct()


class OwnerWritesOthersRead(BasePermission):
    def has_object_permission(self, request, view, obj):
        guide = getattr(obj, 'guide', obj)
        return request.method in SAFE_METHODS or guide.owner_id == request.user.id
