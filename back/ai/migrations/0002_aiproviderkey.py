from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ai", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="AIProviderKey",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
                ("provider", models.CharField(choices=[("gemini", "Google Gemini"), ("openai", "OpenAI")], max_length=20)),
                ("encrypted_secret", models.TextField()),
                ("model", models.CharField(blank=True, max_length=120)),
                ("priority", models.PositiveSmallIntegerField(default=100)),
                ("active", models.BooleanField(default=True)),
                ("backup_authorized", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ("priority", "id")},
        ),
    ]
