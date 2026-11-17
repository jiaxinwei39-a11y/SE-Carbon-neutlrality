"""用参考工程里可正常渲染的序列图做模板，克隆出我们的序列图。

思路：不再从零拼 JSON，而是深拷贝参考工程里已经渲染成功的
生命线视图 / 消息视图 / 激活条，只替换 id、名称、坐标和连线目标。
"""
import copy, io, json, sys

REF = sys.argv[1]
OUT = sys.argv[2]

LIFELINES = ['用户（浏览器）', 'TripController', 'TripService', 'TripRepository',
             'PointsRepository', 'MySQL']
MESSAGES = [
    (0, 1, 'POST /trips'),
    (1, 2, 'create()'),
    (2, 3, '按幂等键查重'),
    (2, 3, '匹配核算规则'),
    (3, 5, 'SELECT 规则'),
    (2, 4, 'applyTrip()'),
    (4, 5, 'UPDATE 账户'),
    (2, 3, 'INSERT 行程'),
    (4, 5, 'INSERT 流水'),
    (2, 1, 'TripDetail'),
    (1, 0, '200 OK'),
]

ref = json.load(io.open(REF, encoding='utf-8'))

def find(node, t, out):
    if isinstance(node, dict):
        if node.get('_type') == t:
            out.append(node)
        for k, v in node.items():
            if k != '_parent':
                find(v, t, out)
    elif isinstance(node, list):
        for x in node:
            find(x, t, out)

seqs = []
find(ref, 'UMLSequenceDiagram', seqs)
diag_tpl = seqs[0]

# 模板视图
lifeline_view_tpl = next(v for v in diag_tpl['ownedViews'] if v['_type'] == 'UMLSeqLifelineView')
msg_view_tpl = next(v for v in diag_tpl['ownedViews'] if v['_type'] == 'UMLSeqMessageView')

lifelines_model = []
find(ref, 'UMLLifeline', lifelines_model)
inter = None
for x in ref['ownedElements'][0].get('ownedElements', []):
    if x.get('_type') == 'UMLCollaboration':
        for y in x.get('ownedElements', []):
            if y.get('_type') == 'UMLInteraction':
                inter = y
                break
lifeline_model_tpl = lifelines_model[0]
msg_model_tpl = inter['messages'][0]

_counter = [0]
def nid():
    _counter[0] += 1
    return 'GTSREF%015d' % _counter[0]

def clone(obj, idmap):
    """深拷贝并给内部所有 _id 换新，内部 $ref 同步重映射"""
    o = copy.deepcopy(obj)
    def recollect(n):
        if isinstance(n, dict):
            if '_id' in n:
                idmap.setdefault(n['_id'], nid())
            for k, v in n.items():
                if k != '_parent':
                    recollect(v)
        elif isinstance(n, list):
            for x in n:
                recollect(x)
    recollect(o)
    def rewrite(n):
        if isinstance(n, dict):
            if '_id' in n:
                n['_id'] = idmap[n['_id']]
            for k, v in n.items():
                if k == '$ref':
                    n[k] = idmap.get(v, v)
                else:
                    rewrite(v)
        elif isinstance(n, list):
            for x in n:
                rewrite(x)
    rewrite(o)
    return o

def clear_parents(n):
    if isinstance(n, dict):
        for k, v in list(n.items()):
            if k == '_parent':
                del n[k]
            else:
                clear_parents(v)
    elif isinstance(n, list):
        for x in n:
            clear_parents(x)

# ---------- 生命线 ----------
LIFELINE_W, TOP = 96, 40
N_MSG = len(MESSAGES)
ROWH = 56
H = 120 + N_MSG * ROWH + 80

lifeline_models = []
lifeline_views = []
lineparts = []
x = 40
for name in LIFELINES:
    idmap = {}
    m = clone(lifeline_model_tpl, idmap)
    clear_parents(m)
    m['name'] = name
    m.pop('represent', None)
    lifeline_models.append(m)

    v = clone(lifeline_view_tpl, {})
    clear_parents(v)
    # 视图内部引用要指向新的模型 / 新的子视图 id
    sub_ids = {}
    def relink(n, is_root=False):
        if isinstance(n, dict):
            if not is_root and '_id' in n:
                sub_ids[n['_id']] = nid()
            for k, val in n.items():
                if k == '_parent':
                    continue
                relink(val)
        elif isinstance(n, list):
            for y in n:
                relink(y)
    relink(v, True)
    v['_id'] = nid()
    def remap(n):
        if isinstance(n, dict):
            if '$ref' in n and n['$ref'] in sub_ids:
                n['$ref'] = sub_ids[n['$ref']]
            for k, val in n.items():
                if k != '$ref':
                    remap(val)
        elif isinstance(n, list):
            for y in n:
                remap(y)
    remap(v)
    # 名称标签
    nc = v['subViews'][0]
    for lab in nc['subViews']:
        if 'text' in lab:
            lab['text'] = name
        lab['left'] = x + 2
        lab['top'] = TOP + 7
        lab['width'] = LIFELINE_W - 4
    nc['left'] = x
    nc['top'] = TOP
    nc['width'] = LIFELINE_W
    nc['height'] = 25
    lp = v['subViews'][1]
    lp['left'] = x + LIFELINE_W // 2
    lp['top'] = TOP + 41
    lp['width'] = 1
    lp['height'] = H - (TOP + 41)
    v['left'] = x
    v['top'] = TOP
    v['width'] = LIFELINE_W
    v['height'] = H - TOP
    v['model']['$ref'] = m['_id']
    v['nameCompartment']['$ref'] = nc['_id']
    v['linePart']['$ref'] = lp['_id']
    lifeline_views.append(v)
    lineparts.append(lp['_id'])
    x += 210

centers = [v['left'] + v['width'] // 2 for v in lifeline_views]

# ---------- 消息 ----------
msg_models = []
msg_views = []
for k, (s, t, text) in enumerate(MESSAGES):
    idmap = {}
    mm = clone(msg_model_tpl, idmap)
    clear_parents(mm)
    mm['name'] = text
    mm['source']['$ref'] = lifeline_models[s]['_id']
    mm['target']['$ref'] = lifeline_models[t]['_id']
    msg_models.append(mm)

    v = clone(msg_view_tpl, {})
    clear_parents(v)
    sub_ids = {}
    def relink2(n, is_root=False):
        if isinstance(n, dict):
            if not is_root and '_id' in n:
                sub_ids[n['_id']] = nid()
            for key, val in n.items():
                if key == '_parent':
                    continue
                relink2(val)
        elif isinstance(n, list):
            for y in n:
                relink2(y)
    relink2(v, True)
    v['_id'] = nid()
    def remap2(n):
        if isinstance(n, dict):
            if '$ref' in n and n['$ref'] in sub_ids:
                n['$ref'] = sub_ids[n['$ref']]
            for key, val in n.items():
                if key != '$ref':
                    remap2(val)
        elif isinstance(n, list):
            for y in n:
                remap2(y)
    remap2(v)

    y = 130 + k * ROWH
    mx, nx = centers[s], centers[t]
    span = abs(nx - mx)
    lw = max(64, int(span * 0.55))
    mid = (mx + nx) // 2

    v['model']['$ref'] = mm['_id']
    v['tail'] = {'$ref': lineparts[s]}
    v['head'] = {'$ref': lineparts[t]}
    v['points'] = '%d:%d;%d:%d' % (mx, y, nx, y)

    lab = next(sv for sv in v['subViews'] if sv['_type'] == 'EdgeLabelView')
    lab['text'] = text
    lab['left'] = mid - lw // 2
    lab['top'] = y - 20
    lab['width'] = lw
    lab['visible'] = True

    act = next(sv for sv in v['subViews'] if sv['_type'] == 'UMLActivationView')
    act['left'] = nx - 7
    act['top'] = y
    act['width'] = 14
    act['height'] = 40
    act['visible'] = True
    act['model']['$ref'] = mm['_id']
    v['nameLabel']['$ref'] = lab['_id']
    v['activation']['$ref'] = act['_id']
    msg_views.append(v)

# ---------- 组装工程 ----------
diagram = copy.deepcopy(diag_tpl)
clear_parents(diagram)
diagram['_id'] = nid()
diagram['name'] = '序列图：上报行程与积分发放'
diagram['ownedViews'] = lifeline_views + msg_views
diagram['showSequenceNumber'] = True
diagram['showActivation'] = True
diagram['defaultDiagram'] = True

interaction = copy.deepcopy(inter)
clear_parents(interaction)
interaction['_id'] = nid()
interaction['name'] = 'Interaction：上报行程与积分发放'
interaction['participants'] = lifeline_models
interaction['messages'] = msg_models
interaction['ownedElements'] = [diagram]

collab = {'_type': 'UMLCollaboration', '_id': nid(), 'name': '碳减排积分系统',
          'ownedElements': [interaction]}
model = {'_type': 'UMLModel', '_id': nid(), 'name': '样例：行程上报与积分发放（序列图）',
         'ownedElements': [collab]}
project = {'_type': 'Project', '_id': nid(), 'name': '样例：行程上报与积分发放（序列图）',
           'ownedElements': [model]}

# 显式回填 _parent：StarUML 靠它判断视图归属，缺了就不渲染
model['_parent'] = {'$ref': project['_id']}
collab['_parent'] = {'$ref': model['_id']}
interaction['_parent'] = {'$ref': collab['_id']}
diagram['_parent'] = {'$ref': interaction['_id']}
for lm in lifeline_models:
    lm['_parent'] = {'$ref': interaction['_id']}
for mm in msg_models:
    mm['_parent'] = {'$ref': interaction['_id']}
for v in diagram['ownedViews']:
    v['_parent'] = {'$ref': diagram['_id']}
    for sv in v.get('subViews', []):
        sv['_parent'] = {'$ref': v['_id']}

# ---------- 清理悬空引用 ----------
# 模板里有些可选引用（标签的 model、构造型标签等）指向模板工程的其它元素，
# 克隆后这些 id 不存在。StarUML 遇到悬空引用会判整张图无效（画布空白），
# 所以统一删掉；必需的引用（model/tail/head/nameLabel/activation/_parent）前面已显式设好。
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
collect(project)

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
sanitize(project)

with io.open(OUT, 'w', encoding='utf-8') as f:
    json.dump(project, f, ensure_ascii=False, indent=1)
print('written', OUT, 'removed dangling refs:', removed[0])
