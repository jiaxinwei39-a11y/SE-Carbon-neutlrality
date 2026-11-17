"""
数据库字典生成器（#9）

用法：
    python tools/gen_dict.py <cols.tsv> <fk.tsv> <idx.tsv> <chk.tsv> <输出.md>

四个 TSV 由 tools/export-dict.sql 的 4 个查询导出（mysql -N -B 制表符分隔）：

    mysql -uroot -p gts -N -B < tools/export-dict.sql > 全部结果   # 不适合分开用
    # 实际做法：把 export-dict.sql 里的 4 条 SELECT 分别执行并重定向：
    mysql -uroot -p gts -N -B -e "<查询1>" > cols.tsv
    mysql -uroot -p gts -N -B -e "<查询2>" > fk.tsv
    mysql -uroot -p gts -N -B -e "<查询3>" > idx.tsv
    mysql -uroot -p gts -N -B -e "<查询4>" > chk.tsv
    python tools/gen_dict.py cols.tsv fk.tsv idx.tsv chk.tsv schema-dict.md

设计要点（对应 PR #28 评审意见 5）：
  1. 键列同时标 PK 和 FK —— 例如 t_point_account.user_id 既是主键又是指向 t_user 的外键，
     旧版本只标了 FK，会让人误以为这张表没有主键。
  2. 增加"取值范围"列，取自 information_schema.check_constraints 的 CHECK 子句，
     枚举型字段（角色、状态、出行方式）的取值范围必须能在字典里看到。
  3. 全部内容来自 information_schema，不手写，可与 db/schema.sql 交叉核对。
"""
import io
import re
import sys

ORDER = [
    't_user', 't_login_session', 't_merchant', 't_carbon_rule', 't_trip',
    't_point_account', 't_point_ledger', 't_product', 't_redemption_order',
    't_audit_log', 't_rule_mode_lock', 't_schema_version',
]

CN = {
    't_user': '用户',
    't_login_session': '登录会话',
    't_merchant': '商户',
    't_carbon_rule': '碳核算规则（版本化）',
    't_trip': '行程记录（含核算快照）',
    't_point_account': '积分账户',
    't_point_ledger': '积分流水（只追加、账户内有序）',
    't_product': '积分商品',
    't_redemption_order': '兑换订单',
    't_audit_log': '审计日志',
    't_rule_mode_lock': '规则串行化锁（技术表）',
    't_schema_version': '结构版本记录（技术表）',
}


def read_tsv(path):
    rows = []
    with io.open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n').replace('\\t', '\t')
            if not line:
                continue
            rows.append(line.split('\t'))
    return rows


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


def clean_check(clause):
    """把 MySQL 规范化后的 CHECK 子句整理得能看懂。

    MySQL 返回的形如：(_utf8mb4\\'BUS\\' = \\`mode\\`) ，
    这里去掉转义反斜杠、_utf8mb4 前缀、外层括号和反引号。
    """
    s = (clause or '').strip()
    # mysql -B 输出会把 \' 二次转义成 \\'，这里统一还原成一个引号
    s = re.sub(r"\\+'", "'", s)
    s = s.replace('\\`', '`')
    s = re.sub(r'^\((.*)\)$', r'\1', s)
    s = s.replace('`', '')
    s = re.sub(r"_utf8mb4'([^']*)'", r"'\1'", s)
    return s


def main():
    cols_p, fk_p, idx_p, chk_p, out_p = sys.argv[1:6]

    cols = read_tsv(cols_p)
    fks = read_tsv(fk_p)
    idxs = read_tsv(idx_p)
    chks = read_tsv(chk_p)

    fk_map = {}
    for r in fks:
        if len(r) >= 4:
            fk_map[(r[0], r[1])] = (r[2], r[3])

    idx_map = {}
    for r in idxs:
        if len(r) >= 4:
            idx_map.setdefault(r[0], []).append((r[1], r[2] == '0', r[3]))

    # 表 → 该表的 CHECK 列表；同时建一列 → 命中的 CHECK 文本
    chk_by_table = {}
    col_checks = {}
    for r in chks:
        if len(r) < 3:
            continue
        tbl, name, clause = r[0], r[1], clean_check(r[2])
        chk_by_table.setdefault(tbl, []).append((name, r[2]))
        # 只把"枚举/区间"类约束挂到具体字段上：看子句里是否出现该列名
        for c in cols:
            if c[0] != tbl:
                continue
            col = c[2]
            if re.search(r'\b' + re.escape(col) + r'\b', clause):
                col_checks.setdefault((tbl, col), []).append(clause)

    tables = {}
    for r in cols:
        if len(r) < 8:
            continue
        tables.setdefault(r[0], []).append(
            (int(r[1]), r[2], r[3], r[4], r[5], r[6], r[7]))

    lines = []
    lines.append('# 数据库字典')
    lines.append('')
    lines.append('> 负责：郭浚文（#9）　数据库：`gts`　MySQL 8.4.11　结构版本：V4')
    lines.append('> 由 `tools/gen_dict.py` 从 `information_schema` 导出，非手写。')
    lines.append('> 字段中文名取自建表语句的 `COMMENT`；键列同时标注主键与外键；')
    lines.append('> 「取值范围」取自 `information_schema.check_constraints`。')
    lines.append('> 可直接用于实验报告"表2-3 表名：XXXX"。')
    lines.append('')

    lines.append('## 1. 表清单')
    lines.append('')
    lines.append('| 序号 | 表名 | 中文名 | 字段数 |')
    lines.append('|---|---|---|---|')
    present = [t for t in ORDER if t in tables]
    present += [t for t in sorted(tables) if t not in ORDER]
    for i, t in enumerate(present, 1):
        lines.append('| %d | `%s` | %s | %d |' % (i, t, CN.get(t, ''), len(tables[t])))
    lines.append('')

    lines.append('## 2. 索引与唯一约束清单')
    lines.append('')
    lines.append('| 表名 | 索引名 | 唯一 | 字段 |')
    lines.append('|---|---|---|---|')
    for t in present:
        for name, uniq, col in idx_map.get(t, []):
            lines.append('| `%s` | `%s` | %s | %s |' % (t, name, '是' if uniq else '否', col))
    lines.append('')

    lines.append('## 3. CHECK 约束清单（字段取值范围）')
    lines.append('')
    lines.append('| 表名 | 约束名 | 子句（规范化） |')
    lines.append('|---|---|---|')
    for t in present:
        for name, raw in chk_by_table.get(t, []):
            lines.append('| `%s` | `%s` | `%s` |' % (t, name, clean_check(raw)))
    lines.append('')

    lines.append('## 4. 逐字段字典')
    for t in present:
        lines.append('')
        lines.append('### %s　%s' % (t, CN.get(t, '')))
        lines.append('')
        lines.append('| 序号 | 字段中文名 | 字段英文名 | 类型 | 宽度 | 精度 | 键 | 空否 | 默认值 | 取值范围 |')
        lines.append('|---|---|---|---|---|---|---|---|---|---|')
        for pos, name, ctype, nullable, default, key, comment in sorted(tables[t]):
            base, width, prec = split_type(ctype)

            marks = []
            if key == 'PRI':
                marks.append('PK')
            elif key == 'UNI':
                marks.append('UK')
            if (t, name) in fk_map:
                ref = fk_map[(t, name)]
                marks.append('FK→%s.%s' % ref)
            keytxt = ','.join(marks)

            nulltxt = '否' if nullable == 'NO' else '是'
            dtxt = '' if default in ('', None) else default
            if 'CURRENT_TIMESTAMP' in dtxt:
                dtxt = 'CURRENT_TIMESTAMP'
            rng = '; '.join(col_checks.get((t, name), []))
            if len(rng) > 80:
                rng = rng[:77] + '...'
            lines.append('| %d | %s | `%s` | %s | %s | %s | %s | %s | %s | %s |' % (
                pos, short_comment(comment), name, base, width, prec,
                keytxt, nulltxt, dtxt, rng))

    with io.open(out_p, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('written %s (%d lines)' % (out_p, len(lines)))


if __name__ == '__main__':
    main()
