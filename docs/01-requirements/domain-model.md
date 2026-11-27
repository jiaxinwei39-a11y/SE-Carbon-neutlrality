# 领域模型

## 1. 建模说明

本模型是分析阶段的领域类模型，不直接等同于数据库表结构。模型重点表达业务实体、规则和一致性边界。

StarUML 工程文件：[domain-model.mdj](diagrams/domain-model.mdj)。全部实验一图型也已合并到
[lab1-all-models.mdj](diagrams/lab1-all-models.mdj)。

## 2. 核心实体

| 实体 | 中文名称 | 核心职责 |
| --- | --- | --- |
| User | 用户 | 身份、角色和账户状态 |
| Merchant | 商户 | 商品供给方 |
| TripRecord | 出行记录 | 保存模拟行程、减排结果和规则快照 |
| CarbonRule | 碳核算规则 | 定义排放因子、积分系数和生效区间 |
| PointAccount | 积分账户 | 保存当前积分余额和版本号 |
| PointLedger | 积分流水 | 追加式记录所有积分变动 |
| Product | 商品 | 商城商品、价格和库存 |
| RedemptionOrder | 兑换订单 | 记录兑换商品、积分成本和履约状态 |

### 2.1 名词短语法

从需求描述中提取的主要名词短语包括：

- 用户、账户、角色、账户状态。
- 出行记录、出行方式、里程、起止时间。
- 碳减排量、基准排放、实际排放、核算规则、规则版本。
- 积分、积分余额、积分流水、积分发放、积分扣减。
- 商户、商品、商品库存、兑换订单、订单状态。

经过职责归并：

- “用户身份”和“账户状态”归入 `User`。
- “积分”和“积分余额”归入 `PointAccount`；“发放、扣减、冲正记录”归入 `PointLedger`。
- “基准排放、实际排放、减排量”属于一次行程的计算结果，归入 `TripRecord`。
- “排放因子、积分系数、生效区间”归入 `CarbonRule`。
- “商品价格和库存”归入 `Product`；“一次兑换行为”归入 `RedemptionOrder`。

### 2.2 CRC 分析

| 类 | 职责 | 协作者 |
| --- | --- | --- |
| User | 标识用户身份、角色和启用状态；判断用户能否执行受保护操作 | TripRecord、PointAccount、RedemptionOrder |
| Merchant | 标识商品供给方；维护商户可用状态 | Product |
| TripRecord | 保存一次模拟出行的输入、计算结果和规则快照；保证同一行程只被处理一次 | CarbonRule、PointLedger |
| CarbonRule | 规定出行方式、排放因子、积分系数和生效区间；判断是否适用于某条行程 | TripRecord |
| PointAccount | 保存当前积分余额和并发版本；执行加积分、扣积分及余额非负校验 | User、PointLedger |
| PointLedger | 追加记录积分变动、业务来源和变动后余额；提供审计依据 | PointAccount、TripRecord、RedemptionOrder |
| Product | 保存商品名称、积分价格、库存和上下架状态；执行库存非负校验 | Merchant、RedemptionOrder |
| RedemptionOrder | 保存兑换数量、积分成本和履约状态；保证请求号唯一和状态流转合法 | User、Product、PointLedger |

## 3. 核心属性

### User

- `userId: String`
- `username: String`
- `passwordHash: String`
- `nickname: String`
- `role: UserRole`
- `status: UserStatus`

### Merchant

- `merchantId: String`
- `name: String`
- `status: MerchantStatus`

### TripRecord

- `tripId: String`
- `userId: String`
- `clientTripId: String`
- `origin: String`
- `destination: String`
- `mode: TravelMode`
- `distanceKm: Decimal`
- `startTime: DateTime`
- `endTime: DateTime`
- `baselineEmissionKg: Decimal`
- `actualEmissionKg: Decimal`
- `reductionKg: Decimal`
- `awardedPoints: Integer`
- `ruleVersion: String`
- `baselineFactorKgPerKm: Decimal`
- `modeFactorKgPerKm: Decimal`
- `pointsPerKg: Decimal`
- `calculatedAt: DateTime`
- `status: TripStatus`

### CarbonRule

- `ruleId: String`
- `travelMode: TravelMode`
- `baselineFactorKgPerKm: Decimal`
- `modeFactorKgPerKm: Decimal`
- `pointsPerKg: Decimal`
- `effectiveFrom: DateTime`
- `effectiveTo: DateTime`
- `version: String`
- `status: RuleStatus`
- `createdBy: String`
- `createdAt: DateTime`
- `changeReason: String`

### PointAccount

- `accountId: String`
- `userId: String`
- `balance: Integer`
- `version: Integer`

### PointLedger

- `ledgerId: String`
- `userId: String`
- `businessType: PointBusinessType`
- `businessId: String`
- `changePoints: Integer`
- `balanceAfter: Integer`
- `createdAt: DateTime`

### Product

- `productId: String`
- `merchantId: String`
- `name: String`
- `description: String`
- `pointsPrice: Integer`
- `stock: Integer`
- `status: ProductStatus`
- `version: Integer`

### RedemptionOrder

- `orderId: String`
- `userId: String`
- `productId: String`
- `quantity: Integer`
- `pointsPriceSnapshot: Integer`
- `pointsCost: Integer`
- `status: OrderStatus`
- `requestId: String`
- `createdAt: DateTime`
- `processedBy: String?`
- `processedAt: DateTime?`
- `processReason: String?`

## 4. 实体关系

| 源实体 | 目标实体 | 多重性 | 说明 |
| --- | --- | --- | --- |
| User | TripRecord | 1 : 0..* | 一名用户拥有多条出行记录 |
| CarbonRule | TripRecord | 1 : 0..* | 一条规则版本可被多条行程快照引用 |
| User | PointAccount | 1 : 1 | 每名用户只有一个积分账户 |
| PointAccount | PointLedger | 1 : 0..* | 一个账户包含多笔积分流水 |
| Merchant | Product | 1 : 0..* | 一个商户提供多个商品 |
| User | RedemptionOrder | 1 : 0..* | 一名用户可创建多个兑换订单 |
| Product | RedemptionOrder | 1 : 0..* | 一个商品可出现在多个订单中 |
| TripRecord | PointLedger | 0..1 : 0..1 | 行程可关联一笔发放流水 |
| RedemptionOrder | PointLedger | 0..1 : 0..* | 每个兑换订单关联扣减流水，取消时还可追加冲正流水 |

每笔积分流水恰好引用一种业务来源，行程或兑换订单。两种关联在领域模型中各自可空，业务来源由流水的类型和引用编号共同确定。

## 5. 核心业务规则

### 5.1 碳减排计算

对于一条行程记录：

```text
baselineEmissionKg = distanceKm × baselineFactorKgPerKm
actualEmissionKg = distanceKm × modeFactorKgPerKm
reductionKg = max(0, baselineEmissionKg - actualEmissionKg)
awardedPoints = floor(reductionKg × pointsPerKg)
```

积分系数和排放因子必须来自按行程结束时间匹配（左闭右开区间）的 `CarbonRule`。计算完成后将结果和规则版本写入 `TripRecord`。

### 5.2 积分发放不变量

- `userId + clientTripId` 唯一；同键同输入重放，不同输入拒绝。一个 `tripId` 最多一笔发放流水。
- 零积分成功保存行程，不生成零金额流水。
- `PointAccount.balance` 不得小于 0。
- `PointLedger` 只追加，不更新历史记录。
- 流水中的 `balanceAfter` 必须等于该用户此前流水累计后的余额。

### 5.3 兑换不变量

- `Product.stock` 不得小于 0。
- 余额不足或库存不足时，不产生订单。
- `userId + requestId` 唯一，同键同商品同数量重放原订单，不同输入拒绝。
- 订单、积分扣减流水和库存更新必须属于同一事务边界。

### 5.4 规则版本不变量

- 同一出行方式、同一时间段只能有一条生效规则。
- 创建新版本，不覆盖历史因子；原子结束旧区间并开启新区间，禁止追溯生效。
- 历史行程不因新规则生效而重新计算。
- 规则变更必须记录操作人、变更时间和变更原因。

## 6. 状态模型

### 6.1 TripRecord

| 状态 | 含义 | 允许的下一状态 |
| --- | --- | --- |
| `POINTED` | 核算完成，非零积分已发放，零积分无需流水 | 无 |

### 6.2 RedemptionOrder

| 状态 | 含义 | 允许的下一状态 |
| --- | --- | --- |
| `CREATED` | 已扣积分与库存，等待履约 | `FULFILLED`、`CANCELLED` |
| `FULFILLED` | 已完成履约 | 无 |
| `CANCELLED` | 已全额返还积分、恢复库存并追加唯一冲正流水 | 无 |

## 7. 清算、审计与事件边界

积分清算指入账、扣减、取消冲正及账目核对，不代表真实资金结算。流水类型为TRIP_GRANT、REDEMPTION_DEBIT、REDEMPTION_REVERSAL，与业务编号构成唯一键。返还使用原订单pointsCost，不按商品现价重算。精度、时间、状态与对账规则统一见 [业务规则](business-rules.md)。

规则、库存与订单审计包含操作人、时间、前后值和原因，与业务修改原子保存。审计是支撑值对象，实验二再确定存储方式，不为每种审计独立增加领域实体。

同步进程内领域事件参加调用方同一本地事务；以下写入均尚未提交，任一步失败向上传播并整体回滚：

| 事件 | 事务内发生时机 | 同步处理 |
| --- | --- | --- |
| TripReported | 行程输入通过校验与幂等检查 | 核算并保存因子快照 |
| EmissionCalculated | 计算完成 | 非零积分写唯一流水并加余额 |
| PointsGranted | 流水和余额更新完成 | 行程标记POINTED；零积分直接完成，无发分事件 |
| RedemptionRequested | 兑换幂等检查通过 | 校验并更新余额、库存、流水和订单 |
| RedemptionOrderCreated | 兑换写入全部成功 | 提交后返回成功 |
| RedemptionCancelled | 取消、积分库存返还和冲正写入完成 | 保存审计，提交后返回结果 |

禁止提交后再异步触发核心发分，或吞掉异常继续提交。RabbitMQ、Outbox和分布式补偿不属于MVP；若引入外部异步通知，须另做可靠投递设计。

失败上报仅返回错误与日志，不保存失败行程，因此VALIDATED和FAILED不作为当前可查询行程状态。对账只读，不修改历史流水。
