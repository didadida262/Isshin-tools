export type DiagramKind = 'chain' | 'diffdrive' | 'compare'

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

export const STAGES: Stage[] = [
  {
    id: 'prep',
    index: '0',
    title: '开工准备',
    hours: '半天理清清单',
    goal: '先搞懂「遥控器没线，车为什么会动」，再把物料与安全规矩钉死。没线 ≠ 没介质：介质是电磁波（Wi‑Fi / 蓝牙 / 专用 2.4G）。',
    deliverable: '物料清单对齐；能口头讲清：按键 → 编码 → 无线电 → 解码 → 电机 → 车动。',
    prep: [
      {
        label: '你已有的',
        items: [
          { name: '主控', spec: 'Raspberry Pi 4B（4GB）' },
          { name: '供电 / 散热', spec: 'USB‑C 电源、散热片或风扇' },
          { name: '显示线', spec: 'micro‑HDMI（首次烧录调试可用）' },
          { name: '摄像头（可选）', spec: 'USB 免驱；阶段 A/B 可不插，后期图传再用' },
        ],
      },
      {
        label: '必须补的',
        items: [
          { name: 'microSD（TF）', spec: '32GB+，Class10 / A1 / A2；派的「硬盘」' },
          { name: 'TF 读卡器', spec: '在电脑上烧系统用' },
        ],
      },
      {
        label: '阶段 B 才让车动（建议一套买齐）',
        items: [
          { name: '智能小车底盘', spec: '2WD 或 4WD，带车轮与支架' },
          { name: '电机驱动板', spec: 'TB6612（推荐）或 L298N' },
          { name: '动力电池', spec: '按底盘电压，常见 7.4V 锂电 + 配套充电；不要用派的 USB 电源喂电机' },
          { name: '杜邦线', spec: '公对母、母对母若干' },
          { name: '面包板 / 万用表', spec: '可选，排线排错很省事' },
        ],
      },
      {
        label: '操控端（选一种或两种）',
        items: [
          { name: '手机', spec: '浏览器打开网页即可（本教程主路径）' },
          { name: '手柄', spec: 'Xbox / Switch Pro / 通用手柄；USB 或蓝牙' },
        ],
      },
    ],
    pass: [
      '能讲清：没线时介质是电磁波，HTTP/WebSocket 只是无线电之上的「信件格式」',
      '电机电源与派电源：共地、正极分开——写进心里',
      '物料至少齐：TF 卡 + 读卡器；阶段 B 底盘套装有采购计划',
    ],
    blocks: [
      {
        type: 'theory',
        title: '一句话原理',
        body: '遥控器（手机/手柄）把「前进」变成一串数字 → 经无线电发出去 → 车上的接收端（树莓派）收到并解码 → 通过 GPIO 驱动电机板 → 轮子转。本教程先用 Wi‑Fi + 树莓派走通全链路（阶段 A/B），再用可选模块对照「玩具遥控」那套路（阶段 C）。',
      },
      {
        type: 'diagram',
        kind: 'chain',
        title: '控制链路（①～⑥）',
      },
      {
        type: 'warn',
        title: '全程有效的安全规则',
        items: [
          '电机电源与树莓派电源共地（GND 相连），但电源正极分开。',
          '先架空车轮再测电机，避免飞车。',
          '锂电池注意过充过放，用配套充电板；鼓包即停。',
          '不要用派的 USB 电源直接喂电机。',
        ],
      },
      {
        type: 'table',
        title: '阶段对照',
        caption: '按阶段做，没过关不要跳。毕业标准：手机/手柄能无线控车，并能讲清原理。',
        headers: ['阶段', '你在做什么', '车轮'],
        rows: [
          ['0 开工', '原理 + 物料 + 安全', '不动'],
          ['1 派上线', '烧系统、SSH', '不动'],
          ['2 无线指令', '网页 → WebSocket → 日志', '不动'],
          ['3 接轮子', 'GPIO + 差速驱动', '真动'],
          ['4 手柄 / 图传', 'Gamepad、可选摄像头', '可动'],
          ['5 对照毕业', '2.4G 对照 + 口试', '—'],
        ],
      },
    ],
  },
  {
    id: 'ssh',
    index: '1',
    title: '派上线',
    hours: '约半天',
    goal: '把树莓派变成一台能 SSH 的小电脑：同网可达、能更新软件、后面所有服务都在这台机器上跑。',
    deliverable: '本机能 `ssh 用户名@pi-car.local`（或 IP）登录；apt 更新过一轮。',
    prep: [
      {
        label: '桌上要有',
        items: [
          { name: 'Pi 4B + 电源', spec: '官方或合格 USB‑C 电源' },
          { name: 'TF 卡 + 读卡器', spec: '插在电脑上烧录' },
          { name: '电脑', spec: '已装 Raspberry Pi Imager' },
          { name: '同一 Wi‑Fi', spec: '电脑与派将来要同网' },
        ],
      },
    ],
    pass: [
      'Imager 写卡时已设主机名、用户密码、Wi‑Fi、启用 SSH',
      '通电后能 ping / SSH 进派',
      'python3、pip、venv、git 可用',
    ],
    blocks: [
      {
        type: 'steps',
        title: '烧录系统（Mac / Windows）',
        items: [
          {
            title: '安装 Imager',
            body: '打开 raspberrypi.com/software/ 安装 Raspberry Pi Imager，插入 TF 卡。',
          },
          {
            title: '选系统与设备',
            body: '系统选 Raspberry Pi OS (64-bit)（带桌面或 Lite 均可；学习建议带桌面）。设备选 Raspberry Pi 4。',
          },
          {
            title: 'OS customisation（齿轮）务必设置',
            body: '主机名例如 pi-car；用户名/密码；配置你家 Wi‑Fi SSID + 密码；勾选启用 SSH。写完后卡插入派底面卡槽再通电。',
          },
          {
            title: '找 IP 并登录',
            body: '同一 Wi‑Fi 下，先试本机名；不行就查路由器设备列表或 arp。',
            code: 'ping pi-car.local\nssh 你的用户名@pi-car.local\n# 或 ssh 你的用户名@192.168.x.x',
          },
          {
            title: '更新与基础工具',
            body: '第一件事：把系统和 Python 工具链补齐。',
            code: 'sudo apt update && sudo apt upgrade -y\nsudo apt install -y python3-pip python3-venv git',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          {
            problem: 'SSH 不上',
            fix: '多半是 Imager 没勾选 Wi‑Fi / SSH；重烧并确认同一局域网。',
          },
          {
            problem: 'pi-car.local 解析失败',
            fix: '用路由器后台看 IP；Mac 可试 arp -a；Windows 可装 Bonjour 或直接用 IP。',
          },
        ],
      },
    ],
  },
  {
    id: 'wireless-cmd',
    index: '2',
    title: '无线指令',
    hours: '约 2–3 天',
    goal: '手机按「前进」，派的终端立刻打印 CMD；先打通编码 → 传输 → 解码，不碰电机。很多人一上来装车只会说「能跑」，说不清中间发生了什么。',
    deliverable: '手机打开 http://派IP:8000，按键有 `[RX] …` 日志；断线自动 stop。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '可 SSH 的派', spec: '同网、python3-venv 可用' },
          { name: '手机', spec: '连同一 Wi‑Fi' },
        ],
      },
      {
        label: '本阶段不要接',
        items: [
          { name: '电机 / 动力电池', spec: '阶段 A 只证明无线送到了数字' },
        ],
      },
    ],
    pass: [
      '手机能打开页面',
      '断开 Wi‑Fi 后页面失效（证明走的是无线局域网）',
      '每个按钮都有对应日志；松手 / 断线会 stop',
      '能向别人讲清：Wi‑Fi 是无线电，WebSocket 是消息格式',
    ],
    blocks: [
      {
        type: 'diagram',
        kind: 'chain',
        title: '阶段 A 架构',
      },
      {
        type: 'theory',
        title: '为什么先做无车轮版？',
        body: '阶段 A 强制你看见：无线只送数字；运动是后面才接上的。手机浏览器经 Wi‑Fi 到路由器再到树莓派上的 WebSocket 服务；解析 JSON 后 print /（可选）GPIO 闪灯。灯亮 = 将来电机转的同一位置。',
      },
      {
        type: 'steps',
        title: '在派上搭 FastAPI 服务',
        items: [
          {
            title: '创建项目与虚拟环境',
            body: '在派上执行：',
            code: 'mkdir -p ~/pi-car/{static,templates} && cd ~/pi-car\npython3 -m venv .venv\nsource .venv/bin/activate\npip install fastapi uvicorn[standard] jinja2',
          },
          {
            title: '服务端核心：统一内部状态',
            body: '把遥控消息变成 throttle / steer / cmd；阶段 A 只 print，阶段 B 再接 motor.set。',
            code: 'state = {"throttle": 0.0, "steer": 0.0, "cmd": "stop"}\n\ndef apply_cmd(msg: dict):\n    global state\n    if "cmd" in msg:\n        cmd = msg["cmd"]\n        state["cmd"] = cmd\n        mapping = {\n            "forward": (0.6, 0.0),\n            "back": (-0.6, 0.0),\n            "left": (0.0, -0.6),\n            "right": (0.0, 0.6),\n            "stop": (0.0, 0.0),\n        }\n        if cmd in mapping:\n            state["throttle"], state["steer"] = mapping[cmd]\n    if "throttle" in msg:\n        state["throttle"] = max(-1.0, min(1.0, float(msg["throttle"])))\n    if "steer" in msg:\n        state["steer"] = max(-1.0, min(1.0, float(msg["steer"])))\n    print(f"[RX] {state}")',
          },
          {
            title: 'WebSocket：收令并断线停车',
            body: '连接成功回 ok；收到 JSON 调 apply_cmd；断开时强制 stop。',
            code: '@app.websocket("/ws")\nasync def ws_endpoint(ws: WebSocket):\n    await ws.accept()\n    try:\n        while True:\n            raw = await ws.receive_text()\n            msg = json.loads(raw)\n            apply_cmd(msg)\n            await ws.send_text(json.dumps({"ok": True, "state": state}))\n    except WebSocketDisconnect:\n        apply_cmd({"cmd": "stop"})\n        print("[WS] disconnected → stop")',
          },
          {
            title: '手机页：按钮 + 虚拟摇杆 + Gamepad',
            body: 'templates/index.html：按钮发 {cmd}；摇杆发 {throttle, steer}；松手 stop。也可用浏览器 Gamepad API 读手柄。完整页面见仓库笔记或按教程文档粘贴。',
            code: 'function send(obj) {\n  if (ws.readyState === 1) ws.send(JSON.stringify(obj))\n}\n// 按钮：send({cmd:\'forward\'})\n// 摇杆：send({throttle: y, steer: x})\n// 松手：send({cmd:\'stop\'})',
          },
          {
            title: '启动并验收',
            body: '手机连同一 Wi‑Fi，浏览器打开 http://派的IP:8000。按前进，终端应出现 [RX] 日志。',
            code: 'cd ~/pi-car && source .venv/bin/activate\nuvicorn main:app --host 0.0.0.0 --port 8000',
          },
          {
            title: '（可选）GPIO 闪灯当假电机',
            body: 'sudo apt install -y python3-gpiozero；在 apply_cmd 末尾用 LED 表示前进/左右。灯亮 = 将来电机转的同一位置。',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          {
            problem: '手机打不开页面',
            fix: '确认同一 Wi‑Fi；uvicorn 必须 --host 0.0.0.0；IP 是否写对。',
          },
          {
            problem: '连上但无日志',
            fix: '看浏览器控制台 WebSocket 是否连上 /ws；防火墙；页面是否缓存了旧 JS。',
          },
        ],
      },
    ],
  },
  {
    id: 'motors',
    index: '3',
    title: '轮子转起来',
    hours: '约 3–5 天',
    goal: '接上驱动板与电机，把阶段 A 的 throttle/steer 变成差速左右轮速度。遥控不必单独「左转电机协议」。',
    deliverable: '架空测试：双轮同向直行、差速转向；手机低速落地可控；断线必停。',
    prep: [
      {
        label: '上一阶段必须已经有',
        items: [
          { name: '可跑的 WebSocket 服务', spec: '按键有 [RX] 日志' },
        ],
      },
      {
        label: '本阶段新拿上桌',
        items: [
          { name: '底盘 + 电机', spec: '2WD/4WD' },
          { name: '驱动板', spec: 'TB6612 优先' },
          { name: '动力电池', spec: '电压匹配底盘；与逻辑电正极分开、GND 共地' },
          { name: '杜邦线', spec: '按丝印核对 PWM / DIR' },
        ],
      },
    ],
    pass: [
      '架空：drive.set(0.4, 0) 双轮同向',
      '架空：drive.set(0, 0.4) 原地转向合理',
      '手机/手柄实操；落地先限速（如 forward 用 0.35）',
      'WebSocket 断开后电机停转',
    ],
    blocks: [
      {
        type: 'warn',
        title: '接线原则',
        items: [
          '派的 5V/3.3V 只给逻辑；电机大电流走电池。',
          '电池 GND、驱动板 GND、Pi GND 必须共地。',
          'PWM 调速度，DIR 调方向；脚位按你买的板子丝印微调。',
        ],
      },
      {
        type: 'table',
        title: 'TB6612 + 两路电机示意脚位',
        caption: '具体脚位以驱动板丝印为准，下表是常见接法示例。',
        headers: ['Pi', '驱动板', '作用'],
        rows: [
          ['GPIO18', 'PWMA', '左轮 PWM'],
          ['GPIO23', 'AIN1', '左轮方向'],
          ['GPIO24', 'AIN2', '左轮方向'],
          ['GPIO19', 'PWMB', '右轮 PWM'],
          ['GPIO27', 'BIN1', '右轮方向'],
          ['GPIO22', 'BIN2', '右轮方向'],
          ['GND', 'GND', '共地'],
          ['电池 +', 'VM', '电机电源'],
          ['电池 −', 'GND', '电机电源地'],
        ],
      },
      {
        type: 'diagram',
        kind: 'diffdrive',
        title: '差速：throttle + steer → 左右轮',
      },
      {
        type: 'formula',
        title: '差速车运动学',
        expr: 'left = clamp(throttle + steer)\nright = clamp(throttle − steer)',
        note: '两轮同速同向 → 直行；同速反向 → 原地转；左右不同 → 画弧。所以只要发 throttle + steer，车上自己算左右轮速度。',
      },
      {
        type: 'steps',
        title: '电机模块接到 apply_cmd',
        items: [
          {
            title: 'motor.py：DiffDrive',
            body: '用 gpiozero.Motor；脚位按实际接线改。',
            code: 'from gpiozero import Motor\n\nclass DiffDrive:\n    def __init__(self):\n        self.left = Motor(forward=23, backward=24, enable=18)\n        self.right = Motor(forward=27, backward=22, enable=19)\n\n    def set(self, throttle: float, steer: float):\n        left = max(-1.0, min(1.0, throttle + steer))\n        right = max(-1.0, min(1.0, throttle - steer))\n        self._set_one(self.left, left)\n        self._set_one(self.right, right)\n\n    def _set_one(self, m: Motor, v: float):\n        if abs(v) < 0.05:\n            m.stop()\n        elif v > 0:\n            m.forward(v)\n        else:\n            m.backward(-v)\n\n    def stop(self):\n        self.left.stop()\n        self.right.stop()',
          },
          {
            title: '挂到 main.py',
            body: 'apply_cmd 更新 state 后调用 drive.set；断线时 drive.stop()。',
            code: 'from motor import DiffDrive\ndrive = DiffDrive()\n\n# apply_cmd 末尾：\ndrive.set(state["throttle"], state["steer"])\n\n# WebSocketDisconnect：\napply_cmd({"cmd": "stop"})\ndrive.stop()',
          },
          {
            title: '上电测试顺序',
            body: '① 车轮架空 ② 先只开派，SSH 里手动 drive.set(0.4, 0) ③ 再测 drive.set(0, 0.4) ④ 手机/手柄 ⑤ 落地低速，把 forward 的 0.6 先改成 0.35。',
          },
        ],
      },
      {
        type: 'pitfalls',
        items: [
          {
            problem: '有日志但轮子不转',
            fix: '查电机供电、共地、脚位；架空测；万用表量 VM。',
          },
          {
            problem: '一跑就重启',
            fix: '电机回流干扰或供电不足；加电容；逻辑电与电机电隔离好。',
          },
        ],
      },
    ],
  },
  {
    id: 'gamepad-ext',
    index: '4',
    title: '手柄与扩展',
    hours: '约 2–3 天',
    goal: '把手柄接到同一套车上逻辑；搞清图传是反向链路，不要干扰你学控制原理。',
    deliverable: '至少走通「浏览器 + Gamepad」一条路；知道原生 App / 图传该放哪一步。',
    prep: [
      {
        label: '建议已有',
        items: [
          { name: '阶段 2 或 3 页面', spec: '同一 http://派IP:8000' },
          { name: '手柄', spec: '蓝牙连手机，或 USB 连电脑' },
        ],
      },
    ],
    pass: [
      '手柄摇杆能控车（或至少阶段 2 日志跟着动）',
      '能说出：摄像头是车→人看画面，不是人→车发命令',
      '知道学习顺序：网页 → PWA → 再考虑原生 App',
    ],
    blocks: [
      {
        type: 'table',
        title: '手柄三条实用路径',
        headers: ['路径', '做法', '优点 / 缺点'],
        rows: [
          [
            '1 浏览器 Gamepad（推荐）',
            '手柄连手机/电脑，打开同一网页，JS 轮询 axes 发 WebSocket',
            '与按钮遥控共用车上逻辑',
          ],
          [
            '2 手柄直连派',
            'bluetoothctl 配对；派上读 /dev/input/js0 直接 drive.set',
            '不依赖手机；但与网页遥控分叉',
          ],
          [
            '3 电脑中继',
            '电脑收手柄 → 转发 WebSocket 到派',
            '适合书桌前调试',
          ],
        ],
      },
      {
        type: 'steps',
        title: '路径 1 要点（已在 index.html）',
        items: [
          {
            title: '连接与死区',
            body: '监听 gamepadconnected；轮询左摇杆 axes[0]/[1]；死区约 0.15；A 键急停。不同手柄可能取反，打印 axes 再调。',
            code: 'let steer = gp.axes[0] || 0\nlet throttle = -(gp.axes[1] || 0)\nif (Math.abs(steer) < 0.15) steer = 0\nif (Math.abs(throttle) < 0.15) throttle = 0\nif (gp.buttons[0]?.pressed) send({cmd:\'stop\'})\nelse send({throttle, steer})',
          },
          {
            title: '路径 2（选做）',
            body: 'sudo apt install -y bluetooth pi-bluetooth；配对后用 inputs / pygame 读摇杆，直接 drive.set。建议先吃透路径 1。',
          },
        ],
      },
      {
        type: 'theory',
        title: '摄像头放在哪一步？',
        body: '摄像头是反向链路（车→人看画面），不是控制链路。建议：先稳定阶段 B 操控 → 再加 MJPEG/WebRTC 到同一网页 → 才叫「带图传的无线遥控车」雏形。USB 摄像头插蓝色 USB3 口；可用 fswebcam/ffmpeg 试拍，但别让图传干扰学控制。',
      },
      {
        type: 'table',
        title: '「手机 App」要不要原生？',
        headers: ['方案', '说明', '建议'],
        rows: [
          ['手机浏览器网页', '本教程主路径', '先做这个'],
          ['添加到主屏幕（PWA）', '像 App 图标', '够用'],
          ['微信小程序 / 原生 App', '证书、审核、两套代码', '原理懂了再做'],
        ],
      },
      {
        type: 'pitfalls',
        items: [
          {
            problem: '手柄没反应',
            fix: '换浏览器；检查权限；打印 axes 看映射是否反了。',
          },
          {
            problem: '延迟大',
            fix: '2.4G 拥堵或图传占满带宽；先关摄像头；尽量用 5GHz Wi‑Fi。',
          },
        ],
      },
    ],
  },
  {
    id: 'compare-grad',
    index: '5',
    title: '对照与毕业',
    hours: '约 1–2 天 + 复习',
    goal: '对照玩具 2.4G / nRF24：换通道，不换物理学。能答上口试题，这个项目就毕业了。',
    deliverable: '对照表能讲；五道口试题能答；按两周节奏复盘自己卡在哪。',
    prep: [
      {
        label: '可选物料（阶段 C）',
        items: [
          { name: '对照件', spec: '拆一只便宜 2.4G 遥控车，或两只 nRF24L01' },
        ],
      },
    ],
    pass: [
      '能说出 Wi‑Fi 方案与玩具 2.4G 的相同点与不同点',
      '口试五题能答清',
      '知道下一步可以整理 pi-car 仓库、按实板改 GPIO',
    ],
    blocks: [
      {
        type: 'diagram',
        kind: 'compare',
        title: '同一套物理学，不同通道',
      },
      {
        type: 'table',
        title: '对照表',
        headers: ['项目', '手机 + Wi‑Fi + Pi', '玩具 2.4G / nRF24'],
        rows: [
          ['无线电', '有（Wi‑Fi）', '有（专用射频）'],
          ['地址 / 配对', 'IP、路由器', '管道地址 / 对频'],
          ['命令格式', 'JSON / WebSocket', '短二进制帧'],
          ['延迟', '一般略高', '通常更低'],
          ['灵活性', '易加摄像头、地图', '改协议较难'],
          ['共性', '编码→发射→接收→解码→执行', '同左'],
        ],
      },
      {
        type: 'table',
        title: '常见故障速查',
        headers: ['现象', '可能原因', '处理'],
        rows: [
          ['手机打不开页面', '不同网 / 防火墙 / IP 错', 'ping；--host 0.0.0.0'],
          ['有日志但轮子不转', '供电 / 共地 / 脚位', '查 GND；架空；万用表'],
          ['一跑就重启', '回流干扰 / 供电不足', '电容；电源隔离'],
          ['手柄没反应', '权限 / axes 映射', '换浏览器；打印 axes'],
          ['延迟大', '拥堵 / 图传占带宽', '关摄像头；5GHz'],
          ['SSH 不上', 'Imager 未配 Wi‑Fi', '重烧并勾选无线与 SSH'],
        ],
      },
      {
        type: 'table',
        title: '推荐学习节奏（两周版）',
        headers: ['天', '内容'],
        rows: [
          ['Day 1', '烧系统、SSH、搞清 Wi‑Fi=无线电'],
          ['Day 2–3', '阶段 A：网页按钮 + WebSocket 日志'],
          ['Day 4', '虚拟摇杆 + 手柄 Gamepad'],
          ['Day 5–7', '装底盘、接线、阶段 B 差速驱动'],
          ['Day 8–9', '调死区、限速、断线保护'],
          ['Day 10+', '（可选）图传；阶段 C 射频对照'],
        ],
      },
      {
        type: 'theory',
        title: '口试题（答得上来就毕业）',
        body: '① 为什么没线还能控？中间介质是什么？② HTTP/WebSocket 和 Wi‑Fi 各负责哪一层？③ 断线为什么必须默认停车？④ 差速车如何用 throttle/steer 两个数控制四向运动？⑤ 玩具 2.4G 和手机 Wi‑Fi 控车，相同点与不同点？',
      },
      {
        type: 'steps',
        title: '下一步（和工程师配合时）',
        items: [
          {
            title: 'TF 卡插上电脑后可以一起做',
            body: '在 Mac 上烧 Raspberry Pi OS；把 pi-car 整理成现成仓库结构；按你买的具体驱动板型号改 GPIO 脚位表。',
          },
        ],
      },
    ],
  },
]
