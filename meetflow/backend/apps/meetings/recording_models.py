
import uuid

from django.conf import settings
from django.db import models


class RecordingRequest(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    meeting = models.ForeignKey(
        "meetings.Meeting",
        on_delete=models.CASCADE,
        related_name="recording_requests",
    )

    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # waiting -> recording -> stopping -> completed
    status = models.CharField(
        max_length=20,
        default="waiting",
        choices=[
            ("waiting", "Waiting for consent"),
            ("starting", "Starting"),
            ("recording", "Recording"),
            ("stopping", "Stopping"),
            ("completed", "Completed"),
            ("failed", "Failed"),
            ("cancelled", "Cancelled"),
        ],
    )

    egress_id = models.CharField(
        max_length=150,
        blank=True,
        db_index=True,
    )

    storage_key = models.CharField(max_length=500, blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    error_message = models.TextField(blank=True)

    def __str__(self):
        return f"{self.meeting.code}: {self.status}"


class RecordingConsent(models.Model):
    recording = models.ForeignKey(
        RecordingRequest,
        on_delete=models.CASCADE,
        related_name="consents",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    accepted = models.BooleanField(default=False)

    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recording", "user"],
                name="unique_recording_user_consent",
            )
        ]
