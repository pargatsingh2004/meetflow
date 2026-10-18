from django.contrib import admin

from .models import Meeting, Message, Participant, AdmissionRequest, MeetingSummary

admin.site.register(Meeting)
admin.site.register(Participant)
admin.site.register(Message)

@admin.register(AdmissionRequest)
class AdmissionRequestAdmin(admin.ModelAdmin):
    list_display = ("meeting", "user", "status", "requested_at")
    list_filter = ("status",)


@admin.register(MeetingSummary)
class MeetingSummaryAdmin(admin.ModelAdmin):
    list_display = ("meeting", "source_message_count", "updated_at")
    readonly_fields = ("meeting", "content", "source_message_count", "created_at", "updated_at")
