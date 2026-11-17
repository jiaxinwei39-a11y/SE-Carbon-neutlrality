# 实验二 UML 设计模型（#8）

> 负责：郭浚文　　更新：2026-11-17
> 生成器：`tools/gen_mdj.py`（结构图/活动图）、`tools/make_seq.py`（序列图，基于已验证模板改内容）

## 1. 文件清单

| 文件 | 内容 | 状态 |
|---|---|---|
| `gts-design.mdj` | 包图、部署图、设计类图、5 张活动图 | 已验证可打开 |
| `gts-seq-sample.mdj` | 序列图：上报行程与积分发放（11 条消息） | 已验证可打开 |
| `gts-seq-redeem.mdj` | 序列图：积分商品兑换 | 已验证 |
| `gts-seq-order-admin.mdj` | 序列图：订单履约与取消 | 已验证 |
| `gts-seq-rule.mdj` | 序列图：核算规则版本切换 | 已验证 |
| `gts-seq-recon.mdj` | 序列图：只读一致性对账 | 已验证 |
| `images/seq-*.png` | 5 张序列图的预览截图（StarUML 截图） | — |

## 2. 图与核对项对应

| 图 | 对应 DR | 内容 |
|---|---|---|
| 包图 | DR-02 | 接口层 boundary / 应用层 control / 领域层 entity / 基础设施 infra |
| 部署图 | DR-02 | PC（前端）→ 应用服务器（`gts-backend.jar`）→ MySQL |
| 设计类图 | DR-03 | 16 类：4 boundary / 5 control / 7 entity（含属性） |
| 活动图 ×5 | DR-04 | 上报发分、兑换、取消冲正、规则切换、只读对账 |
| 序列图 ×5 | DR-03 | 上报、兑换、订单处理、规则切换、对账 |

## 3. 序列图内容（对照后端代码）

### 3.1 上报行程与积分发放（`gts-seq-sample.mdj`）

对应 `TripService.java:124-158`：

| # | 消息 | 代码位置 |
|---|---|---|
| 1 | `POST /trips` | `TripController.create` |
| 2 | `create()` | `TripService.create` |
| 3 | 查重（命中即返回原结果） | `findByClientTripId` |
| 4 | 匹配核算规则 | `trips.findRule` |
| 5 | `SELECT 规则` | — |
| 6 | 核算减排量与积分（FLOOR） | `TripService:136-141` |
| 7 | `INSERT 行程+因子快照（1/3）` | `trips.insert` |
| 8 | `applyTrip()（2/3）` | `PointsRepository:67` |
| 9 | `UPDATE 账户 last_seq+1（仅积分>0）` | `PointsRepository:68-71` |
| 10 | `INSERT 流水（3/3，仅积分>0）` | `TripService:153-158` |
| 11 | `TripDetail（200 OK）` | — |

三项写入（行程 / 账户 / 流水）在**同一事务**内，任一步失败整体回滚。
零积分行程仍保存并计入行程统计，但**不写流水、不递增 `last_seq`**；查重命中同样不再入账。

## 4. 画序列图的踩坑记录（后续维护必读）

这些是本轮反复返工后确认的规则，照着做才不会白屏或错位：

1. **不要克隆视图**。StarUML 对克隆出来的 `UMLSeqMessageView` 一律不渲染（即使补 `_parent`、坐标合法）。
   新图只能在模板文件的原生视图上改内容，**不能增删视图数量**。
2. **不要给 `EdgeLabelView` 加未支持的属性**（如 `horizontalAlignment`）——整张画布会变空白。
3. `EdgeLabelView` 的 `left/top` 会被 StarUML 忽略，真正决定位置的是：
   - `edgePosition`：`1` = 贴箭头起点，`2` = 末端，`0` = 中点
   - `distance`：相对线的法向偏移
4. 行距 55、激活条高 30、文字 `top=y-18`、`edgePosition=1`，是当前不遮挡的参数组合。
5. 导出 PNG 会带 `UNREGISTERED` 水印（StarUML 未注册限制），预览图**用截图代替**。

## 5. 复现

```bash
python tools/gen_mdj.py gts-design.mdj
python tools/make_seq.py 模板.mdj gts-seq-xxx.mdj
```

## 6. 待补

- 鲁棒图 5 张（`「boundary」「control」「entity」` 构造型；参照 `第四讲作业/餐饮管理系统.mdj` 的 profile 写法）
- 其余序列图的预览截图
- Boundary / Control / Entity 类清单（可直接引用设计类图 + README 表格）
