# Migração histórica Django: registra o esquema e suas dependências. Comentários não alteram operações nem a ordem aplicada ao banco.
# Dependência: modelos, consultas e transações do banco relacional.
from django.db import migrations, models

class Migration(migrations.Migration):
    # list: migrações que devem existir antes desta operação histórica.
    dependencies = [('guides', '0004_guide_capture_audio')]
    # list: alterações de esquema aplicadas na ordem declarada.
    operations = [migrations.AddField(model_name='step', name='generation_prompt', field=models.TextField(blank=True, default='', max_length=3000))]
