import sys, io, os, re

def read_tsv(path):
    rows = []
    with io.open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n').replace('\\t', '\t')
            if not line:
                continue
            rows.append(line.split('\t'))
    return rows

cols = read_tsv(sys.argv[1])
fks = read_tsv(sys.argv[2])
idxs = read_tsv(sys.argv[3])
out_path = sys.argv[4]

fk_map = {}
for r in fks:
    if len(r) >= 4:
        fk_map[(r[0], r[1])] = (r[2], r[3])

idx_map = {}
for r in idxs:
    if len(r) >= 4:
        tbl, name, nonuniq, col = r[0], r[1], r[2], r[3]
        idx_map.setdefault(tbl, []).append((name, nonuniq == '0', col))

tables = {}
for r in cols:
    if len(r) < 8:
        continue
    tbl, pos, name, ctype, nullable, default, key, comment = r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]
    tables.setdefault(tbl, []).append((int(pos), name, ctype, nullable, default, key, comment))

def split_type(ctype):
    m = re.match(r'^([a-z]+)\((.*)\)$', ctype)
    if not m:
        return ctype, '-', '-'
    base, args = m.group(1), m.group(2)
    parts = [p.strip() for p in args.split(',')]
    if base == 'decimal':
        return base, parts[0], parts[1] if len(parts) > 1 else '0'
    if base in ('varchar', 'char', 'varbinary'):
        return base, parts[0], '-'
    return base, args, '-'

def short_comment(c):
    if not c:
        return ''
    return re.split(r'[，,（(]', c)[0].strip()

order = ['t_user', 't_login_session', 't_merchant', 't_carbon_rule', 't_trip',
         't_point_account', 't_point_ledger', 't_product', 't_redemption_order', 't_audit_log']

lines = []
lines.append('# 数据库字典（由实际库结构导出，非手写）')
lines.append('')
lines.append('> 负责：郭浚文（#9）　数据库：`gts`　MySQL 8.4.11')
lines.append('> 本文件由 `information_schema` 实际导出生成，与 `db/schema.sql` 保持一致。')
lines.append('> 字段中文名取自建表语句中的 `COMMENT`。')
lines.append('')

lines.append('## 1. 表清单')
lines.append('')
lines.append('| 序号 | 表名 | 说明 | 字段数 |')
lines.append('|---|---|---|---|')
for i, t in enumerate([x for x in order if x in tables], 1):
    cmt = ''
    for r in tables[t]:
        pass
    lines.append('| %d | `%s` | %s | %d |' % (i, t, '', len(tables[t])))
lines.append('')

CN = {
 't_user': '用户', 't_login_session': '登录会话', 't_merchant': '商户',
 't_carbon_rule': '碳核算规则（版本化）', 't_trip': '行程记录（含核算快照）',
 't_point_account': '积分账户', 't_point_ledger': '积分流水（只追加）',
 't_product': '积分商品', 't_redemption_order': '兑换订单', 't_audit_log': '审计日志'
}

lines = []
lines.append('# 数据库字典')
lines.append('')
lines.append('> 负责：郭浚文（#9）　数据库：`gts`　MySQL 8.4.11')
lines.append('> 本文件由 `information_schema` 从实际库导出，与 `db/schema.sql` 一致，非手写。')
lines.append('> 字段中文名取自建表语句的 `COMMENT`，可直接用于实验报告"表2-3 表名：XXXX"。')
lines.append('')
lines.append('## 1. 表清单')
lines.append('')
lines.append('| 序号 | 表名 | 中文名 | 字段数 |')
lines.append('|---|---|---|---|')
for i, t in enumerate([x for x in order if x in tables], 1):
    lines.append('| %d | `%s` | %s | %d |' % (i, t, CN.get(t, ''), len(tables[t])))
lines.append('')

lines.append('## 2. 索引与约束清单')
lines.append('')
lines.append('| 表名 | 索引名 | 唯一 | 字段 |')
lines.append('|---|---|---|---|')
for t in [x for x in order if x in tables]:
    for name, uniq, col in idx_map.get(t, []):
        lines.append('| `%s` | `%s` | %s | %s |' % (t, name, '是' if uniq else '否', col))
lines.append('')

lines.append('## 3. 逐字段字典')
for t in [x for x in order if x in tables]:
    lines.append('')
    lines.append('### %s　%s' % (t, CN.get(t, '')))
    lines.append('')
    lines.append('| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 索引/说明 |')
    lines.append('|---|---|---|---|---|---|---|---|---|---|')
    for pos, name, ctype, nullable, default, key, comment in sorted(tables[t]):
        base, width, prec = split_type(ctype)
        if (t, name) in fk_map:
            fk = fk_map[(t, name)]
            keytxt = 'FK → %s.%s' % fk
        elif key == 'PRI':
            keytxt = 'PK'
        elif key == 'UNI':
            keytxt = 'UK'
        elif key == 'MUL':
            keytxt = 'IDX'
        else:
            keytxt = ''
        nulltxt = '否' if nullable == 'NO' else '是'
        dtxt = default if default not in ('', None) else ''
        if 'CURRENT_TIMESTAMP' in dtxt:
            dtxt = 'CURRENT_TIMESTAMP'
        lines.append('| %d | %s | `%s` | %s | %s | %s | %s | %s | %s | %s |' % (
            pos, short_comment(comment), name, base, width, prec, keytxt, nulltxt, dtxt, ''))

with io.open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('written', out_path, len(lines), 'lines')
