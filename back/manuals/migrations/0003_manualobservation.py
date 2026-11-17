import django.db.models.deletion
import manuals.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('manuals', '0002_manualrun_agent_state')]
    operations = [migrations.CreateModel(
        name='ManualObservation',
        fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('execution_id', models.UUIDField()),
            ('step_id', models.UUIDField(unique=True)),
            ('request_hash', models.CharField(max_length=64)),
            ('status', models.CharField(default='ANALYZING', max_length=20)),
            ('screenshot', models.ImageField(storage=manuals.models.PrivateManualStorage(), upload_to='observations/%Y/%m/%d/')),
            ('result_screenshot', models.ImageField(blank=True, storage=manuals.models.PrivateManualStorage(), upload_to='observations/%Y/%m/%d/')),
            ('action_status', models.CharField(blank=True, default='', max_length=20)),
            ('decision', models.JSONField(default=dict)),
            ('capture', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='manuals.manualcapture')),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='observations', to='manuals.manualrun')),
        ],
    )]
