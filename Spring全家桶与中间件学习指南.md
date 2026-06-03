# Spring 全家桶与中间件学习指南

---

# Spring Boot 篇

## 一、自动配置原理（面试最高频）

### 1.1 @SpringBootApplication 拆解

```java
@SpringBootApplication
// 等价于：
@SpringBootConfiguration  // = @Configuration，标记配置类
@EnableAutoConfiguration  // 自动配置的核心
@ComponentScan            // 扫描当前包及子包的组件
```

### 1.2 @EnableAutoConfiguration 工作原理

```
@EnableAutoConfiguration
    ↓ 导入
@Import(AutoConfigurationImportSelector.class)
    ↓ 读取
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
    ↓ 列出所有
xxxAutoConfiguration 类（如 DataSourceAutoConfiguration）
    ↓ 条件装配过滤
@ConditionalOnClass / @ConditionalOnBean / @ConditionalOnMissingBean / @ConditionalOnProperty
    ↓ 满足条件则生效
自动配置 Bean 注入容器
```

**示例：DataSourceAutoConfiguration 的条件**
```java
@AutoConfiguration
@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {
    // 当 classpath 有 DataSource 类、且没有用户自定义的 DataSource Bean 时
    // 自动根据 spring.datasource.* 配置创建 DataSource
}
```

### 1.3 条件注解速查

| 注解 | 条件 |
|------|------|
| @ConditionalOnClass | classpath 存在指定类 |
| @ConditionalOnMissingClass | classpath 不存在指定类 |
| @ConditionalOnBean | 容器中存在指定 Bean |
| @ConditionalOnMissingBean | 容器中不存在指定 Bean |
| @ConditionalOnProperty | 配置项等于指定值 |
| @ConditionalOnResource | classpath 存在指定资源文件 |
| @ConditionalOnExpression | SpEL 表达式为 true |
| @ConditionalOnWebApplication | 是 Web 应用 |

### 1.4 自定义 Starter

**步骤：**
1. 创建 Properties 类：`@ConfigurationProperties(prefix = "mystarter")` 绑定配置
2. 创建 AutoConfiguration 类：定义要自动创建的 Bean
3. 在 `spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 中声明
4. 启用配置属性元数据：`spring-boot-configuration-processor` 依赖

---

## 二、Spring 核心

### 2.1 IoC 容器

**BeanFactory vs ApplicationContext：**

| | BeanFactory | ApplicationContext |
|---|---|---|
| 定位 | 底层 IoC 容器 | 高级容器，继承 BeanFactory |
| 实例化 | 懒加载（首次 getBean） | 预加载（启动时创建所有单例 Bean） |
| 功能 | 基础 DI | + AOP + 国际化 + 事件发布 + 资源加载 |

**Bean 生命周期：**
```
实例化 → 属性赋值 → Aware 接口回调（BeanNameAware/BeanFactoryAware/ApplicationContextAware）
→ BeanPostProcessor.beforeInitialization
→ InitializingBean.afterPropertiesSet / @PostConstruct
→ BeanPostProcessor.afterInitialization
→ 就绪可用
→ DisposableBean.destroy / @PreDestroy
→ 销毁
```

### 2.2 依赖注入

**三种注入方式：**
```java
// 1. 构造器注入（推荐）
@RestController
public class UserController {
    private final UserService userService;
    public UserController(UserService userService) {
        this.userService = userService;  // final + 构造器，不可变
    }
}

// 2. Setter 注入
@Autowired
public void setUserService(UserService userService) { ... }

// 3. 字段注入（不推荐，难以测试、隐藏依赖）
@Autowired
private UserService userService;
```

**为什么推荐构造器注入？** 依赖不可变（final）、避免空指针、方便单元测试（不需要启动 Spring 容器）。

### 2.3 AOP

**基本原理：动态代理**

```
调用链：
Client → 代理对象 → 切面（@Before/@Around/@After）→ 目标对象 → 返回
                   ↑
                   @Transactional / @Cacheable / 日志切面
```

**JDK 动态代理 vs CGLIB：**
| | JDK 动态代理 | CGLIB |
|---|---|---|
| 要求 | 目标类必须有接口 | 无要求 |
| 原理 | Proxy + InvocationHandler | 生成目标类的子类，覆写方法 |
| Spring 默认 | 有接口时默认使用 | 无接口时使用 |
| Spring Boot 2.x | — | **默认 CGLIB（proxyTargetClass=true）** |

**AOP 失效场景（面试高频）：**
1. 类内部方法调用（this.method()）不走代理 → 注入自身代理对象解决
2. 方法非 public（CGLIB 无法覆写 private 方法）
3. 异常被 catch 吞掉（@Transactional 不回滚）
4. @Transactional 非 RuntimeException 默认不回滚 → 指定 rollbackFor = Exception.class

### 2.4 循环依赖

**问题：** A 依赖 B，B 依赖 A，创建时死循环。

**Spring 三级缓存解决：**
```
一级缓存（singletonObjects）：完全初始化好的 Bean
二级缓存（earlySingletonObjects）：提前暴露的 Bean 引用（未完成属性赋值）
三级缓存（singletonFactories）：Bean 的工厂（可生成代理对象）

流程：创建 A → 发现依赖 B → 创建 B → 发现依赖 A
→ 从三级缓存中取出 A 的工厂 → 生成 A 的早期引用（可能是代理）→ 放入二级缓存
→ B 拿到 A 的引用后完成创建 → A 拿到 B 后完成创建 → 放入一级缓存
```

**为什么需要三级缓存？** 二级缓存可以解决普通循环依赖，三级缓存是为 AOP 代理准备的——需要在对 B 注入 A 时给 A 生成代理对象。

**构造器注入无法解决循环依赖：** 因为构造器注入要求在实例化时就提供依赖，而此时 Bean 还没被创建。

---

## 三、事务管理

### 3.1 事务传播行为

| 传播行为 | 描述 |
|----------|------|
| REQUIRED（默认） | 有事务就用，没有就创建 |
| REQUIRES_NEW | 总是创建新事务，挂起当前事务 |
| SUPPORTS | 有事务就用，没有就非事务执行 |
| NOT_SUPPORTED | 非事务执行，挂起当前事务 |
| MANDATORY | 必须在事务中执行，否则抛异常 |
| NEVER | 必须非事务执行，否则抛异常 |
| NESTED | 嵌套事务，内部事务可独立回滚 |

**REQUIRED vs REQUIRES_NEW：**
```java
// REQUIRED：A 和 B 在同一个事务中，B 抛异常 A 也回滚
@Transactional  // REQUIRED
public void a() { b(); }

@Transactional  // REQUIRED
public void b() { throw new RuntimeException(); }  // A 和 B 都回滚

// REQUIRES_NEW：B 独立事务，B 回滚不影响 A
@Transactional  // REQUIRED
public void a() { try { b(); } catch (Exception e) { /* B 已回滚 */ } }

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void b() { throw new RuntimeException(); }  // 只回滚 B
```

### 3.2 事务失效场景总结

1. 方法非 public（AOP 无法代理）
2. 类内部调用（不走代理）
3. 异常被 catch 吞掉
4. 抛了非 RuntimeException（默认只回滚 RuntimeException 和 Error）
5. @Transactional 注解到非 public 方法
6. 数据库引擎不支持事务（MyISAM）
7. 多线程环境（事务绑定到线程）

---

# Spring Cloud 篇

## 一、核心组件

### 1.1 注册中心（Nacos）

**CAP 权衡：**
- Nacos：支持 AP（最终一致）和 CP（强一致），默认 AP
- Eureka：AP，保护模式下保留所有节点信息
- Zookeeper：CP，Leader 故障时短暂不可用
- Consul：CP

**Nacos 功能：** 服务注册/发现 + 配置中心 + 健康检查

**服务注册流程：**
```
Provider 启动 → 向 Nacos 发送注册请求（IP/端口/服务名/元数据）
→ Nacos 维护服务列表
→ Consumer 从 Nacos 拉取服务列表 + 定时同步
→ Consumer 负载均衡选择一个 Provider 发起调用
→ Provider 定时发送心跳（5s一次）
→ 15s 无心跳 → 不健康 → 30s 无心跳 → 剔除
```

### 1.2 配置中心（Nacos Config）

**动态刷新原理：**
```
1. 应用启动时从 Nacos 加载配置 → 存入 Spring Environment
2. 对 @RefreshScope 或 @Value 标注的 Bean
3. Nacos 配置变更 → 长轮询/WebSocket 推送 → Spring Cloud Bus 广播
4. → RefreshEventListener 监听到 RefreshEvent
5. → ContextRefresher.refresh() → 重新绑定配置 → 更新 @Value 值
```

### 1.3 远程调用（OpenFeign）

**原理：**
```
@FeignClient("user-service")
public interface UserClient {
    @GetMapping("/users/{id}")
    User getUser(@PathVariable Long id);
}
    ↓ Spring 为其创建 JDK 动态代理
    ↓ 方法调用被 FeignInvocationHandler 拦截
    ↓ 根据注解构建 HTTP 请求（MethodHandler）
    ↓ 通过 LoadBalancer 选择实例
    ↓ 发送 HTTP 请求（默认 JDK HttpURLConnection，可换 HttpClient/OkHttp）
```

**Feign 拦截器：** 在请求发出前拦截，常用于传递认证 token、链路追踪 ID。

### 1.4 网关（Gateway）

**三大核心：**
```
请求 → Route（路由规则）→ Predicate（断言，是否匹配）→ Filter（过滤器链）→ 后端服务
```

**过滤器类型：**
- **GatewayFilter：** 针对单个路由
- **GlobalFilter：** 全局生效（认证、日志、限流）

**常用场景：** 统一认证、请求日志、跨域处理、IP 黑白名单、请求限流

### 1.5 熔断降级（Sentinel）

**三种模式：**

| 模式 | 描述 | 场景 |
|------|------|------|
| 慢调用比例 | 慢调用比例超过阈值 → 熔断 | 下游响应变慢 |
| 异常比例 | 异常比例超过阈值 → 熔断 | 下游错误率高 |
| 异常数 | 异常数超过阈值 → 熔断 | 1 分钟内错误数太多 |

**限流策略：**
- QPS 限流：超过阈值直接拒绝
- 线程数限流：超过最大线程数排队等待
- 关联限流：资源 A 的 QPS 影响资源 B 时触发
- 链路限流：只对入口资源的某条调用链路限流

---

# MyBatis-Plus 篇

## 一、核心特性

### 1.1 BaseMapper 自动 CRUD

```java
public interface UserMapper extends BaseMapper<User> {
    // 无需写任何 SQL，自动获得：
    // insert / updateById / deleteById / selectById / selectList / selectPage
}
```

**原理：** MyBatis 启动时解析 BaseMapper 接口 → 根据实体类反射解析表名、字段 → 自动生成 SQL 注入到 MyBatis 的 MappedStatement 中。

### 1.2 条件构造器

```java
// Lambda 方式（类型安全，推荐）
List<User> users = userMapper.selectList(
    new LambdaQueryWrapper<User>()
        .eq(User::getName, "张三")
        .gt(User::getAge, 18)
        .between(User::getCreateTime, start, end)
        .orderByDesc(User::getId)
        .last("LIMIT 10")
);

// 更新
userMapper.update(null, new LambdaUpdateWrapper<User>()
    .set(User::getStatus, "INACTIVE")
    .lt(User::getLastLoginTime, thirtyDaysAgo)
);
```

### 1.3 分页插件

```java
// 配置分页拦截器
@Bean
public MybatisPlusInterceptor mybatisPlusInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
    return interceptor;
}

// 使用
Page<User> page = new Page<>(1, 10);  // 第1页，每页10条
Page<User> result = userMapper.selectPage(page, null);
// result.getRecords() → 数据列表
// result.getTotal()   → 总记录数
```

### 1.4 乐观锁

```java
// 实体类
public class User {
    @Version
    private Integer version;  // 版本号字段
}

// 更新时自动拼接 version 条件
// UPDATE user SET name='xxx', version=3 WHERE id=1 AND version=2
// 如果 version 不匹配（被其他事务修改），更新失败
```

### 1.5 逻辑删除

```java
// 配置
mybatis-plus:
  global-config:
    db-config:
      logic-delete-field: deleted
      logic-delete-value: 1    # 删除后值
      logic-not-delete-value: 0 # 未删除值

// 调用 deleteById → 实际执行 UPDATE SET deleted=1 WHERE id=?
// 查询时自动加 WHERE deleted=0
```

### 1.6 与 MyBatis 原生 SQL 混合

```java
// 复杂 SQL 仍可用 XML 或注解写原生 SQL
public interface UserMapper extends BaseMapper<User> {
    @Select("SELECT u.*, o.order_count FROM user u " +
            "LEFT JOIN (SELECT user_id, COUNT(*) as order_count FROM orders GROUP BY user_id) o " +
            "ON u.id = o.user_id " +
            "WHERE u.status = #{status}")
    List<UserWithOrders> selectUsersWithOrderCount(@Param("status") String status);
}
```

---

# 中间件深化篇

## 一、Kafka

### 1.1 架构

```
Producer → [Broker 1 (Leader)] ← 同步复制 → [Broker 2 (Follower)]
                ↑ 消费
           Consumer Group
           ├── Consumer 1（分区 1,2）
           └── Consumer 2（分区 3,4）
```

### 1.2 如何保证消息不丢失

| 环节 | 措施 |
|------|------|
| 生产者 | acks=all（所有副本确认）+ retries > 0 + 启用幂等（enable.idempotence=true） |
| Broker | replication.factor >= 3 + min.insync.replicas >= 2 + unclean.leader.election.enable=false |
| 消费者 | 手动提交 offset（处理完消息再 commit）+ 开启 `enable.auto.commit=false` |

### 1.3 重复消费与幂等

**为什么会重复：** 消费者处理完消息但提交 offset 前崩溃 → 重启后重新消费。

**幂等方案：**
1. 数据库唯一键去重：插入消息 ID，唯一键冲突则跳过
2. Redis setnx：消费前 SETNX msg_id，已存在则跳过
3. 业务逻辑天然幂等：UPDATE 语句、判断状态机

### 1.4 消息积压处理

**原因：** 消费者处理速度 < 生产者发送速度

**临时方案：**
1. 增加消费者实例（同 Group 内，不能超过分区数）
2. 增加分区数（需要评估，只能增不能减）
3. 临时写一个转发 Consumer，不处理业务，只把消息批量转到新 Topic → 用更多分区的新 Topic 加速消费

### 1.5 其他高频面试点

**ISR 机制：** 与 Leader 保持同步的副本集合。min.insync.replicas 控制最少同步副本数。

**零拷贝：** Kafka 使用 `sendfile()` 系统调用，数据从磁盘直接发送到网卡，不经过用户态。

**分区分配策略：** Range（默认）/ RoundRobin / Sticky / CooperativeSticky

---

## 二、Elasticsearch

### 2.1 倒排索引

```
正排索引：文档ID → 内容（查文档包含什么词）
倒排索引：词 → 文档ID列表（查词出现在哪些文档）
```

**构建过程：**
```
原始文档 → 分词（Tokenizer）→ 归一化（小写、词干）-→ 倒排表
例如：
Doc1: "Java is great"
Doc2: "Python is great"

倒排索引：
Java    → [Doc1]
Python  → [Doc2]
is      → [Doc1, Doc2]
great   → [Doc1, Doc2]
```

### 2.2 写流程

```
Client → 协调节点（根据 doc id hash 路由到分片）
       → 主分片写入 → 同步到副本分片
       → 所有分片返回确认 → 协调节点返回 Client
```

**refresh vs flush：**
- refresh：每秒将内存 buffer 的数据生成新 segment，使其可搜索
- flush：将 segment 持久化到磁盘（默认 30 分钟或 translog 满 512MB）

**近实时搜索（NRT）：** 数据写入后默认 1 秒后才能被搜索到（refresh 间隔）。

### 2.3 脑裂问题

**原因：** 网络分区导致集群分裂为多个，双方都认为对方挂了，各自选举新 Master。

**避免：** `discovery.zen.minimum_master_nodes = (N/2) + 1`（7.x 后自动管理）

### 2.4 ES 与 MySQL 对比

| | MySQL | Elasticsearch |
|---|---|---|
| 核心 | B+Tree 存储引擎 | 倒排索引 + Lucene |
| 查询 | 精确匹配、范围查询 | 全文搜索、模糊匹配、聚合分析 |
| 场景 | OLTP 业务数据 | 日志搜索、商品搜索、数据分析 |
| 事务 | 支持 | 不支持（弱一致性） |

---

## 附：框架面试高频问题速查

| 问题 | 答案要点 |
|------|---------|
| Spring Boot 自动配置原理 | @EnableAutoConfiguration → AutoConfigurationImportSelector → 读取 spring.factories → 条件注解过滤 |
| Bean 生命周期 | 实例化 → 属性赋值 → Aware → BeanPostProcessor#before → init → BeanPostProcessor#after → 就绪 → 销毁 |
| Spring AOP 原理 | JDK 动态代理（接口）或 CGLIB（子类），运行时生成代理对象，方法调用时执行切面逻辑 |
| @Transactional 失效场景 | 非 public、内部调用、异常被 catch、非 RuntimeException 未指定 rollbackFor |
| 循环依赖 | 三级缓存：singletonObjects → earlySingletonObjects → singletonFactories（解决 AOP 代理问题） |
| Feign 原理 | JDK 动态代理 + 注解解析 → 构建 HTTP 请求 → 负载均衡 → 发出请求 |
| Gateway 过滤器 | GlobalFilter 全局生效（认证/日志），GatewayFilter 路由级别，可实现限流/鉴权/日志 |
| Sentinel 熔断策略 | 慢调用比例、异常比例、异常数 |
| MyBatis-Plus 分页原理 | PaginationInnerInterceptor 拦截 SQL，自动追加 LIMIT + COUNT |
| Kafka 为什么快 | 顺序写入磁盘（追加）、零拷贝 sendfile、批量压缩、分区并行、PageCache 利用 |
| Kafka 消息不丢失 | 生产者 acks=all + Broker 副本 >= 3 + 消费者手动 commit |
| ES 为什么快 | 倒排索引、内存缓存、跳表/位图等高效数据结构、分布式分片并行查询 |
