"""Preserva metadados legados e protege snapshots publicados contra escrita acidental."""
from django.db import migrations
from django.utils import timezone


def backfill(apps,schema_editor):
    Version=apps.get_model('trainings','QuizVersion')
    Part=apps.get_model('trainings','Participation')
    for version in Version.objects.all().iterator():
        Version.objects.filter(pk=version.pk).update(label=f'0.1.{version.number-1}.0')
    for part in Part.objects.select_related('user').filter(started_at__isnull=False).iterator():
        user=part.user
        Part.objects.filter(pk=part.pk).update(identity_snapshot={'user_id':user.pk,'username':user.username,
            'name':(user.first_name+' '+user.last_name).strip() or user.username,'email':user.email,
            'recorded_at':timezone.now().isoformat(),'source':'legacy_current_profile'})


SQL="""
CREATE FUNCTION octor_training_immutable() RETURNS trigger AS $$
DECLARE v_old bigint; v_new bigint;
BEGIN
 IF TG_TABLE_NAME = 'trainings_trainingaudit' THEN
  RAISE EXCEPTION 'Eventos de treinamento são somente de acréscimo';
 END IF;
 IF TG_TABLE_NAME = 'trainings_quizversion' THEN
  IF OLD.integrity_sha256 <> '' THEN RAISE EXCEPTION 'Versão publicada é imutável'; END IF;
 ELSE
  IF TG_TABLE_NAME IN ('trainings_quizquestion','trainings_trainingasset') THEN
   IF TG_OP <> 'INSERT' THEN v_old := OLD.version_id; END IF;
   IF TG_OP <> 'DELETE' THEN v_new := NEW.version_id; END IF;
  ELSE
   IF TG_OP <> 'INSERT' THEN SELECT version_id INTO v_old FROM trainings_quizquestion WHERE id=OLD.question_id; END IF;
   IF TG_OP <> 'DELETE' THEN SELECT version_id INTO v_new FROM trainings_quizquestion WHERE id=NEW.question_id; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM trainings_quizversion WHERE id IN (v_old,v_new) AND integrity_sha256 <> '') THEN
   RAISE EXCEPTION 'Conteúdo de versão publicada é imutável';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER octor_audit_immutable BEFORE UPDATE OR DELETE ON trainings_trainingaudit FOR EACH ROW EXECUTE FUNCTION octor_training_immutable();
CREATE TRIGGER octor_version_immutable BEFORE UPDATE OR DELETE ON trainings_quizversion FOR EACH ROW EXECUTE FUNCTION octor_training_immutable();
CREATE TRIGGER octor_question_immutable BEFORE INSERT OR UPDATE OR DELETE ON trainings_quizquestion FOR EACH ROW EXECUTE FUNCTION octor_training_immutable();
CREATE TRIGGER octor_alternative_immutable BEFORE INSERT OR UPDATE OR DELETE ON trainings_quizalternative FOR EACH ROW EXECUTE FUNCTION octor_training_immutable();
CREATE TRIGGER octor_asset_immutable BEFORE INSERT OR UPDATE OR DELETE ON trainings_trainingasset FOR EACH ROW EXECUTE FUNCTION octor_training_immutable();
"""
REVERSE="""
DROP TRIGGER IF EXISTS octor_asset_immutable ON trainings_trainingasset;
DROP TRIGGER IF EXISTS octor_alternative_immutable ON trainings_quizalternative;
DROP TRIGGER IF EXISTS octor_question_immutable ON trainings_quizquestion;
DROP TRIGGER IF EXISTS octor_version_immutable ON trainings_quizversion;
DROP TRIGGER IF EXISTS octor_audit_immutable ON trainings_trainingaudit;
DROP FUNCTION IF EXISTS octor_training_immutable();
"""


class Migration(migrations.Migration):
    dependencies=[('trainings','0003_participation_identity_snapshot_and_more')]
    operations=[migrations.RunPython(backfill,migrations.RunPython.noop),migrations.RunSQL(SQL,REVERSE)]
