from celery import shared_task
import time
from .models import VideoJob


@shared_task
def generate_video_pipeline_task(job_id):
    try:
        job = VideoJob.objects.get(id=job_id)
        job.status = "generating_audio"
        job.progress = 20
        job.save()

        # Simulação inicial da pipeline até a integração do ffmpeg/tts
        time.sleep(1)
        job.status = "generating_subtitles"
        job.progress = 40
        job.save()

        time.sleep(1)
        job.status = "rendering"
        job.progress = 70
        job.save()

        time.sleep(1)
        job.status = "completed"
        job.progress = 100
        job.save()
    except VideoJob.DoesNotExist:
        pass
    except Exception as e:
        if "job" in locals():
            job.status = "failed"
            job.error_message = str(e)
            job.save()
