from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("guides", "0003_step_narration")]
    operations = [migrations.AddField(model_name="guide", name="capture_audio", field=models.FileField(upload_to="capture_audio/%Y/%m/%d/", null=True, blank=True))]
