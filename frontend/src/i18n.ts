import { createContext, useContext } from "react";

export type Lang = "vi" | "zh";

type Dict = Record<string, string>;

const vi: Dict = {
  app_title: "Phiên dịch gọi điện",
  app_sub: "Trung ↔ Việt · Gemini 3.5 Live Translate",
  login: "Đăng nhập",
  register: "Đăng ký",
  username: "Tên đăng nhập",
  password: "Mật khẩu",
  your_language: "Ngôn ngữ của bạn:",
  vietnamese: "Tiếng Việt",
  chinese: "Tiếng Trung",
  processing: "Đang xử lý...",
  loading: "Đang tải...",

  owner: "CHỦ",
  admin: "Quản trị",
  logout: "Đăng xuất",
  connecting_server: "Đang kết nối máy chủ... (gói free có thể chờ ~50 giây lần đầu)",

  translate_mode: "Chế độ dịch",
  domain: "Lĩnh vực:",
  glossary_ph: "Thuật ngữ riêng (tùy chọn), vd: máy ép => 压机, bảo trì => 维护",
  hint_general: "Dịch nhanh, giữ ngữ điệu tốt nhất.",
  hint_domain: "Dùng model hiểu ngữ cảnh chuyên ngành (có thể trễ hơn chút).",

  call_others: "Gọi cho người khác",
  search_ph: "Tìm theo tên...",
  search_btn: "Tìm",
  online: "Đang online",
  nobody_online: "Chưa có ai khác online.",
  call: "Gọi",
  offline: "Offline",
  solo_mode: "🎤 Dùng chế độ dịch 1 máy",

  dom_general: "Thường (mặc định, nhanh nhất)",
  dom_factory: "Công xưởng / nhà máy",
  dom_medical: "Y tế",
  dom_technical: "Kỹ thuật",
  dom_legal: "Pháp lý",
  dom_business: "Thương mại",

  calling: "Đang gọi...",
  incoming: "Cuộc gọi đến",
  in_call: "Đang trong cuộc gọi",
  cancel: "Hủy",
  reject: "Từ chối",
  accept: "Nghe",
  hangup: "Cúp máy",
  subtitle_ph: "Bản dịch lời {name} sẽ hiện ở đây...",

  admin_title: "Quản trị tài khoản",
  back_home: "← Về trang chính",
  st_pending: "Chờ duyệt",
  st_approved: "Đã duyệt",
  st_disabled: "Đã khóa",
  approve: "Duyệt",
  lock: "Khóa",
  delete: "Xóa",
  confirm_delete: 'Xóa tài khoản "{name}"?',

  solo_title: "Phiên dịch Trung ↔ Việt",
  solo_sub: "Dịch 1 máy · Gemini 3.5 Live Translate",
  solo_start: "Bấm micro để bắt đầu.",
  solo_listening: "Đang nghe... (nói tiếng Trung hoặc tiếng Việt)",
  solo_src: "Bản gốc",
  solo_dst: "Bản dịch",
  busy_unavailable: "Người này không online.",
  busy_busy: "Người này đang bận.",
};

const zh: Dict = {
  app_title: "电话翻译",
  app_sub: "中 ↔ 越 · Gemini 3.5 实时翻译",
  login: "登录",
  register: "注册",
  username: "用户名",
  password: "密码",
  your_language: "您的语言：",
  vietnamese: "越南语",
  chinese: "中文",
  processing: "处理中...",
  loading: "加载中...",

  owner: "管理员",
  admin: "管理",
  logout: "退出",
  connecting_server: "正在连接服务器...（免费套餐首次可能等待约50秒）",

  translate_mode: "翻译模式",
  domain: "领域：",
  glossary_ph: "专业术语（可选），例：压机 => máy ép，维护 => bảo trì",
  hint_general: "快速翻译，语气最自然。",
  hint_domain: "使用理解专业领域的模型（可能稍有延迟）。",

  call_others: "呼叫他人",
  search_ph: "按名字搜索...",
  search_btn: "搜索",
  online: "在线",
  nobody_online: "暂无其他人在线。",
  call: "呼叫",
  offline: "离线",
  solo_mode: "🎤 使用单机翻译模式",

  dom_general: "通用（默认，最快）",
  dom_factory: "工厂 / 制造",
  dom_medical: "医疗",
  dom_technical: "技术",
  dom_legal: "法律",
  dom_business: "商务",

  calling: "正在呼叫...",
  incoming: "来电",
  in_call: "通话中",
  cancel: "取消",
  reject: "拒绝",
  accept: "接听",
  hangup: "挂断",
  subtitle_ph: "{name} 的翻译将显示在这里...",

  admin_title: "账号管理",
  back_home: "← 返回主页",
  st_pending: "待审核",
  st_approved: "已通过",
  st_disabled: "已锁定",
  approve: "通过",
  lock: "锁定",
  delete: "删除",
  confirm_delete: '删除账号 "{name}"？',

  solo_title: "中 ↔ 越 翻译",
  solo_sub: "单机翻译 · Gemini 3.5",
  solo_start: "点击麦克风开始。",
  solo_listening: "正在聆听...（请说中文或越南语）",
  solo_src: "原文",
  solo_dst: "译文",
  busy_unavailable: "该用户不在线。",
  busy_busy: "该用户正忙。",
};

const dicts: Record<Lang, Dict> = { vi, zh };

export type TFunc = (key: string, vars?: Record<string, string>) => string;

export function makeT(lang: Lang): TFunc {
  return (key, vars) => {
    let s = dicts[lang][key] ?? dicts.vi[key] ?? key;
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    return s;
  };
}

export const LangContext = createContext<{ lang: Lang; t: TFunc; setLang: (l: Lang) => void }>({
  lang: "vi",
  t: makeT("vi"),
  setLang: () => {},
});

export const useI18n = () => useContext(LangContext);
