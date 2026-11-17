from django.db import migrations, models
from django.conf import settings
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('guides', '0007_guide_playback_environment'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField(model_name='guide', name='test_authorized_at', field=models.DateTimeField(null=True, blank=True, editable=False)),
        migrations.AddField(model_name='guide', name='test_authorized_by', field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, editable=False, related_name='test_authorized_guides')),
    ]
