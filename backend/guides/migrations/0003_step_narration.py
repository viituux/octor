from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("guides", "0002_alter_step_selector_alter_step_url")]
    operations = [migrations.AddField(model_name="step", name="narration", field=models.FileField(upload_to="narrations/%Y/%m/%d/", null=True, blank=True))]
