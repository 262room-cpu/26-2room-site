from __future__ import annotations

import datetime as dt
import re

MONTHS: dict[str, int] = {}


def _months(month: int, *names: str) -> None:
    for name in names:
        MONTHS[name.casefold().rstrip('.')]=month


_months(1, 'января', 'январь', 'january', 'jan', 'ianuarie', 'yanvar', 'қаңтар', 'қаңтардың', 'студзеня', 'հունվար', 'იანვარი')
_months(2, 'февраля', 'февраль', 'february', 'feb', 'februarie', 'fevral', 'ақпан', 'ақпанның', 'лютага', 'փետրվար', 'თებერვალი')
_months(3, 'марта', 'март', 'march', 'mar', 'martie', 'mart', 'наурыз', 'наурыздың', 'сакавіка', 'մարտ', 'მარტი')
_months(4, 'апреля', 'апрель', 'april', 'apr', 'aprilie', 'aprel', 'сәуір', 'сәуірдің', 'красавіка', 'ապրիլ', 'აპრილი')
_months(5, 'мая', 'май', 'may', 'mai', 'мамыр', 'мамырдың', 'մայիս', 'მაისი')
_months(6, 'июня', 'июнь', 'june', 'jun', 'iunie', 'iyun', 'маусым', 'маусымның', 'чэрвеня', 'հունիս', 'ივნისი')
_months(7, 'июля', 'июль', 'july', 'jul', 'iulie', 'iyul', 'шілде', 'шілденің', 'ліпеня', 'հուլիս', 'ივლისი')
_months(8, 'августа', 'август', 'august', 'aug', 'avgust', 'avqust', 'тамыз', 'тамыздың', 'жніўня', 'օգոստոս', 'აგვისტო')
_months(9, 'сентября', 'сентябрь', 'september', 'sep', 'sept', 'septembrie', 'sentabr', 'sentyabr', 'қыркүйек', 'қыркүйектің', 'верасня', 'սեպտեմբեր', 'სექტემბერი')
_months(10, 'октября', 'октябрь', 'october', 'oct', 'octombrie', 'oktabr', 'oktyabr', 'қазан', 'қазанның', 'кастрычніка', 'հոկտեմբեր', 'ოქტომბერი')
_months(11, 'ноября', 'ноябрь', 'november', 'nov', 'noiembrie', 'noyabr', 'қараша', 'қарашаның', 'лістапада', 'նոյեմբեր', 'ნოემბერი')
_months(12, 'декабря', 'декабрь', 'december', 'dec', 'decembrie', 'dekabr', 'желтоқсан', 'желтоқсанның', 'снежня', 'դեկտեմբեր', 'დეკემბერი')

MONTH_PATTERN='|'.join(sorted((re.escape(x) for x in MONTHS), key=len, reverse=True))

CURRENCY_PATTERN='|'.join([
    r'₸', r'KZT', r'тенге', r'тг',
    r'₽', r'RUB', r'руб(?:ль|ля|лей)?', r'rubles?',
    r'KGS', r'сом(?:ов|а)?',
    r'UZS', r'сум(?:ов|а)?', r"so['’]?m",
    r'AMD', r'֏', r'drams?', r'драм(?:ов|а)?',
    r'BYN', r'бел\.?\s*руб\.?', r'AZN', r'₼', r'манат(?:ов|а)?',
    r'MDL', r'lei', r'leu',
    r'TJS', r'сомони',
    r'TMT', r'манат',
    r'GEL', r'₾', r'lari', r'лари',
    r'MNT', r'₮', r'tugriks?', r'төгрөг',
])


def _valid_date(day:int, month:int, year:int, year_min:int, year_max:int)->str|None:
    try:
        value=dt.date(year,month,day)
    except ValueError:
        return None
    if not year_min<=year<=year_max:
        return None
    return value.isoformat()


def _add(out:list[str], value:str|None)->None:
    if value and value not in out:
        out.append(value)


def parse_dates(text:str, year_min:int=2026, year_max:int=2028)->list[str]:
    out:list[str]=[]
    source=text or ''
    for y,m,d in re.findall(r'\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b',source):
        _add(out,_valid_date(int(d),int(m),int(y),year_min,year_max))
    for d,m,y in re.findall(r'\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2})\b',source):
        _add(out,_valid_date(int(d),int(m),int(y),year_min,year_max))
    for d1,m1,d2,m2,y in re.findall(rf'\b([0-3]?\d)\s+({MONTH_PATTERN})\s*[-–—]\s*([0-3]?\d)\s+({MONTH_PATTERN})[,]?\s+(20\d{{2}})\b',source,flags=re.I):
        _add(out,_valid_date(int(d1),MONTHS[m1.casefold().rstrip('.')],int(y),year_min,year_max))
        _add(out,_valid_date(int(d2),MONTHS[m2.casefold().rstrip('.')],int(y),year_min,year_max))
    for d1,d2,month,y in re.findall(rf'\b([0-3]?\d)\s*[-–—]\s*([0-3]?\d)\s+({MONTH_PATTERN})[,]?\s+(20\d{{2}})\b',source,flags=re.I):
        m=MONTHS[month.casefold().rstrip('.')]
        _add(out,_valid_date(int(d1),m,int(y),year_min,year_max))
        _add(out,_valid_date(int(d2),m,int(y),year_min,year_max))
    for month,d1,d2,y in re.findall(rf'\b({MONTH_PATTERN})\s+([0-3]?\d)\s*[-–—]\s*([0-3]?\d)[,]?\s+(20\d{{2}})\b',source,flags=re.I):
        m=MONTHS[month.casefold().rstrip('.')]
        _add(out,_valid_date(int(d1),m,int(y),year_min,year_max))
        _add(out,_valid_date(int(d2),m,int(y),year_min,year_max))
    for d,month,y in re.findall(rf'\b([0-3]?\d)\s*(?:/|\s)\s*({MONTH_PATTERN})\s*(?:/|,|\s)\s*(20\d{{2}})\b',source,flags=re.I):
        _add(out,_valid_date(int(d),MONTHS[month.casefold().rstrip('.')],int(y),year_min,year_max))
    for month,d,y in re.findall(rf'\b({MONTH_PATTERN})\s+([0-3]?\d)(?:st|nd|rd|th)?[,]?\s+(20\d{{2}})\b',source,flags=re.I):
        _add(out,_valid_date(int(d),MONTHS[month.casefold().rstrip('.')],int(y),year_min,year_max))
    for y,m,d in re.findall(r'\b(20\d{2})\s*оны\s*([01]?\d)\s*[-–]?р\s*сарын\s*([0-3]?\d)\b',source,flags=re.I):
        _add(out,_valid_date(int(d),int(m),int(y),year_min,year_max))
    return out


def parse_prices(text:str)->list[str]:
    out:list[str]=[]
    number=r'(?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d{1,9})(?:[.,]\d{1,2})?'
    for amount,currency in re.findall(rf'(?<!\d)({number})\s*({CURRENCY_PATTERN})(?!\w)',text or '',flags=re.I):
        clean_amount=' '.join(amount.replace('\u00a0',' ').split())
        value=f'{clean_amount} {currency.strip()}'
        if value not in out:
            out.append(value)
        if len(out)>=30:
            break
    return out


def _date_phrase_spans(text:str)->list[tuple[int,int]]:
    patterns=[
        rf'\b[0-3]?\d\s+({MONTH_PATTERN})\s*[-–—]\s*[0-3]?\d\s+({MONTH_PATTERN})[,]?\s+20\d{{2}}\b',
        rf'\b[0-3]?\d\s*[-–—]\s*[0-3]?\d\s+({MONTH_PATTERN})[,]?\s+20\d{{2}}\b',
        rf'\b({MONTH_PATTERN})\s+[0-3]?\d\s*[-–—]\s*[0-3]?\d[,]?\s+20\d{{2}}\b',
        rf'\b[0-3]?\d\s+({MONTH_PATTERN})[,]?\s+20\d{{2}}\b',
        rf'\b({MONTH_PATTERN})\s+[0-3]?\d(?:st|nd|rd|th)?[,]?\s+20\d{{2}}\b',
        r'\b20\d{2}[./-][01]?\d[./-][0-3]?\d\b',
        r'\b[0-3]?\d[./-][01]?\d[./-]20\d{2}\b',
        r'\b20\d{2}\s*оны\s*[01]?\d\s*[-–]?р\s*сарын\s*[0-3]?\d\b',
    ]
    spans=[]
    for pattern in patterns:
        for match in re.finditer(pattern,text,flags=re.I):
            spans.append((match.start(),match.end()))
    return sorted(set(spans))


_NEGATIVE_DATE_CONTEXT = re.compile(
    r'регистрац|при\s+регистрац|registration|register\s+from|registration\s+period|'
    r'стоимост|взнос|оплат|цена|price|fee|early\s+bird|deadline|'
    r'выдач(?:а|и)?\s+(?:стартов|номер|пакет)|пакет(?:ов)?\s+участник|получени[ея]\s+номер|'
    r'packet\s+pickup|race\s+pack|expo|экспо|press\s+conference|пресс.?конференц',
    flags=re.I,
)
_POSITIVE_DATE_CONTEXT = re.compile(
    r'дата\s+(?:забега|старта|соревнован)|race\s+day|event\s+date|'
    r'состоится|пройд[её]т|забег|марафон|полумарафон|trail|трейл|race|run|start|старт',
    flags=re.I,
)


def _event_date_rank(text:str,event_name:str,pos:int,span:tuple[int,int])->float:
    """Rank a date as the event date, not a registration/expo/admin date."""
    start,end=span
    if end<=pos:
        gap=pos-end
    elif start>=pos+len(event_name):
        gap=start-(pos+len(event_name))
    else:
        gap=0
    score=20.0-min(gap,1800)/90.0

    # Race sites often render `DATE  EVENT NAME`; this is our strongest unstructured signature.
    if end<=pos and gap<=140:
        score+=16.0
    elif start>=pos+len(event_name) and gap<=140:
        score+=12.0
    elif gap<=350:
        score+=5.0

    local=text[max(0,start-140):min(len(text),end+180)]
    between=text[min(end,pos):max(start,pos+len(event_name))] if abs(start-pos)<500 else ''
    if _POSITIVE_DATE_CONTEXT.search(local):
        score+=5.0
    if _NEGATIVE_DATE_CONTEXT.search(local):
        score-=24.0
    if _NEGATIVE_DATE_CONTEXT.search(between):
        score-=18.0

    # A distance next to the date/title is a useful race-day signature.
    if re.search(r'\b\d{1,3}(?:[.,]\d+)?\s*(?:km|км|m|м)\b',local,flags=re.I):
        score+=3.0
    return score


def primary_event_dates(text:str,event_name:str,year_min:int=2026,year_max:int=2028)->list[str]:
    """Return the best-supported event date/range for an unstructured event page.

    Dates tied to registration, price windows, packet pickup or expo are deliberately down-ranked.
    If no event-name-local candidate exists, callers can fall back to ordinary parse_dates().
    """
    if not text or not event_name or len(event_name.strip())<4:
        return []
    positions=[m.start() for m in re.finditer(re.escape(event_name.strip()),text,flags=re.I)]
    spans=_date_phrase_spans(text)
    best:tuple[float,int,int]|None=None
    for pos in positions:
        for start,end in spans:
            # Prevent a title occurrence in the document head from stealing a remote unrelated date.
            if min(abs(start-pos),abs(end-pos))>1200:
                continue
            dates=parse_dates(text[start:end],year_min=year_min,year_max=year_max)
            if not dates:
                continue
            score=_event_date_rank(text,event_name,pos,(start,end))
            candidate=(score,start,end)
            if best is None or candidate[0]>best[0] or (candidate[0]==best[0] and start<best[1]):
                best=candidate
    if best is None:
        return []
    return parse_dates(text[best[1]:best[2]],year_min=year_min,year_max=year_max)


def focused_event_text(text:str,event_name:str,year_min:int=2026,year_max:int=2028)->str:
    if not text or not event_name or len(event_name.strip())<4:
        return text
    positions=[m.start() for m in re.finditer(re.escape(event_name.strip()),text,flags=re.I)]
    if not positions:
        return text
    spans=_date_phrase_spans(text)
    best_pos=None
    best_span=None
    best_score=-1e9
    for pos in positions:
        for span in spans:
            if min(abs(span[0]-pos),abs(span[1]-pos))>1200:
                continue
            if not parse_dates(text[span[0]:span[1]],year_min=year_min,year_max=year_max):
                continue
            score=_event_date_rank(text,event_name,pos,span)
            if score>best_score or (score==best_score and best_pos is not None and pos>best_pos):
                best_pos,best_span,best_score=pos,span,score
    if best_pos is None or best_span is None:
        return text
    start=min(best_pos,best_span[0])
    return text[start:min(len(text),best_pos+12000)]
