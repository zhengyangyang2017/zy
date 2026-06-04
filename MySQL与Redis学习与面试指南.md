# MySQL 与 Redis 学习与面试指南

---

# MySQL 篇

## 一、架构与执行流程

### 1.1 一条 SQL 的执行全过程

```
客户端 → 连接器（认证/权限）→ 查询缓存（8.0已废弃）→ 分析器（词法/语法）→ 优化器（选索引/Join顺序）→ 执行器（调用引擎接口）→ 存储引擎
```

**每个阶段做了什么：**
- 连接器：TCP 握手 → 身份认证 → 读取权限表（后续操作基于此时权限快照）
- 分析器：词法分析（识别关键词、表名、列名）→ 语法分析（判断 SQL 是否符合语法）
- 优化器：选择索引、决定 Join 顺序、子查询优化
- 执行器：检查表权限 → 调用存储引擎接口逐行读取/写入

**示例：** `SELECT * FROM user WHERE name = 'zhangsan' AND age > 20`
1. 连接器验证身份
2. 分析器解析出 SELECT 语句，目标表 user，条件 name='zhangsan' AND age>20
3. 优化器决定：用 idx_name 还是 idx_age？可能选 idx_name（选择性更高）
4. 执行器调用 InnoDB 接口：先通过 idx_name 找到满足 name='zhangsan' 的行，再过滤 age>20

### 1.2 InnoDB vs MyISAM

| | InnoDB | MyISAM |
|---|---|---|
| 事务 | 支持（ACID） | 不支持 |
| 锁粒度 | 行锁 | 表锁 |
| 外键 | 支持 | 不支持 |
| 崩溃恢复 | 有（redo log） | 无 |
| MVCC | 支持 | 不支持 |
| 全文索引 | 5.6+ 支持 | 原生支持 |
| 数据存储 | 表空间（.ibd） | .MYD + .MYI 分离 |
| 适用场景 | 高并发 OLTP | 只读/报表 |

**默认选择 InnoDB 的原因：** 支持事务、行锁、崩溃恢复，满足绝大多数业务场景。

---

## 二、索引

### 2.1 索引模型

**为什么用 B+Tree 而不是 B-Tree？**

| | B-Tree | B+Tree |
|---|---|---|
| 数据存储 | 叶子节点和非叶子节点都存数据 | 只有叶子节点存数据，非叶子只存 key |
| 叶子节点 | 无链表 | 双向链表串联 |
| 范围查询 | 需要中序遍历，可能跨层回退 | 叶子链表顺序扫描，效率高 |
| 单节点容量 | 存数据导致 key 少，树更高 | 只存 key，单个节点放更多索引，树更矮 |

**为什么不用 Hash？**
- Hash 只能精确匹配，不支持范围查询和排序
- Hash 冲突严重时性能退化
- 联合索引无法利用部分列的查询

**为什么不用跳表/红黑树？** 数据量大的时候树太高，磁盘 IO 次数多。B+Tree 每层可以存更多索引，树的高度一般为 2-4 层。

### 2.2 聚簇索引 vs 非聚簇索引

```
聚簇索引（主键索引）
叶子节点存储：主键 + 完整行数据

非聚簇索引（二级索引/辅助索引）
叶子节点存储：索引列 + 主键值 → 回表查询完整行
```

**回表：** 通过二级索引查到主键，再用主键去聚簇索引查完整行数据。两次查找。

**覆盖索引：** 查询的列都在索引中，不需要回表。
```sql
-- 有联合索引 (name, age)
SELECT name, age FROM user WHERE name = 'zhang';  -- 覆盖索引，不回表
SELECT name, age, email FROM user WHERE name = 'zhang';  -- 需要回表查 email
```

**建议主键自增：** 聚簇索引按主键排序存储，自增插入直接在末尾追加，避免页分裂和页内数据移动。

### 2.3 联合索引 & 最左前缀

**联合索引 (a, b, c) 的内部结构：** 先按 a 排序，a 相同按 b 排序，b 相同按 c 排序。

**最左前缀原则：** 查询条件必须从索引的最左列开始匹配。

```sql
INDEX idx_abc (a, b, c)

WHERE a = 1 AND b = 2 AND c = 3  -- ✅ 全部命中
WHERE a = 1 AND b = 2            -- ✅ 用到 a, b
WHERE a = 1 AND c = 3            -- ✅ 只用到 a（c 无法跳过 b）
WHERE b = 2 AND c = 3            -- ❌ 没有 a，索引失效
WHERE a = 1 AND b > 2 AND c = 3  -- ✅ 用到 a, b（范围后的 c 失效）
WHERE a = 1 AND b LIKE 'x%'      -- ✅ 用到 a, b
WHERE a = 1 AND b LIKE '%x'      -- ✅ 只用到 a（% 开头无法用 b）
```

**索引下推（ICP，5.6+）：** 在引擎层先按索引条件过滤，减少回表次数。
```sql
-- 联合索引 (name, age)
SELECT * FROM user WHERE name LIKE '张%' AND age = 20;
-- 没有 ICP：找到所有 name LIKE '张%' 的主键 → 逐个回表 → 在 Server 层过滤 age
-- 有 ICP：在引擎层直接用 age=20 过滤 → 只回表满足条件的行
```

### 2.4 EXPLAIN 解读

```sql
EXPLAIN SELECT * FROM user WHERE name = 'zhang';
```

**关键字段：**

| 字段 | 含义 | 关注 |
|------|------|------|
| id | 执行顺序 | 越大越先执行，相同则从上到下 |
| type | 访问类型 | **system > const > eq_ref > ref > range > index > ALL** |
| key | 实际使用的索引 | 为 NULL 表示没走索引 |
| rows | 预估扫描行数 | 越小越好 |
| Extra | 额外信息 | Using index（覆盖索引，好）/ Using filesort（文件排序，差）/ Using temporary（临时表，差） |

**type 详解：**
- **const**：主键/唯一索引等值查询，最多一行
- **eq_ref**：Join 时用主键/唯一索引匹配，一行
- **ref**：非唯一索引等值查询，可能多行
- **range**：索引范围扫描（>、<、BETWEEN、LIKE 'x%'）
- **index**：全索引扫描（比 ALL 快一点，因为索引文件小）
- **ALL**：全表扫描，必须优化

### 2.5 索引优化实践

**索引失效的情况（面试高频）：**
1. 不满足最左前缀
2. 索引列上做函数/计算：`WHERE YEAR(create_time) = 2024` → 改为 `WHERE create_time BETWEEN '2024-01-01' AND '2024-12-31'`
3. 隐式类型转换：`WHERE phone = 13800138000`（phone 是 varchar）→ 会全表扫描
4. LIKE `'%keyword'` 以 % 开头
5. OR 连接非索引列：`WHERE name = 'a' OR age = 20`（age 无索引但 name 有 → 可能走索引也可能不走，优化器决定）
6. 不等于 `!=` 或 `<>`
7. IS NULL / IS NOT NULL（视数据分布而定）
8. NOT IN / NOT EXISTS

---

## 三、事务与锁

### 3.1 事务 ACID

| 特性 | 含义 | InnoDB 实现 |
|------|------|------------|
| 原子性 | 要么全做，要么全不做 | undo log（回滚日志） |
| 一致性 | 事务前后数据符合约束 | 由另外三个特性共同保证 |
| 隔离性 | 多个事务互不干扰 | MVCC + 锁 |
| 持久性 | 提交后数据不丢失 | redo log（重做日志） |

### 3.2 隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 | 实现方式 |
|------|------|-----------|------|---------|
| READ UNCOMMITTED | ✓ | ✓ | ✓ | 不加锁，读最新 |
| READ COMMITTED | ✗ | ✓ | ✓ | 每次 SELECT 生成新 ReadView |
| REPEATABLE READ（默认） | ✗ | ✗ | 部分解决 | 事务开始生成 ReadView + 间隙锁 |
| SERIALIZABLE | ✗ | ✗ | ✗ | 读加共享锁，写加排他锁 |

**脏读：** 读到其他事务未提交的数据
**不可重复读：** 同一事务内两次读同一条数据，结果不同（被其他事务 UPDATE 了）
**幻读：** 同一事务内两次查询同一范围，结果集行数不同（被其他事务 INSERT/DELETE 了）

### 3.3 MVCC（多版本并发控制）

**核心组件：**
- **隐藏列：** `DB_TRX_ID`（最近修改的事务ID）、`DB_ROLL_PTR`（指向 undo log 的回滚指针）
- **undo log：** 记录数据修改前的版本，形成版本链
- **ReadView：** 记录当前活跃事务 ID 列表，判断哪个版本可见

**可见性规则（REPEATABLE READ）：**
```
Transaction 100 读取一行数据：
  查看版本链上的 DB_TRX_ID
    → DB_TRX_ID = 100？→ 是（当前事务修改的，可见）
    → DB_TRX_ID < 最小活跃事务 ID？→ 是（在 ReadView 创建前已提交，可见）
    → DB_TRX_ID > 最大活跃事务 ID？→ 是（ReadView 创建后开始的事务，不可见）
    → 在活跃列表中？→ 是（未提交，不可见）
    → 否则可见
```

**RC 和 RR 的 ReadView 区别：**
- RC（READ COMMITTED）：每次 SELECT 创建新的 ReadView
- RR（REPEATABLE READ）：事务中第一次 SELECT 创建 ReadView，后续复用

### 3.4 锁

**按粒度：** 全局锁 → 表级锁 → 行锁

**InnoDB 行锁类型：**

| 锁 | 锁定范围 | 示例 |
|----|---------|------|
| 记录锁 | 精确锁定索引记录 | `SELECT ... FOR UPDATE` |
| 间隙锁 | 锁定索引记录之间的间隙 | 防止 INSERT |
| 临键锁 | 记录锁 + 间隙锁 | 默认（RR 隔离级别下） |

**幻读通过间隙锁解决：** 临键锁锁住记录和间隙，其他事务无法在间隙中插入新数据。

**死锁排查：**
```sql
-- 查看当前锁等待
SHOW ENGINE INNODB STATUS;
-- 查看最近死锁信息
SELECT * FROM information_schema.INNODB_TRX;
SELECT * FROM information_schema.INNODB_LOCKS;
SELECT * FROM information_schema.INNODB_LOCK_WAITS;
```

### 3.5 日志

| 日志 | 作用 | 内容 |
|------|------|------|
| redo log | 崩溃恢复 | 物理日志：记录页的修改 |
| undo log | 回滚 + MVCC | 逻辑日志：记录修改前的数据 |
| binlog | 主从复制 + 数据恢复 | 逻辑日志：记录 SQL 语句或行变更 |

**两阶段提交（redo log + binlog）：**
```
1. 执行器调用引擎 → 写数据到内存 + 写 redo log（prepare 状态）
2. 执行器写 binlog
3. 引擎提交 redo log（commit 状态）
```
保证 redo log 和 binlog 的一致性，崩溃恢复时根据 binlog 判断 redo log 是否提交。

---

## 四、SQL 优化实践

### 4.1 慢查询定位

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;  -- 超过 1 秒记录

-- 查看慢查询
SHOW VARIABLES LIKE 'slow_query%';
```

**分析工具：** mysqldumpslow、pt-query-digest（Percona Toolkit）

### 4.2 常见优化策略

**1. 分页优化（大偏移量）**
```sql
-- 差：全表扫描跳过大偏移量
SELECT * FROM user ORDER BY id LIMIT 1000000, 20;

-- 好：基于主键
SELECT * FROM user WHERE id > 1000000 ORDER BY id LIMIT 20;

-- 更好：子查询定位
SELECT * FROM user
WHERE id >= (SELECT id FROM user ORDER BY id LIMIT 1000000, 1)
ORDER BY id LIMIT 20;
```

**2. 大表 COUNT 优化**
```sql
-- InnoDB 下 COUNT(*) 需要遍历索引，大表很慢
-- 方案一：用 EXPLAIN 估算
EXPLAIN SELECT COUNT(*) FROM user;
-- 方案二：Redis 维护计数器
-- 方案三：汇总表定时统计
```

**3. Join 优化**
- 小表驱动大表
- 被驱动表的 Join 列必须有索引
- 避免 SELECT *，只取需要的列
- 超 3 表 Join 考虑拆分

---

# Redis 篇

## 一、数据结构与底层实现

### 1.1 五大数据类型

| 类型 | 操作 | 底层实现 | 适用场景 |
|------|------|---------|---------|
| String | SET/GET/INCR/DECR | SDS（简单动态字符串） | 缓存、计数器、分布式锁 |
| Hash | HSET/HGET/HGETALL | ziplist → hashtable | 对象存储（用户信息） |
| List | LPUSH/RPUSH/LPOP/BRPOP | quicklist | 消息队列、最新列表 |
| Set | SADD/SMEMBERS/SINTER | intset → hashtable | 标签、好友关系、去重 |
| ZSet | ZADD/ZRANGE/ZSCORE | ziplist → skiplist+dict | 排行榜、延迟队列 |

### 1.2 底层数据结构详解

**SDS（简单动态字符串）：**
- 记录了 len（长度）和 free（剩余空间），O(1) 取长度
- 空间预分配：扩展时预留额外空间，减少内存分配次数
- 惰性释放：缩短字符串时不立即回收空间
- 二进制安全：不用 `\0` 判断结尾

**ziplist（压缩列表）：** 连续内存块，元素紧凑排列。元素少且短时使用，内存效率高。

**quicklist（快速列表，3.2+）：** ziplist 组成的双向链表。每个节点是一个 ziplist，兼顾内存效率和操作效率。

**skiplist（跳表）：** 多层链表，查询 O(log n)。用于 ZSet 的范围查询。为什么不用红黑树？跳表实现更简单、范围查询更直观。

### 1.3 高级数据结构

| 类型 | 用途 |
|------|------|
| Bitmap | 签到打卡（SETBIT/GETBIT/BITCOUNT） |
| HyperLogLog | UV 统计（误差 0.81%，12KB 存 2^64 个值） |
| GEO | 附近的人（GEOADD/GEORADIUS） |
| Stream | 持久化消息队列，消费者组 |

---

## 二、缓存场景与问题

### 2.1 缓存穿透

**现象：** 查询不存在的数据，缓存和数据库都没有，每次请求穿透到数据库。

**解决方案：**
1. **布隆过滤器：** 将所有存在的 key 放入布隆过滤器，不存在直接返回
2. **缓存空值：** 对不存在的 key 缓存 null，设置短过期时间（30s-1min）
3. **参数校验：** 对明显非法的请求直接拦截（如 ID 为负数）

### 2.2 缓存击穿

**现象：** 热点 key 过期瞬间，大量请求同时打到数据库。

**解决方案：**
1. **互斥锁（分布式锁）：** 获取缓存失败 → 抢锁 → 抢到的查 DB 回写缓存 → 没抢到的等待重试
2. **逻辑过期：** 永不过期，value 中存逻辑过期时间。过期后异步更新，旧值继续用。
3. **热点数据永不过期**

### 2.3 缓存雪崩

**现象：** 大批量 key 同时过期，或 Redis 宕机，所有请求打到数据库。

**解决方案：**
1. **过期时间加随机值：** `EXPIRE key 3600 + random(0, 600)`，避免集中过期
2. **多级缓存：** L1（本地 Caffeine）+ L2（Redis）+ DB
3. **Redis 集群/哨兵：** 保证高可用
4. **限流降级：** Sentinel 限流 + Hystrix 熔断

### 2.4 缓存与数据库一致性

| 策略 | 描述 | 一致性 |
|------|------|--------|
| 先删缓存再写 DB | 删缓存 → 写 DB（→ 延迟双删） | 较弱 |
| 先写 DB 再删缓存 | 写完 DB → 删缓存（最常用） | 较强 |
| 先写 DB 再异步更新缓存 | 写完 DB → MQ 异步更新缓存 | 较强 |
| 监听 binlog 更新 | Canal 监听 binlog → 更新缓存 | 强 |

**延迟双删：** 先删缓存 → 写 DB → 延迟 N 毫秒 → 再删一次缓存。防止写 DB 期间有请求读到旧数据回写缓存。

**为什么是删缓存而不是更新缓存？**
1. 更新缓存的操作可能很少被读到，浪费
2. 并发写时可能导致更新顺序错误
3. 删除操作更简单，下次请求触发懒加载

---

## 三、持久化

### 3.1 RDB（快照）

**机制：** 定时将内存数据快照保存到磁盘（dump.rdb）。

**触发方式：**
- SAVE（阻塞主线程，不推荐）
- BGSAVE（fork 子进程，推荐）
- 自动触发：`save 900 1`（900 秒内 1 次修改）

**优点：** 文件紧凑、恢复快速、fork 子进程不影响主线程
**缺点：** 两次快照之间宕机会丢失数据、fork 子进程在数据量大时耗时长

### 3.2 AOF（追加日志）

**机制：** 记录每条写命令，重启时重放恢复数据。

**fsync 策略：**
| 策略 | 描述 | 性能 | 安全性 |
|------|------|------|--------|
| always | 每条命令都刷盘 | 最慢 | 最安全 |
| everysec | 每秒刷一次（默认） | 中等 | 最多丢 1 秒 |
| no | 操作系统决定 | 最快 | 最不安全 |

**AOF 重写：** BGREWRITEAOF 在后台 fork 子进程，合并冗余命令、压缩文件。

### 3.3 混合持久化（4.0+）

RDB 快照 + 快照后的增量 AOF。兼顾恢复速度和数据安全性。

**建议配置：** `aof-use-rdb-preamble yes`

---

## 四、集群

### 4.1 主从 + 哨兵

```
         ┌─ Sentinel 1 ─┐
         ├─ Sentinel 2 ─┼── 监控 + 选主 + 通知
         └─ Sentinel 3 ─┘

Master ←── 异步复制 ──→ Slave 1
                      → Slave 2
```

**哨兵三大任务：** 监控、自动故障转移、通知客户端新 Master

**主观下线 vs 客观下线：** 一个 Sentinel 认为下线是"主观"，超过 quorum 个 Sentinel 认为下线才是"客观"（确认故障）。

### 4.2 Cluster（集群）

**分片方式：** 16384 个 hash slot，CRC16(key) % 16384 决定属于哪个 slot。

**为什么是 16384？** 
- 心跳消息携带 slot 位图，16384 bits = 2KB，能放入一个 TCP 包
- 65536 bits = 8KB，心跳包太大

**故障转移：** 每个主节点配备从节点，主节点故障时从节点选举为新主。

---

## 五、其他高频问题

| 问题 | 答案 |
|------|------|
| 分布式锁怎么实现 | SET key value NX PX 30000；redisson 的 RedLock 方案（多节点加锁） |
| 大 Key 问题 | 一个 key 的 value 过大（如 hash 有百万字段）。危害：阻塞、内存不均。解决：拆分、定期清理 |
| 热 Key 问题 | 某个 key 被大量请求集中访问。解决：本地缓存 + 多副本（热 key 复制到多个分片） |
| Redis 为什么快 | 纯内存操作、单线程避免上下文切换和锁竞争、IO 多路复用（epoll）、高效数据结构 |
| Redis 6.0+ 多线程 | 只对网络 IO 和协议解析用多线程，命令执行仍是单线程（保证原子性） |
| 过期删除策略 | 惰性删除（访问时检查）+ 定期删除（每 100ms 随机抽 20 个 key 检查） |
| 内存淘汰策略 | noeviction / allkeys-lru / volatile-lru / allkeys-lfu / volatile-lfu 等 8 种 |

---

## 六、推荐的数据库学习路线

```
Week 1-2：MySQL 架构 + InnoDB 存储引擎 + 基本 SQL
Week 3-4：索引原理 + EXPLAIN + 索引优化实战
Week 5   ：事务 ACID + 隔离级别 + MVCC + 锁
Week 6   ：redo log / undo log / binlog + 两阶段提交
Week 7   ：Redis 五大数据类型 + 底层实现
Week 8   ：缓存穿透/击穿/雪崩 + 一致性方案
Week 9   ：持久化 RDB/AOF + 主从哨兵集群
Week 10  ：实战项目 + 高频面试题模拟
```
