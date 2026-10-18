from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from .models import Meeting, Participant, RaisedHand

User = get_user_model()
ALLOWED_REACTIONS = {"❤️", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"}


class MeetingConsumer(AsyncJsonWebsocketConsumer):
    """Chat broadcast, presence, hand raise, reactions and host actions for one meeting.

    Chat messages are created through the REST endpoint (so they are persisted)
    and broadcast to this group from there.
    """

    async def connect(self):
        self.code = self.scope["url_route"]["kwargs"]["code"].lower()
        self.group = f"meeting_{self.code}"
        self.joined = False
        token = (parse_qs(self.scope["query_string"].decode()).get("token") or [""])[0]
        self.user = await self._get_user(token)
        await self.accept()
        if self.user is None:
            await self.close(code=4401)
            return
        self.is_host = await self._check_host_and_participant()
        if self.is_host is None:
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        self.joined = True
        await self.channel_layer.group_send(
            self.group, {"type": "presence.event", "event": "join", "user": self._me()}
        )

    async def disconnect(self, code):
        if getattr(self, "joined", False):
            await self.channel_layer.group_send(
                self.group, {"type": "presence.event", "event": "leave", "user": self._me()}
            )
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        me = str(self.user.id)
        if kind == "hand":
            await self._persist_hand(bool(content.get("raised")))
            await self._relay({"type": "hand", "identity": me, "raised": bool(content.get("raised"))})
        elif kind == "reaction":
            emoji = content.get("emoji")
            if emoji in ALLOWED_REACTIONS:
                await self._relay({"type": "reaction", "identity": me, "name": self.user.full_name, "emoji": emoji})
        elif kind in ("mute_request", "lower_hand") and await self._is_moderator():
            target = str(content.get("target", ""))
            if kind == "lower_hand" and target.isdecimal():
                await self._lower_hand(int(target))
            if kind == "mute_request" and (target == "all" or not target.isdecimal()):
                return
            await self._relay({"type": "host_action", "action": kind, "target": target, "by": me})
        elif kind == "ping":
            await self.send_json({"type": "pong"})

    # ---- group event handlers ----
    async def chat_message(self, event):
        await self.send_json({"type": "chat", "message": event["message"]})

    async def presence_event(self, event):
        await self.send_json({"type": "presence", "event": event["event"], "user": event["user"]})

    async def relay(self, event):
        await self.send_json(event["payload"])

    # ---- helpers ----
    async def _relay(self, payload):
        await self.channel_layer.group_send(self.group, {"type": "relay", "payload": payload})

    def _me(self):
        return {"id": str(self.user.id), "full_name": self.user.full_name, "avatar_url": self.user.avatar_url}

    @database_sync_to_async
    def _get_user(self, token):
        try:
            return User.objects.get(pk=AccessToken(token)["user_id"], is_active=True)
        except Exception:
            return None

    @database_sync_to_async
    def _check_host_and_participant(self):
        meeting = Meeting.objects.filter(code=self.code).first()
        if not meeting or not Participant.objects.filter(meeting=meeting, user=self.user).exists():
            return None
        return meeting.host_id == self.user.id

    @database_sync_to_async
    def _is_moderator(self):
        meeting = Meeting.objects.filter(code=self.code, ended_at__isnull=True).first()
        return bool(meeting and (meeting.host_id == self.user.id or Participant.objects.filter(meeting=meeting, user=self.user, role="cohost").exists()))

    @database_sync_to_async
    def _persist_hand(self, raised):
        meeting = Meeting.objects.filter(code=self.code).first()
        if meeting:
            if raised: RaisedHand.objects.get_or_create(meeting=meeting, user=self.user)
            else: RaisedHand.objects.filter(meeting=meeting, user=self.user).delete()

    @database_sync_to_async
    def _lower_hand(self, user_id):
        RaisedHand.objects.filter(meeting__code=self.code, user_id=user_id).delete()
