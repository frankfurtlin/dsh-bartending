/* 微醺星球 · 调酒数据
 * 配方参考国际调酒师协会（IBA）官方经典列表，用量为常见教学版本。
 * method: shake 摇和 / stir 搅拌 / build 直调
 * glass: rocks 古典杯 / highball 高球杯 / coupe 浅碟杯 / martini 马天尼杯 / wine 葡萄酒杯
 */
'use strict';

/* ---------- 图片资产（v0.74.0） ----------
   全部是 AI 生成的写实照片，存腾讯云 COS、页面引用 EO 域名。生成规范、水印裁切、抠白底与换图
   SOP 见 `app/domains/bartending/ASSETS.md`，流水线脚本在 `scripts/`。

   路径里的 8 位十六进制是文件内容 sha1 的前 8 位（`image_uploader.py` 定的规范）：
   **换图后路径会变** —— 改这里时记得顺手确认页面不 404。

   · `ing` / `gar` / `eq` 是**透明底 WebP**（640 宽内、高 256）：配料行小图与舞台贴图**共用同一批**，
     所以配料名单与舞台酒瓶永远是同一张图；
   · `method` 是 640×400 JPEG 横幅，页面用 `object-fit: cover` 铺满。
   `eq.shaker` 那张虽然传上去了但**没用**（出图更像玻璃罐，摇壶保留矢量，见 ASSETS.md）。 */
const ASSET_BASE = 'https://static.frankfurtlin.top/media/2026/10/';

const ASSETS = {
  /* 配料 → ing_<slug>.webp（键是 data.js 里用的中文名） */
  ing: {
    '龙舌兰': 'a2545a16/ing_tequila.webp',
    '君度橙酒': 'ed9102a4/ing_cointreau.webp',
    '青柠汁': '43c62057/ing_lime.webp',
    '白朗姆酒': '36add71e/ing_white_rum.webp',
    '苏打水': '66d7639c/ing_soda.webp',
    '金酒': '8460a8c5/ing_gin.webp',
    '金巴利': '089ce9fd/ing_campari.webp',
    '甜味美思': '265a6d18/ing_sweet_vermouth.webp',
    '波本威士忌': '443ad7ee/ing_bourbon.webp',
    '糖浆': 'b6219c82/ing_sugar_syrup.webp',
    '安高天娜苦精': 'b45ab3cf/ing_angostura.webp',
    '黑麦威士忌': 'ba05004c/ing_rye.webp',
    '干味美思': 'aa8e5b77/ing_dry_vermouth.webp',
    '柠檬汁': '6cc01ac6/ing_lemon.webp',
    '阿佩罗': '771e45cb/ing_aperol.webp',
    '普罗塞克': '36eb3e8d/ing_prosecco.webp',
    '伏特加': '26d133cc/ing_vodka.webp',
    '可乐': 'adb29009/ing_cola.webp',
    '柠檬伏特加': '1edf95c6/ing_citron_vodka.webp',
    '蔓越莓汁': 'aa03a986/ing_cranberry.webp',
    '咖啡利口酒': 'e4de34a0/ing_coffee_liqueur.webp',
    '意式浓缩': '837c3ee7/ing_espresso.webp'
  },
  /* 装饰 → gar_<slug>.webp（键是 buildGarnish 的 switch 值） */
  gar: {
    'lime-wheel': 'd9a8cabd/gar_lime_wheel.webp',
    'lemon-slice': 'c085fede/gar_lemon_slice.webp',
    'orange-slice': 'd402c303/gar_orange_slice.webp',
    'orange-peel': '76586240/gar_orange_peel.webp',
    'lemon-twist': 'eabd911d/gar_lemon_twist.webp',
    'mint': '14688333/gar_mint.webp',
    'cherry': 'c8f6854c/gar_cherry.webp',
    'coffee-beans': 'ef61b617/gar_coffee_beans.webp'
  },
  /* 器材（只有这两件可换：载杯 / 量酒器 / 混合杯 / 摇壶 / 冰块内部都有 clip 驱动的液体状态） */
  eq: {
    spoon: 'b889760a/eq_spoon.webp',
    muddler: '348ac494/eq_muddler.webp'
  },
  method: {
    shake: '23cd9a96/method_shake.jpg',
    stir: '551c9b12/method_stir.jpg',
    build: '9d47e813/method_build.jpg'
  }
};

/** 取绝对 URL；没有该资产时返回空串（调用方按「无图」回退矢量 / 色块）。 */
function assetUrl(group, key) {
  const p = ASSETS[group] && ASSETS[group][key];
  return p ? ASSET_BASE + p : '';
}

const GLASS_NAMES = {
  rocks: '古典杯', highball: '高球杯', coupe: '浅碟香槟杯',
  martini: '马天尼杯', wine: '葡萄酒杯'
};

const METHOD_INFO = {
  shake: {
    name: '摇和', en: 'SHAKE', img: assetUrl('method', 'shake'),
    short: '把材料与冰块放入摇酒壶，双手持壶用力摇动 12–15 秒，让酒液迅速降温并带入细微气泡，口感更冰爽饱满。',
    desc: '适合含果汁、糖浆、蛋奶的材料。判断标准：摇到壶身结出一层白霜，就说明足够冰了。',
    equip: ['摇酒壶', '滤冰器', '量酒器']
  },
  stir: {
    name: '搅拌', en: 'STIR', img: assetUrl('method', 'stir'),
    short: '把材料与冰块放入混合杯，用吧匙贴着杯壁缓慢搅动约 30 圈，只降温、不打入空气，酒体清澈通透。',
    desc: '适合纯酒类配方（如马天尼、曼哈顿）。搅出的酒液澄亮如水晶，这是搅拌独有的优雅。',
    equip: ['混合杯', '吧匙', '滤冰器']
  },
  build: {
    name: '直调', en: 'BUILD', img: assetUrl('method', 'build'),
    short: '直接在杯中依次倒入材料，加冰后用吧匙轻提拉拌即可。操作最简单，适合气泡类与长饮。',
    desc: '可乐、苏打水等含气材料只能直调——摇晃会让气泡瞬间爆发，损失清爽口感。',
    equip: ['吧匙', '量酒器']
  }
};

const COCKTAILS = [
  {
    id: 'margarita', name: '玛格丽特', en: 'Margarita',
    img: 'https://static.frankfurtlin.top/media/2026/10/e00e9bd9/margarita.jpg',
    tagline: '盐与青柠封存的思念',
    story: '流传最广的版本里，一位洛杉矶调酒师为纪念逝去的恋人创造了它：龙舌兰是她的故乡，青柠的酸是回忆的味道，杯口的盐，是她爱吃的咸。IBA 三大高频词之一，也是每个调酒师入行的第一课。',
    method: 'shake', glass: 'coupe', rim: 'salt',
    garnish: 'lime-wheel', garnishName: '青柠片（杯口抹盐）',
    fx: { type: 'salt', label: '杯口撒上一圈盐霜' },
    abv: 20, difficulty: 1, color: '#dfe6c8',
    ingredients: [
      { name: '龙舌兰', en: 'Tequila', ml: 50, color: '#d9b36b', shape: 'spirit', type: '基酒' },
      { name: '君度橙酒', en: 'Cointreau', ml: 20, color: '#f0a84a', shape: 'liqueur', type: '利口酒' },
      { name: '青柠汁', en: 'Lime Juice', ml: 20, color: '#b9d977', shape: 'juice', type: '果汁' }
    ]
  },
  {
    id: 'mojito', name: '莫吉托', en: 'Mojito',
    img: 'https://static.frankfurtlin.top/media/2026/10/e07a469e/mojito.jpg',
    tagline: '哈瓦那的薄荷海风',
    story: '诞生于古巴哈瓦那的 La Bodeguita del Medio，据说海明威的常喝名单上永远有它。薄荷、青柠与苏打水的组合像一口加勒比海风，朗姆酒藏在水汽后面，不知不觉就微醺了。',
    method: 'build', glass: 'highball',
    muddle: true, iceFirst: true, bubbles: true,
    muddleItems: [
      { name: '薄荷叶', amount: '8–10 片' },
      { name: '青柠角', amount: '2 块' },
      { name: '糖浆', amount: '15 ml' }
    ],
    garnish: 'mint', garnishName: '薄荷枝',
    fx: { type: 'mint', label: '薄荷苏打，气泡律动' },
    abv: 10, difficulty: 2, color: '#cfe0a8',
    ingredients: [
      { name: '白朗姆酒', en: 'White Rum', ml: 40, color: '#d9c08a', shape: 'spirit', type: '基酒' }
    ],
    tops: [
      { name: '苏打水', en: 'Soda Water', ml: 60, color: '#cfe8f0', shape: 'soda', type: '气泡' }
    ]
  },
  {
    id: 'negroni', name: '尼格罗尼', en: 'Negroni',
    img: 'https://static.frankfurtlin.top/media/2026/10/895cc83b/negroni.jpg',
    tagline: '一比一比一的佛罗伦萨',
    story: '1919 年，佛罗伦萨的卡米洛·尼格罗尼伯爵嫌美式咖啡太淡，要求调酒师把金酒换成咖啡——不，是把苏打水换成金酒。等比的金酒、金巴利与甜味美思，一杯微苦而优雅的意大利式生活态度。',
    method: 'build', glass: 'rocks', iceFirst: true, stirInGlass: true,
    garnish: 'orange-peel', garnishName: '橙皮',
    fx: { type: 'mist', label: '橙皮油雾喷洒' },
    abv: 24, difficulty: 1, color: '#a5231d',
    ingredients: [
      { name: '金酒', en: 'Gin', ml: 25, color: '#bcd9c8', shape: 'spirit', type: '基酒' },
      { name: '金巴利', en: 'Campari', ml: 25, color: '#d33f2e', shape: 'liqueur', type: '利口酒' },
      { name: '甜味美思', en: 'Sweet Vermouth', ml: 25, color: '#8f4b2a', shape: 'wine', type: '加强酒' }
    ]
  },
  {
    id: 'old-fashioned', name: '古典鸡尾酒', en: 'Old Fashioned',
    img: 'https://static.frankfurtlin.top/media/2026/10/57e61751/old-fashioned.jpg',
    tagline: '回到鸡尾酒的起点',
    story: '名字本身就是宣言：老派。1880 年代肯塔基州 Pendennis 俱乐部为纪念一位波本酒爱好者而作——威士忌、糖、苦精，仅此而已。鸡尾酒这个词最初指的就是这一类酒，喝它像喝一杯液体的威士忌博物馆。',
    method: 'build', glass: 'rocks', iceFirst: true, stirInGlass: true,
    garnish: 'orange-peel', garnishName: '橙皮（可加樱桃）',
    fx: { type: 'sweep', label: '橙皮擦亮杯口' },
    abv: 32, difficulty: 1, color: '#b06a25',
    ingredients: [
      { name: '波本威士忌', en: 'Bourbon', ml: 45, color: '#c47a2e', shape: 'spirit', type: '基酒' },
      { name: '糖浆', en: 'Sugar Syrup', ml: 5, color: '#e8c987', shape: 'syrup', type: '糖浆' },
      { name: '安高天娜苦精', en: 'Angostura Bitters', dash: 2, ml: 2, color: '#4a2410', shape: 'bitters', type: '苦精' }
    ]
  },
  {
    id: 'manhattan', name: '曼哈顿', en: 'Manhattan',
    img: 'https://static.frankfurtlin.top/media/2026/10/fe936bf0/manhattan.jpg',
    tagline: '晚宴上的深红绅士',
    story: '1870 年代纽约曼哈顿俱乐部的一场宴会为英国首相丘吉尔的母亲而办，传说中的初代版本就诞生在那晚。威士忌与甜味美思的 2:1 比例，加上一滴苦精，是鸡尾酒王国里最体面的深红。',
    method: 'stir', glass: 'coupe',
    garnish: 'cherry', garnishName: '鸡尾酒樱桃',
    fx: { type: 'ripple', label: '樱桃入杯，红韵荡开' },
    abv: 30, difficulty: 2, color: '#9c4a2a',
    ingredients: [
      { name: '黑麦威士忌', en: 'Rye Whiskey', ml: 50, color: '#c06a30', shape: 'spirit', type: '基酒' },
      { name: '甜味美思', en: 'Sweet Vermouth', ml: 25, color: '#8f4b2a', shape: 'wine', type: '加强酒' },
      { name: '安高天娜苦精', en: 'Angostura Bitters', dash: 2, ml: 2, color: '#4a2410', shape: 'bitters', type: '苦精' }
    ]
  },
  {
    id: 'martini', name: '马天尼', en: 'Martini',
    img: 'https://static.frankfurtlin.top/media/2026/10/a41bbb27/martini.jpg',
    tagline: '清澈通透的极简美学',
    story: '詹姆斯·邦德说"Shaken, not stirred"，但真正的行家几乎都选搅拌：金酒与干味美思在冰上缓缓相拥，滤入冰镇过的马天尼杯，一颗橄榄或一片柠檬皮油。海明威说，做完一杯马天尼就该马上喝掉它。',
    method: 'stir', glass: 'martini',
    garnish: 'lemon-twist', garnishName: '柠檬皮卷（或橄榄）',
    fx: { type: 'twist', label: '柠檬皮油，一抹清香' },
    abv: 30, difficulty: 2, color: '#e9efdd',
    ingredients: [
      { name: '金酒', en: 'Gin', ml: 60, color: '#cfe3d8', shape: 'spirit', type: '基酒' },
      { name: '干味美思', en: 'Dry Vermouth', ml: 10, color: '#d8c9a8', shape: 'wine', type: '加强酒' }
    ]
  },
  {
    id: 'daiquiri', name: '代基里', en: 'Daiquiri',
    img: 'https://static.frankfurtlin.top/media/2026/10/6e95c4de/daiquiri.jpg',
    tagline: '朗姆、青柠与糖的三行诗',
    story: '古巴圣地亚哥附近的小镇代基里，19 世纪末一位美国工程师在甘蔗园里用朗姆酒、青柠和糖调出了它。海明威在哈瓦那 El Floridita 的吧台常客名单上， frozen daiquiri 永远排第一。三样材料，比例对了就是杰作。',
    method: 'shake', glass: 'coupe',
    garnish: 'lime-wheel', garnishName: '青柠片',
    fx: { type: 'frost', label: '杯身凝出一层白霜' },
    abv: 18, difficulty: 1, color: '#e2e8c4',
    ingredients: [
      { name: '白朗姆酒', en: 'White Rum', ml: 60, color: '#d9c08a', shape: 'spirit', type: '基酒' },
      { name: '青柠汁', en: 'Lime Juice', ml: 25, color: '#b9d977', shape: 'juice', type: '果汁' },
      { name: '糖浆', en: 'Sugar Syrup', ml: 15, color: '#e8c987', shape: 'syrup', type: '糖浆' }
    ]
  },
  {
    id: 'whisky-sour', name: '威士忌酸', en: 'Whisky Sour',
    img: 'https://static.frankfurtlin.top/media/2026/10/a308216a/whisky-sour.jpg',
    tagline: '酸甜之间的黄金比例',
    story: '酸类鸡尾酒（Sour）家族的代表作，1860 年代就有了记载。2 份酒、1 份柠檬汁、1 份糖浆是流传百年的骨架；加一点蛋清摇出绵密泡沫，就是波本酒馆里最治愈的一杯。',
    method: 'shake', glass: 'rocks',
    garnish: 'lemon-slice', garnishName: '柠檬片与樱桃',
    fx: { type: 'foam', label: '绵密泡沫缓缓浮现' },
    abv: 16, difficulty: 2, color: '#e0a54a',
    ingredients: [
      { name: '波本威士忌', en: 'Bourbon', ml: 45, color: '#c47a2e', shape: 'spirit', type: '基酒' },
      { name: '柠檬汁', en: 'Lemon Juice', ml: 25, color: '#e3d75e', shape: 'juice', type: '果汁' },
      { name: '糖浆', en: 'Sugar Syrup', ml: 15, color: '#e8c987', shape: 'syrup', type: '糖浆' }
    ]
  },
  {
    id: 'aperol-spritz', name: '阿佩罗气泡酒', en: 'Aperol Spritz',
    img: 'https://static.frankfurtlin.top/media/2026/10/083b77f4/aperol-spritz.jpg',
    tagline: '威尼托的橙色黄昏',
    story: 'Spritz 起源于 19 世纪奥匈帝国士兵往葡萄酒里兑苏打水的习惯，如今是意大利午后 Aperitivo 时间的标准画面：3 份普罗塞克、2 份阿佩罗、1 份苏打，橙色的微苦气泡，配一小碟橄榄刚刚好。',
    method: 'build', glass: 'wine', iceFirst: true, bubbles: true,
    garnish: 'orange-slice', garnishName: '橙片',
    fx: { type: 'burst', label: '橙色气泡欢腾上升' },
    abv: 8, difficulty: 1, color: '#f08c2e',
    ingredients: [
      { name: '阿佩罗', en: 'Aperol', ml: 60, color: '#e8641c', shape: 'liqueur', type: '利口酒' }
    ],
    tops: [
      { name: '普罗塞克', en: 'Prosecco', ml: 90, color: '#f2e6b3', shape: 'wine', type: '起泡酒' },
      { name: '苏打水', en: 'Soda Water', ml: 30, color: '#cfe8f0', shape: 'soda', type: '气泡' }
    ]
  },
  {
    id: 'long-island', name: '长岛冰茶', en: 'Long Island Iced Tea',
    img: 'https://static.frankfurtlin.top/media/2026/10/461f3f20/long-island.jpg',
    tagline: '温柔名字下的烈酒宇宙',
    story: '1970 年代纽约长岛橡树滩酒馆的发明。四种基酒加君度、柠檬与可乐，长得像冰茶，喝起来像整个酒柜。它大概是全世界"最名不副实"的鸡尾酒——第一口温柔，第三口开始怀疑人生。',
    method: 'build', glass: 'highball', iceFirst: true, stirInGlass: true,
    garnish: 'lemon-slice', garnishName: '柠檬角',
    fx: { type: 'settle', label: '可乐缓缓沉降上色' },
    abv: 22, difficulty: 3, color: '#8a4a1a',
    ingredients: [
      { name: '伏特加', en: 'Vodka', ml: 15, color: '#dfe6ee', shape: 'spirit', type: '基酒' },
      { name: '金酒', en: 'Gin', ml: 15, color: '#bcd9c8', shape: 'spirit', type: '基酒' },
      { name: '白朗姆酒', en: 'White Rum', ml: 15, color: '#d9c08a', shape: 'spirit', type: '基酒' },
      { name: '龙舌兰', en: 'Tequila', ml: 15, color: '#d9b36b', shape: 'spirit', type: '基酒' },
      { name: '君度橙酒', en: 'Cointreau', ml: 15, color: '#f0a84a', shape: 'liqueur', type: '利口酒' },
      { name: '柠檬汁', en: 'Lemon Juice', ml: 25, color: '#e3d75e', shape: 'juice', type: '果汁' },
      { name: '糖浆', en: 'Sugar Syrup', ml: 30, color: '#e8c987', shape: 'syrup', type: '糖浆' }
    ],
    tops: [
      { name: '可乐', en: 'Cola', ml: 45, color: '#3a1e0e', shape: 'soda', type: '软饮' }
    ]
  },
  {
    id: 'cosmopolitan', name: '大都会', en: 'Cosmopolitan',
    img: 'https://static.frankfurtlin.top/media/2026/10/4e94f181/cosmopolitan.jpg',
    tagline: '都会夜色的一抹胭脂',
    story: '1980 年代在迈阿密南海滩被调制成型，随后被《欲望都市》推上神坛。蔓越莓汁给足胭脂色，青柠守住酸度，橙皮油喷在表面——它是纽约夜晚的标准配色。',
    method: 'shake', glass: 'martini',
    garnish: 'orange-peel', garnishName: '橙皮卷',
    fx: { type: 'swirl', label: '胭脂色酒液回旋' },
    abv: 20, difficulty: 2, color: '#e05a6e',
    ingredients: [
      { name: '柠檬伏特加', en: 'Citron Vodka', ml: 40, color: '#e6d4d8', shape: 'spirit', type: '基酒' },
      { name: '君度橙酒', en: 'Cointreau', ml: 15, color: '#f0a84a', shape: 'liqueur', type: '利口酒' },
      { name: '青柠汁', en: 'Lime Juice', ml: 15, color: '#b9d977', shape: 'juice', type: '果汁' },
      { name: '蔓越莓汁', en: 'Cranberry Juice', ml: 30, color: '#d13a52', shape: 'juice', type: '果汁' }
    ]
  },
  {
    id: 'espresso-martini', name: '意式浓缩马天尼', en: 'Espresso Martini',
    img: 'https://static.frankfurtlin.top/media/2026/10/f281cfee/espresso-martini.jpg',
    tagline: '咖啡与伏特加的清醒梦境',
    story: '1980 年代伦敦 Soho 区的调酒师 Dick Bradsell 应一位超模要求："做一杯能把我喝醒的酒"。伏特加、咖啡利口酒与新鲜浓缩的顶上摇出一层细密 crema，三颗咖啡豆摆成叶子的样子——叫醒你，也放倒你。',
    method: 'shake', glass: 'coupe',
    garnish: 'coffee-beans', garnishName: '三颗咖啡豆',
    fx: { type: 'crema', label: '金色咖啡油脂浮现' },
    abv: 18, difficulty: 2, color: '#4a2e1c',
    ingredients: [
      { name: '伏特加', en: 'Vodka', ml: 45, color: '#dfe6ee', shape: 'spirit', type: '基酒' },
      { name: '咖啡利口酒', en: 'Coffee Liqueur', ml: 25, color: '#2f1a10', shape: 'liqueur', type: '利口酒' },
      { name: '意式浓缩', en: 'Espresso', ml: 30, color: '#3b2415', shape: 'pitcher', type: '咖啡' }
    ]
  }
];

/* ---------- 小工具 ---------- */
function fmtAmount(ing) {
  if (ing.dash) return ing.dash + ' 滴';
  const oz = (ing.ml / 30).toFixed(1).replace(/\.0$/, '');
  return ing.ml + ' ml / ' + oz + ' oz';
}
function abvDots(abv) {
  return abv <= 8 ? 1 : abv <= 14 ? 2 : abv <= 20 ? 3 : abv <= 26 ? 4 : 5;
}
