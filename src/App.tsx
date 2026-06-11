import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Vote, 
  Plus, 
  Search, 
  Sparkles, 
  Trash2, 
  RefreshCw, 
  Flame, 
  TrendingUp, 
  Check, 
  Smile, 
  X, 
  AlertCircle,
  HelpCircle,
  Calendar,
  Layers,
  ArrowRight,
  Lock,
  Unlock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

interface PollItem {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  votes: string[]; // List of anonymous visitor IDs
}

interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

// Deterministic visitor identity generator from visitorId hash
function getVisitorProfile(id: string) {
  const adjectives = [
    "Thỏ Ngọc", "Mèo Mun", "Cáo Nhỏ", "Sóc Nâu", "Nai Vàng", 
    "Heo Hồng", "Cún Bông", "Sư Tử", "Hạ Mã", "Nhím Nhỏ", 
    "Cá Heo", "Thợ Săn", "Sao Biển", "Chim Ưng", "Khỉ Con"
  ];
  const nouns = [
    "Tinh Nghịch", "Dễ Thương", "Chăm Chỉ", "Vui Vẻ", "Thông Thái", 
    "Năng Động", "Hiền Lành", "Mơ Mộng", "Khám Phá", "Tự Tin", 
    "Sáng Tạo", "Bí Ẩn", "Kiên Cường", "Hài Hước", "Nhiệt Huyết"
  ];
  const colors = [
    "from-pink-400 to-rose-500",
    "from-purple-400 to-indigo-500",
    "from-blue-400 to-cyan-500",
    "from-emerald-400 to-teal-500",
    "from-amber-400 to-orange-500",
    "from-violet-400 to-fuchsia-500",
    "from-red-400 to-pink-600",
    "from-sky-400 to-indigo-600"
  ];

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const adj = adjectives[hash % adjectives.length];
  const noun = nouns[(hash >> 2) % nouns.length];
  const color = colors[(hash >> 4) % colors.length];

  return {
    nickname: `${adj} ${noun}`,
    gradient: color,
    avatarChar: adj.charAt(0)
  };
}

export default function App() {
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [visitorId, setVisitorId] = useState<string>("");
  const [newPollContent, setNewPollContent] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "voted">("popular");
  const [passcode, setPasscode] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const isAdmin = useMemo(() => passcode.trim() === "123456", [passcode]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Create or load persistent anonymous visitor ID
  useEffect(() => {
    let storedId = localStorage.getItem("poll_visitor_id");
    if (!storedId) {
      storedId = "visitor_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem("poll_visitor_id", storedId);
    }
    setVisitorId(storedId);
  }, []);

  const visitorProfile = useMemo(() => {
    if (!visitorId) return { nickname: "Người dùng ẩn danh", gradient: "from-gray-400 to-gray-500", avatarChar: "A" };
    return getVisitorProfile(visitorId);
  }, [visitorId]);

  // Push elegant in-app toast alerts
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Fetch all polls from Express server
  const fetchPolls = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsSyncing(true);
    
    try {
      const res = await fetch("/api/polls");
      if (!res.ok) throw new Error("Cổng dữ liệu bị gián đoạn");
      const data = await res.json();
      setPolls(data);
      setErrorStatus(null);
    } catch (err: any) {
      console.error(err);
      setErrorStatus("Không thể đồng bộ dữ liệu từ server. Vui lòng kiểm tra lại kết nối.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // Run initial fetch and set up real-time listener from Firestore
  useEffect(() => {
    setIsLoading(true);
    const pollsCol = collection(db, "polls");

    // Live subscription to Firestore database
    const unsubscribe = onSnapshot(pollsCol, (snapshot) => {
      const pollsList: PollItem[] = [];
      snapshot.forEach((doc) => {
        pollsList.push(doc.data() as PollItem);
      });
      setPolls(pollsList);
      setErrorStatus(null);
      setIsLoading(false);
      setIsSyncing(false);
    }, (error) => {
      console.error("Firestore real-time sync error:", error);
      setErrorStatus("Không thể lắng nghe dữ liệu trực tiếp. Vui lòng thử đồng bộ lại.");
      setIsLoading(false);
      setIsSyncing(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle adding a new content choice
  const handleAddPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPollContent.trim()) {
      showToast("Vui lòng điền nội dung đề xuất của bạn", "error");
      return;
    }
    if (newPollContent.length > 120) {
      showToast("Nội dung tối đa 120 ký tự", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newPollContent.trim(),
          visitorId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Thao tác gửi thất bại");
      }

      setPolls(data);
      setNewPollContent("");
      showToast("Đã thêm lựa chọn của bạn vào danh mục thăm dò!", "success");
    } catch (err: any) {
      showToast(err.message || "Không thể kết nối đến máy chủ", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Voting/Unvoting triggers
  const handleVoteToggle = async (pollId: string) => {
    // Optimistic Update for incredibly snappy, lag-free feel!
    const originalPolls = [...polls];
    const isCurrentlyVoted = polls.find(p => p.id === pollId)?.votes.includes(visitorId);
    
    setPolls(prevPolls => 
      prevPolls.map(p => {
        if (p.id === pollId) {
          const updatedVotes = isCurrentlyVoted
            ? p.votes.filter(id => id !== visitorId)
            : [...p.votes, visitorId];
          return { ...p, votes: updatedVotes };
        }
        return p;
      })
    );

    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể đồng bộ lượt bình chọn");
      }
      setPolls(data);
      
      if (isCurrentlyVoted) {
        showToast("Đã rút lại lượt bình chọn của bạn thành công", "info");
      } else {
        showToast("Bình chọn thành công! Cảm ơn ý kiến của bạn", "success");
      }
    } catch (err: any) {
      // Rollback on failure
      setPolls(originalPolls);
      showToast(err.message || "Lỗi máy chủ khi bình chọn", "error");
    }
  };

  // Handle deleting a poll option
  const handleDeletePoll = async (pollId: string) => {
    try {
      const res = await fetch(`/api/polls/${pollId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, passcode })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể xóa chủ đề này");
      }

      setPolls(data);
      showToast("Đã xóa chủ đề thành công khỏi bảng bình chọn", "success");
    } catch (err: any) {
      showToast(err.message || "Xóa thất bại", "error");
    }
  };

  // Statistics calculation helpers
  const totalVotes = useMemo(() => {
    return polls.reduce((acc, current) => acc + current.votes.length, 0);
  }, [polls]);

  const maxVotes = useMemo(() => {
    if (polls.length === 0) return 0;
    return Math.max(...polls.map(p => p.votes.length));
  }, [polls]);

  const leadingTopic = useMemo(() => {
    if (polls.length === 0) return null;
    // Find the item with maximum votes
    return [...polls].sort((a, b) => b.votes.length - a.votes.length)[0];
  }, [polls]);

  // Compute filtered & sorted lists
  const processedPolls = useMemo(() => {
    let result = [...polls];

    // Search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter(p => p.content.toLowerCase().includes(query));
    }

    // Sort strategy
    if (sortBy === "popular") {
      // Sort by votes count, then on ties by creation time newest
      result.sort((a, b) => {
        if (b.votes.length !== a.votes.length) {
          return b.votes.length - a.votes.length;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } else if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "voted") {
      // Filter only current user's voted topics
      result = result.filter(p => p.votes.includes(visitorId));
      result.sort((a, b) => b.votes.length - a.votes.length);
    }

    return result;
  }, [polls, searchTerm, sortBy, visitorId]);

  return (
    <div id="polling_app_root" className="min-h-screen bg-[#0f172a] text-slate-100 font-sans antialiased pb-20 selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Frosted Glass ambient background glowing bubbles */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/25 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/15 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-500/15 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-12 relative z-10">
        
        {/* TOP STATUS BAR & IDENTITY PANEL */}
        <div id="top_identity_panel" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${visitorProfile.gradient} flex items-center justify-center font-bold text-white text-base shadow-lg shadow-indigo-500/10`}>
              {visitorProfile.avatarChar}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Bí danh của bạn (Tự động tạo)</div>
              <div className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
                <Smile className="w-4 h-4 text-teal-400" />
                {visitorProfile.nickname}
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10">
            {/* Secure authorization input without exposing secrets or hints */}
            <div className={`relative flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border rounded-xl transition-all duration-300 ${
              isAdmin 
                ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300" 
                : "border-white/10 text-slate-400 focus-within:border-white/20 focus-within:bg-white/10"
            }`}>
              {isAdmin ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <input 
                id="id_passcode_input"
                type="password"
                maxLength={10}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Nhập mã..."
                title="Mã bảo mật"
                className="w-32 bg-transparent border-none outline-none text-[11px] text-slate-100 placeholder:text-slate-500 focus:ring-0 p-0"
              />
            </div>

            <div className="text-xs flex items-center gap-2 text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${errorStatus ? "bg-rose-400" : "bg-teal-400"}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${errorStatus ? "bg-rose-500" : "bg-teal-500"}`}></span>
              </span>
              {isSyncing ? "Đang đồng bộ..." : "Hoạt động trực tuyến"}
            </div>
            
            <button 
              id="id_refresh_button"
              onClick={() => fetchPolls(false)} 
              disabled={isLoading}
              title="Đồng bộ thủ công"
              className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all duration-200 border border-white/10 bg-white/5 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing || isLoading ? "animate-spin text-white" : ""}`} />
            </button>
          </div>
        </div>

        {/* HERO SECTION */}
        <header id="app_hero_section" className="text-center mb-10 mt-4">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 text-indigo-300 rounded-full text-xs font-semibold mb-4 tracking-wider uppercase backdrop-blur-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            Thống kê bình chọn cộng đồng
          </motion.div>
          
          <h1 id="app_title" className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-3">
            Bình Chọn Chủ Đề
          </h1>
          <p id="app_subtitle" className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Nơi tập hợp ý kiến đám đông trực tiếp không cần đăng kí. Đề xuất ý tưởng, chọn nhiều phương án cùng lúc & bỏ chọn dễ dàng.
          </p>
        </header>

        {/* LEADING TOPIC SPOTLIGHT (HOTTEST WITH FROSTED STYLE) */}
        {leadingTopic && leadingTopic.votes.length > 0 && (
          <motion.div 
            id="leading_topic_spotlight"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-6 rounded-[32px] bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl ring-1 ring-white/10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Flame className="w-28 h-28 text-white" />
            </div>
            
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
              Chủ đề nổi bật nhất hôm nay
            </div>
            
            <div className="text-xl font-bold text-white mb-3 line-clamp-2 pr-12">
              "{leadingTopic.content}"
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-300 font-medium bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
                <TrendingUp className="w-3.5 h-3.5" />
                Dẫn đầu với {leadingTopic.votes.length} lượt bình chọn
              </span>
              <span>•</span>
              <span className="text-slate-400">Tỉ lệ áp đảo: {totalVotes > 0 ? Math.round((leadingTopic.votes.length / totalVotes) * 100) : 0}% tổng cộng</span>
            </div>
          </motion.div>
        )}

        {/* STATS COUNT GRID (FROSTED THEMED) */}
        <div id="stats_row_grid" className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl text-center shadow-lg">
            <div className="text-xs text-slate-400 mb-1 font-medium">Tổng chủ đề</div>
            <div className="text-2xl font-black text-white">{polls.length}</div>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl text-center shadow-lg">
            <div className="text-xs text-slate-400 mb-1 font-medium">Tổng lượt bình chọn</div>
            <div className="text-2xl font-black text-white/90">{totalVotes}</div>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl text-center shadow-lg">
            <div className="text-xs text-slate-400 mb-1 font-medium">Hiệu năng bình chọn</div>
            <div className="text-2xl font-black text-teal-400">
              {polls.length > 0 ? (totalVotes / polls.length).toFixed(1) : 0} <span className="text-xs text-slate-500 font-normal">v/t</span>
            </div>
          </div>
        </div>

        {/* INPUT PROPOSAL FORM (FROSTED GLASS INPUT CARD) */}
        <section id="proposal_input_card" className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 sm:p-6 rounded-[32px] shadow-2xl mb-8 relative z-25">
          <h2 className="text-md sm:text-lg font-bold text-slate-200 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Đề xuất chủ đề mới của bạn
          </h2>
          
          <form onSubmit={handleAddPoll} className="space-y-4">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-2 rounded-[24px] flex shadow-2xl items-center">
              <input 
                id="id_new_poll_input"
                type="text" 
                value={newPollContent}
                onChange={(e) => setNewPollContent(e.target.value)}
                maxLength={120}
                placeholder="Nhập ý tưởng mới của bạn tại đây..."
                disabled={isSubmitting}
                className="flex-1 bg-transparent border-none outline-none px-4 text-white placeholder:text-slate-500 text-sm sm:text-base focus:ring-0 min-w-0"
              />
              <span className="hidden sm:inline text-xs text-slate-500 font-mono px-2 shrink-0">
                {newPollContent.length}/120
              </span>
              <button 
                id="id_submit_new_poll"
                type="submit"
                disabled={isSubmitting || !newPollContent.trim()}
                className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:pointer-events-none active:scale-95 shadow-lg"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <Plus className="w-4 h-4 text-slate-900" />
                )}
                <span className="hidden sm:inline">Thêm lựa chọn</span>
              </button>
            </div>
            <div className="flex justify-between items-center px-2">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                Chủ đề mới tạo sẽ tự động được bạn bình chọn sẵn 1 vote.
              </p>
              <span className="sm:hidden text-xs text-slate-500 font-mono">
                {newPollContent.length}/120
              </span>
            </div>
          </form>
        </section>

        {/* FILTER & OPTION SORT WRAPPER (FROSTED CHIPS & SEARCH) */}
        <section id="results_filter_panel" className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl mb-6 shadow-md">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search input */}
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                id="id_search_topics_input"
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm chủ đề..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 placeholder-slate-500 transition-all"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort strategies */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-start md:justify-end overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <span className="text-xs text-slate-400 font-medium shrink-0">Sắp xếp:</span>
              
              <button
                id="id_sort_popular"
                onClick={() => setSortBy("popular")}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  sortBy === "popular" 
                    ? "bg-white text-slate-900 border-transparent shadow" 
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                Nổi bật ({polls.length})
              </button>

              <button
                id="id_sort_newest"
                onClick={() => setSortBy("newest")}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  sortBy === "newest" 
                    ? "bg-white text-slate-900 border-transparent shadow" 
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                Mới nhất
              </button>

              <button
                id="id_sort_voted"
                onClick={() => setSortBy("voted")}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1 ${
                  sortBy === "voted" 
                    ? "bg-white text-slate-900 border-transparent shadow" 
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                Đã chọn ({polls.filter(p => p.votes.includes(visitorId)).length})
              </button>
            </div>
          </div>
        </section>

        {/* LOADING & ERROR FALLBACKS */}
        {errorStatus && (
          <div id="error_alert_banner" className="mb-6 p-4 bg-rose-950/40 border border-rose-900/40 rounded-2xl flex items-start gap-3 backdrop-blur-md">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-rose-200 font-bold">Lỗi đồng bộ</p>
              <p className="text-rose-400 mt-0.5">{errorStatus}</p>
              <button 
                onClick={() => fetchPolls(false)}
                className="mt-2 text-xs font-semibold underline text-rose-300 hover:text-rose-100 block"
              >
                Nhấn vào đây để thử tải lại dữ liệu
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div id="loading_screen_spinner" className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-white mb-3" />
            <p className="text-sm">Đang tải và cập nhật bảng bình chọn...</p>
          </div>
        ) : (
          <div id="polls_listings_container" className="space-y-4">
            
            {/* Empty state check */}
            {processedPolls.length === 0 ? (
              <div id="empty_listings_card" className="text-center py-16 bg-white/5 border border-dashed border-white/10 rounded-3xl backdrop-blur-md">
                <Vote className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
                <h3 className="text-md font-bold text-slate-300">Không tìm thấy chủ đề nào</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 px-4">
                  {searchTerm 
                    ? "Không có chủ đề nào khớp với từ khóa tìm kiếm của bạn. Hãy thử từ khóa khác!" 
                    : sortBy === "voted" 
                      ? "Bạn chưa thực hiện lượt bình chọn nào cả. Hãy sang danh mục 'Nổi bật' để bỏ phiếu nhé!" 
                      : "Danh sách hiện tại đang trống. Hãy nhập chủ đề đầu tiên để bắt đầu!"}
                </p>
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm("")}
                    className="mt-4 text-xs font-semibold text-white hover:underline"
                  >
                    Xóa bộ lọc tìm kiếm
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {processedPolls.map((poll, index) => {
                  const hasVoted = poll.votes.includes(visitorId);
                  const isCreator = poll.createdBy === visitorId;
                  const votePercentage = totalVotes > 0 ? Math.round((poll.votes.length / totalVotes) * 100) : 0;
                  
                  // Progress width representation relative to max possible votes
                  const relativePercentage = maxVotes > 0 ? Math.round((poll.votes.length / maxVotes) * 100) : 0;
                  
                  const creatorInfo = getVisitorProfile(poll.createdBy);

                  // Distinguish voted cards with deeper frosted glow
                  return (
                    <motion.div
                      key={poll.id}
                      layoutId={`poll_card_${poll.id}`}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      className={`giao-dien-binh-chon relative rounded-[32px] p-5 sm:p-6 transition-all duration-300 shadow-2xl ${
                        hasVoted 
                          ? "bg-white/10 backdrop-blur-xl border border-white/25 ring-1 ring-white/10" 
                          : "bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 w-full">
                          {/* Option Owner's Anonymous Avatar */}
                          <div 
                            title={`Tạo bởi: ${poll.createdBy === "system" ? "Hệ thống" : creatorInfo.nickname}`}
                            className={`w-9 h-9 rounded-full bg-gradient-to-tr ${poll.createdBy === "system" ? "from-indigo-500 to-purple-600" : creatorInfo.gradient} flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-md border-2 border-slate-900`}
                          >
                            {poll.createdBy === "system" ? "⚙️" : creatorInfo.avatarChar}
                          </div>

                          <div className="space-y-1 w-full">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Bản thảo #{poll.id}</span>
                              {poll.createdBy === "system" && (
                                <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded border border-indigo-500/30">Mặc định</span>
                              )}
                              {isCreator && (
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] rounded border border-emerald-500/30">Của bạn</span>
                              )}
                            </div>
                            <h3 className="text-slate-100 font-semibold text-base sm:text-lg leading-snug break-words pr-2">
                              {poll.content}
                            </h3>
                          </div>
                        </div>

                        {/* Actions wrapper (Vote & Delete) */}
                        <div className="flex items-center gap-2 shrink-0 z-20">
                          {/* Delete capability if visitor is owner or admin */}
                          {(isCreator || isAdmin) && (
                            <button
                              id={`delete_poll_${poll.id}`}
                              onClick={() => {
                                if (deleteConfirmId === poll.id) {
                                  handleDeletePoll(poll.id);
                                  setDeleteConfirmId(null);
                                } else {
                                  setDeleteConfirmId(poll.id);
                                  // Auto reset after 3 seconds if not clicked again
                                  setTimeout(() => {
                                    setDeleteConfirmId(prev => prev === poll.id ? null : prev);
                                  }, 3000);
                                }
                              }}
                              title={deleteConfirmId === poll.id ? "Nhấn thêm lần nữa để xác nhận xóa" : "Xóa lựa chọn"}
                              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold ${
                                deleteConfirmId === poll.id
                                  ? "bg-rose-600 text-white px-3 py-1.5 animate-pulse"
                                  : isAdmin 
                                    ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
                                    : "text-slate-400 hover:text-rose-400 hover:bg-white/5"
                              }`}
                            >
                              {deleteConfirmId === poll.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>Xác nhận xóa</span>
                                </>
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Vote Action Button */}
                          <button
                            id={`vote_button_${poll.id}`}
                            onClick={() => handleVoteToggle(poll.id)}
                            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow ${
                              hasVoted
                                ? "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20 group"
                                : "bg-white/5 border border-white/20 text-white hover:bg-white/10"
                            }`}
                          >
                            {hasVoted ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[3] group-hover:hidden" />
                                <span className="group-hover:hidden">Bỏ bình chọn</span>
                                <span className="hidden group-hover:inline">Rút phiếu bầu</span>
                              </>
                            ) : (
                              <>
                                <Vote className="w-3.5 h-3.5" />
                                <span>Bình chọn ngay</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Vote statistics & horizontal progress view */}
                      <div className="mt-5 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <div className="text-slate-300 font-medium flex items-center gap-1">
                            <span className="text-xl font-black text-white/95 mr-1">{poll.votes.length}</span> lượt bình chọn
                            {poll.votes.length > 0 && (
                              <span className="text-[10px] bg-white/5 text-slate-300 border border-white/10 px-2 py-0.5 rounded-full ml-1.5">
                                Chiếm tỉ trọng: {votePercentage}%
                              </span>
                            )}
                          </div>
                          
                          <div className="text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {new Date(poll.createdAt).toLocaleDateString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </div>
                        </div>

                        {/* Progress cylinder bar - Frosted Accent style */}
                        <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/10 p-[2px]">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${relativePercentage}%` }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              hasVoted 
                                ? "bg-gradient-to-r from-emerald-400 to-indigo-500 shadow-md shadow-emerald-500/10" 
                                : "bg-gradient-to-r from-indigo-500 to-violet-500 shadow-md shadow-indigo-500/10"
                            }`}
                          />
                        </div>
                        
                        {/* Interactive list of anonymous icons currently voting for this list option */}
                        {poll.votes.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-3">
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {poll.votes.slice(0, 6).map((vId, idx) => {
                                const prof = getVisitorProfile(vId);
                                return (
                                  <div 
                                    key={vId} 
                                    title={vId === visitorId ? "Bạn" : prof.nickname}
                                    className={`w-5 h-5 rounded-full border border-slate-900 bg-gradient-to-tr ${prof.gradient} flex items-center justify-center text-[8px] font-mono font-bold text-white shadow-md`}
                                  >
                                    {vId === visitorId ? "B" : prof.avatarChar}
                                  </div>
                                );
                              })}
                            </div>
                            
                            {poll.votes.length > 6 && (
                              <span className="text-[10px] text-slate-400 font-semibold pl-1">
                                +{poll.votes.length - 6} người khác
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        )}

        {/* RECENT ACTIONS FOOTER TABS */}
        <footer id="app_credits_footer" className="mt-16 pt-6 border-t border-white/10 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} • App Bình Chọn Hoạt Động Trực Tuyến 24/7</p>
          <p className="mt-1">Thời gian thực • Không yêu cầu Đăng nhập • Bảo mật Bí danh Tuyệt đối</p>
        </footer>

        {/* TOAST SYSTEM CENTER */}
        <div id="toast_notifications_container" className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          <AnimatePresence>
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl pointer-events-auto flex items-start gap-2.5 ${
                  toast.type === "success" 
                    ? "bg-white/10 border-emerald-500/20 text-emerald-400" 
                    : toast.type === "error"
                      ? "bg-white/10 border-rose-500/20 text-rose-400"
                      : "bg-white/10 border-indigo-500/20 text-indigo-400"
                }`}
              >
                {toast.type === "success" ? (
                  <Check className="w-5 h-5 shrink-0 text-emerald-400" />
                ) : toast.type === "error" ? (
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                ) : (
                  <HelpCircle className="w-5 h-5 shrink-0 text-indigo-400" />
                )}
                
                <div className="flex-1 text-xs sm:text-sm font-medium text-slate-200">
                  {toast.message}
                </div>
                
                <button 
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
