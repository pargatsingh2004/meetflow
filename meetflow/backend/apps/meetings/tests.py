from unittest.mock import Mock, patch

from django.test import TestCase
from redis.exceptions import RedisError
from rest_framework.test import APIClient

from apps.accounts.models import User
from .models import Meeting, Message, Participant


class MessageListCreateViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="host@example.com",
            password="test-password",
            full_name="Meeting Host",
        )
        self.meeting = Meeting.objects.create(
            title="Test meeting",
            host=self.user,
        )
        Participant.objects.create(
            meeting=self.meeting,
            user=self.user,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("apps.meetings.views.async_to_sync")
    def test_message_is_saved_when_redis_broadcast_fails(self, async_to_sync):
        broadcast = Mock(side_effect=RedisError("Redis unavailable"))
        async_to_sync.return_value = broadcast

        with self.assertLogs("apps.meetings.views", level="WARNING") as logs:
            response = self.client.post(
                f"/api/meetings/{self.meeting.code}/messages/",
                {"text": "Hello everyone"},
                format="json",
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["text"], "Hello everyone")
        self.assertIn("Redis broadcast failed", logs.output[0])
        self.assertTrue(
            Message.objects.filter(
                meeting=self.meeting,
                user=self.user,
                text="Hello everyone",
            ).exists()
        )
        broadcast.assert_called_once()
