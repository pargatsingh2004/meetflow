
import uuid
import boto3

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Meeting, Participant
from .recording_models import RecordingRequest, RecordingConsent
from .recording_service import (
    connected_user_ids,
    start_recording,
    stop_recording,
    get_egress,
)


ACTIVE = ("waiting", "starting", "recording", "stopping")


def authorized(meeting, user):
    return (
        meeting.host_id == user.id
        or Participant.objects.filter(
            meeting=meeting,
            user=user,
        ).exists()
    )


def current_recording(meeting):
    return (
        RecordingRequest.objects
        .filter(meeting=meeting, status__in=ACTIVE)
        .order_by("-created_at")
        .first()
    )


def serialize(recording, user):
    if not recording:
        return {"status": "none"}

    consents = list(recording.consents.all())

    mine = next(
        (c for c in consents if c.user_id == user.id),
        None,
    )

    return {
        "id": str(recording.id),
        "status": recording.status,
        "is_host": recording.host_id == user.id,
        "my_consent": (
            None if mine is None or mine.responded_at is None
            else mine.accepted
        ),
        "requires_consent": bool(
            mine and mine.responded_at is None
        ),
        "approved": sum(
            c.accepted and c.responded_at is not None
            for c in consents
        ),
        "total": len(consents),
        "started_at": recording.started_at,
        "stopped_at": recording.stopped_at,
    }


def fail_recording(recording, error):
    recording.status = "failed"
    recording.error_message = str(error)[:2000]
    recording.stopped_at = timezone.now()
    recording.save(
        update_fields=[
            "status",
            "error_message",
            "stopped_at",
        ]
    )


class RecordingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)

        if not authorized(meeting, request.user):
            return Response({"detail": "Forbidden"}, status=403)

        recording = current_recording(meeting)

        return Response(serialize(recording, request.user))


class RecordingRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)

        if meeting.host_id != request.user.id:
            return Response({"detail": "Host only"}, status=403)

        if meeting.ended_at:
            return Response({"detail": "Meeting ended"}, status=409)

        if not settings.LIVEKIT_RECORDING_ENABLED:
            return Response(
                {"detail": "Recording is disabled"},
                status=503,
            )

        if current_recording(meeting):
            return Response(
                {"detail": "Recording already pending or active"},
                status=409,
            )

        try:
            user_ids = connected_user_ids(meeting.code)
        except Exception:
            return Response(
                {"detail": "LiveKit unavailable"},
                status=503,
            )

        if request.user.id not in user_ids:
            return Response(
                {"detail": "Host must be connected to LiveKit"},
                status=409,
            )

        # A recording request fixes the consent roster.
        with transaction.atomic():
            recording = RecordingRequest.objects.create(
                meeting=meeting,
                host=request.user,
            )

            RecordingConsent.objects.bulk_create([
                RecordingConsent(
                    recording=recording,
                    user_id=user_id,
                )
                for user_id in user_ids
            ])

        return Response(
            serialize(recording, request.user),
            status=201,
        )


class RecordingConsentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)
        recording = current_recording(meeting)

        if not recording or recording.status != "waiting":
            return Response(
                {"detail": "No pending consent request"},
                status=409,
            )

        if type(request.data.get("accepted")) is not bool:
            return Response(
                {"detail": "accepted must be true or false"},
                status=400,
            )

        consent = get_object_or_404(
            RecordingConsent,
            recording=recording,
            user=request.user,
        )

        consent.accepted = request.data["accepted"]
        consent.responded_at = timezone.now()
        consent.save(
            update_fields=["accepted", "responded_at"]
        )

        return Response(serialize(recording, request.user))


class RecordingStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)

        if meeting.host_id != request.user.id:
            return Response({"detail": "Host only"}, status=403)

        if meeting.ended_at:
            return Response({"detail": "Meeting ended"}, status=409)

        if not settings.LIVEKIT_RECORDING_ENABLED:
            return Response({"detail": "Disabled"}, status=503)

        with transaction.atomic():
            recording = (
                RecordingRequest.objects
                .select_for_update()
                .filter(meeting=meeting, status="waiting")
                .order_by("-created_at")
                .first()
            )

            if not recording:
                return Response(
                    {"detail": "No pending recording"},
                    status=409,
                )

            consents = list(recording.consents.all())

            if not consents or any(
                c.responded_at is None or not c.accepted
                for c in consents
            ):
                return Response(
                    {"detail": "All participants must agree"},
                    status=409,
                )

            recording.status = "starting"
            recording.save(update_fields=["status"])

        try:
            # Reject changed participant roster.
            connected = connected_user_ids(meeting.code)
            approved = {c.user_id for c in consents}

            if connected != approved:
                recording.status = "waiting"
                recording.save(update_fields=["status"])

                return Response(
                    {
                        "detail": (
                            "Participants changed. Cancel this request "
                            "and obtain fresh consent."
                        )
                    },
                    status=409,
                )

            storage_key = (
                f"meetings/{meeting.id}/"
                f"{recording.id}.mp4"
            )

            result = start_recording(
                meeting.code,
                storage_key,
            )

            recording.egress_id = result.egress_id
            recording.storage_key = storage_key
            recording.status = "recording"
            recording.started_at = timezone.now()

            recording.save(
                update_fields=[
                    "egress_id",
                    "storage_key",
                    "status",
                    "started_at",
                ]
            )

            return Response(serialize(recording, request.user))

        except Exception as exc:
            fail_recording(recording, exc)

            return Response(
                {"detail": "Could not start Egress"},
                status=502,
            )


class RecordingStopView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)

        if meeting.host_id != request.user.id:
            return Response({"detail": "Host only"}, status=403)

        with transaction.atomic():
            recording = (
                RecordingRequest.objects
                .select_for_update()
                .filter(meeting=meeting, status="recording")
                .first()
            )

            if not recording:
                return Response(
                    {"detail": "No active recording"},
                    status=409,
                )

            recording.status = "stopping"
            recording.save(update_fields=["status"])

        try:
            stop_recording(recording.egress_id)

        except Exception:
            recording.status = "recording"
            recording.save(update_fields=["status"])

            return Response(
                {"detail": "Could not stop recording"},
                status=502,
            )

        return Response({
            "status": "stopping",
            "detail": "Stop requested. File is being finalized.",
        })


class RecordingHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)

        if meeting.host_id != request.user.id:
            return Response({"detail": "Host only"}, status=403)

        recordings = (
            RecordingRequest.objects
            .filter(meeting=meeting)
            .order_by("-created_at")[:100]
        )

        return Response([
            {
                "id": str(r.id),
                "status": r.status,
                "started_at": r.started_at,
                "stopped_at": r.stopped_at,
            }
            for r in recordings
        ])


class RecordingDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code, recording_id):
        meeting = get_object_or_404(Meeting, code=code)

        # Only the meeting host can download.
        if meeting.host_id != request.user.id:
            return Response({"detail": "Host only"}, status=403)

        recording = get_object_or_404(
            RecordingRequest,
            id=recording_id,
            meeting=meeting,
            status="completed",
        )

        if not recording.storage_key:
            return Response({"detail": "File unavailable"}, status=404)

        client = boto3.client(
            "s3",
            region_name=settings.RECORDING_S3_REGION,
            endpoint_url=(
                settings.RECORDING_S3_ENDPOINT or None
            ),
            aws_access_key_id=settings.RECORDING_S3_ACCESS_KEY,
            aws_secret_access_key=settings.RECORDING_S3_SECRET_KEY,
        )

        url = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.RECORDING_S3_BUCKET,
                "Key": recording.storage_key,
                "ResponseContentDisposition":
                    'attachment; filename="meetflow-recording.mp4"',
            },
            ExpiresIn=300,
        )

        return Response({"download_url": url})
