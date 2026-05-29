/**
 * 中国地区真实数据集，用于替代 fakerJS zh_CN 的合成数据。
 * 城市/省份/街道前缀都带 zh + en（拼音）两种形式，方便切语言时翻译展示。
 * 每个城市附市政府位置的粗略经纬度，用于"在地图中打开"按钮。
 */

export const CN_FAMILY_NAMES = [
  '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
  '彭', '曾', '萧', '田', '董', '袁', '潘', '蔡', '蒋', '余',
  '于', '杜', '叶', '程', '魏', '苏', '吕', '丁', '任', '沈',
  '姚', '卢', '姜', '崔', '钟', '谭', '陆', '汪', '范', '金',
  '石', '廖', '贾', '夏', '韦', '付', '方', '白', '邹', '孟',
  '熊', '秦', '邱', '江', '尹', '薛', '阎', '段', '雷', '侯',
  '龙', '史', '陶', '黎', '贺', '顾', '毛', '郝', '龚', '邵',
];

const CN_GIVEN_MALE = [
  '伟', '强', '磊', '军', '勇', '超', '明', '刚', '平', '辉',
  '健', '亮', '波', '宇', '涛', '鹏', '华', '峰', '文', '斌',
  '龙', '彬', '阳', '博', '林', '凯', '浩', '轩', '楠', '皓',
  '杰', '俊', '铭', '星', '鑫', '辰', '霖', '嘉', '志远', '子轩',
  '浩然', '宇航', '梓豪', '俊杰', '思源', '志强', '建国', '振华',
];

const CN_GIVEN_FEMALE = [
  '芳', '娟', '敏', '静', '丽', '艳', '玲', '娜', '英', '红',
  '雪', '雨', '馨', '雅', '薇', '彤', '欣', '婷', '琪', '瑶',
  '蓉', '欢', '梦', '慧', '洁', '菲', '佳', '莹', '心', '颖',
  '思雨', '欣怡', '雨欣', '梓涵', '诗涵', '雨萱', '依依', '语桐',
  '芷若', '若曦', '佳琪', '雨晴', '可馨', '惠玲', '美丽',
];

export type CnCity = {
  province: string;
  provinceEn: string;
  city: string;
  cityEn: string;
  postcode: string;
  areaCode: string;
  lat: number;
  lng: number;
};

export const CN_CITIES: CnCity[] = [
  { province: '北京市', provinceEn: 'Beijing', city: '北京市', cityEn: 'Beijing', postcode: '100000', areaCode: '010', lat: 39.9042, lng: 116.4074 },
  { province: '上海市', provinceEn: 'Shanghai', city: '上海市', cityEn: 'Shanghai', postcode: '200000', areaCode: '021', lat: 31.2304, lng: 121.4737 },
  { province: '天津市', provinceEn: 'Tianjin', city: '天津市', cityEn: 'Tianjin', postcode: '300000', areaCode: '022', lat: 39.3434, lng: 117.3616 },
  { province: '重庆市', provinceEn: 'Chongqing', city: '重庆市', cityEn: 'Chongqing', postcode: '400000', areaCode: '023', lat: 29.5630, lng: 106.5516 },

  { province: '广东省', provinceEn: 'Guangdong', city: '广州市', cityEn: 'Guangzhou', postcode: '510000', areaCode: '020', lat: 23.1291, lng: 113.2644 },
  { province: '广东省', provinceEn: 'Guangdong', city: '深圳市', cityEn: 'Shenzhen', postcode: '518000', areaCode: '0755', lat: 22.5431, lng: 114.0579 },
  { province: '广东省', provinceEn: 'Guangdong', city: '东莞市', cityEn: 'Dongguan', postcode: '523000', areaCode: '0769', lat: 23.0207, lng: 113.7517 },
  { province: '广东省', provinceEn: 'Guangdong', city: '佛山市', cityEn: 'Foshan', postcode: '528000', areaCode: '0757', lat: 23.0218, lng: 113.1219 },
  { province: '广东省', provinceEn: 'Guangdong', city: '珠海市', cityEn: 'Zhuhai', postcode: '519000', areaCode: '0756', lat: 22.2710, lng: 113.5767 },
  { province: '广东省', provinceEn: 'Guangdong', city: '中山市', cityEn: 'Zhongshan', postcode: '528400', areaCode: '0760', lat: 22.5159, lng: 113.3927 },
  { province: '广东省', provinceEn: 'Guangdong', city: '汕头市', cityEn: 'Shantou', postcode: '515000', areaCode: '0754', lat: 23.3540, lng: 116.6820 },
  { province: '广东省', provinceEn: 'Guangdong', city: '惠州市', cityEn: 'Huizhou', postcode: '516000', areaCode: '0752', lat: 23.1117, lng: 114.4163 },

  { province: '福建省', provinceEn: 'Fujian', city: '福州市', cityEn: 'Fuzhou', postcode: '350000', areaCode: '0591', lat: 26.0745, lng: 119.2965 },
  { province: '福建省', provinceEn: 'Fujian', city: '厦门市', cityEn: 'Xiamen', postcode: '361000', areaCode: '0592', lat: 24.4798, lng: 118.0894 },
  { province: '福建省', provinceEn: 'Fujian', city: '泉州市', cityEn: 'Quanzhou', postcode: '362000', areaCode: '0595', lat: 24.8740, lng: 118.6757 },
  { province: '福建省', provinceEn: 'Fujian', city: '漳州市', cityEn: 'Zhangzhou', postcode: '363000', areaCode: '0596', lat: 24.5130, lng: 117.6471 },
  { province: '福建省', provinceEn: 'Fujian', city: '莆田市', cityEn: 'Putian', postcode: '351100', areaCode: '0594', lat: 25.4313, lng: 119.0078 },
  { province: '福建省', provinceEn: 'Fujian', city: '宁德市', cityEn: 'Ningde', postcode: '352100', areaCode: '0593', lat: 26.6657, lng: 119.5479 },

  { province: '浙江省', provinceEn: 'Zhejiang', city: '杭州市', cityEn: 'Hangzhou', postcode: '310000', areaCode: '0571', lat: 30.2741, lng: 120.1551 },
  { province: '浙江省', provinceEn: 'Zhejiang', city: '宁波市', cityEn: 'Ningbo', postcode: '315000', areaCode: '0574', lat: 29.8683, lng: 121.5440 },
  { province: '浙江省', provinceEn: 'Zhejiang', city: '温州市', cityEn: 'Wenzhou', postcode: '325000', areaCode: '0577', lat: 27.9939, lng: 120.6993 },
  { province: '浙江省', provinceEn: 'Zhejiang', city: '绍兴市', cityEn: 'Shaoxing', postcode: '312000', areaCode: '0575', lat: 30.0023, lng: 120.5810 },
  { province: '浙江省', provinceEn: 'Zhejiang', city: '嘉兴市', cityEn: 'Jiaxing', postcode: '314000', areaCode: '0573', lat: 30.7522, lng: 120.7506 },
  { province: '浙江省', provinceEn: 'Zhejiang', city: '金华市', cityEn: 'Jinhua', postcode: '321000', areaCode: '0579', lat: 29.0784, lng: 119.6473 },

  { province: '江苏省', provinceEn: 'Jiangsu', city: '南京市', cityEn: 'Nanjing', postcode: '210000', areaCode: '025', lat: 32.0603, lng: 118.7969 },
  { province: '江苏省', provinceEn: 'Jiangsu', city: '苏州市', cityEn: 'Suzhou', postcode: '215000', areaCode: '0512', lat: 31.2989, lng: 120.5853 },
  { province: '江苏省', provinceEn: 'Jiangsu', city: '无锡市', cityEn: 'Wuxi', postcode: '214000', areaCode: '0510', lat: 31.4912, lng: 120.3119 },
  { province: '江苏省', provinceEn: 'Jiangsu', city: '常州市', cityEn: 'Changzhou', postcode: '213000', areaCode: '0519', lat: 31.7728, lng: 119.9540 },
  { province: '江苏省', provinceEn: 'Jiangsu', city: '南通市', cityEn: 'Nantong', postcode: '226000', areaCode: '0513', lat: 31.9802, lng: 120.8943 },
  { province: '江苏省', provinceEn: 'Jiangsu', city: '徐州市', cityEn: 'Xuzhou', postcode: '221000', areaCode: '0516', lat: 34.2618, lng: 117.1845 },

  { province: '山东省', provinceEn: 'Shandong', city: '济南市', cityEn: 'Jinan', postcode: '250000', areaCode: '0531', lat: 36.6512, lng: 117.1201 },
  { province: '山东省', provinceEn: 'Shandong', city: '青岛市', cityEn: 'Qingdao', postcode: '266000', areaCode: '0532', lat: 36.0671, lng: 120.3826 },
  { province: '山东省', provinceEn: 'Shandong', city: '烟台市', cityEn: 'Yantai', postcode: '264000', areaCode: '0535', lat: 37.4638, lng: 121.4478 },
  { province: '山东省', provinceEn: 'Shandong', city: '潍坊市', cityEn: 'Weifang', postcode: '261000', areaCode: '0536', lat: 36.7069, lng: 119.1619 },

  { province: '四川省', provinceEn: 'Sichuan', city: '成都市', cityEn: 'Chengdu', postcode: '610000', areaCode: '028', lat: 30.5728, lng: 104.0668 },
  { province: '四川省', provinceEn: 'Sichuan', city: '绵阳市', cityEn: 'Mianyang', postcode: '621000', areaCode: '0816', lat: 31.4675, lng: 104.6796 },
  { province: '四川省', provinceEn: 'Sichuan', city: '宜宾市', cityEn: 'Yibin', postcode: '644000', areaCode: '0831', lat: 28.7660, lng: 104.6306 },

  { province: '湖北省', provinceEn: 'Hubei', city: '武汉市', cityEn: 'Wuhan', postcode: '430000', areaCode: '027', lat: 30.5928, lng: 114.3055 },
  { province: '湖北省', provinceEn: 'Hubei', city: '宜昌市', cityEn: 'Yichang', postcode: '443000', areaCode: '0717', lat: 30.6919, lng: 111.2864 },
  { province: '湖北省', provinceEn: 'Hubei', city: '襄阳市', cityEn: 'Xiangyang', postcode: '441000', areaCode: '0710', lat: 32.0091, lng: 112.1226 },

  { province: '湖南省', provinceEn: 'Hunan', city: '长沙市', cityEn: 'Changsha', postcode: '410000', areaCode: '0731', lat: 28.2282, lng: 112.9388 },
  { province: '湖南省', provinceEn: 'Hunan', city: '株洲市', cityEn: 'Zhuzhou', postcode: '412000', areaCode: '0731', lat: 27.8275, lng: 113.1346 },
  { province: '湖南省', provinceEn: 'Hunan', city: '岳阳市', cityEn: 'Yueyang', postcode: '414000', areaCode: '0730', lat: 29.3576, lng: 113.1287 },

  { province: '河南省', provinceEn: 'Henan', city: '郑州市', cityEn: 'Zhengzhou', postcode: '450000', areaCode: '0371', lat: 34.7466, lng: 113.6253 },
  { province: '河南省', provinceEn: 'Henan', city: '洛阳市', cityEn: 'Luoyang', postcode: '471000', areaCode: '0379', lat: 34.6196, lng: 112.4540 },
  { province: '河南省', provinceEn: 'Henan', city: '南阳市', cityEn: 'Nanyang', postcode: '473000', areaCode: '0377', lat: 32.9908, lng: 112.5283 },

  { province: '河北省', provinceEn: 'Hebei', city: '石家庄市', cityEn: 'Shijiazhuang', postcode: '050000', areaCode: '0311', lat: 38.0428, lng: 114.5149 },
  { province: '河北省', provinceEn: 'Hebei', city: '唐山市', cityEn: 'Tangshan', postcode: '063000', areaCode: '0315', lat: 39.6306, lng: 118.1804 },
  { province: '河北省', provinceEn: 'Hebei', city: '保定市', cityEn: 'Baoding', postcode: '071000', areaCode: '0312', lat: 38.8740, lng: 115.4646 },

  { province: '辽宁省', provinceEn: 'Liaoning', city: '沈阳市', cityEn: 'Shenyang', postcode: '110000', areaCode: '024', lat: 41.8057, lng: 123.4315 },
  { province: '辽宁省', provinceEn: 'Liaoning', city: '大连市', cityEn: 'Dalian', postcode: '116000', areaCode: '0411', lat: 38.9140, lng: 121.6147 },

  { province: '吉林省', provinceEn: 'Jilin', city: '长春市', cityEn: 'Changchun', postcode: '130000', areaCode: '0431', lat: 43.8171, lng: 125.3235 },
  { province: '黑龙江省', provinceEn: 'Heilongjiang', city: '哈尔滨市', cityEn: 'Harbin', postcode: '150000', areaCode: '0451', lat: 45.8038, lng: 126.5350 },
  { province: '安徽省', provinceEn: 'Anhui', city: '合肥市', cityEn: 'Hefei', postcode: '230000', areaCode: '0551', lat: 31.8206, lng: 117.2272 },
  { province: '安徽省', provinceEn: 'Anhui', city: '芜湖市', cityEn: 'Wuhu', postcode: '241000', areaCode: '0553', lat: 31.3527, lng: 118.4332 },
  { province: '江西省', provinceEn: 'Jiangxi', city: '南昌市', cityEn: 'Nanchang', postcode: '330000', areaCode: '0791', lat: 28.6829, lng: 115.8579 },
  { province: '山西省', provinceEn: 'Shanxi', city: '太原市', cityEn: 'Taiyuan', postcode: '030000', areaCode: '0351', lat: 37.8706, lng: 112.5489 },
  { province: '陕西省', provinceEn: 'Shaanxi', city: '西安市', cityEn: "Xi'an", postcode: '710000', areaCode: '029', lat: 34.3416, lng: 108.9398 },
  { province: '云南省', provinceEn: 'Yunnan', city: '昆明市', cityEn: 'Kunming', postcode: '650000', areaCode: '0871', lat: 25.0389, lng: 102.7183 },
  { province: '贵州省', provinceEn: 'Guizhou', city: '贵阳市', cityEn: 'Guiyang', postcode: '550000', areaCode: '0851', lat: 26.6470, lng: 106.6302 },
  { province: '甘肃省', provinceEn: 'Gansu', city: '兰州市', cityEn: 'Lanzhou', postcode: '730000', areaCode: '0931', lat: 36.0611, lng: 103.8343 },
  { province: '广西壮族自治区', provinceEn: 'Guangxi', city: '南宁市', cityEn: 'Nanning', postcode: '530000', areaCode: '0771', lat: 22.8170, lng: 108.3669 },
  { province: '广西壮族自治区', provinceEn: 'Guangxi', city: '桂林市', cityEn: 'Guilin', postcode: '541000', areaCode: '0773', lat: 25.2736, lng: 110.2902 },
  { province: '海南省', provinceEn: 'Hainan', city: '海口市', cityEn: 'Haikou', postcode: '570000', areaCode: '0898', lat: 20.0440, lng: 110.1995 },
  { province: '海南省', provinceEn: 'Hainan', city: '三亚市', cityEn: 'Sanya', postcode: '572000', areaCode: '0898', lat: 18.2528, lng: 109.5119 },
  { province: '内蒙古自治区', provinceEn: 'Inner Mongolia', city: '呼和浩特市', cityEn: 'Hohhot', postcode: '010000', areaCode: '0471', lat: 40.8429, lng: 111.7497 },
  { province: '新疆维吾尔自治区', provinceEn: 'Xinjiang', city: '乌鲁木齐市', cityEn: 'Urumqi', postcode: '830000', areaCode: '0991', lat: 43.8256, lng: 87.6168 },
  { province: '西藏自治区', provinceEn: 'Tibet', city: '拉萨市', cityEn: 'Lhasa', postcode: '850000', areaCode: '0891', lat: 29.6504, lng: 91.1409 },
  { province: '宁夏回族自治区', provinceEn: 'Ningxia', city: '银川市', cityEn: 'Yinchuan', postcode: '750000', areaCode: '0951', lat: 38.4872, lng: 106.2309 },
  { province: '青海省', provinceEn: 'Qinghai', city: '西宁市', cityEn: 'Xining', postcode: '810000', areaCode: '0971', lat: 36.6171, lng: 101.7782 },
];

type StreetPrefix = { zh: string; en: string };

const CN_STREET_PREFIXES: StreetPrefix[] = [
  { zh: '人民', en: 'Renmin' }, { zh: '解放', en: 'Jiefang' }, { zh: '中山', en: 'Zhongshan' },
  { zh: '建国', en: 'Jianguo' }, { zh: '和平', en: 'Heping' }, { zh: '新华', en: 'Xinhua' },
  { zh: '文化', en: 'Wenhua' }, { zh: '体育', en: 'Tiyu' }, { zh: '长江', en: 'Changjiang' },
  { zh: '黄河', en: 'Huanghe' }, { zh: '珠江', en: 'Zhujiang' }, { zh: '东风', en: 'Dongfeng' },
  { zh: '西湖', en: 'Xihu' }, { zh: '南山', en: 'Nanshan' }, { zh: '北山', en: 'Beishan' },
  { zh: '青年', en: 'Qingnian' }, { zh: '向阳', en: 'Xiangyang' }, { zh: '光明', en: 'Guangming' },
  { zh: '永和', en: 'Yonghe' }, { zh: '长乐', en: 'Changle' }, { zh: '福民', en: 'Fumin' },
  { zh: '大同', en: 'Datong' }, { zh: '富强', en: 'Fuqiang' }, { zh: '民主', en: 'Minzhu' },
  { zh: '希望', en: 'Xiwang' }, { zh: '春秋', en: 'Chunqiu' }, { zh: '朝阳', en: 'Chaoyang' },
  { zh: '夕阳', en: 'Xiyang' }, { zh: '团结', en: 'Tuanjie' }, { zh: '友谊', en: 'Youyi' },
  { zh: '繁华', en: 'Fanhua' }, { zh: '复兴', en: 'Fuxing' }, { zh: '兴业', en: 'Xingye' },
  { zh: '工业', en: 'Gongye' }, { zh: '科技', en: 'Keji' }, { zh: '环城', en: 'Huancheng' },
  { zh: '北环', en: 'Beihuan' }, { zh: '南环', en: 'Nanhuan' }, { zh: '东环', en: 'Donghuan' },
  { zh: '西环', en: 'Xihuan' }, { zh: '滨江', en: 'Binjiang' }, { zh: '滨海', en: 'Binhai' },
  { zh: '湖滨', en: 'Hubin' }, { zh: '河滨', en: 'Hebin' }, { zh: '机场', en: 'Jichang' },
  { zh: '车站', en: 'Chezhan' }, { zh: '学府', en: 'Xuefu' }, { zh: '园林', en: 'Yuanlin' },
  { zh: '花园', en: 'Huayuan' }, { zh: '锦绣', en: 'Jinxiu' },
];

const CN_STREET_SUFFIXES: Array<{ zh: string; en: string }> = [
  { zh: '路', en: 'Road' },
  { zh: '街', en: 'Street' },
  { zh: '大道', en: 'Avenue' },
  { zh: '巷', en: 'Lane' },
  { zh: '弄', en: 'Alley' },
];

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number, rand: () => number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function genCnFullName(rand: () => number, sex: 'male' | 'female') {
  const family = pick(CN_FAMILY_NAMES, rand);
  const given = pick(sex === 'male' ? CN_GIVEN_MALE : CN_GIVEN_FEMALE, rand);
  return {
    firstName: given,
    lastName: family,
    fullName: family + given,
  };
}

/**
 * 返回中国地址的双语版本（zh / en） + 经纬度。
 */
export function genCnAddress(rand: () => number) {
  const c = pick(CN_CITIES, rand);
  const postcode = c.postcode.slice(0, 4) + String(randInt(0, 99, rand)).padStart(2, '0');
  const prefix = pick(CN_STREET_PREFIXES, rand);
  const suffix = pick(CN_STREET_SUFFIXES, rand);
  const num = randInt(1, 999, rand);
  return {
    zh: {
      streetAddress: `${prefix.zh}${suffix.zh}${num}号`,
      city: c.city,
      state: c.province,
    },
    en: {
      streetAddress: `No.${num} ${prefix.en} ${suffix.en}`,
      city: c.cityEn,
      state: c.provinceEn,
    },
    zipCode: postcode,
    areaCode: c.areaCode,
    lat: c.lat,
    lng: c.lng,
  };
}

export function genCnMobile(rand: () => number) {
  const prefix = '1' + pick(['3', '4', '5', '6', '7', '8', '9'], rand);
  let rest = '';
  for (let i = 0; i < 9; i++) rest += randInt(0, 9, rand);
  return prefix + rest;
}
