from django.contrib import admin

from .models import SupportReport


@admin.register(SupportReport)
class SupportReportAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "reporter", "created_at", "resolved")
    list_filter = ("resolved",)
    search_fields = ("subject", "description", "reporter__username")
    readonly_fields = ("subject", "description", "reporter", "created_at")
    ordering = ("-created_at", "-id")

    def has_add_permission(self, request):
        return False
