"""生成 StarUML (.mdj) 工程：包图 + 部署图。

用法：python gen_mdj.py <输出.mdj>
"""
import io, json, sys

_counter = [0]
def uid():
    _counter[0] += 1
    return 'AAAAGTS%018d' % _counter[0]

FONT = 'Arial;13;0'

class Doc:
    def __init__(self, name):
        self.project_id = uid()
        self.model_id = uid()
        self.name = name
        self.model_elements = []   # 模型元素（Package/Node/Artifact/Dependency）
        self.diagrams = []         # 图

    # ---------- 模型元素 ----------
    def package(self, name, parent_id=None):
        pid = uid()
        el = {'_type': 'UMLPackage', '_id': pid,
              '_parent': {'$ref': parent_id or self.model_id},
              'name': name, 'ownedElements': []}
        self.model_elements.append((parent_id or self.model_id, el))
        return pid

    def node(self, name, parent_id=None):
        nid = uid()
        el = {'_type': 'UMLNode', '_id': nid,
              '_parent': {'$ref': parent_id or self.model_id},
              'name': name, 'ownedElements': []}
        self.model_elements.append((parent_id or self.model_id, el))
        return nid

    def artifact(self, name, parent_id):
        aid = uid()
        el = {'_type': 'UMLArtifact', '_id': aid,
              '_parent': {'$ref': parent_id}, 'name': name}
        self.model_elements.append((parent_id, el))
        return aid

    def dependency(self, name, src, dst, parent_id=None):
        did = uid()
        el = {'_type': 'UMLDependency', '_id': did,
              '_parent': {'$ref': parent_id or self.model_id},
              'name': name,
              'source': {'$ref': src}, 'target': {'$ref': dst}}
        self.model_elements.append((parent_id or self.model_id, el))
        return did

    # ---------- 类图元素 ----------
    def uml_class(self, name, attrs, parent_id=None):
        cid = uid()
        attr_objs = []
        attr_ids = []
        for a in attrs:
            aid = uid()
            attr_ids.append(aid)
            attr_objs.append({'_type': 'UMLAttribute', '_id': aid, '_parent': {'$ref': cid},
                              'name': a[0], 'type': a[1], 'visibility': a[2] if len(a) > 2 else 'private'})
        el = {'_type': 'UMLClass', '_id': cid,
              '_parent': {'$ref': parent_id or self.model_id},
              'name': name, 'attributes': attr_objs, 'ownedElements': []}
        self.model_elements.append((parent_id or self.model_id, el))
        return cid, attr_ids

    def class_view(self, model_id, attr_ids, attrs, cls_name, left, top, width):
        """类视图：名字隔间 + 属性隔间 + 空的操作/接收/模板隔间"""
        vid = uid()
        name_c = self._name_compartment(vid, model_id, cls_name, left, top, width)
        name_c['height'] = 25
        attr_views = []
        for i, a in enumerate(attrs):
            text = '%s %s: %s' % ('+' if (len(a) > 2 and a[2] == 'public') else '-', a[0], a[1])
            attr_views.append({'_type': 'UMLAttributeView', '_id': uid(),
                               '_parent': {'$ref': ''}, 'model': {'$ref': attr_ids[i]},
                               'font': FONT, 'left': left + 5, 'top': top + 28 + i * 13,
                               'width': width - 10, 'height': 13, 'text': text,
                               'horizontalAlignment': 0})
        attr_h = 13 * len(attrs) + 5
        ac_id = uid()
        attr_comp = {'_type': 'UMLAttributeCompartmentView', '_id': ac_id,
                     '_parent': {'$ref': vid}, 'model': {'$ref': model_id},
                     'subViews': attr_views, 'font': FONT,
                     'left': left, 'top': top + 25, 'width': width, 'height': attr_h}
        op_id = uid(); rec_id = uid(); tp_id = uid()
        op_comp = {'_type': 'UMLOperationCompartmentView', '_id': op_id,
                   '_parent': {'$ref': vid}, 'model': {'$ref': model_id},
                   'subViews': [], 'font': FONT, 'left': left, 'top': top + 25 + attr_h,
                   'width': width, 'height': 0}
        rec_comp = {'_type': 'UMLReceptionCompartmentView', '_id': rec_id,
                    '_parent': {'$ref': vid}, 'model': {'$ref': model_id},
                    'subViews': [], 'font': FONT, 'left': left, 'top': top + 25 + attr_h,
                    'width': width, 'height': 0}
        tp_comp = {'_type': 'UMLTemplateParameterCompartmentView', '_id': tp_id,
                   '_parent': {'$ref': vid}, 'model': {'$ref': model_id},
                   'subViews': [], 'font': FONT, 'left': left, 'top': top + 25 + attr_h,
                   'width': width, 'height': 0}
        total_h = 25 + attr_h + 5
        return {'_type': 'UMLClassView', '_id': vid, '_parent': {'$ref': ''},
                'model': {'$ref': model_id},
                'subViews': [name_c, attr_comp, op_comp, rec_comp, tp_comp],
                'font': FONT, 'containerChangeable': True,
                'left': left, 'top': top, 'width': width, 'height': total_h,
                'nameCompartment': {'$ref': name_c['_id']},
                'attributeCompartment': {'$ref': ac_id},
                'operationCompartment': {'$ref': op_id},
                'receptionCompartment': {'$ref': rec_id},
                'templateParameterCompartment': {'$ref': tp_id}}

    # ---------- 活动图元素 ----------
    def activity(self, name):
        aid = uid()
        el = {'_type': 'UMLActivity', '_id': aid,
              '_parent': {'$ref': self.model_id},
              'name': name, 'ownedElements': []}
        self.model_elements.append((self.model_id, el))
        return aid

    def action(self, activity_id, name, x, y, w=180, h=50):
        nid = uid()
        el = {'_type': 'UMLAction', '_id': nid, '_parent': {'$ref': activity_id}, 'name': name}
        self.model_elements.append((activity_id, el))
        view = self.box_view('UMLActionView', nid, name, x, y, w, h, 'ACT_PLACEHOLDER')
        return nid, view

    def control_node(self, activity_id, kind, name, x, y):
        nid = uid()
        el = {'_type': kind, '_id': nid, '_parent': {'$ref': activity_id}, 'name': name}
        self.model_elements.append((activity_id, el))
        view = {'_type': 'UMLControlNodeView', '_id': uid(), '_parent': {'$ref': 'ACT_PLACEHOLDER'},
                'model': {'$ref': nid}, 'font': FONT, 'left': x, 'top': y, 'width': 20, 'height': 20}
        return nid, view

    def control_flow(self, activity_id, src, dst, points, name, tail_id, head_id):
        fid = uid()
        el = {'_type': 'UMLControlFlow', '_id': fid, '_parent': {'$ref': activity_id},
              'source': {'$ref': src}, 'target': {'$ref': dst}}
        if name:
            el['name'] = name
        self.model_elements.append((activity_id, el))
        eid = uid()
        label = {'_type': 'EdgeLabelView', '_id': uid(), '_parent': {'$ref': eid},
                 'model': {'$ref': fid}, 'visible': bool(name), 'font': FONT,
                 'left': 0, 'top': 0, 'width': 60, 'height': 13, 'alpha': 1.5708,
                 'distance': 15, 'hostEdge': {'$ref': eid}, 'edgePosition': 0, 'text': name}
        view = {'_type': 'UMLControlFlowView', '_id': eid, '_parent': {'$ref': ''},
                'model': {'$ref': fid}, 'subViews': [label], 'font': FONT,
                'lineColor': '#000000', 'head': {'$ref': head_id}, 'tail': {'$ref': tail_id},
                'lineStyle': 1, 'points': points, 'nameLabel': {'$ref': label['_id']}}
        return view
    def _name_compartment(self, view_id, model_id, text, left, top, width):
        cid = uid()
        labels = []
        # 0 构造型（隐藏）
        sid = uid(); labels.append({'_type': 'LabelView', '_id': sid, '_parent': {'$ref': cid},
                                    'visible': False, 'font': FONT, 'height': 13})
        # 1 名称
        nid = uid(); labels.append({'_type': 'LabelView', '_id': nid, '_parent': {'$ref': cid},
                                    'font': 'Arial;13;1', 'left': left + 5, 'top': top + 7,
                                    'width': width - 10, 'height': 13, 'text': text})
        # 2 命名空间（隐藏）
        nsid = uid(); labels.append({'_type': 'LabelView', '_id': nsid, '_parent': {'$ref': cid},
                                     'visible': False, 'font': FONT, 'width': width - 10, 'height': 13})
        # 3 属性（隐藏）
        pid = uid(); labels.append({'_type': 'LabelView', '_id': pid, '_parent': {'$ref': cid},
                                    'visible': False, 'font': FONT, 'height': 13, 'horizontalAlignment': 1})
        comp = {'_type': 'UMLNameCompartmentView', '_id': cid,
                '_parent': {'$ref': view_id}, 'model': {'$ref': model_id},
                'subViews': labels, 'font': FONT,
                'left': left, 'top': top, 'width': width, 'height': 25,
                'stereotypeLabel': {'$ref': sid},
                'nameLabel': {'$ref': nid},
                'namespaceLabel': {'$ref': nsid},
                'propertyLabel': {'$ref': pid}}
        return comp

    def box_view(self, view_type, model_id, text, left, top, width, height, diagram_id,
                 word_wrap=False):
        vid = uid()
        comp = self._name_compartment(vid, model_id, text, left, top, width)
        return {'_type': view_type, '_id': vid, '_parent': {'$ref': diagram_id},
                'model': {'$ref': model_id}, 'subViews': [comp], 'font': FONT,
                'containerChangeable': True, 'left': left, 'top': top,
                'width': width, 'height': height,
                'nameCompartment': {'$ref': comp['_id']},
                'wordWrap': word_wrap}

    def edge_view(self, view_type, model_id, tail_id, head_id, points, line_style, diagram_id):
        eid = uid()
        # StarUML 的连线要求 6 个边缘标签视图，位置按边中点估算
        xs = [int(p.split(':')[0]) for p in points.split(';')]
        ys = [int(p.split(':')[1]) for p in points.split(';')]
        mx, my = (xs[0] + xs[-1]) // 2, (ys[0] + ys[-1]) // 2
        labels = []
        specs = [(1, False, 1.5708, 15), (1, False, 1.5708, 30), (1, False, -1.5708, 15),
                 (2, False, 0.5236, 30), (2, False, -0.7854, 40), (0, True, 0, 0)]
        for edge_pos, visible, alpha, dist in specs:
            labels.append({'_type': 'LabelView', '_id': uid(), '_parent': {'$ref': eid},
                           'visible': visible, 'font': FONT,
                           'left': mx, 'top': my, 'width': 20, 'height': 13,
                           'alpha': alpha, 'distance': dist,
                           'hostEdge': {'$ref': eid}, 'edgePosition': edge_pos})
        return {'_type': view_type, '_id': eid, '_parent': {'$ref': diagram_id},
                'model': {'$ref': model_id}, 'subViews': labels, 'font': FONT,
                'lineColor': '#333333', 'head': {'$ref': head_id}, 'tail': {'$ref': tail_id},
                'lineStyle': line_style, 'points': points}

    def diagram(self, diagram_type, name, owned_views, is_default=False, parent_id=None):
        did = uid()
        d = {'_type': diagram_type, '_id': did,
             '_parent': {'$ref': parent_id or self.model_id},
             'name': name, 'ownedViews': owned_views}
        if is_default:
            d['defaultDiagram'] = True
        if parent_id:
            self.model_elements.append((parent_id, d))
        else:
            self.diagrams.append(d)
        return did

    # ---------- 输出 ----------
    def build(self):
        # 把元素挂到父元素下
        by_parent = {}
        for parent_id, el in self.model_elements:
            by_parent.setdefault(parent_id, []).append(el)
        def attach(el):
            for child in by_parent.get(el['_id'], []):
                el.setdefault('ownedElements', []).append(child)
                attach(child)
        roots = by_parent.get(self.model_id, [])
        for r in roots:
            attach(r)

        model = {'_type': 'UMLModel', '_id': self.model_id,
                 '_parent': {'$ref': self.project_id},
                 'name': self.name,
                 'ownedElements': roots + self.diagrams}
        return {'_type': 'Project', '_id': self.project_id, 'name': self.name,
                'ownedElements': [model]}


def fix_view_parents(node):
    """把所有视图的 _parent 指到所属图 / 父视图"""
    if isinstance(node, dict):
        if 'ownedViews' in node and isinstance(node['ownedViews'], list):
            did = node['_id']
            for v in node['ownedViews']:
                v['_parent'] = {'$ref': did}
                for sv in v.get('subViews', []):
                    sv['_parent'] = {'$ref': v['_id']}
                    for ssv in sv.get('subViews', []):
                        ssv['_parent'] = {'$ref': sv['_id']}
        for k, v in node.items():
            if k == '_parent':
                continue
            fix_view_parents(v)
    elif isinstance(node, list):
        for x in node:
            fix_view_parents(x)
def main(out_path, seq_path=None):
    doc = Doc('城市绿色出行碳减排积分系统')

    # 文本宽度估算：CJK 按 13px、其它按 7px，用来保证标签单行不换行
    def text_width(t):
        return sum(13 if ord(c) > 0x2E7F else 7 for c in t)

    def check_fit(where, text, box_width):
        need = text_width(text)
        avail = box_width - 10
        if need > avail:
            raise SystemExit('文本超出宽度：%s "%s" 需要 %dpx，可用 %dpx' % (where, text, need, avail))

    # ---------------- 包图 ----------------
    pkg_root = doc.package('绿色出行积分系统')
    pkg_ui = doc.package('接口层 boundary', pkg_root)
    pkg_app = doc.package('应用层 control', pkg_root)
    pkg_domain = doc.package('领域层 entity', pkg_root)
    pkg_infra = doc.package('基础设施 infra', pkg_root)

    dep1 = doc.dependency('调用', pkg_ui, pkg_app)
    dep2 = doc.dependency('依赖', pkg_app, pkg_domain)
    dep3 = doc.dependency('实现', pkg_infra, pkg_domain)
    dep4 = doc.dependency('读写', pkg_app, pkg_infra)

    PW = 260
    for t in ['绿色出行积分系统', '接口层 boundary', '应用层 control', '领域层 entity', '基础设施 infra']:
        check_fit('包图', t, PW)

    v_root = doc.box_view('UMLPackageView', pkg_root, '绿色出行积分系统', 40, 20, PW, 60, 'D_PKG_PLACEHOLDER')
    v_ui = doc.box_view('UMLPackageView', pkg_ui, '接口层 boundary', 40, 150, PW, 60, 'D_PKG_PLACEHOLDER')
    v_app = doc.box_view('UMLPackageView', pkg_app, '应用层 control', 360, 150, PW, 60, 'D_PKG_PLACEHOLDER')
    v_domain = doc.box_view('UMLPackageView', pkg_domain, '领域层 entity', 680, 150, PW, 60, 'D_PKG_PLACEHOLDER')
    v_infra = doc.box_view('UMLPackageView', pkg_infra, '基础设施 infra', 360, 320, PW, 60, 'D_PKG_PLACEHOLDER')

    e1 = doc.edge_view('UMLDependencyView', dep1, v_ui['_id'], v_app['_id'], '300:180;360:180', 2, 'D_PKG_PLACEHOLDER')
    e2 = doc.edge_view('UMLDependencyView', dep2, v_app['_id'], v_domain['_id'], '620:180;680:180', 2, 'D_PKG_PLACEHOLDER')
    e3 = doc.edge_view('UMLDependencyView', dep3, v_infra['_id'], v_domain['_id'], '620:350;680:210', 2, 'D_PKG_PLACEHOLDER')
    e4 = doc.edge_view('UMLDependencyView', dep4, v_app['_id'], v_infra['_id'], '490:210;490:320', 2, 'D_PKG_PLACEHOLDER')

    pkg_views = [v_root, v_ui, v_app, v_domain, v_infra, e1, e2, e3, e4]
    doc.diagram('UMLPackageDiagram', '包图', pkg_views, is_default=True)

    # ---------------- 部署图 ----------------
    # 规格统一：节点 260x150、内部工件 230x56、标签一律单行
    NW, NH = 260, 150
    AW, AH = 230, 56
    nodes = [
        ('用户 PC（浏览器）', 'Vue3 前端静态包（dist）', 'Vue3 前端静态包', 40),
        ('应用服务器（Spring Boot）', 'gts-backend.jar', 'gts-backend.jar', 380),
        ('数据库服务器（MySQL 8.4）', 'MySQL 数据库 gts', 'MySQL 数据库 gts', 720),
    ]
    for node_name, art_name, art_label, _x in nodes:
        check_fit('部署图节点', node_name, NW)
        check_fit('部署图工件', art_label, AW)

    n_ids = [doc.node(n) for n, _, _, _ in nodes]
    a_ids = [doc.artifact(a, n_ids[i]) for i, (_, a, _, _) in enumerate(nodes)]

    dep_http = doc.dependency('HTTPS / JSON', n_ids[0], n_ids[1])
    dep_jdbc = doc.dependency('JDBC 3306', n_ids[1], n_ids[2])

    dv = []
    for i, (node_name, art_name, art_label, x) in enumerate(nodes):
        dv.append(doc.box_view('UMLNodeView', n_ids[i], node_name, x, 40, NW, NH, 'D_DEP_PLACEHOLDER'))
    av = []
    for i, (node_name, art_name, art_label, x) in enumerate(nodes):
        av.append(doc.box_view('UMLArtifactView', a_ids[i], art_label,
                               x + 15, 40 + 70, AW, AH, 'D_DEP_PLACEHOLDER'))

    de1 = doc.edge_view('UMLDependencyView', dep_http, dv[0]['_id'], dv[1]['_id'], '300:115;380:115', 2, 'D_DEP_PLACEHOLDER')
    de2 = doc.edge_view('UMLDependencyView', dep_jdbc, dv[1]['_id'], dv[2]['_id'], '640:115;720:115', 2, 'D_DEP_PLACEHOLDER')

    dep_views = dv + av + [de1, de2]
    doc.diagram('UMLDeploymentDiagram', '部署图', dep_views)

    # ---------------- 类图：boundary / control / entity ----------------
    CW = 220
    groups = [
        ('边界类 boundary（接口层）', 40, [
            ('AuthController', [('account', 'LoginRequest'), ('token', 'String', 'public')]),
            ('TripController', [('tripId', 'String'), ('request', 'CreateTripRequest')]),
            ('MallController', [('productId', 'String'), ('quantity', 'Integer')]),
            ('AdminController', [('admin', 'LoginUser')]),
        ]),
        ('控制类 control（应用层）', 300, [
            ('TripService', [('trips', 'TripRepository'), ('points', 'PointsRepository')]),
            ('MallService', [('orders', 'OrderRepository'), ('mall', 'MallRepository')]),
            ('OrderService', [('lockOrder', 'Sequence'), ('refund', 'Long')]),
            ('RuleService', [('lockMode', 'String'), ('overlap', 'Boolean')]),
            ('ReconcileService', [('readOnlyTx', 'TransactionTemplate')]),
        ]),
        ('实体类 entity（领域层）', 560, [
            ('User', [('userId', 'String'), ('role', 'UserRole')]),
            ('TripRecord', [('tripId', 'String'), ('reductionKg', 'Decimal')]),
            ('CarbonRule', [('ruleId', 'String'), ('pointsRatio', 'Decimal')]),
            ('PointAccount', [('balance', 'Long'), ('lastSeq', 'Long')]),
            ('PointLedger', [('accountSeq', 'Long'), ('amount', 'Long')]),
            ('Product', [('points', 'Long'), ('stock', 'Integer')]),
            ('RedemptionOrder', [('status', 'OrderStatus'), ('totalPoints', 'Long')]),
        ]),
    ]
    class_views = []
    for title, x, classes in groups:
        check_fit('类图分组标题', title, 200)
        y = 30
        for cname, attrs in classes:
            cid, aids = doc.uml_class(cname, attrs)
            cv = doc.class_view(cid, aids, attrs, cname, x, y, CW)
            class_views.append(cv)
            y += cv['height'] + 18
    doc.diagram('UMLClassDiagram', '设计类图（boundary/control/entity）', class_views)

    # ---------------- 5 张关键活动图 ----------------
    # ---------- 序列图 ----------
    def build_sequence(self, name, lifeline_names, messages):
        """messages: [(源索引, 目标索引, 文本)]"""
        inter_id = uid()
        ll = []
        for n in lifeline_names:
            ll.append({'_type': 'UMLLifeline', '_id': uid(),
                       '_parent': {'$ref': inter_id}, 'name': n, 'isMultiInstance': False})
        msgs = []
        for s, t, text in messages:
            msgs.append({'_type': 'UMLMessage', '_id': uid(), '_parent': {'$ref': inter_id},
                         'name': text,
                         'source': {'$ref': ll[s]['_id']},
                         'target': {'$ref': ll[t]['_id']}})

        H = 120 + len(msgs) * 50 + 80
        LW, LT = 96, 40
        lifeline_views = []
        x = 40
        for l in ll:
            vid = uid()
            nc = self._name_compartment(vid, l['_id'], l['name'], x, LT, LW)
            line_part = {'_type': 'UMLLinePartView', '_id': uid(), '_parent': {'$ref': vid},
                         'model': {'$ref': l['_id']}, 'font': FONT, 'parentStyle': False,
                         'left': x + LW // 2, 'top': LT + 41, 'width': 1, 'height': H - (LT + 41)}
            view = {'_type': 'UMLSeqLifelineView', '_id': vid, '_parent': {'$ref': ''},
                    'model': {'$ref': l['_id']}, 'subViews': [nc, line_part],
                    'font': FONT, 'parentStyle': False, 'left': x, 'top': LT,
                    'width': LW, 'height': H - LT,
                    'nameCompartment': {'$ref': nc['_id']},
                    'linePart': {'$ref': line_part['_id']}}
            lifeline_views.append(view)
            x += 210

        # 消息的 tail/head 必须指向生命线内部的 linePart 视图，不是生命线视图本身
        line_parts = [v['linePart'] for v in lifeline_views]
        centers = [v['left'] + v['width'] // 2 for v in lifeline_views]
        views = list(lifeline_views)
        for k, m in enumerate(msgs):
            y = 130 + k * 50
            s, t, text = messages[k]
            mx = centers[s]
            nx = centers[t]
            mid = m['_id']
            act = {'_type': 'UMLActivationView', '_id': uid(), '_parent': {'$ref': ''},
                   'model': {'$ref': mid}, 'visible': True, 'font': FONT, 'parentStyle': False,
                   'left': nx - 7, 'top': y, 'width': 14, 'height': 40}
            span = abs(nx - mx)
            label = {'_type': 'EdgeLabelView', '_id': uid(), '_parent': {'$ref': ''},
                     'visible': True, 'font': FONT,
                     'left': min(mx, nx) + 6, 'top': y - 18,
                     'width': max(40, span - 12), 'height': 13,
                     'alpha': 0.0, 'distance': 12,
                     'edgePosition': 0, 'text': text}
            mvid = uid()
            act['_id'] = act['_id']
            act['_parent'] = {'$ref': mvid}
            mview = {'_type': 'UMLSeqMessageView', '_id': mvid, '_parent': {'$ref': ''},
                     'model': {'$ref': mid}, 'subViews': [label, act], 'font': FONT,
                     'parentStyle': False,
                     'head': {'$ref': line_parts[t]['$ref']},
                     'tail': {'$ref': line_parts[s]['$ref']},
                     'points': '%d:%d;%d:%d' % (mx, y, nx, y),
                     'nameLabel': {'$ref': label['_id']},
                     'activation': {'$ref': act['_id']}}
            views.append(mview)

        diagram = {'_type': 'UMLSequenceDiagram', '_id': uid(), '_parent': {'$ref': inter_id},
                   'name': name, 'ownedViews': views,
                   'showSequenceNumber': True, 'showActivation': True}
        inter = {'_type': 'UMLInteraction', '_id': inter_id, '_parent': {'$ref': self.model_id},
                 'name': name, 'ownedElements': [diagram], 'messages': msgs, 'participants': ll}
        self.model_elements.append((self.model_id, inter))
        return inter_id

    def build_activity(self, name, steps, decision_text, fail_text):
        """活动图：主干严格竖直（所有节点同一中心线），失败分支水平向右"""
        act = self.activity(name)
        COL = 210           # 主干中心线
        AW, AH = 180, 50
        x = COL - AW // 2
        nodes = {}
        y = 40
        nodes['init'] = self.control_node(act, 'UMLInitialNode', '开始', COL - 10, y)
        y += 70
        chain = []
        for s in steps:
            nodes['s%d' % len(chain)] = self.action(act, s, x, y)
            chain.append('s%d' % len(chain))
            y += 90
        nodes['dec'] = self.control_node(act, 'UMLDecisionNode', decision_text, COL - 10, y)
        y += 80
        nodes['ok'] = self.action(act, '提交事务并返回成功', x, y)
        nodes['fail'] = self.action(act, fail_text, x + 300, y - 80)
        nodes['end'] = self.control_node(act, 'UMLActivityFinalNode', '结束', COL - 10, y + 80)
        nodes['end2'] = self.control_node(act, 'UMLActivityFinalNode', '结束', x + 300 + 90 - 10, y - 80 + 60)

        views = [nodes[k][1] for k in ('init',) + tuple(chain) + ('dec', 'ok', 'fail', 'end', 'end2')]
        flow_views = []

        def vertical(a, b, label=''):
            sa, sb = nodes[a][1], nodes[b][1]
            ay = sa['top'] + sa['height']
            by = sb['top']
            return self.control_flow(act, nodes[a][0], nodes[b][0],
                                     '%d:%d;%d:%d' % (COL, ay, COL, by), label,
                                     sa['_id'], sb['_id'])

        def horizontal(a, b, label=''):
            sa, sb = nodes[a][1], nodes[b][1]
            ax = sa['left'] + sa['width']
            ay = sa['top'] + sa['height'] // 2
            bx = sb['left']
            by = sb['top'] + sb['height'] // 2
            return self.control_flow(act, nodes[a][0], nodes[b][0],
                                     '%d:%d;%d:%d' % (ax, ay, bx, by), label,
                                     sa['_id'], sb['_id'])

        seq = ['init'] + chain + ['dec', 'ok', 'end']
        for a, b in zip(seq, seq[1:]):
            flow_views.append(vertical(a, b))
        flow_views.append(horizontal('dec', 'fail', '校验失败'))
        flow_views.append(vertical('fail', 'end2'))

        self.diagram('UMLActivityDiagram', name, views + flow_views, parent_id=act)

    build_activity(doc, '活动图：上报行程与积分发放',
                   ['校验身份、幂等键与里程时间', '按结束时间匹配碳核算规则', 'BigDecimal 核算减排量与积分',
                    '同事务写行程快照、流水与余额'],
                   '校验通过？', '拒绝请求，不落库')
    build_activity(doc, '活动图：积分商品兑换',
                   ['锁账户 → 锁商品', '当前读复查幂等记录', '校验库存与余额',
                    '原子扣分、扣库存、建订单、写流水'],
                   '库存与余额充足？', '整笔回滚，提示不足')
    build_activity(doc, '活动图：订单取消冲正',
                   ['无锁读订单拿标识', '锁账户 → 商品 → 订单', '重读状态并校验终态',
                    '返还积分、恢复库存、写冲正流水'],
                   '状态为 CREATED？', '拒绝：终态不可逆')
    build_activity(doc, '活动图：核算规则版本切换',
                   ['锁 t_rule_mode_lock 对应行', '锁内取当前时间，禁止追溯',
                    '校验同方式区间不重叠', '截断旧区间并插入新版本'],
                   '校验通过？', '拒绝，旧区间与审计不变')
    build_activity(doc, '活动图：只读一致性对账',
                   ['开启 REPEATABLE READ 只读事务', '核对余额与流水、序号连续',
                    '核对行程发分、订单扣减与冲正', '输出差异清单（不修账）'],
                   '读取成功？', '抛 50001，不得显示为无差异')

    data = doc.build()
    fix_view_parents(data)

    with io.open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('written', out_path)

    # ---------------- 独立样例工程：序列图（按组长要求先交一张样例） ----------------
    if seq_path:
        sdoc = Doc('样例：行程上报与积分发放（序列图）')
        build_sequence(sdoc, 
            '序列图：上报行程与积分发放',
            ['用户（浏览器）', 'TripController', 'TripService', 'TripRepository',
             'PointsRepository', 'MySQL'],
            [(0, 1, 'POST /trips'),
             (1, 2, 'create()'),
             (2, 3, '按幂等键查重'),
             (2, 3, '匹配核算规则'),
             (3, 5, 'SELECT 规则'),
             (2, 4, 'applyTrip()'),
             (4, 5, 'UPDATE 账户'),
             (2, 3, 'INSERT 行程'),
             (4, 5, 'INSERT 流水'),
             (2, 1, 'TripDetail'),
             (1, 0, '200 OK')])
        sdata = sdoc.build()
        fix_view_parents(sdata)
        with io.open(seq_path, 'w', encoding='utf-8') as f:
            json.dump(sdata, f, ensure_ascii=False, indent=1)
        print('written', seq_path)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
