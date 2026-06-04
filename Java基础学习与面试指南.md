# Java 基础学习与面试指南

---

## 一、基础语法

### 1.1 面向对象

**封装、继承、多态**

| 概念 | 说明 |
|------|------|
| 封装 | 隐藏内部实现，通过 public 方法暴露接口，保护数据不被随意修改 |
| 继承 | 子类复用父类代码，Java 单继承，可通过接口实现多继承效果 |
| 多态 | 同一方法调用在不同对象上表现不同行为，依赖方法重写 + 父类引用指向子类对象 |

**多态的实现条件：**
1. 有继承/实现关系
2. 子类重写父类方法
3. 父类引用指向子类对象：`Animal a = new Dog();`

**重载 vs 重写：**

| | 重载 (Overload) | 重写 (Override) |
|---|---|---|
| 发生位置 | 同一个类中 | 父子类之间 |
| 方法签名 | 方法名相同，参数列表不同 | 方法名、参数列表、返回值都相同 |
| 访问权限 | 无限制 | 子类不能比父类更严格 |
| 运行时确定 | 编译期确定（静态绑定） | 运行时确定（动态绑定） |

### 1.2 抽象类 vs 接口

| | 抽象类 | 接口 |
|---|---|---|
| 关键字 | abstract class | interface |
| 构造方法 | 可以有 | 不能有 |
| 成员变量 | 可以有任何类型 | 只能是 public static final 常量 |
| 方法 | 可以有抽象方法和具体方法 | Java 8+ 可以有 default/static 方法 |
| 继承 | 单继承 | 多实现 |
| 使用场景 | 共享代码 + 模板方法模式 | 定义行为契约 |

### 1.3 异常处理

```
Throwable
├── Error（不应该被捕获：OOM、StackOverflow）
└── Exception
    ├── RuntimeException（非受检：NPE、IndexOutOfBounds、ClassCast）
    └── 其他（受检异常：IOException、SQLException，必须显式处理）
```

**面试要点：**
- finally 不执行的情况：System.exit(0)、JVM 崩溃、守护线程退出
- try-with-resources（Java 7+）自动关闭实现了 AutoCloseable 的资源
- 异常链：通过 `new Exception("msg", cause)` 保留根因

### 1.4 泛型

**核心概念：类型擦除**

Java 泛型在编译后会擦除类型信息，替换为上限类型（默认 Object）。这意味着：
- `List<String>` 和 `List<Integer>` 在运行时是同一个 Class
- 不能 `new T()` 或 `instanceof T`
- 不能创建泛型数组 `new T[10]`

| 通配符 | 含义 | 场景 |
|--------|------|------|
| `<?>` | 未知类型 | 只能读，不能写（null 除外） |
| `<? extends T>` | 上界通配符 | 生产者：只能读不能写 |
| `<? super T>` | 下界通配符 | 消费者：可以写入 T 及其子类 |

**PECS 原则：** Producer Extends, Consumer Super

### 1.5 注解 & 反射

**常见元注解：**
- @Target：注解可以用在哪里（TYPE/METHOD/FIELD...）
- @Retention：注解保留到哪个阶段（SOURCE/CLASS/RUNTIME）
- @Inherited：子类是否继承父类注解

**反射常用 API：**
```java
Class<?> clazz = Class.forName("com.example.User");
// 获取所有构造方法、创建实例
Constructor<?> ctor = clazz.getDeclaredConstructor(String.class);
Object obj = ctor.newInstance("name");
// 获取私有字段并赋值
Field field = clazz.getDeclaredField("name");
field.setAccessible(true);
field.set(obj, "newName");
// 获取方法并调用
Method method = clazz.getDeclaredMethod("getName");
method.invoke(obj);
```

**面试要点：** 反射的性能开销（需要安全检查、无法内联优化），框架中大量使用（Spring DI、MyBatis 映射、JSON 序列化）。

---

## 二、JVM 内存模型

### 2.1 内存分区

```
JVM 运行时数据区
├── 线程共享
│   ├── 堆（Heap） ← 对象实例、数组 → GC 主要区域（Young/Old）
│   └── 方法区（元空间）← 类信息、常量、静态变量、JIT 编译缓存
└── 线程私有
    ├── 程序计数器 ← 当前线程执行的字节码行号
    ├── 虚拟机栈 ← 栈帧：局部变量表、操作数栈、动态链接、返回地址
    └── 本地方法栈 ← Native 方法调用
```

### 2.2 对象创建过程

1. **类加载检查：** 检查类是否已加载、链接、初始化
2. **分配内存：** 指针碰撞（Serial/ParNew）或空闲列表（CMS）
3. **初始化零值：** 将分配的内存空间初始化为零值
4. **设置对象头：** 设置 Mark Word、类型指针
5. **执行 init 方法：** 调用构造方法

### 2.3 对象内存结构

```
对象头 (Header)
├── Mark Word (8 字节) ← hashCode、GC 分代年龄、锁状态标志
└── Klass Pointer (4 字节，压缩) ← 指向方法区的类元数据
实例数据 (Instance Data) ← 各字段值
对齐填充 (Padding) ← 保证对象大小为 8 字节的倍数
```

### 2.4 GC 算法

| 算法 | 过程 | 优缺点 |
|------|------|--------|
| 标记-清除 | 标记存活对象 → 清除未标记 | 产生内存碎片；实现简单 |
| 标记-复制 | 将存活对象复制到另一块区域 | 无碎片但浪费一半内存；适合新生代 |
| 标记-整理 | 标记 → 将存活对象向一端移动 | 无碎片但耗时；适合老年代 |

**分代假说：**
- 弱分代假说：绝大多数对象朝生夕死 → 新生代用复制算法
- 强分代假说：熬过越多次 GC 的对象越难消亡 → 老年代用标记-整理算法

### 2.5 经典垃圾收集器

| 收集器 | 区域 | 算法 | 特点 |
|--------|------|------|------|
| Serial | 新生代 | 标记-复制 | 单线程，适合客户端 |
| ParNew | 新生代 | 标记-复制 | Serial 多线程版，配合 CMS |
| Parallel Scavenge | 新生代 | 标记-复制 | 关注吞吐量 |
| CMS | 老年代 | 标记-清除 | 低停顿，有碎片，已废弃 |
| G1 | 混合 | 标记-整理+复制 | 将堆划分为 Region，可预测停顿 |
| ZGC | 全堆 | 染色指针 | 超低延迟（<1ms），JDK 15+ 生产可用 |

### 2.6 类加载机制

**双亲委派模型：**
```
Bootstrap ClassLoader（加载 rt.jar）
    ↑
Extension ClassLoader（加载 ext/ 目录）
    ↑
Application ClassLoader（加载 classpath 下的类）
    ↑
自定义 ClassLoader
```

**工作流程：** 收到加载请求 → 先从缓存查找 → 委托父加载器 → 父加载不了才自己加载

**为什么要双亲委派：** 防止核心类被篡改（你自己写的 `java.lang.String` 不会被加载）

**打破双亲委派的例子：**
- Tomcat 的 WebAppClassLoader：每个 Web 应用隔离加载自己的类
- SPI 机制：`Thread.currentThread().getContextClassLoader()`

---

## 三、并发编程

### 3.1 线程基础

**线程生命周期：**
```
NEW → RUNNABLE → BLOCKED / WAITING / TIMED_WAITING → TERMINATED
```

| 状态 | 进入条件 | 退出条件 |
|------|---------|---------|
| BLOCKED | 等待 synchronized 锁 | 获得锁 |
| WAITING | Object.wait() / LockSupport.park() | notify() / unpark() |
| TIMED_WAITING | sleep(n) / wait(n) / join(n) | 超时或唤醒 |

**创建线程的三种方式：**

1. 继承 Thread 类（不推荐，单继承限制）
2. 实现 Runnable 接口（无返回值）
3. 实现 Callable + FutureTask（有返回值、可抛异常）

### 3.2 线程池

**ThreadPoolExecutor 七个参数：**

```java
new ThreadPoolExecutor(
    corePoolSize,      // 核心线程数
    maximumPoolSize,   // 最大线程数
    keepAliveTime,     // 空闲线程存活时间
    unit,              // 时间单位
    workQueue,         // 阻塞队列
    threadFactory,     // 线程工厂
    rejectionHandler   // 拒绝策略
);
```

**执行流程：**
```
提交任务 → 核心线程有空？→ 是 → 执行
                    → 否 → 队列满了？→ 否 → 入队等待
                                      → 是 → 线程数 < 最大？→ 是 → 创建新线程
                                                              → 否 → 执行拒绝策略
```

**四种拒绝策略：**
| 策略 | 行为 |
|------|------|
| AbortPolicy（默认） | 抛出 RejectedExecutionException |
| CallerRunsPolicy | 由提交任务的线程自己执行 |
| DiscardPolicy | 直接丢弃 |
| DiscardOldestPolicy | 丢弃队首任务，重新提交 |

**常用线程池（Executors）：**

| 方法 | 特点 | 风险 |
|------|------|------|
| newFixedThreadPool(n) | 固定线程数，无界队列 | OOM（队列无限增长） |
| newCachedThreadPool() | 弹性线程数，SynchronousQueue | CPU 过载（无限创建线程） |
| newSingleThreadExecutor() | 单一工作线程 | OOM（无界队列） |
| newScheduledThreadPool(n) | 定时/延迟任务 | |

> **阿里规约：** 不允许使用 Executors 创建线程池，必须通过 ThreadPoolExecutor 手动指定参数。

### 3.3 synchronized

**锁升级过程（JDK 1.6+）：**
```
无锁 → 偏向锁 → 轻量级锁（CAS 自旋）→ 重量级锁（系统调用）
```

| 阶段 | 适用场景 | 原理 |
|------|---------|------|
| 偏向锁 | 只有一个线程访问锁 | 在 Mark Word 记录线程 ID |
| 轻量级锁 | 线程交替访问 | CAS 替换 Mark Word，失败则自旋 |
| 重量级锁 | 多线程竞争激烈 | 操作系统 mutex，线程阻塞 |

**synchronized vs Lock：**

| | synchronized | Lock (ReentrantLock) |
|---|---|---|
| 类型 | 关键字，JVM 层面 | Java 类 |
| 锁获取 | 无法判断是否成功 | tryLock() 可尝试获取 |
| 公平性 | 非公平 | 可选公平/非公平 |
| 条件 | wait/notify 单一条件 | Condition 可多条件 |
| 释放 | 自动释放（代码块结束/异常） | 必须在 finally 中手动 unlock |

### 3.4 volatile

**两大作用：**
1. **保证可见性：** 一个线程修改 volatile 变量后，其他线程立即可见（强制刷新到主内存）
2. **禁止指令重排：** 通过内存屏障防止 JIT 优化重排序（单例模式 DCL 的关键）

**不保证原子性：** `count++` 不是原子操作（读-改-写），volatile 无能为力，需要用 AtomicInteger 或 synchronized。

### 3.5 CAS (Compare And Swap)

```java
// AtomicInteger 的核心
public final int getAndIncrement() {
    return U.getAndAddInt(this, VALUE, 1);
}
// Unsafe 类中的实现（JVM 内联为 CPU 原子指令）
```

**特点：**
- 优点：无锁，性能高
- 缺点：ABA 问题（解决：AtomicStampedReference 加版本号）、自旋浪费 CPU

### 3.6 ThreadLocal

**原理：** 每个线程内部有一个 ThreadLocalMap，key 是 ThreadLocal 的弱引用，value 是存的值。

**内存泄漏风险：** key 是弱引用会被 GC，但 value 是强引用，如果线程不结束（线程池场景），value 永远不会回收。

**解决：** 每次使用完调用 `remove()` 方法。

---

## 四、集合框架

### 4.1 整体架构

```
Collection
├── List（有序、可重复）
│   ├── ArrayList：数组实现，查询快 O(1)，插入删除慢 O(n)
│   ├── LinkedList：双向链表，插入删除快 O(1)，查询慢 O(n)
│   └── Vector：线程安全版 ArrayList，已过时
│       └── Stack
├── Set（无序、不可重复）
│   ├── HashSet：基于 HashMap，O(1) 增删查
│   ├── LinkedHashSet：维护插入顺序
│   └── TreeSet：基于 TreeMap，红黑树，元素有序 O(log n)
└── Queue
    ├── LinkedList（双向队列）
    ├── PriorityQueue（堆实现）
    └── BlockingQueue（线程安全）
        ├── ArrayBlockingQueue（有界）
        ├── LinkedBlockingQueue（可选有界）
        └── SynchronousQueue（无容量，直接传递）

Map
├── HashMap：数组+链表+红黑树，O(1)
├── LinkedHashMap：维护插入/访问顺序
├── TreeMap：红黑树，key 有序
├── ConcurrentHashMap：分段锁 → CAS+synchronized
└── Hashtable：线程安全版 HashMap，已过时
```

### 4.2 HashMap（面试重灾区）

**JDK 1.8 数据结构：**
```
数组 + 链表 + 红黑树

Node[] table
  ├── bucket[0] → Node → Node → TreeNode（链表超8且数组长度≥64转红黑树）
  ├── bucket[1] → Node → TreeNode → TreeNode
  └── ...
```

**put 流程：**
```
1. 计算 key 的 hashCode
2. (n - 1) & hash → 确定桶下标
3. 桶为空 → 直接放入
4. 桶不为空：
   - 第一个节点是目标？→ 直接覆盖
   - 是红黑树节点？→ 走红黑树插入
   - 否则遍历链表 → 有相同 key 则覆盖；到末尾则尾插（1.7是头插）
5. 插入后判断 size > threshold → resize()
```

**1.7 vs 1.8：**

| | JDK 1.7 | JDK 1.8 |
|---|---|---|
| 数据结构 | 数组 + 链表 | 数组 + 链表 + 红黑树 |
| 链表插入 | 头插法 | 尾插法 |
| 扩容时 | 可能产生环形链表（死循环） | 不会 |
| hash 计算 | 多次扰动 | 一次扰动 |
| 扩容时机 | size >= threshold | size > threshold |

**扩容机制：**
- 默认容量 16，负载因子 0.75
- 扩容为原来的 2 倍
- 扩容后重新计算每个元素的位置：原位置 或 原位置 + 旧容量

**为什么容量是 2 的幂？** 因为 `(n - 1) & hash` 替代 `hash % n`，位运算效率更高，且扩容时迁移更简单。

**为什么负载因子是 0.75？** 权衡空间利用率和 hash 冲突概率。0.75 时链表长度超过 8 的概率 < 千万分之一。

**为什么链表转红黑树阈值是 8？** 基于泊松分布计算，链表长度达到 8 的概率极低。如果阈值太小，频繁树化浪费资源。

### 4.3 ConcurrentHashMap

**1.7 分段锁（Segment）：**
```
Segment[] segments
  └── Segment → HashEntry[] table（每个 Segment 独立加锁）
```
锁粒度：Segment 级别，默认 16 个 Segment，并发度 16。

**1.8 CAS + synchronized：**
```
Node[] table
  ├── 空桶：CAS 写入（无锁）
  ├── 非空桶：synchronized 锁住桶的头节点
  └── 扩容时：多线程协同迁移（ForwardingNode 标记已迁移的桶）
```

| | 1.7 | 1.8 |
|---|---|---|
| 锁粒度 | Segment | 单个桶的头节点 |
| 查询 | 不需要加锁 | 不需要加锁 |
| 插入 | ReentrantLock | CAS + synchronized |
| size() | 三次不加锁计算，不一致再全锁 | 通过 baseCount + CounterCell 计算 |

### 4.4 TreeMap / TreeSet

基于**红黑树**实现，key 有序（自然顺序或 Comparator）。增删查 O(log n)。

**什么时候用 TreeMap 而不是 HashMap？** 需要排序/范围查询时。

### 4.5 LinkedHashMap

**基于 HashMap + 双向链表**，维护插入顺序（accessOrder=false）或访问顺序（accessOrder=true）。

**经典用途：** 实现 LRU 缓存。设置 accessOrder=true，重写 `removeEldestEntry()` 方法。

```java
new LinkedHashMap<K, V>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxSize; // 超出容量删除最老元素
    }
};
```

---

## 五、面试常见问题速查

| 问题 | 答案要点 |
|------|---------|
| HashMap 底层原理 | 数组+链表+红黑树，hash 定位桶，equals 判断 key，链表>8且数组>=64转红黑树 |
| HashMap 线程不安全的表现 | 1.7 扩容时环形链表导致 CPU 100%；1.8 数据覆盖丢失 |
| ConcurrentHashMap 如何保证安全 | CAS 写入空桶 + synchronized 锁头节点修改非空桶 |
| ArrayList vs LinkedList | 数组 vs 双向链表；查询 O(1) vs O(n)；插入删除 O(n) vs O(1)；CPU 缓存友好 vs 不友好 |
| HashSet 去重原理 | 基于 HashMap，元素作为 key，PRESENT 常量作为 value，equals + hashCode 去重 |
| JVM 内存模型 | 堆（对象）+ 方法区（类信息）+ 虚拟机栈 + 程序计数器 + 本地方法栈 |
| OOM 排查 | jps 找进程 → jmap -histo 看对象分布 → jmap:dump 生成 dump → MAT/JProfiler 分析 |
| CPU 100% 排查 | top 找进程 → top -H 找线程 → printf %x 转十六进制 → jstack 定位代码行 |
| Full GC 频繁怎么办 | jstat -gc 看 GC 频率 → 分析堆大小是否合理 → 是否有内存泄漏 → 考虑换 G1/ZGC |
| volatile 的作用 | 保证可见性 + 禁止指令重排；不保证原子性 |
| synchronized 锁升级 | 无锁 → 偏向锁 → 轻量级锁（CAS）→ 重量级锁 |
| ThreadPoolExecutor 参数 | 核心数、最大数、存活时间、队列、拒绝策略，结合 CPU/IO 密集场景设置 |
| 死锁四条件 | 互斥、持有并等待、不可剥夺、循环等待 → 破坏任一即可预防 |
| CAS 的 ABA 问题 | 加版本号（AtomicStampedReference）解决 |
| ThreadLocal 内存泄漏 | 线程复用场景下用完必须 remove，否则 value 无法被 GC |
| 类加载过程 | 加载 → 验证 → 准备 → 解析 → 初始化 → 使用 → 卸载 |
| String 不可变 | 底层 final char[]（JDK 8）/ final byte[]（JDK 9+）；好处：线程安全、字符串常量池、hashCode 缓存 |

---

## 六、推荐学习节奏

```
第1周：Java 基础语法过一遍 + 编写 CRUD 练手代码
第2周：面向对象深入（继承/多态/接口/抽象类）
第3周：异常处理 + 泛型 + 注解 + 反射
第4周：集合框架（HashMap 源码必读，ArrayList/LinkedList 对比）
第5周：JVM 内存模型 + 对象创建过程 + 类加载
第6周：GC 算法 + 垃圾收集器对比
第7周：并发基础（线程创建/状态/线程池）
第8周：synchronized/volatile/CAS/AQS/ThreadLocal
第9-10周：刷 LeetCode + 模拟面试 + 查漏补缺
```
