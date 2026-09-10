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
        nearby=[span for span in spans if span[0]>=max(0,pos-500) and span[0]<=pos+500]
        if not nearby:
            continue
        span=min(nearby,key=lambda s:min(abs(s[0]-pos),abs(s[1]-pos)))
        immediate=text[max(0,pos-80):min(len(text),pos+260)]
        local=text[max(0,min(pos,span[0])-80):min(len(text),max(pos,span[1])+700)]
        dates=parse_dates(local,year_min=year_min,year_max=year_max)
        score=10.0
        if span[1]<=pos:
            score+=6.0
        score-=abs(span[0]-pos)/150.0
        if re.search(r'\b(?:start|старт|registration|регистрац|distance|дистанц|route|маршрут)\b',immediate,flags=re.I):
            score+=4.0
        if re.search(r'\b\d{1,3}(?:[.,]\d+)?\s*(?:km|км|m|м)\b',immediate,flags=re.I):
            score+=2.0
        score-=max(0,len(dates)-2)*0.5
        if score>best_score or (score==best_score and best_pos is not None and pos>best_pos):
            best_pos,best_span,best_score=pos,span,score
    if best_pos is None or best_span is None:
        return text
    start=min(best_pos,best_span[0])
    return text[start:min(len(text),best_pos+12000)]
