from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("meetings", "0001_initial"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name="AdmissionRequest", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("status", models.CharField(max_length=12, choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="pending")),
        ("requested_at", models.DateTimeField(auto_now_add=True)),
        ("meeting", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="admission_requests", to="meetings.meeting")),
        ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
    ]), migrations.AddConstraint(model_name="admissionrequest", constraint=models.UniqueConstraint(fields=("meeting", "user"), name="unique_meeting_admission"))]
