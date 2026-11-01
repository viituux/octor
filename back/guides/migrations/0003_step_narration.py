# Migração histórica Django: registra o esquema e suas dependências. Comentários não alteram operações nem a ordem aplicada ao banco.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import migrations, models

class Migration(migrations.Migration):
    # list: migrações que devem existir antes desta operação histórica.
    dependencies = [("guides", "0002_alter_step_selector_alter_step_url")]
    # list: alterações de esquema aplicadas na ordem declarada.
    operations = [migrations.AddField(model_name="step", name="narration", field=models.FileField(upload_to="narrations/%Y/%m/%d/", null=True, blank=True))]
