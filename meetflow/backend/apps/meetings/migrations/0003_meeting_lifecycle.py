from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("meetings", "0002_admissionrequest")]
    operations = [
        migrations.AddField(model_name="meeting", name="is_locked", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="meeting", name="ended_at", field=models.DateTimeField(null=True, blank=True)),
    ]
