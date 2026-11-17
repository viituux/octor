from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('trainings', '0005_training_document_profile'),
                    migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField('participation', 'approved_at',
                            models.DateTimeField(null=True, blank=True, editable=False)),
        migrations.AddField('participation', 'approved_by',
                            models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                              editable=False, on_delete=models.SET_NULL, related_name='+')),
    ]
