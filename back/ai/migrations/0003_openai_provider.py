from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('ai', '0002_usage_controls')]

    operations = [
        migrations.AlterField(
            model_name='aiproviderkey',
            name='provider',
            field=models.CharField(
                choices=[('gemini', 'Gemini'), ('openai', 'OpenAI')],
                default='gemini',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='aiproviderkey',
            name='model',
            field=models.CharField(
                blank=True,
                help_text='Vazio usa o modelo padrão do provedor.',
                max_length=120,
            ),
        ),
    ]
