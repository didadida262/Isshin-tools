export type DiagramKind = 'mixer' | 'cascade' | 'complementary' | 'mos'

export interface StepItem {
  title: string
  body: string
  code?: string
}

export interface TheoryBlock {
  type: 'theory'
  title: string
  body: string
}

export interface StepsBlock {
  type: 'steps'
  title: string
  items: StepItem[]
}

export interface TableBlock {
  type: 'table'
  title: string
  caption?: string
  headers: string[]
  rows: string[][]
}

export interface FormulaBlock {
  type: 'formula'
  title: string
  expr: string
  note: string
}

export interface DiagramBlock {
  type: 'diagram'
  kind: DiagramKind
  title: string
}

export interface WarnBlock {
  type: 'warn'
  title: string
  items: string[]
}

export interface PitfallsBlock {
  type: 'pitfalls'
  items: { problem: string; fix: string }[]
}

export type StageBlock =
  | TheoryBlock
  | StepsBlock
  | TableBlock
  | FormulaBlock
  | DiagramBlock
  | WarnBlock
  | PitfallsBlock

export interface PrepItem {
  name: string
  spec: string
}

export interface PrepGroup {
  label: string
  items: PrepItem[]
}

export interface Stage {
  id: string
  index: string
  title: string
  hours: string
  goal: string
  deliverable: string
  prep: PrepGroup[]
  pass: string[]
  blocks: StageBlock[]
}

export const MIXER_MOTORS = [
  { id: 'M1', label: '左上', spin: 'CW', formula: 'T + Pitch − Roll + Yaw', pos: 'tl' },
  { id: 'M2', label: '右上', spin: 'CCW', formula: 'T + Pitch + Roll − Yaw', pos: 'tr' },
  { id: 'M3', label: '右下', spin: 'CW', formula: 'T − Pitch + Roll + Yaw', pos: 'br' },
  { id: 'M4', label: '左下', spin: 'CCW', formula: 'T − Pitch − Roll − Yaw', pos: 'bl' },
] as const

export const STAGES: Stage[] = [
  {
    id: 'prep',
    index: '0',
    title: '开工准备',
    hours: '1 个周末',
    goal: '板子能烧录、灯会闪、串口能说话。没有这三件事，后面所有「读传感器」都是空谈。',
    deliverable: '一台已点亮的 STM32，电脑串口助手里每秒一行心跳。',
    prep: [
      {
        label: '本阶段桌上要有',
        items: [
          { name: '主控', spec: 'STM32F411CEU6 最小系统（或 F401）；带板载 LED' },
          { name: '下载器', spec: 'ST-Link V2，杜邦线接 SWDIO / SWCLK / GND / 3V3' },
          { name: 'USB-TTL', spec: 'CH340 或 CP2102；交叉收发，与 MCU 共地' },
          { name: '电脑', spec: '能跑 STM32CubeIDE，或 arm-none-eabi-gcc + OpenOCD' },
        ],
      },
      {
        label: '软件',
        items: [
          { name: 'IDE / 工具链', spec: 'CubeIDE 或 gcc；CubeMX 开 FPU、SysTick 1 ms' },
          { name: '串口助手', spec: '115200 8N1，例如 PuTTY、串口调试助手、minicom' },
        ],
      },
      {
        label: '建议一次买齐（1–4 阶段会用到）',
        items: [
          { name: 'IMU', spec: 'MPU6500（SPI）优先，否则 MPU6050（I2C）' },
          { name: '3.3 V LDO', spec: 'AMS1117-3.3；IMU 和 MCU 用它，不要 5 V' },
          { name: '电机 ×4', spec: '0720 / 0820 空心杯' },
          { name: 'MOS ×4', spec: 'SI2302，另备 100 Ω 栅极电阻、10 kΩ 下拉各 4 只' },
          { name: '机架 / 桨', spec: '75 mm 塑料架 + 正反塑料桨；本阶段先不装' },
          { name: '1S 电池', spec: '3.7 V 300–500 mAh；本阶段用 ST-Link/USB 供电即可' },
          { name: '输入', spec: '两只 10 k 电位器，或带开关的遥控接收机' },
        ],
      },
      {
        label: '本阶段不要接',
        items: [
          { name: '电机 / 桨 / 动力电池', spec: '闪灯和串口阶段禁止上动力，避免浮空 PWM 抽转' },
        ],
      },
    ],
    pass: [
      'ST-Link 能稳定下载，复位后程序还在',
      '板载 LED 约 1 Hz 闪烁',
      '115200 8N1 能看到周期输出，例如 ok 123',
    ],
    blocks: [
      {
        type: 'theory',
        title: '这条路在造什么',
        body: '做一台 75 mm、1S 空心杯微型四轴，飞控从芯片写起：不买 Pixhawk，也不刷 Betaflight / PX4。毕业标准只有一条——解锁后离地约 10 cm，能平稳悬停数秒。没有 GPS、没有图传、没有定高；先把「姿态稳定」这条最小闭环打通。',
      },
      {
        type: 'warn',
        title: '全程有效的安全规则',
        items: [
          '固件上电默认 Disarmed，四路 PWM 必须为 0。解锁是开关或指令，不是通电。',
          '装桨之前，所有电机试验都在「不装桨」下做。',
          '只许塑料桨。第一次带桨在纸箱 / 护网里，人在桨盘平面之外。',
          '1S 锂电单独充，不串联、不看管充电、鼓包即停。',
        ],
      },
      {
        type: 'table',
        title: '一次买齐明细（含用途）',
        caption: '推荐 STM32F411「黑药丸」：Flash / RAM 比 F401 宽，后面加地面站协议不至于抠字节。',
        headers: ['物料', '规格', '数量', '为什么要它'],
        rows: [
          ['主控', 'STM32F411CEU6 最小系统（Cortex-M4 + FPU）', '1', '浮点姿态解算；FPU 不是可选项'],
          ['下载器', 'ST-Link V2（SWD）', '1', '烧录与单步调试'],
          ['IMU', 'MPU6500（SPI）优先；否则 MPU6050（I2C）', '1', '角速度 + 加速度；不要指望模块自带的 DMP'],
          ['电机', '0720 或 0820 空心杯', '4', '1S 下可用 MOS 直驱，不必上无刷电调'],
          ['机架 / 桨', '75 mm 塑料架 + 一对正反桨', '1 套', '轻、摔得起；碳桨留到你不再切手指'],
          ['MOS', 'SI2302 N 沟道，逻辑电平', '4', 'PWM 开关电池到电机的通路'],
          ['电源', '1S 3.7 V 300–500 mAh + 3.3 V LDO（AMS1117-3.3 即可）', '1+1', '电机走电池，MCU/IMU 必须 3.3 V，不要 5 V 喂 MPU'],
          ['USB-TTL', 'CH340 / CP2102', '1', '日志与之后的浏览器地面站'],
          ['调试输入', '两只 10 k 电位器，或任意带开关的遥控器接收机', '2+', '前期模拟 Roll / Pitch / 油门'],
        ],
      },
      {
        type: 'steps',
        title: '动手：工具链与第一份固件',
        items: [
          {
            title: '装工具',
            body: 'Windows / macOS 用 STM32CubeIDE 最省事；习惯命令行就用 arm-none-eabi-gcc + OpenOCD。核心只要能编译、能通过 SWD 下载。',
          },
          {
            title: '新建工程',
            body: '芯片选 STM32F411CEUx（或你手上的 F401）。时钟树拉到 84 或 100 MHz。在 CubeMX 里打开 FPU（-mfpu=fpv4-sp-d16 -mfloat-abi=hard），否则后面四元数会又慢又气。SysTick 保持 1 ms。',
          },
          {
            title: '接线：先不要焊飞机',
            body: 'SWD：SWDIO、SWCLK、GND、3V3。串口：MCU TX → USB-TTL RX，MCU RX → USB-TTL TX，共地。推荐 USART1：PA9=TX、PA10=RX，115200 8N1。板载 LED 按丝印接推挽输出。',
          },
          {
            title: '程序 A：闪灯',
            body: '主循环里翻转 LED，HAL_Delay(500)。能闪说明时钟、下载、复位都正常。',
            code: 'while (1) {\n  HAL_GPIO_TogglePin(LED_GPIO_Port, LED_Pin);\n  HAL_Delay(500);\n}',
          },
          {
            title: '程序 B：串口心跳',
            body: '把 printf 重定向到 USART（_write 或 fputc）。不要在这步接电机。能看到计数增加，才进入下一阶段。',
            code: 'uint32_t n = 0;\nwhile (1) {\n  printf("ok %lu\\r\\n", (unsigned long)n++);\n  HAL_Delay(1000);\n}',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: 'ST-Link 连上但下载失败', fix: '核对 GND；BOOT0 接地；换一根短线；CubeIDE 里接口选 SWD 不是 JTAG。' },
          { problem: '串口乱码', fix: '波特率双方都是 115200；USB-TTL 与 MCU 交叉收发；共地。' },
          { problem: 'printf 无输出', fix: '检查 TX 脚是否配成 USART；半主机不要开；确认重定向写的是同一个 huart。' },
        ],
      },
    ],
  },
  {
    id: 'imu',
    index: '1',
    title: '读到 IMU',
    hours: '约 1 周',
    goal: '从寄存器读出加速度和角速度，并完成陀螺零偏校准。后面所有滤波都建立在这组数是对的。',
    deliverable: '串口能打印 ax ay az gx gy gz；板子静置时陀螺三轴接近 0。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '可下载的工程', spec: 'LED 能闪，USART 115200 能打印心跳' },
          { name: 'SWD + USB-TTL', spec: '接线保持阶段 0，本阶段只加 IMU' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: 'IMU 模块', spec: 'MPU6500 或 MPU6050；VCC 只接 3.3 V' },
          { name: 'LDO 3.3 V', spec: '给 IMU（和 MCU 若不再用 ST-Link 供电）' },
          { name: 'I2C 上拉', spec: '4.7 kΩ ×2 到 3.3 V；模块板载已有可不再加' },
          { name: '洞洞板 / 杜邦线', spec: '先别焊上机架，方便改轴、换线' },
          { name: '数据手册', spec: 'MPU-6000/6050 或 MPU-6500 Register Map PDF' },
        ],
      },
      {
        label: '软件',
        items: [
          { name: 'CubeMX', spec: '打开 I2C1（PB6/PB7）或 SPI；速率先 400 kHz / 1–8 MHz' },
          { name: 'HAL I2C/SPI', spec: '能 Mem_Read / 读 14 字节即可，不要启用 DMP 库' },
        ],
      },
      {
        label: '本阶段不要接',
        items: [
          { name: '电机与 MOS', spec: '振动和总线干扰会让你误判 IMU；静置数据先做干净' },
        ],
      },
    ],
    pass: [
      'WHO_AM_I 读到 0x68（MPU6050）或 0x70 / 0x72（MPU6500 / 9250 一类）',
      '静置 1000 组后写入 offset，之后 gx/gy/gz 在 ±1 °/s 量级晃',
      '绕机头滚转、绕右翼俯仰，对应轴的陀螺符号符合右手系，而不是三轴一起乱跳',
    ],
    blocks: [
      {
        type: 'theory',
        title: '先把轴说死',
        body: '机体坐标系（Body）：X 朝机头，Y 朝右，Z 朝下（NED 习惯）。陀螺、加速度计输出的是机体轴上的量。人说的「水平、朝北」是导航系。现在只要求水平姿态，但轴如果装反，阶段 4 的混控会整机反号，你会以为 PID 坏了。焊 IMU 时让芯片 +X 对机头、+Y 对右翼，丝印对不上就在软件里交换/取反，不要既改焊又改符号。',
      },
      {
        type: 'theory',
        title: '两个传感器各自会骗人',
        body: '陀螺仪测角速度 ω，单位 °/s。它几乎一定有零偏（Bias）：完全不动，输出也不是 0。你拿它积分得到角度，几秒后必漂。加速度计测的是比力（含重力）。静置时它能告诉你哪边是「下」，但电机一转，高频振动会把它打成一团噪声。所以：静置看加计，转动看陀螺，谁也不单独当姿态用。',
      },
      {
        type: 'table',
        title: 'IMU 接线（3.3 V，禁止 5 V）',
        headers: ['MPU 脚', '接到', '注意'],
        rows: [
          ['VCC', '3.3 V LDO 输出', '和电机电池不是同一条未稳压线'],
          ['GND', 'MCU GND', '必须共地'],
          ['SCL / SCLK', 'I2C：PB6；SPI：选一条 SCK', 'I2C 记得 4.7 k 上拉到 3.3 V（模块自带可不再加）'],
          ['SDA / MOSI·MISO', 'I2C：PB7；SPI：对应 MOSI/MISO', 'SPI 另接 CS'],
          ['AD0', 'GND → I2C 地址 0x68', '接 VCC 则变成 0x69'],
          ['INT', '可先悬空', '数据就绪中断留到阶段 5 再接'],
        ],
      },
      {
        type: 'steps',
        title: '动手：唤醒、验身、读 RAW',
        items: [
          {
            title: '不要开 DMP',
            body: '模块教程里「直接出欧拉角」走的是 InvenSense DMP。那是黑盒，本教程禁用。我们只读原始寄存器。',
          },
          {
            title: '唤醒',
            body: 'MPU 上电默认睡眠。对 PWR_MGMT_1（0x6B）写 0x00。再读 WHO_AM_I（0x75）。对不上就先别往下写滤波——地址、接线或电平有问题。',
            code: '#define MPU_ADDR  (0x68 << 1)\n#define REG_PWR   0x6B\n#define REG_WHO   0x75\n#define REG_DATA  0x3B   /* accel(6) + temp(2) + gyro(6) */\n\nuint8_t zero = 0, id = 0;\nHAL_I2C_Mem_Write(&hi2c1, MPU_ADDR, REG_PWR, 1, &zero, 1, 50);\nHAL_Delay(50);\nHAL_I2C_Mem_Read(&hi2c1, MPU_ADDR, REG_WHO, 1, &id, 1, 50);\nprintf("WHO=0x%02X\\r\\n", id);',
          },
          {
            title: '一次读 14 字节',
            body: '从 0x3B 起连续读：ax ay az temp gx gy gz，各 16 位大端。量程先用默认：加速度 ±2 g（16384 LSB/g），陀螺 ±250 °/s（131 LSB/(°/s)）。',
            code: 'int16_t be16(uint8_t h, uint8_t l) {\n  return (int16_t)((h << 8) | l);\n}\nfloat ax = be16(b[0], b[1]) / 16384.0f;   /* g */\nfloat gx = be16(b[8], b[9]) / 131.0f;     /* deg/s */',
          },
          {
            title: '零偏校准（只校陀螺）',
            body: '板子放平、不动，采 1000 组 gx/gy/gz 取平均，存成 offset，之后每次采样减去它。加速度计的静置值主要是重力，不要当零偏扣掉，否则「哪边是下」就没了。',
            code: 'for (int i = 0; i < 1000; i++) {\n  read_imu();\n  ox += gx; oy += gy; oz += gz;\n  HAL_Delay(2);\n}\nox /= 1000.f; oy /= 1000.f; oz /= 1000.f;',
          },
          {
            title: '轴映射核对',
            body: '串口打印 6 个数。滚转（右翼向下）应主要动 X 轴陀螺且为正；俯仰（机头抬起）应主要动 Y 轴。对不上就改软件映射，并在注释里写死「芯片丝印 → 机体」。',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: 'WHO_AM_I 全 0 或全 FF', fix: 'I2C 上拉、共地、3.3 V、地址 0x68/0x69、线不要超过十几厘米。用逻辑分析仪看有没有 ACK。' },
          { problem: '静置陀螺仍有几十 °/s', fix: '校准期间板子真的静止；校准代码是否在唤醒之后；有无把加速度误当成陀螺。' },
          { problem: '电机附近 I2C 经常 NACK', fix: '换 MPU6500 走 SPI；或 IMU 与 MOS 分地、加去耦电容。这是阶段 4 才爆的雷，现在先把静置数据做干净。' },
        ],
      },
    ],
  },
  {
    id: 'attitude',
    index: '2',
    title: '算出姿态',
    hours: '约 1 周',
    goal: '把 RAW 融合成可用的 Pitch / Roll。手持机架转动，串口里的角要跟手走；放下后不明显漂。',
    deliverable: '以固定周期（建议 500 Hz–1 kHz）输出 Pitch、Roll；Yaw 可打印但本阶段不作为过关项。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '校准后的 RAW', spec: 'WHO_AM_I 正确；静置陀螺 ≈ 0；轴映射已写进注释' },
          { name: '同一块 IMU 板', spec: '不要更换安装方向，否则阶段 1 的符号作废' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: '硬件无新增', spec: '仍用阶段 1 的 MCU + IMU + 串口，不接电机' },
          { name: '一块能放平的桌面', spec: '静置测漂移；手持绕单轴慢转核对 Pitch/Roll' },
        ],
      },
      {
        label: '软件',
        items: [
          { name: '硬件定时器', spec: '500 Hz 或 1 kHz 中断/标志；禁止再用 HAL_Delay 当 dt' },
          { name: 'math.h / arm_math', spec: 'atan2f、sqrtf；FPU 必须已在阶段 0 打开' },
          { name: '串口绘图（可选）', spec: 'Arduino Serial Plotter、Serial Studio，50 Hz 打 Pitch,Roll' },
        ],
      },
    ],
    pass: [
      '静置接近 0°/0°（数度以内，取决于安装水平）',
      '手动倾斜约 45°，读数同方向、量级接近，松手回到水平',
      '静置 10 s，Pitch/Roll 漂移小于约 2°',
    ],
    blocks: [
      {
        type: 'theory',
        title: '为什么必须融合',
        body: '陀螺积分：短时间准，长时间漂（高频好、低频差）。加速度计用重力算倾角：长时间准，一抖就花（低频好、高频差）。欧拉角直观，但有万向节锁，飞控内部用四元数更新，对外再转成 Pitch/Roll 方便看。无磁力计时 Yaw 不可观，会自己转——最小闭环只盯水平姿态。',
      },
      {
        type: 'diagram',
        kind: 'complementary',
        title: '先写一阶互补滤波（用来建立直觉）',
      },
      {
        type: 'steps',
        title: '动手：先出角，再换四元数',
        items: [
          {
            title: '用定时器卡住 dt',
            body: '不要用 HAL_Delay 当控制周期。用硬件定时器或 SysTick 计数，在 500 Hz 或 1 kHz 里读 IMU、算姿态。dt 必须是真实秒，例如 0.001。dt 漂，滤波器就会漂。',
          },
          {
            title: '加速度计倾角',
            body: '板子相对水平的 Pitch/Roll，可用重力在机体轴上的分量。写的时候以你的轴定义为准，先在静置和「只绕一个轴慢转」下核对，再复制网上的 atan2 公式。',
          },
          {
            title: '互补滤波打通',
            body: '串口 50 Hz 打印 Pitch、Roll（控制环仍是 500 Hz+，打印降频，避免 printf 堵死）。用手滚、俯，确认方向。这一步过了再上四元数，否则后面全是符号战争。',
          },
          {
            title: '四元数积分 + Mahony',
            body: '用校准后的 ω 按 dt 更新 q，归一化。把加速度计单位化，与「四元数预测的重力方向」做叉积得到误差，PI 反馈到陀螺（这就是 Mahony 的核心）。Kp 先小，Ki 更小。EKF 不是悬停前置条件，有余力再加。',
          },
          {
            title: '对外输出欧拉角',
            body: 'q → Pitch/Roll 只为人和地面站看。控制内环下一阶段仍吃陀螺角速度，不要用欧拉角差分冒充角速度。',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: '一倾斜读数就翻到 90° 或跳变', fix: '加速度计量程/单位混用（g 和 m/s²）；atan2 参数顺序；归一化前模接近 0。' },
          { problem: '方向对但静置狂漂', fix: '陀螺 offset 没减；dt 偏大或偏小；α 太接近 1；Mahony Ki 过大。' },
          { problem: 'Yaw 一直走', fix: '正常。没有磁力计就不要用 Yaw 做闭环。' },
        ],
      },
    ],
  },
  {
    id: 'power',
    index: '3',
    title: '电机听指挥',
    hours: '约 1 周',
    goal: '四路 PWM 能转空心杯，混控符号正确，未解锁时电机死寂。这一阶段结束时飞机还不能飞，但动力链必须可预测。',
    deliverable: '不装桨：油门电位器能同时加四路转速；点 Roll/Pitch/Yaw 时对角或相邻差速符合混控；Disarm 立刻停转。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '可用的 Pitch/Roll', spec: '手持转动跟手走，静置 10 s 漂移小于约 2°' },
          { name: '固定控制周期', spec: '姿态环已在 500 Hz+ 跑，不要在这阶段改回 Delay' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: '空心杯 ×4', spec: '0720 / 0820；先不装桨' },
          { name: 'SI2302 ×4', spec: 'N 沟道逻辑电平 MOS' },
          { name: '电阻', spec: '栅极 100 Ω ×4，Gate 下拉 10 kΩ ×4' },
          { name: '1S 电池', spec: '3.7 V 300–500 mAh；电机走 VBAT，MCU/IMU 仍走 3.3 V LDO' },
          { name: '机架或洞洞板', spec: '四电机能固定相对位置；可先不装上 75 mm 架' },
          { name: '油门 + 解锁', spec: '一只电位器做油门；拨码/按键/第二只电位器做 Arm' },
          { name: 'Roll/Pitch 输入', spec: '再两只电位器，或接收机通道；本阶段用来看差速，不求飞' },
        ],
      },
      {
        label: '工具',
        items: [
          { name: '烙铁 / 焊锡', spec: 'MOS 和电机引线必须焊死，杜邦线扛不住振动' },
          { name: '示波器（可选）', spec: '看 20 kHz PWM 和 Gate 波形；没有就先用听啸叫、摸轴' },
        ],
      },
      {
        label: '本阶段不要接',
        items: [
          { name: '螺旋桨', spec: '全部转向和混控试验在裸轴上做完再进入阶段 4' },
        ],
      },
    ],
    pass: [
      '上电及复位后电机静止，必须显式解锁才转',
      'PWM 约 10–21 kHz，空心杯无明显啸叫',
      '相邻电机转向相反（正反桨预备），符号与混控图一致',
    ],
    blocks: [
      {
        type: 'theory',
        title: 'PWM 在干什么',
        body: '定时器按占空比开关 MOS。电机电感看到的是平均电压。空心杯电感很小，频率低于大约 10 kHz 会啸叫、推力发虚；高于约 21 kHz 对 SI2302 开关损耗上升。先定 20 kHz。SI2302 + 1S 只够空心杯，不要接无刷或 2S。',
      },
      {
        type: 'diagram',
        kind: 'mos',
        title: '一路动力的接法（×4）',
      },
      {
        type: 'steps',
        title: '动手：先转一路，再混四路',
        items: [
          {
            title: '焊 MOS 之前再读一遍',
            body: '电机一端接 VBAT，另一端接 Drain；Source 接电池负极/GND；Gate 经 100 Ω 接 PWM 脚，并加 10 kΩ 下拉到 GND，防止 MCU 复位期间 Gate 浮空导致爆转。MCU 与电池共地。',
          },
          {
            title: '配置定时器',
            body: '四路 PWM，建议同一时基。ARR 与 PSC 算出 20 kHz。CCR=0 对应停转。先不装桨，单路 10% 占空比，手指轻触轴确认会转。',
          },
          {
            title: '状态机：Disarm 是默认态',
            body: 'armed==false 时四路 CCR 强制 0，混控结果也丢掉。解锁条件：例如开关高电平且油门在底部。任何看门狗、电压过低、IMU 读失败，都回到 Disarm。',
            code: 'if (!armed) {\n  m1 = m2 = m3 = m4 = 0;\n} else {\n  /* mixer then clamp 0..100 */\n}\nset_pwm(m1, m2, m3, m4);',
          },
          {
            title: '实现混控',
            body: 'X 型：油门是公共项；俯仰/滚转是对角差速；偏航靠正反桨反扭。先按下面的图做，若飞机往错误方向「帮倒忙」，只改这一层符号，不要同时改 IMU 映射。',
          },
        ],
      },
      {
        type: 'diagram',
        kind: 'mixer',
        title: '混控矩阵（点选电机看公式）',
      },
      {
        type: 'steps',
        title: '核对转向',
        items: [
          {
            title: '相邻反向',
            body: 'M1、M3 顺时针，M2、M4 逆时针（俯视）。只给 Yaw 一个小正指令，机身应有绕 Z 的反扭趋势，而不是四桨同向把架子拧起来。转向错了换电机线或改对应通道取反。',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: '上电电机抽搐', fix: 'Gate 下拉；上电默认 CCR=0；CubeMX 里 PWM 极性；先初始化定时器再使能输出。' },
          { problem: '一路转三路不转', fix: '逐通道示波器看 PWM；MOS 是否焊反；电机是否虚焊。' },
          { problem: '解锁后四桨同向转', fix: '这是转向问题不是 PID 问题。先停在这一阶段，装桨后会打转或侧翻。' },
        ],
      },
    ],
  },
  {
    id: 'pid',
    index: '4',
    title: '闭环悬停',
    hours: '约 1–2 周',
    goal: '串级 PID 让飞机自己把水平稳住，并完成第一次离地约 10 cm 的悬停。调参顺序错了会像「PID 坏了」。',
    deliverable: '单轴台上内环能阻尼、外环能回水平；解开后慢推油门，离地短暂平稳悬停。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: 'Disarm 默认', spec: '上电电机静止；显式解锁才转' },
          { name: '混控与转向', spec: '相邻反向；点 Roll/Pitch/Yaw 差速方向正确' },
          { name: '姿态与陀螺', spec: '内环吃校准后的 ω，外环吃 Pitch/Roll，单位统一（建议度）' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: '塑料桨（正反）', spec: '只此一次开始装桨；碳桨不用' },
          { name: '单轴台材料', spec: '轴承、扎带、或左右拉线，让飞机只剩 Roll 或 Pitch 一个自由度' },
          { name: '围栏', spec: '纸箱、护网或亚克力挡片；人在桨盘平面之外' },
          { name: '护目镜', spec: '调参时桨可能打到台子碎片' },
          { name: '满电 1S', spec: '另备一块；电压低时同一套 PID 会翻，不要低电硬调' },
          { name: '配平胶带', spec: '重心尽量落在几何中心；热熔胶固定松动的线' },
        ],
      },
      {
        label: '输入仍用上一阶段的',
        items: [
          { name: '油门 / 解锁 / 横滚俯仰', spec: '摇杆中位 = 0°，满打限 ±30°；解锁开关手放得到' },
        ],
      },
    ],
    pass: [
      '内环单独工作时，拨动机臂会抵抗并停住，而不是振荡发散',
      '加上外环后，机臂能自己回到水平',
      '护网内离地约 10 cm，不立即翻，能维持数秒（允许慢慢飘，不允许乱翻）',
    ],
    blocks: [
      {
        type: 'theory',
        title: '为什么是两层环，而不是一个 PID 啃角度',
        body: '外环（角度）：输入「想要的倾角」（遥控器，建议先限 ±30°），输出「想要的角速度」。先用 P 就够。内环（角速度）：输入该角速度，输出给混控的 Roll/Pitch/Yaw 通道。内环直接吃陀螺，通常 500 Hz–1 kHz，D 用来抑振，I 用来消机架和电机不对称。油门不经过姿态环，手推高度。',
      },
      {
        type: 'diagram',
        kind: 'cascade',
        title: '数据怎么走',
      },
      {
        type: 'formula',
        title: '每个环都可以先写成这个形',
        expr: 'u = Kp·e + Ki·∫e dt − Kd·dμ/dt',
        note: 'e = 设定 − 测量。微分打在测量 μ 上（陀螺或角度），避免摇杆阶跃把 D 打爆。积分必须限幅，Disarm 时清零，否则下次解锁会满油门甩桨。',
      },
      {
        type: 'steps',
        title: '动手：台子上调，再离地',
        items: [
          {
            title: '做单轴台',
            body: '用轴承、扎带或两根线，把飞机只留下 Roll 或 Pitch 一个自由度。装塑料桨，周围挡起来。油门刚够克服一点重力或只做水平纠正，不要先给满油门。',
          },
          {
            title: '只开内环',
            body: '外环输出强制 0（期望角速度 = 0，即「别转」）。Kp 从很小加到拨动后有明显阻尼；出现振荡就加一点 Kd 或把 Kp 退回。I 最后加，能消掉「松手后慢慢溜走」即可，宁小勿大。',
          },
          {
            title: '再开外环 P',
            body: '期望角 = 0（水平）。角度误差 × Kp_angle 作为内环设定。机臂应自己回水平。外环先不要 I。摇杆映射：中位 0°，满打 ±30°。',
          },
          {
            title: '换另一个轴，重复',
            body: 'Roll 稳了再绑 Pitch。不要两个轴一起从零调。',
          },
          {
            title: '全自由、低高度',
            body: '护网或纸箱。油门从 0 慢推到刚离地（1S 空心杯常见在中等油门，以你的桨和重量为准）。人的手放在 Disarm 上。飘可以接受，翻或自激立刻停。能维持约 10 cm 数秒，本教程的最小闭环就算打通。',
          },
        ],
      },
      {
        type: 'warn',
        title: '带桨之后',
        items: [
          '先 Disarm 再碰飞机。不要用手停还在转的桨。',
          '电压 sag 会让同一套 PID 下午能飞、晚上翻——电量低就收工。',
          '改 IMU 安装或混控符号之后，PID 参数作废，回到单轴台。',
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: '一解锁就满功率抽搐', fix: '积分没清；Disarm 时没切零；角度单位用了弧度却按角度调。' },
          { problem: '水平会，一离地就翻', fix: '混控与 IMU 轴相反；重心不在几何中心；内环在台子上其实还在振荡，被架子挡着看不出来。' },
          { problem: '能悬停但一直自转', fix: 'Yaw 先把增益降到几乎为零；正反桨装反也会造成偏航失控。' },
        ],
      },
    ],
  },
  {
    id: 'gcs',
    index: '5',
    title: '看得见到能改',
    hours: '余下 1–2 周',
    goal: '控制环不再被 printf 拖死；浏览器能看姿态、看曲线、改 PID 而不必每次重烧。',
    deliverable: '1 kHz 级内环仍在中断或高优先级循环里；Chrome 连上串口后，3D 姿态同步，参数可回写。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '能悬停的固件', spec: '护网里 10 cm 数秒；先保存一份「能飞」的 HEX/ELF 再改调度' },
          { name: 'USB-TTL', spec: '地面站和飞控共用这根串口；调试时关掉占用它的串口助手' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: 'Chromium 浏览器', spec: 'Chrome 或 Edge；Safari / Firefox 没有 Web Serial' },
          { name: '一台能开静态页的环境', spec: '任意 live server，或直接本地 HTML；要 Three.js + 读串口' },
          { name: '示波器或空闲 GPIO（可选）', spec: '翻转引脚测量 1 kHz 间隔，确认打印没有拖垮内环' },
        ],
      },
      {
        label: '软件',
        items: [
          { name: 'USART DMA 或环形缓冲', spec: '遥测 50 Hz 一行 ASCII；控制环里禁止阻塞 printf' },
          { name: 'Three.js / Chart', spec: '先立方体跟姿态，再画设定 vs 实际；滑条回写 PITCH_KP=…' },
        ],
      },
    ],
    pass: [
      '打开地面站后飞机仍能按阶段 4 的标准悬停（遥测不得拖垮控制）',
      'Pitch/Roll 曲线能同时看到设定与测量',
      '改一个 P 值，不必重新下载固件即可生效（掉电可先不保存）',
    ],
    blocks: [
      {
        type: 'theory',
        title: '把「必须准时」和「给人看」拆开',
        body: '1 kHz：只做 IMU、姿态、内环 PID、写 CCR。这里禁止阻塞打印。约 100 Hz：摇杆 / 遥控解码、外环、状态机。约 10–50 Hz：电压、打包遥测。SysTick 或一个主定时器当节拍，用 flag 或简单调度，不要在 1 kHz 里跑 Three.js 那套逻辑——那是电脑的事。',
      },
      {
        type: 'steps',
        title: '动手：协议要笨，链路要稳',
        items: [
          {
            title: '先改调度',
            body: '把阶段 4 能飞的主循环拆成上述三档。用示波器或 GPIO 翻转测量内环间隔，抖动应远小于 1 ms。',
          },
          {
            title: '下行遥测',
            body: 'ASCII 即可，例如 50 Hz 一行：t,pitch,roll,p_sp,r_sp,gx,gy,thr,armed。用逗号，用 \\n。人能在串口助手里读，浏览器也好拆。',
          },
          {
            title: '上行改参',
            body: '一行一个命令，例如 PITCH_KP=0.8。解析失败就忽略。改完清一下积分。需要掉电保存再用 Flash 页，可后做。',
          },
          {
            title: '浏览器地面站',
            body: '仅 Chromium 支持 Web Serial。页面申请串口、读行、用 Three.js 转一个立方体（先不要做精模）。Chart.js 或自己画 Canvas：设定 vs 实际。滑条改 Kp 后通过串口写回。',
          },
        ],
      },
      {
        type: 'table',
        title: '建议的节拍',
        headers: ['频率', '做什么', '不准做什么'],
        rows: [
          ['1 kHz', '读 IMU、姿态、内环、PWM', 'printf、等待 HAL 超时、浮点大循环'],
          ['100 Hz', '外环、遥控、解锁状态机', '重的字符串格式化'],
          ['10–50 Hz', '电压、遥测发送', '插入到内环里「顺便打一条」'],
        ],
      },
      {
        type: 'pitfalls',
        items: [
          { problem: '一开地面站 PID 变烂', fix: '打印或 DMA 没配好导致 1 kHz 丢失；把波特率提高到 230400/460800，或减遥测字段。' },
          { problem: 'Web Serial 点了没反应', fix: '换 Chrome / Edge；https 或 localhost；关闭占用该口的串口助手。' },
          { problem: '3D 模型转的轴反了', fix: '只在地面站换轴，不要为了画面去改飞控里已经飞过的映射。' },
        ],
      },
    ],
  },
]
