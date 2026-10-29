from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('guides', '0004_guide_capture_audio')]
    operations = [migrations.AddField(model_name='step', name='generation_prompt', field=models.TextField(blank=True, default='', max_length=3000))]
