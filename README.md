# 城市绿色出行碳积分系统

本项目面向软件工程课程实验，目标是实现一个鼓励市民采用公交、地铁、骑行等绿色出行方式的积分激励平台。

当前处于 **Sprint 0：需求与工程准备**，已经形成需求范围、用户故事地图和初始看板任务草案。可运行代码将在范围基线评审后开始建设。

## 项目文档

- [项目章程](docs/01-project-charter.md)
- [MVP 范围与验收基线](docs/02-mvp-scope.md)
- [用户故事地图](docs/03-user-story-map.md)
- [看板初始任务](docs/04-kanban-backlog.md)

## 建议技术基线

以下技术选型为课程项目建议，需由团队在 Sprint 0 评审时最终确认。

- 后端：Java 17、Spring Boot 3、Maven
- 数据库：MySQL 8
- 消息与缓存：RabbitMQ、Redis
- 前端：Vue 3、TypeScript、Vite、Element Plus
- 测试：JUnit 5、Mockito、Spring Boot Test、Testcontainers
- 建模：PlantUML，必要时用 StarUML 输出报告插图
- 部署：Docker Compose
- 协作：Git、GitHub/GitLab、GitHub Projects 或同等看板

## 待团队确认

- 实际成员名单、组长和角色分配
- 课程总周期及每个 Sprint 的具体起止日期
- 最终技术栈和仓库托管平台
- MVP 范围是否需要增加或删减
- 商户端在 MVP 中的实现深度

