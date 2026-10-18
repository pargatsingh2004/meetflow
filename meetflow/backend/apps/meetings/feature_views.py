from urllib.parse import urlencode
from datetime import timedelta, timezone as utc_timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Meeting, Participant, RaisedHand


def membership(meeting, user):
    if meeting.host_id == user.id:
        return "host"
    return Participant.objects.filter(meeting=meeting, user=user).values_list("role", flat=True).first()


def broadcast(meeting, payload):
    layer = get_channel_layer()
    if layer:
        async_to_sync(layer.group_send)(f"meeting_{meeting.code}", {"type": "relay", "payload": payload})


class ModerationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)
        role = membership(meeting, request.user)
        if not role:
            return Response({"detail": "Not a participant."}, status=403)
        hands = RaisedHand.objects.filter(meeting=meeting).select_related("user").order_by("raised_at", "id")
        return Response({"role": role, "locked": meeting.is_locked, "hands": [
            {"identity": str(h.user_id), "name": h.user.full_name or h.user.email, "raised_at": h.raised_at} for h in hands]})

    def post(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)
        role = membership(meeting, request.user)
        if not role or meeting.ended_at:
            return Response({"detail": "Not allowed or meeting ended."}, status=403)
        action = request.data.get("action")
        target = str(request.data.get("identity") or "")
        if action == "raise_hand":
            RaisedHand.objects.get_or_create(meeting=meeting, user=request.user)
            broadcast(meeting, {"type": "hand", "identity": str(request.user.id), "raised": True})
        elif action == "lower_hand":
            if target and target != str(request.user.id) and role not in ("host", "cohost"):
                return Response({"detail": "Moderator required."}, status=403)
            if target and not target.isdecimal():
                return Response({"detail": "Invalid identity."}, status=400)
            uid = int(target) if target else request.user.id
            RaisedHand.objects.filter(meeting=meeting, user_id=uid).delete()
            broadcast(meeting, {"type": "hand", "identity": str(uid), "raised": False})
        elif action in ("mute_all", "mute_request"):
            if role not in ("host", "cohost"):
                return Response({"detail": "Moderator required."}, status=403)
            if action == "mute_request" and (not target.isdecimal() or not Participant.objects.filter(meeting=meeting, user_id=int(target)).exists()):
                return Response({"detail": "Invalid target."}, status=400)
            broadcast(meeting, {"type": "host_action", "action": "mute_request", "target": target if action == "mute_request" else "all", "by": str(request.user.id)})
        elif action == "set_role":
            if role != "host":
                return Response({"detail": "Only host can assign roles."}, status=403)
            new_role = request.data.get("role")
            if new_role not in ("attendee", "cohost") or not target.isdecimal() or int(target) == meeting.host_id:
                return Response({"detail": "Invalid role or target."}, status=400)
            changed = Participant.objects.filter(meeting=meeting, user_id=int(target)).update(role=new_role)
            if not changed: return Response({"detail": "Participant not found."}, status=404)
            broadcast(meeting, {"type": "role_changed", "identity": target, "role": new_role})
        elif action in ("lock", "unlock"):
            if role not in ("host", "cohost"):
                return Response({"detail": "Moderator required."}, status=403)
            meeting.is_locked = action == "lock"
            meeting.save(update_fields=["is_locked"])
            broadcast(meeting, {"type": "meeting_lock", "locked": meeting.is_locked})
        else:
            return Response({"detail": "Unknown action."}, status=400)
        return self.get(request, code)


class GoogleCalendarLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        meeting = get_object_or_404(Meeting, code=code)
        if not membership(meeting, request.user):
            return Response({"detail": "Not a participant."}, status=403)
        if not meeting.scheduled_for:
            return Response({"detail": "Meeting not scheduled."}, status=400)
        start = meeting.scheduled_for.astimezone(utc_timezone.utc)
        end = start + timedelta(minutes=meeting.duration_minutes)
        stamp = lambda dt: dt.strftime("%Y%m%dT%H%M%SZ")
        url = "https://calendar.google.com/calendar/render?" + urlencode({
            "action": "TEMPLATE", "text": meeting.title, "dates": f"{stamp(start)}/{stamp(end)}",
            "details": "Join MeetFlow: " + request.build_absolute_uri(f"/meeting/{meeting.code}/"),
        })
        return Response({"url": url})
