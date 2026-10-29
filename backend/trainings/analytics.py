from datetime import datetime
from collections import defaultdict
from django.utils import timezone
from rest_framework import serializers
from .models import Participation,QuizResult,Feedback

class Filters(serializers.Serializer):
    start=serializers.DateField(required=False)
    end=serializers.DateField(required=False)
    rating=serializers.IntegerField(min_value=1,max_value=5,required=False)
    min_percent=serializers.IntegerField(min_value=0,max_value=100,required=False)
    def validate(self,data):
        if data.get('start') and data.get('end') and data['start']>data['end']:raise serializers.ValidationError('O início deve ser anterior ao fim do período.')
        return data


def filtered(query,field,data):
    if data.get('start'):query=query.filter(**{field+'__date__gte':data['start']})
    if data.get('end'):query=query.filter(**{field+'__date__lte':data['end']})
    return query


def analytics(trainings,params):
    form=Filters(data=params);form.is_valid(raise_exception=True);f=form.validated_data
    training_list=list(trainings);ids=[t.id for t in training_list]
    parts=list(Participation.objects.filter(training_id__in=ids).select_related('user'))
    feedbacks=filtered(Feedback.objects.filter(training_id__in=ids),'created_at',f)
    if 'rating' in f:feedbacks=feedbacks.filter(stars=f['rating'])
    feedbacks=list(feedbacks.select_related('user','training'))
    results=filtered(QuizResult.objects.filter(training_id__in=ids,finished_at__isnull=False),'finished_at',f)
    if 'min_percent' in f:results=results.filter(correct_count__gte=f['min_percent']/20)
    # Count each participant's best result once, even if retries are enabled.
    best={}
    for r in results.select_related('user'):
        key=(r.training_id,r.user_id)
        if key not in best or r.score>best[key].score:best[key]=r
    completed=list(filtered(Participation.objects.filter(training_id__in=ids,completed_at__isnull=False),'completed_at',f))
    rows=[]
    for t in training_list:
        tp=[p for p in parts if p.training_id==t.id];tf=[x for x in feedbacks if x.training_id==t.id];tr=[r for r in best.values() if r.training_id==t.id];tc=[p for p in completed if p.training_id==t.id]
        rows.append({'id':t.id,'title':t.title,'status':t.status,'participants':len(tp),'evaluations':len(tf),'average_stars':round(sum(x.stars for x in tf)/len(tf),2) if tf else None,'average_percent':round(sum(r.correct_count*20 for r in tr)/len(tr),1) if tr else None,'completions':len(tc),'completion_rate':round(100*len(tc)/len(tp),1) if tp else 0})
    users={}
    for r in best.values():
        if r.user_id not in users:users[r.user_id]={'id':r.user_id,'name':r.user.get_full_name() or r.user.username,'score':0,'trainings':0}
        users[r.user_id]['score']+=r.score;users[r.user_id]['trainings']+=1
    ranking=sorted(users.values(),key=lambda x:(-x['score'],x['name']))[:10]
    last_score=None;rank=0
    for index,row in enumerate(ranking,1):
        if row['score']!=last_score:rank=index
        row['rank']=rank;last_score=row['score']
    months=defaultdict(lambda:{'completions':0,'stars':[],'percents':[]})
    for p in completed:months[timezone.localtime(p.completed_at).strftime('%Y-%m')]['completions']+=1
    for fb in feedbacks:months[timezone.localtime(fb.created_at).strftime('%Y-%m')]['stars'].append(fb.stars)
    for r in best.values():months[timezone.localtime(r.finished_at).strftime('%Y-%m')]['percents'].append(r.correct_count*20)
    # Keep empty months between activity dates visible instead of joining across gaps.
    if months:
        first=min(months);last=max(months);year,month=map(int,first.split('-'))
        while f'{year:04d}-{month:02d}'<=last:
            months[f'{year:04d}-{month:02d}']
            month+=1
            if month==13:year+=1;month=1
    timeline=[{'month':key,'completions':value['completions'],'average_stars':round(sum(value['stars'])/len(value['stars']),2) if value['stars'] else None,'average_percent':round(sum(value['percents'])/len(value['percents']),1) if value['percents'] else None} for key,value in sorted(months.items())]
    return {'trainings':rows,'metrics':{'completed':len(completed),'average_stars':round(sum(x.stars for x in feedbacks)/len(feedbacks),2) if feedbacks else None,'average_percent':round(sum(r.correct_count*20 for r in best.values())/len(best),1) if best else None,'comments':sum(bool(x.comment.strip()) for x in feedbacks)},'training_ranking':sorted([r for r in rows if r['evaluations']],key=lambda r:(-r['average_stars'],-r['evaluations'],r['title'])),'user_ranking':ranking,'timeline':timeline,'latest_comments':[{'training_id':x.training_id,'training':x.training.title,'user':x.user.get_full_name() or x.user.username,'stars':x.stars,'comment':x.comment,'created_at':x.created_at} for x in sorted(feedbacks,key=lambda f:f.created_at,reverse=True) if x.comment.strip()][:10]}
