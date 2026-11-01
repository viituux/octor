# Migração histórica Django: registra o esquema e suas dependências. Comentários não alteram operações nem a ordem aplicada ao banco.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import migrations, models

class Migration(migrations.Migration):
    # list: migrações que devem existir antes desta operação histórica.
    dependencies = [("guides", "0003_step_narration")]
    # list: alterações de esquema aplicadas na ordem declarada.
    operations = [migrations.AddField(model_name="guide", name="capture_audio", field=models.FileField(upload_to="capture_audio/%Y/%m/%d/", null=True, blank=True))]
