from django.db import migrations, models
from django.db.models import F


def preserve_content_dates(apps, schema_editor):
    """Mantém datas e conclusões anteriores sem exigir quiz retroativamente."""
    apps.get_model('trainings','Participation').objects.filter(completed_at__isnull=False).update(content_completed_at=F('completed_at'))


class Migration(migrations.Migration):
    dependencies=[('trainings','0001_initial')]
    operations=[
        migrations.AddField('quizversion','requires_quiz',models.BooleanField(default=False)),
        migrations.AddField('participation','content_completed_at',models.DateTimeField(null=True,blank=True)),
        migrations.AddField('participation','quiz_attempt_limit',models.PositiveSmallIntegerField(default=1)),
        migrations.AddField('quizresult','duration_ms',models.PositiveBigIntegerField(default=0)),
        migrations.RunPython(preserve_content_dates,migrations.RunPython.noop),
    ]
