"""Resumo próprio separado das ferramentas de operação exclusivas dos desenvolvedores."""
from django.db.models import Sum
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AIUsage, AIPolicy
from .usage import boundaries, totals


def is_master(user):
    return bool(user.is_authenticated and user.is_active and user.is_staff and user.is_superuser)


class IsSystemMaster(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_master(request.user)


class MyAIUsageView(APIView):
    permission_classes=[permissions.IsAuthenticated]

    def get(self, request):
        day,month=boundaries();rows=AIUsage.objects.filter(user=request.user)
        daily=rows.filter(created_at__gte=day);monthly=rows.filter(created_at__gte=month)
        tokens=int(monthly.aggregate(n=Sum('total_tokens'))['n'] or 0)
        reserved=int(monthly.aggregate(n=Sum('reserved_tokens'))['n'] or 0)
        policy=AIPolicy.objects.filter(scope='user',user=request.user,enabled=True).first() or AIPolicy.objects.filter(scope='default',enabled=True).first()
        limit=policy.monthly_tokens if policy else None
        pending=monthly.filter(status__in=['reserved','unknown']).count()
        costs_complete=not monthly.exclude(status='rejected').filter(estimated_cost_brl__isnull=True).exists()
        cost=monthly.aggregate(n=Sum('estimated_cost_brl'))['n']
        response=Response({
            'daily_tokens':int(daily.aggregate(n=Sum('total_tokens'))['n'] or 0),
            'monthly_tokens':tokens,'monthly_limit':limit,'reserved_tokens':reserved,
            'remaining_tokens':max(0,limit-tokens-reserved) if limit is not None else None,
            'percent_used':min(100,round((tokens+reserved)/limit*100,1)) if limit else 100 if limit==0 else None,
            'estimated_cost_brl':str(cost or 0) if costs_complete else None,
            'cost_complete':costs_complete,'requests_unknown_or_pending':pending,
            'alert':bool(policy and limit is not None and (tokens+reserved)>=limit*policy.alert_percent/100),
            'can_manage_system':is_master(request.user),
        })
        response['Cache-Control']='private, no-store'
        return response


class MasterAIOverviewView(APIView):
    permission_classes=[IsSystemMaster]

    def get(self, request):
        day,month=boundaries();rows=AIUsage.objects.filter(created_at__gte=month)
        tokens,cost=totals(rows)
        response=Response({'monthly_tokens_including_reservations':tokens,'cost_including_reservations_brl':str(cost),
            'pending_or_unknown':rows.filter(status__in=['unknown','reserved']).count(),
            'by_model':list(rows.values('provider','model','operation').annotate(tokens=Sum('total_tokens'),estimated_cost_brl=Sum('estimated_cost_brl'))),
        })
        response['Cache-Control']='private, no-store'
        return response
