import time
import jwt

from django.conf import settings

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.meetings.models import (
    Meeting,
    Participant,
    AdmissionRequest,
)


TOKEN_TTL_SECONDS = 24 * 60 * 60


def mint_livekit_token(*, identity, name, room, is_host):
    """
    Generate a LiveKit JWT.

    This token is used ONLY for connecting
    to the LiveKit server.
    """

    now = int(time.time())

    claims = {
        "iss": settings.LIVEKIT_API_KEY,
        "sub": identity,
        "name": name,
        "nbf": now,
        "exp": now + TOKEN_TTL_SECONDS,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
            "roomAdmin": bool(is_host),
        },
    }

    return jwt.encode(
        claims,
        settings.LIVEKIT_API_SECRET,
        algorithm="HS256",
    )


class LiveKitTokenView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        room = (
            request.data.get("roomName") or ""
        ).strip().lower()

        if not room:
            return Response(
                {"detail": "Room name is required."},
                status=400,
            )

        meeting = Meeting.objects.filter(
            code=room
        ).first()

        if not meeting:
            return Response(
                {"detail": "Meeting not found."},
                status=404,
            )

        if meeting.ended_at:
            return Response(
                {"detail": "Meeting has ended."},
                status=410,
            )

        removed = AdmissionRequest.objects.filter(
            meeting=meeting,
            user=request.user,
            status="removed",
        ).exists()

        if removed:
            return Response(
                {"detail": "You were removed by the host."},
                status=403,
            )

        is_host = meeting.host_id == request.user.id

        is_participant = Participant.objects.filter(
            meeting=meeting,
            user=request.user,
        ).exists()

        if not is_host and not is_participant:
            return Response(
                {"detail": "Waiting for host approval."},
                status=403,
            )

        name = (
            request.data.get("participantName")
            or getattr(request.user, "full_name", "")
            or request.user.email
        ).strip()[:80]

        token = mint_livekit_token(
            identity=str(request.user.id),
            name=name,
            room=meeting.code,
            is_host=is_host,
        )

        return Response({
            "token": token,
            "url": settings.LIVEKIT_URL,
            "identity": str(request.user.id),
        })