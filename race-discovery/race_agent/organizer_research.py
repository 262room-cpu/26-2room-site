from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
from urllib.parse import urlparse

from .core import classify_source, domain, html_to_text, normalize
from .market_config import enabled_markets, load_market_config
from .organizers import (
    _instagram_profile,
    _telegram_profile,
    _unique,
    _whatsapp_link,
    extract_public_contact_candidates,
    outreach_ready,
)
from .providers import CombinedSearchProvider, SearchHit, fetch_url

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config'
RUNTIME = ROOT / 'runtime'
MARKET_ROOT = RUNTIME / 'markets'

GENERIC_NAME_TOKENS = {
    'marathon','марафон','half','полумарафон','run','race','trail','трейл','забег','running',
    '2026','2027','2028','the','and','for','of','им','international','международный','международныи',
}
SOCIAL_HOSTS = {'instagram.com','www.instagram.com','t.me','telegram.me','www.facebook.com','facebook.com'}


def _read_jsonl(path:pathlib.Path)->list[dict]:
    if not path.exists():
        return []
    out=[]
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def _write_jsonl(path:pathlib.Path, rows:list[dict])->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')


def _write_json(path:pathlib.Path,payload:dict)->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def _tokens(value:str)->set[str]:
    return {t for t in normalize(value).split() if len(t)>=3 and t not in GENERIC_NAME_TOKENS and not t.isdigit()}


def _overlap(name:str,text:str)->float:
    wanted=_tokens(name)
    if not wanted:
        return 0.0
    hay=set(normalize(text).split())
    return len(wanted & hay)/len(wanted)


def relation_score(hit:SearchHit,event:dict,organizer:dict|None)->float:
    text=f'{hit.title} {hit.snippet} {hit.url}'
    ntext=normalize(text)
    event_name=str(event.get('name') or '')
    org_name=str((organizer or {}).get('name') or '')
    score=0.0
    if org_name and len(normalize(org_name))>=4 and normalize(org_name) in ntext:
        score+=0.48
    score+=0.28*_overlap(org_name,text) if org_name else 0.0
    if event_name and len(normalize(event_name))>=5 and normalize(event_name) in ntext:
        score+=0.42
    score+=0.25*_overlap(event_name,text)
    city=normalize(str(event.get('city') or ''))
    country=normalize(str(event.get('country') or ''))
    if city and city in ntext:
        score+=0.10
    if country and country in ntext:
        score+=0.06
    hit_domain=domain(hit.url)
    known_domains={domain(u) for u in list(event.get('source_urls',[]))+[event.get('official_site') or ''] if u}
    if hit_domain and hit_domain in known_domains:
        score+=0.18
    if hit_domain in SOCIAL_HOSTS or hit_domain.endswith('instagram.com'):
        score+=0.06
    return round(min(1.0,score),3)


def _social_contact(url:str)->tuple[str,str]:
    host=domain(url)
    if 'instagram.com' in host:
        return 'instagram',_instagram_profile(url)
    if host in {'t.me','telegram.me'}:
        return 'telegram',_telegram_profile(url)
    if host=='wa.me' or 'whatsapp.com' in host:
        return 'whatsapp',_whatsapp_link(url)
    return '',''


def _has_primary_candidate(profile:dict,kind:str,value:str)->bool:
    target=normalize(value)
    for row in profile.get('evidence',[]):
        if row.get('source_type') not in {'official_event','official_organizer'}:
            continue
        if row.get('field') not in {kind,f'contact.{kind}',f'contact_candidate.{kind}'}:
            continue
        if normalize(str(row.get('value') or ''))==target:
            return True
    return False


def apply_social_hit(profile:dict,event:dict,hit:SearchHit,observed_at:str)->tuple[bool,bool,float]:
    score=relation_score(hit,event,profile)
    kind,value=_social_contact(hit.url)
    if not kind or not value or score<0.58:
        return False,False,score
    profile.setdefault('contact_candidates',{}).setdefault(kind,[])
    profile['contact_candidates'][kind]=_unique(profile['contact_candidates'][kind]+[value])
    profile.setdefault('evidence',[]).append({
        'field':f'contact_candidate.{kind}','value':value,'url':hit.url,'source_type':'search_result',
        'observed_at':observed_at,'weight':0.25,'public_contact':True,
        'association':'SEARCH_CORROBORATION','relation_score':score,
        'search_title':hit.title[:240],
    })
    promoted=False
    if score>=0.72 and _has_primary_candidate(profile,kind,value):
        profile.setdefault('contacts',{}).setdefault(kind,[])
        profile['contacts'][kind]=_unique(profile['contacts'][kind]+[value])
        profile['evidence'].append({
            'field':f'contact.{kind}','value':value,'url':hit.url,'source_type':'search_result',
            'observed_at':observed_at,'weight':0.25,'public_contact':True,
            'association':'CORROBORATED_EVENT_OUTREACH_CHANNEL','relation_score':score,
        })
        promoted=True
    return True,promoted,score


def _official_domains(event:dict,profile:dict,cfg:dict)->set[str]:
    out={domain(u) for u in list(event.get('source_urls',[]))+[event.get('official_site') or ''] if u}
    for u in (profile.get('contacts') or {}).get('website',[]):
        out.add(domain(u))
    for u in (profile.get('contact_candidates') or {}).get('website',[]):
        out.add(domain(u))
    for hint,source_type in cfg.get('source_hints',{}).items():
        if source_type in {'official_event','official_organizer'}:
            out.add(hint.lower().removeprefix('www.'))
    return {x for x in out if x}


def apply_official_web_hit(profile:dict,event:dict,hit:SearchHit,cfg:dict,observed_at:str)->tuple[bool,int]:
    score=relation_score(hit,event,profile)
    hit_domain=domain(hit.url)
    if score<0.58 or hit_domain not in _official_domains(event,profile,cfg):
        return False,0
    try:
        raw=fetch_url(hit.url,timeout=14)
    except Exception:
        return False,0
    if not raw:
        return False,0
    page_text,_=html_to_text(raw)
    org_name=normalize(str(profile.get('name') or ''))
    event_name=normalize(str(event.get('name') or ''))
    normalized_page=normalize(page_text[:50000])
    tied=bool((org_name and org_name in normalized_page) or (event_name and event_name in normalized_page))
    if not tied:
        return False,0
    source_type=classify_source(hit.url,cfg.get('source_hints',{}))
    candidates=extract_public_contact_candidates(raw,hit.url)
    promoted=0
    for kind in ('email','phone','whatsapp'):
        for value in candidates.get(kind,[]):
            profile.setdefault('contacts',{}).setdefault(kind,[])
            profile['contacts'][kind]=_unique(profile['contacts'][kind]+[value])
            promoted+=1
            profile.setdefault('evidence',[]).append({
                'field':f'contact.{kind}','value':value,'url':hit.url,'source_type':source_type,
                'observed_at':observed_at,'weight':0.9 if source_type in {'official_event','official_organizer'} else 0.65,
                'public_contact':True,'association':'OFFICIAL_DOMAIN_OUTREACH_CONTACT',
            })
    if source_type=='official_organizer' and org_name:
        for kind in ('instagram','telegram'):
            for value in candidates.get(kind,[]):
                profile.setdefault('contacts',{}).setdefault(kind,[])
                profile['contacts'][kind]=_unique(profile['contacts'][kind]+[value])
                promoted+=1
                profile.setdefault('evidence',[]).append({
                    'field':f'contact.{kind}','value':value,'url':hit.url,'source_type':source_type,
                    'observed_at':observed_at,'weight':0.95,'public_contact':True,
                    'association':'OFFICIAL_ORGANIZER_DOMAIN_CONTACT',
                })
    return True,promoted


def _refresh_contact_status(profile:dict)->None:
    contacts=profile.get('contacts') or {}
    has_route=any(contacts.get(k) for k in ('instagram','telegram','whatsapp','email','phone'))
    if profile.get('identity_status')=='NAMED' and has_route:
        profile['contact_status']='READY_TO_CONTACT'
    elif profile.get('identity_status')=='NAMED':
        profile['contact_status']='CONTACTS_MISSING'
    elif has_route:
        profile['contact_status']='CONTACT_ROUTE_FOUND_IDENTITY_PENDING'
    else:
        profile['contact_status']='NEEDS_IDENTITY_CHECK'


def research_market(code:str,cfg:dict,max_tasks:int=8,queries_per_task:int=3,results_per_query:int=6)->dict:
    root=MARKET_ROOT/code
    queue=_read_jsonl(root/'organizer_research_queue.jsonl')
    organizers=_read_jsonl(root/'organizers.jsonl')
    events=_read_jsonl(root/'candidates.jsonl')
    if not queue:
        return {'market_code':code,'tasks_processed':0,'search_hits':0,'candidates_found':0,'contacts_promoted':0}
    by_event={e.get('candidate_id'):e for e in events if e.get('candidate_id')}
    by_org={o.get('organizer_id'):o for o in organizers if o.get('organizer_id')}
    provider=CombinedSearchProvider(gl=cfg.get('news_gl'),language=cfg.get('news_language'),ceid=cfg.get('news_ceid'))
    observed=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    evidence_rows=[]
    tasks_processed=hits_seen=found=promoted=0
    web_fetches=0
    max_web_fetches=max(2,max_tasks)

    for task in queue:
        if tasks_processed>=max_tasks:
            break
        if task.get('status') in {'RESOLVED_READY_TO_CONTACT','DISMISSED'}:
            continue
        event=by_event.get(task.get('candidate_id'))
        if not event:
            task['status']='STALE_EVENT'
            continue
        profile=by_org.get(task.get('organizer_id'))
        if not profile:
            linked=[o for o in organizers if event.get('candidate_id') in o.get('event_ids',[])]
            profile=linked[0] if linked else None
        tasks_processed+=1
        task_candidates=[]
        task_promoted=0
        task_hits=0
        for query in task.get('search_queries',[])[:queries_per_task]:
            try:
                hits=provider.search(query,limit=results_per_query)
            except Exception as exc:
                task.setdefault('errors',[]).append(type(exc).__name__+': '+str(exc)[:180])
                continue
            for hit in hits:
                hits_seen+=1
                task_hits+=1
                score=relation_score(hit,event,profile)
                if score<0.58:
                    continue
                record={'observed_at':observed,'market_code':code,'task_id':task.get('task_id'),'candidate_id':event.get('candidate_id'),'organizer_id':task.get('organizer_id'),'query':query,'url':hit.url,'title':hit.title,'snippet':hit.snippet[:800],'relation_score':score}
                evidence_rows.append(record)
                if profile:
                    added,promoted_social,_=apply_social_hit(profile,event,hit,observed)
                    if added:
                        found+=1
                        task_candidates.append(hit.url)
                    if promoted_social:
                        promoted+=1
                        task_promoted+=1
                    if not _social_contact(hit.url)[0] and web_fetches<max_web_fetches:
                        used,count=apply_official_web_hit(profile,event,hit,cfg,observed)
                        if used:
                            web_fetches+=1
                            promoted+=count
                            task_promoted+=count
                            if count:
                                task_candidates.append(hit.url)
                else:
                    kind,value=_social_contact(hit.url)
                    if kind and value:
                        task_candidates.append(value)
                        found+=1
        if profile:
            _refresh_contact_status(profile)
            task['organizer_id']=profile.get('organizer_id') or task.get('organizer_id') or ''
            if profile.get('contact_status')=='READY_TO_CONTACT':
                task['status']='RESOLVED_READY_TO_CONTACT'
            elif task_candidates:
                task['status']='FOUND_CANDIDATES_NEEDS_VERIFICATION'
            else:
                task['status']='RESEARCHED_NO_CONTACT'
        else:
            task['status']='IDENTITY_MISSING_CONTACT_CANDIDATES' if task_candidates else 'RESEARCHED_IDENTITY_MISSING'
        task['last_researched_at']=observed
        task['search_hits_checked']=task_hits
        task['discovered_contact_candidates']=_unique(list(task.get('discovered_contact_candidates',[]))+task_candidates)[:50]
        task['contacts_promoted']=int(task.get('contacts_promoted',0))+task_promoted

    for event in events:
        profile=by_org.get(event.get('organizer_id'))
        if profile:
            event['organizer_contact_status']=profile.get('contact_status') or event.get('organizer_contact_status')

    _write_jsonl(root/'organizers.jsonl',organizers)
    _write_jsonl(root/'organizer_research_queue.jsonl',queue)
    _write_jsonl(root/'candidates.jsonl',events)
    _write_jsonl(root/'organizer_outreach_ready.jsonl',outreach_ready(organizers))
    old_evidence=_read_jsonl(root/'organizer_research_evidence.jsonl')
    _write_jsonl(root/'organizer_research_evidence.jsonl',(old_evidence+evidence_rows)[-1500:])
    summary={
        'market_code':code,'observed_at':observed,'tasks_processed':tasks_processed,
        'search_hits':hits_seen,'candidates_found':found,'contacts_promoted':promoted,
        'outreach_ready':len(outreach_ready(organizers)),'web_pages_verified':web_fetches,
    }
    _write_json(root/'ORGANIZER_RESEARCH_STATE.json',summary)
    return summary


def choose_research_markets(limit:int)->list[str]:
    scored=[]
    for code,_ in enabled_markets(CONFIG):
        root=MARKET_ROOT/code
        queue=_read_jsonl(root/'organizer_research_queue.jsonl')
        pending=sum(1 for q in queue if q.get('status') not in {'RESOLVED_READY_TO_CONTACT','DISMISSED','STALE_EVENT'})
        if pending:
            scored.append((pending,code))
    scored.sort(key=lambda x:(-x[0],x[1]))
    return [code for _,code in scored[:limit]]


def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--market',action='append',default=[])
    parser.add_argument('--all',action='store_true')
    parser.add_argument('--max-markets',type=int,default=int(os.environ.get('ORGANIZER_RESEARCH_MARKETS','5')))
    parser.add_argument('--max-tasks',type=int,default=int(os.environ.get('ORGANIZER_RESEARCH_TASKS','8')))
    parser.add_argument('--queries-per-task',type=int,default=int(os.environ.get('ORGANIZER_RESEARCH_QUERIES','3')))
    parser.add_argument('--results-per-query',type=int,default=int(os.environ.get('ORGANIZER_RESEARCH_RESULTS','6')))
    args=parser.parse_args()
    selected=args.market or choose_research_markets(args.max_markets)
    results=[]
    for code in selected:
        cfg=load_market_config(CONFIG,code)
        results.append(research_market(code,cfg,args.max_tasks,args.queries_per_task,args.results_per_query))
    # Organizer records changed after market aggregation, so rebuild the global index.
    if results:
        from .market_runner import aggregate_global
        aggregate_global()
    print(json.dumps({'selected':selected,'results':results},ensure_ascii=False,indent=2))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
