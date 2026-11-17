# 实验二 UML 设计模型（#8）

[可编辑的 StarUML 工程](gts-design.mdj)包含原首批 8 张架构、设计类和活动图，以及 8 组鲁棒图和序列图。本版沿用郭浚文在 #35 的工程和生成器。此前两个独立序列图试验文件保留在 #35 分支，以此处合并工程为交付版本。

8 组交互覆盖当前范围内的 14 个 P0 用例。UC-03 个人资料、UC-14 运营统计、UC-15 用户启停按 P1 跟踪。分组序列图按带标签的业务分支阅读，查询、写入和失败路径并非一条请求连续执行。

| 用例 | 鲁棒图 | 序列图 | 边界类与控制类 |
| --- | --- | --- | --- |
| UC-01/02 注册与登录 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-01%2102%20%E6%B3%A8%E5%86%8C%E4%B8%8E%E7%99%BB%E5%BD%95.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-01%2102%20%E6%B3%A8%E5%86%8C%E4%B8%8E%E7%99%BB%E5%BD%95.jpg) | AuthController / AuthService |
| UC-04/05/06 行程上报与核算结果 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-04%2105%2106%20%E8%A1%8C%E7%A8%8B%E4%B8%8A%E6%8A%A5%E4%B8%8E%E6%A0%B8%E7%AE%97%E7%BB%93%E6%9E%9C.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-04%2105%2106%20%E8%A1%8C%E7%A8%8B%E4%B8%8A%E6%8A%A5%E4%B8%8E%E6%A0%B8%E7%AE%97%E7%BB%93%E6%9E%9C.jpg) | TripController / TripService |
| UC-07/08 积分余额与流水 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-07%2108%20%E7%A7%AF%E5%88%86%E4%BD%99%E9%A2%9D%E4%B8%8E%E6%B5%81%E6%B0%B4.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-07%2108%20%E7%A7%AF%E5%88%86%E4%BD%99%E9%A2%9D%E4%B8%8E%E6%B5%81%E6%B0%B4.jpg) | PointsController / PointsService |
| UC-09/10 商品浏览与兑换 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-09%2110%20%E5%95%86%E5%93%81%E6%B5%8F%E8%A7%88%E4%B8%8E%E5%85%91%E6%8D%A2.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-09%2110%20%E5%95%86%E5%93%81%E6%B5%8F%E8%A7%88%E4%B8%8E%E5%85%91%E6%8D%A2.jpg) | MallController / MallService |
| UC-11/13 订单查询、履约与取消 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-11%2113%20%E8%AE%A2%E5%8D%95%E6%9F%A5%E8%AF%A2%E3%80%81%E5%B1%A5%E7%BA%A6%E4%B8%8E%E5%8F%96%E6%B6%88.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-11%2113%20%E8%AE%A2%E5%8D%95%E6%9F%A5%E8%AF%A2%E3%80%81%E5%B1%A5%E7%BA%A6%E4%B8%8E%E5%8F%96%E6%B6%88.jpg) | 订单接口 / OrderService |
| UC-12 维护商品与库存 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-12%20%E7%BB%B4%E6%8A%A4%E5%95%86%E5%93%81%E4%B8%8E%E5%BA%93%E5%AD%98.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-12%20%E7%BB%B4%E6%8A%A4%E5%95%86%E5%93%81%E4%B8%8E%E5%BA%93%E5%AD%98.jpg) | AdminController / AdminService |
| UC-16 配置碳核算规则 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-16%20%E9%85%8D%E7%BD%AE%E7%A2%B3%E6%A0%B8%E7%AE%97%E8%A7%84%E5%88%99.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-16%20%E9%85%8D%E7%BD%AE%E7%A2%B3%E6%A0%B8%E7%AE%97%E8%A7%84%E5%88%99.jpg) | AdminController / RuleService |
| UC-17 只读积分对账 | [预览](previews/%E9%B2%81%E6%A3%92%E5%9B%BE%20UC-17%20%E5%8F%AA%E8%AF%BB%E7%A7%AF%E5%88%86%E5%AF%B9%E8%B4%A6.jpg) | [预览](previews/%E5%BA%8F%E5%88%97%E5%9B%BE%20UC-17%20%E5%8F%AA%E8%AF%BB%E7%A7%AF%E5%88%86%E5%AF%B9%E8%B4%A6.jpg) | AdminController / ReconcileService |

## 架构、类及活动图

| 图 | 评审项 | 预览 |
| --- | --- | --- |
| 活动图：上报行程与积分发放 | DR-04 | [预览](previews/%E6%B4%BB%E5%8A%A8%E5%9B%BE%EF%BC%9A%E4%B8%8A%E6%8A%A5%E8%A1%8C%E7%A8%8B%E4%B8%8E%E7%A7%AF%E5%88%86%E5%8F%91%E6%94%BE.jpg) |
| 活动图：积分商品兑换 | DR-04 | [预览](previews/%E6%B4%BB%E5%8A%A8%E5%9B%BE%EF%BC%9A%E7%A7%AF%E5%88%86%E5%95%86%E5%93%81%E5%85%91%E6%8D%A2.jpg) |
| 活动图：订单取消冲正 | DR-04 | [预览](previews/%E6%B4%BB%E5%8A%A8%E5%9B%BE%EF%BC%9A%E8%AE%A2%E5%8D%95%E5%8F%96%E6%B6%88%E5%86%B2%E6%AD%A3.jpg) |
| 活动图：核算规则版本切换 | DR-04 | [预览](previews/%E6%B4%BB%E5%8A%A8%E5%9B%BE%EF%BC%9A%E6%A0%B8%E7%AE%97%E8%A7%84%E5%88%99%E7%89%88%E6%9C%AC%E5%88%87%E6%8D%A2.jpg) |
| 活动图：只读一致性对账 | DR-04 | [预览](previews/%E6%B4%BB%E5%8A%A8%E5%9B%BE%EF%BC%9A%E5%8F%AA%E8%AF%BB%E4%B8%80%E8%87%B4%E6%80%A7%E5%AF%B9%E8%B4%A6.jpg) |
| 包图 | DR-02 | [预览](previews/%E5%8C%85%E5%9B%BE.jpg) |
| 部署图 | DR-02 | [预览](previews/%E9%83%A8%E7%BD%B2%E5%9B%BE.jpg) |
| 设计类图（boundary/control/entity） | DR-03 | [预览](previews/%E8%AE%BE%E8%AE%A1%E7%B1%BB%E5%9B%BE%EF%BC%88boundary%21control%21entity%EF%BC%89.jpg) |

## 关键流程

- 行程上报由后端在同一事务中先写行程快照，再更新账户。正积分才写 EARN 流水，零积分行程仍保留。失败回滚，重复请求依据幂等键重放或拒绝。
- 兑换先锁账户，并用当前读复查同一请求。未命中才锁商品并检查库存和余额，扣分、扣库存、建单和记流水同事务完成。
- 履约只更新状态并留痕；取消按原订单积分返还、恢复库存、追加冲正流水。重复取消返回原单，不再冲正。
- 规则变更先取得同方式锁，再检查禁止追溯与区间重叠。对账在同一只读事务核对，读取失败返回 50001。

## 复现和验证

从仓库根目录执行：

```text
python docs/02-design/uml/tools/gen_mdj.py docs/02-design/uml/gts-design.mdj
```

使用 StarUML 原生命令加载工程并导出了 24 张 JPEG，预览保留未注册版本的原始水印。已逐图对照文件名和数量，并核对模型 ID、引用及序列图的生命线、消息和激活条。设计评审的人员确认与课程最终验收另行记录。
