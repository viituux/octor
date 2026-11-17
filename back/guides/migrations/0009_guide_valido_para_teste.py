from django.db import migrations, models


def preserve_authorizations(apps, schema_editor):
    Guide = apps.get_model('guides', 'Guide')
    Guide.objects.using(schema_editor.connection.alias).filter(
        test_authorized_at__isnull=False,
        test_authorized_by_id=models.F('owner_id'),
        playback_environment='test',
    ).update(valido_para_teste=True)


class Migration(migrations.Migration):
    dependencies = [('guides', '0008_guide_test_authorization')]
    operations = [
        migrations.AddField('guide', 'valido_para_teste',
                            models.BooleanField(default=False, editable=False)),
        migrations.RunPython(preserve_authorizations, migrations.RunPython.noop),
    ]
