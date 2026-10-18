from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Meeting, Message

User = get_user_model()


class PublicUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "avatar_url"]


class MeetingSerializer(serializers.ModelSerializer):
    host = PublicUserSerializer(read_only=True)
    room_name = serializers.CharField(source="code", read_only=True)
    is_host = serializers.SerializerMethodField()
    host_livekit_identity = serializers.SerializerMethodField()
    class Meta:
        model = Meeting
        fields = ["code", "room_name", "title", "host", "is_host", "scheduled_for", "created_at", "is_locked", "ended_at"]
        read_only_fields = ["code", "created_at"]

    def get_is_host(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.host_id == request.user.id)


class MessageSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "text", "created_at", "user"]
        read_only_fields = ["id", "created_at"]

class MeetingSerializer(serializers.ModelSerializer):
    host = PublicUserSerializer(read_only=True)
    room_name = serializers.CharField(
        source="code",
        read_only=True
    )
    is_host = serializers.SerializerMethodField()
    host_livekit_identity = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "code",
            "room_name",
            "title",
            "host",
            "is_host",
            "host_livekit_identity",
            "scheduled_for",
            "duration_minutes",
            "recurrence",
            "series_id",
            "created_at",
            "is_locked",
            "ended_at",
        ]
        read_only_fields = ["code", "created_at"]

    def get_is_host(self, obj):
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and obj.host_id == request.user.id
        )

    def get_host_livekit_identity(self, obj):
        return str(obj.host_id)