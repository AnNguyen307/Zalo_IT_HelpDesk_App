import type { Priority,TicketStatus } from "../types";
export const statusLabel:Record<TicketStatus,string>={open:"Chờ kỹ thuật viên",waiting_user:"Chờ bạn phản hồi",in_progress:"Đang xử lý",resolved:"Đã xử lý",closed:"Đã đóng"};
export const priorityLabel:Record<Priority,string>={low:"Thấp",normal:"Bình thường",high:"Cao",urgent:"Khẩn cấp"};
export const categoryLabel:Record<string,string>={network:"Mạng",printer:"Máy in",windows:"Windows",office:"Office",account:"Tài khoản",software:"Phần mềm",hardware:"Phần cứng",other:"Khác"};
export const categoryIcon:Record<string,"network"|"printer"|"windows"|"office"|"account"|"software"|"hardware"|"other">={network:"network",printer:"printer",windows:"windows",office:"office",account:"account",software:"software",hardware:"hardware",other:"other"};
export function formatDate(v?:string|null,time=false){if(!v)return"—";const d=new Date(v);return time?d.toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("vi-VN")}
export function relativeTime(v?:string|null){if(!v)return"—";const n=Date.now()-new Date(v).getTime(),m=60000,h=60*m,d=24*h;if(n<m)return"Vừa xong";if(n<h)return`${Math.floor(n/m)} phút trước`;if(n<d)return`${Math.floor(n/h)} giờ trước`;if(n<7*d)return`${Math.floor(n/d)} ngày trước`;return formatDate(v)}
