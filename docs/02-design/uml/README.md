# 项目 14 课件版模型

- [实验一需求图](../../01-requirements/diagrams/README.md)有 5 张模块用例图、1 张领域模型图和 3 张需求活动图。
- [实验二 StarUML 工程](gts-design.mdj)有 38 张图，双击文件后从左侧模型树选择图。
- [数据库 StarUML 工程](gts-database.mdj)包含基于 V4 建表脚本绘制的 ER 图。字段和约束见[数据字典](../../../db/schema-dict.md)。

预览由 StarUML 直接导出，保留软件附带的水印。页码按课件中的幻灯片顺序。

## 架构、类和程序活动

| 图 | 依据 | 预览 |
| --- | --- | --- |
| 上报行程与积分发放 | 第四讲第 82、95–96 页与实验指导书 DR-04 | [查看](previews/ACT-04.jpg) |
| 积分商品兑换 | 第四讲第 82、95–96 页与实验指导书 DR-04 | [查看](previews/ACT-10.jpg) |
| 订单取消冲正 | 第四讲第 82、95–96 页与实验指导书 DR-04 | [查看](previews/ACT-13.jpg) |
| 核算规则版本切换 | 第四讲第 82、95–96 页与实验指导书 DR-04 | [查看](previews/ACT-16.jpg) |
| 只读一致性对账 | 第四讲第 82、95–96 页与实验指导书 DR-04 | [查看](previews/ACT-17.jpg) |
| 逻辑包图 | 第四讲第 34–42、54 页 | [查看](previews/ARCH-01.jpg) |
| 本机部署图 | 第四讲第 55–56 页 | [查看](previews/ARCH-02.jpg) |
| 边界控制及实体设计类 | 第四讲第 83–85、102–103 页 | [查看](previews/CLASS-01.jpg) |
| 数据库 ER 图 | 第四讲第 137 页与项目 V4 建表脚本 | [查看](previews/DB-01.jpg) |

部署图表示启用 API 的本机联调方式。应用和数据库同属一台电脑。Vite 是开发模式下的页面入口，打包桌面演示可直接加载前端产物。当前默认 Mock 演示配置可独立运行。

ER 图包含 12 张表、115 列和 11 条物理外键。积分流水用 `ref_type`、`ref_id` 追踪行程或订单，操作审计用 `biz_type`、`biz_id` 追踪业务编号。这些业务引用由应用解释，ER 图按 SQL 声明绘制外键。订单的下单用户 `user_id` 与可空处理人 `processed_by` 是两条不同外键。

## 一张用例表对应一对交互图

按第四讲第 83–101 页，参与者、边界、控制和实体先在鲁棒图中识别，再放到序列图的生命线上。序列图在设计层展示业务行为，控制类经仓储读写实体。替代路径画在对应的 `alt` 分支中。

| 范围 | 鲁棒图 | 序列图 |
| --- | --- | --- |
| UC-01 注册账号 | [鲁棒图](previews/R-01.jpg) | [序列图](previews/S-01.jpg) |
| UC-02 登录系统 | [鲁棒图](previews/R-02.jpg) | [序列图](previews/S-02.jpg) |
| UC-04 上报模拟行程 | [鲁棒图](previews/R-04.jpg) | [序列图](previews/S-04.jpg) |
| UC-05 查询行程记录 | [鲁棒图](previews/R-05.jpg) | [序列图](previews/S-05.jpg) |
| UC-06 查看碳减排结果 | [鲁棒图](previews/R-06.jpg) | [序列图](previews/S-06.jpg) |
| UC-07 查看积分余额 | [鲁棒图](previews/R-07.jpg) | [序列图](previews/S-07.jpg) |
| UC-08 查看积分流水 | [鲁棒图](previews/R-08.jpg) | [序列图](previews/S-08.jpg) |
| UC-09 浏览积分商品 | [鲁棒图](previews/R-09.jpg) | [序列图](previews/S-09.jpg) |
| UC-10 兑换积分商品 | [鲁棒图](previews/R-10.jpg) | [序列图](previews/S-10.jpg) |
| UC-11 查询兑换订单 | [鲁棒图](previews/R-11.jpg) | [序列图](previews/S-11.jpg) |
| UC-12 维护商品与库存 | [鲁棒图](previews/R-12.jpg) | [序列图](previews/S-12.jpg) |
| UC-13 处理兑换订单 | [鲁棒图](previews/R-13.jpg) | [序列图](previews/S-13.jpg) |
| UC-14 查看运营统计（已实现的概览） | [鲁棒图](previews/R-14.jpg) | [序列图](previews/S-14.jpg) |
| UC-16 配置碳核算规则 | [鲁棒图](previews/R-16.jpg) | [序列图](previews/S-16.jpg) |
| UC-17 核对积分账目 | [鲁棒图](previews/R-17.jpg) | [序列图](previews/S-17.jpg) |

已覆盖 14 个 P0 用例和 UC-14 已实现的只读运营概览。完整运营统计、UC-03 维护个人资料和 UC-15 启停用户的范围仍以需求文档的 P1 标识为准。

## 核对

图片和模型是设计交付物。业务验收和组内评审记录见[设计评审核对表](../../00-product/design-review.md)及[后端测试报告](../../../gts-backend/TEST-REPORT.md)。
