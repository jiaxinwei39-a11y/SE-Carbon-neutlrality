import copy, io, json, sys

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
txt = raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig')
d = json.loads(txt)

def find(n, t, o):
    if isinstance(n, dict):
        if n.get('_type') == t:
            o.append(n)
        for k, v in n.items():
            if k != '_parent':
                find(v, t, o)
    elif isinstance(n, list):
        for x in n:
            find(x, t, o)

dg = []
find(d, 'UMLSequenceDiagram', dg)
dg = dg[0]
lv = [v for v in dg['ownedViews'] if v['_type'] == 'UMLSeqLifelineView']
lv.sort(key=lambda v: v['left'])

# 0 用户 1 TripController 2 TripService 3 TripRepository 4 PointsRepository 5 MySQL
PLAN = [
    (0, 1, 'POST /trips', 'call'),
    (1, 2, 'create()', 'call'),
    (2, 3, '查重（命中即返回原结果）', 'call'),
    (2, 3, '匹配核算规则', 'call'),
    (3, 5, 'SELECT 规则', 'call'),
    (2, 2, '核算减排量与积分（FLOOR）', 'self'),
    (2, 3, 'INSERT 行程+因子快照（1/3）', 'call'),
    (2, 4, 'applyTrip()（2/3）', 'call'),
    (4, 5, 'UPDATE 账户 last_seq+1（仅积分>0）', 'call'),
    (4, 5, 'INSERT 流水（3/3，仅积分>0）', 'call'),
    (2, 1, 'TripDetail（200 OK）', 'reply'),
]
SP, ROWH = 250, 55
N = len(PLAN)
H = 90 + N * ROWH + 60

# 生命线重排
for i, v in enumerate(lv):
    x = 40 + SP * i
    v['left'] = x
    v['height'] = H - 40
    nc = next(s for s in v['subViews'] if s['_type'] == 'UMLNameCompartmentView')
    nc['left'] = x
    for lab in nc['subViews']:
        lab['left'] = x + 2
        lab['width'] = v['width'] - 4
    lp = next(s for s in v['subViews'] if s['_type'] == 'UMLLinePartView')
    lp['left'] = x + v['width'] // 2
    lp['top'] = 81
    lp['height'] = H - 81

lp2idx = {}
for i, v in enumerate(lv):
    lp = next(s for s in v['subViews'] if s['_type'] == 'UMLLinePartView')
    lp2idx[lp['_id']] = i
centers = [v['left'] + v['width'] // 2 for v in lv]

def text_width(t):
    return sum(13 if ord(c) > 0x2E7F else 7 for c in t)

msg_views = [v for v in dg['ownedViews'] if v['_type'] == 'UMLSeqMessageView']
msg_views.sort(key=lambda m: int(m['points'].split(';')[0].split(':')[1]))
models = []
find(d, 'UMLMessage', models)
byid = {m['_id']: m for m in models}

# 数量不够就克隆（复制最后一个消息视图与模型）
while len(msg_views) < N:
    k = len(msg_views)
    sfx = '_X%d' % k
    v = copy.deepcopy(msg_views[0])
    m = copy.deepcopy(byid[msg_views[0]['model']['$ref']])
    def suffix(n, keep_id=None):
        if isinstance(n, dict):
            if '_id' in n and n is not keep_id:
                n['_id'] = n['_id'] + sfx
            if '$ref' in n:
                n['$ref'] = n['$ref'] + sfx
            for kk, vv in n.items():
                if kk in ('_id', '$ref'):
                    continue
                suffix(vv)
        elif isinstance(n, list):
            for x in n:
                suffix(x)
    suffix(v); suffix(m)
    v['model'] = {'$ref': m['_id']}
    for sv in v.get('subViews', []):
        if sv['_type'] in ('EdgeLabelView', 'UMLActivationView'):
            sv['model'] = {'$ref': m['_id']}
    dg['ownedViews'].append(v)
    msg_views.append(v)
    byid[m['_id']] = m
    inter = []
    find(d, 'UMLInteraction', inter)
    inter[0]['messages'].append(m)

for k, (s, t, text, kind) in enumerate(PLAN):
    m = msg_views[k]
    mm = byid[m['model']['$ref']]
    y = 95 + k * ROWH
    mx, nx = centers[s], centers[t]

    mm['name'] = text
    mm['source'] = {'$ref': lv[s]['model']['$ref']}
    mm['target'] = {'$ref': next(x for x in lv[t]['subViews'] if x['_type'] == 'UMLLinePartView')['model']['$ref']}
    mm.pop('messageSort', None)   # 去掉 reply 标记，返回消息才有激活条

    lp_s = next(x for x in lv[s]['subViews'] if x['_type'] == 'UMLLinePartView')['_id']
    lp_t = next(x for x in lv[t]['subViews'] if x['_type'] == 'UMLLinePartView')['_id']
    m['tail'] = {'$ref': lp_s}
    m['head'] = {'$ref': lp_t}

    if kind == 'self':
        m['points'] = '%d:%d;%d:%d;%d:%d;%d:%d' % (mx, y, mx + 80, y, mx + 80, y + 28, mx, y + 28)
        anchor_left = mx + 10
        anchor_top = y + 6
    else:
        m['points'] = '%d:%d;%d:%d' % (mx, y, nx, y)
        anchor_left = None
        anchor_top = y - 18

    lab = next(sv for sv in m['subViews'] if sv['_type'] == 'EdgeLabelView')
    tw = text_width(text)
    span = abs(nx - mx)
    lab['visible'] = True
    lab['text'] = text
    lab['height'] = 13
    lab['distance'] = 12
    lab['alpha'] = 1.5708
    lab['edgePosition'] = 1
    if kind == 'self':
        lab['left'] = anchor_left
        lab['top'] = anchor_top
        lab['width'] = max(80, min(tw, 220))
    else:
        lab['top'] = y - 18
        if tw <= span * 0.55:
            lab['left'] = min(mx, nx) + 8
        else:
            lab['left'] = (mx + nx) // 2 - tw // 2
        lab['width'] = max(60, min(tw, span * 0.8))

    act = next((sv for sv in m['subViews'] if sv['_type'] == 'UMLActivationView'), None)
    if act:
        if kind == 'reply':
            act['visible'] = False
        else:
            act['visible'] = True
            act['left'] = (nx + 80 - 7) if kind == 'self' else nx - 7
            act['top'] = y - 6
            act['width'] = 14
            act['height'] = 26 if kind == 'self' else 30

dg['showActivation'] = True

# 清理悬空引用（克隆出来的消息里可能残留指向旧对象的引用）
all_ids = set()
def collect(n):
    if isinstance(n, dict):
        if '_id' in n:
            all_ids.add(n['_id'])
        for v in n.values():
            collect(v)
    elif isinstance(n, list):
        for x in n:
            collect(x)
collect(d)

removed = [0]
def sanitize(n):
    if isinstance(n, dict):
        for k, v in list(n.items()):
            if isinstance(v, dict) and '$ref' in v and v['$ref'] not in all_ids:
                del n[k]
                removed[0] += 1
            else:
                sanitize(v)
    elif isinstance(n, list):
        for i, x in enumerate(list(n)):
            if isinstance(x, dict) and '$ref' in x and x['$ref'] not in all_ids:
                n.pop(i)
                removed[0] += 1
            else:
                sanitize(x)
sanitize(d)

with io.open(dst, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=1)
print('messages:', len(PLAN), 'lifelines:', len(lv), 'H:', H, 'removed:', removed[0])
