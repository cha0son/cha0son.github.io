/**
 * 菜品库 —— 从 Java 版 SparkServer.java 的 DISHES 自动提取
 * 共 82 道菜，字段与 Java 版 Dish record 一一对应：
 *   name 菜名 / cuisine 菜系 / mealType 餐段 / spicy 辣度(0-3)
 *   minutes 耗时 / calories 热量 / tags 标签(逗号分隔)
 *
 * 提取脚本保证与后端数据一致，避免手工录入错误。
 */
const DISHES = [
  {
    "name": "番茄炒蛋",
    "cuisine": "家常",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 180,
    "tags": "快手,下饭"
  },
  {
    "name": "青椒肉丝",
    "cuisine": "家常",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 20,
    "calories": 260,
    "tags": "下饭"
  },
  {
    "name": "红烧肉",
    "cuisine": "家常",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 60,
    "calories": 520,
    "tags": "硬菜,油腻"
  },
  {
    "name": "可乐鸡翅",
    "cuisine": "家常",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 380,
    "tags": "甜口"
  },
  {
    "name": "土豆炖牛肉",
    "cuisine": "家常",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 70,
    "calories": 450,
    "tags": "炖菜,顶饱"
  },
  {
    "name": "鱼香肉丝",
    "cuisine": "川菜",
    "mealType": "午餐",
    "spicy": 2,
    "minutes": 25,
    "calories": 320,
    "tags": "下饭,酸甜"
  },
  {
    "name": "麻婆豆腐",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 20,
    "calories": 280,
    "tags": "下饭,麻辣"
  },
  {
    "name": "水煮肉片",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 35,
    "calories": 480,
    "tags": "麻辣,重口"
  },
  {
    "name": "宫保鸡丁",
    "cuisine": "川菜",
    "mealType": "午餐",
    "spicy": 2,
    "minutes": 25,
    "calories": 350,
    "tags": "下饭"
  },
  {
    "name": "回锅肉",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 30,
    "calories": 460,
    "tags": "重口,下饭"
  },
  {
    "name": "白切鸡",
    "cuisine": "粤菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 45,
    "calories": 300,
    "tags": "清淡"
  },
  {
    "name": "清蒸鲈鱼",
    "cuisine": "粤菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 220,
    "tags": "清淡,高蛋白"
  },
  {
    "name": "广式煲仔饭",
    "cuisine": "粤菜",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 40,
    "calories": 550,
    "tags": "顶饱"
  },
  {
    "name": "虾饺",
    "cuisine": "粤菜",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 200,
    "tags": "点心"
  },
  {
    "name": "皮蛋瘦肉粥",
    "cuisine": "粤菜",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 180,
    "tags": "清淡,暖胃"
  },
  {
    "name": "兰州牛肉面",
    "cuisine": "面食",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 15,
    "calories": 480,
    "tags": "快手,顶饱,汤"
  },
  {
    "name": "炸酱面",
    "cuisine": "面食",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 520,
    "tags": "顶饱"
  },
  {
    "name": "重庆小面",
    "cuisine": "面食",
    "mealType": "早餐",
    "spicy": 3,
    "minutes": 15,
    "calories": 450,
    "tags": "麻辣,快手"
  },
  {
    "name": "阳春面",
    "cuisine": "面食",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 10,
    "calories": 300,
    "tags": "清淡,快手"
  },
  {
    "name": "刀削面",
    "cuisine": "面食",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 25,
    "calories": 500,
    "tags": "顶饱"
  },
  {
    "name": "扬州炒饭",
    "cuisine": "米饭",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 520,
    "tags": "快手,顶饱"
  },
  {
    "name": "黄焖鸡米饭",
    "cuisine": "米饭",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 25,
    "calories": 600,
    "tags": "顶饱"
  },
  {
    "name": "猪脚饭",
    "cuisine": "米饭",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 650,
    "tags": "顶饱,油腻"
  },
  {
    "name": "咖喱牛肉饭",
    "cuisine": "米饭",
    "mealType": "晚餐",
    "spicy": 1,
    "minutes": 35,
    "calories": 580,
    "tags": "顶饱"
  },
  {
    "name": "石锅拌饭",
    "cuisine": "米饭",
    "mealType": "晚餐",
    "spicy": 1,
    "minutes": 25,
    "calories": 550,
    "tags": "顶饱"
  },
  {
    "name": "三鲜水饺",
    "cuisine": "饺子",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 420,
    "tags": "顶饱"
  },
  {
    "name": "韭菜盒子",
    "cuisine": "饺子",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 25,
    "calories": 380,
    "tags": "顶饱"
  },
  {
    "name": "小笼包",
    "cuisine": "小吃",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 300,
    "tags": "点心"
  },
  {
    "name": "煎饼果子",
    "cuisine": "小吃",
    "mealType": "早餐",
    "spicy": 1,
    "minutes": 10,
    "calories": 420,
    "tags": "快手"
  },
  {
    "name": "肉夹馍",
    "cuisine": "小吃",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 15,
    "calories": 450,
    "tags": "快手,顶饱"
  },
  {
    "name": "凉皮",
    "cuisine": "小吃",
    "mealType": "午餐",
    "spicy": 2,
    "minutes": 10,
    "calories": 350,
    "tags": "清爽,快手"
  },
  {
    "name": "番茄鸡蛋面",
    "cuisine": "面食",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 380,
    "tags": "快手,清淡"
  },
  {
    "name": "麻辣香锅",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 35,
    "calories": 620,
    "tags": "麻辣,重口"
  },
  {
    "name": "酸菜鱼",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 40,
    "calories": 420,
    "tags": "酸辣,硬菜"
  },
  {
    "name": "毛血旺",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 40,
    "calories": 550,
    "tags": "麻辣,重口"
  },
  {
    "name": "小炒黄牛肉",
    "cuisine": "湘菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 25,
    "calories": 430,
    "tags": "香辣,下饭"
  },
  {
    "name": "剁椒鱼头",
    "cuisine": "湘菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 35,
    "calories": 400,
    "tags": "香辣,硬菜"
  },
  {
    "name": "湖南米粉",
    "cuisine": "湘菜",
    "mealType": "早餐",
    "spicy": 2,
    "minutes": 15,
    "calories": 450,
    "tags": "快手,汤"
  },
  {
    "name": "干锅花菜",
    "cuisine": "湘菜",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 25,
    "calories": 320,
    "tags": "下饭"
  },
  {
    "name": "地三鲜",
    "cuisine": "东北菜",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 25,
    "calories": 350,
    "tags": "下饭,素"
  },
  {
    "name": "锅包肉",
    "cuisine": "东北菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 480,
    "tags": "酸甜,硬菜"
  },
  {
    "name": "东北乱炖",
    "cuisine": "东北菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 50,
    "calories": 400,
    "tags": "炖菜,顶饱"
  },
  {
    "name": "猪肉炖粉条",
    "cuisine": "东北菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 45,
    "calories": 520,
    "tags": "炖菜,顶饱"
  },
  {
    "name": "酸菜白肉",
    "cuisine": "东北菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 50,
    "calories": 460,
    "tags": "炖菜,解腻"
  },
  {
    "name": "酸辣土豆丝",
    "cuisine": "家常",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 15,
    "calories": 220,
    "tags": "快手,下饭,素"
  },
  {
    "name": "干煸豆角",
    "cuisine": "家常",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 20,
    "calories": 260,
    "tags": "下饭,素"
  },
  {
    "name": "蒜蓉西兰花",
    "cuisine": "家常",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 150,
    "tags": "清淡,素,健康"
  },
  {
    "name": "上汤娃娃菜",
    "cuisine": "粤菜",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 130,
    "tags": "清淡,素,健康"
  },
  {
    "name": "清炒时蔬",
    "cuisine": "家常",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 10,
    "calories": 120,
    "tags": "清淡,素,健康,快手"
  },
  {
    "name": "凉拌黄瓜",
    "cuisine": "凉菜",
    "mealType": "午餐",
    "spicy": 1,
    "minutes": 5,
    "calories": 80,
    "tags": "清爽,快手,低卡"
  },
  {
    "name": "口水鸡",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 25,
    "calories": 340,
    "tags": "麻辣,凉菜"
  },
  {
    "name": "夫妻肺片",
    "cuisine": "川菜",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 20,
    "calories": 320,
    "tags": "麻辣,凉菜"
  },
  {
    "name": "麻辣烫",
    "cuisine": "小吃",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 20,
    "calories": 500,
    "tags": "麻辣,自由搭配"
  },
  {
    "name": "关东煮",
    "cuisine": "小吃",
    "mealType": "夜宵",
    "spicy": 0,
    "minutes": 10,
    "calories": 250,
    "tags": "清淡,快手"
  },
  {
    "name": "烤冷面",
    "cuisine": "小吃",
    "mealType": "夜宵",
    "spicy": 1,
    "minutes": 10,
    "calories": 380,
    "tags": "快手"
  },
  {
    "name": "炸鸡啤酒",
    "cuisine": "小吃",
    "mealType": "夜宵",
    "spicy": 1,
    "minutes": 25,
    "calories": 700,
    "tags": "油腻,解压"
  },
  {
    "name": "酸辣粉",
    "cuisine": "小吃",
    "mealType": "夜宵",
    "spicy": 3,
    "minutes": 15,
    "calories": 420,
    "tags": "麻辣,汤"
  },
  {
    "name": "韩式炸酱面",
    "cuisine": "韩餐",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 25,
    "calories": 550,
    "tags": "甜口,顶饱"
  },
  {
    "name": "部队锅",
    "cuisine": "韩餐",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 35,
    "calories": 600,
    "tags": "汤,重口"
  },
  {
    "name": "石锅豆腐汤",
    "cuisine": "韩餐",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 25,
    "calories": 300,
    "tags": "汤,暖胃"
  },
  {
    "name": "冬阴功汤",
    "cuisine": "东南亚",
    "mealType": "晚餐",
    "spicy": 3,
    "minutes": 30,
    "calories": 280,
    "tags": "酸辣,汤"
  },
  {
    "name": "海南鸡饭",
    "cuisine": "东南亚",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 35,
    "calories": 520,
    "tags": "清淡,顶饱"
  },
  {
    "name": "日式咖喱饭",
    "cuisine": "日料",
    "mealType": "晚餐",
    "spicy": 1,
    "minutes": 30,
    "calories": 560,
    "tags": "顶饱"
  },
  {
    "name": "豚骨拉面",
    "cuisine": "日料",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 650,
    "tags": "汤,顶饱"
  },
  {
    "name": "寿司拼盘",
    "cuisine": "日料",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 380,
    "tags": "清淡,低卡"
  },
  {
    "name": "牛肉火锅",
    "cuisine": "火锅",
    "mealType": "晚餐",
    "spicy": 2,
    "minutes": 60,
    "calories": 800,
    "tags": "聚餐,硬菜"
  },
  {
    "name": "串串香",
    "cuisine": "火锅",
    "mealType": "夜宵",
    "spicy": 3,
    "minutes": 50,
    "calories": 700,
    "tags": "聚餐,麻辣"
  },
  {
    "name": "椰子鸡火锅",
    "cuisine": "火锅",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 50,
    "calories": 400,
    "tags": "清淡,聚餐"
  },
  {
    "name": "芝士焗饭",
    "cuisine": "西餐",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 30,
    "calories": 620,
    "tags": "顶饱,油腻"
  },
  {
    "name": "黑椒牛柳意面",
    "cuisine": "西餐",
    "mealType": "晚餐",
    "spicy": 1,
    "minutes": 30,
    "calories": 580,
    "tags": "顶饱"
  },
  {
    "name": "凯撒沙拉",
    "cuisine": "西餐",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 10,
    "calories": 250,
    "tags": "低卡,健康,快手"
  },
  {
    "name": "汉堡薯条",
    "cuisine": "西餐",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 750,
    "tags": "油腻,快手"
  },
  {
    "name": "三明治",
    "cuisine": "西餐",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 5,
    "calories": 300,
    "tags": "快手,低卡"
  },
  {
    "name": "煎蛋吐司",
    "cuisine": "西餐",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 8,
    "calories": 280,
    "tags": "快手,简单"
  },
  {
    "name": "燕麦牛奶",
    "cuisine": "健康餐",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 5,
    "calories": 220,
    "tags": "健康,低卡,快手"
  },
  {
    "name": "鸡胸肉沙拉",
    "cuisine": "健康餐",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 15,
    "calories": 320,
    "tags": "健康,低卡,高蛋白"
  },
  {
    "name": "水煮西兰花鸡胸",
    "cuisine": "健康餐",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 300,
    "tags": "健康,低卡,高蛋白"
  },
  {
    "name": "杂粮饭配时蔬",
    "cuisine": "健康餐",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 25,
    "calories": 350,
    "tags": "健康,素"
  },
  {
    "name": "番茄牛腩汤",
    "cuisine": "汤羹",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 60,
    "calories": 380,
    "tags": "汤,暖胃,炖菜"
  },
  {
    "name": "紫菜蛋花汤",
    "cuisine": "汤羹",
    "mealType": "午餐",
    "spicy": 0,
    "minutes": 10,
    "calories": 90,
    "tags": "汤,清淡,快手"
  },
  {
    "name": "玉米排骨汤",
    "cuisine": "汤羹",
    "mealType": "晚餐",
    "spicy": 0,
    "minutes": 70,
    "calories": 350,
    "tags": "汤,暖胃,炖菜"
  },
  {
    "name": "疙瘩汤",
    "cuisine": "汤羹",
    "mealType": "早餐",
    "spicy": 0,
    "minutes": 20,
    "calories": 300,
    "tags": "暖胃,顶饱"
  }
];
