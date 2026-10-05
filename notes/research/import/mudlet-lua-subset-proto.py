# Prototype: translate a restricted Lua subset (Mudlet item bodies) to tt++.
import xml.etree.ElementTree as ET, re, collections, sys
class Fail(Exception): pass
WARN=collections.Counter()
TOK=re.compile(r'\s*(?:(--\[\[.*?\]\])|(--[^\n]*)|(\[\[.*?\]\])|("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|(\d+(?:\.\d+)?)|(\.\.|==|~=|<=|>=|[=<>(){}\[\],;.:#+\-*/%])|([A-Za-z_]\w*))',re.S)
def lex(s):
    out=[];i=0
    while i<len(s):
        if s[i:].strip()=='' : break
        m=TOK.match(s,i)
        if not m or m.end()==i: raise Fail('lex at '+s[i:i+10])
        i=m.end()
        if m.group(1) or m.group(2): continue
        if m.group(3): out.append(('str',m.group(3)[2:-2]))
        elif m.group(4): out.append(('str',bytes(m.group(4)[1:-1],'utf8').decode('unicode_escape')))
        elif m.group(5): out.append(('num',m.group(5)))
        elif m.group(6): out.append(('op',m.group(6)))
        else: out.append(('id',m.group(7)))
    return out
KW={'if','then','elseif','else','end','local','and','or','not','return','function','for','while','do','nil','true','false'}
class P:
    def __init__(s,toks,vars_): s.t=toks;s.i=0;s.unsup=collections.Counter();s.vars=vars_
    def pk(s,k=0): return s.t[s.i+k] if s.i+k<len(s.t) else ('eof','')
    def nx(s): x=s.pk(); s.i+=1; return x
    def acc(s,v):
        if s.pk()[1]==v: s.i+=1; return True
        return False
    def exp(s,v):
        if not s.acc(v): raise Fail(f'expected {v} got {s.pk()}')
    def block(s,stop):
        out=[]
        while s.pk()[1] not in stop and s.pk()[0]!='eof':
            r=s.stmt()
            if r: out.append(r)
        return out
    def stmt(s):
        t=s.pk()
        if t[1]==';': s.nx(); return None
        if t[1]=='if':
            s.nx(); branches=[]
            c=s.cond(); s.exp('then'); b=s.block({'elseif','else','end'}); branches.append((c,b))
            els=None
            while True:
                if s.acc('elseif'): c=s.cond(); s.exp('then'); branches.append((c,s.block({'elseif','else','end'})))
                elif s.acc('else'): els=s.block({'end'})
                else: break
            s.exp('end')
            out=''
            for k,(c,b) in enumerate(branches):
                out+=('#if' if k==0 else ' #elseif')+' {'+c+'} {'+';'.join(b)+'}'
            if els is not None: out+=' #else {'+';'.join(els)+'}'
            return out
        if t[1]=='local': s.nx(); t=s.pk()
        if t[0]=='id' and t[1] not in KW:
            name=s.nx()[1]
            # dotted
            while s.pk()[1]=='.' : s.nx(); name+='.'+s.nx()[1]
            if s.pk()[1]=='=':
                s.nx(); 
                if '.' in name: raise Fail('table field assign')
                v=s.expr()
                if isinstance(v,tuple): # (value, fallback) from "x or y"
                    a,b=v; return '#if {"'+a+'" != ""} {#variable {'+name+'} {'+a+'}} #else {#variable {'+name+'} {'+b+'}}'
                return '#variable {'+name+'} {'+v+'}'
            if name in('moveCursor','resetFormat','deselect'):
                d=0
                while True:
                    x=s.nx()[1]
                    if x=='(': d+=1
                    if x==')':
                        d-=1
                        if d==0: break
                return None
            if s.pk()[1]=='(':
                s.nx(); args=[]
                if not s.acc(')'):
                    while True:
                        args.append(s.expr())
                        if s.acc(')'): break
                        s.exp(',')
                return s.call(name,args)
            raise Fail('stmt '+name)
        raise Fail(f'stmt {t}')
    def call(s,f,a):
        flat=lambda x: x if isinstance(x,str) else x[0]
        if f in('send','expandAlias','sendAll'): return ';'.join(flat(x) for x in a)
        if f in('cecho','decho','echo','hecho'):
            txt=flat(a[0]).rstrip('\n').replace('\n',' ')
            if f=='decho': txt=re.sub(r'<(\d+),(\d+),(\d+)(?::[\d,]*)?>',lambda m:'<F%02x%02x%02x>'%tuple(map(int,m.groups())),txt)
            txt=re.sub(r'</?[biu]>','',txt)
            return '#showme {'+txt+'}'
        if f=='deleteLine': return '#GAG'

        if f in('enableTrigger','enableAlias','enableKey'): return '#variable {on_'+flat(a[0])+'} {1}'
        if f in('disableTrigger','disableAlias','disableKey'): return '#variable {on_'+flat(a[0])+'} {0}'
        if f in FUNCS:
            params,body=FUNCS[f]
            if len(a)>len(params): raise Fail('arity '+f)
            sub=dict(zip(params,[flat(x) for x in a]+['']*(len(params)-len(a))))
            out=[]
            for st in body:
                for k,v in sub.items(): st=st.replace('$'+k,v)
                out.append(st)
            return ';'.join(out)
        if f=='tempTimer':
            raise Fail('tempTimer')
        s.unsup[f]+=1; raise Fail('call '+f)
    def cond(s):
        a=s.cmp()
        while s.pk()[1] in('and','or'):
            op='&&' if s.nx()[1]=='and' else '||'; a=a+' '+op+' '+s.cmp()
        return a
    def cmp(s):
        if s.acc('not'): x=s.atom(); return '"'+x+'" == ""'
        x=s.expr(cmp=True)
        if s.pk()[1] in('==','~=','<','>','<=','>='):
            op=s.nx()[1]; y=s.expr(cmp=True)
            op={'~=':'!='}.get(op,op)
            q=lambda v:v if re.fullmatch(r'-?\d+(\.\d+)?|%\d+|\$\w+',v) and op not in('==','!=') else '"'+v+'"'
            return q(x)+' '+op+' '+q(y)
        return '"'+x+'" != ""'
    def expr(s,cmp=False):
        a=s.cat()
        if not cmp and s.pk()[1]=='or':
            s.nx(); b=s.cat()
            if b=='': return a
            return (a,b)
        return a
    def cat(s):
        parts=[s.atom()]
        while s.acc('..'): parts.append(s.atom())
        return ''.join(parts)
    def atom(s):
        t=s.nx()
        if t[0]=='str': return t[1].replace(';',r'\;')
        if t[0]=='num': return t[1]
        if t[1]=='(':
            v=s.expr(); s.exp(')')
            if isinstance(v,tuple):
                if v[1]=='': return v[0]
                raise Fail('or-fallback in expr')
            return v
        if t[1]=='matches':
            s.exp('['); n=s.nx(); s.exp(']')
            return '%'+str(int(n[1])-1)
        if t[1] in('tonumber','tostring'):
            s.exp('('); v=s.expr(); s.exp(')'); return v
        if t[1] in('utf8','string') and s.pk()[1]=='.':
            s.nx(); fn=s.nx()[1]
            if fn in('upper','lower'):
                s.exp('('); v=s.expr(); s.exp(')'); WARN['case dropped']+=1; return v
            raise Fail('string fn '+fn)
        if t[0]=='id' and t[1] not in KW:
            if s.pk()[1] in('(','.','[',':'): raise Fail('complex expr '+t[1])
            return '$'+t[1]
        if t[1]=='nil': return ''
        if t[1]=='true': return '1'
        if t[1]=='false': return '0'
        raise Fail(f'atom {t}')
def translate(src):
    p=P(lex(src),None)
    b=p.block({'eof'})
    return b,p.unsup
r=ET.parse('prof.xml').getroot()
FUNCS={}; INIT=[]; NOTF={}
for sc in r.iter('Script'):
    src=sc.findtext('script') or ''
    try: toks=lex(src)
    except Fail: continue
    i=0
    while i<len(toks):
        if toks[i]==('id','function') and i+2<len(toks) and toks[i+1][0]=='id' and toks[i+2]==('op','('):
            name=toks[i+1][1]; j=i+3; params=[]
            while toks[j]!=('op',')'):
                if toks[j][0]=='id': params.append(toks[j][1])
                j+=1
            j+=1; start=j; d=1
            while j<len(toks) and d:
                v=toks[j]
                if v[0]=='id' and v[1] in('if','do','function'): d+=1
                if v==('id','end'): d-=1
                j+=1
            body=toks[start:j-1]
            try:
                p=P(body,None); b=p.block({'eof'}); FUNCS[name]=(params,[x for x in b if x])
            except Fail as e: NOTF[name]=str(e)
            i=j
        else: i+=1
print('inlinable funcs:',sorted(FUNCS)); print('own not inlinable:',{k:v for k,v in NOTF.items() if not k.startswith('QC')})
res=collections.Counter(); fails=collections.Counter(); ex=collections.defaultdict(list); unsup=collections.Counter()
def walk(e,inpkg):
    for c in e:
        if c.tag in('Trigger','Alias','Key','TriggerGroup','AliasGroup','KeyGroup'):
            pn=c.findtext('packageName') or ''
            p2=inpkg or (pn not in('','test','target_aliases','spamdoor-aliases'))
            if not c.tag.endswith('Group') and not p2:
                s=c.findtext('script') or ''
                if c.tag=='Trigger' and c.get('isColorizerTrigger')=='yes' and not s.strip():
                    res[(c.tag,'ok')]+=1; continue
                try:
                    b,u=translate(s); res[(c.tag,'ok')]+=1
                    if '-v' in sys.argv: print(c.tag,c.findtext('name'),'=>',' ; '.join(x for x in b if x))
                except Fail as f:
                    res[(c.tag,'fail')]+=1; k=str(f).split(' ')[0]+' '+(str(f).split(' ')[1] if len(str(f).split(' '))>1 else '')
                    fails[str(f)[:40]]+=1; ex[str(f)[:40]].append(c.findtext('name'))
            walk(c,p2)
for p in r: walk(p,False)
print(res); print(WARN)
for k,v in fails.most_common(): print(v,k,ex[k][:8])
