import copy, io, json, sys

TPL = sys.argv[1]
OUTDIR = sys.argv[2]

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

SPECS = [
    ('gts-seq-redeem.mdj', '序列图：积分商品兑换', [
        '用户（浏览器）', 'MallController', 'MallService', 'OrderRepository', 'PointsRepository', 'MySQL'],
     [
        (0, 1, 'POST /mall/orders'),
        (1, 2, 'redeem()'),
        (2, 4, '锁账户（last_seq 行）'),
        (2, 3, '锁商品（SELECT FOR UPDATE）'),
        (2, 3, '按幂等键查已有订单'),
        (2, 5, '校验库存与余额'),
        (2, 4, '扣减积分'),
        (2, 3, '扣库存 + INSERT 订单'),
        (2, 4, 'INSERT 流水（SPEND）'),
        (2, 1, 'OrderVo'),
        (1, 0, '200 OK'),
     ]),
    ('gts-seq-order-admin.mdj', '序列图：订单履约与取消', [
        '管理员', 'AdminController', 'OrderService', 'OrderRepository', 'PointsRepository', 'MySQL'],
     [
        (0, 1, 'POST /admin/orders/{id}/fulfill'),
        (1, 2, 'fulfill() / cancel()'),
        (2, 3, '无锁读订单（取 userId）'),
        (2, 4, '锁账户'),
        (2, 3, '锁订单（SELECT FOR UPDATE）'),
        (2, 5, '重读状态并判终态'),
        (2, 3, 'UPDATE 状态'),
        (2, 4, '返还积分'),
        (2, 4, 'INSERT 冲正流水'),
        (2, 3, '恢复库存'),
        (1, 0, '200 OK'),
     ]),
    ('gts-seq-rule.mdj', '序列图：核算规则版本切换', [
        '管理员', 'AdminController', 'RuleService', 'AdminRepository', 'AuditRepository', 'MySQL'],
     [
        (0, 1, 'POST /admin/rules'),
        (1, 2, 'create()'),
        (2, 3, '锁 t_rule_mode_lock'),
        (2, 5, '锁内取当前时间（禁止追溯）'),
        (2, 3, '查同方式生效区间'),
        (2, 5, '校验区间不重叠'),
        (2, 3, '截断旧区间 valid_to'),
        (2, 3, 'INSERT 新版本规则'),
        (2, 4, '写审计记录'),
        (2, 1, 'CarbonRuleVo'),
        (1, 0, '200 OK'),
     ]),
    ('gts-seq-recon.mdj', '序列图：只读一致性对账', [
        '管理员', 'AdminController', 'ReconcileService', 'MySQL', '差异清单', '监控'],
     [
        (0, 1, 'GET /admin/reconciliation'),
        (1, 2, 'check()'),
        (2, 3, '开启 REPEATABLE READ 只读事务'),
        (2, 3, '核对余额 = 流水合计'),
        (2, 3, '核对 account_seq 连续无断号'),
        (2, 3, '核对行程发分 / 订单扣减 / 冲正'),
        (2, 4, '输出差异项（expected/actual）'),
        (2, 5, '读取失败时抛 50001'),
        (2, 1, 'ReconcileResult'),
        (1, 0, '200 OK'),
     ]),
]

def text_width(t):
    return sum(13 if ord(c) > 0x2E7F else 7 for c in t)

for fname, title, lifelines, msgs in SPECS:
    d = json.load(io.open(TPL, encoding='utf-8'))
    dg = []
    find(d, 'UMLSequenceDiagram', dg)
    dg = dg[0]
    lv = [v for v in dg['ownedViews'] if v['_type'] == 'UMLSeqLifelineView']
    lv.sort(key=lambda v: v['left'])
    lp2idx = {}
    for i, v in enumerate(lv):
        lp = next(s for s in v['subViews'] if s['_type'] == 'UMLLinePartView')
        lp2idx[lp['_id']] = i

    # 重命名生命线
    llmodels = []
    find(d, 'UMLLifeline', llmodels)
    for i, v in enumerate(lv):
        name = lifelines[i]
        nc = next(s for s in v['subViews'] if s['_type'] == 'UMLNameCompartmentView')
        for lab in nc['subViews']:
            if lab.get('font', '').endswith(';1'):
                lab['text'] = name
        mid = v['model']['$ref']
        for m in llmodels:
            if m['_id'] == mid:
                m['name'] = name

    inter = []
    find(d, 'UMLInteraction', inter)
    inter = inter[0]
    byid = {m['_id']: m for m in inter['messages']}
    centers = [v['left'] + v['width'] // 2 for v in lv]

    mviews = [v for v in dg['ownedViews'] if v['_type'] == 'UMLSeqMessageView']
    mviews.sort(key=lambda m: int(m['points'].split(';')[0].split(':')[1]))

    # 多余的视图连同模型一起删掉
    for extra in mviews[len(msgs):]:
        mid = extra['model']['$ref']
        inter['messages'] = [m for m in inter['messages'] if m['_id'] != mid]
        dg['ownedViews'] = [v for v in dg['ownedViews'] if v['_id'] != extra['_id']]
    mviews = mviews[:len(msgs)]

    for k, (s, t, text) in enumerate(msgs):
        v = mviews[k]
        mm = byid[v['model']['$ref']]
        y = 95 + k * 55
        mx, nx = centers[s], centers[t]
        mm['name'] = text
        mm['source'] = {'$ref': lv[s]['model']['$ref']}
        mm['target'] = {'$ref': lv[t]['model']['$ref']}
        v['tail'] = {'$ref': next(x for x in lv[s]['subViews'] if x['_type'] == 'UMLLinePartView')['_id']}
        v['head'] = {'$ref': next(x for x in lv[t]['subViews'] if x['_type'] == 'UMLLinePartView')['_id']}
        v['points'] = '%d:%d;%d:%d' % (mx, y, nx, y)
        lab = next(sv for sv in v['subViews'] if sv['_type'] == 'EdgeLabelView')
        tw = text_width(text)
        lab['visible'] = True
        lab['text'] = text
        lab['top'] = y - 16
        lab['left'] = min(mx, nx) + 14
        lab['width'] = max(70, tw + 12)
        lab['distance'] = 12
        lab['alpha'] = 1.5708
        lab['edgePosition'] = 1
        act = next((sv for sv in v['subViews'] if sv['_type'] == 'UMLActivationView'), None)
        if act:
            act['visible'] = True
            act['left'] = nx - 7
            act['top'] = y - 6
            act['width'] = 14
            act['height'] = 30

    # 生命线高度按实际消息数收缩
    n = len(msgs)
    H = 90 + n * 55 + 60
    for v in lv:
        v['height'] = H - 40
        lp = next(s for s in v['subViews'] if s['_type'] == 'UMLLinePartView')
        lp['height'] = H - 81

    # 图名
    dg['name'] = title
    model = []
    find(d, 'UMLModel', model)
    model[0]['name'] = title

    out = OUTDIR + '/' + fname
    with io.open(out, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print('written', fname, 'msgs=', n)
