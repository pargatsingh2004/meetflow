import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("meetings", "0007_meetingrecording"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField(model_name="meeting", name="duration_minutes", field=models.PositiveIntegerField(default=60)),
        migrations.AddField(model_name="meeting", name="recurrence", field=models.CharField(max_length=10, choices=[("none", "None"), ("daily", "Daily"), ("weekly", "Weekly")], default="none")),
        migrations.AddField(model_name="meeting", name="series_id", field=models.UUIDField(null=True, blank=True, db_index=True)),
        migrations.AddField(model_name="participant", name="role", field=models.CharField(max_length=10, choices=[("attendee", "Attendee"), ("cohost", "Co-host")], default="attendee")),
        migrations.CreateModel(name="MeetingInvitation", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("email", models.EmailField(max_length=254)), ("sent_at", models.DateTimeField(null=True, blank=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("meeting", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="invitations", to="meetings.meeting"))]),
        migrations.CreateModel(name="RaisedHand", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("raised_at", models.DateTimeField(auto_now_add=True)), ("meeting", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="raised_hands", to="meetings.meeting")), ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL))]),
        migrations.AddConstraint(model_name="meetinginvitation", constraint=models.UniqueConstraint(fields=("meeting", "email"), name="unique_meeting_invitee")),
        migrations.AddConstraint(model_name="raisedhand", constraint=models.UniqueConstraint(fields=("meeting", "user"), name="unique_meeting_raised_hand")),
    ]
