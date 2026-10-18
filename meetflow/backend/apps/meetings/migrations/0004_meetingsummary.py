from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('meetings', '0003_meeting_lifecycle')]
    operations = [
        migrations.CreateModel(
            name='MeetingSummary',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField()),
                ('source_message_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('meeting', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='ai_summary', to='meetings.meeting')),
            ],
        ),
    ]
