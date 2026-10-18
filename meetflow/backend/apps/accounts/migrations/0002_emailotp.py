from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.CreateModel(name="EmailOTP", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("email", models.EmailField(db_index=True, max_length=254)),
        ("purpose", models.CharField(choices=[("signup", "Signup"), ("reset", "Password reset")], max_length=12)),
        ("code_hash", models.CharField(max_length=128)),
        ("payload", models.JSONField(blank=True, default=dict)),
        ("expires_at", models.DateTimeField()),
        ("attempts", models.PositiveSmallIntegerField(default=0)),
        ("created_at", models.DateTimeField(auto_now_add=True)),
    ], options={"indexes": [models.Index(fields=["email", "purpose"], name="accounts_em_email_84b331_idx")]})]
